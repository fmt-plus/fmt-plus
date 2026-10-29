// "How it works": the steps as soft cards joined by thick chevrons. Row layout for wide frames (cards centered in the
// frame), column layout for phones (the height follows the content). Text sizes follow the card size.
import { Lines, wrap } from './svgText.tsx';

export interface FlowStep {
  t: string;
  d: string;
}

export function FlowDiagram({ steps, w, h, layout, minFont = 0 }: { steps: FlowStep[]; w: number; h: number; layout: 'row' | 'column'; minFont?: number }) {
  const n = steps.length;
  const label = steps.map((s) => s.t).join(', ');
  if (layout === 'row') {
    const pad = w * 0.012;
    const gap = w * 0.045;
    const cw = (w - pad * 2 - gap * (n - 1)) / n;
    const inset = cw * 0.11;
    const d = cw * 0.2;
    const D = Math.max(cw * 0.085, minFont);
    const T = Math.max(cw * 0.12, D * 1.35);
    const items = steps.map((s) => ({ t: wrap(s.t, cw - inset * 2, T, 0.56), d: wrap(s.d, cw - inset * 2, D) }));
    const need = (it: { t: string[]; d: string[] }) => inset + d + T * 1.5 + (it.t.length - 1) * T * 1.1 + D * 1.1 + it.d.length * D * 1.35 + inset * 0.8;
    // h <= 0: as tall as the cards need; else the cards are centered in the frame
    const ch = h > 0 ? Math.min(h - pad * 2, Math.max(...items.map(need))) : Math.max(...items.map(need));
    const H = h > 0 ? h : ch + pad * 2;
    const y = (H - ch) / 2;
    return (
      <svg viewBox={`0 0 ${w} ${H}`} className="dia" role="img" aria-label={label}>
        {items.map((it, i) => {
          const x = pad + i * (cw + gap);
          const ty = y + inset + d + T * 1.5;
          return (
            <g key={i}>
              <rect x={x} y={y} width={cw} height={ch} rx={cw * 0.12} className="dia-card" />
              <circle cx={x + inset + d / 2} cy={y + inset + d / 2} r={d / 2} className="dia-num" />
              <text x={x + inset + d / 2} y={y + inset + d / 2} className="dia-num-t" fontSize={d * 0.5} textAnchor="middle" dominantBaseline="central">
                {i + 1}
              </text>
              <Lines x={x + inset} y={ty} lines={it.t} size={T} lh={1.1} className="dia-t" />
              <Lines x={x + inset} y={ty + (it.t.length - 1) * T * 1.1 + D * 1.9} lines={it.d} size={D} className="dia-d" />
              {i < n - 1 && (
                <path
                  d={`M${x + cw + gap * 0.36} ${y + ch / 2 - gap * 0.2} l${gap * 0.2} ${gap * 0.2} l${-gap * 0.2} ${gap * 0.2}`}
                  className="dia-arrow"
                  strokeWidth={Math.max(4, gap * 0.11)}
                />
              )}
            </g>
          );
        })}
      </svg>
    );
  }
  // column
  const pad = 0;
  const gap = w * 0.07;
  const cw = w;
  const inset = w * 0.06;
  const d = w * 0.15;
  const T = w * 0.068;
  const D = w * 0.05;
  const tx = inset + d + inset * 0.8;
  const tw = cw - tx - inset;
  const items = steps.map((s) => ({ t: wrap(s.t, tw, T, 0.56), d: wrap(s.d, tw, D) }));
  const heights = items.map((it) => Math.max(d + inset * 2, inset * 1.6 + it.t.length * T * 1.1 + D * 0.4 + it.d.length * D * 1.35));
  const H = heights.reduce((a, b) => a + b, 0) + gap * (n - 1) + pad * 2;
  let y = pad;
  return (
    <svg viewBox={`0 0 ${w} ${H}`} className="dia" role="img" aria-label={label}>
      {items.map((it, i) => {
        const ch = heights[i];
        const top = y;
        y += ch + gap;
        const textH = it.t.length * T * 1.1 + D * 0.4 + it.d.length * D * 1.35;
        const ty = top + (ch - textH) / 2 + T * 0.85;
        return (
          <g key={i}>
            <rect x={0} y={top} width={cw} height={ch} rx={w * 0.06} className="dia-card" />
            <circle cx={inset + d / 2} cy={top + ch / 2} r={d / 2} className="dia-num" />
            <text x={inset + d / 2} y={top + ch / 2} className="dia-num-t" fontSize={d * 0.48} textAnchor="middle" dominantBaseline="central">
              {i + 1}
            </text>
            <Lines x={tx} y={ty} lines={it.t} size={T} lh={1.1} className="dia-t" />
            <Lines x={tx} y={ty + (it.t.length - 1) * T * 1.1 + D * 1.45} lines={it.d} size={D} className="dia-d" />
            {i < n - 1 && (
              <path
                d={`M${inset + d / 2 - gap * 0.22} ${top + ch + gap * 0.3} l${gap * 0.22} ${gap * 0.22} l${gap * 0.22} ${-gap * 0.22}`}
                className="dia-arrow"
                strokeWidth={Math.max(4, gap * 0.13)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
