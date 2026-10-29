// A dithered coin on a canvas: `n` cells drawn at `size` CSS px (pixelated), in --dither-ink (the accent by default).
//   'spin'  turns slowly while on screen, faster for a moment on hover (a hero centrepiece)
//   'flip'  rests at a slight angle and flips once on mount and on hover (a logo)
// Reduced motion: one still frame. Off screen or in a hidden tab: no frames (~30 fps is plenty for a dither).
import { useEffect, useRef } from 'react';
import { cssRgb, reducedMotion } from '../lib.ts';
import { coinMask, paint } from './coin.ts';

const REST = 0.5;

export function DitherCoin({ n = 72, size = 120, mode = 'spin', className, label, vt }: { n?: number; size?: number; mode?: 'spin' | 'flip'; className?: string; label?: string; vt?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const rgb = cssRgb('--dither-ink', [80, 80, 80]);
    const still = reducedMotion();
    let theta = REST;
    let raf = 0;
    let timer = 0;
    let last = 0;
    let shown = true;
    let flipUntil = 0;
    let boost = 0;
    const draw = (t: number) => paint(ctx, coinMask(n, t), n, n, rgb);
    const frame = (now: number) => {
      raf = 0;
      if (!shown || document.visibilityState !== 'visible') return;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      if (mode === 'spin') {
        boost = Math.max(0, boost - dt / 900);
        theta += (dt / 1000) * (0.9 + 5 * boost);
      } else if (flipUntil) {
        const left = flipUntil - now;
        if (left <= 0) {
          flipUntil = 0;
          theta = REST;
        } else theta = REST + (1 - left / 700) * Math.PI * 2;
      }
      draw(theta);
      if (mode === 'spin' || flipUntil) {
        raf = -1;
        timer = window.setTimeout(() => (raf = requestAnimationFrame(frame)), 30);
      }
    };
    const start = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const kick = () => {
      if (still) return;
      if (mode === 'spin') boost = 1;
      else flipUntil = performance.now() + 700;
      start();
    };
    draw(theta);
    if (!still) {
      if (mode === 'spin') start();
      else kick();
    }
    const io = new IntersectionObserver(([e]) => {
      shown = !!e?.isIntersecting;
      if (shown && !still && mode === 'spin') start();
    });
    io.observe(cv);
    const host = cv.closest('a, button, .k-coin-host') ?? cv;
    host.addEventListener('mouseenter', kick);
    const onVis = () => {
      if (document.visibilityState === 'visible' && mode === 'spin' && !still) start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (raf > 0) cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      io.disconnect();
      host.removeEventListener('mouseenter', kick);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [n, mode]);
  return (
    <canvas
      ref={ref}
      width={n}
      height={n}
      className={'k-coin' + (className ? ' ' + className : '')}
      style={{ width: size, height: size }}
      data-vt={vt}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
