// /live: every swap from watched wallets. /wallets: the watched wallets.
import { copy } from '../copy.ts';
import { ago, short, sol } from '../core/format.ts';
import { useNow, useStore } from '../lib/react.ts';
import { linkClick } from '../lib/router.ts';
import { SectionTitle } from '../kit/index.ts';
import { arrived, live } from '../state/live.ts';
import { Dither, Footer, PushFeed, sym } from './parts.tsx';

export function Live() {
  const events = useStore(live, (s) => s.events);
  useNow(5000);
  const L = copy.live;
  return (
    <main className="g">
      <div className="g-row g-r2 g-top">
        <div>
          <SectionTitle text={L.title} as="h1" className="g-h1" />
          <p className="g-dim">{L.lead}</p>
        </div>
        <div className="g-ph-flat">
          <PushFeed n={4} min={50} />
        </div>
      </div>
      <div className="g-row g-r1">
        <div>
          <table className="g-table">
            <thead>
              <tr>
                <th>{L.colWho}</th>
                <th>{L.colSide}</th>
                <th>{L.colSol}</th>
                <th>{L.colToken}</th>
                <th>{L.colScore}</th>
                <th className="g-r">{L.colAgo}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.sig} className={arrived.has(e.sig) ? 'is-new' : ''}>
                  <td>
                    <a href={`/w/${e.w}`} onClick={linkClick}>
                      {e.name}
                    </a>
                  </td>
                  <td className={e.side === 'sell' ? 'g-down' : 'g-up'}>{e.side === 'sell' ? L.sell : L.buy}</td>
                  <td>{sol(e.sol)}</td>
                  <td>
                    <a href={`https://dexscreener.com/solana/${e.mint}`} target="_blank" rel="noopener noreferrer">
                      {sym(e.sym, e.mint)}
                    </a>
                  </td>
                  <td>
                    <span className="g-score" style={{ width: `${e.score}%` }} />
                  </td>
                  <td className="g-r g-dim">{ago(e.t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!events.length && <div className="g-dither-box">{L.empty}</div>}
        </div>
      </div>
      <Footer />
      <Dither />
    </main>
  );
}

export function Wallets() {
  const board = useStore(live, (s) => s.board);
  const W = copy.wallets;
  const max = Math.max(1, ...board.map((b) => b.volume));
  return (
    <main className="g">
      <div className="g-row g-r1 g-top">
        <div>
          <SectionTitle text={W.title} as="h1" className="g-h1" />
          <p className="g-dim">{W.lead}</p>
        </div>
      </div>
      <div className="g-row g-r1">
        <div>
          <table className="g-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{W.colName}</th>
                <th>{W.colSol}</th>
                <th>{W.colTrades}</th>
                <th>{W.colVol}</th>
              </tr>
            </thead>
            <tbody>
              {board
                .slice()
                .sort((a, b) => b.volume - a.volume)
                .map((b, i) => (
                  <tr key={b.w}>
                    <td className="g-dim">{i + 1}</td>
                    <td>
                      <a href={`/w/${b.w}`} onClick={linkClick}>
                        <b>{b.name}</b> <span className="g-dim g-mono">{short(b.w)}</span>
                      </a>
                    </td>
                    <td>{b.sol !== null ? sol(b.sol) : '…'}</td>
                    <td>{b.trades}</td>
                    <td>
                      <span className="g-score" style={{ width: `${(b.volume / max) * 100}%` }} /> {b.volume}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <Footer />
      <Dither />
    </main>
  );
}
