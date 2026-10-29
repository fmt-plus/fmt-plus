// An order book as a ladder (Polymarket, Hyperliquid; ported from flipfee): asks on top with the lowest ask nearest
// the middle, the spread, then bids with the highest bid on top. Each level shows its price, its size and a dithered
// depth bar (bids in --up, asks in --down); the viewer's own levels carry a dot. With `onPick` every level is a button
// (fill an order form from it). `compact`: three narrow rows a side, for a list row. Data only: no server calls.
import { memo } from 'react';
import { copy } from '../copy.ts';
import { compact as compactNum, fill } from '../core/format.ts';

export interface Level {
  price: number;
  size: number;
  /** the viewer has an order at this level */
  mine?: boolean;
}
export type Side = 'bid' | 'ask';

export interface BookSides {
  asks: Level[];
  bids: Level[];
}

/** Sorted sides (asks low → high, bids high → low), the best prices and the spread. */
export function bookStats({ asks, bids }: BookSides): { asks: Level[]; bids: Level[]; bestBid: number | null; bestAsk: number | null; spread: number | null; mid: number | null } {
  const a = [...asks].filter((l) => l.size > 0).sort((x, y) => x.price - y.price);
  const b = [...bids].filter((l) => l.size > 0).sort((x, y) => y.price - x.price);
  const bestAsk = a[0]?.price ?? null;
  const bestBid = b[0]?.price ?? null;
  const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null;
  const mid = bestAsk !== null && bestBid !== null ? (bestAsk + bestBid) / 2 : null;
  return { asks: a, bids: b, bestBid, bestAsk, spread, mid };
}

export interface LadderLabels {
  label: string;
  price: string;
  size: string;
  spread: string;
  bid: string;
  ask: string;
  mine: string;
  asksEmpty: string;
  bidsEmpty: string;
  /** a level's button name: {side} {price} {size} */
  level: string;
}

export interface LadderProps extends BookSides {
  /** levels per side (default 6; 3 when compact) */
  rows?: number;
  compact?: boolean;
  /** price and size text (defaults: 2 decimals · 9.42K) */
  fmtPrice?: (p: number) => string;
  fmtSize?: (s: number) => string;
  /** units after the spread and in the column heads, e.g. "¢", "SOL", "shares" */
  unit?: string;
  sizeUnit?: string;
  labels?: Partial<LadderLabels>;
  onPick?: (side: Side, price: number) => void;
  className?: string;
}

const defPrice = (p: number) => p.toFixed(2);
const defSize = (s: number) => compactNum(s);

export const Ladder = memo(function Ladder({ asks, bids, rows, compact = false, fmtPrice = defPrice, fmtSize = defSize, unit, sizeUnit, labels, onPick, className }: LadderProps) {
  const L: LadderLabels = { ...copy.kit.ladder, ...labels };
  const n = rows ?? (compact ? 3 : 6);
  const s = bookStats({ asks, bids });
  const showAsks = s.asks.slice(0, n).reverse();
  const showBids = s.bids.slice(0, n);
  const max = Math.max(1e-12, ...showAsks.map((l) => l.size), ...showBids.map((l) => l.size));
  const line = (side: Side, l: Level) => {
    const body = (
      <>
        <i className="k-lad-bar" style={{ width: Math.max(3, (100 * l.size) / max) + '%' }} aria-hidden="true" />
        <span className="k-lad-p mono">{fmtPrice(l.price)}</span>
        <span className="k-lad-s mono">{fmtSize(l.size)}</span>
        {!compact && <span className="k-lad-tag">{l.mine && <i className="k-lad-mine" title={L.mine} />}</span>}
      </>
    );
    const cls = 'k-lad-row is-' + side + (l.mine ? ' is-mine' : '');
    const name = fill(L.level, { side: side === 'bid' ? L.bid : L.ask, price: fmtPrice(l.price) + (unit ? ' ' + unit : ''), size: fmtSize(l.size) + (sizeUnit ? ' ' + sizeUnit : '') });
    return onPick ? (
      <button key={side + l.price} type="button" className={cls} onClick={() => onPick(side, l.price)} aria-label={name}>
        {body}
      </button>
    ) : (
      <div key={side + l.price} className={cls} role="listitem" aria-label={name}>
        {body}
      </div>
    );
  };
  return (
    <div className={'k-ladder' + (compact ? ' is-compact' : '') + (className ? ' ' + className : '')} role="group" aria-label={L.label}>
      {!compact && (
        <div className="k-lad-head" aria-hidden="true">
          <span>
            {L.price}
            {unit ? ` · ${unit}` : ''}
          </span>
          <span>
            {L.size}
            {sizeUnit ? ` · ${sizeUnit}` : ''}
          </span>
          <span />
        </div>
      )}
      <div className="k-lad-side is-ask" role={onPick ? 'group' : 'list'} aria-label={L.ask}>
        {showAsks.length ? showAsks.map((l) => line('ask', l)) : <p className="k-lad-none" role={onPick ? undefined : 'listitem'}>{L.asksEmpty}</p>}
      </div>
      <div className="k-lad-mid mono">
        <span className="k-lad-k">{L.spread}</span> {s.spread !== null ? fmtPrice(s.spread) + (unit ? ' ' + unit : '') : '—'}
      </div>
      <div className="k-lad-side is-bid" role={onPick ? 'group' : 'list'} aria-label={L.bid}>
        {showBids.length ? showBids.map((l) => line('bid', l)) : <p className="k-lad-none" role={onPick ? undefined : 'listitem'}>{L.bidsEmpty}</p>}
      </div>
    </div>
  );
});
