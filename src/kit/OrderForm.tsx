// A limit-order form (Polymarket, Kalshi; ported from flipfee): side tabs, a price stepper on the tick, size chips,
// the total, a warning when the price would cross the book, and one place button. It holds no server logic:
// `onPlace(side, price, size)` does the work (a returned promise shows the button busy until it settles).
// Pair it with <Ladder onPick>: pass `preset={{ side, price, at: Date.now() }}` to fill the form from a level.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { compact as compactNum } from '../core/format.ts';
import { decimalsOf, toTick } from './lib.ts';
import type { Side } from './Ladder.tsx';

export interface OrderLabels {
  label: string;
  sides: string;
  bid: string;
  ask: string;
  price: string;
  size: string;
  total: string;
  less: string;
  more: string;
  placeBid: string;
  placeAsk: string;
  crossBid: string;
  crossAsk: string;
}

export interface OrderFormProps {
  bestBid?: number | null;
  bestAsk?: number | null;
  /** price step (default 0.01) and bounds */
  tick?: number;
  min?: number;
  max?: number;
  /** size choices (the first is picked at the start unless `size` is given) */
  sizes: number[];
  size?: number;
  side?: Side;
  /** fill the form from outside (a ladder pick); `at` makes a repeat pick of the same level apply again */
  preset?: { side: Side; price: number; at: number } | null;
  unit?: string;
  sizeUnit?: string;
  fmtSize?: (s: number) => string;
  fmtTotal?: (t: number) => string;
  labels?: Partial<OrderLabels>;
  onPlace: (side: Side, price: number, size: number) => unknown;
  /** a line under the button (fees, how it settles) */
  note?: ReactNode;
  className?: string;
}

export function OrderForm({ bestBid = null, bestAsk = null, tick = 0.01, min, max, sizes, size: size0, side: side0 = 'bid', preset, unit, sizeUnit, fmtSize = (s) => compactNum(s), fmtTotal, labels, onPlace, note, className }: OrderFormProps) {
  const L: OrderLabels = { ...copy.kit.order, ...labels };
  const dp = decimalsOf(tick);
  const lo = min ?? tick;
  const hi = max ?? Number.POSITIVE_INFINITY;
  const [side, setSide] = useState<Side>(side0);
  const [price, setPrice] = useState('');
  const [size, setSize] = useState<number>(size0 ?? sizes[0] ?? 1);
  const [busy, setBusy] = useState(false);
  const show = (x: number) => toTick(x, tick).toFixed(dp);

  // a first price that rests in the book: a tick under the lowest ask (buy) or over the highest bid (sell)
  useEffect(() => {
    if (price) return;
    const p = side === 'bid' ? (bestAsk !== null ? bestAsk - tick : bestBid) : bestBid !== null ? bestBid + tick : bestAsk;
    if (p !== null && p >= lo) setPrice(show(p));
  }, [side, bestBid, bestAsk]);

  useEffect(() => {
    if (!preset) return;
    setSide(preset.side);
    setPrice(show(preset.price));
  }, [preset?.at]);

  const p = Number(price);
  const valid = price !== '' && Number.isFinite(p) && p >= lo && p <= hi;
  const crosses = valid && (side === 'bid' ? bestAsk !== null && p >= bestAsk : bestBid !== null && p <= bestBid);
  const total = valid ? p * size : 0;
  const step = (dir: 1 | -1) => setPrice(show(Math.min(hi, Math.max(lo, (valid ? p : (bestBid ?? bestAsk ?? lo)) + dir * tick))));

  const submit = async () => {
    if (!valid || crosses || busy) return;
    setBusy(true);
    try {
      await onPlace(side, toTick(p, tick), size);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={'k-order' + (className ? ' ' + className : '')}
      aria-label={L.label}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="k-of-sides" role="tablist" aria-label={L.sides}>
        {(['bid', 'ask'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={side === s}
            className={'k-of-side is-' + s + (side === s ? ' is-on' : '')}
            onClick={() => {
              if (s === side) return;
              setSide(s);
              setPrice('');
            }}
          >
            {s === 'bid' ? L.bid : L.ask}
          </button>
        ))}
      </div>
      <label className="k-of-field">
        <span className="k-of-k">{L.price}</span>
        <span className="k-of-input">
          <button type="button" className="k-of-step" onClick={() => step(-1)} aria-label={L.less}>
            −
          </button>
          <input className="mono" inputMode="decimal" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
          {unit && <em className="k-of-u mono">{unit}</em>}
          <button type="button" className="k-of-step" onClick={() => step(1)} aria-label={L.more}>
            +
          </button>
        </span>
      </label>
      <div className="k-of-field">
        <span className="k-of-k">
          {L.size}
          {sizeUnit ? ` · ${sizeUnit}` : ''}
        </span>
        <span className="k-of-sizes" style={{ gridTemplateColumns: `repeat(${Math.min(6, Math.max(1, sizes.length))}, 1fr)` }}>
          {sizes.map((x) => (
            <button key={x} type="button" className={'k-of-size mono' + (size === x ? ' is-on' : '')} aria-pressed={size === x} onClick={() => setSize(x)}>
              {fmtSize(x)}
            </button>
          ))}
        </span>
      </div>
      <p className="k-of-total">
        <span className="k-of-k">{L.total}</span>
        <b className="mono">
          {fmtTotal ? fmtTotal(total) : total.toFixed(dp)}
          {unit && !fmtTotal ? ' ' + unit : ''}
        </b>
      </p>
      {crosses && <p className="k-of-warn">{side === 'bid' ? L.crossBid : L.crossAsk}</p>}
      <button type="submit" className={'btn btn-primary btn-lg btn-block k-of-go is-' + side} disabled={!valid || crosses || busy} aria-busy={busy}>
        {busy && <i className="k-spin" aria-hidden="true" />}
        {side === 'bid' ? L.placeBid : L.placeAsk}
      </button>
      {note && <p className="k-of-note">{note}</p>}
    </form>
  );
}
