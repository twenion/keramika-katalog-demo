const columns = (
  "id kateqoriya ad_az ad_ru ad_en en_sm uzunluq_sm qalinliq_mm seth reng istifade " +
  "material_az qutuda_m2 sekil_fayli tesvir_az tesvir_ru tesvir_en"
).split(" ");
const categoryIds = new Set(["doseme", "divar", "metlax", "mozaika"]);
const surfaceIds = new Set(["matt", "parlaq", "satin", "relyef"]);
const colorIds = new Set(["ag", "bej", "boz", "qara", "yasil", "mavi", "terrakota", "coxrengli"]);
const useIds = new Set(["doseme", "divar", "hamam", "metbex", "col"]);
const materials = new Map([
  ["Porselen qranit", ["Керамогранит", "Porcelain stoneware"]],
  ["Keramika", ["Керамика", "Ceramic"]],
  ["Sement", ["Цемент", "Cement"]],
  ["Şüşə", ["Стекло", "Glass"]],
  ["Təbii mərmər", ["Натуральный мрамор", "Natural marble"]],
]);
const sheetMetadata = new WeakMap();
const decoder = new TextDecoder("utf-8");

function zipDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const earliest = Math.max(0, bytes.length - 22 - 0xffff);
  let end = bytes.length - 22;
  for (; end >= earliest; end--) {
    if (view.getUint32(end, true) === 0x06054b50 &&
        view.getUint16(end + 20, true) === bytes.length - end - 22) break;
  }
  if (end < earliest) throw new Error("Invalid XLSX ZIP directory.");

  const count = view.getUint16(end + 10, true);
  const start = view.getUint32(end + 16, true);
  const limit = start + view.getUint32(end + 12, true);
  if (limit > end || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) {
    throw new Error("Unsupported XLSX ZIP directory.");
  }
  const entries = new Map();
  let position = start;
  for (let entry = 0; entry < count; entry++) {
    if (position + 46 > limit || view.getUint32(position, true) !== 0x02014b50) {
      throw new Error("Invalid XLSX ZIP entry.");
    }
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const next = position + 46 + nameLength + extraLength + commentLength;
    if (next > limit) throw new Error("Truncated XLSX ZIP entry.");
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    entries.set(name, {
      flags: view.getUint16(position + 8, true),
      method: view.getUint16(position + 10, true),
      compressedSize: view.getUint32(position + 20, true),
      size: view.getUint32(position + 24, true),
      offset: view.getUint32(position + 42, true),
    });
    position = next;
  }
  return { entries, view, start };
}

async function inflateRaw(bytes) {
  let stream;
  try {
    stream = new DecompressionStream("deflate-raw");
  } catch (error) {
    if (typeof process === "undefined" || !process.versions?.node) throw error;
    // Older Node versions support DecompressionStream but omit raw DEFLATE.
    const { inflateRawSync } = await import("node:zlib");
    return inflateRawSync(bytes);
  }
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

async function readEntry(bytes, { entries, view, start }, name) {
  const entry = entries.get(name);
  if (!entry) return "";
  const { offset, flags, method, compressedSize, size } = entry;
  if (flags & 1) throw new Error("Encrypted XLSX entries are unsupported.");
  if (offset + 30 > start || view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error("Invalid XLSX ZIP local header.");
  }
  const dataStart = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
  if (dataStart + compressedSize > start) throw new Error("Truncated XLSX ZIP data.");
  if (method !== 0 && method !== 8) throw new Error("Unsupported XLSX ZIP compression.");
  const raw = bytes.subarray(dataStart, dataStart + compressedSize);
  const content = method === 0 ? raw : await inflateRaw(raw);
  if (content.length !== size) throw new Error("Invalid XLSX ZIP entry size.");
  return decoder.decode(content);
}

function elements(xml, name) {
  const tag = "(?:[\\w.-]+:)?" + name;
  const pattern = "<" + tag + "(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</" + tag + "\\s*>)";
  return xml.matchAll(new RegExp(pattern, "g"));
}

function attribute(attributes, name) {
  const match = attributes.match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*([\"'])(.*?)\\1"));
  return match?.[2];
}

function xmlText(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity) => {
    if (Object.hasOwn(named, entity)) return named[entity];
    const value = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return String.fromCodePoint(value);
  });
}

function stringText(xml) {
  const phonetics = /<(?:[\w.-]+:)?rPh(?=[\s>])[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?rPh\s*>/g;
  const text = Array.from(elements(xml.replace(phonetics, ""), "t"), (match) => xmlText(match[2] ?? ""));
  return text.join("").replace(/_x([0-9a-f]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function columnIndex(letters) {
  return [...letters].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellValue(attrs, contents, sharedStrings) {
  const type = attribute(attrs, "t");
  if (type === "inlineStr") return stringText(contents);
  const match = elements(contents, "v").next().value;
  if (!match?.[2]) return "";
  const value = xmlText(match[2]);
  if (type === "s") {
    const shared = /^\d+$/.test(value) ? sharedStrings[Number(value)] : undefined;
    if (shared === undefined) throw new Error("Invalid XLSX shared string reference.");
    return shared;
  }
  if (!type || type === "n") return Number(value);
  return value;
}

/** Read the first worksheet as header-keyed rows from a stored or DEFLATE-compressed XLSX. */
export async function readXlsx(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  const directory = zipDirectory(bytes);
  const [sheet, shared] = await Promise.all([
    readEntry(bytes, directory, "xl/worksheets/sheet1.xml"),
    readEntry(bytes, directory, "xl/sharedStrings.xml"),
  ]);
  if (!sheet) throw new Error("XLSX worksheet sheet1.xml is missing.");
  const [, , sheetData] = elements(sheet, "sheetData").next().value ?? [];
  const sharedStrings = Array.from(elements(shared, "si"), (match) => stringText(match[2] ?? ""));
  const rows = [];
  const lineNumbers = [];
  let header;
  let lineNumber = 0;
  for (const [, attrs, contents] of elements(sheetData ?? "", "row")) {
    lineNumber = Number(attribute(attrs, "r")) || lineNumber + 1;
    const cells = [];
    let column = -1;
    for (const [, cellAttrs, cellContents] of elements(contents ?? "", "c")) {
      const ref = attribute(cellAttrs, "r")?.match(/^([A-Z]+)[1-9]\d*$/);
      column = ref ? columnIndex(ref[1]) : column + 1;
      if (column >= 16384) throw new Error("Invalid XLSX column index.");
      cells[column] = cellValue(cellAttrs, cellContents ?? "", sharedStrings);
    }
    if (!cells.some((value) => value !== "")) continue;
    if (!header) {
      header = Array.from(cells, (value) => String(value ?? ""));
      if (header.some((value) => !value) || new Set(header).size !== header.length) {
        throw new Error("XLSX headers must be non-empty and unique.");
      }
      continue;
    }
    rows.push(Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""])));
    lineNumbers.push(lineNumber);
  }
  sheetMetadata.set(rows, { header: header ?? [], lineNumbers });
  return rows;
}

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const positiveNumber = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/;
const imageName = /^[\p{L}\p{N}_][\p{L}\p{N}_. -]*\.(?:webp|png|jpe?g|avif)$/iu;

/** Convert template rows to catalogue products and report errors by Excel row and column. */
export function rowsToProducts(rows) {
  const products = [];
  const errors = [];
  const seen = new Set();
  const sheet = sheetMetadata.get(rows);
  if (sheet && (sheet.header.length !== columns.length ||
      columns.some((column, index) => sheet.header[index] !== column))) {
    return { products, errors: [{ row: 1, field: "header", code: "invalid_headers" }] };
  }

  for (const [index, row] of rows.entries()) {
    const errorCount = errors.length;
    const rowNumber = sheet?.lineNumbers[index] ?? index + 2;
    const fail = (field, code) => errors.push({ row: rowNumber, field, code });
    const text = (field) => String(row?.[field] ?? "").trim();
    const required = (field) => {
      const value = text(field);
      if (!value) fail(field, "required");
      return value;
    };
    const choice = (field, ids, code) => {
      const value = required(field);
      if (value && !ids.has(value)) fail(field, code);
      return value;
    };
    const choices = (field, ids, code) => {
      const values = [...new Set(text(field).split(";").map((id) => id.trim()).filter(Boolean))];
      if (!values.length) fail(field, "required");
      else if (values.some((id) => !ids.has(id))) fail(field, code);
      return values;
    };
    const number = (field) => {
      const value = required(field);
      const result = positiveNumber.test(value) ? Number(value.replace(",", ".")) : NaN;
      if (value && (!Number.isFinite(result) || result <= 0)) fail(field, "invalid_number");
      return result;
    };
    const localized = (prefix) => ({
      az: required(prefix + "_az"), ru: required(prefix + "_ru"), en: required(prefix + "_en"),
    });

    const id = required("id");
    if (id && !slug.test(id)) fail("id", "invalid_slug");
    else if (id && seen.has(id)) fail("id", "duplicate_id");
    if (slug.test(id)) seen.add(id);
    const category = choice("kateqoriya", categoryIds, "invalid_category");
    const name = localized("ad");
    const w = number("en_sm");
    const h = number("uzunluq_sm");
    const thickness_mm = number("qalinliq_mm");
    const surface = choice("seth", surfaceIds, "invalid_surface");
    const colors = choices("reng", colorIds, "invalid_color");
    const use = choices("istifade", useIds, "invalid_use");
    const az = required("material_az");
    const [ru, en] = materials.get(az) ?? [az, az];
    const m2_per_box = number("qutuda_m2");
    const ratio = m2_per_box / (w * h / 10_000);
    const pieces_per_box = Math.round(ratio);
    if ([w, h, m2_per_box].every((value) => Number.isFinite(value) && value > 0) &&
        (!Number.isSafeInteger(pieces_per_box) || pieces_per_box < 1 || Math.abs(ratio - pieces_per_box) > 1e-8)) {
      fail("qutuda_m2", "inconsistent_coverage");
    }
    const imagePrefix = "img/tiles/";
    const imageCell = text("sekil_fayli");
    const filename = imageCell.startsWith(imagePrefix) ? imageCell.slice(imagePrefix.length) : imageCell;
    if (imageCell && !imageName.test(filename)) fail("sekil_fayli", "invalid_image");
    const image = imagePrefix + (filename || id + ".webp");
    const description = localized("tesvir");
    if (errors.length === errorCount) {
      products.push({
        id, category, name, size: { w, h, unit: "cm" }, thickness_mm, surface, colors, use,
        material: { az, ru, en }, pieces_per_box, m2_per_box, image, description, featured: false,
      });
    }
  }
  return { products, errors };
}
