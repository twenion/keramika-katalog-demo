import { getLang, t } from "../core/i18n.js";
import { sizeLabel } from "../core/catalog.js";
import {
  loadProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  resetOverlay,
  exportJSON,
  validateProduct,
} from "../core/store.js";
import { readXlsx, rowsToProducts } from "../core/xlsx.js";
import { initShell, icons } from "./shell.js";
import {
  loadMeta,
  loc,
  tf,
  pageUrl,
  categoryLabel,
  surfaceLabel,
  primaryHex,
} from "./data.js";
import { mountTileImg } from "./textures.js";

const $ = (id) => document.getElementById(id);

let meta = null;
let products = [];
let editingId = null; // null = creating new, string = editing existing
let formImageData = "";
let excelPreviewState = null; // { filename, readyProducts, rowsSummary, errorCount }

function showStatus(message, { isError = false, catalogLink = false } = {}) {
  const el = $("admin-status");
  if (!el) return;
  el.hidden = false;
  el.classList.toggle("admin-status--error", isError);
  const lang = getLang();
  el.innerHTML = `
    <span>${message}</span>
    ${catalogLink ? `<a class="btn btn--outline btn--sm" href="${pageUrl("katalog/index.html", {}, lang)}">${t("home.hero.cta", lang)} ${icons.arrowRight}</a>` : ""}
  `;
}

function clearStatus() {
  const el = $("admin-status");
  if (el) el.hidden = true;
}

function renderStaticCopy(lang) {
  document.title = `${t("admin.title", lang)} — ${t("site.name", lang)}`;
  $("admin-notice").textContent = t("admin.notice", lang);
  $("admin-eyebrow").textContent = `${t("site.name", lang)} · ${t("nav.admin", lang)}`;
  $("admin-title").textContent = t("admin.title", lang);
  $("btn-new-product").textContent = t("admin.add", lang);
  $("btn-export-json").innerHTML = `${icons.download} <span>${t("admin.export", lang)}</span>`;
  $("btn-reset-overlay").textContent = t("admin.reset", lang);

  $("excel-title").textContent = t("admin.excel.title", lang);
  $("excel-drop-icon").innerHTML = icons.upload;
  $("excel-drop-text").textContent = t("admin.excel.drop", lang);
  $("excel-choose-btn").textContent = t("admin.excel.choose", lang);
  $("excel-sample-link").innerHTML = `${icons.download} <span>${t("admin.excel.download", lang)}</span>`;
  $("excel-sample-link-2").innerHTML = `${icons.download} <span>${t("admin.excel.download", lang)}</span>`;

  $("form-close-btn").textContent = t("common.close", lang);
  $("products-list-title").textContent = t("admin.products.title", lang);
}

function downscaleImageFile(file, maxDim = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        let url = canvas.toDataURL("image/webp", 0.82);
        if (!url.startsWith("data:image/webp")) {
          url = canvas.toDataURL("image/jpeg", 0.82);
        }
        resolve(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderProductsTable(lang) {
  const wrap = $("products-table-wrap");
  $("admin-count").textContent = tf("catalog.results.count", { count: products.length }, lang);

  if (!products.length) {
    wrap.innerHTML = `<p style="color:var(--muted);padding:12px 0;">${t("admin.products.empty", lang)}</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>${t("admin.table.product", lang)}</th>
            <th>${t("product.specs.category", lang)}</th>
            <th>${t("product.specs.size", lang)}</th>
            <th>${t("product.specs.surface", lang)}</th>
            <th>${t("admin.table.actions", lang)}</th>
          </tr>
        </thead>
        <tbody id="products-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = $("products-tbody");
  products.forEach((p) => {
    const tr = document.createElement("tr");
    const detailHref = pageUrl("mehsul/index.html", { id: p.id }, lang);

    tr.innerHTML = `
      <td>
        <div class="table-prod">
          <div class="table-thumb" style="background:${primaryHex(meta, p)};">
            <img width="48" height="48" alt="${loc(p.name, lang)}">
          </div>
          <div>
            <a class="table-prod__name" href="${detailHref}">${loc(p.name, lang)}</a>
            <div class="table-prod__id">${p.id}</div>
          </div>
        </div>
      </td>
      <td>${categoryLabel(meta, p.category, lang)}</td>
      <td class="tabular">${sizeLabel(p, lang)}</td>
      <td>${surfaceLabel(meta, p.surface, lang)}</td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn btn--outline btn--sm" data-edit="${p.id}">${t("admin.edit", lang)}</button>
          <button type="button" class="btn btn--danger btn--sm" data-del="${p.id}">${t("admin.delete", lang)}</button>
        </div>
      </td>
    `;

    mountTileImg(tr.querySelector("img"), p, meta, { small: true, alt: loc(p.name, lang) });
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = products.find((item) => item.id === btn.getAttribute("data-edit"));
      if (p) openProductForm(p);
    });
  });

  tbody.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      const p = products.find((item) => item.id === id);
      if (!p) return;
      const msg = tf("admin.delete.confirm", { name: loc(p.name, lang) }, lang);
      if (!window.confirm(msg)) return;
      try {
        deleteProduct(id);
        products = await loadProducts();
        renderProductsTable(getLang());
        showStatus(t("admin.status.deleted", getLang()));
      } catch {
        showStatus(t("admin.status.storageError", getLang()), { isError: true });
      }
    });
  });
}

function openProductForm(existing = null) {
  const lang = getLang();
  editingId = existing ? existing.id : null;
  formImageData = existing?.image || "";

  const section = $("form-section");
  section.hidden = false;
  $("form-title").textContent = existing ? t("admin.form.editTitle", lang) : t("admin.add", lang);

  const p = existing || {
    id: "",
    category: "doseme",
    name: { az: "", ru: "", en: "" },
    size: { w: 60, h: 60, unit: "cm" },
    thickness_mm: 9,
    surface: "matt",
    colors: ["boz"],
    use: ["doseme"],
    material: { az: "Porselen qranit", ru: "Керамогранит", en: "Porcelain stoneware" },
    pieces_per_box: 4,
    m2_per_box: 1.44,
    description: { az: "", ru: "", en: "" },
    featured: false,
  };

  const form = $("product-form");
  form.innerHTML = `
    <div class="form-grid">
      <div class="field-group">
        <label class="field-label" for="f-id">${t("admin.form.id", lang)} *</label>
        <input class="input" id="f-id" name="id" value="${p.id}" ${existing ? "disabled" : ""} placeholder="baki-das-boz" required>
        <span class="field-hint">${t("admin.form.idHint", lang)}</span>
        <span class="field-error" data-err="id"></span>
      </div>

      <div class="field-group">
        <label class="field-label" for="f-category">${t("admin.form.category", lang)} *</label>
        <select class="input" id="f-category" name="category">
          ${meta.categories.map((c) => `<option value="${c.id}" ${c.id === p.category ? "selected" : ""}>${loc(c.name, lang)}</option>`).join("")}
        </select>
        <span class="field-error" data-err="category"></span>
      </div>

      <div class="field-group">
        <label class="field-label" for="f-surface">${t("admin.form.surface", lang)}</label>
        <select class="input" id="f-surface" name="surface">
          ${meta.facets.surface.map((s) => `<option value="${s.id}" ${s.id === p.surface ? "selected" : ""}>${loc(s.name, lang)}</option>`).join("")}
        </select>
      </div>

      <div class="field-group">
        <label class="field-label" for="f-name-az">${t("admin.form.name", lang)} (AZ) *</label>
        <input class="input" id="f-name-az" name="name_az" value="${p.name?.az || ""}" required>
        <span class="field-error" data-err="name.az"></span>
      </div>

      <div class="field-group">
        <label class="field-label" for="f-name-ru">${t("admin.form.name", lang)} (RU)</label>
        <input class="input" id="f-name-ru" name="name_ru" value="${p.name?.ru || ""}">
      </div>

      <div class="field-group">
        <label class="field-label" for="f-name-en">${t("admin.form.name", lang)} (EN)</label>
        <input class="input" id="f-name-en" name="name_en" value="${p.name?.en || ""}">
      </div>

      <div class="field-group">
        <label class="field-label" for="f-w">${t("admin.form.width", lang)} *</label>
        <input class="input" id="f-w" name="w" type="number" step="0.5" min="1" value="${p.size?.w ?? ""}" required>
        <span class="field-error" data-err="size.w"></span>
      </div>

      <div class="field-group">
        <label class="field-label" for="f-h">${t("admin.form.height", lang)} *</label>
        <input class="input" id="f-h" name="h" type="number" step="0.5" min="1" value="${p.size?.h ?? ""}" required>
        <span class="field-error" data-err="size.h"></span>
      </div>

      <div class="field-group">
        <label class="field-label" for="f-thick">${t("admin.form.thickness", lang)}</label>
        <input class="input" id="f-thick" name="thickness" type="number" step="0.5" min="1" value="${p.thickness_mm ?? 9}">
      </div>

      <div class="field-group">
        <label class="field-label" for="f-pcs">${t("admin.form.piecesPerBox", lang)}</label>
        <input class="input" id="f-pcs" name="pieces" type="number" step="1" min="1" value="${p.pieces_per_box ?? 4}">
      </div>

      <div class="field-group">
        <label class="field-label" for="f-m2">${t("admin.form.m2PerBox", lang)}</label>
        <input class="input" id="f-m2" name="m2" type="number" step="0.01" min="0.01" value="${p.m2_per_box ?? 1.44}">
      </div>

      <div class="field-group">
        <label class="field-label" for="f-mat">${t("admin.form.material", lang)}</label>
        <input class="input" id="f-mat" name="material" value="${p.material?.az || ""}">
      </div>

      <div class="field-group form-span-all">
        <span class="field-label">${t("admin.form.colors", lang)}</span>
        <div class="check-grid">
          ${meta.facets.color.map((c) => `
            <label class="check-chip">
              <input type="checkbox" name="colors" value="${c.id}" ${(p.colors || []).includes(c.id) ? "checked" : ""}>
              <span class="color-chip__dot" style="background:${c.hex};"></span>
              <span>${loc(c.name, lang)}</span>
            </label>
          `).join("")}
        </div>
      </div>

      <div class="field-group form-span-all">
        <span class="field-label">${t("admin.form.uses", lang)}</span>
        <div class="check-grid">
          ${meta.facets.use.map((u) => `
            <label class="check-chip">
              <input type="checkbox" name="uses" value="${u.id}" ${(p.use || []).includes(u.id) ? "checked" : ""}>
              <span>${loc(u.name, lang)}</span>
            </label>
          `).join("")}
        </div>
      </div>

      <div class="field-group form-span-all">
        <span class="field-label">${t("admin.form.image", lang)}</span>
        <div class="img-upload-box">
          <div class="img-upload-preview" id="f-img-preview"></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
            <label class="btn btn--outline btn--sm" for="f-img-input">${t("admin.form.imageUpload", lang)}</label>
            <input class="sr-only" id="f-img-input" type="file" accept="image/*">
            <button type="button" class="btn btn--ghost btn--sm" id="f-img-remove">${t("admin.form.imageRemove", lang)}</button>
            <span class="field-error" id="f-img-err"></span>
          </div>
        </div>
      </div>

      <div class="field-group">
        <label class="field-label" for="f-desc-az">${t("admin.form.description", lang)} (AZ)</label>
        <textarea class="input" id="f-desc-az" name="desc_az">${p.description?.az || ""}</textarea>
      </div>

      <div class="field-group">
        <label class="field-label" for="f-desc-ru">${t("admin.form.description", lang)} (RU)</label>
        <textarea class="input" id="f-desc-ru" name="desc_ru">${p.description?.ru || ""}</textarea>
      </div>

      <div class="field-group">
        <label class="field-label" for="f-desc-en">${t("admin.form.description", lang)} (EN)</label>
        <textarea class="input" id="f-desc-en" name="desc_en">${p.description?.en || ""}</textarea>
      </div>

      <div class="field-group form-span-all">
        <label class="check-chip" style="width:fit-content;">
          <input type="checkbox" id="f-featured" name="featured" ${p.featured ? "checked" : ""}>
          <span>${t("admin.form.featured", lang)}</span>
        </label>
      </div>
    </div>

    <div style="margin-top:20px;display:flex;flex-wrap:wrap;gap:10px;">
      <button type="submit" class="btn btn--primary">${t("admin.save", lang)}</button>
      <button type="button" class="btn btn--outline" id="f-cancel-btn">${t("admin.cancel", lang)}</button>
    </div>
  `;

  const updateImgPreview = () => {
    const box = $("f-img-preview");
    box.innerHTML = "";
    if (formImageData) {
      const img = document.createElement("img");
      mountTileImg(img, { ...p, image: formImageData }, meta, { small: true, alt: p.name?.az || "" });
      box.appendChild(img);
    } else {
      box.textContent = "—";
    }
  };
  updateImgPreview();

  $("f-img-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    $("f-img-err").textContent = "";
    try {
      formImageData = await downscaleImageFile(file);
      updateImgPreview();
    } catch {
      $("f-img-err").textContent = t("admin.form.imageError", getLang());
    }
  });

  $("f-img-remove").addEventListener("click", () => {
    formImageData = "";
    updateImgPreview();
  });

  $("f-cancel-btn").addEventListener("click", () => {
    section.hidden = true;
    editingId = null;
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const curLang = getLang();
    form.querySelectorAll("[data-err]").forEach((el) => { el.textContent = ""; });

    const idVal = editingId || $("f-id").value.trim().toLowerCase();
    const nameAz = $("f-name-az").value.trim();
    const nameRu = $("f-name-ru").value.trim() || nameAz;
    const nameEn = $("f-name-en").value.trim() || nameAz;
    const w = Number($("f-w").value);
    const h = Number($("f-h").value);
    const thickness_mm = Number($("f-thick").value) || 9;
    const pieces_per_box = Number($("f-pcs").value) || 1;
    const m2_per_box = Number($("f-m2").value) || Number(((w * h / 10000) * pieces_per_box).toFixed(2)) || 1;
    const matAz = $("f-mat").value.trim() || "Keramika";
    const colors = [...form.querySelectorAll('input[name="colors"]:checked')].map((i) => i.value);
    const use = [...form.querySelectorAll('input[name="uses"]:checked')].map((i) => i.value);
    const descAz = $("f-desc-az").value.trim();
    const descRu = $("f-desc-ru").value.trim() || descAz;
    const descEn = $("f-desc-en").value.trim() || descAz;

    const payload = {
      id: idVal,
      category: $("f-category").value,
      name: { az: nameAz, ru: nameRu, en: nameEn },
      size: { w, h, unit: "cm" },
      thickness_mm,
      surface: $("f-surface").value,
      colors: colors.length ? colors : ["boz"],
      use: use.length ? use : ["doseme"],
      material: { az: matAz, ru: matAz, en: matAz },
      pieces_per_box,
      m2_per_box,
      image: formImageData || "",
      description: { az: descAz, ru: descRu, en: descEn },
      featured: $("f-featured").checked,
    };

    try {
      const res = editingId ? updateProduct(editingId, payload) : addProduct(payload);
      if (!res.ok) {
        res.errors.forEach((err) => {
          const slot = form.querySelector(`[data-err="${err.field}"]`);
          if (slot) slot.textContent = t(`validation.${err.code}`, curLang);
        });
        return;
      }
      products = await loadProducts();
      renderProductsTable(curLang);
      section.hidden = true;
      showStatus(
        editingId ? t("admin.status.saved", curLang) : t("admin.status.added", curLang),
        { catalogLink: true },
      );
      editingId = null;
    } catch {
      showStatus(t("admin.status.storageError", curLang), { isError: true });
    }
  };

  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ==========================================================================
   Excel Drag & Drop + Validation Preview Table
   ========================================================================== */

function renderExcelPreview() {
  const wrap = $("excel-preview");
  if (!wrap) return;
  const lang = getLang();

  if (!excelPreviewState) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }

  wrap.hidden = false;
  const { filename, readyProducts, rowsSummary, errorCount } = excelPreviewState;

  wrap.innerHTML = `
    <div class="excel-summary">
      <div>
        <h3 style="font-family:var(--font-display);font-size:20px;font-weight:500;">${t("admin.excel.preview", lang)} — ${filename}</h3>
        <div class="excel-badges" style="margin-top:8px;">
          <span class="badge badge--ok">${tf("admin.excel.readyCount", { count: readyProducts.length }, lang)}</span>
          ${errorCount > 0 ? `<span class="badge badge--err">${tf("admin.excel.errorCount", { count: errorCount }, lang)}</span>` : ""}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn btn--primary" id="excel-commit-btn" ${readyProducts.length === 0 ? "disabled" : ""}>${t("admin.excel.add", lang)} (${readyProducts.length})</button>
        <button type="button" class="btn btn--outline" id="excel-clear-btn">${t("common.cancel", lang)}</button>
      </div>
    </div>

    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>${t("admin.excel.row", lang)}</th>
            <th>${t("admin.form.id", lang)}</th>
            <th>${t("admin.form.name", lang)}</th>
            <th>${t("product.specs.category", lang)}</th>
            <th>${t("product.specs.size", lang)}</th>
            <th>${t("admin.excel.status", lang)}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsSummary.map((r) => `
            <tr class="${r.errors.length ? "is-error" : ""}">
              <td class="tabular">${r.rowNum}</td>
              <td class="table-prod__id">${r.id || "—"}</td>
              <td>${r.name || "—"}</td>
              <td>${r.category || "—"}</td>
              <td class="tabular">${r.size || "—"}</td>
              <td>
                ${r.errors.length === 0
                  ? `<span class="badge badge--ok">${t("admin.excel.valid", lang)}</span>`
                  : r.errors.map((e) => `<div><strong>${e.field}</strong>: ${t(`validation.${e.code}`, lang)}</div>`).join("")}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  $("excel-clear-btn").addEventListener("click", () => {
    excelPreviewState = null;
    $("excel-file-input").value = "";
    renderExcelPreview();
  });

  $("excel-commit-btn").addEventListener("click", async () => {
    const curLang = getLang();
    let added = 0;
    try {
      for (const prod of readyProducts) {
        const res = addProduct(prod);
        if (res.ok) added++;
      }
      products = await loadProducts();
      renderProductsTable(curLang);
      excelPreviewState = null;
      $("excel-file-input").value = "";
      renderExcelPreview();
      showStatus(tf("admin.excel.success", { count: added }, curLang), { catalogLink: true });
    } catch {
      showStatus(t("admin.status.storageError", curLang), { isError: true });
    }
  });
}

async function handleExcelFile(file) {
  const lang = getLang();
  clearStatus();
  const wrap = $("excel-preview");
  wrap.hidden = false;
  wrap.innerHTML = `<p style="color:var(--muted);">${t("admin.excel.reading", lang)}</p>`;

  try {
    const buf = await file.arrayBuffer();
    const rows = await readXlsx(buf);
    if (!rows.length) {
      excelPreviewState = null;
      wrap.hidden = true;
      showStatus(t("admin.excel.empty", lang), { isError: true });
      return;
    }

    const { products: parsedProducts, errors: rawErrors } = rowsToProducts(rows);

    // Header mismatch error
    if (rawErrors.length === 1 && rawErrors[0].field === "header") {
      excelPreviewState = {
        filename: file.name,
        readyProducts: [],
        rowsSummary: [{ rowNum: 1, id: "—", name: "—", category: "—", size: "—", errors: rawErrors }],
        errorCount: 1,
      };
      renderExcelPreview();
      return;
    }

    // Group row errors by row number (rows in sheet start at row 2)
    const errMap = new Map();
    for (const err of rawErrors) {
      if (!errMap.has(err.row)) errMap.set(err.row, []);
      errMap.get(err.row).push(err);
    }

    const readyProducts = [];
    const rowsSummary = [];
    const validById = new Map(parsedProducts.map((p) => [p.id, p]));
    let totalErrCount = rawErrors.length;

    rows.forEach((rawRow, idx) => {
      const rowNum = idx + 2;
      const rowErrs = [...(errMap.get(rowNum) || [])];
      const id = String(rawRow.id ?? "").trim();
      const candidate = validById.get(id);

      // Also check against live store (duplicate ID with already existing catalog products)
      if (rowErrs.length === 0 && candidate) {
        const storeCheck = validateProduct(candidate);
        if (!storeCheck.ok) {
          storeCheck.errors.forEach((e) => {
            rowErrs.push({ row: rowNum, field: e.field, code: e.code });
            totalErrCount++;
          });
        } else {
          readyProducts.push(candidate);
        }
      }

      rowsSummary.push({
        rowNum,
        id,
        name: String(rawRow.ad_az ?? rawRow.ad_ru ?? rawRow.ad_en ?? "").trim(),
        category: String(rawRow.kateqoriya ?? "").trim(),
        size: rawRow.en_sm && rawRow.uzunluq_sm ? `${rawRow.en_sm}×${rawRow.uzunluq_sm}` : "",
        errors: rowErrs,
      });
    });

    excelPreviewState = {
      filename: file.name,
      readyProducts,
      rowsSummary,
      errorCount: totalErrCount,
    };
    renderExcelPreview();
  } catch {
    excelPreviewState = null;
    wrap.hidden = true;
    showStatus(t("admin.excel.readError", lang), { isError: true });
  }
}

async function boot() {
  initShell({
    active: "admin",
    titleKey: "admin.title",
    onLangChange: (lang) => {
      renderStaticCopy(lang);
      renderProductsTable(lang);
      renderExcelPreview();
      if (!$("form-section").hidden) {
        const current = editingId ? products.find((p) => p.id === editingId) : null;
        openProductForm(current);
      }
    },
  });

  renderStaticCopy(getLang());

  try {
    [meta, products] = await Promise.all([loadMeta(), loadProducts()]);
  } catch (err) {
    console.error(err);
    showStatus(t("common.loadError", getLang()), { isError: true });
    return;
  }

  renderProductsTable(getLang());

  $("btn-new-product").addEventListener("click", () => {
    clearStatus();
    openProductForm(null);
  });

  $("form-close-btn").addEventListener("click", () => {
    $("form-section").hidden = true;
    editingId = null;
  });

  $("btn-export-json").addEventListener("click", () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "seth-products.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $("btn-reset-overlay").addEventListener("click", async () => {
    const lang = getLang();
    if (!window.confirm(t("admin.reset.confirm", lang))) return;
    resetOverlay();
    products = await loadProducts();
    renderProductsTable(lang);
    showStatus(t("admin.status.reset", lang));
  });

  // Excel drag-and-drop & file chooser
  const dropZone = $("excel-drop-zone");
  const fileInput = $("excel-file-input");

  ["dragenter", "dragover"].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove("is-dragover");
    });
  });
  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleExcelFile(file);
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) handleExcelFile(file);
  });
}

boot();
