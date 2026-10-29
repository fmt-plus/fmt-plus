// Public market data, no keys: DexScreener (pairs, price, mcap, 24h change) and Jupiter lite (USD prices, SOL/USD).
// Every call has a timeout. swr() wraps a fetcher in a stale-while-revalidate cache: a fresh value is served from
// memory, a stale one is served at once while one refresh runs, a failure keeps the last good value.
import { logError } from './log.mjs';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEX = 'https://api.dexscreener.com';
const JUP = 'https://lite-api.jup.ag';
const UA = { accept: 'application/json', 'user-agent': 'trenchkit-app/1.0' };

export const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
/** Third-party names and symbols: printable, short. */
export const text = (v, max = 40) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '');
export function httpsUrl(v, host) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' && (!host || u.hostname === host || u.hostname.endsWith('.' + host)) ? u.href : null;
  } catch {
    return null;
  }
}

export async function getJson(url, { timeoutMs = 6000, fetchFn = globalThis.fetch } = {}) {
  const r = await fetchFn(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

/** Stale-while-revalidate cache around `fetcher(key)`. get(key) awaits only when nothing is cached yet. */
export function swr(fetcher, { ttlMs = 60_000, retryMs = 15_000, max = 500, name = 'swr' } = {}) {
  const map = new Map();
  function entry(key) {
    let e = map.get(key);
    if (!e) {
      if (map.size >= max) map.delete(map.keys().next().value);
      e = { v: undefined, at: -Infinity, inflight: null };
      map.set(key, e);
    }
    return e;
  }
  function refresh(key, e) {
    if (e.inflight) return e.inflight;
    e.inflight = Promise.resolve()
      .then(() => fetcher(key))
      .then((v) => {
        e.v = v;
        e.at = Date.now();
      })
      .catch((err) => {
        logError(`${name}.fail`, err);
        e.at = Date.now() - ttlMs + retryMs;
      })
      .finally(() => (e.inflight = null));
    return e.inflight;
  }
  return {
    async get(key = '') {
      const e = entry(key);
      if (Date.now() - e.at >= ttlMs) {
        const p = refresh(key, e);
        if (e.v === undefined) await p;
      }
      return e.v;
    },
    /** The cached value only (never waits); starts a refresh when stale. */
    peek(key = '') {
      const e = entry(key);
      if (Date.now() - e.at >= ttlMs) void refresh(key, e);
      return e.v;
    },
  };
}

/** The most liquid Solana pair of a token on DexScreener, normalized; { listed: false } when it has none yet. */
export async function dexToken(ca, opts) {
  const pairs = await getJson(`${DEX}/tokens/v1/solana/${ca}`, opts);
  const mine = (Array.isArray(pairs) ? pairs : []).filter((p) => p?.baseToken?.address === ca);
  if (!mine.length) return { listed: false };
  mine.sort((a, b) => (num(b.liquidity?.usd) || 0) - (num(a.liquidity?.usd) || 0));
  const p = mine[0];
  return {
    listed: true,
    name: text(p.baseToken.name),
    symbol: text(p.baseToken.symbol, 16),
    image: httpsUrl(p.info?.imageUrl),
    priceUsd: num(p.priceUsd),
    mcapUsd: num(p.marketCap) ?? num(p.fdv),
    change24h: num(p.priceChange?.h24),
    volume24h: num(p.volume?.h24),
    liquidityUsd: num(p.liquidity?.usd),
    chart: httpsUrl(p.url, 'dexscreener.com'),
  };
}

/** GeckoTerminal token: price, mcap (or FDV), name, image. Throws when it has no price. */
export async function geckoToken(ca, opts) {
  const j = await getJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${ca}`, opts);
  const a = j?.data?.attributes ?? {};
  const priceUsd = num(a.price_usd);
  if (!priceUsd) throw new Error('geckoterminal: no price');
  return {
    listed: true,
    name: text(a.name),
    symbol: text(a.symbol, 16),
    image: httpsUrl(a.image_url),
    priceUsd,
    mcapUsd: num(a.market_cap_usd) ?? num(a.fdv_usd),
    change24h: null,
    chart: `https://www.geckoterminal.com/solana/tokens/${ca}`,
  };
}

/** Jupiter price v3 for one token: price and 24 h change. Throws when it has no price. */
export async function jupToken(ca, opts) {
  const data = await getJson(`${JUP}/price/v3?ids=${ca}`, opts);
  const v = data?.[ca];
  const priceUsd = num(v?.usdPrice);
  if (!priceUsd) throw new Error('jupiter: no price');
  return { listed: true, priceUsd, mcapUsd: null, change24h: num(v.priceChange24h), chart: null };
}

/**
 * Market data for the token card with fallbacks: DexScreener → GeckoTerminal → Jupiter. Resolves to the first
 * source with a price, plus `source`; { listed: false } when none has one (the card then shows the CA and links only).
 */
export async function tokenMarket(ca, opts) {
  const tries = [
    ['dexscreener', dexToken],
    ['geckoterminal', geckoToken],
    ['jupiter', jupToken],
  ];
  let lastError = null;
  for (const [source, fn] of tries) {
    try {
      const m = await fn(ca, { timeoutMs: 5000, ...opts });
      if (m?.listed && m.priceUsd) return { ...m, source };
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) logError('token.market.allFailed', lastError);
  return { listed: false };
}

/** Jupiter USD prices for up to 50 mints: Map mint → usd. */
export async function jupPrices(mints, opts) {
  const ids = [...new Set(mints)].filter(Boolean).slice(0, 50);
  const out = new Map();
  if (!ids.length) return out;
  const data = await getJson(`${JUP}/price/v3?ids=${ids.join(',')}`, opts);
  for (const [mint, v] of Object.entries(data ?? {})) {
    const usd = num(v?.usdPrice);
    if (usd && usd > 0) out.set(mint, usd);
  }
  return out;
}

const solCache = swr(async () => (await jupPrices([SOL_MINT])).get(SOL_MINT) ?? null, { ttlMs: 30_000, name: 'market.sol' });
/** SOL/USD (cached 30 s); null until Jupiter has answered once. */
export const solUsd = () => solCache.get('sol');
export const solUsdNow = () => solCache.peek('sol') ?? null;
