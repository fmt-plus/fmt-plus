// A coin in ordered dither (ported from flipfee). Each coin is a real cylinder (a face, a reeded edge) ray-cast per
// cell: turned around its upright axis (theta) and tipped toward the viewer (phi), lit from the upper left, then
// thresholded against an 8×8 Bayer matrix. A silhouette pass draws a one-cell outline, so the shape reads at any size.
// Several coins share one depth buffer, so they pass in front of each other. Pure functions: no DOM except paint().

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19,
  59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

const L = (() => {
  const v = [-0.5, 0.6, 0.65];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((x) => x / n) as [number, number, number];
})();

const R = 0.9; // radius, in coin units
const H = 0.1; // half thickness
const REEDS = 64; // ridges around the edge

export interface CoinPose {
  /** centre, in cells */
  cx: number;
  cy: number;
  /** radius, in cells */
  r: number;
  /** turn around the upright axis */
  theta: number;
  /** tip toward the viewer */
  phi: number;
  /** depth offset (bigger = nearer) */
  z?: number;
  /** tone shift: + darker, − lighter (coins further back read lighter) */
  dark?: number;
}

/** Ray-cast one coin at coin-space point (u, v) (radius 1 box, y up): null on a miss, else depth and brightness. */
function hit(u: number, v: number, ct: number, st: number, cp: number, sp: number): { depth: number; shade: number } | null {
  // world ray: origin (u, v, 5), direction (0, 0, −1); into coin space by Ry(−θ)·Rx(−φ)
  const oy = v * cp + 5 * sp;
  const oz1 = -v * sp + 5 * cp;
  const dy = -sp;
  const dz1 = -cp;
  const ox = u * ct - oz1 * st;
  const oz = u * st + oz1 * ct;
  const dx = -dz1 * st;
  const dz = dz1 * ct;
  let tIn = -Infinity;
  let tOut = Infinity;
  let inFace = true;
  if (Math.abs(dz) < 1e-9) {
    if (Math.abs(oz) > H) return null;
    inFace = false;
  } else {
    let t1 = (-H - oz) / dz;
    let t2 = (H - oz) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tIn = t1;
    tOut = t2;
  }
  const a = dx * dx + dy * dy;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - R * R;
  if (a < 1e-9) {
    if (c > 0) return null;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const c1 = (-b - s) / (2 * a);
    const c2 = (-b + s) / (2 * a);
    if (c1 > tIn) {
      tIn = c1;
      inFace = false;
    }
    tOut = Math.min(tOut, c2);
  }
  if (tIn > tOut || !Number.isFinite(tIn)) return null;
  const hx = ox + dx * tIn;
  const hy = oy + dy * tIn;
  const hz = oz + dz * tIn;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (inFace) nz = hz > 0 ? 1 : -1;
  else {
    nx = hx / R;
    ny = hy / R;
  }
  // back to world: Rx(φ)·Ry(θ)
  const wx = nx * ct + nz * st;
  const wz0 = -nx * st + nz * ct;
  const wy = ny * cp - wz0 * sp;
  const wz = ny * sp + wz0 * cp;
  let shade = 0.16 + 0.84 * Math.max(0, wx * L[0] + wy * L[1] + wz * L[2]);
  if (inFace) {
    const rr = Math.hypot(hx, hy) / R;
    if (rr > 0.8 && rr < 0.88) shade -= 0.3;
    else if (rr >= 0.88) shade += 0.08;
    if (rr < 0.36) shade += 0.06 - 0.25 * Math.max(0, -hy);
    shade += 0.16 * Math.exp(-(((hx + hy * 0.6) / 0.35) ** 2));
  } else {
    const ang = Math.atan2(hy, hx);
    shade = shade * 0.7 + (Math.floor(((ang + Math.PI) / (2 * Math.PI)) * REEDS) % 2 ? 0.12 : -0.04);
  }
  return { depth: -tIn, shade };
}

/** Render coins into a w×h ink mask (1 = ink), depth-tested, each with a one-cell outline. */
export function renderCoins(w: number, h: number, coins: CoinPose[]): Uint8Array {
  const out = new Uint8Array(w * h);
  const depth = new Float32Array(w * h).fill(-Infinity);
  const owner = new Int16Array(w * h).fill(-1);
  const shade = new Float32Array(w * h);
  coins.forEach((p, k) => {
    const ct = Math.cos(p.theta);
    const st = Math.sin(p.theta);
    const cp = Math.cos(p.phi);
    const sp = Math.sin(p.phi);
    const x0 = Math.max(0, Math.floor(p.cx - p.r - 1));
    const x1 = Math.min(w - 1, Math.ceil(p.cx + p.r + 1));
    const y0 = Math.max(0, Math.floor(p.cy - p.r - 1));
    const y1 = Math.min(h - 1, Math.ceil(p.cy + p.r + 1));
    const z = p.z ?? 0;
    for (let y = y0; y <= y1; y++) {
      const v = -((y + 0.5 - p.cy) / p.r);
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - p.cx) / p.r;
        if (u * u + v * v > 1.3) continue;
        const r = hit(u, v, ct, st, cp, sp);
        if (!r) continue;
        const d = z + r.depth * p.r * 0.01;
        const i = y * w + x;
        if (d <= depth[i]) continue;
        depth[i] = d;
        owner[i] = k;
        shade[i] = r.shade - (p.dark ?? 0);
      }
    }
  });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = owner[i];
      if (o < 0) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || owner[i - 1] !== o || owner[i + 1] !== o || owner[i - w] !== o || owner[i + w] !== o;
      if (edge || 1 - Math.min(1, shade[i]) > BAYER8[(y & 7) * 8 + (x & 7)]) out[i] = 1;
    }
  }
  return out;
}

/** One coin centred in an n×n grid (the logo, the avatar). */
export function coinMask(n: number, theta: number, phi = 0.28): Uint8Array {
  return renderCoins(n, n, [{ cx: n / 2, cy: n / 2, r: n * 0.47, theta, phi }]);
}

/** Paint a mask into a w×h canvas in `rgb` (clear elsewhere). */
export function paint(ctx: CanvasRenderingContext2D, mask: Uint8Array, w: number, h: number, rgb: [number, number, number]): void {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    d[i * 4] = rgb[0];
    d[i * 4 + 1] = rgb[1];
    d[i * 4 + 2] = rgb[2];
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
