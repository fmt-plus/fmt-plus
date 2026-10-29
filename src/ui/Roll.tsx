// Rolling digits: each digit is a 0–9 strip moved with transform (brand motion tokens). Other characters sit still.
// Digits are keyed from the right, so 9.8 → 10.2 rolls in place.
import { memo } from 'react';

const STRIP = '0123456789'.split('');

function Digit({ d }: { d: number }) {
  return (
    <span className="rd" aria-hidden="true">
      <span className="rd-s" style={{ transform: `translateY(${-d * 10}%)` }}>
        {STRIP.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </span>
    </span>
  );
}

export const Roll = memo(function Roll({ text, className }: { text: string; className?: string }) {
  const chars = text.split('');
  const n = chars.length;
  return (
    <span className={`roll${className ? ' ' + className : ''}`} aria-label={text} role="text">
      {chars.map((c, i) => {
        const k = n - i;
        return /\d/.test(c) ? (
          <Digit key={`d${k}`} d={Number(c)} />
        ) : (
          <span key={`c${k}${c}`} className="rc" aria-hidden="true">
            {c}
          </span>
        );
      })}
    </span>
  );
});
