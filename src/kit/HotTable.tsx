// A live token table (pump.fun board, GMGN / Axiom; ported from flipfee's hot rows): rank, picture, ticker and name,
// the columns the product configures, and one action button per row. Rows with `isNew` slide in and glow once (the
// brand's motion signature, styles/motion.css). Wide: one line per token under a head row. Phones: the token on top,
// the columns in a labelled grid under it, the action on the right. With `live`, the list carries the
// [data-live-list] / [data-live-key] hooks that `npm run shots` uses to check it moves.
import type { CSSProperties, ReactNode } from 'react';
import { copy } from '../copy.ts';
import { DitherImg } from './render/Dither.tsx';
import { linkProps } from './lib.ts';

export interface HotRowData {
  id: string;
  ticker: string;
  name?: string;
  image?: string | null;
  /** the token's page (in-app path or https URL) */
  href?: string;
  /** arrived while the page was open: slides in and glows once */
  isNew?: boolean;
}

export interface HotColumn<T> {
  key: string;
  label: string;
  cell: (row: T) => ReactNode;
  /** a grid track, e.g. '96px' or 'minmax(80px, 1fr)' (default 'minmax(72px, 1fr)') */
  width?: string;
  align?: 'start' | 'end';
  /** false: hidden on phones */
  phone?: boolean;
}

export interface HotAction<T> {
  /** the button's text and accessible name */
  text: (row: T) => ReactNode;
  label: (row: T) => string;
  onClick: (row: T) => void;
  icon?: ReactNode;
  /** a toggle (Want, Watch): aria-pressed */
  pressed?: (row: T) => boolean;
  primary?: boolean;
}

export interface HotTableProps<T extends HotRowData> {
  rows: T[];
  columns: HotColumn<T>[];
  action?: HotAction<T>;
  /** show the rank (1, 2, 3…) */
  rank?: boolean;
  label: string;
  /** the head row's first column name (default "Token") */
  tokenLabel?: string;
  live?: boolean;
  max?: number;
  /** what shows with zero rows (skeleton rows while `loading`) */
  empty?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function HotTable<T extends HotRowData>({ rows, columns, action, rank = true, label, tokenLabel, live = false, max, empty, loading = false, className }: HotTableProps<T>) {
  const list = max ? rows.slice(0, max) : rows;
  const tracks = [rank ? '28px' : '', 'minmax(150px, 1.4fr)', ...columns.map((c) => c.width ?? 'minmax(72px, 1fr)'), action ? 'auto' : ''].filter(Boolean).join(' ');
  const grid = { '--k-hot-cols': tracks } as CSSProperties;
  return (
    <section className={'k-hot' + (className ? ' ' + className : '')} aria-label={label} style={grid}>
      {list.length > 0 && (
        <div className="k-hot-row k-hot-head" aria-hidden="true">
          {rank && <span>{copy.kit.hot.rank}</span>}
          <span>{tokenLabel ?? copy.kit.hot.token}</span>
          {columns.map((c) => (
            <span key={c.key} className={(c.align === 'end' ? 'is-end' : '') + (c.phone === false ? ' k-hot-wide' : '')}>
              {c.label}
            </span>
          ))}
          {action && <span />}
        </div>
      )}
      {loading && !list.length ? (
        <div className="k-hot-list" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="k-sk k-hot-sk" />
          ))}
        </div>
      ) : list.length ? (
        <ol className="k-hot-list" data-live-list={live ? '' : undefined}>
          {list.map((r, i) => (
            <li key={r.id} className={'k-hot-row' + (r.isNew ? ' row-new' : '')} data-live-key={live ? r.id : undefined}>
              {rank && <span className="k-hot-rank mono">{i + 1}</span>}
              {r.href ? (
                <a className="k-hot-id" {...linkProps(r.href)}>
                  <Id r={r} />
                </a>
              ) : (
                <span className="k-hot-id">
                  <Id r={r} />
                </span>
              )}
              {/* desktop: the cells sit in the row's grid (display: contents); phones: a labelled row under the token */}
              <span className="k-hot-cells">
                {columns.map((c) => (
                  <span key={c.key} className={'k-hot-cell' + (c.align === 'end' ? ' is-end' : '') + (c.phone === false ? ' k-hot-wide' : '')}>
                    <em className="k-hot-k">{c.label}</em>
                    <span className="k-hot-v">{c.cell(r)}</span>
                  </span>
                ))}
              </span>
              {action && (
                <span className="k-hot-act">
                  <button
                    type="button"
                    className={'btn btn-sm ' + (action.primary ? 'btn-primary' : 'btn-soft')}
                    aria-label={action.label(r)}
                    aria-pressed={action.pressed ? action.pressed(r) : undefined}
                    onClick={() => action.onClick(r)}
                  >
                    {action.icon}
                    <span className="k-hot-act-t">{action.text(r)}</span>
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="k-empty">{empty}</div>
      )}
    </section>
  );
}

function Id({ r }: { r: HotRowData }) {
  return (
    <>
      <DitherImg src={r.image} label={r.ticker} seed={r.id} size={36} vt={'tk-pic-' + r.id} />
      <span className="k-hot-names">
        <b className="tick">{r.ticker}</b>
        {r.name && <span>{r.name}</span>}
      </span>
    </>
  );
}
