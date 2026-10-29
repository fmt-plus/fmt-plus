// Live digits that dither in (ported from flipfee's Flap): a character that changes is written at once and appears
// through an ordered-dither mask, 25 → 50 → 75 → 100 % of its dots in three hard steps (~160 ms), staggered from the
// first changed character. Each character's DOM is fixed and written in place, so only changed characters re-render.
// Reduced motion, a hidden tab, or off screen: the characters change in place. The face is the brand's mono font.
import { memo, useLayoutEffect, useRef } from 'react';
import { REDUCED } from './lib.ts';

const FLAP_MS = 160;
const STAGGER = 30;
const NARROW = new Set(['.', ',', ':', ' ']);

let reduced = typeof window !== 'undefined' && window.matchMedia(REDUCED).matches;
if (typeof window !== 'undefined') window.matchMedia(REDUCED).addEventListener('change', (e) => (reduced = e.matches));
const motionOk = () => !reduced && document.visibilityState === 'visible';

// one observer for every row: a long board animates only what shows
const visible = new WeakMap<Element, boolean>();
const io =
  typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(
        (es) => {
          for (const e of es) visible.set(e.target, e.isIntersecting);
        },
        { rootMargin: '60px' },
      )
    : null;
const onScreen = (row: Element | null) => !row || visible.get(row) !== false;

const FlapChar = memo(function FlapChar({ ch, delay, intro }: { ch: string; delay: number; intro: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | null>(null);
  const timer = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g = el.firstElementChild as HTMLElement;
    const prev = shown.current;
    shown.current = ch;
    if (prev === ch) return;
    if (g.textContent !== ch) g.textContent = ch;
    const from = prev ?? (intro ? ' ' : ch);
    if (from === ch || ch === ' ' || !motionOk() || !onScreen(el.parentElement)) {
      window.clearTimeout(timer.current);
      el.classList.remove('go', 'go2');
      return;
    }
    el.style.setProperty('--fd', delay + 'ms');
    // two classes with the same motion under different animation names: swapping them restarts it without a layout
    const again = el.classList.contains('go');
    el.classList.remove(again ? 'go' : 'go2');
    el.classList.add(again ? 'go2' : 'go');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => el.classList.remove('go', 'go2'), delay + FLAP_MS + 40);
  }, [ch, delay, intro]);
  useLayoutEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <span ref={ref} className={'k-fc' + (NARROW.has(ch) ? ' is-n' : '')} aria-hidden="true">
      <i />
    </span>
  );
});

export interface FlapProps {
  text: string;
  /** pad on the left with blanks to this many characters (numbers keep their place) */
  pad?: number;
  /** what a screen reader says (default: the text) */
  label?: string;
  /** dither in from blank when it first shows */
  intro?: boolean;
  className?: string;
}

/** Characters are keyed from the right, so a growing number keeps its last digits in place. */
export const Flap = memo(function Flap({ text, pad = 0, label, intro = false, className }: FlapProps) {
  const t = text.length < pad ? ' '.repeat(pad - text.length) + text : text;
  const prev = useRef(t);
  let first = 0;
  const p = prev.current;
  if (p !== t) {
    const off = t.length - p.length;
    first = t.length;
    for (let i = 0; i < t.length; i++) {
      const j = i - off;
      if (j < 0 || p[j] !== t[i]) {
        first = i;
        break;
      }
    }
  }
  useLayoutEffect(() => {
    prev.current = t;
  });
  const row = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el || !io) return;
    io.observe(el);
    return () => {
      io.unobserve(el);
      visible.delete(el);
    };
  }, []);
  const chars = [...t];
  return (
    <span ref={row} className={'k-flap' + (className ? ' ' + className : '')} data-value={text}>
      <span className="sr">{label ?? text}</span>
      {chars.map((c, i) => (
        <FlapChar key={chars.length - i} ch={c} delay={intro && p === t ? i * STAGGER : Math.max(0, i - first) * STAGGER} intro={intro} />
      ))}
    </span>
  );
});
