"""Validate an Səth XLSX template and upsert its products into the catalogue."""

import argparse
import json
import math
import re
import sys
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "products.json"
HEADERS = (
    "id kateqoriya ad_az ad_ru ad_en en_sm uzunluq_sm qalinliq_mm seth reng istifade "
    "material_az qutuda_m2 sekil_fayli tesvir_az tesvir_ru tesvir_en"
).split()
LANGUAGES = ("az", "ru", "en")
CATEGORY_IDS = {"doseme", "divar", "metlax", "mozaika"}
SURFACE_IDS = {"matt", "parlaq", "satin", "relyef"}
COLOR_IDS = {"ag", "bej", "boz", "qara", "yasil", "mavi", "terrakota", "coxrengli"}
USE_IDS = {"doseme", "divar", "hamam", "metbex", "col"}
MATERIALS = {
    "Porselen qranit": ("Керамогранит", "Porcelain stoneware"),
    "Keramika": ("Керамика", "Ceramic"),
    "Sement": ("Цемент", "Cement"),
    "Şüşə": ("Стекло", "Glass"),
    "Təbii mərmər": ("Натуральный мрамор", "Natural marble"),
}
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
NUMBER = re.compile(r"[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?", re.ASCII)
CELL_REF = re.compile(r"([A-Z]+)[1-9]\d*", re.ASCII)
EXCEL_ESCAPE = re.compile(r"_x([0-9a-f]{4})_", re.IGNORECASE)
IMAGE_PREFIX = "img/tiles/"


def excel_text(element):
    """Read inline or shared string runs, ignoring phonetic annotations."""
    runs = []
    for child in element:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "t":
            runs.append(child.text or "")
        elif tag == "r":
            runs.append(child.findtext("{*}t") or "")
    text = EXCEL_ESCAPE.sub(lambda match: chr(int(match[1], 16)), "".join(runs))
    return text.encode("utf-16-le", errors="surrogatepass").decode("utf-16-le")


def cell_value(cell, shared_strings):
    cell_type = cell.get("t")
    if cell_type == "inlineStr":
        inline = cell.find("{*}is")
        return excel_text(inline) if inline is not None else ""
    value = cell.findtext("{*}v") or ""
    if value and cell_type == "s":
        if not re.fullmatch(r"[0-9]+", value) or int(value) >= len(shared_strings):
            raise ValueError("Invalid XLSX shared string reference.")
        return shared_strings[int(value)]
    return value


def read_rows(path):
    """Read the template's first worksheet and preserve physical Excel row numbers."""
    with ZipFile(path) as archive:
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        try:
            shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        except KeyError:
            shared = None
        shared_strings = [] if shared is None else [excel_text(item) for item in shared.findall("{*}si")]

    header = None
    rows = []
    line = 0
    for row in sheet.findall("{*}sheetData/{*}row"):
        line = int(row.get("r") or line + 1)
        cells = {}
        column = -1
        for cell in row.findall("{*}c"):
            ref = CELL_REF.fullmatch(cell.get("r", ""))
            column += 1
            if ref:
                position = 0
                for letter in ref[1]:
                    position = position * 26 + ord(letter) - ord("A") + 1
                column = position - 1
            if column >= 16384:
                raise ValueError("Invalid XLSX column index.")
            cells[column] = cell_value(cell, shared_strings)
        if not any(cells.values()):
            continue
        if header is None:
            header = [cells.get(index, "") for index in range(max(cells) + 1)]
        else:
            rows.append((line, {key: cells.get(index, "") for index, key in enumerate(header)}))
    return header, rows


def valid_image_name(name):
    stem, _, extension = name.rpartition(".")
    return (
        bool(stem)
        and (stem[0].isalnum() or stem[0] == "_")
        and all(character.isalnum() or character in "_. -" for character in stem)
        and extension.lower() in {"webp", "png", "jpg", "jpeg", "avif"}
    )


def rows_to_products(header, rows):
    """Convert valid rows and return validation errors as (row, column, code) triples."""
    if header != HEADERS:
        return [], [(1, "header", "invalid_headers")]

    products = []
    errors = []
    seen = set()
    for line, row in rows:
        error_count = len(errors)

        def fail(field, code):
            errors.append((line, field, code))

        def required(field):
            value = row[field].strip()
            if not value:
                fail(field, "required")
            return value

        def choice(field, allowed, code):
            value = required(field)
            if value and value not in allowed:
                fail(field, code)
            return value

        def choices(field, allowed, code):
            parts = (part.strip() for part in row[field].split(";"))
            values = list(dict.fromkeys(part for part in parts if part))
            if not values:
                fail(field, "required")
            elif not allowed.issuperset(values):
                fail(field, code)
            return values

        def number(field):
            value = required(field)
            result = float(value.replace(",", ".")) if NUMBER.fullmatch(value) else math.nan
            if value and (not math.isfinite(result) or result <= 0):
                fail(field, "invalid_number")
            return result

        def localized(prefix):
            return {lang: required(f"{prefix}_{lang}") for lang in LANGUAGES}

        product_id = required("id")
        if SLUG.fullmatch(product_id):
            if product_id in seen:
                fail("id", "duplicate_id")
            seen.add(product_id)
        elif product_id:
            fail("id", "invalid_slug")

        category = choice("kateqoriya", CATEGORY_IDS, "invalid_category")
        name = localized("ad")
        width = number("en_sm")
        height = number("uzunluq_sm")
        thickness = number("qalinliq_mm")
        surface = choice("seth", SURFACE_IDS, "invalid_surface")
        colors = choices("reng", COLOR_IDS, "invalid_color")
        uses = choices("istifade", USE_IDS, "invalid_use")
        az = required("material_az")
        ru, en = MATERIALS.get(az, (az, az))
        coverage = number("qutuda_m2")
        quantity = 0
        if all(math.isfinite(value) and value > 0 for value in (width, height, coverage)):
            tile_area = width * height / 10_000
            ratio = coverage / tile_area if tile_area else math.inf
            quantity = round(ratio) if math.isfinite(ratio) else 0
            if not 1 <= quantity <= 2**53 - 1 or abs(ratio - quantity) > 1e-8:
                fail("qutuda_m2", "inconsistent_coverage")
        image_cell = row["sekil_fayli"].strip()
        filename = image_cell.removeprefix(IMAGE_PREFIX)
        if image_cell and not valid_image_name(filename):
            fail("sekil_fayli", "invalid_image")
        image = IMAGE_PREFIX + (filename or f"{product_id}.webp")
        description = localized("tesvir")

        if len(errors) == error_count:
            products.append({
                "id": product_id, "category": category, "name": name,
                "size": {"w": width, "h": height, "unit": "cm"}, "thickness_mm": thickness,
                "surface": surface, "colors": colors, "use": uses, "material": {"az": az, "ru": ru, "en": en},
                "pieces_per_box": quantity, "m2_per_box": coverage, "image": image,
                "description": description, "featured": False,
            })
    return products, errors


def merge_products(catalogue, imported):
    """Upsert by ID and preserve existing order and metadata outside the template."""
    products = {product["id"]: product for product in catalogue["products"]}
    updates = 0
    for incoming in imported:
        product_id = incoming["id"]
        if product_id in products:
            updates += 1
            original = products[product_id]
            updated = {**original, **incoming, "featured": original.get("featured", False)}
            if original.get("material", {}).get("az") == incoming["material"]["az"]:
                updated["material"] = original["material"]
            products[product_id] = updated
        else:
            products[product_id] = incoming
    return {**catalogue, "products": list(products.values())}, updates


def write_catalogue(path, catalogue):
    """Replace the JSON atomically after the complete import has passed validation."""
    temp_dir = ROOT / "_dev"
    temp_dir.mkdir(exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=temp_dir, delete=False) as stream:
            temporary_path = Path(stream.name)
            json.dump(catalogue, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
        temporary_path.replace(path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main(argv=None, *, catalog_path=CATALOG_PATH):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Path to the .xlsx workbook")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without changing the catalogue")
    args = parser.parse_args(argv)
    try:
        products, errors = rows_to_products(*read_rows(args.workbook))
        if errors:
            for row, field, code in errors:
                print(f"Row {row} [{field}]: {code}", file=sys.stderr)
            print(f"Import failed with {len(errors)} validation error(s).", file=sys.stderr)
            return 1
        if not products:
            print("Import failed: no product rows.", file=sys.stderr)
            return 1
        catalogue = json.loads(catalog_path.read_text(encoding="utf-8"))
        merged, updates = merge_products(catalogue, products)
        if not args.dry_run:
            write_catalogue(catalog_path, merged)
    except (OSError, BadZipFile, ET.ParseError, KeyError, ValueError, OverflowError, RuntimeError) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        return 1

    action = "Dry run" if args.dry_run else "Import complete"
    print(f"{action}: {len(products)} valid row(s), {len(products) - updates} new, {updates} updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
