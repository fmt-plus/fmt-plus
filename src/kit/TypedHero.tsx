// The hero, after treg.to and flipfee:
//   TypedHero  a headline and a line with a chip whose label types in letter by letter; the chip cycles through
//              `items` (a new head item shows at once). Reduced motion: no typing, a slower cycle.
//   FlowMap    the product in three parts with as little text as possible: source → core → destination, joined by
//              wires that pulse toward the core and out of it; a small caption floats over each part.
//              Phones (≤ 760 px): the parts stack with short vertical wires (`compact` keeps the row).
// Both are data-driven: the parts are whatever the product passes in.
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { DitherImg } from './render/Dither.tsx';
import { linkProps, reducedMotion } from './lib.ts';

export interface TypedItem {
  /** stable id (a mint, a market id) */
  key: string;
  /** the typed text, e.g. $TICKER */
  label: string;
  image?: string | null;
  /** in-app path or https URL */
  href?: string;
  /** what a screen reader says for the chip (defaults to the label) */
  aria?: string;
}

/** The text, typed in letter by letter, with a blinking caret. */
export function Typed({ text, ms = 55 }: { text: string; ms?: number }) {
  const [n, setN] = useState(() => (reducedMotion() ? text.length : 0));
  useEffect(() => {
    if (reducedMotion()) {
      setN(text.length);
      return;
    }
    setN(0);
    let k = 0;
    const t = window.setInterval(() => {
      k++;
      setN(k);
      if (k >= text.length) window.clearInterval(t);
    }, ms);
    return () => window.clearInterval(t);
  }, [text, ms]);
  return (
    <b className="k-typed-t" aria-hidden="true">
      {text.slice(0, n)}
      <i className="k-caret" />
    </b>
  );
}

/** One item every `ms` (twice as slow with reduced motion); back to the first when a new item arrives on top. */
export function useCycle<T extends { key: string }>(items: T[], ms: number): T | undefined {
  const head = items[0]?.key;
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [head]);
  useEffect(() => {
    if (items.length < 2) return;
    const t = window.setInterval(() => setI((x) => x + 1), reducedMotion() ? ms * 2 : ms);
    return () => window.clearInterval(t);
  }, [items.length, ms, head]);
  return items.length ? items[i % items.length] : undefined;
}

export function TypedChip({ item, typeMs }: { item: TypedItem | undefined; typeMs?: number }) {
  if (!item) return <span className="k-chip is-sk" aria-hidden="true" />;
  const body = (
    <>
      <DitherImg src={item.image} label={item.label} seed={item.key} size={28} round />
      <Typed key={item.key} text={item.label} ms={typeMs} />
    </>
  );
  return item.href ? (
    <a className="k-chip" {...linkProps(item.href)} aria-label={item.aria ?? item.label}>
      {body}
    </a>
  ) : (
    <span className="k-chip" role="text" aria-label={item.aria ?? item.label}>
      {body}
    </span>
  );
}

export interface TypedHeroProps {
  title: ReactNode;
  /** words before the chip */
  lead?: ReactNode;
  /** words after the chip */
  after?: ReactNode;
  items: TypedItem[];
  cycleMs?: number;
  typeMs?: number;
  className?: string;
  children?: ReactNode;
}

export function TypedHero({ title, lead, after, items, cycleMs = 7000, typeMs = 55, className, children }: TypedHeroProps) {
  const item = useCycle(items, cycleMs);
  return (
    <div className={'k-hero' + (className ? ' ' + className : '')}>
      <h1 className="k-hero-h">{title}</h1>
      <p className="k-typed">
        {lead && <span className="k-typed-l">{lead}</span>}
        <TypedChip item={item} typeMs={typeMs} />
        {after && <span className="k-typed-l">{after}</span>}
      </p>
      {children}
    </div>
  );
}

// ── FlowMap ───────────────────────────────────────────────

export interface FlowPart {
  /** a few words floating over the part */
  caption?: ReactNode;
  children: ReactNode;
  /** 'accent' fills the part's box with the accent (the destination, usually) */
  tone?: 'plain' | 'accent' | 'bare';
}

type Pt = [number, number];
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};
const DOTS = 6;

/** Wires in a 100×100 box: `n` lines fanning in to the middle (in) or out of it (out), with pulse dots along each. */
function useWires(n: number, dir: 'in' | 'out') {
  return useMemo(() => {
    const step = n > 1 ? Math.min(18, 72 / (n - 1)) : 0;
    return Array.from({ length: n }, (_, i) => {
      const y = 50 + (i - (n - 1) / 2) * step;
      const pts: [Pt, Pt, Pt, Pt] = dir === 'in' ? [[0, y], [40, y], [52, 50], [100, 50]] : [[0, 50], [48, 50], [60, y], [100, y]];
      const [p0, p1, p2, p3] = pts;
      const d = `M${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`;
      const dots = Array.from({ length: DOTS }, (_, k) => bez(p0, p1, p2, p3, (k + 0.5) / DOTS));
      return { d, dots };
    });
  }, [n, dir]);
}

function Wires({ n, dir }: { n: number; dir: 'in' | 'out' }) {
  const wires = useWires(n, dir);
  return (
    <div className={'k-wires is-' + dir} aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {wires.map((w, i) => (
          <path key={i} d={w.d} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {wires.map((w, i) =>
        w.dots.map(([x, y], k) => <i key={i + '-' + k} className="k-wire-dot" style={{ left: x + '%', top: y + '%', animationDelay: `${k * 140 + i * 90 - 1400}ms` }} />),
      )}
      {/* phones: a short vertical wire */}
      <span className="k-wire-v">
        {Array.from({ length: 4 }, (_, k) => (
          <i key={k} className="k-wire-dot" style={{ animationDelay: `${k * 140 - 1400}ms` }} />
        ))}
      </span>
    </div>
  );
}

function Part({ part, cls }: { part: FlowPart; cls: string }) {
  return (
    <div className={'k-flow-part ' + cls}>
      {part.caption && <p className="k-flow-cap">{part.caption}</p>}
      <div className={'k-flow-box is-' + (part.tone ?? 'plain')}>{part.children}</div>
    </div>
  );
}

export interface FlowMapProps {
  source: FlowPart;
  core: FlowPart;
  dest: FlowPart;
  /** wires from the source into the core (default 4) and out to the destination (default 2) */
  wiresIn?: number;
  wiresOut?: number;
  /** what the map shows, for screen readers (default copy.kit.flow) */
  label?: string;
  /** keep the row on phones (small parts only) */
  compact?: boolean;
  className?: string;
}

export function FlowMap({ source, core, dest, wiresIn = 4, wiresOut = 2, label = copy.kit.flow, compact = false, className }: FlowMapProps) {
  return (
    <div className={'k-flow' + (compact ? ' is-compact' : '') + (className ? ' ' + className : '')} role="group" aria-label={label}>
      <Part part={source} cls="is-src" />
      <Wires n={wiresIn} dir="in" />
      <Part part={core} cls="is-core" />
      <Wires n={wiresOut} dir="out" />
      <Part part={dest} cls="is-dst" />
    </div>
  );
}
