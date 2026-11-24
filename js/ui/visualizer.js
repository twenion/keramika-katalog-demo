import { drawTexturedQuad } from "./hero-horgu.js";
import { getTileDrawable } from "./textures.js";

/**
 * Interactive "Səthdə bax" Architectural Perspective Visualizer.
 * Full-bleed edge-to-edge perspective rendering on Floor or Wall planes with
 * real physical proportions from product.size and crisp grout seams.
 */
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
    let wM = Math.max(0.06, (Number(product?.size?.w) || 60) / 100);
    let hM = Math.max(0.06, (Number(product?.size?.h) || 60) / 100);
    const scaleBoost = Math.max(wM, hM) < 0.16 ? 1.65 : Math.max(wM, hM) < 0.32 ? 1.18 : 1.0;
    wM *= scaleBoost;
    hM *= scaleBoost;

    const gap = Math.max(0.004, (groutMm / 1000) * 2.2 * scaleBoost);
    const quads = [];
    const effLayout = layout === "herringbone" && !isRectangular() ? "straight" : layout;

    const maxU = plane === "floor" ? 5.6 : 4.2;
    const minV = plane === "floor" ? -0.35 : -0.4;
    const maxV = plane === "floor" ? 6.2 : 4.2;

    if (effLayout === "herringbone") {
      const L = Math.max(wM, hM);
      const S = Math.min(wM, hM);
      const unit = S + gap;
      const ratio = Math.max(2, Math.min(6, Math.round(L / unit)));
      const cos = Math.SQRT1_2;
      const sin = Math.SQRT1_2;
      const vOffset = plane === "floor" ? 2.9 : 1.8;

      const span = plane === "floor" ? 6.8 : 4.8;
      const cMax = Math.ceil(span / unit);

      for (let r = -cMax; r <= cMax; r++) {
        for (let c = -cMax; c <= cMax; c++) {
          if ((c + r) % 2 !== 0) continue;
          const u0 = c * unit;
          const v0 = r * unit;
          const horiz = ((c - r) / 2) % 2 === 0;
          const du = horiz ? unit * ratio - gap : S;
          const dv = horiz ? S : unit * ratio - gap;

          const toPlane = (u, v) => ({
            u: u * cos - v * sin,
            v: u * sin + v * cos + vOffset,
          });
          const p0 = toPlane(u0, v0);
          const p1 = toPlane(u0 + du, v0);
          const p2 = toPlane(u0 + du, v0 + dv);
          const p3 = toPlane(u0, v0 + dv);
          const cu = (p0.u + p1.u + p2.u + p3.u) / 4;
          const cv = (p0.v + p1.v + p2.v + p3.v) / 4;
          if (cv < minV - L || cv > maxV + L || Math.abs(cu) > maxU + L) continue;
          quads.push({
            pts: [p0, p1, p2, p3],
            rot90: !horiz,
            tone: ((Math.abs(c * 5 + r * 11) % 5) - 2) * 0.028,
          });
        }
      }
    } else {
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
            tone: ((Math.abs(c * 13 + r * 7) % 5) - 2) * 0.022,
          });
        }
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

      const camY = 1.48;
      const camZ = -0.35;
      const focal = Math.min(W, H) * 1.05;
      // Place perspective horizon so the back wall at z=5.2m lands flush on wallH (zero grey gap)
      const zBack = 5.2;
      const horizonY = wallH - (camY * focal) / (zBack - camZ);
      const cx = W * 0.5;
      const projectFloor = (u, v) => {
        const z = 0.62 + v;
        const dz = Math.max(0.2, z - camZ);
        const s = focal / dz;
        return { x: cx + u * s, y: horizonY + camY * s };
      };

      const drawStroke = layout === "herringbone";

      for (let i = 0; i < quads.length; i++) {
        const q = quads[i];
        const pts = q.pts.map((pt) => projectFloor(pt.u, pt.v));
        const minY = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        const maxY = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        const minX = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        const maxX = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        if (minY > H + 30 || maxY < wallH - 30 || maxX < -30 || minX > W + 30) continue;

        if (drawable) {
          drawTexturedQuad(ctx, drawable, pts[0], pts[1], pts[2], pts[3], q.rot90);
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

        if (q.tone !== 0 || drawStroke) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[3].x, pts[3].y);
          ctx.closePath();
          if (q.tone > 0) {
            ctx.fillStyle = `rgba(255,252,245,${q.tone.toFixed(3)})`;
            ctx.fill();
          } else if (q.tone < 0) {
            ctx.fillStyle = `rgba(22,20,18,${(-q.tone).toFixed(3)})`;
            ctx.fill();
          }
          if (drawStroke) {
            ctx.strokeStyle = groutColor;
            ctx.lineWidth = Math.max(1, (groutMm * 0.45) * dpr);
            ctx.stroke();
          }
        }
      }

      const ao = ctx.createLinearGradient(0, wallH, 0, wallH + H * 0.14);
      ao.addColorStop(0, "rgba(24, 22, 19, 0.28)");
      ao.addColorStop(1, "rgba(24, 22, 19, 0)");
      ctx.fillStyle = ao;
      ctx.fillRect(0, wallH, W, H * 0.14);

      if (product.surface === "parlaq") {
        const gloss = ctx.createLinearGradient(W * 0.2, wallH, W * 0.85, H);
        gloss.addColorStop(0, "rgba(255, 250, 240, 0)");
        gloss.addColorStop(0.42, "rgba(255, 250, 240, 0.20)");
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
      const floorTop = Math.round(H * 0.84);
      ctx.fillStyle = groutColor;
      ctx.fillRect(0, 0, W, floorTop);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, floorTop);
      ctx.clip();

      const focal = Math.min(W, H) * 1.65;
      const cx = W * 0.5;
      const cy = floorTop * 0.52;
      const projectWall = (u, v) => {
        const worldX = u;
        const worldY = 1.65 - v;
        const worldZ = 2.65 + u * 0.12;
        const s = focal / Math.max(0.8, worldZ);
        return { x: cx + worldX * s, y: cy - worldY * s };
      };

      const drawStroke = layout === "herringbone";

      for (let i = 0; i < quads.length; i++) {
        const q = quads[i];
        const pts = q.pts.map((pt) => projectWall(pt.u, pt.v));
        const minY = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        const maxY = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        const minX = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        const maxX = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        if (minY > floorTop + 20 || maxY < -20 || maxX < -20 || minX > W + 20) continue;

        if (drawable) {
          drawTexturedQuad(ctx, drawable, pts[0], pts[1], pts[2], pts[3], q.rot90);
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

        if (q.tone !== 0 || drawStroke) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[3].x, pts[3].y);
          ctx.closePath();
          if (q.tone > 0) {
            ctx.fillStyle = `rgba(255,252,245,${q.tone.toFixed(3)})`;
            ctx.fill();
          } else if (q.tone < 0) {
            ctx.fillStyle = `rgba(22,20,18,${(-q.tone).toFixed(3)})`;
            ctx.fill();
          }
          if (drawStroke) {
            ctx.strokeStyle = groutColor;
            ctx.lineWidth = Math.max(1, (groutMm * 0.45) * dpr);
            ctx.stroke();
          }
        }
      }

      const rake = ctx.createLinearGradient(0, 0, W, floorTop * 0.6);
      rake.addColorStop(0, product.surface === "parlaq" ? "rgba(255,252,244,0.22)" : "rgba(255,252,244,0.11)");
      rake.addColorStop(0.55, "rgba(255,252,244,0)");
      rake.addColorStop(1, "rgba(22,20,18,0.22)");
      ctx.fillStyle = rake;
      ctx.fillRect(0, 0, W, floorTop);
      ctx.restore();

      const fGrad = ctx.createLinearGradient(0, floorTop, 0, H);
      fGrad.addColorStop(0, "#C7BFB2");
      fGrad.addColorStop(1, "#DED7CC");
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
