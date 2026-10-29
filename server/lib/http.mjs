// A small router over node:http. Routes: route('GET', '/api/coins/:mint', handler). A handler gets (req, res, ctx)
// with ctx.params, ctx.query (URLSearchParams), ctx.ip and ctx.body() (parsed JSON, 64 KB cap) and may return a value:
// an object is sent as JSON, undefined means the handler wrote the response itself. Throw httpError(status, code) for
// a clean error reply; anything else is a 500 with no details.
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { logError } from './log.mjs';

export class HttpError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const httpError = (status, code, message) => new HttpError(status, code, message);

export function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(text);
}

export function clientIp(req) {
  // behind Caddy on loopback: trust the forwarded address only from loopback
  const direct = req.socket?.remoteAddress || '';
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return /^(::1|127\.|::ffff:127\.)/.test(direct) && fwd ? fwd : direct;
}

async function readJson(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw httpError(413, 'tooLarge');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'badJson');
  }
}

/** Token bucket per key: limit(key) → true when allowed. */
export function rateLimiter({ perMin = 30, burst = perMin } = {}) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) {
      if (buckets.size > 50_000) buckets.clear();
      b = { tokens: burst, at: now };
      buckets.set(key, b);
    }
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 60_000) * perMin);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };
}

export function createRouter() {
  const routes = [];

  function route(method, path, handler) {
    const keys = [];
    const re = new RegExp(
      '^' +
        path.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/:(\w+)/g, (_, k) => {
          keys.push(k);
          return '/([^/]+)';
        }) +
        '/?$',
    );
    routes.push({ method: method.toUpperCase(), re, keys, handler, path });
  }

  /** Returns true when a route answered. */
  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://local');
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    let pathMatched = false;
    for (const r of routes) {
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      let bodyCache;
      const ctx = { params, query: url.searchParams, ip: clientIp(req), url, body: () => (bodyCache ??= readJson(req)) };
      try {
        const out = await r.handler(req, res, ctx);
        if (out !== undefined && !res.headersSent) sendJson(res, 200, out);
      } catch (e) {
        if (e instanceof HttpError) sendJson(res, e.status, { error: e.code });
        else {
          logError('http.fail', e, { path: r.path });
          sendJson(res, 500, { error: 'server' });
        }
      }
      return true;
    }
    if (pathMatched) {
      sendJson(res, 405, { error: 'method' });
      return true;
    }
    return false;
  }

  return { route, handle, routes };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serves a built single-page app (local `npm start`; in production Caddy does this). */
export function staticHandler(dir) {
  const root = resolve(dir);
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const url = new URL(req.url || '/', 'http://local');
    let p;
    try {
      p = normalize(join(root, decodeURIComponent(url.pathname)));
    } catch {
      return false;
    }
    if (p !== root && !p.startsWith(root + sep)) return false;
    let file = p;
    let st = null;
    try {
      st = statSync(file);
      if (st.isDirectory()) {
        file = join(file, 'index.html');
        st = statSync(file);
      }
    } catch {
      st = null;
    }
    if (!st) {
      if (extname(url.pathname)) return false; // a missing asset is a 404, not the app
      file = join(root, 'index.html');
      try {
        st = statSync(file);
      } catch {
        return false;
      }
    }
    const immutable = url.pathname.startsWith('/assets/');
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
    return true;
  };
}
