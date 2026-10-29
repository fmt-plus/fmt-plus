// The numbers behind /docs. `npm run numbers` runs checks() so the docs always add up.
// The worked example is a real round trip: Cooker's $FLOAT swaps seen by fmt+ (Helius, 2026-10-29).

export interface Inputs {
  /** SOL into the token (one buy). */
  buyIn: number;
  /** SOL out of the token (each sell). */
  sells: number[];
  /** Push bar: swaps of this size (SOL) and up reach Telegram. */
  bar: number;
  /** One example day across the watched wallets: swaps seen and their sizes in SOL. */
  day: number[];
}

/** Example day: a few big moves inside a lot of small flips (labelled example data). */
function exampleDay(): number[] {
  const out: number[] = [];
  for (let i = 0; i < 480; i++) out.push(i % 40 === 0 ? 12 + (i % 7) * 9 : 0.2 + (i % 9) * 0.6);
  return out;
}

export const EXAMPLE: Inputs = { buyIn: 100, sells: [76.18, 78.97], bar: 10, day: exampleDay() };

/** Importance 0..100 — the same rule as server/routes/wallets.mjs: size dominates, sells weigh more. */
export function score(sol: number, side: 'buy' | 'sell'): number {
  return Math.min(100, Math.round(Math.log10(1 + sol) * 45 + (side === 'sell' ? 10 : 0)));
}

export const SIZES = [0.5, 1, 2, 5, 10, 25, 50, 100];
export function scoreBySize(side: 'buy' | 'sell' = 'sell'): number[] {
  return SIZES.map((s) => score(s, side));
}

export interface Trip {
  out: number;
  net: number;
  multiple: number;
}
export function trip(i: Inputs = EXAMPLE): Trip {
  const out = i.sells.reduce((a, b) => a + b, 0);
  return { out, net: out - i.buyIn, multiple: out / i.buyIn };
}

export interface Day {
  seen: number;
  pushed: number;
  muted: number;
}
export function filterDay(i: Inputs = EXAMPLE): Day {
  const pushed = i.day.filter((s) => s >= i.bar).length;
  return { seen: i.day.length, pushed, muted: i.day.length - pushed };
}

export type RowKey = 'buyIn' | 'sellA' | 'sellB' | 'out' | 'net' | 'multiple';
export interface Row {
  key: RowKey;
  value: number;
  unit: 'sol' | 'x';
}

/** The worked example table, top to bottom. */
export function exampleRows(i: Inputs = EXAMPLE): Row[] {
  const t = trip(i);
  return [
    { key: 'buyIn', value: i.buyIn, unit: 'sol' },
    { key: 'sellA', value: i.sells[0], unit: 'sol' },
    { key: 'sellB', value: i.sells[1], unit: 'sol' },
    { key: 'out', value: t.out, unit: 'sol' },
    { key: 'net', value: t.net, unit: 'sol' },
    { key: 'multiple', value: t.multiple, unit: 'x' },
  ];
}

/** The invariants `npm run numbers` asserts: [what, holds]. */
export function checks(i: Inputs = EXAMPLE): Array<[string, boolean]> {
  const t = trip(i);
  const d = filterDay(i);
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  const sc = scoreBySize();
  return [
    ['the sells add up to SOL out', near(i.sells.reduce((a, b) => a + b, 0), t.out)],
    ['net = out − in', near(t.out - i.buyIn, t.net)],
    ['multiple = out ÷ in', near(t.out / i.buyIn, t.multiple)],
    ['pushed + muted = seen', d.pushed + d.muted === d.seen],
    ['the bar mutes most of the day', d.muted > d.pushed],
    ['a bigger swap never scores lower', sc.every((v, k) => k === 0 || v >= sc[k - 1])],
    ['a sell scores above a buy of the same size', SIZES.every((s) => score(s, 'sell') > score(s, 'buy'))],
    ['scores stay within 0..100', SIZES.every((s) => score(s, 'sell') <= 100 && score(s, 'buy') >= 0)],
    ['every row is finite and positive', exampleRows(i).every((r) => Number.isFinite(r.value) && r.value >= 0)],
  ];
}
