// The home page phone: a dark-theme Telegram chat with the fmt+ bot. Real messages slide in at the bottom,
// one every few seconds, with the same link row the bot sends (server/routes/telegram.mjs).
// Message types carry a word label and a color: buy green, sell pink, coin up lime, digest blue.
import { useEffect, useMemo, useState } from "react";
import { copy } from "../copy.ts";
import { copyText } from "../core/clipboard.ts";
import { fill } from "../core/format.ts";
import { useStore } from "../lib/react.ts";
import { live } from "../state/live.ts";
import type { Digest, Signal, Trade } from "../state/live.ts";
import {
  agoText,
  alertText,
  matching,
  solTxt,
  tok,
  useAgent,
} from "./shared.tsx";
import type { Agent } from "./shared.tsx";

const M = copy.d.msg;
export type MsgType = "buy" | "sell" | "up" | "digest";
export interface Msg {
  id: string;
  type: MsgType;
  label: string;
  text: string;
  sub?: string;
  big: string;
  token: string;
  t: number;
  example?: boolean;
  links?: { label: string; href: string }[];
  /** The coin's mint: the bot shows it as tap-to-copy text with [Copy CA] [Chart] buttons. */
  mint?: string;
}

const names = (s: Signal) =>
  s.wallets
    .slice(0, 3)
    .map((w) => w.name)
    .join(", ");
function upMsg(s: Signal, example = false): Msg {
  const token = tok(s.sym, s.mint);
  return {
    id: s.id,
    type: "up",
    label: example ? M.example : fill(M.up, { pct: s.change1h }),
    text: fill(M.upLine, { token, pct: s.change1h }),
    sub: s.wallets.length ? fill(M.upWho, { names: names(s) }) : undefined,
    big: `+${s.change1h}%`,
    token,
    t: s.t,
    example,
    mint: example ? undefined : s.mint,
  };
}
function tradeMsg(e: Trade): Msg {
  return {
    id: e.sig,
    type: e.side === "buy" ? "buy" : "sell",
    label: e.side === "buy" ? M.buy : M.sell,
    text: alertText(e),
    big: solTxt(e.sol),
    token: tok(e.sym, e.mint),
    t: e.t,
    mint: e.mint,
    links: [
      { label: M.wallet, href: `/w/${e.w}` },
      { label: M.tx, href: `https://solscan.io/tx/${e.sig}` },
    ],
  };
}
function digestMsg(d: Digest): Msg | null {
  if (!d.trades && !d.signals.length) return null;
  const top = d.topTrade;
  const parts = [
    top
      ? fill(M.digestTop, {
          name: top.name,
          side: top.side === "buy" ? copy.d.agent.bought : copy.d.agent.sold,
          sol: solTxt(top.sol),
          token: tok(top.sym, top.mint),
        })
      : "",
    d.signals.length
      ? fill(M.digestUp, {
          list: d.signals
            .map((x) => `${tok(x.sym, x.mint)} +${Math.round(x.change1h)}%`)
            .join(", "),
        })
      : "",
  ].filter(Boolean);
  return {
    id: `digest-${d.to}`,
    type: "digest",
    label: M.digest,
    text: fill(M.digestLine, { n: d.trades, sol: solTxt(d.sol) }),
    sub: parts.join(" "),
    big: String(d.trades),
    token: "",
    t: d.to,
    links: [{ label: M.top, href: "/trades" }],
  };
}

const EXAMPLE: Signal = {
  id: "example-up",
  mint: "example",
  sym: "PNUT",
  change1h: 64,
  priceUsd: null,
  mcapUsd: null,
  liqUsd: null,
  t: Date.now(),
  wallets: [
    { w: "", name: "Fox" },
    { w: "", name: "Cooker" },
  ],
};

/** The messages an agent (or the default rules) would get, newest first, with signals and the digest mixed in. */
export function useMsgs(withExample: boolean): Msg[] {
  const events = useStore(live, (s) => s.events);
  const signals = useStore(live, (s) => s.signals);
  const digest = useStore(live, (s) => s.digest);
  const { agent } = useAgent();
  return useMemo(
    () => build(events, signals, digest, agent, withExample),
    [events, signals, digest, agent, withExample],
  );
}
function build(
  events: Trade[],
  signals: Signal[],
  digest: Digest | null,
  agent: Agent | null,
  withExample: boolean,
): Msg[] {
  const trades = matching(events, agent).slice(0, 40).map(tradeMsg);
  const ups = signals.slice(0, 10).map((s) => upMsg(s));
  if (!ups.length && withExample)
    ups.push(upMsg({ ...EXAMPLE, t: (trades[1]?.t ?? Date.now()) + 1 }, true));
  const dg = digest ? digestMsg(digest) : null;
  const all = [...trades, ...ups, ...(dg ? [dg] : [])].sort(
    (a, b) => b.t - a.t,
  );
  // spread the types so the demo shows each color early
  const out: Msg[] = [];
  const pools = {
    up: all.filter((m) => m.type === "up"),
    digest: all.filter((m) => m.type === "digest"),
    rest: all.filter((m) => m.type === "buy" || m.type === "sell"),
  };
  while (pools.rest.length || pools.up.length || pools.digest.length) {
    if (pools.rest.length) out.push(pools.rest.shift()!);
    if (pools.up.length) out.push(pools.up.shift()!);
    if (pools.rest.length) out.push(pools.rest.shift()!);
    if (pools.digest.length) out.push(pools.digest.shift()!);
  }
  return out;
}

/** Advances a cursor through the list every `ms` (paused for reduced motion). */
function useTicker(n: number, ms: number): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!n || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const t = window.setInterval(() => setI((x) => x + 1), ms);
    return () => window.clearInterval(t);
  }, [n, ms]);
  return i;
}

export function Bubble({ m }: { m: Msg }) {
  return (
    <div className={`v-msg v-msg-${m.type}`}>
      <span className="v-msg-k">{m.label}</span>
      <p>{m.text}</p>
      {m.sub && <p className="v-msg-sub">{m.sub}</p>}
      <time>{m.example ? "" : agoText(m.t)}</time>
    </div>
  );
}

function TgMsg({ m }: { m: Msg }) {
  return (
    <div className="v-tgm-w">
      <div className={`v-tgm v-msg-${m.type}`}>
        <span className="v-msg-k">{m.label}</span>
        <p>{m.text}</p>
        {m.sub && <p className="v-msg-sub">{m.sub}</p>}
        {m.mint && <code className="v-tgm-ca">{m.mint}</code>}
        {m.links && (
          <p className="v-tgm-links">
            {m.links.map((l, k) => (
              <span key={l.label}>
                {k > 0 && " · "}
                <a
                  href={l.href}
                  target={l.href.startsWith("/") ? undefined : "_blank"}
                  rel="noreferrer"
                >
                  {l.label}
                </a>
              </span>
            ))}
          </p>
        )}
        <time>
          {new Date(m.t).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      {m.mint && (
        <div className="v-tgm-kb">
          <button type="button" onClick={() => void copyText(m.mint!)}>
            {M.copyCa}
          </button>
          <a
            href={`https://dexscreener.com/solana/${m.mint}`}
            target="_blank"
            rel="noreferrer"
          >
            {M.chart}
          </a>
        </div>
      )}
    </div>
  );
}

// The bot's commands (server/routes/telegram.mjs), typed and erased one after another in the input field.
const CMDS = [
  "/watch Fox",
  "/bar 5",
  "/digest",
  "/w 8deJ…hU6",
  "/list",
  "/menu",
];
function Typer() {
  const [s, setS] = useState({ i: 0, n: 0, back: false });
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const full = CMDS[s.i].length;
    const wait =
      !s.back && s.n === full
        ? 1300
        : s.back && s.n === 0
          ? 450
          : s.back
            ? 35
            : 90;
    const t = window.setTimeout(() => {
      setS((x) => {
        const len = CMDS[x.i].length;
        if (!x.back)
          return x.n < len ? { ...x, n: x.n + 1 } : { ...x, back: true };
        return x.n > 0
          ? { ...x, n: x.n - 1 }
          : { i: (x.i + 1) % CMDS.length, n: 0, back: false };
      });
    }, wait);
    return () => window.clearTimeout(t);
  }, [s]);
  const text = CMDS[s.i].slice(0, s.n);
  return text ? (
    <span className="v-typer">{text}</span>
  ) : (
    <span className="v-typer v-typer-ph">{M.input}</span>
  );
}

export function PhoneLive() {
  const msgs = useMsgs(false);
  const tick = useTicker(msgs.length, 2600);
  const SHOW = 4;
  // a sliding window over the messages: the newest one enters at the bottom
  const start = msgs.length ? tick % msgs.length : 0;
  const view = msgs.length
    ? Array.from(
        { length: Math.min(SHOW, msgs.length) },
        (_, k) => msgs[(start + k) % msgs.length],
      ).reverse()
    : [];
  return (
    <div className="v-tgchat">
      <div className="v-tgchat-hd">
        <span className="v-tgchat-back" aria-hidden>
          ‹
        </span>
        <img src="/symbol.svg" alt="" />
        <div>
          <b>{M.bot}</b>
          <span>{M.botSub}</span>
        </div>
      </div>
      <div className="v-tgchat-b">
        {view.map((m, k) => (
          <div
            key={`${m.id}-${start}-${k}`}
            className={k === view.length - 1 ? "v-in" : undefined}
          >
            <TgMsg m={m} />
          </div>
        ))}
      </div>
      <div className="v-tgchat-ft" aria-hidden>
        <span className="v-tgchat-in">
          <Typer />
        </span>
        <span className="v-tgchat-send" />
      </div>
    </div>
  );
}

/** The home page phone. */
export function PhoneDemo() {
  return (
    <figure className="v-phone v-phone-m">
      <div className="v-phone-screen v-phone-show v-phone-dark">
        <PhoneLive />
      </div>
      <figcaption>{copy.d.phones.alert}</figcaption>
    </figure>
  );
}
