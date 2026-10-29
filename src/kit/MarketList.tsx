// A market list (Polymarket, Kalshi; ported from flipfee's /market): a search box with a debounced callback, then one
// row per market: picture, title and subtitle, one stat, the highest bid and lowest ask, and a short ladder of its
// book. A row with `href` is a link (in-app paths use the router). Phones: the market on top, the numbers in three
// labelled columns, the ladder under them. Data only: the product fetches and passes `rows`.
import { memo, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { IconSearch } from '../ui/Icons.tsx';
import { DitherImg } from './render/Dither.tsx';
import { Ladder } from './Ladder.tsx';
import type { Level } from './Ladder.tsx';
import { linkProps } from './lib.ts';

export interface MarketRowData {
  id: string;
  title: string;
  subtitle?: string;
  image?: string | null;
  /** one number that matters for this market (volume, fees, odds) and its column name */
  stat?: string;
  statLabel?: string;
  bestBid?: number | null;
  bestAsk?: number | null;
  book?: { asks: Level[]; bids: Level[] };
  href?: string;
}

export interface MarketListLabels {
  label: string;
  search: string;
  colMarket: string;
  colBid: string;
  colAsk: string;
  colBook: string;
  empty: string;
  none: string;
  bookEmpty: string;
}

export interface MarketListProps {
  rows: MarketRowData[] | null;
  /** called with the trimmed query after `debounceMs` of quiet (at once when cleared) */
  onSearch?: (q: string) => void;
  query?: string;
  debounceMs?: number;
  /** the stat column's head (rows can also carry their own statLabel) */
  statLabel?: string;
  fmtPrice?: (p: number) => string;
  unit?: string;
  labels?: Partial<MarketListLabels>;
  /** a skeleton while the first rows load */
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

const defPrice = (p: number) => p.toFixed(2);

const Row = memo(function Row({ r, L, statLabel, fmtPrice, unit }: { r: MarketRowData; L: MarketListLabels; statLabel?: string; fmtPrice: (p: number) => string; unit?: string }) {
  const body = (
    <>
      <span className="k-mk-id">
        <DitherImg src={r.image} label={r.title} seed={r.id} size={44} vt={'mk-pic-' + r.id} />
        <span className="k-mk-name">
          <b>{r.title}</b>
          {r.subtitle && <span>{r.subtitle}</span>}
        </span>
      </span>
      <span className="k-mk-stat mono">
        <em className="k-mk-k">{r.statLabel ?? statLabel}</em>
        {r.stat ?? '—'}
      </span>
      <span className="k-mk-best is-bid mono">
        <em className="k-mk-k">{L.colBid}</em>
        {r.bestBid != null ? fmtPrice(r.bestBid) : '—'}
      </span>
      <span className="k-mk-best is-ask mono">
        <em className="k-mk-k">{L.colAsk}</em>
        {r.bestAsk != null ? fmtPrice(r.bestAsk) : '—'}
      </span>
      <span className="k-mk-book">
        {r.book && (r.book.asks.length || r.book.bids.length) ? <Ladder asks={r.book.asks} bids={r.book.bids} compact fmtPrice={fmtPrice} unit={unit} /> : <span className="k-mk-empty">{L.bookEmpty}</span>}
      </span>
    </>
  );
  return r.href ? (
    <a className="k-mk-row" {...linkProps(r.href)} data-id={r.id}>
      {body}
    </a>
  ) : (
    <div className="k-mk-row" data-id={r.id}>
      {body}
    </div>
  );
});

export function MarketList({ rows, onSearch, query = '', debounceMs = 250, statLabel, fmtPrice = defPrice, unit, labels, loading = false, className, children }: MarketListProps) {
  const L: MarketListLabels = { ...copy.kit.market, ...labels };
  const [q, setQ] = useState(query);
  const first = useRef(true);
  const cb = useRef(onSearch);
  useEffect(() => {
    cb.current = onSearch;
  });
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const term = q.trim();
    const t = window.setTimeout(() => cb.current?.(term), term ? debounceMs : 0);
    return () => window.clearTimeout(t);
  }, [q, debounceMs]);

  return (
    <section className={'k-mk' + (className ? ' ' + className : '')} aria-label={L.label}>
      <div className="k-mk-top">
        {children}
        {onSearch && (
          <label className="k-mk-search">
            <IconSearch size={18} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search} aria-label={L.search} autoComplete="off" spellCheck={false} />
          </label>
        )}
      </div>
      {rows === null || loading ? (
        <div className="k-mk-list" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="k-sk k-mk-sk" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="k-empty">{q.trim() ? L.none : L.empty}</p>
      ) : (
        <div className="k-mk-list">
          <div className="k-mk-row k-mk-head" aria-hidden="true">
            <span>{L.colMarket}</span>
            <span>{statLabel ?? rows[0]?.statLabel ?? ''}</span>
            <span>{L.colBid}</span>
            <span>{L.colAsk}</span>
            <span>{L.colBook}</span>
          </div>
          {rows.map((r) => (
            <Row key={r.id} r={r} L={L} statLabel={statLabel} fmtPrice={fmtPrice} unit={unit} />
          ))}
        </div>
      )}
    </section>
  );
}
