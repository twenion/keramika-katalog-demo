import { getLang, t } from "../core/i18n.js";
import { boxesFor, sizeLabel } from "../core/catalog.js";
import { loc, pageUrl } from "./data.js";
import { getTileDrawable } from "./textures.js";

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Scroll-linked architectural sequence: "Bir kafeldən otağa"
 * 0.00 -> 0.33: Single tile with physical dimension callouts
 * 0.33 -> 0.66: Zoom out to exact 1 m × 1 m calibrated frame
 * 0.66 -> 1.00: Full room surface with live m² -> boxes (+10% reserve) calculation
 */
export function initScrollRoom({ trackEl, canvas, badgeEl, pickerEl, stepsEl, rangeEl, areaValEl, boxesValEl, totalValEl, openTileEl, fillEl, products, meta }) {
  const ctx = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sampleIds = ["qobustan-boz", "buta", "palid-taxta"];
  const samples = sampleIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);
  if (!samples.length && products.length) samples.push(products[0]);

  let currentTile = samples[0];
  let drawable = null;
  let scrollProgress = reducedMotion ? 1 : 0;
  let manualArea = null; // null = linked to scroll in stage 3, number = user moved slider

  function loadCurrentDrawable() {
    if (!currentTile) return;
    getTileDrawable(currentTile, meta, { small: false }).then((img) => {
      drawable = img;
      draw();
    });
  }

  function currentArea() {
    if (manualArea !== null) return manualArea;
    if (scrollProgress < 0.33) {
      const tileM2 = (currentTile.size.w * currentTile.size.h) / 10000;
      return Number(tileM2.toFixed(2));
    }
    if (scrollProgress < 0.66) return 1;
    const p3 = clamp01((scrollProgress - 0.66) / 0.34);
    return Math.round(lerp(1, 24, p3));
  }

  function updateReadout() {
    if (!currentTile) return;
    const lang = getLang();
    const area = currentArea();
    const calc = boxesFor(currentTile, area);
    const unitM2 = t("unit.m2", lang);

    if (rangeEl) rangeEl.value = String(Math.max(1, Math.min(60, Math.round(area))));
    if (areaValEl) areaValEl.textContent = `${area} ${unitM2}`;
    if (boxesValEl) boxesValEl.textContent = String(calc.boxes);
    if (totalValEl) totalValEl.textContent = `${calc.m2Total.toFixed(2)} ${unitM2}`;
    if (openTileEl) {
      openTileEl.href = pageUrl("mehsul/index.html", { id: currentTile.id }, lang);
      openTileEl.textContent = t("visualizer.title", lang);
    }

    const stageIdx = scrollProgress < 0.33 ? 0 : scrollProgress < 0.66 ? 1 : 2;
    stepsEl?.querySelectorAll("[data-step]").forEach((btn) => {
      btn.classList.toggle("is-active", Number(btn.getAttribute("data-step")) === stageIdx);
    });

    if (fillEl) fillEl.style.width = `${Math.round(scrollProgress * 100)}%`;

    if (badgeEl) {
      const stageKeys = ["home.sequence.tile", "home.sequence.squareMetre", "home.sequence.surface"];
      badgeEl.textContent = `${t(stageKeys[stageIdx], lang)} · ${loc(currentTile.name, lang)} (${sizeLabel(currentTile, lang)})`;
    }
  }

  function renderPicker() {
    const lang = getLang();
    if (!pickerEl) return;
    pickerEl.innerHTML = samples.map((p) => `
      <button type="button" class="seq-tile-btn" data-tile-id="${p.id}" aria-pressed="${p.id === currentTile?.id}">
        ${loc(p.name, lang)} · ${p.size.w}×${p.size.h}
      </button>
    `).join("");

    pickerEl.querySelectorAll("[data-tile-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = samples.find((s) => s.id === btn.getAttribute("data-tile-id"));
        if (!next) return;
        currentTile = next;
        renderPicker();
        loadCurrentDrawable();
        updateReadout();
      });
    });
  }

  function draw() {
    if (!currentTile) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(280, Math.round(rect.width * dpr));
    const H = Math.max(260, Math.round(rect.height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    // Dark architectural blueprint / drafting stage
    ctx.fillStyle = "#1E1C1A";
    ctx.fillRect(0, 0, W, H);

    // Subtle 10cm drafting grid
    ctx.strokeStyle = "rgba(242, 238, 231, 0.045)";
    ctx.lineWidth = 1;
    const gridPx = Math.max(20, W / 24);
    for (let x = gridPx; x < W; x += gridPx) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = gridPx; y < H; y += gridPx) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const wM = currentTile.size.w / 100;
    const hM = currentTile.size.h / 100;
    const aspect = wM / hM;

    // Cover-crop source rectangle from 1:1 tile texture so rectangular tiles never squash grain
    const drawTileCover = (x, y, dw, dh, variant = 0.5) => {
      if (!drawable) {
        ctx.fillStyle = "#9C9488";
        ctx.fillRect(x, y, dw, dh);
        return;
      }
      const iw = drawable.naturalWidth || drawable.width || 256;
      const ih = drawable.naturalHeight || drawable.height || 256;
      const imgRatio = iw / ih;
      let sx = 0, sy = 0, sw = iw, sh = ih;
      if (aspect < imgRatio * 0.99) {
        sw = ih * aspect;
        sx = (iw - sw) * variant;
      } else if (aspect > imgRatio * 1.01) {
        sh = iw / aspect;
        sy = (ih - sh) * variant;
      }
      ctx.drawImage(drawable, sx, sy, sw, sh, x, y, dw, dh);
    };

    // Continuous uniform zoom scale (pixels per metre) driven by scrollProgress — never squashes aspect ratio
    const pxPerM_stage1 = Math.min((W * 0.62) / wM, (H * 0.58) / hM);
    const pxPerM_stage2 = Math.min(W, H) * 0.56; // 1m × 1m fills 56% of frame
    const pxPerM_stage3 = Math.min(W, H) * 0.19; // ~4.5m × 3m room

    let pxPerM;
    if (scrollProgress <= 0.5) {
      pxPerM = lerp(pxPerM_stage1, pxPerM_stage2, clamp01(scrollProgress / 0.5));
    } else {
      pxPerM = lerp(pxPerM_stage2, pxPerM_stage3, clamp01((scrollProgress - 0.5) / 0.5));
    }

    const tileWpx = wM * pxPerM;
    const tileHpx = hM * pxPerM;
    const groutPx = Math.max(1.2, pxPerM * 0.006);

    const cx = W * 0.5;
    const cy = H * 0.5;

    // How many neighbor rings have slid in
    const fieldReveal = clamp01((scrollProgress - 0.16) / 0.62);
    const cols = Math.ceil((W * 0.65) / Math.max(8, tileWpx)) + 1;
    const rows = Math.ceil((H * 0.65) / Math.max(8, tileHpx)) + 1;

    // Stage 3 room overlay progress (keep true orthogonal architectural plan — zero Y-squash)
    const roomReveal = clamp01((scrollProgress - 0.66) / 0.34);

    ctx.save();
    ctx.translate(cx, cy);

    // Draw surrounding tiles as fieldReveal grows
    if (fieldReveal > 0.01) {
      for (let r = -rows; r <= rows; r++) {
        for (let c = -cols; c <= cols; c++) {
          if (r === 0 && c === 0) continue;
          const dist = Math.hypot(c * wM, r * hM);
          const appear = clamp01((fieldReveal * 3.8 - dist * 0.85) * 1.4);
          if (appear <= 0) continue;

          const x = c * (tileWpx + groutPx) - tileWpx * 0.5;
          const y = r * (tileHpx + groutPx) - tileHpx * 0.5;
          const variant = ((Math.abs(c * 29 + r * 13) % 11) + 0.5) / 11;
          ctx.save();
          ctx.globalAlpha = appear * (0.45 + 0.55 * fieldReveal);
          drawTileCover(x, y, tileWpx, tileHpx, variant);
          ctx.strokeStyle = "rgba(230, 224, 213, 0.42)";
          ctx.lineWidth = Math.max(1, groutPx * 0.8);
          ctx.strokeRect(x, y, tileWpx, tileHpx);
          ctx.restore();
        }
      }
    }

    // Draw central hero tile crisp and prominent
    const x0 = -tileWpx * 0.5;
    const y0 = -tileHpx * 0.5;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.42)";
    ctx.shadowBlur = lerp(24, 4, fieldReveal);
    ctx.shadowOffsetY = lerp(10, 2, fieldReveal);
    drawTileCover(x0, y0, tileWpx, tileHpx, 0.5);
    ctx.restore();

    // Accent border on single hero tile
    ctx.strokeStyle = "#E09779";
    ctx.lineWidth = Math.max(1.5, dpr * 1.5);
    ctx.strokeRect(x0, y0, tileWpx, tileHpx);

    // Stage 1 architectural dimension ticks around the single tile
    const dimAlpha = 1 - clamp01((scrollProgress - 0.18) / 0.18);
    if (dimAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = dimAlpha;
      ctx.strokeStyle = "#E09779";
      ctx.fillStyle = "#F2EEE7";
      ctx.lineWidth = Math.max(1, dpr);
      ctx.font = `600 ${Math.round(12 * dpr)}px "Source Sans 3", sans-serif`;
      ctx.textAlign = "center";

      const tickOff = 18 * dpr;
      // Top width ruler
      ctx.beginPath();
      ctx.moveTo(x0, y0 - tickOff);
      ctx.lineTo(x0 + tileWpx, y0 - tickOff);
      ctx.moveTo(x0, y0 - tickOff - 5 * dpr); ctx.lineTo(x0, y0 - tickOff + 5 * dpr);
      ctx.moveTo(x0 + tileWpx, y0 - tickOff - 5 * dpr); ctx.lineTo(x0 + tileWpx, y0 - tickOff + 5 * dpr);
      ctx.stroke();
      ctx.fillText(`${currentTile.size.w} ${t("unit.cm", getLang())}`, 0, y0 - tickOff - 8 * dpr);

      // Right height ruler
      ctx.beginPath();
      ctx.moveTo(x0 + tileWpx + tickOff, y0);
      ctx.lineTo(x0 + tileWpx + tickOff, y0 + tileHpx);
      ctx.moveTo(x0 + tileWpx + tickOff - 5 * dpr, y0); ctx.lineTo(x0 + tileWpx + tickOff + 5 * dpr, y0);
      ctx.moveTo(x0 + tileWpx + tickOff - 5 * dpr, y0 + tileHpx); ctx.lineTo(x0 + tileWpx + tickOff + 5 * dpr, y0 + tileHpx);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillText(`${currentTile.size.h} ${t("unit.cm", getLang())}`, x0 + tileWpx + tickOff + 8 * dpr, 4 * dpr);
      ctx.restore();
    }

    // Stage 2 calibrated 1m × 1m Oxide Frame
    const frameAlpha = clamp01((scrollProgress - 0.28) / 0.16) * (1 - clamp01((scrollProgress - 0.72) / 0.22));
    if (frameAlpha > 0.02) {
      const mPx = pxPerM;
      ctx.save();
      ctx.globalAlpha = frameAlpha;
      ctx.strokeStyle = "#E09779";
      ctx.lineWidth = Math.max(2, 2.2 * dpr);
      ctx.setLineDash([8 * dpr, 5 * dpr]);
      ctx.strokeRect(-mPx * 0.5, -mPx * 0.5, mPx, mPx);
      ctx.setLineDash([]);
      ctx.fillStyle = "#1E1C1A";
      const lbl = `1 × 1 m = 1 ${t("unit.m2", getLang())}`;
      ctx.font = `700 ${Math.round(13 * dpr)}px "Source Sans 3", sans-serif`;
      const tw = ctx.measureText(lbl).width + 18 * dpr;
      const th = 26 * dpr;
      ctx.fillRect(-tw / 2, -mPx * 0.5 - th / 2, tw, th);
      ctx.strokeRect(-tw / 2, -mPx * 0.5 - th / 2, tw, th);
      ctx.fillStyle = "#F2EEE7";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(lbl, 0, -mPx * 0.5);
      ctx.restore();
    }

    // Stage 3 room perimeter frame showing selected area
    if (roomReveal > 0.04) {
      const area = Math.max(1, currentArea());
      const sideM = Math.sqrt(area);
      const rW = Math.min(W * 0.72, sideM * pxPerM * 1.15);
      const rH = Math.min(H * 0.72, sideM * pxPerM * 0.85);
      ctx.save();
      ctx.globalAlpha = roomReveal;
      ctx.strokeStyle = "#E09779";
      ctx.lineWidth = Math.max(2, 2 * dpr);
      ctx.strokeRect(-rW / 2, -rH / 2, rW, rH);
      ctx.fillStyle = "#1E1C1A";
      const lbl = `${area} ${t("unit.m2", getLang())} · ${boxesFor(currentTile, area).boxes} ${t("calculator.boxes", getLang()).toLowerCase()}`;
      ctx.font = `700 ${Math.round(12.5 * dpr)}px "Source Sans 3", sans-serif`;
      const tw = ctx.measureText(lbl).width + 20 * dpr;
      const th = 28 * dpr;
      ctx.fillRect(-tw / 2, -rH / 2 - th / 2, tw, th);
      ctx.strokeRect(-tw / 2, -rH / 2 - th / 2, tw, th);
      ctx.fillStyle = "#F2EEE7";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(lbl, 0, -rH / 2);
      ctx.restore();
    }

    ctx.restore();
  }

  function syncFromScroll() {
    if (reducedMotion || window.innerWidth <= 900) return;
    const rect = trackEl.getBoundingClientRect();
    const maxScroll = Math.max(1, trackEl.offsetHeight - window.innerHeight);
    const p = clamp01(-rect.top / maxScroll);
    if (Math.abs(p - scrollProgress) > 0.002) {
      scrollProgress = p;
      updateReadout();
      draw();
    }
  }

  // Clickable stage buttons work everywhere (desktop, mobile, reduced-motion!)
  stepsEl?.querySelectorAll("[data-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-step"));
      const targets = [0.08, 0.5, 0.96];
      scrollProgress = targets[idx] ?? 0;
      manualArea = null;
      if (!reducedMotion && window.innerWidth > 900) {
        const top = trackEl.getBoundingClientRect().top + window.scrollY;
        const maxScroll = Math.max(1, trackEl.offsetHeight - window.innerHeight);
        window.scrollTo({ top: top + scrollProgress * maxScroll, behavior: "smooth" });
      }
      updateReadout();
      draw();
    });
  });

  rangeEl?.addEventListener("input", () => {
    manualArea = Number(rangeEl.value);
    if (scrollProgress < 0.75) scrollProgress = 0.92;
    updateReadout();
    draw();
  });

  window.addEventListener("scroll", syncFromScroll, { passive: true });
  window.addEventListener("resize", () => {
    if (window.innerWidth <= 900 && scrollProgress < 0.5) scrollProgress = 0.95;
    updateReadout();
    draw();
  });

  if (window.innerWidth <= 900) scrollProgress = 0.95;
  renderPicker();
  loadCurrentDrawable();
  updateReadout();
  draw();

  return {
    refreshLang: () => {
      renderPicker();
      updateReadout();
      draw();
    },
  };
}
