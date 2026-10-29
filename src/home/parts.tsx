// Shared Grid parts: push text, phone frame, live feed, swap bars, MCP playground, footer.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { brand } from '../brand.ts';
import { ago, fill, short, sol, usd } from '../core/format.ts';
import { useNow, useStore } from '../lib/react.ts';
import { linkClick } from '../lib/router.ts';
import { arrived, live } from '../state/live.ts';
import type { Swap, Trade, WalletView } from '../state/live.ts';
import { githubUrl, xUrl } from '../ui/Header.tsx';

export const sym = (s: string | null | undefined, mint: string) => '$' + (s || mint.slice(0, 4));
export const pushText = (t: { name: string; side: 'buy' | 'sell'; sol: number; sym: string | null; mint: string }) =>
  fill(t.side === 'buy' ? copy.push.buy : copy.push.sell, { name: t.name, sol: sol(t.sol), sym: sym(t.sym, t.mint) });

export function Lbl({ children, live: on }: { children: ReactNode; live?: boolean }) {
  return <div className={`g-lbl${on ? ' g-live' : ''}`}>{children}</div>;
}

export function Phone({ children, mid }: { children: ReactNode; mid?: boolean }) {
  return <div className={`g-ph${mid ? ' g-ph-m' : ''}`}>{children}</div>;
}

/** The agent's pushes: the biggest live swaps, newest first. */
export function PushFeed({ n = 6, min = 0 }: { n?: number; min?: number }) {
  const events = useStore(live, (s) => s.events);
  useNow(5000);
  const list = events.filter((e) => e.score >= min).slice(0, n);
  return (
    <div className="g-feed">
      {list.map((e) => (
        <a key={e.sig} className={`g-push${arrived.has(e.sig) ? ' is-new' : ''}`} href={`/w/${e.w}`} onClick={linkClick}>
          <b>{fill(copy.push.now, { ago: ago(e.t) })}</b>
          <span className={e.side === 'sell' ? 'g-down' : 'g-up'}>●</span> {pushText(e)}
        </a>
      ))}
    </div>
  );
}

/** Swap bars: height = SOL, green buy / pink sell. Tap shows the swap. */
export function SwapBars({ swaps, h = 150 }: { swaps: Swap[]; h?: number }) {
  const [pick, setPick] = useState<number | null>(null);
  const max = Math.max(1, ...swaps.map((s) => s.sol));
  const list = swaps.slice(0, 30).reverse();
  const cur = pick !== null ? list[pick] : null;
  return (
    <div>
      <div className="g-bars" style={{ height: h }}>
        {list.map((s, i) => (
          <button
            key={s.sig}
            type="button"
            className={`g-bar ${s.side}${pick === i ? ' on' : ''}`}
            style={{ height: `${8 + (s.sol / max) * 92}%` }}
            onClick={() => setPick(i)}
            onMouseEnter={() => setPick(i)}
            aria-pressed={pick === i}
            aria-label={`${s.side} ${sol(s.sol)} SOL`}
          />
        ))}
      </div>
      <div className="g-mono g-small">
        ▸ {cur ? `${cur.side} ${sol(cur.sol)} SOL · ${sym(cur.sym, cur.mint)} · ${ago(cur.t)}` : copy.home.tapBar}
      </div>
    </div>
  );
}

export function Tape({ events }: { events: Trade[] }) {
  return (
    <table className="g-tape">
      <tbody>
        {events.slice(0, 9).map((e) => (
          <tr key={e.sig} className={arrived.has(e.sig) ? 'is-new' : ''}>
            <td>
              <a href={`/w/${e.w}`} onClick={linkClick}>
                {e.name}
              </a>
            </td>
            <td className={e.side === 'sell' ? 'g-down' : 'g-up'}>{e.side}</td>
            <td>{sol(e.sol)} SOL</td>
            <td className="g-dim">{sym(e.sym, e.mint)}</td>
            <td className="g-dim g-r">{ago(e.t)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** What each MCP tool returns, computed from the wallet in view. */
export function toolOut(name: string, v: WalletView | undefined, events: Trade[]): string {
  if (!v) return '…';
  const big = v.swaps.slice().sort((a, b) => b.sol - a.sol).slice(0, 3);
  switch (name) {
    case 'whats_important':
      return `→ ${big.length} events\n` + big.map((s) => `• ${s.side} ${sol(s.sol)} SOL ${sym(s.sym, s.mint)} · ${ago(s.t)}`).join('\n');
    case 'pnl':
      return `→ in  ${sol(v.flow.in)} SOL\n  out ${sol(v.flow.out)} SOL\n  net ${v.flow.net > 0 ? '+' : ''}${sol(v.flow.net)} SOL`;
    case 'bags':
      return v.bags.length ? '→ ' + v.bags.slice(0, 5).map((b) => `$${b.sym} ${usd(b.usd)}`).join('\n  ') : `→ ${sol(v.sol)} SOL`;
    case 'style':
      return `→ "${v.style.kind}"\n  typical buy ${sol(v.style.size)} SOL\n  ${v.style.perHour} swaps / h`;
    case 'trades':
      return '→ ' + v.swaps.slice(0, 5).map((s) => `${s.side} ${sol(s.sol)} ${sym(s.sym, s.mint)}`).join('\n  ');
    case 'watch':
      return `→ watching ${short(v.w)}\n  ${events.filter((e) => e.w === v.w).length} swaps seen live`;
    default:
      return '';
  }
}

export const TOOL_NAMES = ['whats_important', 'pnl', 'bags', 'style', 'trades', 'watch'];

export function Playground({ v, name }: { v: WalletView | undefined; name: string }) {
  const events = useStore(live, (s) => s.events);
  const [tool, setTool] = useState('whats_important');
  const [picked, setPicked] = useState(false);
  const [text, setText] = useState('');
  const full = useMemo(() => `fmt.${tool}("${name}")\n${toolOut(tool, v, events)}`, [tool, v, name, events]);
  const t = useRef(0);
  useEffect(() => {
    let i = 0;
    window.clearInterval(t.current);
    t.current = window.setInterval(() => {
      i += 2;
      setText(full.slice(0, i));
      if (i >= full.length) window.clearInterval(t.current);
    }, 16);
    return () => window.clearInterval(t.current);
  }, [full]);
  return (
    <div>
      <div className="g-tools">
        {TOOL_NAMES.map((n) => (
          <button key={n} type="button" className={n === tool ? 'on' : ''} aria-pressed={picked && n === tool} onClick={() => (setTool(n), setPicked(true))}>
            {n}()
          </button>
        ))}
      </div>
      <pre className="g-out">{text}</pre>
    </div>
  );
}

export function Footer() {
  const f = copy.home.footer;
  const L = (href: string, t: string) => (
    <a href={href} onClick={linkClick}>
      {t}
    </a>
  );
  return (
    <footer className="g-foot">
      <div>
        <b className="g-foot-word">
          fmt<span>+</span>
        </b>
        <div className="g-dim">
          {brand.domain} ·{' '}
          <a href={xUrl} target="_blank" rel="noopener noreferrer">
            @{brand.x}
          </a>{' '}
          ·{' '}
          <a href={githubUrl} target="_blank" rel="noopener noreferrer">
            github.com/fmt-plus
          </a>
        </div>
      </div>
      <div>
        {L('/live', f.live)}
        {L('/wallets', f.wallets)}
        {L('/tools', f.tools)}
      </div>
      <div>
        {L('/connect', f.connect)}
        {L('/docs', f.docs)}
      </div>
      <div>
        <a href={xUrl} target="_blank" rel="noopener noreferrer">
          {f.x}
        </a>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer">
          {f.github}
        </a>
      </div>
    </footer>
  );
}

export const Dither = () => <div className="g-dither" aria-hidden />;
