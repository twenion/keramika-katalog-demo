import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { readXlsx, rowsToProducts } from "../js/core/xlsx.js";
import { createStore } from "../js/core/store.js";

const sample = new URL("../data/numune.xlsx", import.meta.url);
const deflated = new URL("./fixtures/shared-deflate.xlsx", import.meta.url);
const headers = (
  "id kateqoriya ad_az ad_ru ad_en en_sm uzunluq_sm qalinliq_mm seth reng istifade " +
  "material_az qutuda_m2 sekil_fayli tesvir_az tesvir_ru tesvir_en"
).split(" ");

async function workbook(url) {
  const file = await readFile(url);
  return Uint8Array.from(file).buffer;
}

test("readXlsx reads the stored sample's exact headers, Unicode strings, and numeric cells", async () => {
  const rows = await readXlsx(await workbook(sample));
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.keys(rows[0]), headers);
  assert.equal(rows[0].ad_az, "Nümunə: Qobustan Boz");
  assert.equal(rows[0].ad_ru, "Образец: Гобустан Серый");
  assert.equal(rows[1].en_sm, 7.5);
  assert.equal(rows[1].qutuda_m2, 0.99);
  assert.match(rows[2].istifade, /;/);
});

test("DEFLATE worksheet and shared string runs resolve to the same values", async () => {
  const rows = await readXlsx(await workbook(deflated));
  assert.deepEqual(rows, await readXlsx(await workbook(sample)));
  rows[1].seth = "unknown";
  assert.deepEqual(rowsToProducts(rows).errors, [{ row: 5, field: "seth", code: "invalid_surface" }]);
});

test("DEFLATE remains available with Node's older stream formats", async () => {
  const supportedStream = globalThis.DecompressionStream;
  globalThis.DecompressionStream = class {
    constructor() {
      throw new TypeError("Unsupported compression format");
    }
  };
  try {
    const rows = await readXlsx(await workbook(deflated));
    assert.equal(rows.length, 3);
    assert.equal(rows[0].ad_az, "Nümunə: Qobustan Boz");
  } finally {
    globalThis.DecompressionStream = supportedStream;
  }
});

test("rowsToProducts derives specifications and sample IDs import into the browser store", async () => {
  const rows = await readXlsx(await workbook(sample));
  rows[0].reng = "boz; bej ;boz";
  rows[0].qutuda_m2 = "1,44";
  rows[1].sekil_fayli = "zeytun.webp";
  rows[2].sekil_fayli = "";
  const { products, errors } = rowsToProducts(rows);
  assert.deepEqual(errors, []);
  assert.deepEqual(products.map(({ pieces_per_box }) => pieces_per_box), [2, 44, 10]);
  assert.deepEqual(products[0].colors, ["boz", "bej"]);
  assert.deepEqual(products[0].material, { az: "Porselen qranit", ru: "Керамогранит", en: "Porcelain stoneware" });
  assert.equal(products[1].image, "img/tiles/zeytun.webp");
  assert.equal(products[2].image, "img/tiles/numune-kur.webp");
  assert.equal(products[0].featured, false);

  const store = createStore({ storage: null });
  const base = await store.loadProducts();
  for (const product of products) assert.equal(store.addProduct(product).ok, true);
  assert.deepEqual(await store.loadProducts(), [...base, ...products]);
});

test("rowsToProducts reports malformed, incomplete and duplicate entries by row and field", async () => {
  const [base] = await readXlsx(await workbook(sample));
  const rows = [
    base, base, {
      ...base, id: "Not a slug", kateqoriya: "outside", ad_ru: " ", en_sm: "0",
      qalinliq_mm: "Infinity", reng: "black", istifade: "roof", seth: "gloss",
      sekil_fayli: "../tile.webp", tesvir_en: "",
    },
    { ...base, id: "bad-coverage", qutuda_m2: 1.5 },
  ];
  const { products, errors } = rowsToProducts(rows);
  assert.deepEqual(products.map(({ id }) => id), [base.id]);
  assert.deepEqual(errors, [
    { row: 3, field: "id", code: "duplicate_id" },
    { row: 4, field: "id", code: "invalid_slug" },
    { row: 4, field: "kateqoriya", code: "invalid_category" },
    { row: 4, field: "ad_ru", code: "required" },
    { row: 4, field: "en_sm", code: "invalid_number" },
    { row: 4, field: "qalinliq_mm", code: "invalid_number" },
    { row: 4, field: "seth", code: "invalid_surface" },
    { row: 4, field: "reng", code: "invalid_color" },
    { row: 4, field: "istifade", code: "invalid_use" },
    { row: 4, field: "sekil_fayli", code: "invalid_image" },
    { row: 4, field: "tesvir_en", code: "required" },
    { row: 5, field: "qutuda_m2", code: "inconsistent_coverage" },
  ]);
});

test("readXlsx rejects a truncated ZIP", async () => {
  const bytes = await workbook(sample);
  await assert.rejects(readXlsx(bytes.slice(0, 100)), /ZIP directory/);
});
