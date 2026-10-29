// A live event tape (Hyperliquid trades, pump.fun's trade feed; ported from flipfee's hero trades): newest on top,
// at most `max` rows. Rows are keyed by position, so the list never grows and its DOM is reused; when events arrive
// the whole list slides down one transform and the top row glows once. Reduced motion: rows change in place.
import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { copy } from '../copy.ts';
import { reducedMotion } from './lib.ts';

export interface TapeEvent {
  /** stable id (a signature, a mint) */
  id: string;
  /** the side dot: up (a buy), down (a sell), accent, mute */
  tone?: 'up' | 'down' | 'accent' | 'mute';
  /** the viewer's own event */
  mine?: boolean;
  cells: ReactNode[];
}

export interface TapeProps {
  /** newest first */
  events: TapeEvent[];
  max?: number;
  /** grid tracks for the cells (after the dot), e.g. '1fr auto auto' */
  cols?: string;
  label: string;
  empty?: ReactNode;
  className?: string;
}

export function Tape({ events, max = 6, cols, label, empty, className }: TapeProps) {
  const list = useRef<HTMLOListElement>(null);
  const top = events[0]?.id;
  const seen = useRef<string | undefined>(top);
  useLayoutEffect(() => {
    const was = seen.current;
    seen.current = top;
    const el = list.current;
    if (!el || !was || was === top) return;
    const added = events.findIndex((e) => e.id === was);
    const first = el.firstElementChild as HTMLElement | null;
    if (added <= 0 || !first || reducedMotion()) return;
    const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
    el.style.transition = 'none';
    el.style.transform = `translateY(${-Math.min(added, max) * (first.offsetHeight + gap)}px)`;
    void el.offsetHeight;
    el.style.transition = '';
    el.style.transform = '';
  }, [top]); // only a new head moves the list
  const rows = events.slice(0, max);
  const style = { '--k-tape-rows': max, ...(cols ? { '--k-tape-cols': cols } : {}) } as CSSProperties;
  return (
    <div className={'k-tape' + (className ? ' ' + className : '')} style={style} role="log" aria-live="off" aria-label={label}>
      {rows.length ? (
        <ol ref={list} className="k-tape-list">
          {rows.map((e, i) => (
            // position keys: the list holds `max` rows at most and reuses them
            <li key={i} className={'k-tape-row is-' + (e.tone ?? 'mute') + (e.mine ? ' is-mine' : '')}>
              {i === 0 && <i key={e.id} className="k-tape-glow" aria-hidden="true" />}
              <i className="k-tape-dot" aria-hidden="true" />
              {e.cells.map((c, j) => (
                <span key={j} className="k-tape-c">
                  {c}
                </span>
              ))}
            </li>
          ))}
        </ol>
      ) : (
        <p className="k-tape-empty">{empty ?? copy.kit.tape.empty}</p>
      )}
    </div>
  );
}
