import { resolveAsset, primaryHex } from "./data.js";

const canvasCache = new Map();
const imageCache = new Map();

function hexToRgb(hex) {
  const clean = String(hex || "#9c958a").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(rgb, a, delta = 0) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v + delta)));
  return `rgba(${clamp(rgb.r)},${clamp(rgb.g)},${clamp(rgb.b)},${a})`;
}

/**
 * Compact architectural mineral-grain fallback used only when a product image
 * (e.g. a newly added admin product without uploaded photo) is absent on disk.
 */
export function buildProceduralTile(product, meta, size = 240) {
  const baseHex = primaryHex(meta, product);
  const key = `${product.id}|${product.surface}|${baseHex}|${size}`;
  if (canvasCache.has(key)) return canvasCache.get(key);

  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const rgb = hexToRgb(baseHex);

  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, rgba(rgb, 1, 10));
  g.addColorStop(1, rgba(rgb, 1, -12));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  let seed = 2166136261;
  for (const ch of String(product.id || "tile")) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = rand() > 0.5 ? rgba(rgb, 0.16, 26) : rgba(rgb, 0.14, -26);
    ctx.fillRect(rand() * size, rand() * size, 3, 3);
  }

  if (product.surface === "parlaq") {
    const sheen = ctx.createLinearGradient(0, 0, size, size);
    sheen.addColorStop(0, "rgba(255,255,255,0.18)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0)");
    sheen.addColorStop(1, "rgba(0,0,0,0.08)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  canvasCache.set(key, c);
  return c;
}

function smallVariant(imagePath) {
  if (!imagePath || /^data:/i.test(imagePath)) return "";
  if (imagePath.endsWith(".webp") && !imagePath.endsWith("-s.webp")) {
    return imagePath.replace(/\.webp$/i, "-s.webp");
  }
  return "";
}

function loadRawImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img load failed"));
    img.src = url;
  });
}

export async function getTileDrawable(product, meta, { small = false } = {}) {
  const cacheKey = `${product.id}|${product.image || ""}|${small ? "s" : "f"}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const promise = (async () => {
    const candidates = [];
    if (product.image) {
      if (small) {
        const sv = smallVariant(product.image);
        if (sv) candidates.push(resolveAsset(sv));
      }
      candidates.push(resolveAsset(product.image));
    }
    for (const url of candidates) {
      try {
        return await loadRawImage(url);
      } catch {
        // Fallback cleanly
      }
    }
    return buildProceduralTile(product, meta, small ? 220 : 320);
  })();

  imageCache.set(cacheKey, promise);
  return promise;
}

export function mountTileImg(imgEl, product, meta, { small = false, eager = false, alt = "" } = {}) {
  imgEl.alt = alt;
  imgEl.decoding = "async";
  if (small && !eager) imgEl.loading = "lazy";

  const fallbackUrl = () => buildProceduralTile(product, meta, small ? 220 : 320).toDataURL("image/png");

  if (!product.image) {
    imgEl.src = fallbackUrl();
    return;
  }
  if (/^data:/i.test(product.image)) {
    imgEl.src = product.image;
    return;
  }

  const sv = small ? smallVariant(product.image) : "";
  const fullUrl = resolveAsset(product.image);
  const firstUrl = sv ? resolveAsset(sv) : fullUrl;
  let triedFull = !sv;

  imgEl.onerror = () => {
    if (!triedFull) {
      triedFull = true;
      imgEl.src = fullUrl;
      return;
    }
    imgEl.onerror = null;
    imgEl.src = fallbackUrl();
  };
  imgEl.src = firstUrl;
}
