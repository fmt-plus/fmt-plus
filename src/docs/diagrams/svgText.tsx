// SVG text helpers: SVG has no wrapping, so lines are broken by an average glyph width.
import type { SVGProps } from 'react';

/** Breaks text into lines that fit `width` at font `size` (glyphs ≈ `ratio` × size wide). */
export function wrap(text: string, width: number, size: number, ratio = 0.52): string[] {
  const maxChars = Math.max(6, Math.floor(width / (size * ratio)));
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

export function Lines({ x, y, lines, size, lh = 1.3, ...rest }: { x: number; y: number; lines: string[]; size: number; lh?: number } & SVGProps<SVGTextElement>) {
  return (
    <text x={x} y={y} fontSize={size} {...rest}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : size * lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}
