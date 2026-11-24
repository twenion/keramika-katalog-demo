const overlayKey = "seth.overlay";
const baseUrl = new URL("../../data/products.json", import.meta.url);
const categoryIds = new Set(["doseme", "divar", "metlax", "mozaika"]);
const localizedFields = ["name", "size", "material", "description"];

function emptyOverlay() {
  return { added: [], edited: {}, deleted: [] };
}

function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

async function fetchCatalogue(url) {
  if (url.protocol === "file:" && typeof process !== "undefined" && process.versions?.node) {
    const { readFile } = await import("node:fs/promises");
    return { ok: true, json: async () => JSON.parse(await readFile(url, "utf8")) };
  }
  return fetch(url);
}

function mergeProduct(product, patch) {
  const merged = { ...product, ...patch };
  for (const field of localizedFields) {
    if (patch?.[field] && typeof patch[field] === "object") {
      merged[field] = { ...product?.[field], ...patch[field] };
    }
  }
  return merged;
}

function validate(p, products, originalId) {
  const errors = [];
  const id = p?.id;
  if (typeof id !== "string" || !id.trim()) errors.push({ field: "id", code: "required" });
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) errors.push({ field: "id", code: "invalid_slug" });
  else if (originalId !== undefined && id !== originalId) errors.push({ field: "id", code: "immutable_id" });
  else if (id !== originalId && products.some((product) => product.id === id)) {
    errors.push({ field: "id", code: "duplicate_id" });
  }

  if (!p?.category) errors.push({ field: "category", code: "required" });
  else if (!categoryIds.has(p.category)) errors.push({ field: "category", code: "invalid_category" });
  if (typeof p?.name?.az !== "string" || !p.name.az.trim()) {
    errors.push({ field: "name.az", code: "required" });
  }
  for (const dimension of ["w", "h"]) {
    const value = p?.size?.[dimension];
    const field = `size.${dimension}`;
    if (value == null || value === "") errors.push({ field, code: "required" });
    else if (!Number.isFinite(value) || value <= 0) errors.push({ field, code: "invalid_number" });
  }
  return { ok: errors.length === 0, errors };
}

/** Create an isolated store with optional Storage-compatible storage and catalogue fetch. */
export function createStore({ storage = browserStorage(), fetch: fetchData = fetchCatalogue } = {}) {
  let base;
  let loading;
  let memory = emptyOverlay();

  function readOverlay() {
    if (!storage) return memory;
    const raw = storage.getItem(overlayKey);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.added) && Array.isArray(parsed.deleted) &&
          parsed.edited && typeof parsed.edited === "object" && !Array.isArray(parsed.edited)) {
        return parsed;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    return emptyOverlay();
  }

  function writeOverlay(overlay) {
    if (storage) storage.setItem(overlayKey, JSON.stringify(overlay));
    else memory = overlay;
  }

  function mergedProducts(overlay) {
    if (!base) throw new Error("Load the catalogue before reading or changing products.");
    const deleted = new Set(overlay.deleted);
    const added = new Set(overlay.added.map((p) => p.id));
    const products = base.products
      .filter((p) => !deleted.has(p.id) && !added.has(p.id))
      .map((p) => Object.hasOwn(overlay.edited, p.id) ? mergeProduct(p, overlay.edited[p.id]) : p);
    return products.concat(overlay.added);
  }

  async function loadProducts() {
    loading ??= (async () => {
      const response = await fetchData(baseUrl);
      if (!response.ok) throw new Error(`Could not load catalogue (HTTP ${response.status}).`);
      const catalogue = await response.json();
      if (!Array.isArray(catalogue.products)) throw new Error("Invalid catalogue.");
      base = catalogue;
    })().catch((error) => {
      loading = undefined;
      throw error;
    });
    await loading;
    return structuredClone(mergedProducts(readOverlay()));
  }

  function validateProduct(product) {
    return validate(product, base ? mergedProducts(readOverlay()) : []);
  }

  function addProduct(product) {
    const overlay = readOverlay();
    const result = validate(product, mergedProducts(overlay));
    if (result.ok) {
      writeOverlay({ ...overlay, added: [...overlay.added, structuredClone(product)] });
    }
    return result;
  }

  function updateProduct(id, patch) {
    const overlay = readOverlay();
    const products = mergedProducts(overlay);
    const existing = products.find((p) => p.id === id);
    if (!existing) return { ok: false, errors: [{ field: "id", code: "not_found" }] };
    const updated = mergeProduct(existing, patch);
    const result = validate(updated, products, id);
    if (!result.ok) return result;

    if (overlay.added.some((p) => p.id === id)) {
      const added = overlay.added.map((p) => p.id === id ? structuredClone(updated) : p);
      writeOverlay({ ...overlay, added });
    } else {
      const prior = Object.hasOwn(overlay.edited, id) ? overlay.edited[id] : {};
      const edit = structuredClone(mergeProduct(prior, patch));
      writeOverlay({ ...overlay, edited: { ...overlay.edited, [id]: edit } });
    }
    return result;
  }

  function deleteProduct(id) {
    const overlay = readOverlay();
    if (!mergedProducts(overlay).some((p) => p.id === id)) return false;
    const edited = { ...overlay.edited };
    delete edited[id];
    const added = overlay.added.filter((p) => p.id !== id);
    const deleted = base.products.some((p) => p.id === id)
      ? [...new Set([...overlay.deleted, id])]
      : overlay.deleted;
    writeOverlay({ added, edited, deleted });
    return true;
  }

  function resetOverlay() {
    if (storage) storage.removeItem(overlayKey);
    else memory = emptyOverlay();
  }

  function exportJSON() {
    const products = mergedProducts(readOverlay());
    return JSON.stringify({ ...base, products }, null, 2);
  }

  return { loadProducts, addProduct, updateProduct, deleteProduct, resetOverlay, exportJSON, validateProduct };
}

const store = createStore();

/** Load the catalogue and return a snapshot with the browser overlay applied. */
export const loadProducts = store.loadProducts;
/** Add a new product after the catalogue loads and return its validation result. */
export const addProduct = store.addProduct;
/** Apply a partial update to an existing ID and return its validation result. */
export const updateProduct = store.updateProduct;
/** Delete an overlay or base product and report whether it was present. */
export const deleteProduct = store.deleteProduct;
/** Remove the browser overlay to restore the base catalogue. */
export const resetOverlay = store.resetOverlay;
/** Export the merged catalogue as a JSON document with its original metadata. */
export const exportJSON = store.exportJSON;
/** Validate required fields and check uniqueness against the loaded catalogue. */
export const validateProduct = store.validateProduct;
