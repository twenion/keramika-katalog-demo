import { getLang, t } from "../core/i18n.js";
import { sizeLabel } from "../core/catalog.js";
import { initShell, icons } from "./shell.js";
import { loadCatalogueData, loc, pageUrl, surfaceLabel, primaryHex, tilePlateDimensions } from "./data.js";
import { mountTileImg } from "./textures.js";
import { initHeroHorgu } from "./hero-horgu.js";
import { initScrollRoom } from "./scroll-room.js";

const $ = (id) => document.getElementById(id);

let catalogue = null;
let heroCtrl = null;
let seqCtrl = null;

function renderStaticCopy(lang) {
  $("hero-eyebrow").textContent = `${t("site.name", lang)} · ${t("site.location", lang)}`;
  $("hero-title").textContent = t("home.hero.title", lang);
  $("hero-sub").textContent = t("home.hero.subtitle", lang);
  $("hero-cta").innerHTML = `${t("home.hero.cta", lang)} ${icons.arrowRight}`;
  $("hero-cta").href = pageUrl("katalog/index.html", {}, lang);
  $("hero-samples-link").textContent = t("home.hero.materials", lang);

  $("seq-eyebrow").textContent = t("calculator.title", lang);
  $("seq-title").textContent = t("home.sequence.title", lang);
  $("seq-lbl-0").textContent = t("home.sequence.tile", lang);
  $("seq-lbl-1").textContent = t("home.sequence.squareMetre", lang);
  $("seq-lbl-2").textContent = t("home.sequence.surface", lang);
  $("seq-picker-label").textContent = t("home.hero.materials", lang);
  $("seq-area-label").textContent = t("calculator.area", lang);
  $("seq-boxes-label").textContent = t("calculator.boxes", lang);
  $("seq-total-label").textContent = t("calculator.total", lang);
  $("seq-reserve-note").textContent = t("calculator.reserve", lang);
  $("seq-to-catalog").textContent = t("home.hero.cta", lang);
  $("seq-to-catalog").href = pageUrl("katalog/index.html", {}, lang);

  $("featured-eyebrow").textContent = t("home.hero.materials", lang);
  $("featured-title").textContent = t("home.featured.title", lang);
  $("featured-all-link").innerHTML = `${t("home.hero.cta", lang)} ${icons.arrowRight}`;
  $("featured-all-link").href = pageUrl("katalog/index.html", {}, lang);

  $("categories-eyebrow").textContent = t("nav.catalog", lang);
  $("categories-title").textContent = t("home.categories.title", lang);
  $("categories-catalog-link").innerHTML = `${t("home.hero.cta", lang)} ${icons.arrowRight}`;
  $("categories-catalog-link").href = pageUrl("katalog/", {}, lang);
}

function renderFeatured(lang) {
  const board = $("featured-board");
  if (!board || !catalogue) return;
  const featured = catalogue.products.filter((p) => p.featured);
  const extra = catalogue.products.filter((p) => !p.featured && (p.id === "palid-taxta" || p.id === "sebeke"));
  const items = featured.concat(extra).slice(0, 6);

  // Architectural asymmetric 12-col editorial board: row1-2 (5+7, 4+3) + row3 (5+7) -> zero empty holes
  const layoutClasses = [
    "specimen-cell--tall",
    "specimen-cell--wide",
    "specimen-cell--medium",
    "specimen-cell--accent",
    "specimen-cell--span5",
    "specimen-cell--span7",
  ];

  board.innerHTML = "";
  items.forEach((product, idx) => {
    const cls = layoutClasses[idx % layoutClasses.length];
    const maxW = idx === 0 ? 250 : (idx === 1 || idx === 5) ? 290 : 185;
    const maxH = idx === 0 ? 340 : idx === 5 ? 204 : 185;
    const dims = tilePlateDimensions(product, maxW, maxH);

    const a = document.createElement("a");
    a.className = `specimen-cell ${cls}`;
    a.href = pageUrl("mehsul/index.html", { id: product.id }, lang);

    const media = document.createElement("div");
    media.className = "specimen-cell__media";

    const slab = document.createElement("div");
    slab.className = "tile-slab";

    const plate = document.createElement("div");
    plate.className = "tile-slab__plate";
    plate.style.width = `${dims.width}px`;
    plate.style.aspectRatio = `${product.size.w} / ${product.size.h}`;
    plate.style.setProperty("--tile-bg", primaryHex(catalogue, product));

    const img = document.createElement("img");
    img.width = dims.width;
    img.height = dims.height;
    mountTileImg(img, product, catalogue, {
      small: idx > 1,
      eager: true,
      alt: `${loc(product.name, lang)} — ${sizeLabel(product, lang)}`,
    });

    plate.appendChild(img);
    slab.appendChild(plate);
    media.appendChild(slab);

    const foot = document.createElement("div");
    foot.className = "specimen-cell__foot";
    foot.innerHTML = `
      <span class="specimen-cell__name">${loc(product.name, lang)}</span>
      <span class="specimen-cell__meta">${sizeLabel(product, lang)} · ${surfaceLabel(catalogue, product.surface, lang)}</span>
    `;

    a.append(media, foot);
    board.appendChild(a);
  });
}

function renderCategories(lang) {
  const ledger = $("category-ledger");
  if (!ledger || !catalogue) return;
  ledger.innerHTML = "";

  catalogue.categories.forEach((cat, idx) => {
    const inCat = catalogue.products.filter((p) => p.category === cat.id);
    const a = document.createElement("a");
    a.className = "cat-row";
    a.href = pageUrl("katalog/index.html", { category: cat.id }, lang);

    const num = document.createElement("span");
    num.className = "cat-row__idx";
    num.textContent = String(idx + 1).padStart(2, "0");

    const title = document.createElement("span");
    title.className = "cat-row__title";
    title.textContent = loc(cat.name, lang);

    const swatches = document.createElement("div");
    swatches.className = "cat-row__swatches";
    inCat.slice(0, 4).forEach((p) => {
      const box = document.createElement("span");
      box.className = "cat-swatch";
      box.style.backgroundColor = primaryHex(catalogue, p);
      const img = document.createElement("img");
      img.width = 56;
      img.height = 44;
      mountTileImg(img, p, catalogue, { small: true, eager: true, alt: loc(p.name, lang) });
      box.appendChild(img);
      swatches.appendChild(box);
    });

    const count = document.createElement("span");
    count.className = "cat-row__count";
    count.innerHTML = `<span>${inCat.length}</span> ${icons.arrowRight}`;

    a.append(num, title, swatches, count);
    ledger.appendChild(a);
  });
}

async function boot() {
  initShell({
    active: "home",
    titleKey: "home.title",
    descKey: "home.description",
    onLangChange: (lang) => {
      renderStaticCopy(lang);
      renderFeatured(lang);
      renderCategories(lang);
      heroCtrl?.refreshLang();
      seqCtrl?.refreshLang();
    },
  });

  renderStaticCopy(getLang());

  try {
    catalogue = await loadCatalogueData();
  } catch (err) {
    console.error(err);
    $("featured-board").innerHTML = `<p style="padding:24px;">${t("common.loadError", getLang())}</p>`;
    return;
  }

  heroCtrl = initHeroHorgu({
    canvas: $("hero-canvas"),
    tabsEl: $("hero-tabs"),
    readoutEl: $("hero-readout"),
    products: catalogue.products,
    meta: catalogue,
  });

  seqCtrl = initScrollRoom({
    trackEl: $("seq-track"),
    canvas: $("seq-canvas"),
    badgeEl: $("seq-badge"),
    pickerEl: $("seq-tile-picker"),
    stepsEl: $("seq-steps"),
    rangeEl: $("seq-area-range"),
    areaValEl: $("seq-area-val"),
    boxesValEl: $("seq-boxes-val"),
    totalValEl: $("seq-total-val"),
    openTileEl: $("seq-open-tile"),
    fillEl: $("seq-progress-fill"),
    products: catalogue.products,
    meta: catalogue,
  });

  renderFeatured(getLang());
  renderCategories(getLang());
}

boot();
