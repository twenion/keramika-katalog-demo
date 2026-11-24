import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from uuid import uuid4
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

from tools import import_excel


ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "data" / "numune.xlsx"
DEFLATED = ROOT / "tests" / "fixtures" / "shared-deflate.xlsx"
CATALOGUE = ROOT / "data" / "products.json"
SHEET = "xl/worksheets/sheet1.xml"


@contextlib.contextmanager
def test_directory():
    dev = ROOT / "_dev"
    dev.mkdir(exist_ok=True)
    directory = dev / f"excel-test-{uuid4().hex}"
    directory.mkdir()
    try:
        yield directory
    finally:
        for child in directory.iterdir():
            child.unlink()
        directory.rmdir()


def revise_workbook(source, target, changes):
    with ZipFile(source) as original, ZipFile(target, "w", compression=ZIP_DEFLATED) as updated:
        for name in original.namelist():
            raw = original.read(name)
            if name == SHEET:
                sheet = ET.fromstring(raw)
                for ref, value in changes.items():
                    cell = sheet.find(f".//{{*}}c[@r='{ref}']")
                    old_value = cell.find("{*}is/{*}t")
                    if old_value is None:
                        old_value = cell.find("{*}v")
                    old_value.text = value
                raw = ET.tostring(sheet, encoding="utf-8", xml_declaration=True)
            updated.writestr(name, raw)


class ImportExcelTests(unittest.TestCase):
    def test_template_is_an_excel_package_with_exact_headers_and_three_examples(self):
        required_parts = {
            "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/styles.xml",
            "xl/_rels/workbook.xml.rels", SHEET,
        }
        with ZipFile(SAMPLE) as archive:
            self.assertIsNone(archive.testzip())
            self.assertTrue(required_parts.issubset(archive.namelist()))
            for part in required_parts:
                ET.fromstring(archive.read(part))
        header, rows = import_excel.read_rows(SAMPLE)
        self.assertEqual(header, import_excel.HEADERS)
        self.assertEqual([line for line, _ in rows], [2, 3, 4])
        products, errors = import_excel.rows_to_products(header, rows)
        self.assertEqual(errors, [])
        self.assertEqual([p["pieces_per_box"] for p in products], [2, 44, 10])
        self.assertEqual(products[0]["name"]["az"], "Nümunə: Qobustan Boz")

    def test_deflated_shared_strings_match_inline_strings(self):
        header, rows = import_excel.read_rows(DEFLATED)
        self.assertEqual([line for line, _ in rows], [2, 5, 6])
        self.assertEqual(
            import_excel.rows_to_products(header, rows),
            import_excel.rows_to_products(*import_excel.read_rows(SAMPLE)),
        )

    def test_cli_dry_run_reports_three_new_products_and_leaves_data_unchanged(self):
        original = CATALOGUE.read_bytes()
        run = subprocess.run(
            [sys.executable, "-B", str(ROOT / "tools" / "import_excel.py"), str(SAMPLE), "--dry-run"],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("Dry run: 3 valid row(s), 3 new, 0 updated.", run.stdout)
        self.assertEqual(CATALOGUE.read_bytes(), original)

    def test_import_merges_by_id_and_preserves_catalogue_metadata(self):
        with test_directory() as path:
            copy = path / "products.json"
            original = json.loads(CATALOGUE.read_text(encoding="utf-8"))
            copy.write_text(json.dumps(original, ensure_ascii=False), encoding="utf-8")
            edited = path / "edited.xlsx"
            revise_workbook(SAMPLE, edited, {"A2": "qobustan-boz", "C2": "Qobustan Yenilənmiş"})
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(import_excel.main([str(edited)], catalog_path=copy), 0)
            self.assertIn("2 new, 1 updated", output.getvalue())
            result = json.loads(copy.read_text(encoding="utf-8"))
            self.assertEqual(result["categories"], original["categories"])
            self.assertEqual(result["facets"], original["facets"])
            self.assertEqual(result["version"], original["version"])
            self.assertEqual(len(result["products"]), 18)
            updated = result["products"][0]
            self.assertEqual(updated["id"], "qobustan-boz")
            self.assertEqual(updated["name"]["az"], "Qobustan Yenilənmiş")
            self.assertTrue(updated["featured"])
            self.assertEqual(result["products"][1:16], original["products"][1:16])
            self.assertFalse(result["products"][-1]["featured"])

    def test_validation_reports_row_errors_and_rejects_the_entire_import(self):
        with test_directory() as path:
            copy = path / "products.json"
            original = CATALOGUE.read_text(encoding="utf-8")
            copy.write_text(original, encoding="utf-8")
            edited = path / "invalid.xlsx"
            revise_workbook(SAMPLE, edited, {
                "A3": "numune-qobustan-boz", "J3": "purple", "M4": "0.95", "N4": "../escape.webp",
            })
            errors = io.StringIO()
            with contextlib.redirect_stderr(errors):
                self.assertEqual(import_excel.main([str(edited)], catalog_path=copy), 1)
            for error in (
                "Row 3 [id]: duplicate_id", "Row 3 [reng]: invalid_color",
                "Row 4 [qutuda_m2]: inconsistent_coverage", "Row 4 [sekil_fayli]: invalid_image",
            ):
                self.assertIn(error, errors.getvalue())
            self.assertEqual(copy.read_text(encoding="utf-8"), original)

    def test_cli_invalid_headers_fail_with_exit_code_one(self):
        with test_directory() as path:
            edited = path / "invalid-header.xlsx"
            revise_workbook(SAMPLE, edited, {"B1": "category"})
            run = subprocess.run(
                [sys.executable, "-B", str(ROOT / "tools" / "import_excel.py"), str(edited), "--dry-run"],
                cwd=ROOT, capture_output=True, text=True, check=False,
            )
            self.assertEqual(run.returncode, 1)
            self.assertIn("Row 1 [header]: invalid_headers", run.stderr)


if __name__ == "__main__":
    unittest.main()
