// Bot cards: a background from server/assets/bot (made from brand/bot-media) + live text drawn on top → PNG.
// Every card is 1200×675. Text stays inside each background's data zone (see brand/bot-media/README.md).
// Type (brand media kit): Inter Tight 700–800 for words, JetBrains Mono for numbers; few words, large sizes.
// Loaded lazily: without @napi-rs/canvas the bot falls back to plain text messages.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SERVER_DIR } from './config.mjs';

const ASSETS = join(SERVER_DIR, 'assets');
const C = { ink: '#0e3b36', mute: '#4d6662', up: '#0a7a33', down: '#b0105f', blue: '#0000ff', rule: 'rgba(14,59,54,0.18)' };
// one color per message type: buy green, sell pink, coin up lime, digest blue (each with its tint)
const TYPE = {
  buy: { main: '#0a7a33', tint: '#e3f6e9', ink: '#0a7a33' },
  sell: { main: '#b0105f', tint: '#fde7f1', ink: '#b0105f' },
  up: { main: '#b7f540', tint: '#b7f540', ink: '#0e3b36' },
  digest: { main: '#0000ff', tint: '#e6e8ff', ink: '#0000ff' },
};
/** A rounded tint panel with a solid stripe on top: the color that names the message type. */
function panel(g, x, y, w, h, type) {
  const k = TYPE[type];
  g.fillStyle = k.tint;
  g.beginPath();
  g.roundRect(x, y, w, h, 28);
  g.fill();
  g.fillStyle = k.main;
  g.beginPath();
  g.roundRect(x, y, w, 12, [28, 28, 0, 0]);
  g.fill();
}
const SERIF = 'Instrument Serif';
const SANS = 'Inter Tight';
const MONO = 'JetBrains Mono';

let mod = null;
let ready = null;
const bgs = new Map();
async function load() {
  ready ??= (async () => {
    mod = await import('@napi-rs/canvas');
    // static weights: the canvas engine ignores variable-font axes, so each weight is its own file
    for (const f of readdirSync(join(ASSETS, 'fonts')).filter((x) => x.endsWith('.woff2'))) {
      const n = f.startsWith('InterTight') ? SANS : f.startsWith('JetBrainsMono') ? MONO : SERIF;
      mod.GlobalFonts.registerFromPath(join(ASSETS, 'fonts', f), n);
    }
    for (const f of readdirSync(join(ASSETS, 'bot')).filter((x) => x.endsWith('.png'))) {
      const name = f.replace(/(-\d+)?\.png$/, '');
      const list = bgs.get(name) ?? [];
      list.push(await mod.loadImage(join(ASSETS, 'bot', f)));
      bgs.set(name, list);
    }
    return true;
  })().catch(() => false);
  return ready;
}
export const cardsOn = () => load();

function frame(bg) {
  const c = mod.createCanvas(1200, 675);
  const g = c.getContext('2d');
  const list = bgs.get(bg) ?? [];
  if (list.length) g.drawImage(list[Math.floor(Math.random() * list.length)], 0, 0, 1200, 675);
  else {
    g.fillStyle = '#eef2f0';
    g.fillRect(0, 0, 1200, 675);
  }
  g.textBaseline = 'alphabetic';
  return { c, g };
}
function text(g, s, x, y, { size = 32, font = SANS, weight = 400, color = C.ink, align = 'left' } = {}) {
  g.font = `${weight} ${size}px "${font}"`;
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(s, x, y);
}
/** Wrapped lines inside `w`; returns the y after the last line. */
function para(g, s, x, y, w, o = {}) {
  const size = o.size ?? 32;
  g.font = `${o.weight ?? 400} ${size}px "${o.font ?? SANS}"`;
  const lines = [];
  let line = '';
  for (const word of s.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > w && line) {
      lines.push(line);
      line = word;
    } else line = t;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => text(g, l, x, y + i * size * (o.lh ?? 1.1), o));
  return y + lines.length * size * (o.lh ?? 1.1);
}
const png = (c) => c.encode('png');

// price line for a coin: GeckoTerminal top pool, 5-minute candles, last 4 hours (48 closes); cached 3 min, and
// at most ~25 calls a minute (its free limit is 30), else the card goes without a chart
const charts = new Map();
let calls = [];
async function priceLine(mint) {
  const hit = charts.get(mint);
  if (hit && Date.now() - hit.at < 180_000) return hit.pts;
  calls = calls.filter((t) => Date.now() - t < 60_000);
  if (calls.length > 24) return hit?.pts ?? null;
  try {
    calls.push(Date.now(), Date.now());
    const get = (u) => fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.json() : null));
    const pools = await get(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`);
    const pool = pools?.data?.[0]?.attributes?.address;
    if (!pool) throw new Error('no pool');
    const o = await get(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute?aggregate=5&limit=48`);
    const pts = (o?.data?.attributes?.ohlcv_list || []).map((c) => c[4]).reverse();
    charts.set(mint, { pts: pts.length > 3 ? pts : null, at: Date.now() });
    if (charts.size > 500) charts.delete(charts.keys().next().value);
    return charts.get(mint).pts;
  } catch {
    charts.set(mint, { pts: null, at: Date.now() });
    return null;
  }
}
/** The price line with a soft fill, inside x..x+w, y..y+h; color by the move over the window. */
function drawLine(g, pts, x, y, w, h, color) {
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const span = hi - lo || hi || 1;
  const at = (i) => [x + (i / (pts.length - 1)) * w, y + h - ((pts[i] - lo) / span) * h];
  g.beginPath();
  pts.forEach((_, i) => (i ? g.lineTo(...at(i)) : g.moveTo(...at(i))));
  g.lineTo(x + w, y + h);
  g.lineTo(x, y + h);
  g.closePath();
  g.fillStyle = color + '22';
  g.fill();
  g.beginPath();
  pts.forEach((_, i) => (i ? g.lineTo(...at(i)) : g.moveTo(...at(i))));
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.stroke();
  const [ex, ey] = at(pts.length - 1);
  g.beginPath();
  g.arc(ex, ey, 9, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}
const sol = (x) => `${Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 100) / 100} SOL`;
const ago = (t) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const short = (w) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export async function welcomeCard() {
  if (!(await load())) return null;
  const { c, g } = frame('welcome');
  para(g, 'Solana trades in your Telegram.', 80, 250, 580, { size: 84, weight: 800, lh: 1.02 });
  return png(c);
}

export async function menuCard({ wallets = 0, bar = 10 } = {}) {
  if (!(await load())) return null;
  const { c, g } = frame('menu');
  text(g, 'Your agent', 600, 270, { size: 88, weight: 800, align: 'center' });
  text(g, `${wallets} wallets · ${bar} SOL+`, 600, 370, { size: 52, font: MONO, align: 'center' });
  return png(c);
}

export async function linkedCard(w) {
  if (!(await load())) return null;
  const { c, g } = frame('linked');
  text(g, 'Wallet linked', 80, 300, { size: 88, weight: 800 });
  text(g, short(w), 80, 400, { size: 52, font: MONO });
  return png(c);
}

export async function alertCard({ name, side, sol: amount, sym, mint }) {
  if (!(await load())) return null;
  const buy = side === 'buy';
  const pts = await priceLine(mint);
  const { c, g } = frame(buy ? 'alert-buy' : 'alert-sell');
  panel(g, 170, 110, 860, 450, buy ? 'buy' : 'sell');
  const k = TYPE[buy ? 'buy' : 'sell'];
  if (pts) {
    text(g, name, 220, 195, { size: 48, weight: 700 });
    text(g, `$${sym || mint.slice(0, 4)}`, 980, 195, { size: 48, weight: 800, align: 'right' });
    text(g, `${buy ? '+' : '−'}${sol(amount)}`, 600, 310, { size: 100, font: MONO, weight: 700, color: k.ink, align: 'center' });
    drawLine(g, pts, 220, 360, 760, 150, pts[pts.length - 1] >= pts[0] ? C.up : C.down);
  } else {
    text(g, name, 600, 225, { size: 52, weight: 700, align: 'center' });
    text(g, `${buy ? '+' : '−'}${sol(amount)}`, 600, 365, { size: 120, font: MONO, weight: 700, color: k.ink, align: 'center' });
    text(g, `$${sym || mint.slice(0, 4)}`, 600, 460, { size: 60, weight: 800, align: 'center' });
  }
  return png(c);
}

export async function walletCard(v, label) {
  if (!(await load())) return null;
  const { c, g } = frame(v.count ? 'wallet-card' : 'empty');
  text(g, label, 160, 165, { size: 72, weight: 800 });
  const cells = [
    ['Balance', sol(v.sol), C.ink],
    ['Net', `${v.flow.net > 0 ? '+' : ''}${sol(v.flow.net)}`, v.flow.net > 0 ? C.up : v.flow.net < 0 ? C.down : C.ink],
    ['Win rate', v.winRate === null ? '—' : `${v.winRate}%`, C.ink],
  ];
  cells.forEach(([k, val, color], i) => {
    const x = 160 + i * 320;
    text(g, k, x, 250, { size: 32, weight: 600, color: C.mute });
    text(g, val, x, 312, { size: 44, font: MONO, weight: 700, color });
  });
  const list = v.swaps.slice(0, 24).reverse();
  if (list.length) {
    const max = Math.max(...list.map((s) => s.sol));
    const bw = 880 / 24;
    list.forEach((s, i) => {
      const h = 18 + (s.sol / max) * 160;
      g.fillStyle = s.side === 'buy' ? C.up : C.down;
      g.fillRect(160 + i * bw, 560 - h, bw - 6, h);
    });
  } else text(g, 'Zero trades', 160, 450, { size: 52, weight: 700 });
  return png(c);
}

export async function digestCard(rows, title = 'Last 24 hours', signals = []) {
  if (!(await load())) return null;
  const { c, g } = frame('digest');
  panel(g, 130, 90, 940, 500, 'digest');
  text(g, title, 170, 180, { size: 60, weight: 800, color: TYPE.digest.ink });
  const ups = signals.slice(0, 2);
  const n = Math.min(rows.length, 4 - ups.length);
  rows.slice(0, n).forEach((r, i) => {
    const y = 270 + i * 82;
    const buy = r.side === 'buy';
    text(g, r.name, 170, y, { size: 38, weight: 700 });
    text(g, `$${r.sym || r.mint.slice(0, 4)}`, 520, y, { size: 38, weight: 700 });
    text(g, `${buy ? '+' : '−'}${sol(r.sol)}`, 1030, y, { size: 38, font: MONO, weight: 700, color: buy ? C.up : C.down, align: 'right' });
  });
  ups.forEach((sg, i) => {
    const y = 270 + (n + i) * 82;
    g.fillStyle = TYPE.up.main;
    g.beginPath();
    g.roundRect(160, y - 50, 880, 68, 16);
    g.fill();
    text(g, `$${sg.sym || sg.mint.slice(0, 4)}`, 185, y, { size: 38, weight: 800, color: TYPE.up.ink });
    text(g, `+${Math.round(sg.change1h)}% / 1h`, 1015, y, { size: 38, font: MONO, weight: 700, color: TYPE.up.ink, align: 'right' });
  });
  return png(c);
}

export async function winCard({ sym, buy, sell }) {
  if (!(await load())) return null;
  const { c, g } = frame('win');
  text(g, `$${sym}`, 600, 230, { size: 64, weight: 800, align: 'center' });
  text(g, `×${(sell / buy).toFixed(2)}`, 600, 400, { size: 170, font: MONO, weight: 700, color: C.up, align: 'center' });
  return png(c);
}

export async function signalCard(sig) {
  if (!(await load())) return null;
  const pts = await priceLine(sig.mint);
  const { c, g } = frame('win');
  panel(g, 170, 110, 860, 450, 'up');
  const names = sig.wallets.map((x) => x.name);
  const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  const ink = TYPE.up.ink;
  text(g, `$${sig.sym || sig.mint.slice(0, 4)}`, 220, 205, { size: 64, weight: 800, color: ink });
  text(g, `+${Math.round(sig.change1h)}% / 1h`, 980, 205, { size: 56, font: MONO, weight: 700, color: ink, align: 'right' });
  if (pts) {
    drawLine(g, pts, 220, 250, 760, 210, ink);
    text(g, who, 220, 520, { size: 36, weight: 700, color: ink });
  } else text(g, who, 600, 380, { size: 48, weight: 700, color: ink, align: 'center' });
  return png(c);
}
