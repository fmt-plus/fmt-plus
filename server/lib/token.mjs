// The product's own token for the token card: GET /api/token.
// The CA lives in <DATA_DIR>/token.json, written only by `npm run release -- --token <CA>` (deploy/release.sh) and
// removed by `--token ""`. No file (or a bad CA) = { on: false } and the card is hidden. The file is re-read within
// 2 s of a change, so no restart is needed. Market data: DexScreener, else GeckoTerminal, else Jupiter (market.mjs
// tokenMarket), cached 60 s, stale-while-revalidate. No price anywhere: priceUsd null, the card hides its stats row.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isAddress } from './base58.mjs';
import { swr, tokenMarket } from './market.mjs';

export function createToken({ dataDir, fetchFn }) {
  const file = join(dataDir, 'token.json');
  const cfg = { at: -Infinity, mtime: -2, ca: '' };
  const market = swr((ca) => tokenMarket(ca, { fetchFn }), { ttlMs: 60_000, name: 'token.market', max: 4 });

  function ca() {
    const t = Date.now();
    if (t - cfg.at < 2000) return cfg.ca;
    cfg.at = t;
    let mtime = -1;
    try {
      mtime = statSync(file).mtimeMs;
    } catch {
      mtime = -1;
    }
    if (mtime === cfg.mtime) return cfg.ca;
    cfg.mtime = mtime;
    cfg.ca = '';
    if (mtime < 0) return '';
    try {
      const j = JSON.parse(readFileSync(file, 'utf8'));
      const v = String(j.ca ?? '').trim();
      cfg.ca = isAddress(v) ? v : '';
    } catch {
      cfg.ca = '';
    }
    return cfg.ca;
  }

  function shape(c, m) {
    const out = {
      on: true,
      ca: c,
      listed: !!m?.listed,
      priceUsd: m?.priceUsd ?? null,
      mcapUsd: m?.mcapUsd ?? null,
      change24h: m?.change24h ?? null,
      image: m?.image ?? null,
      source: m?.source ?? null,
      links: {
        pumpfun: `https://pump.fun/coin/${c}`,
        chart: m?.chart || `https://dexscreener.com/solana/${c}`,
        solscan: `https://solscan.io/token/${c}`,
      },
    };
    return out;
  }

  /** Waits for the first market read (for /api/token). */
  async function view() {
    const c = ca();
    if (!c) return { on: false };
    return shape(c, await market.get(c));
  }

  /** Never waits (for /api/snapshot): what is cached now. */
  function peek() {
    const c = ca();
    if (!c) return { on: false };
    return shape(c, market.peek(c));
  }

  return { view, peek, ca };
}
