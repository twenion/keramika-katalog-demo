import { getLang, t } from "../core/i18n.js";
import { filterProducts, facetCounts, sizeKey, sizeLabel } from "../core/catalog.js";
import { initShell, icons } from "./shell.js";
import {
  loadCatalogueData,
  loc,
  tf,
  pageUrl,
  categoryLabel,
  surfaceLabel,
  colorItem,
  useLabel,
  primaryHex,
  tilePlateDimensions,
} from "./data.js";
import { mountTileImg } from "./textures.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let catalogue = null;
let viewMode = "grid";

const filters = {
  q: "",
  category: "",
  sizes: [],
  surfaces: [],
  colors: [],
  uses: [],
};

function readInitialUrl() {
  const sp = new URLSearchParams(location.search);
  filters.q = sp.get("q") || "";
  filters.category = sp.get("category") || "";
  const parseList = (key) => (sp.get(key) || "").split(",").map((s) => s.trim()).filter(Boolean);
  filters.sizes = parseList("sizes");
  filters.surfaces = parseList("surfaces");
  filters.colors = parseList("colors");
  filters.uses = parseList("uses");
}

function syncUrl() {
  const url = new URL(location.href);
  const setOrDel = (k, val) => {
    if (val && val.length) url.searchParams.set(k, Array.isArray(val) ? val.join(",") : val);
    else url.searchParams.delete(k);
  };
  setOrDel("q", filters.q.trim());
  setOrDel("category", filters.category);
  setOrDel("sizes", filters.sizes);
  setOrDel("surfaces", filters.surfaces);
  setOrDel("colors", filters.colors);
  setOrDel("uses", filters.uses);
  history.replaceState(history.state, "", url);
}

function hasActiveFilters() {
  return Boolean(
    filters.q.trim() ||
    filters.category ||
    filters.sizes.length ||
    filters.surfaces.length ||
    filters.colors.length ||
    filters.uses.length,
  );
}

function activeFilterCount() {
  return (filters.category ? 1 : 0) +
    filters.sizes.length +
    filters.surfaces.length +
    filters.colors.length +
    filters.uses.length;
}

function clearAllFilters() {
  filters.q = "";
  filters.category = "";
  filters.sizes = [];
  filters.surfaces = [];
  filters.colors = [];
  filters.uses = [];
  $("catalog-search").value = "";
  $("search-clear").hidden = true;
  syncUrl();
  renderAll(true);
}

function toggleArray(list, value) {
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(value);
}

function renderStaticCopy(lang) {
  document.title = `${t("catalog.title", lang)} — ${t("site.name", lang)}`;
  $("cat-eyebrow").textContent = t("site.name", lang);
  $("cat-title").textContent = t("catalog.title", lang);
  $("cat-sub").textContent = t("catalog.description", lang);
  $("filters-heading").textContent = t("catalog.filters.title", lang);
  $("clear-filters-rail").textContent = t("catalog.filters.clear", lang);
  $("clear-filters-drawer").textContent = t("catalog.filters.clear", lang);
  $("apply-filters-drawer").textContent = t("catalog.filters.apply", lang);
  $("close-filters").setAttribute("aria-label", t("common.close", lang));
  $("search-icon").innerHTML = icons.search;
  $("search-label").textContent = t("catalog.search", lang);
  $("catalog-search").placeholder = t("catalog.search.placeholder", lang);
  $("search-clear").setAttribute("aria-label", t("common.clear", lang));
  $("view-toggle").setAttribute("aria-label", t("catalog.view.label", lang));
  $("view-grid-btn").innerHTML = `${icons.grid} <span>${t("catalog.view.grid", lang)}</span>`;
  $("view-list-btn").innerHTML = `${icons.list} <span>${t("catalog.view.list", lang)}</span>`;

  const n = activeFilterCount();
  $("open-filters").innerHTML = `${icons.filter} <span>${t("catalog.filters.show", lang)}${n ? ` (${n})` : ""}</span>`;
}

function uniqueSortedSizes(products) {
  const map = new Map();
  for (const p of products) {
    const k = sizeKey(p);
    if (!map.has(k)) map.set(k, { key: k, area: (p.size?.w || 0) * (p.size?.h || 0), product: p });
  }
  return [...map.values()].sort((a, b) => b.area - a.area);
}

function renderFacets(counts, lang) {
  const wrap = $("facets-container");
  if (!wrap || !catalogue) return;

  const totalForCategory = Object.values(counts.category || {}).reduce((a, b) => a + b, 0);
  const sizes = uniqueSortedSizes(catalogue.products);

  wrap.innerHTML = `
    <div class="filter-group">
      <h3 class="filter-group__label">${t("catalog.filters.category", lang)}</h3>
      <div class="facet-list">
        <button type="button" class="facet-btn" data-facet="category" data-val="" aria-pressed="${!filters.category}">
          <span>${t("catalog.filters.all", lang)}</span>
          <span class="facet-btn__count">${totalForCategory}</span>
        </button>
        ${catalogue.categories.map((cat) => {
          const n = counts.category?.[cat.id] ?? 0;
          const active = filters.category === cat.id;
          return `
            <button type="button" class="facet-btn ${n === 0 ? "is-zero" : ""}" data-facet="category" data-val="${cat.id}" aria-pressed="${active}">
              <span>${loc(cat.name, lang)}</span>
              <span class="facet-btn__count">${n}</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>

    <div class="filter-group">
      <h3 class="filter-group__label">${t("catalog.filters.size", lang)}</h3>
      <div class="facet-chips">
        ${sizes.map(({ key, product }) => {
          const n = counts.sizes?.[key] ?? 0;
          const active = filters.sizes.includes(key);
          return `
            <button type="button" class="size-chip ${n === 0 ? "is-zero" : ""}" data-facet="sizes" data-val="${key}" aria-pressed="${active}">
              <span>${product.size.w}×${product.size.h}</span>
              <span class="facet-btn__count">${n}</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>

    <div class="filter-group">
      <h3 class="filter-group__label">${t("catalog.filters.surface", lang)}</h3>
      <div class="facet-list">
        ${catalogue.facets.surface.map((s) => {
          const n = counts.surfaces?.[s.id] ?? 0;
          const active = filters.surfaces.includes(s.id);
          return `
            <button type="button" class="facet-btn ${n === 0 ? "is-zero" : ""}" data-facet="surfaces" data-val="${s.id}" aria-pressed="${active}">
              <span>${loc(s.name, lang)}</span>
              <span class="facet-btn__count">${n}</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>

    <div class="filter-group">
      <h3 class="filter-group__label">${t("catalog.filters.color", lang)}</h3>
      <div class="facet-chips">
        ${catalogue.facets.color.map((c) => {
          const n = counts.colors?.[c.id] ?? 0;
          const active = filters.colors.includes(c.id);
          return `
            <button type="button" class="color-chip ${n === 0 ? "is-zero" : ""}" data-facet="colors" data-val="${c.id}" aria-pressed="${active}">
              <span class="color-chip__dot" style="background:${c.hex};"></span>
              <span>${loc(c.name, lang)}</span>
              <span class="facet-btn__count">${n}</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>

    <div class="filter-group">
      <h3 class="filter-group__label">${t("catalog.filters.use", lang)}</h3>
      <div class="facet-list">
        ${catalogue.facets.use.map((u) => {
          const n = counts.uses?.[u.id] ?? 0;
          const active = filters.uses.includes(u.id);
          return `
            <button type="button" class="facet-btn ${n === 0 ? "is-zero" : ""}" data-facet="uses" data-val="${u.id}" aria-pressed="${active}">
              <span>${loc(u.name, lang)}</span>
              <span class="facet-btn__count">${n}</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;

  wrap.querySelectorAll("[data-facet]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const facet = btn.getAttribute("data-facet");
      const val = btn.getAttribute("data-val");
      if (facet === "category") {
        filters.category = filters.category === val ? "" : val;
      } else {
        toggleArray(filters[facet], val);
      }
      syncUrl();
      renderAll(true);
    });
  });

  $("clear-filters-rail").hidden = !hasActiveFilters();
}

function renderActivePills(lang) {
  const bar = $("active-filters");
  if (!bar) return;
  const pills = [];

  if (filters.category) {
    pills.push({ label: categoryLabel(catalogue, filters.category, lang), remove: () => { filters.category = ""; } });
  }
  filters.sizes.forEach((s) => {
    pills.push({ label: `${s.replace("x", "×")} ${t("unit.cm", lang)}`, remove: () => toggleArray(filters.sizes, s) });
  });
  filters.surfaces.forEach((s) => {
    pills.push({ label: surfaceLabel(catalogue, s, lang), remove: () => toggleArray(filters.surfaces, s) });
  });
  filters.colors.forEach((c) => {
    pills.push({ label: loc(colorItem(catalogue, c).name, lang), remove: () => toggleArray(filters.colors, c) });
  });
  filters.uses.forEach((u) => {
    pills.push({ label: useLabel(catalogue, u, lang), remove: () => toggleArray(filters.uses, u) });
  });
  if (filters.q.trim()) {
    pills.push({
      label: `«${filters.q.trim()}»`,
      remove: () => {
        filters.q = "";
        $("catalog-search").value = "";
        $("search-clear").hidden = true;
      },
    });
  }

  bar.hidden = pills.length === 0;
  bar.innerHTML = "";
  if (!pills.length) return;

  pills.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "active-pill";
    btn.innerHTML = `<span>${p.label}</span> <span aria-hidden="true">×</span>`;
    btn.addEventListener("click", () => {
      p.remove();
      syncUrl();
      renderAll(true);
    });
    bar.appendChild(btn);
  });

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "btn btn--ghost btn--sm";
  reset.textContent = t("catalog.filters.clear", lang);
  reset.addEventListener("click", clearAllFilters);
  bar.appendChild(reset);
}

function buildProductCard(product, idx, total, lang) {
  const isLargeSlab = (Number(product.size?.w) >= 60 && Number(product.size?.h) >= 120) || (idx === 0 && total >= 4);
  const a = document.createElement("a");
  a.className = `tile-card${isLargeSlab ? " tile-card--wide" : ""}`;
  a.dataset.pid = product.id;
  a.href = pageUrl("mehsul/index.html", { id: product.id }, lang);

  const dims = tilePlateDimensions(product, isLargeSlab ? 216 : 168, isLargeSlab ? 204 : 180);

  const tray = document.createElement("div");
  tray.className = "tile-card__tray";

  const plate = document.createElement("div");
  plate.className = "tile-slab__plate";
  plate.style.width = `${dims.width}px`;
  plate.style.aspectRatio = `${product.size.w} / ${product.size.h}`;
  plate.style.setProperty("--tile-bg", primaryHex(catalogue, product));

  const img = document.createElement("img");
  img.width = dims.width;
  img.height = dims.height;
  mountTileImg(img, product, catalogue, {
    small: true,
    alt: `${loc(product.name, lang)} — ${sizeLabel(product, lang)}`,
  });

  plate.appendChild(img);
  tray.appendChild(plate);

  const body = document.createElement("div");
  body.className = "tile-card__body";

  const dots = (product.colors || []).slice(0, 4).map((cid) => {
    const c = colorItem(catalogue, cid);
    return `<i style="background:${c.hex};" title="${loc(c.name, lang)}"></i>`;
  }).join("");

  body.innerHTML = `
    <div class="tile-card__top">
      <h2 class="tile-card__name">${loc(product.name, lang)}</h2>
      <span class="tile-card__size">${sizeLabel(product, lang)}</span>
    </div>
    <div class="tile-card__sub">
      <span>${categoryLabel(catalogue, product.category, lang)} · ${surfaceLabel(catalogue, product.surface, lang)}</span>
      <span class="color-dots" aria-hidden="true">${dots}</span>
    </div>
    <p class="tile-card__desc">${loc(product.description, lang)}</p>
  `;

  a.append(tray, body);
  return a;
}

function renderEmptyState(grid, lang) {
  grid.classList.remove("is-list");
  grid.innerHTML = `
    <div class="catalog-empty" style="grid-column:1 / -1;">
      <svg class="catalog-empty__art" viewBox="0 0 88 88" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <rect x="6" y="6" width="34" height="34"/>
        <rect x="48" y="6" width="34" height="34"/>
        <rect x="6" y="48" width="34" height="34"/>
        <rect x="48" y="48" width="34" height="34" stroke-dasharray="4 4"/>
        <path d="M58 58l14 14M72 58L58 72"/>
      </svg>
      <h2 class="catalog-empty__title">${t("catalog.empty.title", lang)}</h2>
      <p class="catalog-empty__desc">${t("catalog.empty.description", lang)}</p>
      <button type="button" class="btn btn--ink" id="empty-clear-btn">${t("catalog.empty.action", lang)}</button>
    </div>
  `;
  grid.querySelector("#empty-clear-btn")?.addEventListener("click", clearAllFilters);
}

/**
 * Render filtered products with smooth FLIP (First, Last, Invert, Play) transitions.
 */
function renderGrid(items, lang, animateFlip = false) {
  const grid = $("catalog-grid");
  if (!grid) return;

  // FIRST: capture current screen rectangles of cards before DOM update
  const firstRects = new Map();
  if (animateFlip && !reducedMotion) {
    grid.querySelectorAll("[data-pid]").forEach((el) => {
      firstRects.set(el.dataset.pid, el.getBoundingClientRect());
    });
  }

  if (!items.length) {
    renderEmptyState(grid, lang);
    return;
  }

  grid.classList.toggle("is-list", viewMode === "list");
  const frag = document.createDocumentFragment();
  const newCards = [];
  items.forEach((p, idx) => {
    const card = buildProductCard(p, idx, items.length, lang);
    frag.appendChild(card);
    newCards.push(card);
  });

  grid.innerHTML = "";
  grid.appendChild(frag);

  // LAST + INVERT + PLAY
  if (animateFlip && !reducedMotion && firstRects.size > 0) {
    newCards.forEach((el) => {
      const prev = firstRects.get(el.dataset.pid);
      const next = el.getBoundingClientRect();
      if (prev) {
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        const sx = prev.width / Math.max(1, next.width);
        const sy = prev.height / Math.max(1, next.height);
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || Math.abs(sx - 1) > 0.02) {
          el.style.transition = "none";
          el.style.transformOrigin = "top left";
          el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.transition = "transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)";
              el.style.transform = "";
              el.addEventListener("transitionend", () => {
                el.style.transition = "";
                el.style.transformOrigin = "";
              }, { once: true });
            });
          });
        }
      } else {
        el.style.opacity = "0";
        el.style.transform = "translateY(10px)";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = "opacity 0.32s ease, transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)";
            el.style.opacity = "1";
            el.style.transform = "";
          });
        });
      }
    });
  }
}

function renderAll(animateFlip = false) {
  if (!catalogue) return;
  const lang = getLang();
  const filtered = filterProducts(catalogue.products, filters, lang);
  const counts = facetCounts(catalogue.products, filters, lang);

  $("result-count").textContent = tf("catalog.results.count", { count: filtered.length }, lang);
  renderStaticCopy(lang);
  renderFacets(counts, lang);
  renderActivePills(lang);
  renderGrid(filtered, lang, animateFlip);
}

async function boot() {
  readInitialUrl();

  initShell({
    active: "catalog",
    titleKey: "catalog.title",
    descKey: "catalog.description",
    onLangChange: () => renderAll(false),
  });

  const searchInput = $("catalog-search");
  const searchClear = $("search-clear");
  searchInput.value = filters.q;
  searchClear.hidden = !filters.q;

  searchInput.addEventListener("input", () => {
    filters.q = searchInput.value;
    searchClear.hidden = !filters.q;
    syncUrl();
    renderAll(true);
  });

  searchClear.addEventListener("click", () => {
    filters.q = "";
    searchInput.value = "";
    searchClear.hidden = true;
    searchInput.focus();
    syncUrl();
    renderAll(true);
  });

  $("clear-filters-rail").addEventListener("click", clearAllFilters);
  $("clear-filters-drawer").addEventListener("click", clearAllFilters);

  const rail = $("filter-rail");
  const setDrawer = (open) => {
    rail.classList.toggle("is-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  };
  $("open-filters").addEventListener("click", () => setDrawer(true));
  $("close-filters").addEventListener("click", () => setDrawer(false));
  $("apply-filters-drawer").addEventListener("click", () => setDrawer(false));

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-view");
      if (next === viewMode) return;
      viewMode = next;
      document.querySelectorAll("[data-view]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === viewMode));
      });
      renderAll(true);
    });
  });

  renderStaticCopy(getLang());

  try {
    catalogue = await loadCatalogueData();
  } catch (err) {
    console.error(err);
    $("catalog-grid").innerHTML = `<p style="padding:24px;">${t("common.loadError", getLang())}</p>`;
    return;
  }

  renderAll(false);
}

boot();
