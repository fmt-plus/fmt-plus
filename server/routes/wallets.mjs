// fmt+ core: watch trader wallets on Solana and turn their swaps into ranked pushes.
//   snapshot.events   last 60 swaps across watched wallets (sqlite, so a restart paints at once)
//   snapshot.board    watched wallets with balance + 24h swap count
//   SSE `trade`       one swap { w, name, side, sol, mint, sym, t, sig, score }
//   GET /api/w/:addr  one wallet: SOL, holdings with prices, recent swaps, style
//   GET /api/tools    the MCP tool list (same names the MCP server exposes)
// Data: server/lib/chain.mjs (Helius when it has credits, else the public RPC). Key: env HELIUS_KEY, or data/helius.key.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { httpError } from '../lib/http.mjs';
import { swr } from '../lib/market.mjs';
import { STABLE, createChain } from '../lib/chain.mjs';
import { bus } from '../lib/bus.mjs';

export const WATCH = [
  ['Cooker', '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6'],
  ['slingoor', '5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij'],
  ['zeropnl', '4xY9T1Q7foJzJsJ6YZDSsfp9zkzeZsXnxd45SixduMmr'],
  ['Fox', 'DAEdBmTPEKM6xkwfzC3d411QUe6coKpkND6UURa4CvHC'],
  ['Publix', '86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD'],
  ['Dior', '87rRdssFiTJKY4MGARa4G5vQ31hmR7MxSmhzeaJ5AAxJ'],
  ['decu', '4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9'],
  ['Yenni', '5B52w1ZW9tuwUduueP5J7HXz5AcGfruGoX6YoAudvyxG'],
];
const KEEP = 60;
const POLL_MS = 60_000;
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const TOOLS = [
  { name: 'whats_important', args: 'wallet', d: 'Top events for a wallet, ranked' },
  { name: 'pnl', args: 'wallet', d: 'SOL in and out from recent swaps' },
  { name: 'bags', args: 'wallet', d: 'Holdings with USD value' },
  { name: 'style', args: 'wallet', d: 'Trade size, pace, hold time' },
  { name: 'trades', args: 'wallet', d: 'Last swaps with SOL size' },
  { name: 'watch', args: 'wallet', d: 'Push big moves to Telegram' },
];

function heliusKey(cfg) {
  if (cfg.env.HELIUS_KEY) return cfg.env.HELIUS_KEY.trim();
  try {
    return readFileSync(join(cfg.dataDir, 'helius.key'), 'utf8').trim();
  } catch {
    return '';
  }
}

export { heliusToSwap as toSwap } from '../lib/chain.mjs';

/** Importance 0..100: size dominates, sells weigh more (exits are what holders need to hear). */
export const score = (s) => Math.min(100, Math.round(Math.log10(1 + s.sol) * 45 + (s.side === 'sell' ? 10 : 0)));

export const MAX_USER_WALLETS = 300;
const short = (w) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export default async function wallets(ctx) {
  const { db, publish, log, market } = ctx;
  const chain = createChain({ key: heliusKey(ctx.cfg), log });
  db.migrate('wallets', [
    `CREATE TABLE trades (sig TEXT PRIMARY KEY, w TEXT NOT NULL, side TEXT NOT NULL, sol REAL NOT NULL, mint TEXT NOT NULL, sym TEXT, t INTEGER NOT NULL)`,
    'CREATE INDEX trades_t ON trades(t DESC)',
    // wallets that traders added themselves (signed in) or through the Telegram bot; the top list lives in WATCH
    `CREATE TABLE tracked (w TEXT PRIMARY KEY, source TEXT NOT NULL, t INTEGER NOT NULL)`,
  ]);

  // the tracked list: WATCH (named top wallets) + the wallets people added
  const nameOf = new Map(WATCH.map(([n, a]) => [a, n]));
  const added = new Map(db.all('SELECT w, source, t FROM tracked ORDER BY t').map((r) => [r.w, r]));
  const trackedList = () => [...WATCH.map(([, w]) => w), ...[...added.keys()].filter((w) => !nameOf.has(w))];
  const isTracked = (w) => nameOf.has(w) || added.has(w);
  const nameFor = (w) => nameOf.get(w) ?? short(w);
  function track(w, source) {
    if (!ADDR.test(w) || isTracked(w)) return isTracked(w);
    if (added.size >= MAX_USER_WALLETS) return false;
    const r = { w, source, t: Date.now() };
    db.run('INSERT OR IGNORE INTO tracked (w, source, t) VALUES (?, ?, ?)', w, source, r.t);
    added.set(w, r);
    log('wallets.track', { w: w.slice(0, 6), source });
    void chain.balance(w).then((b) => balances.set(w, b), () => undefined);
    void pollOne(w);
    return true;
  }

  const row = (r) => ({ ...r, name: nameFor(r.w), score: score(r) });
  // stablecoin swaps (SOL to USDC/USDT) are cash moves, so the feed shows token trades only
  const tokenTrade = (r) => !STABLE.has(r.mint) && r.sym !== 'USDC' && r.sym !== 'USDT';
  let events = db.all('SELECT * FROM trades ORDER BY t DESC LIMIT ?', KEEP * 2).filter(tokenTrade).slice(0, KEEP).map(row);
  const seen = new Set(events.map((e) => e.sig));
  // a wallet's first read only fills `seen`: its old trades never arrive as new alerts
  const primed = new Set();

  const walletCache = swr(async (w) => {
    const [sol, bags, read] = await Promise.all([chain.balance(w), chain.bags(w).catch(() => []), chain.history(w).catch(() => [])]);
    // add the trades fmt+ already recorded for this wallet (the public RPC fallback misses many behind spam)
    const bySig = new Map(read.map((s) => [s.sig, s]));
    for (const r of db.all('SELECT sig, side, sol, mint, sym, t FROM trades WHERE w = ? ORDER BY t DESC LIMIT 100', w)) if (!bySig.has(r.sig) && tokenTrade(r)) bySig.set(r.sig, r);
    const swaps = [...bySig.values()].filter(tokenTrade).sort((a, b) => b.t - a.t).slice(0, 100);
    const buys = swaps.filter((s) => s.side === 'buy');
    const sells = swaps.filter((s) => s.side === 'sell');
    const sum = (a) => Math.round(a.reduce((x, s) => x + s.sol, 0) * 100) / 100;
    const sizes = buys.map((s) => s.sol).sort((a, b) => a - b);
    const span = swaps.length > 1 ? (swaps[0].t - swaps[swaps.length - 1].t) / 3600_000 : 0;
    const perHour = span ? Math.round((swaps.length / span) * 10) / 10 : 0;
    // win rate: of the tokens this wallet both bought and sold in the window, the share where sells brought back
    // more SOL than the buys cost
    const per = new Map();
    for (const s of swaps) {
      const p = per.get(s.mint) ?? { b: 0, s: 0 };
      if (s.side === 'buy') p.b += s.sol;
      else p.s += s.sol;
      per.set(s.mint, p);
    }
    const closed = [...per.values()].filter((p) => p.b > 0 && p.s > 0);
    const wins = closed.filter((p) => p.s > p.b).length;
    return {
      w,
      name: nameOf.get(w) ?? null,
      sol: Math.round(sol * 100) / 100,
      solUsd: market.solUsdNow(),
      bagsUsd: bags.reduce((x, b) => x + b.usd, 0),
      bags,
      swaps: swaps.slice(0, 30),
      // the window the trade numbers cover: the wallet's last `count` trades, from `from` to `to`
      count: swaps.length,
      buys: buys.length,
      sells: sells.length,
      from: swaps.length ? swaps[swaps.length - 1].t : null,
      to: swaps.length ? swaps[0].t : null,
      flow: { in: sum(buys), out: sum(sells), net: Math.round((sum(sells) - sum(buys)) * 100) / 100 },
      tokens: per.size,
      closed: closed.length,
      wins,
      winRate: closed.length ? Math.round((wins / closed.length) * 100) : null,
      style: { size: sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0, perHour, kind: perHour > 1 ? 'flipper' : 'holder' },
      at: Date.now(),
    };
  }, { ttlMs: 5 * 60_000, retryMs: 20_000, name: 'wallets.one', max: 300 });

  const balances = new Map();
  let polls = 0;
  let lastOk = 0;
  let busy = false;
  async function pollOne(w) {
    try {
      const first = !primed.has(w);
      const swaps = await chain.fresh(w, seen, first);
      primed.add(w);
      for (const s of swaps.sort((a, b) => a.t - b.t)) {
        const ev = row({ w, ...s });
        db.run('INSERT OR IGNORE INTO trades (sig, w, side, sol, mint, sym, t) VALUES (?,?,?,?,?,?,?)', s.sig, w, s.side, s.sol, s.mint, s.sym, s.t);
        events.unshift(ev);
        publish('trade', ev);
        bus.emit('trade', ev);
      }
      lastOk = Date.now();
    } catch (e) {
      log('wallets.poll.fail', { w: w.slice(0, 6), e: String(e.message || e).slice(0, 80) });
    }
  }
  async function poll() {
    if (busy) return;
    busy = true;
    try {
      for (const w of trackedList()) await pollOne(w);
      events.sort((a, b) => b.t - a.t);
      events = events.slice(0, KEEP);
      polls++;
    } finally {
      busy = false;
    }
  }
  async function balancesTick() {
    for (const w of trackedList()) {
      try {
        balances.set(w, await chain.balance(w));
      } catch {}
    }
  }
  void poll().then(balancesTick);
  const t1 = setInterval(poll, POLL_MS);
  const t2 = setInterval(balancesTick, 10 * 60_000);
  t1.unref?.();
  t2.unref?.();

  // 24 h counts come from every recorded trade (the in-memory feed keeps only the newest KEEP)
  const board = () => {
    const rows = db.all('SELECT w, mint, sym, sol FROM trades WHERE t > ?', Date.now() - 86400_000).filter(tokenTrade);
    const day = new Map();
    for (const r of rows) {
      const d = day.get(r.w) ?? { n: 0, v: 0 };
      d.n++;
      d.v += r.sol;
      day.set(r.w, d);
    }
    return trackedList().map((w) => ({
      name: nameFor(w),
      w,
      top: nameOf.has(w),
      sol: balances.has(w) ? Math.round(balances.get(w) * 10) / 10 : null,
      trades: day.get(w)?.n ?? 0,
      volume: Math.round(day.get(w)?.v ?? 0),
    }));
  };

  ctx.snapshot('events', () => events);
  ctx.snapshot('board', () => board());
  ctx.snapshot('solUsd', () => market.solUsdNow());
  ctx.route('GET', '/api/events', () => ({ events }));
  ctx.route('GET', '/api/board', () => ({ board: board() }));
  ctx.route('GET', '/api/tools', () => ({ tools: TOOLS }));
  const limit = ctx.rate(30);
  ctx.route('GET', '/api/w/:addr', async (_req, _res, { params, ip }) => {
    limit(ip);
    if (!ADDR.test(params.addr)) throw httpError(400, 'address');
    const v = await walletCache.get(params.addr);
    if (!v) throw httpError(502, 'upstream');
    return { ...v, tracked: isTracked(params.addr) };
  });
  // "Add my wallet": the signed-in wallet joins the shared tracked list
  const addLimit = ctx.rate(10);
  ctx.route('POST', '/api/track', (req, _res, { ip }) => {
    addLimit(ip);
    const s = ctx.requireUser(req);
    if (!track(s.address, 'site')) throw httpError(409, 'full');
    return { tracked: true, w: s.address };
  });
  ctx.health('chain', () => ({ ok: Date.now() - lastOk < 5 * 60_000 || process.uptime() < 120, ...chain.status(), polls, events: events.length, tracked: trackedList().length }));
  ctx.onStop(() => {
    clearInterval(t1);
    clearInterval(t2);
  });
  bus.on('wallet?', (w, cb) => walletCache.get(w).then((v) => cb(v ? { ...v, tracked: isTracked(w) } : null), () => cb(null)));
  bus.on('track', (w) => track(w, 'telegram'));
  log('wallets.ready', { cached: events.length, ...chain.status(), tracked: trackedList().length });
}
