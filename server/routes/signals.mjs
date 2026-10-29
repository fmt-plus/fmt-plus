// Coin-growth signals and the hourly digest.
//   Every 2 min: each coin a tracked wallet traded in the last 24 h is checked on DexScreener. A coin up +50% or more
//   in 1 hour (owner's threshold) with $5k+ liquidity becomes a signal; one coin signals at most once per 6 h.
//   Signal = { id, mint, sym, change1h, priceUsd, mcapUsd, liqUsd, t, wallets: [{ w, name }] }
//   bus 'signal' (the bot sends it), SSE 'signal', GET /api/signals → { signals }, snapshot.signals
//   GET /api/digest → the last hour in numbers (snapshot.digest): trades, buys, sells, SOL moved, top trade, signals.
import { getJson } from '../lib/market.mjs';
import { bus } from '../lib/bus.mjs';
import { WATCH } from './wallets.mjs';

export const GROWTH_PCT = 50;
const MIN_LIQ = 5000;
const EVERY_MS = 120_000;
const QUIET_MS = 6 * 3600_000;
const KEEP = 30;

export default async function signals(ctx) {
  const { db, publish, log } = ctx;
  db.migrate('signals', [
    `CREATE TABLE signals (id TEXT PRIMARY KEY, mint TEXT NOT NULL, sym TEXT, change1h REAL NOT NULL, price REAL, mcap REAL,
       liq REAL, wallets TEXT NOT NULL, t INTEGER NOT NULL)`,
    'CREATE INDEX signals_mint_t ON signals(mint, t DESC)',
  ]);
  const top = new Map(WATCH.map(([n, w]) => [w, n]));
  const nameOf = (w) => top.get(w) ?? `${w.slice(0, 4)}…${w.slice(-4)}`;
  const row = (r) => ({ id: r.id, mint: r.mint, sym: r.sym, change1h: r.change1h, priceUsd: r.price, mcapUsd: r.mcap, liqUsd: r.liq, t: r.t, wallets: JSON.parse(r.wallets) });
  const recent = () => db.all('SELECT * FROM signals ORDER BY t DESC LIMIT ?', KEEP).map(row);

  let checks = 0;
  let lastOk = 0;
  async function check() {
    const since = Date.now() - 86400_000;
    const traded = new Map();
    for (const r of db.all('SELECT mint, sym, w FROM trades WHERE t > ? ORDER BY t DESC', since)) {
      const m = traded.get(r.mint) ?? { sym: r.sym, w: new Set() };
      m.w.add(r.w);
      traded.set(r.mint, m);
    }
    const mints = [...traded.keys()].slice(0, 120);
    for (let i = 0; i < mints.length; i += 30) {
      let pairs;
      try {
        pairs = await getJson(`https://api.dexscreener.com/tokens/v1/solana/${mints.slice(i, i + 30).join(',')}`, { timeoutMs: 10000 });
      } catch (e) {
        log('signals.dex.fail', { e: String(e.message || e).slice(0, 60) });
        continue;
      }
      // the most liquid pair per coin
      const best = new Map();
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const m = p?.baseToken?.address;
        if (!m || !traded.has(m)) continue;
        if ((p.liquidity?.usd ?? 0) > (best.get(m)?.liquidity?.usd ?? -1)) best.set(m, p);
      }
      for (const [m, p] of best) {
        const ch = Number(p.priceChange?.h1);
        const liq = Number(p.liquidity?.usd ?? 0);
        if (!(ch >= GROWTH_PCT) || liq < MIN_LIQ) continue;
        if (db.get('SELECT 1 AS x FROM signals WHERE mint = ? AND t > ?', m, Date.now() - QUIET_MS)) continue;
        const sig = {
          id: `${m.slice(0, 8)}-${Date.now().toString(36)}`,
          mint: m,
          sym: p.baseToken.symbol || traded.get(m).sym,
          change1h: Math.round(ch),
          priceUsd: Number(p.priceUsd) || null,
          mcapUsd: Number(p.marketCap ?? p.fdv) || null,
          liqUsd: Math.round(liq),
          t: Date.now(),
          wallets: [...traded.get(m).w].map((w) => ({ w, name: nameOf(w) })),
        };
        db.run(
          'INSERT INTO signals (id, mint, sym, change1h, price, mcap, liq, wallets, t) VALUES (?,?,?,?,?,?,?,?,?)',
          sig.id, sig.mint, sig.sym, sig.change1h, sig.priceUsd, sig.mcapUsd, sig.liqUsd, JSON.stringify(sig.wallets), sig.t,
        );
        publish('signal', sig);
        bus.emit('signal', sig);
        log('signals.up', { sym: sig.sym, ch: sig.change1h });
      }
    }
    checks++;
    lastOk = Date.now();
  }

  function digest() {
    const since = Date.now() - 3600_000;
    const rows = db.all('SELECT w, side, sol, sym, mint, t FROM trades WHERE t > ? ORDER BY sol DESC', since);
    const buys = rows.filter((r) => r.side === 'buy');
    const sol = Math.round(rows.reduce((x, r) => x + r.sol, 0) * 10) / 10;
    const topTrade = rows[0] ? { name: nameOf(rows[0].w), side: rows[0].side, sol: rows[0].sol, sym: rows[0].sym, mint: rows[0].mint } : null;
    const sigs = db.all('SELECT sym, change1h, mint FROM signals WHERE t > ? ORDER BY change1h DESC', since);
    return { from: since, to: Date.now(), trades: rows.length, buys: buys.length, sells: rows.length - buys.length, sol, topTrade, signals: sigs };
  }

  const t1 = setInterval(() => void check().catch((e) => log('signals.fail', { e: String(e).slice(0, 80) })), EVERY_MS);
  t1.unref?.();
  setTimeout(() => void check().catch(() => undefined), 15_000).unref?.();

  ctx.snapshot('signals', () => recent());
  ctx.snapshot('digest', () => digest());
  ctx.route('GET', '/api/signals', () => ({ signals: recent() }));
  ctx.route('GET', '/api/digest', () => digest());
  ctx.health('signals', () => ({ ok: Date.now() - lastOk < 10 * 60_000 || process.uptime() < 300, checks, threshold: `+${GROWTH_PCT}% in 1 h` }));
  ctx.onStop(() => clearInterval(t1));
  log('signals.ready', { threshold: GROWTH_PCT });
}
