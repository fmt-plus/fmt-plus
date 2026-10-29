// /docs (and docs.<domain>): How it works, the push filter, a worked example from the chain, charts, the MCP tools
// and a short FAQ. Every number comes from src/economics.ts; `npm run numbers` checks they add up.
import { copy } from '../copy.ts';
import { brand } from '../brand.ts';
import { EXAMPLE, SIZES, exampleRows, filterDay, score } from '../economics.ts';
import { fill, sol } from '../core/format.ts';
import { Bars, Line } from '../kit/index.ts';
import { PHONE, useMedia } from '../lib/react.ts';
import { linkClick } from '../lib/router.ts';
import { DIAGRAMS } from './diagrams/index.tsx';

const TOOLS: [string, string][] = [
  ['whats_important(wallet)', 'biggest recent swaps, ranked'],
  ['trades(wallet)', 'last swaps: side, SOL, token, tx'],
  ['bags(wallet)', 'holdings with USD value'],
  ['pnl(wallet)', 'SOL in, out and net'],
  ['style(wallet)', 'flipper or holder, size, pace'],
  ['live(min_sol)', 'swaps across top wallets, scored'],
  ['top_wallets()', 'the wallets fmt+ watches'],
];

export function Docs() {
  const phone = useMedia(PHONE);
  const [how, pays] = DIAGRAMS;
  const rows = exampleRows(EXAMPLE);
  const ch = copy.docs.charts;
  const bars = SIZES.map((s) => {
    const label = fill(ch.place, { n: s });
    const v = score(s, 'sell');
    return { label, value: v, solid: s >= EXAMPLE.bar, tip: `${label} · ${v}` };
  });
  // the example day spread over 24 hours; the line adds up the pushes
  const per = Math.ceil(EXAMPLE.day.length / 24);
  let acc = 0;
  const hours = Array.from({ length: 24 }, (_, h) => {
    acc += EXAMPLE.day.slice(h * per, (h + 1) * per).filter((x) => x >= EXAMPLE.bar).length;
    const label = fill(ch.day, { n: h + 1 });
    return { label, value: acc, tip: `${label} · ${acc}` };
  });
  const d = filterDay(EXAMPLE);
  return (
    <main className="docs">
      <header className="docs-hd">
        <h1>{fill(copy.docs.title, { name: brand.name })}</h1>
        <p>{copy.docs.lead}</p>
      </header>

      <section className="docs-sec card" id="how">
        <h2>{copy.docs.how.title}</h2>
        <div className="dia-box">{phone ? how.render(600, 0, 'column') : how.render(960, 0, 'row')}</div>
      </section>

      <section className="docs-sec card" id="signal">
        <h2>{copy.docs.pays.title}</h2>
        <p className="docs-lead">{copy.docs.pays.lead}</p>
        <div className="dia-box">{phone ? pays.render(600, 0, 'column') : pays.render(960, 400, 'row')}</div>
      </section>

      <section className="docs-sec card" id="example">
        <h2>{copy.docs.example.title}</h2>
        <p className="docs-lead">{copy.docs.example.lead}</p>
        <table className="ex">
          <thead>
            <tr>
              <th scope="col">{copy.docs.example.colStep}</th>
              <th scope="col">{copy.docs.example.colAmount}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.key === 'net' ? 'ex-total' : undefined}>
                <th scope="row">{copy.docs.example.rows[r.key]}</th>
                <td className="num">{r.unit === 'x' ? `${r.value.toFixed(2)}×` : sol(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="docs-sec card" id="charts">
        <h2>{ch.title}</h2>
        <div className="docs-charts">
          <div className="docs-chart">
            <h3>{ch.places}</h3>
            <p className="docs-lead">{ch.placesLead}</p>
            <Bars title={ch.places} bars={bars} height={170} />
          </div>
          <div className="docs-chart">
            <h3>{ch.week}</h3>
            <p className="docs-lead">{ch.weekLead}</p>
            <Line title={`${ch.week} · ${d.pushed}/${d.seen}`} points={hours} height={170} every={4} note={copy.kit.example} />
          </div>
        </div>
      </section>

      <section className="docs-sec card" id="tools">
        <h2>{copy.docs.tools.title}</h2>
        <table className="ex">
          <thead>
            <tr>
              <th scope="col">{copy.docs.tools.colTool}</th>
              <th scope="col">{copy.docs.tools.colWhat}</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map(([t, w]) => (
              <tr key={t}>
                <th scope="row" className="mono">
                  {t}
                </th>
                <td>{w}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="docs-sec card" id="faq">
        <h2>{copy.docs.faq.title}</h2>
        <div className="faq">
          {copy.docs.faq.items.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <a className="btn btn-primary btn-xl docs-back" href="/" onClick={linkClick}>
        {copy.docs.back}
      </a>
    </main>
  );
}
