// Telegram Mini App (/tg): tune the agent bound to this Telegram chat — feed, wallets, rules, alerts.
// Auth: Telegram's signed initData in the X-Tg-Init header (server/routes/telegram.mjs checks it with the bot token).
import { useEffect, useState } from 'react';
import { useNow, useStore } from '../lib/react.ts';
import { live } from '../state/live.ts';
import { t } from './copy.ts';
import './tg.css';

interface Agent {
  id: string;
  wallet: string;
  name: string;
  watch: string[];
  rules: { minSol: number; sides: 'all' | 'buys' | 'sells'; newTokensOnly?: boolean };
  cadence: 'each' | 'hourly' | 'daily';
}
type Tab = 'feed' | 'wallets' | 'rules' | 'alerts';
interface TgWebApp {
  initData: string;
  ready(): void;
  expand(): void;
  openLink(url: string): void;
  HapticFeedback?: { selectionChanged(): void };
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const ago = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function sdk(): Promise<TgWebApp | null> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = () => res(window.Telegram?.WebApp ?? null);
    s.onerror = () => res(null);
    document.head.appendChild(s);
  });
}

async function call<T>(init: string, method: 'GET' | 'PATCH', body?: unknown): Promise<T> {
  const r = await fetch('/api/tg/agent', {
    method,
    headers: { 'x-tg-init': init, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<T>;
}

export function MiniApp() {
  const [app, setApp] = useState<TgWebApp | null>(null);
  const [state, setState] = useState<'loading' | 'outside' | 'none' | 'ok'>('loading');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>('feed');
  const [note, setNote] = useState('');

  useEffect(() => {
    document.documentElement.classList.add('tg-root');
    void sdk().then(async (w) => {
      if (!w || !w.initData) return setState('outside');
      w.ready();
      w.expand();
      setApp(w);
      try {
        const r = await call<{ agent: Agent | null }>(w.initData, 'GET');
        setAgent(r.agent);
        setState(r.agent ? 'ok' : 'none');
      } catch {
        setState('outside');
      }
    });
  }, []);

  async function save(patch: Partial<Agent>) {
    if (!app) return;
    app.HapticFeedback?.selectionChanged();
    try {
      const r = await call<{ agent: Agent }>(app.initData, 'PATCH', patch);
      setAgent(r.agent);
      setNote(t.saved);
    } catch {
      setNote(t.failed);
    }
    window.setTimeout(() => setNote(''), 1600);
  }

  if (state !== 'ok' || !agent)
    return (
      <main className="tg tg-center">
        <h1>{t.title}</h1>
        <p>{state === 'loading' ? t.loading : state === 'none' ? t.noAgent : t.outside}</p>
        {state === 'none' && (
          <button type="button" className="tg-btn" onClick={() => app?.openLink('https://fmt.plus/')}>
            {t.openSite}
          </button>
        )}
      </main>
    );

  return (
    <main className="tg">
      <header className="tg-hd">
        <h1>{agent.name}</h1>
        <p>{short(agent.wallet)}</p>
      </header>
      <nav className="tg-tabs" aria-label={t.title}>
        {(Object.keys(t.tabs) as Tab[]).map((k) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {t.tabs[k]}
          </button>
        ))}
      </nav>
      {tab === 'feed' && <Feed agent={agent} />}
      {tab === 'wallets' && <Wallets agent={agent} save={save} />}
      {tab === 'rules' && <Rules agent={agent} save={save} />}
      {tab === 'alerts' && <Alerts agent={agent} save={save} />}
      {note && <div className="tg-note">{note}</div>}
    </main>
  );
}

function Feed({ agent }: { agent: Agent }) {
  const events = useStore(live, (s) => s.events);
  useNow(15000);
  const mine = events.filter(
    (e) =>
      agent.watch.includes(e.w) &&
      e.sol >= agent.rules.minSol &&
      (agent.rules.sides === 'all' || (agent.rules.sides === 'buys') === (e.side === 'buy')),
  );
  return (
    <section>
      <p className="tg-lead">{t.feed.lead}</p>
      {mine.length ? (
        <ul className="tg-list">
          {mine.slice(0, 40).map((e) => (
            <li key={e.sig}>
              <div>
                <b>{e.name}</b>
                <span className={e.side === 'buy' ? 'tg-up' : 'tg-down'}>
                  {e.side === 'buy' ? t.feed.bought : t.feed.sold} {e.sol} SOL
                </span>
              </div>
              <div className="tg-dim">
                ${e.sym || e.mint.slice(0, 4)} · {ago(e.t)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tg-empty">{t.feed.empty}</p>
      )}
    </section>
  );
}

function Wallets({ agent, save }: { agent: Agent; save: (p: Partial<Agent>) => void }) {
  const board = useStore(live, (s) => s.board);
  const [q, setQ] = useState('');
  const [bad, setBad] = useState(false);
  const name = (w: string) => board.find((b) => b.w === w)?.name ?? short(w);
  const add = (w: string) => save({ watch: [...agent.watch, w] });
  return (
    <section>
      <p className="tg-lead">{t.wallets.lead}</p>
      <ul className="tg-list">
        {agent.watch.map((w) => (
          <li key={w} className="tg-row">
            <div>
              <b>{w === agent.wallet ? t.wallets.you : name(w)}</b>
              <div className="tg-dim">{short(w)}</div>
            </div>
            {w !== agent.wallet && (
              <button type="button" className="tg-btn tg-btn-quiet" onClick={() => save({ watch: agent.watch.filter((x) => x !== w) })}>
                {t.wallets.remove}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="tg-add"
        onSubmit={(e) => {
          e.preventDefault();
          const a = q.trim();
          if (!ADDR.test(a)) return setBad(true);
          setBad(false);
          setQ('');
          add(a);
        }}
      >
        <label htmlFor="tg-add">{t.wallets.add}</label>
        <div>
          <input id="tg-add" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.wallets.placeholder} spellCheck={false} autoComplete="off" />
          <button type="submit" className="tg-btn">
            {t.wallets.addBtn}
          </button>
        </div>
        {bad && <p className="tg-down">{t.wallets.bad}</p>}
      </form>
      <h2>{t.wallets.top}</h2>
      <ul className="tg-list">
        {board
          .filter((b) => b.top && !agent.watch.includes(b.w))
          .map((b) => (
            <li key={b.w} className="tg-row">
              <div>
                <b>{b.name}</b>
                <div className="tg-dim">{b.sol !== null ? `${b.sol} SOL` : short(b.w)}</div>
              </div>
              <button type="button" className="tg-btn" onClick={() => add(b.w)}>
                {t.wallets.watch}
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="tg-seg">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Rules({ agent, save }: { agent: Agent; save: (p: Partial<Agent>) => void }) {
  const R = agent.rules;
  return (
    <section className="tg-form">
      <h2>{t.rules.min}</h2>
      <p className="tg-lead">{t.rules.minLead}</p>
      <Seg
        value={String(R.minSol)}
        options={['0.1', '1', '5', '10', '25'].map((v) => [v, `${v} SOL`])}
        onPick={(v) => save({ rules: { ...R, minSol: Number(v) } })}
      />
      <h2>{t.rules.sides}</h2>
      <Seg
        value={R.sides}
        options={[
          ['all', t.rules.all],
          ['buys', t.rules.buys],
          ['sells', t.rules.sells],
        ]}
        onPick={(v) => save({ rules: { ...R, sides: v } })}
      />
      <label className="tg-switch">
        <input type="checkbox" checked={!!R.newTokensOnly} onChange={(e) => save({ rules: { ...R, newTokensOnly: e.target.checked } })} />
        <span>
          <b>{t.rules.fresh}</b>
          <span className="tg-dim">{t.rules.freshLead}</span>
        </span>
      </label>
    </section>
  );
}

function Alerts({ agent, save }: { agent: Agent; save: (p: Partial<Agent>) => void }) {
  return (
    <section className="tg-form">
      <p className="tg-lead">{t.alerts.linked}</p>
      <h2>{t.alerts.cadence}</h2>
      <Seg
        value={agent.cadence}
        options={[
          ['each', t.alerts.each],
          ['hourly', t.alerts.hourly],
          ['daily', t.alerts.daily],
        ]}
        onPick={(v) => save({ cadence: v })}
      />
    </section>
  );
}
