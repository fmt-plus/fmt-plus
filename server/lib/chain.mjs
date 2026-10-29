// Solana reads for fmt+, Helius first and the public RPC as the fallback.
// Helius is cheap only for plain RPC (1 credit); its parsed-history API costs ~100 credits a call, so polling asks
// for new signatures over RPC and parses only the new ones. A 429 / "max usage" turns Helius off for an hour and
// every read goes to api.mainnet-beta.solana.com (plus Jupiter prices and DexScreener symbols).
import { getJson, jupPrices } from './market.mjs';

export const SOL = 'So11111111111111111111111111111111111111112';
export const STABLE = new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCecdNXHXP2']);
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGqPvYzF6YqWx7v2iDp8x', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
const round2 = (x) => Math.round(x * 100) / 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the public RPC allows a few calls a second per IP: one queue for the whole process, retries after a 429
const GAP_MS = 250;
let nextSlot = 0;
async function slot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP_MS;
  if (at > now) await sleep(at - now);
}

/** A Helius parsed tx → a swap seen from `w` (the wallet paid the fee), or null. */
export function heliusToSwap(tx, w) {
  if (tx.feePayer !== w || tx.transactionError) return null;
  const me = (tx.accountData || []).find((a) => a.account === w);
  if (!me) return null;
  const mine = (tx.tokenTransfers || []).filter((t) => t.toUserAccount === w || t.fromUserAccount === w);
  const wsol = mine.filter((t) => t.mint === SOL).reduce((x, t) => x + (t.toUserAccount === w ? t.tokenAmount : -t.tokenAmount), 0);
  const sol = (me.nativeBalanceChange || 0) / 1e9 + wsol;
  const tok = mine.filter((t) => t.mint !== SOL && !STABLE.has(t.mint));
  if (!tok.length || Math.abs(sol) < 0.05) return null;
  return { side: sol < 0 ? 'buy' : 'sell', sol: round2(Math.abs(sol)), mint: tok[0].mint, t: tx.timestamp * 1000, sig: tx.signature };
}

/** A getTransaction (jsonParsed) result → the same swap shape, or null. */
export function rawToSwap(tx, sig, w) {
  if (!tx?.meta || tx.meta.err) return null;
  const keys = (tx.transaction?.message?.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey));
  if (keys[0] !== w) return null;
  const i = keys.indexOf(w);
  const native = (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9;
  const delta = new Map();
  for (const b of tx.meta.preTokenBalances || []) if (b.owner === w) delta.set(b.mint, (delta.get(b.mint) || 0) - (b.uiTokenAmount?.uiAmount || 0));
  for (const b of tx.meta.postTokenBalances || []) if (b.owner === w) delta.set(b.mint, (delta.get(b.mint) || 0) + (b.uiTokenAmount?.uiAmount || 0));
  const sol = native + (delta.get(SOL) || 0);
  let mint = null;
  let amt = 0;
  for (const [m, d] of delta) {
    if (m === SOL || STABLE.has(m) || !d) continue;
    if (mint === null || Math.abs(d) > Math.abs(amt)) [mint, amt] = [m, d];
  }
  if (!mint || Math.abs(sol) < 0.05) return null;
  const side = amt > 0 ? 'buy' : 'sell';
  if ((side === 'buy') !== sol < 0) return null; // tokens in while SOL came in too: an airdrop or a transfer
  return { side, sol: round2(Math.abs(sol)), mint, t: (tx.blockTime || 0) * 1000, sig };
}

export function createChain({ key, log }) {
  let heliusOffUntil = 0;
  const helius = () => Boolean(key) && Date.now() > heliusOffUntil;
  const status = () => ({ helius: Boolean(key), heliusOn: helius(), heliusOffUntil: heliusOffUntil || null });
  const spent = (e) => {
    if (/429|max usage|credits/i.test(String(e?.message || e))) {
      if (Date.now() > heliusOffUntil) log('chain.helius.off', { e: String(e.message || e).slice(0, 60) });
      heliusOffUntil = Date.now() + 3600_000;
      return true;
    }
    return false;
  };

  async function post(url, body, timeoutMs = 12000) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 60)}`);
    return JSON.parse(text);
  }
  async function rawRpc(url, method, params) {
    const j = await post(url, { jsonrpc: '2.0', id: 1, method, params });
    if (j.error) throw new Error(j.error.message || 'rpc');
    return j.result;
  }
  async function publicRpc(method, params) {
    for (let i = 0; ; i++) {
      await slot();
      try {
        return await rawRpc(PUBLIC_RPC, method, params);
      } catch (e) {
        if (i >= 2 || !/429/.test(String(e.message))) throw e;
        await sleep(1500 * (i + 1));
      }
    }
  }
  /** Plain RPC: Helius when it has credits, else the public endpoint. */
  async function rpc(method, params) {
    if (helius()) {
      try {
        return await rawRpc(`https://mainnet.helius-rpc.com/?api-key=${key}`, method, params);
      } catch (e) {
        if (!spent(e)) throw e;
      }
    }
    return publicRpc(method, params);
  }
  /** Helius-only calls (DAS, parsed history); null when Helius is off or out of credits. */
  async function heliusOnly(fn) {
    if (!helius()) return null;
    try {
      return await fn();
    } catch (e) {
      if (spent(e)) return null;
      throw e;
    }
  }

  async function rawSwaps(w, sigs) {
    const out = [];
    for (const s of sigs) {
      try {
        const tx = await rpc('getTransaction', [s, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
        const sw = rawToSwap(tx, s, w);
        if (sw) out.push(sw);
      } catch (e) {
        log('chain.tx.fail', { e: String(e.message || e).slice(0, 60) });
      }
    }
    return out;
  }

  // symbols: Helius DAS, else DexScreener (batched), cached a day
  const symbols = new Map();
  async function symbolsFor(mints) {
    const need = [...new Set(mints)].filter((m) => !symbols.has(m));
    if (need.length) {
      const viaHelius = await heliusOnly(async () => {
        const r = await post(`https://mainnet.helius-rpc.com/?api-key=${key}`, { jsonrpc: '2.0', id: 1, method: 'getAssetBatch', params: { ids: need.slice(0, 100) } });
        if (r.error) throw new Error(r.error.message);
        for (const a of r.result || []) if (a?.id) symbols.set(a.id, a.content?.metadata?.symbol || a.token_info?.symbol || a.id.slice(0, 4));
        return true;
      }).catch(() => null);
      if (!viaHelius) {
        for (let i = 0; i < need.length; i += 30) {
          try {
            const pairs = await getJson(`https://api.dexscreener.com/tokens/v1/solana/${need.slice(i, i + 30).join(',')}`, { timeoutMs: 8000 });
            for (const p of Array.isArray(pairs) ? pairs : []) if (p?.baseToken?.address) symbols.set(p.baseToken.address, p.baseToken.symbol);
          } catch {}
        }
      }
      for (const m of need) if (!symbols.has(m)) symbols.set(m, m.slice(0, 4));
      if (symbols.size > 20000) symbols.clear();
    }
    return (m) => symbols.get(m) ?? m.slice(0, 4);
  }

  return {
    status,
    rpc,
    async balance(w) {
      return (await rpc('getBalance', [w])).value / 1e9;
    },
    /** The wallet's last swaps (newest first) for its stats page. */
    async history(w) {
      const viaHelius = await heliusOnly(() => getJson(`https://api.helius.xyz/v0/addresses/${w}/transactions?api-key=${key}&type=SWAP&limit=100`, { timeoutMs: 12000 }));
      let swaps;
      if (viaHelius) swaps = viaHelius.map((t) => heliusToSwap(t, w)).filter(Boolean);
      else {
        const sigs = (await rpc('getSignaturesForAddress', [w, { limit: 30 }])).filter((s) => !s.err).map((s) => s.signature);
        swaps = await rawSwaps(w, sigs);
      }
      const sym = await symbolsFor(swaps.slice(0, 30).map((s) => s.mint));
      for (const s of swaps) s.sym = sym(s.mint);
      return swaps.sort((a, b) => b.t - a.t);
    },
    /** New swaps since `seen` (a Set of signatures, updated in place). `first`: only fill `seen`. */
    async fresh(w, seen, first = false) {
      const sigs = (await rpc('getSignaturesForAddress', [w, { limit: first ? 25 : 15 }])).filter((s) => !s.err && !seen.has(s.signature)).map((s) => s.signature);
      if (!sigs.length) return [];
      for (const s of sigs) seen.add(s);
      if (first) return [];
      const viaHelius = await heliusOnly(async () => {
        const r = await post(`https://api.helius.xyz/v0/transactions?api-key=${key}`, { transactions: sigs });
        return Array.isArray(r) ? r.map((t) => heliusToSwap(t, w)).filter(Boolean) : [];
      });
      const swaps = viaHelius ?? (await rawSwaps(w, sigs.slice(0, 8)));
      const sym = await symbolsFor(swaps.map((s) => s.mint));
      for (const s of swaps) s.sym = sym(s.mint);
      return swaps;
    },
    /** Token holdings worth more than $1, biggest first. */
    async bags(w) {
      const viaHelius = await heliusOnly(async () => {
        const r = await post(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
          jsonrpc: '2.0',
          id: 1,
          method: 'getAssetsByOwner',
          params: { ownerAddress: w, displayOptions: { showFungible: true }, limit: 200 },
        });
        if (r.error) throw new Error(r.error.message);
        return (r.result?.items || [])
          .filter((a) => a.token_info?.price_info?.total_price > 1)
          .map((a) => ({ mint: a.id, sym: a.content?.metadata?.symbol || a.id.slice(0, 4), usd: Math.round(a.token_info.price_info.total_price) }));
      });
      let bags = viaHelius;
      if (!bags) {
        const held = new Map();
        for (const programId of TOKEN_PROGRAMS) {
          const r = await rpc('getTokenAccountsByOwner', [w, { programId }, { encoding: 'jsonParsed' }]).catch(() => ({ value: [] }));
          for (const a of r.value || []) {
            const info = a.account?.data?.parsed?.info;
            const amt = info?.tokenAmount?.uiAmount || 0;
            if (amt > 0 && info.mint !== SOL) held.set(info.mint, (held.get(info.mint) || 0) + amt);
          }
        }
        const mints = [...held.keys()].slice(0, 50);
        const prices = mints.length ? await jupPrices(mints).catch(() => new Map()) : new Map();
        const sym = await symbolsFor(mints.filter((m) => (prices.get(m) || 0) * held.get(m) > 1));
        bags = mints
          .map((m) => ({ mint: m, sym: sym(m), usd: Math.round((prices.get(m) || 0) * held.get(m)) }))
          .filter((b) => b.usd > 1);
      }
      return bags.sort((a, b) => b.usd - a.usd).slice(0, 12);
    },
  };
}
