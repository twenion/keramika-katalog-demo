import { getLang, t } from "../core/i18n.js";
import { boxesFor, sizeLabel, waLink } from "../core/catalog.js";
import { initShell, icons } from "./shell.js";
import {
  loadCatalogueData,
  loc,
  pageUrl,
  categoryLabel,
  surfaceLabel,
  colorItem,
  useLabel,
  primaryHex,
  tilePlateDimensions,
} from "./data.js";
import { mountTileImg } from "./textures.js";
import { mountSurfaceVisualizer } from "./visualizer.js";

const $ = (id) => document.getElementById(id);

let catalogue = null;
let product = null;
let vizCtrl = null;

const vizState = {
  plane: "floor",
  layout: "straight",
  groutColor: "#DDD7CC",
  groutMm: 2,
};

let calcAreaValue = "16";

const groutOptions = [
  { id: "ivory",  hex: "#DDD7CC" },
  { id: "cement", hex: "#9E9990" },
  { id: "basalt", hex: "#33312E" },
  { id: "oxide",  hex: "#8C5845" },
];

function relatedProducts(current, all) {
  const sameCat = all.filter((p) => p.id !== current.id && p.category === current.category);
  const others = all.filter((p) => p.id !== current.id && p.category !== current.category);
  return sameCat.concat(others).slice(0, 4);
}

function renderNotFound(lang) {
  document.title = `${t("product.notFound.title", lang)} — ${t("site.name", lang)}`;
  $("jump-viz").hidden = true;
  $("back-link").href = pageUrl("katalog/index.html", {}, lang);
  $("back-link").innerHTML = `${icons.arrowLeft} <span>${t("product.back", lang)}</span>`;

  $("product-root").innerHTML = `
    <div style="padding:72px 0;">
      <div class="catalog-empty">
        <h1 class="catalog-empty__title">${t("product.notFound.title", lang)}</h1>
        <p class="catalog-empty__desc">${t("product.notFound.description", lang)}</p>
        <a class="btn btn--ink" href="${pageUrl("katalog/index.html", {}, lang)}">${t("product.back", lang)}</a>
      </div>
    </div>
  `;
}

function updateCalculatorOutput(lang) {
  const input = $("calc-area-input");
  const errEl = $("calc-err");
  const outEl = $("calc-out");
  if (!input || !product) return;

  calcAreaValue = input.value;
  const parsed = Number(String(calcAreaValue).replace(",", "."));
  const calc = boxesFor(product, parsed);
  const unitM2 = t("unit.m2", lang);
  const unitPcs = t("unit.pieces", lang);

  if (!Number.isFinite(parsed) || parsed <= 0 || calc.boxes <= 0) {
    errEl.hidden = false;
    errEl.textContent = t("calculator.invalidArea", lang);
    outEl.style.opacity = "0.35";
    $("calc-boxes").textContent = "—";
    $("calc-total").textContent = "—";
    return;
  }

  errEl.hidden = true;
  outEl.style.opacity = "1";
  const pcsTotal = calc.boxes * (Number(product.pieces_per_box) || 1);
  $("calc-boxes").textContent = `${calc.boxes}`;
  $("calc-total").textContent = `${calc.m2Total.toFixed(2)} ${unitM2}`;
  $("calc-pcs-hint").textContent = product.pieces_per_box
    ? `${pcsTotal} ${unitPcs} (${product.pieces_per_box} ${unitPcs} / ${product.m2_per_box} ${unitM2})`
    : "";

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.getAttribute("data-preset")) === parsed);
  });
}

function renderProduct(lang) {
  if (!product || !catalogue) return;

  const name = loc(product.name, lang);
  const size = sizeLabel(product, lang);
  const catName = categoryLabel(catalogue, product.category, lang);
  const surfName = surfaceLabel(catalogue, product.surface, lang);
  const desc = loc(product.description, lang);
  const phone = t("whatsapp.phone", lang);
  const waHref = waLink(product, lang, phone);

  document.title = `${name} (${size}) — ${t("site.name", lang)}`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", `${name}, ${size}. ${desc}`);

  $("back-link").href = pageUrl("katalog/index.html", {}, lang);
  $("back-link").innerHTML = `${icons.arrowLeft} <span>${t("product.back", lang)}</span>`;
  $("jump-viz").hidden = false;
  $("jump-viz").textContent = t("visualizer.title", lang);

  const dims = tilePlateDimensions(product, 340, 340);
  const colorsHtml = (product.colors || []).map((cid) => {
    const c = colorItem(catalogue, cid);
    return `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:10px;"><span class="color-chip__dot" style="background:${c.hex};"></span>${loc(c.name, lang)}</span>`;
  }).join("");
  const usesText = (product.use || []).map((u) => useLabel(catalogue, u, lang)).join(", ");
  const isRect = Math.abs((product.size?.w || 0) - (product.size?.h || 0)) > 0.5;
  if (!isRect && vizState.layout === "herringbone") vizState.layout = "straight";

  // Pick a sensible default plane based on tile category
  if (!vizCtrl && product.category === "divar") {
    vizState.plane = "wall";
  }

  const root = $("product-root");
  root.innerHTML = `
    <div class="product-hero-head">
      <div>
        <p class="eyebrow">${catName}</p>
        <h1 class="product-hero-head__title">${name}</h1>
        <div class="product-hero-head__meta">
          <span class="meta-tag">${size}</span>
          <span class="meta-tag">${surfName}</span>
          ${product.thickness_mm ? `<span class="meta-tag">${product.thickness_mm} ${t("unit.mm", lang)}</span>` : ""}
        </div>
      </div>
      <div class="product-hero-head__cta">
        <a class="btn btn--outline" href="#visualizer">${t("visualizer.title", lang)}</a>
        <a class="btn btn--wa" href="${waHref}" target="_blank" rel="noopener noreferrer">
          ${icons.whatsapp}
          <span>${t("whatsapp.button", lang)}</span>
        </a>
      </div>
    </div>

    <!-- Architectural Specimen Exhibition Plate & Specs -->
    <section class="specimen-stage" aria-label="${t("product.details.title", lang)}">
      <div class="specimen-stage__plate">
        <div class="specimen-ruler">
          <div class="specimen-ruler__dim">${product.size.w} × ${product.size.h} ${t("unit.cm", lang)}</div>
          <div class="tile-slab__plate" id="main-tile-plate" style="width:${dims.width}px;height:${dims.height}px;--tile-bg:${primaryHex(catalogue, product)};">
            <img id="main-tile-img" width="${dims.width}" height="${dims.height}" alt="${name}">
          </div>
          ${product.thickness_mm ? `<div class="specimen-ruler__dim">${t("product.specs.thickness", lang)}: ${product.thickness_mm} ${t("unit.mm", lang)}</div>` : ""}
        </div>
      </div>

      <div class="specimen-stage__info">
        <div>
          <h2 class="card-heading">${t("product.details.title", lang)}</h2>
          <p class="product-desc">${desc}</p>
        </div>

        <div>
          <h2 class="card-heading" style="font-size:20px;">${t("product.specs.title", lang)}</h2>
          <dl class="spec-grid">
            <div class="spec-cell"><dt class="spec-cell__k">${t("product.specs.category", lang)}</dt><dd class="spec-cell__v">${catName}</dd></div>
            <div class="spec-cell"><dt class="spec-cell__k">${t("product.specs.size", lang)}</dt><dd class="spec-cell__v">${size}</dd></div>
            <div class="spec-cell"><dt class="spec-cell__k">${t("product.specs.thickness", lang)}</dt><dd class="spec-cell__v">${product.thickness_mm ? `${product.thickness_mm} ${t("unit.mm", lang)}` : "—"}</dd></div>
            <div class="spec-cell"><dt class="spec-cell__k">${t("product.specs.surface", lang)}</dt><dd class="spec-cell__v">${surfName}</dd></div>
            <div class="spec-cell"><dt class="spec-cell__k">${t("product.specs.material", lang)}</dt><dd class="spec-cell__v">${loc(product.material, lang) || "—"}</dd></div>
            <div class="spec-cell"><dt class="spec-cell__k">${t("product.specs.use", lang)}</dt><dd class="spec-cell__v">${usesText || "—"}</dd></div>
            <div class="spec-cell"><dt class="spec-cell__k">${t("product.specs.piecesPerBox", lang)}</dt><dd class="spec-cell__v">${product.pieces_per_box ? `${product.pieces_per_box} ${t("unit.pieces", lang)}` : "—"}</dd></div>
            <div class="spec-cell"><dt class="spec-cell__k">${t("product.specs.m2PerBox", lang)}</dt><dd class="spec-cell__v">${product.m2_per_box ? `${product.m2_per_box} ${t("unit.m2", lang)}` : "—"}</dd></div>
            <div class="spec-cell" style="grid-column:1 / -1;"><dt class="spec-cell__k">${t("product.specs.color", lang)}</dt><dd class="spec-cell__v">${colorsHtml || "—"}</dd></div>
          </dl>
        </div>
      </div>
    </section>

    <!-- Box Calculator + WhatsApp Inquiry -->
    <section class="calc-wa-grid" aria-label="${t("calculator.title", lang)}">
      <div class="calc-card">
        <h2 class="card-heading">${t("calculator.title", lang)}</h2>
        <div class="field-group">
          <label class="field-label" for="calc-area-input">${t("calculator.area", lang)} (${t("unit.m2", lang)})</label>
          <div class="calc-input-row">
            <input class="input" id="calc-area-input" type="text" inputmode="decimal" value="${calcAreaValue}" placeholder="${t("calculator.area.placeholder", lang)}" style="max-width:220px;">
          </div>
          <div class="calc-presets">
            ${[6, 12, 16, 24, 40].map((v) => `
              <button type="button" class="preset-btn" data-preset="${v}">${v} ${t("unit.m2", lang)}</button>
            `).join("")}
          </div>
        </div>
        <p class="calc-err" id="calc-err" hidden></p>
        <div class="calc-out" id="calc-out">
          <div>
            <div class="calc-out__num" id="calc-boxes">—</div>
            <div class="calc-out__lbl">${t("calculator.boxes", lang)}</div>
          </div>
          <div>
            <div class="calc-out__num" id="calc-total" style="color:var(--ink);">—</div>
            <div class="calc-out__lbl">${t("calculator.total", lang)}</div>
          </div>
        </div>
        <p class="calc-note" id="calc-pcs-hint"></p>
        <p class="calc-note">${t("calculator.reserve", lang)}</p>
      </div>

      <div class="wa-card">
        <div>
          <p class="eyebrow" style="margin-bottom:8px;">WhatsApp</p>
          <h2 class="card-heading">${t("whatsapp.button", lang)}</h2>
          <p style="color:var(--ink-2);font-size:15px;">${name} · ${size}</p>
        </div>
        <div class="wa-phone-box">
          <span class="wa-phone-box__num">${phone}</span>
          <span class="wa-phone-box__tag">${t("whatsapp.placeholder", lang)}</span>
        </div>
        <a class="btn btn--wa" href="${waHref}" target="_blank" rel="noopener noreferrer" style="width:100%;">
          ${icons.whatsapp}
          <span>${t("whatsapp.button", lang)}</span>
        </a>
      </div>
    </section>

    <!-- Signature Interactive Visualizer: "Səthdə bax" -->
    <section class="section" id="visualizer" data-scene="visualizer" aria-labelledby="viz-title">
      <div class="section__head">
        <div>
          <p class="eyebrow">${t("visualizer.preview", lang)}</p>
          <h2 class="section__title" id="viz-title">${t("visualizer.title", lang)}</h2>
          <p class="page-head__sub">${t("visualizer.description", lang)}</p>
        </div>
      </div>

      <div class="viz-box">
        <div class="viz-toolbar">
          <div class="viz-control">
            <span class="viz-control__label">${t("visualizer.plane", lang)}</span>
            <div class="seg-group" role="group" aria-label="${t("visualizer.plane", lang)}">
              <button type="button" class="seg-btn" data-plane="floor" aria-pressed="${vizState.plane === "floor"}">${t("visualizer.floor", lang)}</button>
              <button type="button" class="seg-btn" data-plane="wall" aria-pressed="${vizState.plane === "wall"}">${t("visualizer.wall", lang)}</button>
            </div>
          </div>

          <div class="viz-control">
            <span class="viz-control__label">${t("visualizer.layout", lang)}</span>
            <div class="seg-group" role="group" aria-label="${t("visualizer.layout", lang)}">
              <button type="button" class="seg-btn" data-layout="straight" aria-pressed="${vizState.layout === "straight"}">${t("visualizer.layout.straight", lang)}</button>
              <button type="button" class="seg-btn" data-layout="offset" aria-pressed="${vizState.layout === "offset"}">${t("visualizer.layout.offset", lang)}</button>
              <button type="button" class="seg-btn" data-layout="herringbone" aria-pressed="${vizState.layout === "herringbone"}" ${isRect ? "" : "disabled"}>${t("visualizer.layout.herringbone", lang)}</button>
            </div>
          </div>

          <div class="viz-control">
            <span class="viz-control__label">${t("visualizer.grout", lang)}</span>
            <div class="grout-swatches" role="group" aria-label="${t("visualizer.grout", lang)}">
              ${groutOptions.map((g) => `
                <button type="button" class="grout-swatch" data-grout="${g.hex}" aria-pressed="${vizState.groutColor === g.hex}" style="background:${g.hex};" aria-label="${g.id}"></button>
              `).join("")}
            </div>
            <div class="seg-group" role="group" aria-label="${t("visualizer.grout", lang)} mm">
              <button type="button" class="seg-btn" data-gmm="2" aria-pressed="${vizState.groutMm === 2}">2 ${t("unit.mm", lang)}</button>
              <button type="button" class="seg-btn" data-gmm="4" aria-pressed="${vizState.groutMm === 4}">4 ${t("unit.mm", lang)}</button>
            </div>
          </div>
        </div>

        <div class="viz-stage">
          <canvas class="viz-canvas" id="viz-canvas" aria-label="${t("visualizer.preview", lang)}"></canvas>
        </div>

        <div class="viz-caption">
          <span>${name} · ${size} · ${surfName}</span>
          <span id="viz-state-label"></span>
        </div>
      </div>
    </section>

    <!-- Related Products -->
    <section class="section" aria-labelledby="related-title">
      <div class="section__head">
        <div>
          <p class="eyebrow">${catName}</p>
          <h2 class="section__title" id="related-title">${t("product.related.title", lang)}</h2>
        </div>
        <a class="section__link" href="${pageUrl("katalog/index.html", { category: product.category }, lang)}">${t("home.hero.cta", lang)} ${icons.arrowRight}</a>
      </div>
      <div class="catalog-grid" id="related-grid"></div>
    </section>
  `;

  mountTileImg($("main-tile-img"), product, catalogue, { small: false, alt: `${name} — ${size}` });

  // Calculator bindings
  const areaInput = $("calc-area-input");
  areaInput.addEventListener("input", () => updateCalculatorOutput(lang));
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      areaInput.value = btn.getAttribute("data-preset");
      updateCalculatorOutput(lang);
    });
  });
  updateCalculatorOutput(lang);

  // Visualizer mount & controls
  vizCtrl = mountSurfaceVisualizer({
    canvas: $("viz-canvas"),
    product,
    meta: catalogue,
    state: vizState,
  });

  const syncVizLabel = () => {
    const planeKey = vizState.plane === "floor" ? "visualizer.floor" : "visualizer.wall";
    const layoutKey = `visualizer.layout.${vizState.layout}`;
    $("viz-state-label").textContent = `${t(planeKey, lang)} · ${t(layoutKey, lang)} · ${t("visualizer.grout", lang)} ${vizState.groutMm} ${t("unit.mm", lang)}`;
  };
  syncVizLabel();

  document.querySelectorAll("[data-plane]").forEach((btn) => {
    btn.addEventListener("click", () => {
      vizState.plane = btn.getAttribute("data-plane");
      document.querySelectorAll("[data-plane]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      syncVizLabel();
      vizCtrl.update();
    });
  });

  document.querySelectorAll("[data-layout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      vizState.layout = btn.getAttribute("data-layout");
      document.querySelectorAll("[data-layout]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      syncVizLabel();
      vizCtrl.update();
    });
  });

  document.querySelectorAll("[data-grout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      vizState.groutColor = btn.getAttribute("data-grout");
      document.querySelectorAll("[data-grout]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      vizCtrl.update();
    });
  });

  document.querySelectorAll("[data-gmm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      vizState.groutMm = Number(btn.getAttribute("data-gmm"));
      document.querySelectorAll("[data-gmm]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      syncVizLabel();
      vizCtrl.update();
    });
  });

  // Related products
  const relGrid = $("related-grid");
  relatedProducts(product, catalogue.products).forEach((rp) => {
    const a = document.createElement("a");
    a.className = "tile-card";
    a.href = pageUrl("mehsul/index.html", { id: rp.id }, lang);
    const rd = tilePlateDimensions(rp, 160, 165);
    const tray = document.createElement("div");
    tray.className = "tile-card__tray";
    const plate = document.createElement("div");
    plate.className = "tile-slab__plate";
    plate.style.width = `${rd.width}px`;
    plate.style.height = `${rd.height}px`;
    plate.style.setProperty("--tile-bg", primaryHex(catalogue, rp));
    const img = document.createElement("img");
    img.width = rd.width;
    img.height = rd.height;
    mountTileImg(img, rp, catalogue, { small: true, eager: true, alt: loc(rp.name, lang) });
    plate.appendChild(img);
    tray.appendChild(plate);

    const body = document.createElement("div");
    body.className = "tile-card__body";
    body.innerHTML = `
      <div class="tile-card__top">
        <h3 class="tile-card__name">${loc(rp.name, lang)}</h3>
        <span class="tile-card__size">${sizeLabel(rp, lang)}</span>
      </div>
      <div class="tile-card__sub">
        <span>${surfaceLabel(catalogue, rp.surface, lang)}</span>
      </div>
    `;
    a.append(tray, body);
    relGrid.appendChild(a);
  });
}

async function boot() {
  initShell({
    active: "product",
    titleKey: "catalog.title",
    descKey: "catalog.description",
    onLangChange: (lang) => {
      if (product) renderProduct(lang);
      else renderNotFound(lang);
    },
  });

  const lang = getLang();
  $("loading-msg").textContent = t("common.loading", lang);

  try {
    catalogue = await loadCatalogueData();
  } catch (err) {
    console.error(err);
    $("product-root").innerHTML = `<p style="padding:48px 0;">${t("common.loadError", lang)}</p>`;
    return;
  }

  const id = new URLSearchParams(location.search).get("id");
  product = id
    ? catalogue.products.find((p) => p.id === id)
    : catalogue.products[0];

  if (!product) {
    renderNotFound(lang);
    return;
  }

  renderProduct(lang);
}

boot();
