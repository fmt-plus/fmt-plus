// /tools: the MCP tool list, a playground on any watched wallet and install snippets.
// /connect: deploy the agent = open the Telegram bot (deep link carries the wallet) or add the MCP.
import { useEffect, useState } from 'react';
import { copy } from '../copy.ts';
import { copyText } from '../core/clipboard.ts';
import { api } from '../core/http.ts';
import { createStore } from '../core/store.ts';
import { useStore } from '../lib/react.ts';
import { linkClick } from '../lib/router.ts';
import { SectionTitle } from '../kit/index.ts';
import { COOKER, live, loadWallet, wallets } from '../state/live.ts';
import { toast } from '../state/ui.ts';
import { Dither, Footer, Lbl, Playground } from './parts.tsx';

const tg = createStore<{ on: boolean; username: string | null; read: boolean }>({ on: false, username: null, read: false });
function loadTg() {
  if (tg.get().read) return;
  tg.set({ read: true });
  void api<{ on: boolean; username: string | null }>('/tg')
    .then((r) => tg.set(r))
    .catch(() => undefined);
}

/** Opens the bot with this wallet pre-watched. Hidden until the bot is live. */
export function TgButton({ w, small }: { w?: string; small?: boolean }) {
  const t = useStore(tg, (s) => s);
  useEffect(loadTg, []);
  if (!t.on || !t.username) return null;
  return (
    <a className={`g-cta g-cta-tg${small ? ' g-cta-s' : ''}`} href={`https://t.me/${t.username}${w ? `?start=${w}` : ''}`} target="_blank" rel="noopener noreferrer">
      ✈ {w ? copy.wpage.watch : copy.connect.tg}
    </a>
  );
}

const SNIP = {
  claude: 'claude mcp add --transport http fmt https://mcp.fmt.plus',
  cursor: '{\n  "mcpServers": {\n    "fmt": { "url": "https://mcp.fmt.plus" }\n  }\n}',
  skill: 'npx fmt-plus skill > ~/.claude/skills/fmt/SKILL.md',
};

function Snip({ k }: { k: keyof typeof SNIP }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="g-snip">
      <div className="g-head">
        <Lbl>{copy.tools[k]}</Lbl>
        <button
          type="button"
          onClick={() =>
            void copyText(SNIP[k]).then((r) => {
              if (!r) return;
              setOk(true);
              toast(copy.tools.copied);
              window.setTimeout(() => setOk(false), 1500);
            })
          }
        >
          {ok ? copy.tools.copied : copy.tools.copy}
        </button>
      </div>
      <pre>{SNIP[k]}</pre>
    </div>
  );
}

export function Tools() {
  const board = useStore(live, (s) => s.board);
  const [w, setW] = useState(COOKER);
  const v = useStore(wallets, (s) => s[w]?.v);
  useEffect(() => loadWallet(w), [w]);
  const name = board.find((b) => b.w === w)?.name ?? 'Cooker';
  return (
    <main className="g">
      <div className="g-row g-r1 g-top">
        <div>
          <SectionTitle text={copy.tools.title} as="h1" className="g-h1" />
          <p className="g-dim">{copy.tools.lead}</p>
        </div>
      </div>
      <div className="g-row g-r2">
        <div>
          <Lbl>{copy.tools.on.replace('{name}', name)}</Lbl>
          <div className="g-tools g-pick">
            {board.map((b) => (
              <button key={b.w} type="button" className={b.w === w ? 'on' : ''} aria-pressed={b.w === w} onClick={() => setW(b.w)}>
                {b.name}
              </button>
            ))}
          </div>
          <Playground v={v} name={name} />
        </div>
        <div>
          <Lbl>{copy.tools.install}</Lbl>
          <Snip k="claude" />
          <Snip k="cursor" />
          <Snip k="skill" />
        </div>
      </div>
      <Footer />
      <Dither />
    </main>
  );
}

export function Connect() {
  const t = useStore(tg, (s) => s);
  useEffect(loadTg, []);
  const C = copy.connect;
  const steps = [
    [C.step1, '/watch <wallet>'],
    [C.step2, '/bar 10'],
    [C.step3, '/start'],
  ];
  return (
    <main className="g">
      <div className="g-row g-r2 g-top">
        <div>
          <SectionTitle text={C.title} as="h1" className="g-h1" />
          <p className="g-dim">{C.lead}</p>
          <div className="g-acts">
            {t.on ? <TgButton /> : <span className="g-cta g-cta-off">✈ {C.tg} · {C.soon}</span>}
            <a className="g-cta g-cta-b" href="/tools" onClick={linkClick}>
              {copy.home.npx}
            </a>
          </div>
          <p className="g-mono g-small">{C.keys}</p>
        </div>
        <div className="g-ph-flat g-chat">
          {steps.map(([a, b], i) => (
            <div key={a} className="g-step">
              <b>{i + 1}</b>
              <span>{a}</span>
              <code>{b}</code>
            </div>
          ))}
          <div className="g-push">
            <b>{t.username ? `@${t.username}` : 'fmt+'}</b>
            <span className="g-down">●</span> Cooker sold 79 SOL of $FLOAT
          </div>
        </div>
      </div>
      <Footer />
      <Dither />
    </main>
  );
}
