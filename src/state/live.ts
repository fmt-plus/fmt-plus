// Live data: last snapshot from localStorage → the inline-prefetched snapshot → SSE `trade`.
// Swaps come from server/routes/wallets.mjs (Helius). One wallet's page reads /api/w/:addr on demand.
import { createStore } from '../core/store.ts';
import { saveCache, startLive } from '../core/live.ts';
import type { Conn } from '../core/live.ts';
import { api } from '../core/http.ts';
import { brand } from '../brand.ts';

export interface Trade {
  sig: string;
  w: string;
  name: string;
  side: 'buy' | 'sell';
  sol: number;
  mint: string;
  sym: string | null;
  t: number;
  score: number;
}
export interface Signal {
  id: string;
  mint: string;
  sym: string | null;
  change1h: number;
  priceUsd: number | null;
  mcapUsd: number | null;
  liqUsd: number | null;
  t: number;
  wallets: { w: string; name: string }[];
}
export interface Digest {
  from: number;
  to: number;
  trades: number;
  buys: number;
  sells: number;
  sol: number;
  topTrade: { name: string; side: 'buy' | 'sell'; sol: number; sym: string | null; mint: string } | null;
  signals: { sym: string | null; change1h: number; mint: string }[];
}
export interface BoardRow {
  name: string;
  w: string;
  /** On fmt+'s own top list (else added by its owner). */
  top: boolean;
  sol: number | null;
  trades: number;
  volume: number;
}
export interface Swap {
  side: 'buy' | 'sell';
  sol: number;
  mint: string;
  sym?: string;
  t: number;
  sig: string;
}
export interface WalletView {
  w: string;
  name: string | null;
  sol: number;
  solUsd: number | null;
  bagsUsd: number;
  bags: { mint: string; sym: string; usd: number }[];
  swaps: Swap[];
  /** The trade numbers cover the wallet's last `count` trades, from `from` to `to` (ms). */
  count: number;
  buys: number;
  sells: number;
  from: number | null;
  to: number | null;
  tracked: boolean;
  flow: { in: number; out: number; net: number };
  /** Tokens traded in the window; `closed` = bought and sold; `wins` = sells brought back more SOL than buys cost. */
  tokens: number;
  closed: number;
  wins: number;
  winRate: number | null;
  style: { size: number; perHour: number; kind: 'flipper' | 'holder' };
  at: number;
}
export interface TokenView {
  on: boolean;
  ca?: string;
  listed?: boolean;
  priceUsd?: number | null;
  mcapUsd?: number | null;
  change24h?: number | null;
  image?: string | null;
  links?: { pumpfun: string; chart: string; solscan: string };
}
interface Snapshot {
  at: number;
  events?: Trade[] | null;
  board?: BoardRow[] | null;
  solUsd?: number | null;
  token?: TokenView | null;
  signals?: Signal[] | null;
  digest?: Digest | null;
}
interface LiveState {
  signals: Signal[];
  digest: Digest | null;
  events: Trade[];
  board: BoardRow[];
  solUsd: number | null;
  token: TokenView | null;
  conn: Conn;
  fresh: boolean;
}

export const COOKER = '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6';
const KEEP = 80;
export const live = createStore<LiveState>({ signals: [], digest: null, events: [], board: [], solUsd: null, token: null, conn: 'connecting', fresh: false });
/** Swaps that arrived over SSE while the page was open: their rows glow once. */
export const arrived = new Set<string>();
const listeners = new Set<(t: Trade) => void>();
/** Called for every swap that arrives live (pushes use it). */
export function onTrade(fn: (t: Trade) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function merge(incoming: Trade[], prev: Trade[]): Trade[] {
  const seen = new Set<string>();
  const out: Trade[] = [];
  for (const e of [...incoming, ...prev]) {
    if (!e || typeof e.sig !== 'string' || seen.has(e.sig)) continue;
    seen.add(e.sig);
    out.push(e);
  }
  return out.sort((a, b) => b.t - a.t).slice(0, KEEP);
}

let started = false;
export function startLiveData(): void {
  if (started) return;
  started = true;
  const cacheKey = `${brand.slug}.snap.v2`;
  startLive<Snapshot>({
    cacheKey,
    onSnapshot(s, from) {
      live.set((st) => ({
        events: Array.isArray(s.events) ? merge(s.events, from === 'net' ? st.events : []) : st.events,
        board: Array.isArray(s.board) && s.board.length ? s.board : st.board,
        solUsd: s.solUsd ?? st.solUsd,
        token: s.token ?? st.token,
        signals: Array.isArray(s.signals) ? s.signals : st.signals,
        digest: s.digest ?? st.digest,
        fresh: st.fresh || from === 'net',
      }));
    },
    on: {
      signal(list) {
        const add = (list as Signal[]).filter((x) => x && x.id);
        live.set((st) => ({ signals: [...add.reverse(), ...st.signals.filter((x) => !add.some((a) => a.id === x.id))].slice(0, 30) }));
      },
      trade(list) {
        const add = (list as Trade[]).filter((t) => t && t.sig);
        for (const t of add) {
          arrived.add(t.sig);
          listeners.forEach((fn) => fn(t));
        }
        if (arrived.size > 500) arrived.clear();
        live.set((st) => ({ events: merge(add, st.events) }));
      },
    },
    onConn: (conn) => {
      live.set({ conn });
      document.documentElement.dataset.live = conn === 'live' ? '1' : '0';
    },
  });
  live.subscribe(() => {
    const s = live.get();
    if (s.fresh) saveCache(cacheKey, { at: Date.now(), events: s.events.slice(0, 40), board: s.board, solUsd: s.solUsd, token: s.token });
  });
  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    void api<{ board: BoardRow[] }>('/board')
      .then((r) => live.set({ board: r.board }))
      .catch(() => undefined);
    void api<Digest>('/digest')
      .then((d) => live.set({ digest: d }))
      .catch(() => undefined);
  }, 60000);
}

/** One wallet per address, cached for 30 s. */
export const wallets = createStore<Record<string, { v?: WalletView; err?: boolean; at: number }>>({});
export function loadWallet(w: string, force = false): void {
  const cur = wallets.get()[w];
  if (!force && cur && (cur.v || cur.err) && Date.now() - cur.at < 30000) return;
  void api<WalletView>(`/w/${w}`)
    .then((v) => wallets.set((s) => ({ ...s, [w]: { v, at: Date.now() } })))
    .catch(() => wallets.set((s) => ({ ...s, [w]: { ...s[w], err: !s[w]?.v, at: Date.now() } })));
}
