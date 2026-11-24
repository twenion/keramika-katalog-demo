import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  boxesFor, facetCounts, filterProducts, normalize, sizeKey, sizeLabel, waLink,
} from "../js/core/catalog.js";

const { products } = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const ids = (tiles) => tiles.map(({ id }) => id);
const marble = products.find(({ id }) => id === "xezer-mermer");

test("normalize folds Azerbaijani and Latin accents and preserves Cyrillic", () => {
  assert.equal(normalize("ƏIİı ÖÜĞŞÇ"), "eiii ougsc");
  assert.equal(normalize("Crème and S\u0327əbəkə"), "creme and sebeke");
  assert.equal(normalize("ЁЛКА, СИНИЙ"), "ёлка, синий");
  assert.equal(normalize(), "");
});

test("search matches all three languages and IDs regardless of current language", () => {
  assert.deepEqual(ids(filterProducts(products, { q: "  mermer " }, "ru")), ["xezer-mermer", "qara-mermer"]);
  assert.deepEqual(ids(filterProducts(products, { q: "мрамор" }, "en")), ["xezer-mermer", "qara-mermer"]);
  assert.deepEqual(ids(filterProducts(products, { q: "ash concrete" }, "az")), ["kul-beton"]);
  assert.deepEqual(ids(filterProducts(products, { q: "palid-taxta" }, "ru")), ["palid-taxta"]);
  assert.deepEqual(filterProducts(products, { category: "", surfaces: [] }), products);
  assert.deepEqual(filterProducts(products), products);
});

test("filters use OR within a facet and AND across facets", () => {
  const filters = {
    category: "doseme", sizes: ["60x120", "20x120"], surfaces: ["matt", "parlaq"],
    colors: ["ag", "bej"], uses: ["hamam", "metbex"],
  };
  assert.deepEqual(ids(filterProducts(products, filters, "az")), ["xezer-mermer", "palid-taxta"]);
  assert.deepEqual(ids(filterProducts(products, { ...filters, sizes: ["60x60"] }, "az")), ["terrazzo-abseron"]);
  assert.deepEqual(filterProducts(products, { ...filters, uses: ["col"] }, "az"), []);
});

test("facet counts exclude the facet being counted but keep search and other facets", () => {
  const counts = facetCounts(products, { q: "mermer", category: "doseme", colors: ["qara"] }, "en");
  assert.equal(counts.category.mozaika, 1);
  assert.equal(counts.category.doseme, 0);
  assert.equal(counts.colors.ag, 1);
  assert.equal(counts.colors.bej, 1);
  assert.equal(counts.colors.qara, 0);
  assert.equal(counts.sizes["60x120"], 0);
  assert.equal(counts.surfaces.parlaq, 0);
  assert.equal(counts.uses.divar, 0);
});

test("facet counts count a product once per value, including multi-valued facets", () => {
  const duplicate = { ...marble, colors: ["ag", "ag", "bej"], use: ["divar", "divar", "doseme"] };
  const counts = facetCounts([duplicate], {});
  assert.deepEqual(counts.colors, { ag: 1, bej: 1 });
  assert.deepEqual(counts.uses, { divar: 1, doseme: 1 });
});

test("size labels retain decimal dimensions and localize the unit", () => {
  const olive = products.find(({ id }) => id === "zeytun");
  assert.equal(sizeKey(olive), "7.5x30");
  assert.equal(sizeLabel(olive, "az"), "7.5×30 sm");
  assert.equal(sizeLabel(marble, "ru"), "60×120 см");
  assert.equal(sizeLabel(marble, "en"), "60×120 cm");
});

test("boxesFor includes 10% reserve and rounds up to whole boxes", () => {
  assert.deepEqual(boxesFor(marble, 12.5), { boxes: 10, m2Total: 14.4 });
  assert.deepEqual(boxesFor(marble, 1.32), { boxes: 2, m2Total: 2.88 });
  assert.deepEqual(boxesFor(marble, 0), { boxes: 0, m2Total: 0 });
  assert.deepEqual(boxesFor({ m2_per_box: 0 }, 2), { boxes: 0, m2Total: 0 });
});

test("WhatsApp encodes the message, dimensions and name in each language", () => {
  const messages = {
    az: 'Salam! "Xəzər Mərmər" (60×120 sm) haqqında məlumat almaq istəyirəm.',
    ru: 'Здравствуйте! Подскажите, пожалуйста, подробнее о плитке «Хазар Мрамор» (60×120 см).',
    en: 'Hello! I\'d like to know more about "Khazar Marble" (60×120 cm).',
  };
  for (const [lang, message] of Object.entries(messages)) {
    const expected = "https://wa.me/994000000000?text=" + encodeURIComponent(message);
    assert.equal(waLink(marble, lang, "+994 (00) 000-00-00"), expected);
  }
  const product = { ...marble, name: { en: 'Stone & Clay + 10% #1' } };
  assert.equal(
    new URL(waLink(product, "en")).searchParams.get("text"),
    'Hello! I\'d like to know more about "Stone & Clay + 10% #1" (60×120 cm).',
  );
});
