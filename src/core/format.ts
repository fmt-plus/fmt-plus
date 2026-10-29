// Memecoin number formats: 3 significant digits, K / M / B, a real minus sign, subscript zeros for tiny prices.
export const MINUS = '−';
const UNITS: Array<[number, string]> = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];
const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const trimZeros = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

/** 3 significant digits: 1.23 · 12.3 · 123 (trailing zeros kept when `keep`). */
export function sig3(x: number, keep = false): string {
  if (x === 0) return '0';
  const a = Math.abs(x);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  const s = a.toFixed(d);
  return keep ? s : trimZeros(s);
}

/** Compact: 942 · 9.42K · 94.2K · 942K · 9.42M · 1.2B (3 significant digits). */
export function compact(x: number | null | undefined, keep = false): string {
  if (!ok(x)) return '';
  const a = Math.abs(x);
  const sign = x < 0 ? MINUS : '';
  for (let i = 0; i < UNITS.length; i++) {
    const [v, u] = UNITS[i];
    if (a >= v * 0.9995) {
      const scaled = a / v;
      // 999.6K rounds to 1.00M
      if (scaled >= 999.5 && i > 0) return sign + sig3(a / UNITS[i - 1][0], keep) + UNITS[i - 1][1];
      return sign + sig3(scaled, keep) + u;
    }
  }
  if (a >= 1) return sign + (a >= 999.5 ? '1K' : sig3(a, keep));
  return sign + trimZeros(a.toPrecision(3));
}

/** Dollars, compact: $942 · $9.42K · $1.23M · $0.0412 · $0.0₅123 */
export function usd(x: number | null | undefined): string {
  if (!ok(x)) return '';
  const a = Math.abs(x);
  const sign = x < 0 ? MINUS : '';
  if (a >= 1 || a === 0) return sign + '$' + compact(a);
  return sign + price(a);
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
/** Token prices: $1.42 · $0.0412 · $0.0₅1234 (zero count as a subscript). */
export function price(x: number | null | undefined): string {
  if (!ok(x) || x <= 0) return '';
  if (x >= 1) return '$' + compact(x);
  if (x >= 0.001) return '$' + trimZeros(x.toPrecision(3));
  const [m, e] = x.toExponential(3).split('e');
  const zeros = -Number(e) - 1;
  const digits = m.replace('.', '').replace(/0+$/, '').slice(0, 4);
  return '$0.0' + String(zeros).split('').map((c) => SUB[Number(c)]).join('') + digits;
}

/** Signed percent: +12.4% · −3.1% · +240% */
export function pct(x: number | null | undefined): string {
  if (!ok(x)) return '';
  const a = Math.abs(x);
  const s = a >= 100 ? a.toFixed(0) : a.toFixed(1);
  return (x > 0 ? '+' : x < 0 ? MINUS : '') + s + '%';
}

/** SOL amounts: 0.5 · 1.25 · 12.4 · 1.2K */
export function sol(x: number | null | undefined): string {
  if (!ok(x)) return '';
  if (Math.abs(x) >= 1000) return compact(x);
  if (Math.abs(x) >= 1) return sig3(x);
  return trimZeros(x.toFixed(3)) || '0';
}

/** A count: 7 · 1,204 · 12.4K */
export function count(x: number | null | undefined): string {
  if (!ok(x)) return '';
  return Math.abs(x) >= 10000 ? compact(x) : Math.round(x).toLocaleString('en-US');
}

/** 7xQp…f2Ka */
export function short(addr: string | null | undefined, n = 4): string {
  if (!addr) return '';
  return addr.length <= n * 2 + 1 ? addr : `${addr.slice(0, n)}…${addr.slice(-n)}`;
}

/** Age from a timestamp: 4s · 12m · 3h · 2d */
export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Fills {name} placeholders. */
export function fill(s: string, v: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
}
