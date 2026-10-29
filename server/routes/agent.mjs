// The personal agent: one per signed-in wallet. The site spawns and tunes it; the bot, the Mini App and the MCP read
// the same row, so a change in one place shows everywhere.
//   GET   /api/agent   → { agent: Agent | null }
//   POST  /api/agent   → creates the agent for the signed-in wallet when missing → { agent }
//   PATCH /api/agent   body: partial { name, watch, rules, cadence } → { agent }
// Agent = { id, wallet, name, createdAt, watch: string[] (own wallet first), rules: { minSol, sides }, cadence,
//           tg: { linked, username? } }. bus: emits 'agent' (Agent) and 'agent:changed' (Agent, chat|null) on every
//           change; answers 'agent?' (wallet or id) → Agent | null, 'agent:chat' (chat) → Agent | null;
//           takes 'agent:link' (id, chat, username) from the bot after /start agent_<id>.
// Every watched wallet joins the tracked list (wallets.mjs polls it), which is what makes its trades arrive.
import { randomBytes } from 'node:crypto';
import { httpError } from '../lib/http.mjs';
import { bus } from '../lib/bus.mjs';
import { WATCH } from './wallets.mjs';

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_WATCH = 20;
const SIDES = new Set(['all', 'buys', 'sells']);
const CADENCE = new Set(['each', 'hourly', 'daily']);
export const DEFAULT_RULES = { minSol: 0.1, sides: 'all', newTokensOnly: false };

export default async function agent(ctx) {
  const { db, log } = ctx;
  db.migrate('agent', [
    `CREATE TABLE agents (id TEXT PRIMARY KEY, wallet TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created INTEGER NOT NULL,
       watch TEXT NOT NULL, rules TEXT NOT NULL, cadence TEXT NOT NULL, updated INTEGER NOT NULL, tg_chat INTEGER, tg_user TEXT)`,
  ]);
  // two early drafts of this table exist in dev databases: add whatever column a database still lacks
  const cols = new Set(db.all('PRAGMA table_info(agents)').map((c) => c.name));
  for (const [c, type] of [['updated', 'INTEGER NOT NULL DEFAULT 0'], ['tg_chat', 'INTEGER'], ['tg_user', 'TEXT']]) {
    if (!cols.has(c)) db.run(`ALTER TABLE agents ADD COLUMN ${c} ${type}`);
  }

  const tgLinked = (wallet) => {
    try {
      return Boolean(db.get('SELECT 1 AS ok FROM tg_watch WHERE w = ? LIMIT 1', wallet));
    } catch {
      return false; // the bot's tables exist once telegram.mjs has run
    }
  };
  const view = (r) =>
    r && {
      id: r.id,
      wallet: r.wallet,
      name: r.name,
      createdAt: r.created,
      watch: JSON.parse(r.watch),
      rules: { ...DEFAULT_RULES, ...JSON.parse(r.rules) },
      cadence: r.cadence,
      tg: r.tg_chat ? { linked: true, ...(r.tg_user ? { username: r.tg_user } : {}) } : { linked: tgLinked(r.wallet) },
    };
  const byWallet = (w) => view(db.get('SELECT * FROM agents WHERE wallet = ?', w));
  const byId = (id) => view(db.get('SELECT * FROM agents WHERE id = ?', id));
  const changed = (a) => {
    for (const w of a.watch) bus.emit('track', w);
    bus.emit('agent', a);
    bus.emit('agent:changed', a, db.get('SELECT tg_chat FROM agents WHERE id = ?', a.id)?.tg_chat ?? null);
    return a;
  };

  ctx.route('GET', '/api/agent', (req) => ({ agent: byWallet(ctx.requireUser(req).address) ?? null }));

  const limit = ctx.rate(20);
  ctx.route('POST', '/api/agent', (req, _res, { ip }) => {
    limit(ip);
    const { address } = ctx.requireUser(req);
    const have = byWallet(address);
    if (have) return { agent: have };
    const now = Date.now();
    const id = randomBytes(6).toString('hex');
    db.run(
      'INSERT INTO agents (id, wallet, name, created, watch, rules, cadence, updated) VALUES (?,?,?,?,?,?,?,?)',
      id,
      address,
      `Agent ${address.slice(0, 4)}`,
      now,
      JSON.stringify([address, ...WATCH.map(([, w]) => w)].slice(0, MAX_WATCH)),
      JSON.stringify(DEFAULT_RULES),
      'each',
      now,
    );
    log('agent.spawn', { w: address.slice(0, 6) });
    return { agent: changed(byWallet(address)) };
  });

  function applyPatch(address, b) {
    const a = byWallet(address);
    if (!a) return null;
    const next = { ...a };
    if (typeof b.name === 'string') next.name = b.name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 24) || a.name;
    if (Array.isArray(b.watch)) {
      const list = [address, ...b.watch.filter((w) => typeof w === 'string' && ADDR.test(w) && w !== address)];
      next.watch = [...new Set(list)].slice(0, MAX_WATCH);
    }
    if (b.rules && typeof b.rules === 'object') {
      const minSol = Number(b.rules.minSol);
      next.rules = {
        minSol: Number.isFinite(minSol) ? Math.min(1000, Math.max(0.1, Math.round(minSol * 10) / 10)) : a.rules.minSol,
        sides: SIDES.has(b.rules.sides) ? b.rules.sides : a.rules.sides,
        newTokensOnly: typeof b.rules.newTokensOnly === 'boolean' ? b.rules.newTokensOnly : a.rules.newTokensOnly,
      };
    }
    if (CADENCE.has(b.cadence)) next.cadence = b.cadence;
    db.run(
      'UPDATE agents SET name = ?, watch = ?, rules = ?, cadence = ?, updated = ? WHERE wallet = ?',
      next.name,
      JSON.stringify(next.watch),
      JSON.stringify(next.rules),
      next.cadence,
      Date.now(),
      address,
    );
    return changed(byWallet(address));
  }

  ctx.route('PATCH', '/api/agent', async (req, _res, { ip, body }) => {
    limit(ip);
    const { address } = ctx.requireUser(req);
    if (!byWallet(address)) throw httpError(404, 'spawn');
    return { agent: applyPatch(address, (await body()) || {}) };
  });

  bus.on('agent?', (key, cb) => cb(ADDR.test(String(key)) ? byWallet(key) : /^[0-9a-f]{12}$/.test(String(key)) ? byId(key) : null));
  // the Mini App edits the agent bound to its Telegram chat, with the same rules as PATCH /api/agent
  bus.on('agent:patch', (chat, b, cb) => {
    const r = db.get('SELECT wallet FROM agents WHERE tg_chat = ?', chat);
    if (!r) return cb(null);
    cb(applyPatch(r.wallet, b || {}));
  });
  bus.on('agent:chat', (chat, cb) => cb(view(db.get('SELECT * FROM agents WHERE tg_chat = ?', chat)) ?? null));
  // the bot binds one chat to one agent (a chat moving to a new agent leaves the old one)
  bus.on('agent:link', (id, chat, username) => {
    db.run('UPDATE agents SET tg_chat = NULL, tg_user = NULL WHERE tg_chat = ? AND id != ?', chat, id);
    db.run('UPDATE agents SET tg_chat = ?, tg_user = ?, updated = ? WHERE id = ?', chat, username || null, Date.now(), id);
    const a = byId(id);
    if (a) changed(a);
  });
  ctx.health('agent', () => ({ ok: true, agents: db.get('SELECT COUNT(*) AS n FROM agents')?.n ?? 0 }));
}
