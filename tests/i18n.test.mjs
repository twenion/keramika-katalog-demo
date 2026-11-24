import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { getLang, setLang, t } from "../js/core/i18n.js";

const languages = ["az", "en", "ru"];
const data = async (name) => JSON.parse(await readFile(new URL("../data/" + name, import.meta.url), "utf8"));

function assertLanguages(localized, label) {
  assert.deepEqual(Object.keys(localized).sort(), languages, label);
  for (const lang of languages) {
    assert.equal(typeof localized[lang], "string", label + "." + lang);
    assert.ok(localized[lang].trim(), label + "." + lang);
  }
}

test("all translation keys are dotted and contain non-empty az, ru and en strings", async () => {
  const dictionary = await data("i18n.json");
  for (const [key, value] of Object.entries(dictionary)) {
    assert.match(key, /^[a-z]\w*(?:\.[a-z]\w*)+$/);
    assertLanguages(value, key);
    for (const lang of languages) assert.equal(t(key, lang), value[lang]);
  }
  const codes = [
    "required", "invalid_slug", "duplicate_id", "immutable_id", "not_found", "invalid_category",
    "invalid_number", "invalid_surface", "invalid_color", "invalid_use", "invalid_image",
    "inconsistent_coverage", "invalid_headers",
  ];
  for (const code of codes) assert.ok(Object.hasOwn(dictionary, "validation." + code));
  assert.equal(
    dictionary["footer.note"].az,
    "Bu, Twenion tərəfindən hazırlanmış nümunə saytdır. Məhsullar və məlumatlar nümunədir.",
  );
});

test("products, categories and facets have complete localized fields and consistent packaging", async () => {
  const { products, categories, facets } = await data("products.json");
  assert.equal(products.length, 16);
  assert.equal(new Set(products.map(({ id }) => id)).size, 16);
  const featured = products.filter((product) => product.featured);
  assert.equal(featured.length, 5);
  assert.equal(new Set(featured.map(({ category }) => category)).size, 4);
  for (const tag of [...categories, ...Object.values(facets).flat()]) assertLanguages(tag.name, tag.id);
  for (const color of facets.color) assert.match(color.hex, /^#[\da-f]{6}$/i);
  const ids = (values) => new Set(values.map(({ id }) => id));
  const categoryIds = ids(categories);
  const surfaceIds = ids(facets.surface);
  const colorIds = ids(facets.color);
  const useIds = ids(facets.use);
  for (const product of products) {
    for (const key of ["name", "material", "description"]) assertLanguages(product[key], product.id + "." + key);
    assert.ok(categoryIds.has(product.category));
    assert.ok(surfaceIds.has(product.surface));
    assert.ok(product.colors.length && product.colors.every((id) => colorIds.has(id)));
    assert.ok(product.use.length && product.use.every((id) => useIds.has(id)));
    assert.equal(product.image, "img/tiles/" + product.id + ".webp");
    assert.equal(product.size.unit, "cm");
    assert.ok(Number.isInteger(product.pieces_per_box) && product.pieces_per_box > 0);
    assert.ok(product.thickness_mm > 0);
    const area = product.size.w * product.size.h * product.pieces_per_box / 10_000;
    assert.ok(Math.abs(area - product.m2_per_box) < 1e-10, product.id);
  }
});

test("missing keys fall back to the key and log one warning across languages", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    assert.equal(t("nonexistent.key", "ru"), "nonexistent.key");
    assert.equal(t("nonexistent.key", "en"), "nonexistent.key");
    assert.equal(t("nav.catalog", "bad"), "Kataloq");
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = warn;
  }
});

test("language selection reads URL, then storage, then default and persists an explicit choice", () => {
  const original = Object.getOwnPropertyDescriptors(globalThis);
  let saved = "en";
  let url = new URL("https://example.az/katalog/?id=1#results");
  Object.defineProperties(globalThis, {
    location: { configurable: true, get: () => url },
    localStorage: { configurable: true, value: {
      getItem: (key) => key === "seth.lang" ? saved : null,
      setItem: (key, value) => { assert.equal(key, "seth.lang"); saved = value; },
    } },
    history: { configurable: true, value: {
      replaceState: (_state, _title, nextUrl) => { url = nextUrl; },
    } },
  });
  try {
    assert.equal(getLang(), "en");
    url.searchParams.set("lang", "ru");
    assert.equal(getLang(), "ru");
    url.searchParams.set("lang", "unknown");
    saved = "invalid";
    assert.equal(getLang(), "az");
    assert.equal(setLang("en"), "en");
    assert.equal(saved, "en");
    assert.equal(url.pathname, "/katalog/");
    assert.equal(url.searchParams.get("id"), "1");
    assert.equal(url.searchParams.get("lang"), "en");
    assert.equal(url.hash, "#results");
    assert.equal(t("nav.home"), "Home");
    assert.equal(setLang("unknown"), "en");
  } finally {
    for (const key of ["location", "localStorage", "history"]) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]);
      else delete globalThis[key];
    }
  }
});
