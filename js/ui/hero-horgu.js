import { getLang, t } from "../core/i18n.js";
import { sizeLabel } from "../core/catalog.js";
import { loc } from "./data.js";
import { getTileDrawable } from "./textures.js";

function drawTexturedTriangle(ctx, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2, padHypot = false) {
  ctx.save();
  ctx.beginPath();
  if (padHypot) {
    const dx = x2 - x0;
    const dy = y2 - y0;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    // Push shared diagonal edge (p0-p2) outward by 0.6px away from p1 to eliminate canvas clip hairline
    if ((x1 - x0) * nx + (y1 - y0) * ny > 0) { nx = -nx; ny = -ny; }
    const pad = 0.6;
    ctx.moveTo(x0 + nx * pad, y0 + ny * pad);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2 + nx * pad, y2 + ny * pad);
  } else {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.closePath();
  ctx.clip();

  const denom = (u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1));
  if (Math.abs(denom) < 1e-6) {
    ctx.restore();
    return;
  }
  const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / denom;
  const b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / denom;
  const c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / denom;
  const d = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / denom;
  const e = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / denom;
  const f = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / denom;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

export function drawTexturedQuad(ctx, img, p0, p1, p2, p3, opts = false) {
  const rot90 = typeof opts === "boolean" ? opts : Boolean(opts?.rot90);
  const aspect = typeof opts === "object" && opts?.aspect ? opts.aspect : 1;
  const variant = typeof opts === "object" && Number.isFinite(opts?.variant) ? opts.variant : 0.5;

  const iw = img.naturalWidth || img.width || 256;
  const ih = img.naturalHeight || img.height || 256;
  const imgRatio = iw / ih;

  let uMin = 0, uMax = iw, vMin = 0, vMax = ih;
  if (aspect < imgRatio * 0.99) {
    const cropW = ih * aspect;
    uMin = (iw - cropW) * variant;
    uMax = uMin + cropW;
  } else if (aspect > imgRatio * 1.01) {
    const cropH = iw / aspect;
    vMin = (ih - cropH) * variant;
    vMax = vMin + cropH;
  }

  const uv = rot90
    ? [[uMin, vMax], [uMin, vMin], [uMax, vMin], [uMax, vMax]]
    : [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]];

  drawTexturedTriangle(ctx, img, p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, uv[0][0], uv[0][1], uv[1][0], uv[1][1], uv[2][0], uv[2][1], false);
  drawTexturedTriangle(ctx, img, p0.x, p0.y, p3.x, p3.y, p2.x, p2.y, uv[0][0], uv[0][1], uv[3][0], uv[3][1], uv[2][0], uv[2][1], true);
}

// Exact non-overlapping 45-degree herringbone lattice for any rectangular tile
export function generateHerringboneQuads({ wM, hM, gap, minU, maxU, minV, maxV, vOffset = 0 }) {
  const L = Math.max(wM, hM);
  const S = Math.min(wM, hM);
  const portrait = wM < hM;
  const Lp = L + gap;
  const Sp = S + gap;
  const cos = Math.SQRT1_2;
  const sin = Math.SQRT1_2;

  const toPlane = (u, v) => ({
    u: u * cos - v * sin,
    v: u * sin + v * cos + vOffset,
  });

  const stepU = Lp * Math.SQRT2;
  const stepV = Sp * Math.SQRT2;
  const margin = L + S;
  const nMin = Math.floor((minU - margin) / stepU) - 1;
  const nMax = Math.ceil((maxU + margin) / stepU) + 1;
  const kMin = Math.floor((minV - vOffset - margin) / stepV) - 1;
  const kMax = Math.ceil((maxV - vOffset + margin) / stepV) + 1;

  const quads = [];
  for (let k = kMin; k <= kMax; k++) {
    for (let n = nMin; n <= nMax; n++) {
      const bu = k * Sp + n * Lp;
      const bv = k * Sp - n * Lp;

      // Plank H(k, n): length L along +u, width S along +v
      const hPts = [
        toPlane(bu, bv),
        toPlane(bu + L, bv),
        toPlane(bu + L, bv + S),
        toPlane(bu, bv + S),
      ];
      const hCu = (hPts[0].u + hPts[1].u + hPts[2].u + hPts[3].u) * 0.25;
      const hCv = (hPts[0].v + hPts[1].v + hPts[2].v + hPts[3].v) * 0.25;
      if (hCv >= minV - L && hCv <= maxV + L && hCu >= minU - L && hCu <= maxU + L) {
        quads.push({
          pts: hPts,
          cu: hCu,
          cv: hCv,
          rot90: portrait,
          variant: ((Math.abs(k * 37 + n * 17) % 11) + 0.5) / 11,
          tone: ((Math.abs(k * 7 + n * 13) % 5) - 2) * 0.016,
        });
      }

      // Plank V(k, n): width S along +u, length L along +v
      const vu = bu + Lp;
      const vv = bv + Sp - Lp;
      const vPts = [
        toPlane(vu, vv),
        toPlane(vu + S, vv),
        toPlane(vu + S, vv + L),
        toPlane(vu, vv + L),
      ];
      const vCu = (vPts[0].u + vPts[1].u + vPts[2].u + vPts[3].u) * 0.25;
      const vCv = (vPts[0].v + vPts[1].v + vPts[2].v + vPts[3].v) * 0.25;
      if (vCv >= minV - L && vCv <= maxV + L && vCu >= minU - L && vCu <= maxU + L) {
        quads.push({
          pts: vPts,
          cu: vCu,
          cv: vCv,
          rot90: !portrait,
          variant: ((Math.abs(k * 23 + n * 41 + 5) % 11) + 0.5) / 11,
          tone: ((Math.abs(k * 11 + n * 19 + 3) % 5) - 2) * 0.016,
        });
      }
    }
  }
  return quads;
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
}

/**
 * Build world-space tile quads (in metres on the floor plane X ∈ [-6, 6], Z ∈ [0.85, 8.6])
 * preserving exact physical tile aspect ratio (uniform scaling only when needed).
 */
function generatePatternTiles(product, pattern) {
  const rawW = (Number(product?.size?.w) || 60) / 100;
  const rawH = (Number(product?.size?.h) || 60) / 100;
  const aspect = rawW / rawH;
  // Scale small tiles uniformly so individual pieces stay legible without ever altering w:h ratio
  const visualBoost = Math.max(rawW, rawH) < 0.35 ? 1.85 : 1.0;
  const tw = rawW * visualBoost;
  const th = rawH * visualBoost;
  const gap = 0.009;

  const tiles = [];

  if (pattern === "herringbone") {
    const hb = generateHerringboneQuads({
      wM: tw,
      hM: th,
      gap,
      minU: -5.4,
      maxU: 5.4,
      minV: 0.75,
      maxV: 8.4,
      vOffset: 3.4,
    });
    for (const q of hb) {
      const pts = q.pts.map((p) => ({ x: p.u, z: p.v }));
      const minZ = Math.min(pts[0].z, pts[1].z, pts[2].z, pts[3].z);
      if (minZ < 0.15 || q.cv > 8.6) continue;
      tiles.push({
        pts,
        cx: q.cu,
        cz: q.cv,
        rot90: q.rot90,
        aspect,
        variant: q.variant,
        tone: q.tone,
        order: q.cv * 0.65 + (q.cu + 5.4) * 0.25,
      });
    }
  } else {
    const isHorizOffset = pattern === "offset" && tw < th;
    const tileW = isHorizOffset ? th : tw;
    const tileH = isHorizOffset ? tw : th;
    const stepX = tileW + gap;
    const stepZ = tileH + gap;
    const nX = Math.ceil(6.4 / stepX);
    const nZ = Math.ceil(8.4 / stepZ);

    for (let rz = 0; rz <= nZ; rz++) {
      const z0 = 0.85 + rz * stepZ;
      if (z0 > 9.4) break;
      const offsetX = pattern === "offset" && (rz % 2 === 1) ? stepX * 0.5 : 0;
      for (let cxIdx = -nX; cxIdx <= nX; cxIdx++) {
        const x0 = cxIdx * stepX + offsetX - stepX * 0.5;
        if (x0 + tileW < -6.4 || x0 > 6.4) continue;
        const p0 = { x: x0, z: z0 };
        const p1 = { x: x0 + tileW, z: z0 };
        const p2 = { x: x0 + tileW, z: z0 + tileH };
        const p3 = { x: x0, z: z0 + tileH };
        const cx = x0 + tileW * 0.5;
        const cz = z0 + tileH * 0.5;
        let order;
        if (pattern === "metlax") {
          order = Math.hypot(cx * 0.85, (cz - 2.9) * 1.05);
        } else {
          order = (cz - 0.85) * 0.55 + (cx + 4.4) * 0.38;
        }
        tiles.push({
          pts: [p0, p1, p2, p3],
          cx,
          cz,
          rot90: isHorizOffset,
          aspect,
          variant: ((Math.abs(cxIdx * 29 + rz * 13) % 11) + 0.5) / 11,
          tone: ((Math.abs(cxIdx * 11 + rz * 17) % 5) - 2) * 0.015,
          order,
        });
      }
    }
  }

  const orders = tiles.map((item) => item.order);
  const minO = Math.min(...orders, 0);
  const maxO = Math.max(...orders, 1);
  const span = Math.max(0.001, maxO - minO);
  for (const tile of tiles) {
    tile.delay = (tile.order - minO) / span;
  }
  tiles.sort((a, b) => b.cz - a.cz);
  return tiles;
}

/**
 * Full-viewport signature Hero "Hörgü" renderer.
 * Cycles through 4 distinct materials, each laid in its authentic architectural pattern.
 */
export function initHeroHorgu({ canvas, tabsEl, readoutEl, products, meta }) {
  const ctx = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sequenceSpec = [
    { id: "xezer-mermer", pattern: "straight",    layoutKey: "visualizer.layout.straight",    grout: "#E2DDD4" },
    { id: "buta",         pattern: "metlax",      layoutKey: "visualizer.layout.straight",    grout: "#CFC6B8" },
    { id: "palid-taxta",  pattern: "herringbone", layoutKey: "visualizer.layout.herringbone", grout: "#856E57" },
    { id: "zeytun",       pattern: "offset",      layoutKey: "visualizer.layout.offset",      grout: "#DFD9CE" },
  ];

  const chapters = sequenceSpec.map((spec) => {
    const product = products.find((p) => p.id === spec.id) || products[0];
    return {
      ...spec,
      product,
      tiles: generatePatternTiles(product, spec.pattern),
      drawable: null,
    };
  });

  chapters.forEach((ch) => {
    getTileDrawable(ch.product, meta, { small: false }).then((img) => {
      ch.drawable = img;
      if (reducedMotion) renderFrame(performance.now());
    });
  });

  let activeIdx = 0;
  let chapterStart = performance.now() - 2400;
  let isVisible = true;
  let rafId = 0;

  const LAY_MS = 3800;
  const GROUT_MS = 950;
  const HOLD_MS = 2300;
  const TOTAL_MS = LAY_MS + GROUT_MS + HOLD_MS;

  function renderTabs() {
    const lang = getLang();
    tabsEl.innerHTML = chapters.map((ch, idx) => `
      <button type="button" class="hero-tab" data-ch="${idx}" aria-pressed="${idx === activeIdx}">
        <span class="hero-tab__bar"><span class="hero-tab__fill" data-fill="${idx}"></span></span>
        <span class="hero-tab__name">${loc(ch.product.name, lang)}</span>
        <span class="hero-tab__meta">${sizeLabel(ch.product, lang)} · ${t(ch.layoutKey, lang)}</span>
      </button>
    `).join("");

    tabsEl.querySelectorAll("[data-ch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeIdx = Number(btn.getAttribute("data-ch"));
        chapterStart = performance.now();
        updateTabStates(reducedMotion ? 1 : 0);
        if (reducedMotion) renderFrame(performance.now());
      });
    });
    updateTabStates(reducedMotion ? 1 : 0);
  }

  function updateTabStates(progress) {
    const lang = getLang();
    const ch = chapters[activeIdx];
    tabsEl.querySelectorAll("[data-ch]").forEach((btn, idx) => {
      btn.setAttribute("aria-pressed", String(idx === activeIdx));
      const fill = btn.querySelector("[data-fill]");
      if (fill) {
        fill.style.width = idx === activeIdx ? `${Math.round(progress * 100)}%` : "0%";
      }
    });
    if (readoutEl && ch) {
      readoutEl.innerHTML = `
        <span><strong>${loc(ch.product.name, lang)}</strong></span>
        <span>${sizeLabel(ch.product, lang)}</span>
        <span>${t(ch.layoutKey, lang)}</span>
      `;
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(300, Math.round(rect.width * dpr));
    const h = Math.max(300, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // Perspective camera projecting floor (x, y_lift, z) -> canvas (sx, sy)
  function makeProjector(W, H) {
    const camY = 1.72;
    const camZ = -0.55;
    const focal = Math.min(W, H) * 1.12;
    const horizonY = H * 0.28;
    const cx = W * 0.5;
    return (x, y, z) => {
      const dz = Math.max(0.35, z - camZ);
      const scale = focal / dz;
      return {
        x: cx + x * scale,
        y: horizonY + (camY - y) * scale,
        scale,
      };
    };
  }

  function renderFrame(now) {
    resize();
    const W = canvas.width;
    const H = canvas.height;
    const ch = chapters[activeIdx];

    let elapsed = reducedMotion ? LAY_MS + GROUT_MS + 100 : now - chapterStart;
    if (!reducedMotion && elapsed >= TOTAL_MS) {
      activeIdx = (activeIdx + 1) % chapters.length;
      chapterStart = now;
      elapsed = 0;
      updateTabStates(0);
    }

    const totalProgress = reducedMotion ? 1 : Math.min(1, elapsed / TOTAL_MS);
    const fillEl = tabsEl.querySelector(`[data-fill="${activeIdx}"]`);
    if (fillEl) fillEl.style.width = `${(totalProgress * 100).toFixed(1)}%`;

    // Charcoal studio backdrop behind hero headline & floor horizon
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#1C1A18");
    bgGrad.addColorStop(0.32, "#24211E");
    bgGrad.addColorStop(1, "#302C28");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const project = makeProjector(W, H);

    // Subtle mortar trowel comb lines on empty bed before tiles land
    ctx.strokeStyle = "rgba(235, 228, 216, 0.055)";
    ctx.lineWidth = Math.max(1, W / 1100);
    for (let z = 1.0; z <= 7.8; z += 0.35) {
      const a = project(-5.2, 0, z);
      const b = project(5.2, 0, z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    const groutPhase = reducedMotion
      ? 1
      : Math.max(0, Math.min(1, (elapsed - LAY_MS * 0.55) / GROUT_MS));

    const fadeOut = reducedMotion
      ? 1
      : elapsed > TOTAL_MS - 420
        ? Math.max(0, (TOTAL_MS - elapsed) / 420)
        : 1;

    ctx.save();
    ctx.globalAlpha = fadeOut;

    const img = ch.drawable;
    const layNorm = reducedMotion ? 2 : elapsed / LAY_MS;

    for (let i = 0; i < ch.tiles.length; i++) {
      const tile = ch.tiles[i];
      const localT = reducedMotion ? 1 : (layNorm - tile.delay * 0.72) / 0.28;
      if (localT <= 0) continue;

      const settled = easeOutCubic(Math.min(1, localT));
      const lift = (1 - settled) * 0.22;

      if (lift > 0.004) {
        const sp = tile.pts.map((pt) => project(pt.x, 0, pt.z));
        ctx.fillStyle = `rgba(12, 10, 8, ${(0.28 * settled).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(sp[0].x, sp[0].y);
        ctx.lineTo(sp[1].x, sp[1].y);
        ctx.lineTo(sp[2].x, sp[2].y);
        ctx.lineTo(sp[3].x, sp[3].y);
        ctx.closePath();
        ctx.fill();
      }

      const qp = tile.pts.map((pt) => project(pt.x, lift, pt.z));

      if (lift > 0.008) {
        const lipH = Math.max(2, qp[0].scale * 0.015);
        ctx.fillStyle = "#6A6258";
        ctx.beginPath();
        ctx.moveTo(qp[0].x, qp[0].y);
        ctx.lineTo(qp[1].x, qp[1].y);
        ctx.lineTo(qp[1].x, qp[1].y + lipH);
        ctx.lineTo(qp[0].x, qp[0].y + lipH);
        ctx.closePath();
        ctx.fill();
      }

      if (img) {
        drawTexturedQuad(ctx, img, qp[0], qp[1], qp[2], qp[3], {
          rot90: tile.rot90,
          aspect: tile.aspect,
          variant: tile.variant,
        });
      } else {
        ctx.fillStyle = "#B5AEA2";
        ctx.beginPath();
        ctx.moveTo(qp[0].x, qp[0].y);
        ctx.lineTo(qp[1].x, qp[1].y);
        ctx.lineTo(qp[2].x, qp[2].y);
        ctx.lineTo(qp[3].x, qp[3].y);
        ctx.closePath();
        ctx.fill();
      }

      // Preserve authentic tile colour & luminance: only subtle far-horizon depth cue beyond 4.8m
      const farShade = Math.max(0, Math.min(0.14, (tile.cz - 4.8) / 8.5));
      if (tile.tone !== 0 || farShade > 0.008) {
        ctx.beginPath();
        ctx.moveTo(qp[0].x, qp[0].y);
        ctx.lineTo(qp[1].x, qp[1].y);
        ctx.lineTo(qp[2].x, qp[2].y);
        ctx.lineTo(qp[3].x, qp[3].y);
        ctx.closePath();
        if (tile.tone > 0) {
          ctx.fillStyle = `rgba(255,253,248,${tile.tone.toFixed(3)})`;
          ctx.fill();
        }
        const darkAmt = farShade + Math.max(0, -tile.tone);
        if (darkAmt > 0.005) {
          ctx.fillStyle = `rgba(24,22,20,${darkAmt.toFixed(3)})`;
          ctx.fill();
        }
      }

      // Crisp grout seam once tile seats so gaps read as mortar rather than dark charcoal trenches
      const tileGrout = settled > 0.88 ? Math.max(0.55, groutPhase) : 0;
      if (tileGrout > 0.02) {
        ctx.strokeStyle = ch.grout;
        ctx.globalAlpha = fadeOut * tileGrout * 0.88;
        ctx.lineWidth = Math.max(1.1, qp[0].scale * 0.0095);
        ctx.beginPath();
        ctx.moveTo(qp[0].x, qp[0].y);
        ctx.lineTo(qp[1].x, qp[1].y);
        ctx.lineTo(qp[2].x, qp[2].y);
        ctx.lineTo(qp[3].x, qp[3].y);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = fadeOut;
      }
    }

    ctx.restore();

    // Soft showroom gallery daylight lift across the floor plane (keeps upper charcoal backdrop crisp)
    const floorGlow = ctx.createRadialGradient(W * 0.58, H * 0.62, 16, W * 0.52, H * 0.64, W * 0.56);
    floorGlow.addColorStop(0, "rgba(255, 252, 245, 0.10)");
    floorGlow.addColorStop(0.65, "rgba(255, 250, 242, 0.04)");
    floorGlow.addColorStop(1, "rgba(255, 250, 242, 0)");
    ctx.fillStyle = floorGlow;
    ctx.fillRect(0, H * 0.36, W, H * 0.64);
  }

  function loop(now) {
    if (!isVisible || reducedMotion) {
      rafId = 0;
      return;
    }
    renderFrame(now);
    rafId = requestAnimationFrame(loop);
  }

  const io = new IntersectionObserver((entries) => {
    isVisible = entries[0]?.isIntersecting ?? true;
    if (isVisible && !reducedMotion && !rafId) {
      rafId = requestAnimationFrame(loop);
    }
  }, { threshold: 0.05 });
  io.observe(canvas);

  window.addEventListener("resize", () => {
    if (reducedMotion || !rafId) renderFrame(performance.now());
  });

  renderTabs();
  renderFrame(performance.now());
  if (!reducedMotion) rafId = requestAnimationFrame(loop);

  return {
    refreshLang: () => {
      renderTabs();
    },
  };
}
