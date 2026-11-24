import { getLang, t } from "../core/i18n.js";
import { sizeLabel } from "../core/catalog.js";
import { loc } from "./data.js";
import { getTileDrawable } from "./textures.js";

/**
 * Draw a textured triangle via affine transform — accurate and crisp for perspective quads.
 */
function drawTexturedTriangle(ctx, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
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

export function drawTexturedQuad(ctx, img, p0, p1, p2, p3, rot90 = false) {
  const iw = img.naturalWidth || img.width || 256;
  const ih = img.naturalHeight || img.height || 256;
  const uv = rot90
    ? [[0, ih], [0, 0], [iw, 0], [iw, ih]]
    : [[0, 0], [iw, 0], [iw, ih], [0, ih]];
  drawTexturedTriangle(ctx, img, p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, uv[0][0], uv[0][1], uv[1][0], uv[1][1], uv[2][0], uv[2][1]);
  drawTexturedTriangle(ctx, img, p0.x, p0.y, p2.x, p2.y, p3.x, p3.y, uv[0][0], uv[0][1], uv[2][0], uv[2][1], uv[3][0], uv[3][1]);
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
}

/**
 * Build world-space tile quads (in metres on the floor plane X ∈ [-3.2, 3.2], Z ∈ [0.8, 7.6])
 * respecting each tile's authentic physical dimensions & laying pattern (hörgü).
 */
function generatePatternTiles(product, pattern) {
  const wM = Math.max(0.08, (Number(product?.size?.w) || 60) / 100);
  const hM = Math.max(0.08, (Number(product?.size?.h) || 60) / 100);
  // Scale very small wall tiles gently so individual pieces remain legible on perspective floor/wall
  const visualBoost = Math.max(wM, hM) < 0.35 ? 1.85 : 1.0;
  const tw = wM * visualBoost;
  const th = hM * visualBoost;
  const gap = 0.012;

  const tiles = [];

  if (pattern === "herringbone") {
    // Interlocking 45-degree rotated herringbone plank lattice
    const L = Math.max(tw, th);
    const S = Math.min(tw, th);
    const unit = S + gap;
    const cols = 10;
    const rows = 9;
    const cos = Math.SQRT1_2;
    const sin = Math.SQRT1_2;
    const toWorld = (u, v) => ({
      x: (u * cos - v * sin) * 0.92,
      z: (u * sin + v * cos) * 0.92 + 3.6,
    });

    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        // Classic herringbone step: alternate horizontal and vertical planks along diagonals
        const step = Math.max(2, Math.round(L / unit));
        if ((c + r) % 2 !== 0) continue;
        const u0 = c * unit;
        const v0 = r * unit;
        const horiz = ((c - r) / 2) % 2 === 0;
        const du = horiz ? L - gap : S - gap;
        const dv = horiz ? S - gap : L - gap;
        const p0 = toWorld(u0, v0);
        const p1 = toWorld(u0 + du, v0);
        const p2 = toWorld(u0 + du, v0 + dv);
        const p3 = toWorld(u0, v0 + dv);
        const cz = (p0.z + p1.z + p2.z + p3.z) / 4;
        const cx = (p0.x + p1.x + p2.x + p3.x) / 4;
        if (cz < 0.7 || cz > 7.4 || Math.abs(cx) > 4.4) continue;
        tiles.push({
          pts: [p0, p1, p2, p3],
          cx,
          cz,
          rot90: !horiz,
          tone: ((Math.abs(c * 7 + r * 13) % 5) - 2) * 0.025,
          order: cz * 0.65 + (cx + 4.4) * 0.25,
        });
      }
    }
  } else {
    // Straight grid, Half-offset running bond, or Metlax center-out rosette
    const tileW = pattern === "offset" ? Math.max(tw, th) : tw;
    const tileH = pattern === "offset" ? Math.min(tw, th) : th;
    const stepX = tileW + gap;
    const stepZ = tileH + gap;
    const nX = Math.ceil(6.6 / stepX);
    const nZ = Math.ceil(8.4 / stepZ);

    for (let rz = 0; rz <= nZ; rz++) {
      const z0 = 0.7 + rz * stepZ;
      if (z0 > 9.4) break;
      const offsetX = pattern === "offset" && (rz % 2 === 1) ? stepX * 0.5 : 0;
      for (let cxIdx = -nX; cxIdx <= nX; cxIdx++) {
        const x0 = cxIdx * stepX + offsetX - stepX * 0.5;
        if (x0 + tileW < -6.6 || x0 > 6.6) continue;
        const p0 = { x: x0, z: z0 };
        const p1 = { x: x0 + tileW, z: z0 };
        const p2 = { x: x0 + tileW, z: z0 + tileH };
        const p3 = { x: x0, z: z0 + tileH };
        const cx = x0 + tileW * 0.5;
        const cz = z0 + tileH * 0.5;
        let order;
        if (pattern === "metlax") {
          // Center-outward radial rosette so 4-tile patterns snap together cleanly
          order = Math.hypot(cx * 0.85, (cz - 2.9) * 1.05);
        } else {
          // Diagonal mason laying wave from front-left toward back-right
          order = (cz - 0.8) * 0.55 + (cx + 4.2) * 0.38;
        }
        tiles.push({
          pts: [p0, p1, p2, p3],
          cx,
          cz,
          rot90: pattern === "offset" && tw < th,
          tone: ((Math.abs(cxIdx * 11 + rz * 17) % 5) - 2) * 0.022,
          order,
        });
      }
    }
  }

  // Sort back-to-front (painter's algorithm) for crisp 3D settling overlap, while keeping normalized laying delay
  const orders = tiles.map((t) => t.order);
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
    { id: "xezer-mermer", pattern: "straight", layoutKey: "visualizer.layout.straight", grout: "#DDD7CC" },
    { id: "buta",         pattern: "metlax",   layoutKey: "visualizer.layout.straight", grout: "#C8BFB0" },
    { id: "palid-taxta",  pattern: "herringbone", layoutKey: "visualizer.layout.herringbone", grout: "#6B5642" },
    { id: "zeytun",       pattern: "offset",   layoutKey: "visualizer.layout.offset",   grout: "#DCD6CA" },
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

  // Preload textures (real WebP when present, procedural fallback otherwise)
  chapters.forEach((ch) => {
    getTileDrawable(ch.product, meta, { small: false }).then((img) => {
      ch.drawable = img;
      if (reducedMotion) renderFrame(performance.now());
    });
  });

  let activeIdx = 0;
  let chapterStart = performance.now() - 1900;
  let isVisible = true;
  let rafId = 0;

  // Timings (ms)
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
    const camY = 1.65;
    const camZ = -0.35;
    const focal = Math.min(W, H) * 1.08;
    const horizonY = H * 0.27;
    const cx = W * 0.5;
    return (x, y, z) => {
      const dz = Math.max(0.25, z - camZ);
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

    // Architectural warm charcoal mortar substrate
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#1D1B19");
    bgGrad.addColorStop(0.28, "#262320");
    bgGrad.addColorStop(1, "#332E29");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const project = makeProjector(W, H);

    // Subtle mortar trowel comb lines on empty bed before tiles land
    ctx.strokeStyle = "rgba(235, 228, 216, 0.05)";
    ctx.lineWidth = Math.max(1, W / 1100);
    for (let z = 1.0; z <= 7.2; z += 0.35) {
      const a = project(-4.6, 0, z);
      const b = project(4.6, 0, z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Grout phase alpha (draws crisp mortar joints after tiles seat)
    const groutAlpha = reducedMotion
      ? 0.92
      : Math.max(0, Math.min(1, (elapsed - LAY_MS * 0.72) / GROUT_MS));

    // Fade-out slightly at the very end of hold for smooth transition to next material
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
      const localT = reducedMotion ? 1 : (layNorm - tile.delay * 0.74) / 0.26;
      if (localT <= 0) continue;

      const settled = easeOutCubic(Math.min(1, localT));
      const lift = (1 - settled) * 0.24;

      // Ground contact shadow while tile is descending
      if (lift > 0.004) {
        const sp = tile.pts.map((pt) => project(pt.x, 0, pt.z));
        ctx.fillStyle = `rgba(12, 10, 8, ${(0.34 * settled).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(sp[0].x, sp[0].y);
        ctx.lineTo(sp[1].x, sp[1].y);
        ctx.lineTo(sp[2].x, sp[2].y);
        ctx.lineTo(sp[3].x, sp[3].y);
        ctx.closePath();
        ctx.fill();
      }

      const qp = tile.pts.map((pt) => project(pt.x, lift, pt.z));

      // Draw ceramic body thickness lip on front edge while descending
      if (lift > 0.008) {
        const lipH = Math.max(2, qp[0].scale * 0.016);
        ctx.fillStyle = "#5B534A";
        ctx.beginPath();
        ctx.moveTo(qp[0].x, qp[0].y);
        ctx.lineTo(qp[1].x, qp[1].y);
        ctx.lineTo(qp[1].x, qp[1].y + lipH);
        ctx.lineTo(qp[0].x, qp[0].y + lipH);
        ctx.closePath();
        ctx.fill();
      }

      if (img) {
        drawTexturedQuad(ctx, img, qp[0], qp[1], qp[2], qp[3], tile.rot90);
      } else {
        ctx.fillStyle = "#9C9488";
        ctx.beginPath();
        ctx.moveTo(qp[0].x, qp[0].y);
        ctx.lineTo(qp[1].x, qp[1].y);
        ctx.lineTo(qp[2].x, qp[2].y);
        ctx.lineTo(qp[3].x, qp[3].y);
        ctx.closePath();
        ctx.fill();
      }

      // Subtle per-tile tonal variation + atmospheric depth lighting
      const depthShade = Math.max(0, Math.min(0.45, (tile.cz - 2.4) / 7.5));
      if (tile.tone !== 0 || depthShade > 0.01) {
        ctx.beginPath();
        ctx.moveTo(qp[0].x, qp[0].y);
        ctx.lineTo(qp[1].x, qp[1].y);
        ctx.lineTo(qp[2].x, qp[2].y);
        ctx.lineTo(qp[3].x, qp[3].y);
        ctx.closePath();
        if (tile.tone > 0) {
          ctx.fillStyle = `rgba(255,250,242,${tile.tone.toFixed(3)})`;
          ctx.fill();
        }
        ctx.fillStyle = `rgba(20,18,16,${(depthShade + Math.max(0, -tile.tone)).toFixed(3)})`;
        ctx.fill();
      }

      // Animated grout seam drawn cleanly along tile perimeter once seated
      if (groutAlpha > 0.02 && settled > 0.92) {
        ctx.strokeStyle = ch.grout;
        ctx.globalAlpha = fadeOut * groutAlpha * 0.72;
        ctx.lineWidth = Math.max(1, qp[0].scale * 0.0085);
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

    // Soft showroom raking window highlight from upper right
    const light = ctx.createRadialGradient(W * 0.82, H * 0.22, 10, W * 0.72, H * 0.36, W * 0.68);
    light.addColorStop(0, "rgba(255, 246, 232, 0.14)");
    light.addColorStop(1, "rgba(255, 246, 232, 0)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
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
