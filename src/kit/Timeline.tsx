// Segments on a time axis (Kalshi / Polymarket market windows, flipfee's hour bar): one bar from `from` to `to`;
// the past is dithered, the segment holding `now` carries a moving sheen, the future is plain, the viewer's own
// segments are solid accent. A marker shows now; ticks name points under the bar. Pure layout: the product passes
// times (ms) and re-renders as `now` moves.
import { memo } from 'react';
import { copy } from '../copy.ts';

export interface Segment {
  id: string;
  from: number;
  to: number;
  /** a short name shown inside the segment when it is wide enough */
  label?: string;
  mine?: boolean;
}

export interface TimelineProps {
  segments: Segment[];
  from: number;
  to: number;
  now: number;
  ticks?: { at: number; label: string }[];
  /** what the bar shows, for screen readers */
  label: string;
  /** show the "Now" and "Yours" legend */
  legend?: boolean;
  className?: string;
}

export const Timeline = memo(function Timeline({ segments, from, to, now, ticks, label, legend = false, className }: TimelineProps) {
  const span = Math.max(1, to - from);
  const pct = (t: number) => (Math.min(to, Math.max(from, t)) - from) / span;
  const nowIn = now >= from && now <= to;
  return (
    <div className={'k-tl' + (className ? ' ' + className : '')}>
      <div className="k-tl-bar" role="img" aria-label={label}>
        {now > from && <span className="k-tl-past dither-fill" style={{ width: pct(now) * 100 + '%' }} />}
        {segments.map((s) => {
          const a = pct(s.from);
          const b = pct(s.to);
          if (b <= a) return null;
          const state = s.to <= now ? 'past' : s.from <= now ? 'live' : 'next';
          return (
            <span key={s.id} className={'k-tl-seg is-' + state + (s.mine ? ' is-mine' : '')} style={{ left: a * 100 + '%', width: (b - a) * 100 + '%' }}>
              {s.label && b - a > 0.14 && <em>{s.label}</em>}
            </span>
          );
        })}
        {nowIn && <i className="k-tl-now" style={{ left: pct(now) * 100 + '%' }} />}
      </div>
      {ticks && ticks.length > 0 && (
        <div className="k-tl-ticks" aria-hidden="true">
          {ticks.map((t, i) => {
            const x = pct(t.at);
            return (
              <span key={i} className={x < 0.06 ? 'is-start' : x > 0.94 ? 'is-end' : undefined} style={{ left: x * 100 + '%' }}>
                {t.label}
              </span>
            );
          })}
        </div>
      )}
      {legend && (
        <div className="k-tl-legend" aria-hidden="true">
          <span>
            <i className="k-tl-key is-now" />
            {copy.kit.timeline.now}
          </span>
          <span>
            <i className="k-tl-key is-mine" />
            {copy.kit.timeline.mine}
          </span>
        </div>
      )}
    </div>
  );
});
