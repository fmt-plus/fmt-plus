// fmt+ core: watch trader wallets on Solana and turn their swaps into ranked pushes.
//   snapshot.events   last 60 swaps across watched wallets (sqlite, so a restart paints at once)
//   snapshot.board    watched wallets with balance + 24h swap count
//   SSE `trade`       one swap { w, name, side, sol, mint, sym, t, sig, score }
//   GET /api/w/:addr  one wallet: SOL, holdings with prices, recent swaps, style
//   GET /api/tools    the MCP tool list (same names the MCP server exposes)
// Data: Helius enhanced transactions + DAS getAssetsByOwner. Key: env HELIUS_KEY, or data/helius.key (gitignored).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { httpError } from '../lib/http.mjs';
import { getJson, swr } from '../lib/market.mjs';
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
const SOL = 'So11111111111111111111111111111111111111112';
const STABLE = new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCecdNXHXP2']);
const KEEP = 60;
const POLL_MS = 25_000;
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

/** One Helius enhanced tx → a swap seen from `w`, or null. */
export function toSwap(tx, w) {
  // spam and dust txs only mention the wallet: a real trade is one the wallet paid for
  if (tx.feePayer !== w || tx.transactionError) return null;
  const me = (tx.accountData || []).find((a) => a.account === w);
  if (!me) return null;
  const mine = (tx.tokenTransfers || []).filter((t) => t.toUserAccount === w || t.fromUserAccount === w);
  const wsol = mine.filter((t) => t.mint === SOL).reduce((x, t) => x + (t.toUserAccount === w ? t.tokenAmount : -t.tokenAmount), 0);
  const sol = (me.nativeBalanceChange || 0) / 1e9 + wsol;
  const tok = mine.filter((t) => t.mint !== SOL && !STABLE.has(t.mint));
  if (!tok.length || Math.abs(sol) < 0.05) return null;
  return { side: sol < 0 ? 'buy' : 'sell', sol: Math.round(Math.abs(sol) * 100) / 100, mint: tok[0].mint, t: tx.timestamp * 1000, sig: tx.signature };
}

/** Importance 0..100: size dominates, sells weigh more (exits are what holders need to hear). */
export const score = (s) => Math.min(100, Math.round(Math.log10(1 + s.sol) * 45 + (s.side === 'sell' ? 10 : 0)));

export default async function wallets(ctx) {
  const { db, publish, log, market } = ctx;
  const key = heliusKey(ctx.cfg);
  const rpcUrl = key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : 'https://api.mainnet-beta.solana.com';
  db.migrate('wallets', [
    `CREATE TABLE trades (sig TEXT PRIMARY KEY, w TEXT NOT NULL, side TEXT NOT NULL, sol REAL NOT NULL, mint TEXT NOT NULL, sym TEXT, t INTEGER NOT NULL)`,
    'CREATE INDEX trades_t ON trades(t DESC)',
  ]);
  const nameOf = new Map(WATCH.map(([n, a]) => [a, n]));
  const row = (r) => ({ ...r, name: nameOf.get(r.w) ?? r.w.slice(0, 4), score: score(r) });
  let events = db.all('SELECT * FROM trades ORDER BY t DESC LIMIT ?', KEEP).map(row);
  const seen = new Set(events.map((e) => e.sig));

  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  };
  const txs = (w, limit = 40) => getJson(`https://api.helius.xyz/v0/addresses/${w}/transactions?api-key=${key}&type=SWAP&limit=${limit}`, { timeoutMs: 10000 });

  const symCache = swr(async (mint) => {
    const a = await rpc('getAsset', { id: mint });
    return a?.content?.metadata?.symbol || a?.token_info?.symbol || mint.slice(0, 4);
  }, { ttlMs: 24 * 3600_000, name: 'wallets.sym', max: 5000 });
  const sym = (mint) => symCache.get(mint).catch(() => mint.slice(0, 4));

  const walletCache = swr(async (w) => {
    const [assets, list] = await Promise.all([
      rpc('getAssetsByOwner', { ownerAddress: w, displayOptions: { showFungible: true, showNativeBalance: true }, limit: 200 }),
      key ? txs(w, 100) : Promise.resolve([]),
    ]);
    const solUsd = assets?.nativeBalance?.price_per_sol ?? market.solUsdNow();
    const sol = (assets?.nativeBalance?.lamports ?? 0) / 1e9;
    const bags = (assets?.items || [])
      .filter((a) => a.token_info?.price_info?.total_price > 1)
      .map((a) => ({ mint: a.id, sym: a.content?.metadata?.symbol || a.id.slice(0, 4), usd: Math.round(a.token_info.price_info.total_price) }))
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 12);
    const swaps = (list || []).map((t) => toSwap(t, w)).filter(Boolean);
    for (const s of swaps.slice(0, 20)) s.sym = await sym(s.mint);
    const buys = swaps.filter((s) => s.side === 'buy');
    const sells = swaps.filter((s) => s.side === 'sell');
    const sum = (a) => Math.round(a.reduce((x, s) => x + s.sol, 0) * 100) / 100;
    const sizes = buys.map((s) => s.sol).sort((a, b) => a - b);
    const span = swaps.length > 1 ? (swaps[0].t - swaps[swaps.length - 1].t) / 3600_000 : 0;
    const perHour = span ? Math.round((swaps.length / span) * 10) / 10 : 0;
    return {
      w,
      name: nameOf.get(w) ?? null,
      sol: Math.round(sol * 100) / 100,
      solUsd,
      bagsUsd: bags.reduce((x, b) => x + b.usd, 0),
      bags,
      swaps: swaps.slice(0, 30),
      flow: { in: sum(buys), out: sum(sells), net: Math.round((sum(sells) - sum(buys)) * 100) / 100 },
      style: { size: sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0, perHour, kind: perHour > 1 ? 'flipper' : 'holder' },
      at: Date.now(),
    };
  }, { ttlMs: 30_000, retryMs: 10_000, name: 'wallets.one', max: 300 });

  const balances = new Map();
  let polls = 0;
  let lastOk = 0;
  async function poll() {
    if (!key) return;
    for (const [, w] of WATCH) {
      try {
        const list = await txs(w, 25);
        for (const tx of list.reverse()) {
          if (seen.has(tx.signature)) continue;
          seen.add(tx.signature);
          const s = toSwap(tx, w);
          if (!s) continue;
          s.sym = await sym(s.mint);
          const ev = row({ w, ...s });
          db.run('INSERT OR IGNORE INTO trades (sig, w, side, sol, mint, sym, t) VALUES (?,?,?,?,?,?,?)', s.sig, w, s.side, s.sol, s.mint, s.sym, s.t);
          events.unshift(ev);
          if (polls > 0) {
            publish('trade', ev);
            bus.emit('trade', ev);
          }
        }
        lastOk = Date.now();
      } catch (e) {
        log('wallets.poll.fail', { w: w.slice(0, 6), e: String(e.message || e).slice(0, 80) });
      }
    }
    events.sort((a, b) => b.t - a.t);
    events = events.slice(0, KEEP);
    polls++;
  }
  async function balancesTick() {
    for (const [, w] of WATCH) {
      try {
        balances.set(w, (await rpc('getBalance', [w])).value / 1e9);
      } catch {}
    }
  }
  void poll().then(balancesTick);
  const t1 = setInterval(poll, POLL_MS);
  const t2 = setInterval(balancesTick, 120_000);
  t1.unref?.();
  t2.unref?.();

  const board = () => {
    const day = Date.now() - 86400_000;
    return WATCH.map(([name, w]) => {
      const mine = events.filter((e) => e.w === w && e.t > day);
      return { name, w, sol: balances.has(w) ? Math.round(balances.get(w) * 10) / 10 : null, trades: mine.length, volume: Math.round(mine.reduce((x, e) => x + e.sol, 0)) };
    });
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
    try {
      return await walletCache.get(params.addr);
    } catch {
      throw httpError(502, 'upstream');
    }
  });
  ctx.health('helius', () => ({ ok: Boolean(key) && (Date.now() - lastOk < 5 * 60_000 || process.uptime() < 90), key: Boolean(key), polls, events: events.length }));
  ctx.onStop(() => {
    clearInterval(t1);
    clearInterval(t2);
  });
  bus.on('wallet?', (w, cb) => walletCache.get(w).then(cb, () => cb(null)));
  log('wallets.ready', { cached: events.length, key: Boolean(key) });
}
