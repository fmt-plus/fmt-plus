// Landing in the Grid look: wordmark, three phones (Cooker's swap bars · live pushes · Cooker's swaps), Cooker's
// flow cells, swap bars + live tape + MCP playground, the watched wallets as a ruled list, footer.
import { useEffect } from 'react';
import { copy } from '../copy.ts';
import { sol } from '../core/format.ts';
import { useStore } from '../lib/react.ts';
import { linkClick } from '../lib/router.ts';
import { COOKER, live, loadWallet, wallets } from '../state/live.ts';
import { Dither, Footer, Lbl, Phone, Playground, PushFeed, SwapBars, Tape } from './parts.tsx';
import { Find } from './Find.tsx';
import { IconArrowRight, IconArrowUpRight } from '../ui/Icons.tsx';

export function Home() {
  const v = useStore(wallets, (s) => s[COOKER]?.v);
  const events = useStore(live, (s) => s.events);
  const board = useStore(live, (s) => s.board);
  useEffect(() => loadWallet(COOKER), []);
  const name = v?.name ?? 'Cooker';
  const lines = copy.home.title.split('\n');
  return (
    <main className="g g-home">
      <div className="g-word" aria-label="fmt+">
        fmt<sup>+</sup>
        <span className="g-cursor" />
      </div>
      <div className="g-row g-r2">
        <div className="g-phones">
          <Phone>
            <Lbl>{copy.home.walletOf.replace('{name}', name)}</Lbl>
            <div className="g-bal">{v ? `${sol(v.sol)} SOL` : '…'}</div>
            {v && <SwapBars swaps={v.swaps} h={170} />}
          </Phone>
          <Phone mid>
            <Lbl live>{copy.home.agent}</Lbl>
            <PushFeed n={7} />
          </Phone>
          <Phone>
            <Lbl>{copy.home.swaps}</Lbl>
            <div className="g-minibags">
              {(v?.swaps ?? []).slice(0, 8).map((x) => (
                <div key={x.sig}>
                  <b className={x.side === 'sell' ? 'g-down' : 'g-up'}>{x.side}</b>
                  <span>{sol(x.sol)} SOL</span>
                </div>
              ))}
            </div>
          </Phone>
        </div>
        <div className="g-pitch">
          <h1>
            {lines[0]}
            <br />
            {lines[1]}
            <br />
            <i>{lines[2]}</i>
          </h1>
          <div>
            <a className="g-cta" href="/connect" onClick={linkClick}>
              {copy.home.deploy}
              <IconArrowUpRight size={18} />
            </a>
            <a className="g-cta g-cta-b" href="/tools" onClick={linkClick}>
              {copy.home.npx}
            </a>
          </div>
          <Find />
        </div>
      </div>
      <div className="g-row g-r4">
        <div>
          <Lbl>{copy.home.stats.sol}</Lbl>
          <div className="g-big">{v ? sol(v.sol) : '…'}</div>
        </div>
        <div>
          <Lbl>{copy.home.stats.flowIn}</Lbl>
          <div className="g-big">{v ? sol(v.flow.in) : '…'}</div>
        </div>
        <div>
          <Lbl>{copy.home.stats.flowOut}</Lbl>
          <div className="g-big">{v ? sol(v.flow.out) : '…'}</div>
        </div>
        <div>
          <Lbl>{copy.home.stats.net}</Lbl>
          <div className={`g-big ${v && v.flow.net >= 0 ? 'g-up' : 'g-down'}`}>{v ? (v.flow.net > 0 ? '+' : '') + sol(v.flow.net) : '…'}</div>
        </div>
      </div>
      <div className="g-row g-r3">
        <div>
          <Lbl>
            {copy.home.swapsTitle} · {name}
          </Lbl>
          {v ? <SwapBars swaps={v.swaps} /> : <div className="g-dither-box" />}
        </div>
        <div>
          <Lbl live>{copy.home.tapeTitle}</Lbl>
          <Tape events={events} />
        </div>
        <div>
          <Lbl>{copy.home.askTitle}</Lbl>
          <Playground v={v} name={name} />
        </div>
      </div>
      <div className="g-row g-r1">
        <div>
          <div className="g-head">
            <Lbl>{copy.home.boardTitle}</Lbl>
            <a href="/wallets" onClick={linkClick} className="g-link">
              {copy.home.seeAll}
            </a>
          </div>
          <div className="g-board">
            {board.map((b) => (
              <a key={b.w} href={`/w/${b.w}`} onClick={linkClick}>
                <b>{b.name}</b>
                <span className="g-num">{b.sol !== null ? `${sol(b.sol)} SOL` : ''}</span>
                <span className="g-num g-dim">{b.trades} swaps</span>
                <IconArrowRight size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>
      <Footer />
      <Dither />
    </main>
  );
}
