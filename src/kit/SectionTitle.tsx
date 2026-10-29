// A section's one-line title (ported from flipfee): a plain statement of what the section shows. Words between
// *stars* are the key words: they take the accent and a dithered underline, and dither in (three steps) the first
// time the title scrolls into view. Reduced motion: they are simply there.
//   <SectionTitle text={copy.home.feedTitle} />   with feedTitle: '*New coins* as they launch'
import { createElement, useRef } from 'react';
import type { ReactNode } from 'react';
import { fill } from '../core/format.ts';
import { useSeen } from './lib.ts';

export interface SectionTitleProps {
  text: string;
  /** {name} placeholders in the text */
  vars?: Record<string, string | number>;
  id?: string;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  /** things after the title on the same line (a live dot, a link) */
  children?: ReactNode;
}

export function SectionTitle({ text, vars, id, as = 'h2', className, children }: SectionTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useSeen(ref);
  const parts = (vars ? fill(text, vars) : text).split('*');
  return createElement(
    as,
    { ref, id, className: 'k-stitle' + (className ? ' ' + className : '') },
    parts.map((p, i) =>
      i % 2 ? (
        <em key={i} className="acc">
          {p}
        </em>
      ) : (
        p
      ),
    ),
    children,
  );
}
