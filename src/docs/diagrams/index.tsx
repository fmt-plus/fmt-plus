// Every docs diagram, by id. /docs uses them inline; /docs/print/<id> renders one alone at 1600×900 for X images
// (npm run diagrams saves them as PNGs).
import type { ReactNode } from 'react';
import { copy } from '../../copy.ts';
import { EXAMPLE, filterDay } from '../../economics.ts';
import { count } from '../../core/format.ts';
import { FlowDiagram } from './Flow.tsx';
import { SplitDiagram } from './Split.tsx';
import type { Part } from './Split.tsx';

export interface DiagramDef {
  /** File name of the X image: .trench/launch/images/<id>-1600x900.png */
  id: string;
  title: string;
  /** minFont: the smallest label in viewBox units (32 for the 1600×900 X images). */
  render(w: number, h: number, layout: 'row' | 'column', minFont?: number): ReactNode;
}

function parts(): Part[] {
  const d = filterDay(EXAMPLE);
  return [
    { label: copy.docs.pays.parts.pushed, value: count(d.pushed), share: d.pushed / d.seen, tone: 'accent' },
    { label: copy.docs.pays.parts.muted, value: count(d.muted), share: d.muted / d.seen, tone: 'mute' },
  ];
}

export const DIAGRAMS: DiagramDef[] = [
  {
    id: 'how-it-works',
    title: copy.docs.how.title,
    render: (w, h, layout, minFont) => <FlowDiagram steps={copy.docs.how.steps} w={w} h={h} layout={layout} minFont={minFont} />,
  },
  {
    id: 'signal-filtered',
    title: copy.docs.pays.title,
    render: (w, h, layout, minFont) => (
      <SplitDiagram total={count(filterDay(EXAMPLE).seen)} totalLabel={copy.docs.pays.fees} parts={parts()} w={w} h={h} layout={layout} minFont={minFont} />
    ),
  },
];
