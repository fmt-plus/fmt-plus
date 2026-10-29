// "Why it pays": where the money goes. Numbers come from src/economics.ts.
//   row     the total on the left, one block per part on the right (height ≈ share, with a floor so small parts stay
//           readable), soft gradient ribbons between them
//   column  (phones) the total, one stacked bar split by share, then one line per part
import { useId } from 'react';

export interface Part {
  label: string;
  value: string;
  share: number;
  tone: 'accent' | 'accent2' | 'mute';
}

const pctOf = (s: number) => `${Math.round(s * 100)}%`;

export function SplitDiagram({
  total,
  totalLabel,
  parts,
  w,
  h,
  layout = 'row',
  minFont = 0,
}: {
  total: string;
  totalLabel: string;
  parts: Part[];
  w: number;
  h: number;
  layout?: 'row' | 'column';
  minFont?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const aria = `${totalLabel} ${total}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`;

  if (layout === 'column') {
    const T = w * 0.13;
    const barY = T * 1.75;
    const barH = w * 0.12;
    const rowH = w * 0.15;
    const H = barY + barH + w * 0.08 + rowH * parts.length;
    let x = 0;
    const gap = w * 0.012;
    const usable = w - gap * (parts.length - 1);
    return (
      <svg viewBox={`0 0 ${w} ${H}`} className="dia" role="img" aria-label={aria}>
        <text x={0} y={T * 0.9} fontSize={T} className="dia-total-v">
          {total}
        </text>
        <text x={0} y={T * 1.45} fontSize={w * 0.045} className="dia-total-l">
          {totalLabel}
        </text>
        {parts.map((p) => {
          const pw = usable * p.share;
          const r = <rect key={p.label} x={x} y={barY} width={pw} height={barH} rx={Math.min(barH / 2.4, pw / 2)} className={`dia-bar dia-${p.tone}`} />;
          x += pw + gap;
          return r;
        })}
        {parts.map((p, i) => {
          const y = barY + barH + w * 0.08 + i * rowH;
          return (
            <g key={p.label} className={`dia-${p.tone}`}>
              <circle cx={w * 0.025} cy={y + rowH * 0.42} r={w * 0.022} className="dia-dot" />
              <text x={w * 0.075} y={y + rowH * 0.42} fontSize={w * 0.05} dominantBaseline="central" className="dia-row-l">
                {p.label} · {pctOf(p.share)}
              </text>
              <text x={w} y={y + rowH * 0.42} fontSize={w * 0.065} textAnchor="end" dominantBaseline="central" className="dia-row-v">
                {p.value}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  const pad = h * 0.02;
  const bw = w * 0.27;
  const gap = h * 0.04;
  const H = h - pad * 2;
  const usable = H - gap * (parts.length - 1);
  const floor = usable * 0.22;
  const raw = parts.map((p) => usable * p.share);
  const small = raw.map((v) => v < floor);
  const fixed = small.reduce((a, s) => a + (s ? floor : 0), 0);
  const restShare = parts.reduce((a, p, i) => a + (small[i] ? 0 : p.share), 0) || 1;
  const heights = parts.map((p, i) => (small[i] ? floor : ((usable - fixed) * p.share) / restShare));
  const rx = Math.min(bw, H) * 0.09;
  const lx = 0;
  const rxPos = w - bw;
  const big = Math.min(w * 0.06, h * 0.16);
  let ly = pad;
  let ry = pad;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dia" role="img" aria-label={aria}>
      <defs>
        {parts.map((p, i) => (
          <linearGradient key={i} id={`${uid}g${i}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" className="dia-stop-0" />
            <stop offset="1" className={`dia-stop-1 dia-${p.tone}`} />
          </linearGradient>
        ))}
      </defs>
      <rect x={lx} y={pad} width={bw} height={H} rx={rx} className="dia-total" />
      <text x={lx + bw * 0.12} y={pad + H / 2} fontSize={big} className="dia-total-v">
        {total}
      </text>
      <text x={lx + bw * 0.12} y={pad + H / 2 + big * 0.85} fontSize={Math.max(16, minFont, big * 0.36)} className="dia-total-l">
        {totalLabel}
      </text>
      {parts.map((p, i) => {
        const lh = H * p.share;
        const rh = heights[i];
        const y0 = ly;
        const y1 = ry;
        ly += lh;
        ry += rh + gap;
        const x0 = lx + bw;
        const x1 = rxPos;
        const mx = (x0 + x1) / 2;
        const ribbon = `M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1} L${x1} ${y1 + rh} C${mx} ${y1 + rh} ${mx} ${y0 + lh} ${x0} ${y0 + lh} Z`;
        const fs = Math.max(Math.min(rh * 0.36, big * 0.8), minFont * 1.4);
        const ls = Math.max(16, minFont, fs * 0.5);
        const block = fs + ls * 1.25;
        return (
          <g key={p.label} className={`dia-${p.tone}`}>
            <path d={ribbon} fill={`url(#${uid}g${i})`} className="dia-rib" />
            <rect x={x1} y={y1} width={bw} height={rh} rx={Math.min(rx, rh / 2)} className="dia-part" />
            <text x={x1 + bw * 0.1} y={y1 + (rh - block) / 2 + fs * 0.82} fontSize={fs} className="dia-part-v">
              {p.value}
            </text>
            <text x={x1 + bw * 0.1} y={y1 + (rh - block) / 2 + fs + ls * 1.05} fontSize={ls} className="dia-part-l">
              {p.label} · {pctOf(p.share)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
