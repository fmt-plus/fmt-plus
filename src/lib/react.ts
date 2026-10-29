import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Store } from '../core/store.ts';

/** Reads a slice of a store; re-renders only when the slice changes (Object.is). */
export function useStore<T extends object, R>(store: Store<T>, pick: (s: T) => R): R {
  const last = useRef<{ s: T; r: R } | null>(null);
  const get = () => {
    const s = store.get();
    if (last.current && last.current.s === s) return last.current.r;
    const r = pick(s);
    if (last.current && Object.is(last.current.r, r)) {
      last.current = { s, r: last.current.r };
      return last.current.r;
    }
    last.current = { s, r };
    return r;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}

const tickers = new Map<number, { now: number; subs: Set<() => void>; id: number }>();
/** The current time, updated every `ms` (one shared timer per interval). */
export function useNow(ms = 1000): number {
  let t = tickers.get(ms);
  if (!t) {
    const entry = { now: Date.now(), subs: new Set<() => void>(), id: 0 };
    entry.id = window.setInterval(() => {
      entry.now = Date.now();
      entry.subs.forEach((f) => f());
    }, ms);
    tickers.set(ms, entry);
    t = entry;
  }
  const tick = t;
  return useSyncExternalStore(
    (f) => {
      tick.subs.add(f);
      return () => tick.subs.delete(f);
    },
    () => tick.now,
    () => tick.now,
  );
}

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [query]);
  return on;
}

export const PHONE = '(max-width: 760px)';
