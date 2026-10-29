// Ordered dither for pictures, in the brand's own colours: one SVG filter turns any image into ink dots on paper
// through a 4×4 Bayer screen (grey levels → a hard threshold per cell).
//   #tk-dither      ink (--dither-ink, the accent by default) on paper (--dither-paper)
//   #tk-dither-ink  ink only; the paper cells are clear (for pictures over cards or photos)
// The colours are CSS variables on feFlood, so a brand change needs no code. Mount <DitherDefs /> once (App.tsx does).
// Apply the filter to an SVG <image> (DitherImg), never to an <img>: Safari (every iPhone browser) blanks an <img>
// under an SVG filter with primitive subregions. Boxes get the same look in CSS: .dither-fill, .dither-fill-ink,
// .dither-line (styles/kit.css).
import { memo, useState } from 'react';
import { letters, safeUrl, tintOf } from '../lib.ts';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const TILE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'>" +
  BAYER4.map((b, i) => {
    const g = Math.round(((b + 0.5) / 16) * 255);
    return `<rect x='${i % 4}' y='${Math.floor(i / 4)}' width='1' height='1' fill='rgb(${g},${g},${g})'/>`;
  }).join('') +
  '</svg>';
// d = grey − screen + 1 (clamped to 0…1, alpha stays the picture's) is 1 exactly where grey ≥ screen; the 64-step
// table keeps only that top step, so the threshold sits at the screen value (no light or dark bias).
const STEP = '0 '.repeat(63) + '1';

function Chain({ id, paper }: { id: string; paper: boolean }) {
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      {/* grey, a little more contrast around the middle, minus the Bayer screen, then a hard step: 1 = paper, 0 = ink */}
      <feColorMatrix in="SourceGraphic" type="matrix" values="0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0 0 0 1 0" result="g" />
      <feComponentTransfer in="g" result="gc">
        <feFuncR type="linear" slope="1.3" intercept="-0.15" />
        <feFuncG type="linear" slope="1.3" intercept="-0.15" />
        <feFuncB type="linear" slope="1.3" intercept="-0.15" />
      </feComponentTransfer>
      <feImage href={TILE} x="0" y="0" width="4" height="4" result="b" />
      <feTile in="b" result="bt" />
      <feComposite in="gc" in2="bt" operator="arithmetic" k1="0" k2="1" k3="-1" k4="1" result="d" />
      <feComponentTransfer in="d" result="bw">
        <feFuncR type="discrete" tableValues={STEP} />
      </feComponentTransfer>
      {/* ink where the threshold said dark: alpha = 1 − R, coloured by the token */}
      <feColorMatrix in="bw" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1 0 0 0 1" result="inkA" />
      <feFlood className="k-flood-ink" result="ink" />
      <feComposite in="ink" in2="inkA" operator="in" result="inkL" />
      {paper ? (
        <>
          <feFlood className="k-flood-paper" result="paper" />
          <feMerge result="m">
            <feMergeNode in="paper" />
            <feMergeNode in="inkL" />
          </feMerge>
          <feComposite in="m" in2="SourceAlpha" operator="in" />
        </>
      ) : (
        <feComposite in="inkL" in2="SourceAlpha" operator="in" />
      )}
    </filter>
  );
}

/** The dither filters. Render once near the app root. */
export function DitherDefs() {
  return (
    <svg className="k-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <Chain id="tk-dither" paper />
      <Chain id="tk-dither-ink" paper={false} />
    </svg>
  );
}

export interface DitherImgProps {
  /** https or same-origin URL; anything else shows the letters */
  src?: string | null;
  /** ticker or name: the fallback letters (and the tint seed when `seed` is missing) */
  label: string;
  seed?: string;
  size?: number;
  round?: boolean;
  /** 'paper' (default) · 'ink' (clear paper) · 'none' (the picture as is) */
  dither?: 'paper' | 'ink' | 'none';
  className?: string;
  /** a view-transition name for the router to set when this element's link is clicked (src/kit/vt.ts) */
  vt?: string;
}

/** A token or avatar picture in a small tile, dithered in the brand colours; letters on a brand tint when it fails. */
export const DitherImg = memo(function DitherImg({ src, label, seed, size = 36, round = false, dither = 'paper', className, vt }: DitherImgProps) {
  const url = safeUrl(src);
  const [bad, setBad] = useState<string | null>(null);
  const show = url !== null && bad !== url;
  const cls = 'k-img' + (round ? ' is-round' : '') + (show ? '' : ` av-t${tintOf(seed ?? label)}`) + (className ? ' ' + className : '');
  return (
    <span className={cls} style={{ width: size, height: size }} data-vt={vt} aria-hidden="true">
      {show ? (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <image
            href={url}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid slice"
            filter={dither === 'none' ? undefined : dither === 'ink' ? 'url(#tk-dither-ink)' : 'url(#tk-dither)'}
            onError={() => setBad(url)}
          />
        </svg>
      ) : (
        <b style={{ fontSize: Math.round(size * 0.38) }}>{letters(label)}</b>
      )}
    </span>
  );
});
