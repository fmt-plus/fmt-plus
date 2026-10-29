// The server core. Core routes:
//   GET  /api/health            { ok, release, uptime, modules, ...health checks }
//   GET  /api/snapshot          everything the first screen needs, in one read (index.html asks before the JS loads)
//   GET  /api/stream            SSE (event names = the types modules publish)
//   POST /api/auth/nonce        Sign-In With Solana: the message to sign
//   POST /api/auth/verify       signature → 24 h bearer session
//   POST /api/auth/logout
//   GET  /api/me                the signed-in wallet
//   GET  /api/token             the product token card (data/token.json + DexScreener)
// Then every server/routes/*.mjs is loaded (alphabetical). A route module exports `default async function (ctx)`:
//   ctx.route(method, path, handler)  add an endpoint
//   ctx.snapshot(key, fn)             add `key` to /api/snapshot (fn may be async; it gets 400 ms)
//   ctx.publish(type, data)           send an SSE event to every client (kept in the ring buffer)
//   ctx.health(key, fn)               add a check to /api/health; fn() → { ok: boolean, ... }
//   ctx.onStop(fn)                    cleanup on shutdown
//   ctx.db, ctx.auth, ctx.token, ctx.ai, ctx.moderate, ctx.market, ctx.cfg, ctx.log, ctx.rate(perMin), ctx.requireUser(req)
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVER_DIR } from './config.mjs';
import { createRouter, httpError, rateLimiter, sendJson } from './http.mjs';
import { createHub } from './sse.mjs';
import { openDb } from './db.mjs';
import { createAuth } from './auth.mjs';
import { createToken } from './token.mjs';
import { createAi } from './ai.mjs';
import * as moderate from './moderate.mjs';
import * as market from './market.mjs';
import { log, logError } from './log.mjs';

const withTimeout = (p, ms, fallback) =>
  Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((r) => setTimeout(() => r(fallback), ms).unref?.())]);

export async function createApp(cfg, { routesDir = join(SERVER_DIR, 'routes'), dbFile = 'app.db' } = {}) {
  const started = Date.now();
  const router = createRouter();
  const db = openDb(cfg.dataDir, dbFile);
  const hub = createHub();
  const auth = createAuth({ db, name: cfg.name, origin: cfg.origin, sessionHours: cfg.sessionHours });
  const token = createToken({ dataDir: cfg.dataDir });
  const ai = createAi({ env: cfg.env, dataDir: cfg.dataDir });
  const snapshots = new Map();
  const checks = new Map();
  const stops = [];
  const modules = {};

  const requireUser = (req) => {
    const s = auth.sessionOf(req);
    if (!s) throw httpError(401, 'signin');
    return s;
  };

  const ctx = {
    cfg,
    log,
    logError,
    db,
    hub,
    auth,
    token,
    ai,
    moderate,
    market,
    route: router.route,
    snapshot: (key, fn) => snapshots.set(key, fn),
    health: (key, fn) => checks.set(key, fn),
    publish: (type, data) => hub.publish(type, data),
    onStop: (fn) => stops.push(fn),
    rate: (perMin, burst) => rateLimiter({ perMin, burst }),
    requireUser,
  };

  // ── core routes ──────────────────────────────────────────
  router.route('GET', '/api/health', async () => {
    const out = { ok: true, release: cfg.release || null, uptime: Math.round((Date.now() - started) / 1000), db: db.ok(), sse: hub.status(), modules };
    if (!out.db) out.ok = false;
    for (const v of Object.values(modules)) if (v !== 'ok') out.ok = false;
    for (const [k, fn] of checks) {
      try {
        out[k] = await withTimeout(fn(), 1000, { ok: false, error: 'timeout' });
      } catch (e) {
        out[k] = { ok: false, error: String(e?.message ?? e).slice(0, 120) };
      }
      if (out[k]?.ok === false) out.ok = false;
    }
    out.ai = ai.status();
    return out;
  });

  router.route('GET', '/api/snapshot', async () => {
    const out = { at: Date.now(), lastId: hub.lastId, token: token.peek() };
    await Promise.all(
      [...snapshots].map(async ([k, fn]) => {
        try {
          out[k] = await withTimeout(fn(), 400, null);
        } catch (e) {
          logError('snapshot.fail', e, { key: k });
          out[k] = null;
        }
      }),
    );
    return out;
  });

  router.route('GET', '/api/stream', (req, res, c) => {
    const types = c.query.get('types') ? new Set(c.query.get('types').split(',').filter(Boolean)) : null;
    const lastId = String(req.headers['last-event-id'] || c.query.get('after') || '');
    if (!hub.open(req, res, { ip: c.ip, lastId, types })) sendJson(res, 429, { error: 'busy' });
    return undefined;
  });

  const nonceLimit = rateLimiter({ perMin: 20, burst: 10 });
  const verifyLimit = rateLimiter({ perMin: 30, burst: 10 });
  const siteOrigin = (req) => {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    return host ? `${proto}://${host}` : '';
  };

  router.route('POST', '/api/auth/nonce', async (req, res, c) => {
    if (!nonceLimit(c.ip)) throw httpError(429, 'slow');
    const { address } = await c.body();
    const ch = auth.challenge(String(address ?? ''), siteOrigin(req));
    if (!ch) throw httpError(400, 'address');
    return ch;
  });

  router.route('POST', '/api/auth/verify', async (req, res, c) => {
    if (!verifyLimit(c.ip)) throw httpError(429, 'slow');
    const b = await c.body();
    const out = auth.finish({ address: String(b.address ?? ''), nonce: b.nonce, signature: b.signature });
    if (out.error) throw httpError(401, out.error);
    log('auth.signin', { address: out.address.slice(0, 4) + '…' + out.address.slice(-4) });
    return out;
  });

  router.route('POST', '/api/auth/logout', (req) => ({ ok: auth.signOut(req) }));

  router.route('GET', '/api/me', (req) => {
    const s = requireUser(req);
    const u = db.get('SELECT first_seen FROM users WHERE address = ?', s.address);
    return { address: s.address, exp: s.exp, firstSeen: u?.first_seen ?? s.since };
  });

  router.route('GET', '/api/token', () => token.view());

  // ── route modules ────────────────────────────────────────
  let files = [];
  try {
    files = readdirSync(routesDir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  } catch {
    files = [];
  }
  for (const f of files) {
    const name = f.replace(/\.mjs$/, '');
    try {
      const m = await import(pathToFileURL(join(routesDir, f)).href);
      const setup = m.default ?? m.setup;
      if (typeof setup !== 'function') throw new Error('no default export');
      await setup(ctx);
      modules[name] = 'ok';
    } catch (e) {
      modules[name] = 'error';
      logError('module.fail', e, { module: name });
    }
  }

  async function stop() {
    for (const fn of stops.reverse()) {
      try {
        await fn();
      } catch {
        // keep stopping the rest
      }
    }
    hub.close();
    db.close();
  }

  return { ctx, router, hub, db, stop, modules };
}
