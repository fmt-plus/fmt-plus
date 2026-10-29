// /docs (and docs.<domain>) in the Grid look: how it works, the push filter, a worked example from the chain, charts,
// the MCP tools and a short FAQ. Every number comes from src/economics.ts; `npm run numbers` checks they add up.
// The SVG diagrams in ./diagrams stay for /docs/print (X images).
import { copy } from '../copy.ts';
import { brand } from '../brand.ts';
import { EXAMPLE, SIZES, exampleRows, filterDay, score } from '../economics.ts';
import { count, fill, sol } from '../core/format.ts';
import { Bars, Line } from '../kit/index.ts';
import { linkClick } from '../lib/router.ts';
import { Dither, Footer, Lbl } from '../home/parts.tsx';
import { IconArrowRight } from '../ui/Icons.tsx';

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
  const D = copy.docs;
  const ch = D.charts;
  const rows = exampleRows(EXAMPLE);
  const d = filterDay(EXAMPLE);
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
  return (
    <main className="g g-docs">
      <div className="g-row g-r2 g-top">
        <div>
          <h1 className="g-h1">{fill(D.title, { name: brand.name })}</h1>
          <p className="g-lead">{D.lead}</p>
        </div>
        <nav className="g-toc" aria-label={D.title}>
          {[
            ['#how', D.how.title],
            ['#signal', D.pays.title],
            ['#example', D.example.title],
            ['#charts', ch.title],
            ['#tools', D.tools.title],
            ['#faq', D.faq.title],
          ].map(([href, t]) => (
            <a key={href} href={href}>
              {t}
              <IconArrowRight size={15} />
            </a>
          ))}
        </nav>
      </div>

      <section className="g-row g-r1" id="how">
        <div>
          <h2 className="g-h2">{D.how.title}</h2>
        </div>
      </section>
      <div className="g-row g-r4 g-steps">
        {D.how.steps.map((s, i) => (
          <div key={s.t}>
            <span className="g-step-n">{i + 1}</span>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>

      <section className="g-row g-r2" id="signal">
        <div>
          <h2 className="g-h2">{D.pays.title}</h2>
          <p className="g-lead">{D.pays.lead}</p>
        </div>
        <div>
          <Lbl>{D.pays.fees}</Lbl>
          <div className="g-huge">{count(d.seen)}</div>
          <div className="g-split" role="img" aria-label={`${D.pays.parts.pushed} ${d.pushed}, ${D.pays.parts.muted} ${d.muted}`}>
            <i className="pushed" style={{ flexGrow: d.pushed }} />
            <i className="muted" style={{ flexGrow: d.muted }} />
          </div>
          <div className="g-split-legend">
            <span>
              <i className="pushed" /> {D.pays.parts.pushed} <b className="g-num">{count(d.pushed)}</b>
            </span>
            <span>
              <i className="muted" /> {D.pays.parts.muted} <b className="g-num">{count(d.muted)}</b>
            </span>
          </div>
        </div>
      </section>

      <section className="g-row g-r2" id="example">
        <div>
          <h2 className="g-h2">{D.example.title}</h2>
          <p className="g-lead">{D.example.lead}</p>
        </div>
        <div>
          <table className="g-table g-ex">
            <thead>
              <tr>
                <th scope="col">{D.example.colStep}</th>
                <th scope="col" className="g-r">
                  {D.example.colAmount}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.key === 'net' ? 'g-ex-total' : undefined}>
                  <th scope="row">{D.example.rows[r.key]}</th>
                  <td className="g-r">{r.unit === 'x' ? `${r.value.toFixed(2)}×` : sol(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="g-row g-r1" id="charts">
        <div>
          <h2 className="g-h2">{ch.title}</h2>
        </div>
      </section>
      <div className="g-row g-r2 g-charts">
        <div>
          <h3 className="g-h3">{ch.places}</h3>
          <p className="g-lead">{ch.placesLead}</p>
          <Bars title={ch.places} bars={bars} height={190} />
        </div>
        <div>
          <h3 className="g-h3">{ch.week}</h3>
          <p className="g-lead">{ch.weekLead}</p>
          <Line title={ch.week} points={hours} height={190} every={4} note={copy.kit.example} />
        </div>
      </div>

      <section className="g-row g-r2" id="tools">
        <div>
          <h2 className="g-h2">{D.tools.title}</h2>
          <a className="g-cta g-cta-b" href="/tools" onClick={linkClick}>
            mcp.fmt.plus
          </a>
        </div>
        <div>
          <table className="g-table">
            <thead>
              <tr>
                <th scope="col">{D.tools.colTool}</th>
                <th scope="col">{D.tools.colWhat}</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([t, w]) => (
                <tr key={t}>
                  <th scope="row" className="g-mono">
                    {t}
                  </th>
                  <td className="g-wrap">{w}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="g-row g-r2" id="faq">
        <div>
          <h2 className="g-h2">{D.faq.title}</h2>
        </div>
        <div className="g-faq">
          {D.faq.items.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="g-row g-r1">
        <div className="g-endcta">
          <a className="g-cta" href="/" onClick={linkClick}>
            {D.back}
            <IconArrowRight size={18} />
          </a>
        </div>
      </div>
      <Footer />
      <Dither />
    </main>
  );
}
