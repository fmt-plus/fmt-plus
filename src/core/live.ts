// Live data from the first second:
//   1. paint the last snapshot from localStorage (synchronously, before the first render)
//   2. take the snapshot index.html asked for before the JS loaded (window.__tkBoot), else fetch /api/snapshot
//   3. SSE /api/stream; events are batched once per animation frame; the stream reconnects on its own
//      (backoff, a 30 s silence watchdog, tab focus, back online) and re-reads the snapshot after every reconnect.
export type Conn = 'connecting' | 'live' | 'retry';

export interface LiveOptions<S> {
  /** localStorage key for the last snapshot. */
  cacheKey: string;
  /** A snapshot arrived ('cache' = from localStorage, 'net' = fresh). */
  onSnapshot(s: S, from: 'cache' | 'net'): void;
  /** SSE handlers by event type; each gets the events of one frame, oldest first. */
  on: Record<string, (list: unknown[]) => void>;
  onConn?(c: Conn): void;
  /** Max age of a cached snapshot worth painting (default 6 h). */
  cacheMaxMs?: number;
}

interface Boot {
  at: number;
  snap?: Promise<unknown>;
}
declare global {
  interface Window {
    __tkBoot?: Boot;
  }
}

const SILENCE_MS = 30000;

export function readCache<S>(key: string, maxMs = 6 * 3600e3): S | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const c = JSON.parse(raw) as { at: number; s: S };
    return c && Date.now() - c.at < maxMs ? c.s : null;
  } catch {
    return null;
  }
}

let saveTimer = 0;
/** Keep the latest state for the next visit (throttled). */
export function saveCache(key: string, s: unknown): void {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), s }));
    } catch {
      // storage is optional
    }
  }, 1500);
}

async function fetchSnapshot<S>(): Promise<S | null> {
  try {
    const r = await fetch('/api/snapshot', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    return r.ok ? ((await r.json()) as S) : null;
  } catch {
    return null;
  }
}

export function startLive<S>(o: LiveOptions<S>): () => void {
  const cached = readCache<S>(o.cacheKey, o.cacheMaxMs);
  if (cached) o.onSnapshot(cached, 'cache');

  const boot = window.__tkBoot;
  window.__tkBoot = undefined;
  const first = boot?.snap && Date.now() - boot.at < 20000 ? (boot.snap as Promise<S | null>) : fetchSnapshot<S>();
  void first.then((s) => {
    if (s) o.onSnapshot(s, 'net');
    else void fetchSnapshot<S>().then((s2) => s2 && o.onSnapshot(s2, 'net'));
  });

  let es: EventSource | null = null;
  let stopped = false;
  let backoff = 1000;
  let retryTimer = 0;
  let last = Date.now();
  let opens = 0;
  let raf = 0;
  let flushTimer = 0;
  const queue = new Map<string, unknown[]>();

  const flush = () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(flushTimer);
    raf = 0;
    flushTimer = 0;
    for (const [type, list] of queue) {
      queue.delete(type);
      try {
        o.on[type]?.(list);
      } catch (e) {
        console.warn('live handler', type, e);
      }
    }
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(flush);
    if (!flushTimer) flushTimer = window.setTimeout(flush, 1000); // hidden tabs get no frames
  };

  const close = () => {
    if (es) {
      es.onerror = null;
      es.close();
      es = null;
    }
  };
  const retry = () => {
    close();
    if (stopped) return;
    o.onConn?.('retry');
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(open, backoff);
    backoff = Math.min(15000, backoff * 1.8);
  };

  function open() {
    if (stopped) return;
    close();
    o.onConn?.(opens ? 'retry' : 'connecting');
    const src = new EventSource('/api/stream');
    es = src;
    last = Date.now();
    src.onopen = () => {
      backoff = 1000;
      last = Date.now();
      o.onConn?.('live');
      if (opens > 0) void fetchSnapshot<S>().then((s) => s && o.onSnapshot(s, 'net'));
      opens++;
    };
    for (const type of Object.keys(o.on)) {
      src.addEventListener(type, (m) => {
        last = Date.now();
        try {
          const data = JSON.parse((m as MessageEvent<string>).data) as unknown;
          const list = queue.get(type) ?? [];
          list.push(data);
          if (list.length > 300) list.splice(0, list.length - 300);
          queue.set(type, list);
          schedule();
        } catch {
          // a bad frame is skipped
        }
      });
    }
    src.addEventListener('ping', () => (last = Date.now()));
    src.onerror = () => {
      if (src.readyState === EventSource.CLOSED) retry();
      else o.onConn?.('retry');
    };
  }

  // pings arrive every 15 s; a long silence means a dead connection behind a proxy
  const watchdog = window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - last > SILENCE_MS) retry();
  }, 5000);
  const onVis = () => {
    if (document.visibilityState === 'visible' && Date.now() - last > SILENCE_MS) retry();
  };
  const onOnline = () => retry();
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('online', onOnline);
  open();

  return () => {
    stopped = true;
    close();
    window.clearInterval(watchdog);
    window.clearTimeout(retryTimer);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('online', onOnline);
  };
}
