// Telegram bot: the agent's pushes in a chat. Token: env TG_BOT_TOKEN or data/telegram.json (`npm run tg -- <token>`).
//   /start [wallet]  subscribe (all top wallets, or one wallet from the site's deep link)
//   /watch <wallet>  add a wallet        /unwatch <wallet>  remove it
//   /bar <sol>       push only swaps of this size and up (default 10)
//   /list            what this chat watches        /w <wallet>  a wallet card now
//   /stop            unsubscribe
// GET /api/tg  → { on, username } for the site's Connect page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bus } from '../lib/bus.mjs';
import { WATCH } from './wallets.mjs';

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const nameOf = new Map(WATCH.map(([n, a]) => [a, n]));
const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function readToken(cfg) {
  if (cfg.env.TG_BOT_TOKEN) return cfg.env.TG_BOT_TOKEN.trim();
  // one bot token = one poller: a dev server runs the bot only when asked, so it never steals prod's updates
  if (!cfg.prod && cfg.env.TG_DEV !== '1') return '';
  try {
    return JSON.parse(readFileSync(join(cfg.dataDir, 'telegram.json'), 'utf8')).token || '';
  } catch {
    return '';
  }
}

export default async function telegram(ctx) {
  const { db, log, cfg } = ctx;
  db.migrate('telegram', [
    'CREATE TABLE tg_chats (chat INTEGER PRIMARY KEY, bar REAL NOT NULL DEFAULT 10, all_top INTEGER NOT NULL DEFAULT 1, t INTEGER NOT NULL)',
    'CREATE TABLE tg_watch (chat INTEGER NOT NULL, w TEXT NOT NULL, PRIMARY KEY (chat, w))',
  ]);
  const token = readToken(cfg);
  let me = null;
  let offset = 0;
  let stopped = false;
  let sent = 0;
  const site = cfg.origin || 'https://fmt.plus';

  ctx.route('GET', '/api/tg', () => ({ on: Boolean(me), username: me?.username ?? null }));
  ctx.health('telegram', () => ({ ok: !token || Boolean(me), on: Boolean(token), bot: me?.username ?? null, chats: db.all('SELECT COUNT(*) n FROM tg_chats')[0]?.n ?? 0, sent }));
  if (!token) {
    log('telegram.off', { hint: 'npm run tg -- <token>' });
    return;
  }

  const call = async (method, body, ms = 15000) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(ms),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`${method}: ${j.description}`);
    return j.result;
  };
  const say = (chat, text) =>
    call('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }).catch((e) => {
      if (/blocked|chat not found|deactivated/.test(e.message)) db.run('DELETE FROM tg_chats WHERE chat = ?', chat);
      log('telegram.send.fail', { e: e.message.slice(0, 80) });
    });

  const chatRow = (chat) => db.all('SELECT * FROM tg_chats WHERE chat = ?', chat)[0];
  const watched = (chat) => db.all('SELECT w FROM tg_watch WHERE chat = ?', chat).map((r) => r.w);
  const label = (w) => nameOf.get(w) ?? short(w);

  const HELP = [
    '<b>fmt+</b> · your trench agent',
    '',
    '/watch &lt;wallet&gt; · add a wallet',
    '/bar 10 · push swaps of 10 SOL and up',
    '/list · what you watch',
    '/w &lt;wallet&gt; · wallet card now',
    '/stop · pause pushes',
  ].join('\n');

  async function card(chat, w) {
    const v = await new Promise((res) => bus.emit('wallet?', w, res));
    if (!v) return say(chat, 'The chain is slow. Try again in a minute.');
    const swaps = v.swaps.slice(0, 5).map((s) => `${s.side === 'buy' ? '🟢' : '🔴'} ${s.side} ${s.sol} SOL $${esc(s.sym || s.mint.slice(0, 4))}`);
    return say(
      chat,
      [
        `<b>${esc(label(w))}</b> · <code>${short(w)}</code>`,
        `${v.sol} SOL · ${v.style.kind} · typical buy ${v.style.size} SOL`,
        `last swaps: in ${v.flow.in} · out ${v.flow.out} · net ${v.flow.net} SOL`,
        '',
        ...swaps,
        '',
        `<a href="${site}/w/${w}">open on fmt.plus</a>`,
      ].join('\n'),
    );
  }

  async function onMessage(m) {
    const chat = m.chat?.id;
    const text = String(m.text || '').trim();
    if (!chat || !text.startsWith('/')) return;
    const [cmd0, arg = ''] = text.split(/\s+/, 2);
    const cmd = cmd0.split('@')[0].toLowerCase();
    const now = Date.now();
    if (cmd === '/start') {
      db.run('INSERT INTO tg_chats (chat, t) VALUES (?, ?) ON CONFLICT(chat) DO NOTHING', chat, now);
      if (ADDR.test(arg)) {
        db.run('INSERT OR IGNORE INTO tg_watch (chat, w) VALUES (?, ?)', chat, arg);
        db.run('UPDATE tg_chats SET all_top = 0 WHERE chat = ?', chat);
        await say(chat, `Watching <b>${esc(label(arg))}</b>. Pushes start now.\n\n${HELP}`);
        return card(chat, arg);
      }
      return say(chat, `You are in. I push big swaps from ${WATCH.length} top wallets.\n\n${HELP}`);
    }
    if (!chatRow(chat)) db.run('INSERT INTO tg_chats (chat, t) VALUES (?, ?)', chat, now);
    if (cmd === '/watch' || cmd === '/unwatch' || cmd === '/w') {
      if (!ADDR.test(arg)) return say(chat, 'Send a Solana wallet address after the command.');
      if (cmd === '/w') return card(chat, arg);
      if (cmd === '/watch') {
        db.run('INSERT OR IGNORE INTO tg_watch (chat, w) VALUES (?, ?)', chat, arg);
        db.run('UPDATE tg_chats SET all_top = 0 WHERE chat = ?', chat);
        return say(chat, `Watching <b>${esc(label(arg))}</b>.`);
      }
      db.run('DELETE FROM tg_watch WHERE chat = ? AND w = ?', chat, arg);
      if (!watched(chat).length) db.run('UPDATE tg_chats SET all_top = 1 WHERE chat = ?', chat);
      return say(chat, `Removed <b>${esc(label(arg))}</b>.`);
    }
    if (cmd === '/bar') {
      const n = Number(arg);
      if (!(n >= 0.1 && n <= 10000)) return say(chat, 'Send a size in SOL, like /bar 10');
      db.run('UPDATE tg_chats SET bar = ? WHERE chat = ?', n, chat);
      return say(chat, `Pushes at ${n} SOL and up.`);
    }
    if (cmd === '/list') {
      const r = chatRow(chat);
      const list = r.all_top ? WATCH.map(([n]) => n) : watched(chat).map(label);
      return say(chat, `Bar: ${r.bar} SOL\nWatching: ${list.map(esc).join(', ')}`);
    }
    if (cmd === '/stop') {
      db.run('DELETE FROM tg_watch WHERE chat = ?', chat);
      db.run('DELETE FROM tg_chats WHERE chat = ?', chat);
      return say(chat, 'Paused. Send /start to come back.');
    }
    return say(chat, HELP);
  }

  bus.on('trade', (ev) => {
    const chats = db.all(
      `SELECT c.chat FROM tg_chats c
       WHERE c.bar <= ? AND ((c.all_top = 1 AND ? = 1) OR EXISTS (SELECT 1 FROM tg_watch w WHERE w.chat = c.chat AND w.w = ?))`,
      ev.sol,
      nameOf.has(ev.w) ? 1 : 0,
      ev.w,
    );
    const icon = ev.side === 'buy' ? '🟢' : '🔴';
    const msg = `${icon} <b>${esc(ev.name)}</b> ${ev.side === 'buy' ? 'bought' : 'sold'} <b>${ev.sol} SOL</b> of $${esc(ev.sym || ev.mint.slice(0, 4))}\n<a href="https://dexscreener.com/solana/${ev.mint}">chart</a> · <a href="${site}/w/${ev.w}">wallet</a> · <a href="https://solscan.io/tx/${ev.sig}">tx</a>`;
    for (const { chat } of chats) {
      sent++;
      void say(chat, msg);
    }
  });

  async function loop() {
    while (!stopped) {
      try {
        const ups = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 35000);
        for (const u of ups) {
          offset = u.update_id + 1;
          if (u.message) await onMessage(u.message).catch((e) => log('telegram.msg.fail', { e: String(e.message).slice(0, 80) }));
        }
      } catch (e) {
        if (stopped) break;
        log('telegram.poll.fail', { e: String(e.message || e).slice(0, 80) });
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  try {
    me = await call('getMe');
    await call('setMyCommands', {
      commands: [
        { command: 'watch', description: 'Add a wallet' },
        { command: 'bar', description: 'Min swap size in SOL' },
        { command: 'list', description: 'What you watch' },
        { command: 'w', description: 'Wallet card now' },
        { command: 'stop', description: 'Pause pushes' },
      ],
    }).catch(() => undefined);
    void loop();
    log('telegram.ready', { bot: me.username });
  } catch (e) {
    log('telegram.fail', { e: String(e.message || e).slice(0, 120) });
  }
  ctx.onStop(() => {
    stopped = true;
  });
}
