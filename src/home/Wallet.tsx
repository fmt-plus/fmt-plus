// /w/<addr>: one wallet as the agent sees it — balance, flow, style, swap bars, bags, the pushes it would send.
import { useEffect } from 'react';
import { copy } from '../copy.ts';
import { ago, short, sol, usd } from '../core/format.ts';
import { copyText } from '../core/clipboard.ts';
import { useStore } from '../lib/react.ts';
import { loadWallet, wallets } from '../state/live.ts';
import { toast } from '../state/ui.ts';
import { Dither, Footer, Lbl, Playground, SwapBars, pushText, sym } from './parts.tsx';
import { TgButton } from './Connect.tsx';

export function Wallet({ w }: { w: string }) {
  const st = useStore(wallets, (s) => s[w]);
  useEffect(() => {
    loadWallet(w);
    const t = window.setInterval(() => loadWallet(w, true), 30000);
    return () => window.clearInterval(t);
  }, [w]);
  const v = st?.v;
  const name = v?.name ?? short(w);
  return (
    <main className="g">
      <div className="g-row g-r2 g-top">
        <div>
          <Lbl>{copy.wpage.title}</Lbl>
          <h1 className="g-h1">{name}</h1>
          <div className="g-mono g-small">{w}</div>
          <div className="g-acts">
            <button
              type="button"
              className="g-cta g-cta-s"
              onClick={() => void copyText(w).then((ok) => ok && toast(copy.toast.addrCopied))}
            >
              {copy.wpage.copy}
            </button>
            <a className="g-cta g-cta-s g-cta-w" href={`https://solscan.io/account/${w}`} target="_blank" rel="noopener noreferrer">
              {copy.wpage.solscan}
            </a>
            <TgButton w={w} small />
          </div>
        </div>
        <div>
          <div className="g-huge">{v ? `${sol(v.sol)} SOL` : st?.err ? '—' : '…'}</div>
          {v?.solUsd && <div className="g-dim">{copy.wpage.usd.replace('{usd}', usd(v.sol * v.solUsd + v.bagsUsd))}</div>}
          {st?.err && (
            <button type="button" className="g-cta g-cta-s" onClick={() => loadWallet(w, true)}>
              {copy.wpage.retry}
            </button>
          )}
        </div>
      </div>
      {!v ? (
        <div className="g-row g-r1">
          <div className="g-dither-box">{st?.err ? copy.wpage.fail : copy.wpage.loading}</div>
        </div>
      ) : (
        <>
          <div className="g-row g-r4">
            <div>
              <Lbl>{copy.wpage.style}</Lbl>
              <div className="g-big">{v.style.kind === 'flipper' ? copy.wpage.flipper : copy.wpage.holder}</div>
            </div>
            <div>
              <Lbl>{copy.wpage.size}</Lbl>
              <div className="g-big">{sol(v.style.size)}</div>
            </div>
            <div>
              <Lbl>{copy.wpage.pace}</Lbl>
              <div className="g-big">{v.style.perHour}</div>
            </div>
            <div className={v.flow.net >= 0 ? 'g-green' : 'g-pink'}>
              <Lbl>{copy.home.stats.net}</Lbl>
              <div className="g-big">{(v.flow.net > 0 ? '+' : '') + sol(v.flow.net)}</div>
            </div>
          </div>
          <div className="g-row g-r3">
            <div>
              <Lbl>{copy.home.swapsTitle}</Lbl>
              <SwapBars swaps={v.swaps} h={200} />
            </div>
            <div>
              <Lbl>{copy.home.bags}</Lbl>
              <div className="g-bags">
                {v.bags.length ? (
                  v.bags.map((b) => (
                    <a key={b.mint} href={`https://dexscreener.com/solana/${b.mint}`} target="_blank" rel="noopener noreferrer">
                      <b>${b.sym}</b>
                      <i style={{ width: `${Math.max(4, (b.usd / v.bags[0].usd) * 100)}%` }} />
                      <span>{usd(b.usd)}</span>
                    </a>
                  ))
                ) : (
                  <div className="g-dim">{copy.wpage.bagsEmpty}</div>
                )}
              </div>
            </div>
            <div>
              <Lbl>{copy.home.askTitle}</Lbl>
              <Playground v={v} name={name} />
            </div>
          </div>
          <div className="g-row g-r1">
            <div>
              <Lbl live>{copy.wpage.pushTitle}</Lbl>
              <div className="g-pushlist">
                {v.swaps
                  .filter((s) => s.sol >= 5)
                  .slice(0, 8)
                  .map((s) => (
                    <a key={s.sig} href={`https://solscan.io/tx/${s.sig}`} target="_blank" rel="noopener noreferrer" className="g-push">
                      <b>{ago(s.t)}</b>
                      <i className={`g-dot ${s.side}`} aria-hidden /> {pushText({ ...s, name, sym: s.sym ?? null })}
                      <em>{sym(s.sym, s.mint)}</em>
                    </a>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}
      <Footer />
      <Dither />
    </main>
  );
}
