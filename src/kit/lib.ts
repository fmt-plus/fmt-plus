// What the kit's parts share: motion preferences, brand colours as RGB for canvases, safe image URLs, image-fallback
// letters, link props that keep the template router, and a "seen once" observer. No product logic lives here.
import { useEffect } from 'react';
import type { MouseEvent, RefObject } from 'react';
import { linkClick } from '../lib/router.ts';

export const REDUCED = '(prefers-reduced-motion: reduce)';

/** Reduced motion is on. */
export const reducedMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia(REDUCED).matches;

/** Reduced motion, or a screen without hover (touch): pointer effects stay still. */
export const calmPointer = (): boolean => reducedMotion() || (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches);

let probe: CanvasRenderingContext2D | null = null;
/**
 * A colour as [r, g, b] (0–255): a token name (`--accent`) read from the live stylesheet, or any CSS colour. Canvases
 * need numbers, so this paints one pixel with the colour and reads it back (works for hex, rgb(), hsl(), oklch()).
 */
export function cssRgb(token: string, fallback: [number, number, number] = [128, 128, 128]): [number, number, number] {
  try {
    const raw = token.startsWith('--') ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : token;
    if (!raw) return fallback;
    probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!probe) return fallback;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = '#000000';
    probe.fillStyle = raw;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  } catch {
    return fallback;
  }
}

export const rgba = ([r, g, b]: [number, number, number], a: number): string => `rgba(${r}, ${g}, ${b}, ${a})`;

/** An image URL that is safe to show: same-origin paths and https only. */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
}

/** Up to two letters of a ticker or a name, for an image that is missing or fails. */
export function letters(label: string): string {
  return (label.replace(/^\$+/, '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || '•').toUpperCase();
}

/** A stable small number from a string (picks one of the six brand tints). */
export function tintOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) % 6;
}

/**
 * Props for a link: in-app paths go through the template router (view transitions, new-tab clicks stay native);
 * other URLs open in a new tab.
 */
export function linkProps(href: string): { href: string; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void; target?: string; rel?: string } {
  return href.startsWith('/') && !href.startsWith('//') ? { href, onClick: linkClick } : { href, target: '_blank', rel: 'noopener noreferrer' };
}

/** Adds `cls` to the element the first time it is mostly in view (for one-shot entrances). */
export function useSeen<T extends Element>(ref: RefObject<T | null>, cls = 'is-in', threshold = 0.6): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add(cls);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          el.classList.add(cls);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, cls, threshold]);
}

/** Decimal places of a tick size (0.01 → 2, 0.0005 → 4, 1 → 0). */
export function decimalsOf(tick: number): number {
  if (!Number.isFinite(tick) || tick <= 0) return 2;
  const s = tick.toString();
  if (s.includes('e-')) return Number(s.split('e-')[1]) || 2;
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** Rounds to the nearest tick (no float dust: 0.30000000000000004 → 0.3). */
export function toTick(x: number, tick: number): number {
  const d = decimalsOf(tick);
  return Number((Math.round(x / tick) * tick).toFixed(d));
}
