import { getLang, t } from "../core/i18n.js";
import { loadProducts } from "../core/store.js";

const catalogueUrl = new URL("../../data/products.json", import.meta.url);
const rootUrl = new URL("../../", import.meta.url);

let metaPromise;

/** Load static category and facet definitions from data/products.json (cached). */
export async function loadMeta() {
  metaPromise ??= fetch(catalogueUrl).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }).then((data) => ({
    categories: data.categories ?? [],
    facets: data.facets ?? { surface: [], color: [], use: [] },
  })).catch((err) => {
    metaPromise = undefined;
    throw err;
  });
  return metaPromise;
}

/** Load both merged products (with admin browser overlay) and catalogue metadata. */
export async function loadCatalogueData() {
  const [products, meta] = await Promise.all([loadProducts(), loadMeta()]);
  return { products, ...meta };
}

/** Resolve a root-relative path (like "img/tiles/foo.webp" or "katalog/") to an absolute URL. */
export function resolveAsset(path) {
  if (!path) return "";
  if (/^(data:|blob:|https?:|\/)/i.test(path)) return path;
  return new URL(path, rootUrl).href;
}

/** Build a page URL preserving the current ?lang= parameter. */
export function pageUrl(relPath, params = {}, lang = getLang()) {
  const url = new URL(relPath, rootUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  if (lang && lang !== "az") url.searchParams.set("lang", lang);
  else if (new URLSearchParams(location.search).has("lang")) url.searchParams.set("lang", lang);
  return url.pathname + url.search + url.hash;
}

/** Pick localized field with Azerbaijani fallback. */
export function loc(obj, lang = getLang()) {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  return obj[lang] || obj.az || obj.en || obj.ru || "";
}

/** Substitute {key} placeholders inside an i18n string. */
export function tf(key, vars = {}, lang = getLang()) {
  return t(key, lang).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}

export function categoryLabel(meta, id, lang = getLang()) {
  const item = meta.categories.find((c) => c.id === id);
  return item ? loc(item.name, lang) : id;
}

export function surfaceLabel(meta, id, lang = getLang()) {
  const item = meta.facets.surface.find((s) => s.id === id);
  return item ? loc(item.name, lang) : id;
}

export function colorItem(meta, id) {
  return meta.facets.color.find((c) => c.id === id) || { id, hex: "#9c958a", name: { az: id, ru: id, en: id } };
}

export function useLabel(meta, id, lang = getLang()) {
  const item = meta.facets.use.find((u) => u.id === id);
  return item ? loc(item.name, lang) : id;
}

export function primaryHex(meta, product) {
  const first = product?.colors?.[0];
  return first ? colorItem(meta, first).hex : "#9c958a";
}

/** Compute an authentic visual aspect-ratio box inside a specimen tray without extreme distortion. */
export function tilePlateDimensions(product, maxW = 190, maxH = 190) {
  const w = Number(product?.size?.w) || 60;
  const h = Number(product?.size?.h) || 60;
  // Soften ultra-skinny ratios (like 7.5x30 = 1:4 or 20x120 = 1:6) slightly for card readability while keeping shape unmistakable
  let ratio = w / h;
  if (ratio < 0.28) ratio = 0.28;
  if (ratio > 3.5) ratio = 3.5;

  let pw, ph;
  if (ratio >= 1) {
    pw = maxW;
    ph = pw / ratio;
    if (ph > maxH) {
      ph = maxH;
      pw = ph * ratio;
    }
  } else {
    ph = maxH;
    pw = ph * ratio;
    if (pw > maxW) {
      pw = maxW;
      ph = pw / ratio;
    }
  }
  return { width: Math.round(pw), height: Math.round(ph) };
}
