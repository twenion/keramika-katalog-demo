import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createStore, loadProducts } from "../js/core/store.js";

const base = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const baseTile = base.products[0];
const newTile = {
  ...baseTile, id: "studio-ag", name: { ...baseTile.name, az: "Studiyo Ağ" },
  image: "data:image/webp;base64,UklGRg==",
};
const persistedKey = "seth.overlay";

function mockStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function setup(storage = mockStorage()) {
  const fetch = async () => ({ ok: true, json: async () => structuredClone(base) });
  return { storage, store: createStore({ storage, fetch }) };
}

test("the default entry point loads the base catalogue as an array", async () => {
  assert.deepEqual(await loadProducts(), base.products);
});

test("add, update and delete persist across store instances, then reset restores the base", async () => {
  const { storage, store } = setup();
  await store.loadProducts();
  assert.deepEqual(store.addProduct(newTile), { ok: true, errors: [] });
  assert.deepEqual(store.updateProduct(newTile.id, { name: { ru: "Студия Белая" } }), { ok: true, errors: [] });
  assert.equal(store.updateProduct(baseTile.id, { size: { w: 90 } }).ok, true);
  assert.equal(store.updateProduct(baseTile.id, { description: { en: "Revised." } }).ok, true);
  assert.equal(store.deleteProduct(base.products[1].id), true);
  assert.equal(store.deleteProduct("missing"), false);

  const { store: anotherPage } = setup(storage);
  const products = await anotherPage.loadProducts();
  assert.equal(products.length, base.products.length);
  assert.deepEqual(products.find(({ id }) => id === newTile.id), {
    ...newTile, name: { ...newTile.name, ru: "Студия Белая" },
  });
  assert.deepEqual(products[0].size, { w: 90, h: 120, unit: "cm" });
  assert.deepEqual(products[0].description, { ...baseTile.description, en: "Revised." });
  assert.deepEqual(JSON.parse(anotherPage.exportJSON()), { ...base, products });
  assert.equal(anotherPage.deleteProduct(newTile.id), true);
  assert.equal(JSON.parse(storage.getItem(persistedKey)).added.length, 0);

  anotherPage.resetOverlay();
  assert.equal(storage.getItem(persistedKey), null);
  assert.deepEqual(await store.loadProducts(), base.products);
});

test("a deleted base ID can be added again and exists only once", async () => {
  const { store } = setup();
  await store.loadProducts();
  store.updateProduct(baseTile.id, { name: { az: "Edited" } });
  store.deleteProduct(baseTile.id);
  assert.equal(store.addProduct({ ...baseTile, name: { az: "Restored" } }).ok, true);
  const tiles = (await store.loadProducts()).filter(({ id }) => id === baseTile.id);
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].name.az, "Restored");
  assert.equal(store.deleteProduct(baseTile.id), true);
  assert.equal((await store.loadProducts()).some(({ id }) => id === baseTile.id), false);
});

test("required fields, facet categories, numeric dimensions and unique slugs are validated", async () => {
  const { store, storage } = setup();
  await store.loadProducts();
  const invalid = { id: "Bad ID", category: "other", name: { az: " " }, size: { w: 0, h: Infinity } };
  assert.deepEqual(store.validateProduct(invalid), {
    ok: false,
    errors: [
      { field: "id", code: "invalid_slug" }, { field: "category", code: "invalid_category" },
      { field: "name.az", code: "required" }, { field: "size.w", code: "invalid_number" },
      { field: "size.h", code: "invalid_number" },
    ],
  });
  assert.equal(store.validateProduct({}).errors.length, 5);
  assert.deepEqual(store.addProduct(baseTile).errors, [{ field: "id", code: "duplicate_id" }]);
  assert.deepEqual(store.updateProduct(baseTile.id, { id: "changed-id" }).errors, [{ field: "id", code: "immutable_id" }]);
  assert.deepEqual(store.updateProduct("missing", {}).errors, [{ field: "id", code: "not_found" }]);
  assert.equal(storage.getItem(persistedKey), null);
});

test("failed writes leave the overlay intact and returned products are independent snapshots", async () => {
  const storage = mockStorage();
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  const { store } = setup(storage);
  const products = await store.loadProducts();
  products[0].name.az = "Mutated externally";
  assert.throws(() => store.addProduct(newTile), /Quota exceeded/);
  assert.deepEqual(await store.loadProducts(), base.products);
});

test("malformed stored overlay can recover and failed base fetch can be retried", async () => {
  const storage = mockStorage();
  storage.setItem(persistedKey, "{");
  let calls = 0;
  const store = createStore({
    storage,
    fetch: async () => ++calls === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => base },
  });
  await assert.rejects(store.loadProducts(), /503/);
  assert.deepEqual(await store.loadProducts(), base.products);
  assert.equal(store.addProduct(newTile).ok, true);
  assert.equal((await store.loadProducts()).length, base.products.length + 1);
  assert.equal(calls, 2);
});
