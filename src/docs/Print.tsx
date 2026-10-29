// /docs/print: every diagram alone in a 1600×900 frame for X images (no title: the post text carries it; labels
// ≥ 32 px; the mark small in a corner). /docs/print/<id>: one of them. `npm run diagrams` saves them as
// .trench/launch/images/<id>-1600x900.png.
import { DIAGRAMS } from './diagrams/index.tsx';
import { Mark } from '../ui/Mark.tsx';

export function Print({ id }: { id?: string }) {
  const list = id ? DIAGRAMS.filter((d) => d.id === id) : DIAGRAMS;
  return (
    <main className="print">
      {list.map((d) => (
        <section key={d.id} className="print-frame" data-diagram={d.id} aria-label={d.title}>
          <div className="print-dia">{d.render(1440, 700, 'row', 32)}</div>
          <span className="print-mark">
            <Mark size={56} />
          </span>
        </section>
      ))}
    </main>
  );
}
