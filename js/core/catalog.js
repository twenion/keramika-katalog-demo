import { getLang, t } from "./i18n.js";

/** Fold Azerbaijani and other Latin accents for search while preserving Cyrillic letters. */
export function normalize(str) {
  return String(str ?? "")
    .toLowerCase()
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/\p{Script=Latin}\p{M}*/gu, (letter) =>
      letter.normalize("NFD").replace(/\p{M}/gu, ""),
    );
}

/** Return the canonical width-by-height facet key. */
export function sizeKey(product) {
  return `${product.size.w}x${product.size.h}`;
}

/** Format a tile's dimensions with the selected language's centimetre abbreviation. */
export function sizeLabel(product, lang = getLang()) {
  return `${product.size.w}×${product.size.h} ${t("unit.cm", lang)}`;
}

const facets = {
  category: (p) => [p.category],
  sizes: (p) => [sizeKey(p)],
  surfaces: (p) => [p.surface],
  colors: (p) => p.colors ?? [],
  uses: (p) => p.use ?? [],
};

/** Search all localized names and ID, combining facet values with OR and facets with AND. */
export function filterProducts(products, filters = {}, lang) {
  const resolved = filters ?? {};
  const query = normalize(resolved.q).trim();
  const activeFacets = Object.entries(facets).flatMap(([facet, valuesFor]) => {
    const selected = resolved[facet];
    const values = Array.isArray(selected) ? selected : selected ? [selected] : [];
    return values.length ? [[valuesFor, new Set(values)]] : [];
  });

  return products.filter((product) => {
    if (query && ![product.id, ...Object.values(product.name ?? {})].some(
      (name) => normalize(name).includes(query),
    )) return false;
    return activeFacets.every(([valuesFor, selected]) =>
      valuesFor(product).some((value) => selected.has(value)),
    );
  });
}

/** Count each observed facet value with the query and all other facet filters applied. */
export function facetCounts(products, filters, lang) {
  return Object.fromEntries(Object.entries(facets).map(([facet, valuesFor]) => {
    const counts = new Map();
    for (const product of products) {
      for (const value of valuesFor(product)) {
        if (value) counts.set(value, 0);
      }
    }
    const matching = filterProducts(products, { ...filters, [facet]: undefined }, lang);
    for (const product of matching) {
      for (const value of new Set(valuesFor(product))) {
        if (counts.has(value)) counts.set(value, counts.get(value) + 1);
      }
    }
    return [facet, Object.fromEntries(counts)];
  }));
}

/** Calculate whole boxes and their coverage with a 10% cutting allowance. */
export function boxesFor(product, m2) {
  const coverage = Number(product.m2_per_box);
  const area = Number(m2);
  if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(coverage) || coverage <= 0) {
    return { boxes: 0, m2Total: 0 };
  }
  const boxes = Math.ceil(area * 1.1 / coverage);
  return { boxes, m2Total: Number((boxes * coverage).toPrecision(15)) };
}

/** Build a WhatsApp URL with a localized product name, dimensions and message. */
export function waLink(product, lang = getLang(), phone = t("whatsapp.phone", lang)) {
  const values = {
    name: product.name[lang] || product.name.az,
    size: sizeLabel(product, lang),
  };
  const message = t("whatsapp.message", lang).replace(/\{(name|size)\}/g, (_, key) => values[key]);
  return `https://wa.me/${String(phone).replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
