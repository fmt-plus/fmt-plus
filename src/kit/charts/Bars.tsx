// A bar chart in the dither style (ported from flipfee): one series, bars in the accent with a 2 px gap; a bar is
// solid (marked) or a 50 % dither (unmarked), named in the legend. Hover or focus a bar for its value; a tap pins it
// (phones have no hover). Bars are boxes, so the dither keeps square dots at any width. A hidden table carries the
// numbers for screen readers (in a div.sr: a table.sr ignores the 1 px clip in some browsers).
import { useState } from 'react';
import type { ReactNode } from 'react';

export interface Bar {
  label: string;
  value: number;
  /** solid accent (true, default) or dither (false) */
  solid?: boolean;
  /** the hover line, e.g. "#1 · $288" */
  tip: string;
}

export interface BarsProps {
  bars: Bar[];
  height?: number;
  /** names the chart for screen readers (the table caption) */
  title: string;
  /** [solid, dither] legend names */
  legend?: [string, string];
  /** label every n-th bar on the axis */
  every?: number;
  /** a small tag over the plot, e.g. "Example data" */
  note?: ReactNode;
  className?: string;
}

const edge = (f: number) => (f < 0.16 ? ' is-start' : f > 0.84 ? ' is-end' : '');

export function Bars({ bars, height = 160, title, legend, every = 1, note, className }: BarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const hot = hover ?? pin;
  const max = Math.max(...bars.map((b) => b.value), 1e-9);
  return (
    <figure className={'k-chart' + (className ? ' ' + className : '')}>
      {(legend || note) && (
        <figcaption className="k-chart-legend">
          {legend && (
            <>
              <span>
                <i className="k-lg-solid" />
                {legend[0]}
              </span>
              <span>
                <i className="k-lg-dither" />
                {legend[1]}
              </span>
            </>
          )}
          {note && <span className="k-tag">{note}</span>}
        </figcaption>
      )}
      <div className="k-chart-plot" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="k-chart-bars" aria-hidden="true">
          {bars.map((b, i) => (
            <i key={i} className={'k-chart-bar' + (b.solid === false ? ' is-dither' : '') + (hot === i ? ' is-hot' : '')} style={{ height: Math.max(1.5, (b.value / max) * 94) + '%' }} />
          ))}
        </div>
        <div className="k-chart-hits">
          {bars.map((b, i) => (
            <button
              key={i}
              type="button"
              className="k-chart-hit"
              aria-label={b.tip}
              aria-pressed={pin === i}
              onClick={() => setPin((p) => (p === i ? null : i))}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        </div>
        {hot !== null && bars[hot] && (
          <span className={'k-chart-tip mono' + edge((hot + 0.5) / bars.length)} style={{ left: `${((hot + 0.5) / bars.length) * 100}%` }}>
            {bars[hot].tip}
          </span>
        )}
      </div>
      <div className="k-chart-axis mono" aria-hidden="true">
        {bars.map((b, i) => (
          <span key={i}>{i % every === 0 ? b.label : ''}</span>
        ))}
      </div>
      <div className="sr">
        <table>
          <caption>{title}</caption>
          <tbody>
            {bars.map((b, i) => (
              <tr key={i}>
                <th scope="row">{b.label}</th>
                <td>{b.tip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
