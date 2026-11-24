import { drawTexturedQuad, generateHerringboneQuads } from "./hero-horgu.js";
import { getTileDrawable } from "./textures.js";

export function mountSurfaceVisualizer({ canvas, product, meta, state }) {
  const ctx = canvas.getContext("2d");
  let drawable = null;

  getTileDrawable(product, meta, { small: false }).then((img) => {
    drawable = img;
    render();
  });

  function isRectangular() {
    const w = Number(product?.size?.w) || 60;
    const h = Number(product?.size?.h) || 60;
    return Math.abs(w - h) > 0.5;
  }

  function buildTiles(layout, groutMm, plane) {
    const rawW = (Number(product?.size?.w) || 60) / 100;
    const rawH = (Number(product?.size?.h) || 60) / 100;
    const aspect = rawW / rawH;
    const maxDim = Math.max(rawW, rawH);
    const scaleBoost = maxDim < 0.18 ? 1.6 : maxDim < 0.35 ? 1.18 : 1.0;
    const wM = rawW * scaleBoost;
    const hM = rawH * scaleBoost;

    const gap = Math.max(0.004, (groutMm / 1000) * 2.1 * scaleBoost);
    const effLayout = layout === "herringbone" && !isRectangular() ? "straight" : layout;

    const maxU = plane === "floor" ? 5.6 : 4.2;
    const minV = plane === "floor" ? -0.45 : -0.6;
    const maxV = plane === "floor" ? 6.0 : 3.8;

    if (effLayout === "herringbone") {
      const vOffset = plane === "floor" ? 2.6 : 1.6;
      const hb = generateHerringboneQuads({
        wM,
        hM,
        gap,
        minU: -maxU,
        maxU,
        minV,
        maxV,
        vOffset,
      });
      return hb.map((q) => ({
        pts: q.pts,
        rot90: q.rot90,
        aspect,
        variant: q.variant,
        tone: q.tone,
      }));
    }

    const quads = [];
    const useHoriz = effLayout === "offset" && wM < hM;
    const tw = useHoriz ? hM : wM;
    const th = useHoriz ? wM : hM;
    const stepU = tw + gap;
    const stepV = th + gap;

    const cols = Math.ceil((maxU + tw) / stepU) + 1;
    const rMin = Math.floor(minV / stepV) - 1;
    const rMax = Math.ceil(maxV / stepV) + 1;

    for (let r = rMin; r <= rMax; r++) {
      const v0 = r * stepV;
      const shift = effLayout === "offset" && (Math.abs(r) % 2 === 1) ? stepU * 0.5 : 0;
      for (let c = -cols; c <= cols; c++) {
        const u0 = c * stepU + shift - stepU * 0.5;
        if (u0 + tw < -maxU || u0 > maxU) continue;
        quads.push({
          pts: [
            { u: u0, v: v0 },
            { u: u0 + tw, v: v0 },
            { u: u0 + tw, v: v0 + th },
            { u: u0, v: v0 + th },
          ],
          rot90: useHoriz,
          aspect,
          variant: ((Math.abs(c * 29 + r * 13) % 11) + 0.5) / 11,
          tone: ((Math.abs(c * 13 + r * 7) % 5) - 2) * 0.018,
        });
      }
    }
    return quads;
  }

  function render() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(300, Math.round(rect.width * dpr));
    const H = Math.max(240, Math.round(rect.height * dpr));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    const plane = state.plane || "floor";
    const layout = state.layout || "straight";
    const groutColor = state.groutColor || "#DDD7CC";
    const groutMm = state.groutMm || 2;
    const quads = buildTiles(layout, groutMm, plane);

    if (plane === "floor") {
      const wallH = Math.round(H * 0.34);
      const wallGrad = ctx.createLinearGradient(0, 0, W, wallH);
      wallGrad.addColorStop(0, "#DDD6CB");
      wallGrad.addColorStop(0.65, "#ECE7DE");
      wallGrad.addColorStop(1, "#D5CEC2");
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, 0, W, wallH);

      ctx.strokeStyle = "rgba(40, 36, 32, 0.07)";
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(W * 0.28, 0);
      ctx.lineTo(W * 0.28, wallH);
      ctx.stroke();

      ctx.fillStyle = groutColor;
      ctx.fillRect(0, wallH, W, H - wallH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, wallH, W, H - wallH);
      ctx.clip();

      const camY = 1.72;
      const camZ = -0.55;
      const focal = Math.min(W, H) * 1.08;
      const zBack = 5.2;
      const horizonY = wallH - (camY * focal) / (zBack - camZ);
      const cx = W * 0.5;
      const projectFloor = (u, v) => {
        const z = 0.72 + v;
        const dz = Math.max(0.28, z - camZ);
        const s = focal / dz;
        return { x: cx + u * s, y: horizonY + camY * s };
      };

      for (let i = 0; i < quads.length; i++) {
        const q = quads[i];
        const minZ = Math.min(q.pts[0].v, q.pts[1].v, q.pts[2].v, q.pts[3].v) + 0.72;
        if (minZ < 0.05) continue;

        const pts = q.pts.map((pt) => projectFloor(pt.u, pt.v));
        const minY = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        const maxY = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        const minX = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        const maxX = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        if (minY > H + 30 || maxY < wallH - 30 || maxX < -30 || minX > W + 30) continue;

        if (drawable) {
          drawTexturedQuad(ctx, drawable, pts[0], pts[1], pts[2], pts[3], {
            rot90: q.rot90,
            aspect: q.aspect,
            variant: q.variant,
          });
        } else {
          ctx.fillStyle = "#9C9488";
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[3].x, pts[3].y);
          ctx.closePath();
          ctx.fill();
        }

        if (q.tone !== 0) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[3].x, pts[3].y);
          ctx.closePath();
          if (q.tone > 0) {
            ctx.fillStyle = `rgba(255,252,245,${q.tone.toFixed(3)})`;
            ctx.fill();
          } else {
            ctx.fillStyle = `rgba(22,20,18,${(-q.tone).toFixed(3)})`;
            ctx.fill();
          }
        }
      }

      const ao = ctx.createLinearGradient(0, wallH, 0, wallH + H * 0.14);
      ao.addColorStop(0, "rgba(24, 22, 19, 0.24)");
      ao.addColorStop(1, "rgba(24, 22, 19, 0)");
      ctx.fillStyle = ao;
      ctx.fillRect(0, wallH, W, H * 0.14);

      if (product.surface === "parlaq") {
        const gloss = ctx.createLinearGradient(W * 0.2, wallH, W * 0.85, H);
        gloss.addColorStop(0, "rgba(255, 250, 240, 0)");
        gloss.addColorStop(0.42, "rgba(255, 250, 240, 0.18)");
        gloss.addColorStop(0.62, "rgba(255, 250, 240, 0.04)");
        gloss.addColorStop(1, "rgba(255, 250, 240, 0)");
        ctx.fillStyle = gloss;
        ctx.fillRect(0, wallH, W, H - wallH);
      }

      ctx.restore();

      const skirtH = Math.max(8, Math.round(H * 0.032));
      ctx.fillStyle = "#F2EEE7";
      ctx.fillRect(0, wallH - skirtH, W, skirtH);
      ctx.fillStyle = "rgba(28, 27, 25, 0.18)";
      ctx.fillRect(0, wallH - skirtH, W, Math.max(1, dpr));
      ctx.fillStyle = "rgba(28, 27, 25, 0.28)";
      ctx.fillRect(0, wallH - Math.max(1, dpr), W, Math.max(1.5, dpr * 1.4));
    } else {
      const floorTop = Math.round(H * 0.82);
      ctx.fillStyle = groutColor;
      ctx.fillRect(0, 0, W, floorTop);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, floorTop);
      ctx.clip();

      const focal = Math.min(W, H) * 1.32;
      const cx = W * 0.5;
      const cy = floorTop * 0.5;
      const projectWall = (u, v) => {
        const worldX = u;
        const worldY = 1.6 - v;
        const worldZ = 3.2 + u * 0.16;
        const s = focal / Math.max(0.9, worldZ);
        return { x: cx + worldX * s, y: cy - worldY * s };
      };

      for (let i = 0; i < quads.length; i++) {
        const q = quads[i];
        const pts = q.pts.map((pt) => projectWall(pt.u, pt.v));
        const minY = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        const maxY = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        const minX = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        const maxX = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        if (minY > floorTop + 24 || maxY < -24 || maxX < -24 || minX > W + 24) continue;

        if (drawable) {
          drawTexturedQuad(ctx, drawable, pts[0], pts[1], pts[2], pts[3], {
            rot90: q.rot90,
            aspect: q.aspect,
            variant: q.variant,
          });
        } else {
          ctx.fillStyle = "#9C9488";
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[3].x, pts[3].y);
          ctx.closePath();
          ctx.fill();
        }

        if (q.tone !== 0) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[3].x, pts[3].y);
          ctx.closePath();
          if (q.tone > 0) {
            ctx.fillStyle = `rgba(255,252,245,${q.tone.toFixed(3)})`;
            ctx.fill();
          } else {
            ctx.fillStyle = `rgba(22,20,18,${(-q.tone).toFixed(3)})`;
            ctx.fill();
          }
        }
      }

      // Ceiling shadow + subtle architectural raking daylight across wall
      const ceilShadow = ctx.createLinearGradient(0, 0, 0, floorTop * 0.14);
      ceilShadow.addColorStop(0, "rgba(22, 20, 18, 0.22)");
      ceilShadow.addColorStop(1, "rgba(22, 20, 18, 0)");
      ctx.fillStyle = ceilShadow;
      ctx.fillRect(0, 0, W, floorTop * 0.14);

      const rake = ctx.createLinearGradient(0, 0, W, floorTop * 0.65);
      rake.addColorStop(0, product.surface === "parlaq" ? "rgba(255,252,244,0.18)" : "rgba(255,252,244,0.09)");
      rake.addColorStop(0.55, "rgba(255,252,244,0)");
      rake.addColorStop(1, "rgba(22,20,18,0.16)");
      ctx.fillStyle = rake;
      ctx.fillRect(0, 0, W, floorTop);
      ctx.restore();

      // Floor strip below tiled wall
      const fGrad = ctx.createLinearGradient(0, floorTop, 0, H);
      fGrad.addColorStop(0, "#C9C1B4");
      fGrad.addColorStop(1, "#DFD8CD");
      ctx.fillStyle = fGrad;
      ctx.fillRect(0, floorTop, W, H - floorTop);
      ctx.fillStyle = "rgba(24,22,19,0.26)";
      ctx.fillRect(0, floorTop, W, Math.max(2, dpr * 2));
    }
  }

  window.addEventListener("resize", render);
  render();

  return {
    update: () => render(),
    canHerringbone: isRectangular(),
  };
}
