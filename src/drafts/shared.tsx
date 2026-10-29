// Shared parts of the two Grid versions (A: showcase home + /agent page, B: the agent builder is the home).
// Rules: every text is one affirmative sentence from copy.d; every label holds one fact; actions say what they do;
// no blinking dots, no "Live" labels, no meaning carried by a colored dot alone.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { inside, to } from '../lib/hosts.ts';
import { api } from '../core/http.ts';
import { copyText } from '../core/clipboard.ts';
import { createStore } from '../core/store.ts';
import { fill, short, sol, usd } from '../core/format.ts';
import { wallet } from '../core/wallet.ts';
import { session } from '../core/session.ts';
import { useNow, useStore } from '../lib/react.ts';
import { linkClick, navigate, route } from '../lib/router.ts';
import { COOKER, live, loadWallet, wallets } from '../state/live.ts';
import type { Swap, Trade, WalletView } from '../state/live.ts';
import { openSheet, toast } from '../state/ui.ts';
import { connectWallet, signInNow } from '../wallet/flow.ts';
import { IconArrowRight, IconArrowUpRight, IconCheck, IconClose, IconCopy, IconGitHub, IconTelegram, IconX } from '../ui/Icons.tsx';
import { githubUrl, xUrl } from '../ui/Header.tsx';
import { brand } from '../brand.ts';
import { Bubble, useMsgs } from './phones.tsx';
import type { MsgType } from './phones.tsx';

const D = copy.d;
const F = copy.d.feed;
export const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// ── who is here ──────────────────────────────────────────
export function useMe() {
  const account = useStore(wallet, (s) => s.account);
  const connecting = useStore(wallet, (s) => s.connecting);
  const signed = useStore(session, (s) => !!s.s && s.s.address === account);
  const busy = useStore(session, (s) => s.busy);
  return { account, connecting: connecting || busy, signed };
}

// ── the agent ────────────────────────────────────────────
export interface Agent {
  id: string;
  wallet: string;
  name: string;
  createdAt: number;
  watch: string[];
  rules: { minSol: number; sides: 'all' | 'buys' | 'sells'; newTokensOnly?: boolean };
  cadence: 'each' | 'hourly' | 'daily';
  tg: { linked: boolean };
}
export const drawer = createStore<{ open: boolean; tab: 'feed' | 'settings' | 'stats' }>({ open: false, tab: 'feed' });
// the open panel takes room from the page instead of covering it (desktop): the shell gets a class
drawer.subscribe(() => document.documentElement.classList.toggle('v-drawer-on', drawer.get().open));
export const openDrawer = (tab: 'feed' | 'settings' | 'stats' = 'feed') => drawer.set({ open: true, tab });
export const agentStore = createStore<{ agent: Agent | null; for: string | null; busy: boolean }>({ agent: null, for: null, busy: false });

export function loadAgent(): void {
  const s = session.get().s;
  const a = wallet.get().account;
  if (!s || !a || s.address !== a) {
    if (agentStore.get().agent) agentStore.set({ agent: null, for: null });
    return;
  }
  if (agentStore.get().for === a && agentStore.get().agent) return;
  agentStore.set({ for: a });
  void api<{ agent: Agent | null }>('/agent')
    .then((r) => agentStore.set({ agent: r.agent ?? null }))
    .catch(() => agentStore.set({ for: null }));
}
session.subscribe(loadAgent);
wallet.subscribe(loadAgent);

export function useAgent() {
  useEffect(loadAgent, []);
  return useStore(agentStore, (s) => s);
}

/** Connect (one free signature) and create the agent for this wallet. */
export async function spawnAgent(): Promise<void> {
  agentStore.set({ busy: true });
  try {
    if (!wallet.get().account) await connectWallet();
    if (!wallet.get().account) return;
    const s = session.get().s;
    if (!s || s.address !== wallet.get().account) await signInNow();
    const r = await api<{ agent: Agent }>('/agent', { method: 'POST', body: {} });
    agentStore.set({ agent: r.agent, for: r.agent.wallet });
    loadWallet(r.agent.wallet, true);
    openDrawer('feed');
  } catch {
    toast(copy.toast.failed, 'warn');
  } finally {
    agentStore.set({ busy: false });
  }
}

/** Save part of the agent: the screen updates at once, the server answers with the stored agent. */
export async function saveAgent(patch: Partial<Pick<Agent, 'name' | 'watch' | 'rules' | 'cadence'>>): Promise<void> {
  const cur = agentStore.get().agent;
  if (!cur) return;
  agentStore.set({ agent: { ...cur, ...patch, rules: { ...cur.rules, ...(patch.rules ?? {}) } } });
  try {
    const r = await api<{ agent: Agent }>('/agent', { method: 'PATCH', body: patch });
    agentStore.set({ agent: r.agent });
  } catch {
    agentStore.set({ agent: cur });
    toast(copy.toast.failed, 'warn');
  }
}

// ── Telegram ─────────────────────────────────────────────
const tg = createStore<{ username: string | null; read: boolean }>({ username: null, read: false });
export function useTgBot(): string | null {
  const u = useStore(tg, (s) => s.username);
  useEffect(() => {
    if (tg.get().read) return;
    tg.set({ read: true });
    void api<{ on: boolean; username: string | null }>('/tg')
      .then((r) => tg.set({ username: r.username }))
      .catch(() => undefined);
  }, []);
  return u;
}
export const tgLink = (bot: string, w?: string | null) => `https://t.me/${bot}${w ? `?start=${w}` : ''}`;
/** The bot binds the chat to this agent (its watch list, rules and timing). */
export const tgAgentLink = (bot: string, a: Agent) => `https://t.me/${bot}?start=agent_${a.id}`;

// ── formats ──────────────────────────────────────────────
export function agoText(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return fill(D.ago.s, { n: s });
  if (s < 3600) return fill(D.ago.m, { n: Math.round(s / 60) });
  if (s < 172800) return fill(D.ago.h, { n: Math.round(s / 3600) });
  return fill(D.ago.d, { n: Math.round(s / 86400) });
}
const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const period = (from: number | null, to: number | null) => (from && to ? (day(from) === day(to) ? day(to) : `${day(from)} – ${day(to)}`) : '—');
export const solTxt = (x: number) => `${sol(x) || '0'} SOL`;
export const signedSol = (x: number) => `${x > 0 ? '+' : ''}${solTxt(x)}`;
export const tok = (sym: string | null | undefined, mint: string) => '$' + (sym || mint.slice(0, 4));
const nameOf = (w: string) => live.get().board.find((b) => b.w === w)?.name ?? short(w);

/** The trades an agent with these rules would send (newest first). */
export function matching(events: Trade[], agent: Agent | null): Trade[] {
  const minSol = agent?.rules.minSol ?? 0.1;
  const sides = agent?.rules.sides ?? 'all';
  const watch = agent ? new Set(agent.watch) : null;
  // "new token": the feed holds no trade of it older than 24 h (the bot checks every recorded trade)
  const old = new Set(events.filter((e) => e.t < Date.now() - 86400_000).map((e) => e.mint));
  return events.filter(
    (e) =>
      (!watch || watch.has(e.w)) &&
      e.sol >= minSol &&
      (sides === 'all' || (sides === 'buys' ? e.side === 'buy' : e.side === 'sell')) &&
      (!agent?.rules.newTokensOnly || !old.has(e.mint)),
  );
}
export const alertText = (e: Trade) =>
  fill(D.agent.alertLine, { name: e.name, side: e.side === 'buy' ? D.agent.bought : D.agent.sold, sol: solTxt(e.sol), token: tok(e.sym, e.mint) });

// ── chrome ───────────────────────────────────────────────
export function Wordmark({ className = '' }: { className?: string }) {
  return <img className={`v-wordmark ${className}`} src="/wordmark.svg" alt={brand.name} />;
}

export function Header({ agentHref }: { agentHref: string }) {
  const path = inside(useStore(route, (s) => s.path));
  const { agent } = useAgent();
  const { account } = useMe();
  const nav: [string, string][] = [
    [agentHref, D.nav.agent],
    ['/wallets', D.nav.wallets],
    ['/trades', D.nav.trades],
    ['/mcp', D.nav.mcp],
    ['/blog', D.nav.blog],
  ];
  const on = (h: string) => (h === '/' ? path === '/' : path === h || path.startsWith(h + '/'));
  return (
    <header className="v-hd">
      <a className="v-hd-word" href={to('/')} onClick={linkClick} aria-label={D.wordmark}>
        <Wordmark />
      </a>
      <nav className="v-hd-nav" aria-label="Main">
        {nav.map(([h, t]) => (
          <a key={h + t} href={to(h)} onClick={linkClick} aria-current={on(h) ? 'page' : undefined}>
            {t}
          </a>
        ))}
      </nav>
      <div className="v-hd-end">
        <a className="v-ic" href={xUrl} target="_blank" rel="noopener noreferrer" aria-label={copy.nav.xLabel}>
          <IconX size={16} />
        </a>
        <a className="v-ic" href={githubUrl} target="_blank" rel="noopener noreferrer" aria-label={copy.nav.github}>
          <IconGitHub size={17} />
        </a>
        {agent ? (
          <button type="button" className="v-pill v-pill-pink" onClick={() => openDrawer('feed')}>
            {D.drawer.open}
          </button>
        ) : (
          <SpawnButton className="v-pill v-pill-pink" />
        )}
        {account && (
          <button type="button" className="v-chip" onClick={() => openSheet('wallet')} aria-label={D.stats.copy}>
            <span className="v-mono">{short(account, 4)}</span>
          </button>
        )}
      </div>
    </header>
  );
}

/** Spawns the agent (one free signature); the agent panel slides in from the right. */
export function SpawnButton({ className = 'v-pill v-pill-lime', large }: { className?: string; large?: boolean }) {
  const { agent, busy } = useAgent();
  const { connecting } = useMe();
  if (agent)
    return (
      <button type="button" className={`${className}${large ? ' v-pill-l' : ''}`} onClick={() => openDrawer('feed')}>
        {D.drawer.open}
      </button>
    );
  return (
    <button type="button" className={`${className}${large ? ' v-pill-l' : ''}`} onClick={() => void spawnAgent()} disabled={busy || connecting}>
      {busy || connecting ? D.connecting : D.spawnCta}
      <IconArrowUpRight size={large ? 18 : 15} />
    </button>
  );
}

/** The agent panel: slides in from the right with the feed and the settings. */
export function AgentDrawer() {
  const d = useStore(drawer, (s) => s);
  const { agent } = useAgent();
  useEffect(() => {
    if (!d.open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && drawer.set({ open: false });
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [d.open]);
  return (
    <div className={`v-drawer${d.open ? ' is-open' : ''}`} aria-hidden={!d.open}>
      <aside className="v-drawer-p" aria-label={D.drawer.title}>
        <div className="v-drawer-hd">
          <h2>{agent?.name ?? D.drawer.title}</h2>
          <button type="button" className="v-ic" onClick={() => drawer.set({ open: false })} aria-label={D.drawer.close}>
            <IconClose size={20} />
          </button>
        </div>
        <div className="v-seg v-drawer-tabs" role="tablist">
          {(['feed', 'settings', 'stats'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={d.tab === t} aria-pressed={d.tab === t} onClick={() => drawer.set({ tab: t })}>
              {D.drawer[t]}
            </button>
          ))}
        </div>
        <div className="v-drawer-b">
          {d.open && d.tab === 'feed' && <AlertFeed n={40} full />}
          {d.open && d.tab === 'settings' && <AgentBuilder />}
          {d.open && d.tab === 'stats' && agent && (
            <>
              <WalletHead w={agent.wallet} />
              <WalletStats w={agent.wallet} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="v-foot">
      <div className="v-foot-brand">
        <Wordmark />
        <p>{D.safe}</p>
      </div>
      <nav aria-label="Footer">
        <a href={to('/agent')} onClick={linkClick}>
          {D.nav.agent}
        </a>
        <a href={to('/wallets')} onClick={linkClick}>
          {D.nav.wallets}
        </a>
        <a href={to('/trades')} onClick={linkClick}>
          {D.nav.trades}
        </a>
      </nav>
      <nav aria-label="More">
        <a href={to('/mcp')} onClick={linkClick}>
          {D.nav.mcp}
        </a>
        <a href={to('/blog')} onClick={linkClick}>
          {D.nav.blog}
        </a>
      </nav>
      <nav aria-label="Social">
        <a href={xUrl} target="_blank" rel="noopener noreferrer">
          <IconX size={15} /> @{brand.x}
        </a>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer">
          <IconGitHub size={16} /> GitHub
        </a>
      </nav>
    </footer>
  );
}

export const Dither = () => <div className="v-dither" aria-hidden />;

// ── the agent builder ────────────────────────────────────
function Step({ n, title, line, done, off, children }: { n: number; title: string; line: string; done?: boolean; off?: boolean; children?: ReactNode }) {
  return (
    <li className={`v-step${done ? ' is-done' : ''}${off ? ' is-off' : ''}`}>
      <span className="v-step-n" aria-hidden>
        {done ? <IconCheck size={20} /> : n}
      </span>
      <div className="v-step-b">
        <h3>{title}</h3>
        <p>{line}</p>
        {children}
      </div>
    </li>
  );
}

function Seg<T extends string | number>({ value, options, onPick, off, label }: { value: T; options: [T, string][]; onPick: (v: T) => void; off: boolean; label: string }) {
  return (
    <div className="v-seg" role="group" aria-label={label}>
      {options.map(([v, t]) => (
        <button key={String(v)} type="button" aria-pressed={v === value} disabled={off} onClick={() => onPick(v)}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function AgentBuilder() {
  const { agent, busy } = useAgent();
  const { connecting } = useMe();
  const board = useStore(live, (s) => s.board);
  const bot = useTgBot();
  const [addr, setAddr] = useState('');
  const A = D.agent;
  const off = !agent;
  const watch = agent?.watch ?? [];
  const toggle = (w: string) => {
    if (!agent) return;
    if (watch.includes(w)) void saveAgent({ watch: watch.filter((x) => x !== w) });
    else if (watch.length >= 20) toast(A.s2.full, 'warn');
    else void saveAgent({ watch: [...watch, w] });
  };
  const top = board.filter((b) => b.top);
  const extra = watch.filter((w) => w !== agent?.wallet && !top.some((b) => b.w === w));
  return (
    <ol className="v-steps" aria-label={A.title}>
      <Step n={1} title={A.s1.t} line={agent ? fill(A.s1.ok, { name: agent.name, n: agent.watch.length }) : A.s1.d} done={!!agent}>
        {!agent && (
          <button type="button" className="v-pill v-pill-lime" onClick={() => void spawnAgent()} disabled={busy || connecting}>
            {busy || connecting ? D.connecting : A.s1.b}
          </button>
        )}
      </Step>
      <Step n={2} title={A.s2.t} line={agent ? A.s2.d : A.first} off={off}>
        <div className="v-chips">
          <span className="v-tag is-on">
            <IconCheck size={14} /> {A.s2.own}
          </span>
          {[...top].sort((x, y) => Number(watch.includes(y.w)) - Number(watch.includes(x.w))).map((b) => (
            <button key={b.w} type="button" className={`v-tag${watch.includes(b.w) ? ' is-on' : ''}`} aria-pressed={watch.includes(b.w)} disabled={off} onClick={() => toggle(b.w)}>
              {watch.includes(b.w) && <IconCheck size={14} />} {b.name}
            </button>
          ))}
          {extra.map((w) => (
            <button key={w} type="button" className="v-tag is-on" aria-label={fill(A.s2.remove, { name: short(w) })} disabled={off} onClick={() => toggle(w)}>
              <IconCheck size={14} /> {short(w)}
            </button>
          ))}
        </div>
        <form
          className="v-add"
          onSubmit={(e) => {
            e.preventDefault();
            const a = addr.trim();
            if (!ADDR.test(a)) return toast(A.s2.bad, 'warn');
            toggle(a);
            setAddr('');
          }}
        >
          <label htmlFor="v-add" className="v-sr">
            {A.s2.add}
          </label>
          <input id="v-add" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder={A.s2.hint} disabled={off} spellCheck={false} autoComplete="off" />
          <button type="submit" className="v-pill v-pill-line" disabled={off}>
            {A.s2.addB}
          </button>
        </form>
        <p className="v-note">{A.s2.public}</p>
      </Step>
      <Step n={3} title={A.s3.t} line={agent ? fill(A.ruleLine, { sol: sol(agent.rules.minSol) }) : A.first} off={off}>
        <div className="v-rules">
          <div>
            <span className="v-k">{A.s3.size}</span>
            <Seg label={A.s3.size} value={agent?.rules.minSol ?? 1} off={off} options={[[0.1, '0.1'], [1, '1'], [5, '5'], [10, '10'], [25, '25']]} onPick={(v) => void saveAgent({ rules: { ...agent!.rules, minSol: v } })} />
          </div>
          <div>
            <span className="v-k">{A.s3.sides}</span>
            <Seg label={A.s3.sides} value={agent?.rules.sides ?? 'all'} off={off} options={[['all', A.s3.all], ['buys', A.s3.buys], ['sells', A.s3.sells]]} onPick={(v) => void saveAgent({ rules: { ...agent!.rules, sides: v } })} />
          </div>
          <div>
            <span className="v-k">{A.s3.tokens}</span>
            <Seg label={A.s3.tokens} value={agent?.rules.newTokensOnly ? 'new' : 'all'} off={off} options={[['all', A.s3.allTokens], ['new', A.s3.newOnly]]} onPick={(v) => void saveAgent({ rules: { ...agent!.rules, newTokensOnly: v === 'new' } })} />
            <p className="v-note">{A.s3.newNote}</p>
          </div>
          <div>
            <span className="v-k">{A.s3.cadence}</span>
            <Seg label={A.s3.cadence} value={agent?.cadence ?? 'each'} off={off} options={[['each', A.s3.each], ['hourly', A.s3.hourly], ['daily', A.s3.daily]]} onPick={(v) => void saveAgent({ cadence: v })} />
          </div>
        </div>
      </Step>
      <Step n={4} title={A.s4.t} line={agent ? (agent.tg.linked ? A.s4.ok : A.s4.d) : A.first} done={!!agent?.tg.linked} off={off}>
        {agent && bot ? (
          <>
            <a className="v-pill v-pill-tg" href={tgAgentLink(bot, agent)} target="_blank" rel="noopener noreferrer">
              <IconTelegram size={17} /> {A.s4.b}
            </a>
            <p className="v-note">{A.s4.start}</p>
          </>
        ) : (
          <span className="v-pill v-pill-tg" aria-disabled>
            <IconTelegram size={17} /> {A.s4.b}
          </span>
        )}
      </Step>
    </ol>
  );
}

// ── phones ───────────────────────────────────────────────
export function Phone({ caption, children, mid }: { caption: string; children: ReactNode; mid?: boolean }) {
  return (
    <figure className={`v-phone${mid ? ' v-phone-m' : ''}`}>
      <div className="v-phone-screen">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** The agent's messages as colored, labeled bubbles: buy, sell, coin up, digest. */
// Message types a viewer hid from the feed on the site (the bot keeps sending them); kept in this browser.
const HIDE_KEY = 'fmt.feed.hide';
const TIPS_KEY = 'fmt.feed.tips';
const readLS = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};
const feedHide = createStore<{ hide: MsgType[]; tips: boolean }>({
  hide: (() => {
    try {
      return JSON.parse(readLS(HIDE_KEY) || '[]') as MsgType[];
    } catch {
      return [];
    }
  })(),
  tips: readLS(TIPS_KEY) !== 'done',
});
const TYPES: MsgType[] = ['buy', 'sell', 'up', 'digest'];

export function AlertFeed({ n = 6, full }: { n?: number; full?: boolean }) {
  const { agent } = useAgent();
  const bot = useTgBot();
  const { hide, tips } = useStore(feedHide, (s) => s);
  const msgs = useMsgs(false)
    .filter((m) => !full || !hide.includes(m.type))
    .slice(0, n);
  useNow(15000);
  const toggle = (t: MsgType) => {
    const next = hide.includes(t) ? hide.filter((x) => x !== t) : [...hide, t];
    writeLS(HIDE_KEY, JSON.stringify(next));
    feedHide.set({ hide: next });
  };
  const doneTips = () => {
    writeLS(TIPS_KEY, 'done');
    feedHide.set({ tips: false });
  };
  return (
    <div className="v-feed">
      {full && agent && bot && !agent.tg.linked && (
        <div className="v-feed-tg">
          <p>{F.tgLine}</p>
          <a className="v-pill v-pill-tg" href={tgAgentLink(bot, agent)} target="_blank" rel="noopener noreferrer">
            {F.tgCta}
          </a>
        </div>
      )}
      {full && tips && (
        <div className="v-feed-tips">
          <b>{F.tipsTitle}</b>
          <ol>
            <li>{F.tip1}</li>
            <li>
              {F.tip2}{' '}
              <button type="button" className="v-link" onClick={() => openDrawer('settings')}>
                {D.agent.toSettings}
              </button>
            </li>
            <li>{F.tip3}</li>
          </ol>
          <button type="button" className="v-pill v-pill-line" onClick={doneTips}>
            {F.tipsOk}
          </button>
        </div>
      )}
      {full && (
        <div className="v-feed-types" role="group" aria-label={F.typesLabel}>
          {TYPES.map((t) => (
            <button key={t} type="button" className={`v-ftype v-ftype-${t}`} aria-pressed={!hide.includes(t)} onClick={() => toggle(t)}>
              {F.types[t]}
            </button>
          ))}
        </div>
      )}
      <p className="v-feed-h">{agent ? D.agent.matches : D.agent.previewDefault}</p>
      {msgs.length ? (
        msgs.map((m) => <Bubble key={m.id} m={m} />)
      ) : (
        <div className="v-empty">
          <p className="v-note">{D.agent.previewEmpty}</p>
          {agent && (
            <button type="button" className="v-pill v-pill-line" onClick={() => openDrawer('settings')}>
              {D.agent.toSettings}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function StatsMini({ w }: { w: string }) {
  const st = useWallet(w);
  const v = st?.v;
  return (
    <div className="v-mini">
      <p className="v-feed-h">{v?.name ?? short(w)}</p>
      {v ? (
        <dl>
          <div>
            <dt>{D.stats.sol}</dt>
            <dd>{solTxt(v.sol)}</dd>
          </div>
          <div>
            <dt>{D.stats.net}</dt>
            <dd className={v.flow.net >= 0 ? 'v-up' : 'v-down'}>{signedSol(v.flow.net)}</dd>
          </div>
          <div>
            <dt>{D.stats.win}</dt>
            <dd>{v.winRate === null ? '—' : `${v.winRate}%`}</dd>
          </div>
          <div>
            <dt>{D.stats.trades}</dt>
            <dd>{v.count}</dd>
          </div>
        </dl>
      ) : (
        <p className="v-note">{D.stats.loading}</p>
      )}
    </div>
  );
}

export function RulesMini() {
  const { agent } = useAgent();
  const A = D.agent;
  const watch = agent?.watch ?? [COOKER];
  const rules = agent?.rules ?? { minSol: 1, sides: 'all' as const };
  return (
    <div className="v-mini">
      <p className="v-feed-h">{agent?.name ?? A.title}</p>
      <dl>
        <div>
          <dt>{A.s2.t}</dt>
          <dd>{watch.slice(0, 3).map(nameOf).join(', ')}</dd>
        </div>
        <div>
          <dt>{A.s3.size}</dt>
          <dd>{sol(rules.minSol)}</dd>
        </div>
        <div>
          <dt>{A.s3.sides}</dt>
          <dd>{rules.sides === 'all' ? A.s3.all : rules.sides === 'buys' ? A.s3.buys : A.s3.sells}</dd>
        </div>
        <div>
          <dt>{A.s3.cadence}</dt>
          <dd>{(agent?.cadence ?? 'each') === 'each' ? A.s3.each : agent?.cadence === 'hourly' ? A.s3.hourly : A.s3.daily}</dd>
        </div>
      </dl>
    </div>
  );
}

// ── one wallet ───────────────────────────────────────────
export function useWallet(w: string | null) {
  const st = useStore(wallets, (s) => (w ? s[w] : undefined));
  useEffect(() => {
    if (!w) return;
    loadWallet(w);
    const t = window.setInterval(() => loadWallet(w, true), 60000);
    return () => window.clearInterval(t);
  }, [w]);
  return st;
}

function statRows(v: WalletView): [string, string, string][] {
  const net = v.flow.net;
  return [
    [D.stats.sol, solTxt(v.sol), ''],
    [D.stats.tokens, usd(v.bagsUsd) || '$0', ''],
    [D.stats.net, signedSol(net), net > 0 ? 'v-up' : net < 0 ? 'v-down' : ''],
    [D.stats.win, v.winRate === null ? '—' : `${v.winRate}% (${v.wins} of ${v.closed})`, ''],
    [D.stats.trades, String(v.count), ''],
    [D.stats.period, period(v.from, v.to), ''],
    [D.stats.buys, String(v.buys), ''],
    [D.stats.sells, String(v.sells), ''],
    [D.stats.spent, solTxt(v.flow.in), ''],
    [D.stats.got, solTxt(v.flow.out), ''],
    [D.stats.tokensTraded, String(v.tokens), ''],
    [D.stats.median, solTxt(v.style.size), ''],
  ];
}

export function WalletStats({ w }: { w: string }) {
  const st = useWallet(w);
  const v = st?.v;
  if (!v)
    return (
      <div className="v-state">
        <p>{st?.err ? D.stats.fail : D.stats.loading}</p>
        {st?.err && (
          <button type="button" className="v-pill v-pill-line" onClick={() => loadWallet(w, true)}>
            {D.stats.retry}
          </button>
        )}
      </div>
    );
  const rows = v.count ? statRows(v) : statRows(v).slice(0, 2);
  return (
    <div className="v-wallet">
      <p className="v-note">{v.count ? fill(D.stats.cover, { n: v.count, ago: agoText(v.at) }) : D.stats.empty}</p>
      <dl className="v-cells">
        {rows.map(([k, val, cls]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={cls || undefined}>{val}</dd>
          </div>
        ))}
      </dl>
      <details className="v-defs">
        <summary>{D.stats.defsTitle}</summary>
        <ul>
          {D.stats.defs.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </details>
      {v.swaps.length > 0 && <SwapTable swaps={v.swaps} />}
    </div>
  );
}

export function WalletHead({ w }: { w: string }) {
  const st = useWallet(w);
  const v = st?.v;
  const bot = useTgBot();
  const { agent } = useAgent();
  const mine = agent?.watch.includes(w);
  return (
    <div className="v-whead">
      <p className="v-mono v-addr">{w}</p>
      <div className="v-row">
        {v && (
          <span className={v.tracked ? 'v-up' : 'v-dim'}>
            {v.tracked && <IconCheck size={16} />} {v.tracked ? D.stats.onList : D.stats.offList}
          </span>
        )}
        {agent && w !== agent.wallet && (
          <button type="button" className={`v-tag${mine ? ' is-on' : ''}`} aria-pressed={!!mine} onClick={() => void saveAgent({ watch: mine ? agent.watch.filter((x) => x !== w) : [...agent.watch, w] })}>
            {mine && <IconCheck size={14} />} {mine ? D.stats.watching : D.stats.watch}
          </button>
        )}
        <button type="button" className="v-link" onClick={() => void copyText(w).then((ok) => ok && toast(copy.toast.addrCopied))}>
          <IconCopy size={15} /> {D.stats.copy}
        </button>
        <a className="v-link" href={`https://solscan.io/account/${w}`} target="_blank" rel="noopener noreferrer">
          {D.stats.solscan}
        </a>
        {bot && !agent && (
          <a className="v-link v-tg" href={tgLink(bot, w)} target="_blank" rel="noopener noreferrer">
            <IconTelegram size={15} /> {D.stats.alerts}
          </a>
        )}
      </div>
    </div>
  );
}

// ── tables ───────────────────────────────────────────────
export function SwapTable({ swaps }: { swaps: Swap[] }) {
  useNow(15000);
  const T = D.table;
  return (
    <div className="v-tablewrap">
      <table className="v-table">
        <thead>
          <tr>
            <th scope="col">{T.time}</th>
            <th scope="col">{T.action}</th>
            <th scope="col">{T.token}</th>
            <th scope="col" className="v-r">
              {T.sol}
            </th>
          </tr>
        </thead>
        <tbody>
          {swaps.slice(0, 12).map((s) => (
            <tr key={s.sig}>
              <td className="v-dim">{agoText(s.t)}</td>
              <td className={s.side === 'buy' ? 'v-up' : 'v-down'}>{s.side === 'buy' ? T.bought : T.sold}</td>
              <td>
                <a href={`https://dexscreener.com/solana/${s.mint}`} target="_blank" rel="noopener noreferrer">
                  {tok(s.sym, s.mint)}
                </a>
              </td>
              <td className="v-r v-num">{solTxt(s.sol)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecentTable({ limit = 15 }: { limit?: number }) {
  const events = useStore(live, (s) => s.events);
  useNow(15000);
  const T = D.table;
  return (
    <div className="v-tablewrap">
      <table className="v-table">
        <thead>
          <tr>
            <th scope="col">{T.time}</th>
            <th scope="col">{T.wallet}</th>
            <th scope="col">{T.action}</th>
            <th scope="col">{T.token}</th>
            <th scope="col" className="v-r">
              {T.sol}
            </th>
          </tr>
        </thead>
        <tbody>
          {events.slice(0, limit).map((e) => (
            <tr key={e.sig}>
              <td className="v-dim">{agoText(e.t)}</td>
              <td>
                <a href={`/w/${e.w}`} onClick={linkClick}>
                  {e.name}
                </a>
              </td>
              <td className={e.side === 'buy' ? 'v-up' : 'v-down'}>{e.side === 'buy' ? T.bought : T.sold}</td>
              <td>
                <a href={`https://dexscreener.com/solana/${e.mint}`} target="_blank" rel="noopener noreferrer">
                  {tok(e.sym, e.mint)}
                </a>
              </td>
              <td className="v-r v-num">{solTxt(e.sol)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrackedTable({ group, limit }: { group: 'top' | 'added'; limit?: number }) {
  const board = useStore(live, (s) => s.board);
  const { agent } = useAgent();
  // with an agent, alerts come from it: per-wallet bot links would start a second, different setup
  const bot = useTgBot() && !agent ? tg.get().username : null;
  const T = D.table;
  const rows = board
    .filter((b) => (group === 'top' ? b.top : !b.top && ((b.sol ?? 0) > 0 || b.trades > 0)))
    .sort((a, b) => b.volume - a.volume || (b.sol ?? 0) - (a.sol ?? 0))
    .slice(0, limit ?? 100);
  if (!rows.length) return null;
  return (
    <div className="v-tablewrap">
      <table className="v-table">
        <thead>
          <tr>
            <th scope="col">{T.wallet}</th>
            <th scope="col" className="v-r">
              {T.balance}
            </th>
            <th scope="col" className="v-r v-hide-s">
              {T.trades24}
            </th>
            <th scope="col" className="v-r v-hide-s">
              {T.volume24}
            </th>
            <th scope="col" className="v-r">
              <span className="v-sr">{T.view}</span>
            </th>
            {bot && (
              <th scope="col" className="v-r v-hide-s">
                <span className="v-sr">{T.alerts}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.w}>
              <td>
                <b>{b.name}</b>
              </td>
              <td className="v-r v-num">{b.sol !== null ? solTxt(b.sol) : '—'}</td>
              <td className="v-r v-num v-hide-s">{b.trades}</td>
              <td className="v-r v-num v-hide-s">{solTxt(b.volume)}</td>
              <td className="v-r">
                <a href={`/w/${b.w}`} onClick={linkClick}>
                  {T.view}
                </a>
              </td>
              {bot && (
                <td className="v-r v-hide-s">
                  <a className="v-tg" href={tgLink(bot, b.w)} target="_blank" rel="noopener noreferrer">
                    <IconTelegram size={14} /> {T.getAlerts}
                  </a>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Lookup() {
  const [q, setQ] = useState('');
  return (
    <form
      className="v-lookup"
      onSubmit={(e) => {
        e.preventDefault();
        const a = q.trim();
        if (!ADDR.test(a)) return toast(D.lookup.bad, 'warn');
        navigate(`/w/${a}`);
      }}
    >
      <label htmlFor="v-lookup">{D.lookup.label}</label>
      <div>
        <input id="v-lookup" value={q} onChange={(e) => setQ(e.target.value)} placeholder={D.lookup.hint} spellCheck={false} autoComplete="off" />
        <button type="submit" className="v-pill v-pill-ink">
          {D.lookup.go}
        </button>
      </div>
    </form>
  );
}

const SNIP = {
  claude: 'claude mcp add --transport http fmt https://mcp.fmt.plus',
  cursor: '{ "mcpServers": { "fmt": { "url": "https://mcp.fmt.plus" } } }',
};
export function McpSnippets() {
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="v-snips">
      {(Object.keys(SNIP) as (keyof typeof SNIP)[]).map((k) => (
        <div key={k} className="v-snip">
          <div className="v-snip-hd">
            <b>{D.mcp[k]}</b>
            <button
              type="button"
              className="v-link"
              onClick={() =>
                void copyText(SNIP[k]).then((ok) => {
                  if (!ok) return;
                  setDone(k);
                  window.setTimeout(() => setDone(null), 1500);
                })
              }
            >
              <IconCopy size={15} /> {done === k ? D.mcp.copied : D.mcp.copy}
            </button>
          </div>
          <pre>{SNIP[k]}</pre>
        </div>
      ))}
    </div>
  );
}

export function McpTools() {
  return (
    <dl className="v-tools">
      {D.mcp.list.map(([name, d]) => (
        <div key={name}>
          <dt className="v-mono">{name}</dt>
          <dd>{d}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="v-more" href={href} onClick={linkClick}>
      {children}
      <IconArrowRight size={16} />
    </a>
  );
}
