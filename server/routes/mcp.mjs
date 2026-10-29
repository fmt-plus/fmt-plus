// Remote MCP (Streamable HTTP, stateless JSON): POST /api/mcp. Caddy serves it as https://mcp.fmt.plus.
//   claude mcp add --transport http fmt https://mcp.fmt.plus
// GET /api/mcp answers 405 (no server-initiated stream). Tools read this server's own API.
import { handle } from '../lib/mcp-core.mjs';
import { sendJson } from '../lib/http.mjs';

export default async function mcp(ctx) {
  const base = `http://127.0.0.1:${ctx.cfg.port}/api`;
  const get = async (p) => {
    const r = await fetch(base + p, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`fmt+ API ${r.status}`);
    return r.json();
  };
  const limit = ctx.rate(60, 30);
  let calls = 0;
  ctx.route('POST', '/api/mcp', async (_req, res, { body, ip }) => {
    limit(ip);
    const msg = await body();
    const list = Array.isArray(msg) ? msg : [msg];
    const out = (await Promise.all(list.map((m) => handle(m, get)))).filter(Boolean);
    calls += list.length;
    if (!out.length) {
      res.writeHead(202);
      res.end();
      return;
    }
    sendJson(res, 200, Array.isArray(msg) ? out : out[0]);
  });
  ctx.route('GET', '/api/mcp', (_req, res) => {
    sendJson(res, 405, { error: 'method' }, { allow: 'POST' });
  });
  ctx.health('mcp', () => ({ ok: true, calls }));
}
