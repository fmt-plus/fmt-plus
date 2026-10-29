// A line chart in the dither style (ported from flipfee): one series, a 2 px accent line over a dithered area, a zero
// line when the values cross it. Hover, a tap or the arrow keys show a crosshair and the nearest point's value. The
// area is a box clipped to the curve, so its dither keeps square dots at any size. A hidden table has the numbers.
import { useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';

export interface Pt {
  label: string;
  value: number;
  /** the hover line, e.g. "Day 3 · $2.16K" */
  tip: string;
}

export interface LineProps {
  points: Pt[];
  height?: number;
  title: string;
  /** label every n-th point on the axis */
  every?: number;
  note?: ReactNode;
  className?: string;
}

const edge = (f: number) => (f < 0.16 ? ' is-start' : f > 0.84 ? ' is-end' : '');

export function Line({ points, height = 160, title, every = 5, note, className }: LineProps) {
  const [hot, setHot] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const vals = points.map((p) => p.value);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * 100;
  const y = (v: number) => 96 - ((v - lo) / span) * 90;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ');
  const clip = `polygon(${points.map((p, i) => `${x(i).toFixed(2)}% ${y(p.value).toFixed(2)}%`).join(', ')}, 100% ${y(0).toFixed(2)}%, 0% ${y(0).toFixed(2)}%)`;
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !points.length) return;
    setHot(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)))));
  };
  const p = hot !== null ? points[hot] : undefined;
  return (
    <figure className={'k-chart' + (className ? ' ' + className : '')}>
      {note && (
        <figcaption className="k-chart-legend">
          <span className="k-tag">{note}</span>
        </figcaption>
      )}
      <div
        ref={box}
        className="k-chart-plot is-line"
        style={{ height }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHot(null)}
        tabIndex={0}
        role="img"
        aria-label={title}
        onBlur={() => setHot(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHot((h) => Math.min(points.length - 1, (h ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHot((h) => Math.max(0, (h ?? 1) - 1));
        }}
      >
        <i className="k-chart-area" style={{ clipPath: clip }} aria-hidden="true" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {lo < 0 && <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="k-chart-zero" vectorEffect="non-scaling-stroke" />}
          <path d={d} className="k-chart-line" vectorEffect="non-scaling-stroke" />
          {hot !== null && <line x1={x(hot)} x2={x(hot)} y1="0" y2="100" className="k-chart-cross" vectorEffect="non-scaling-stroke" />}
        </svg>
        {hot !== null && p && (
          <>
            <span className="k-chart-dot" style={{ left: `${x(hot)}%`, top: `${y(p.value)}%` }} />
            <span className={'k-chart-tip mono' + edge(x(hot) / 100)} style={{ left: `${x(hot)}%` }}>
              {p.tip}
            </span>
          </>
        )}
      </div>
      <div className="k-chart-axis mono" aria-hidden="true">
        {points.map((pt, i) => (
          <span key={i}>{i % every === 0 ? pt.label : ''}</span>
        ))}
      </div>
      <div className="sr">
        <table>
          <caption>{title}</caption>
          <tbody>
            {points.map((pt, i) => (
              <tr key={i}>
                <th scope="row">{pt.label}</th>
                <td>{pt.tip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
