// fmt+ MCP core, shared by the remote endpoint (server/routes/mcp.mjs → https://mcp.fmt.plus) and the stdio
// package (mcp/index.mjs, which ships a copy as mcp/core.mjs). Read-only: no keys, no signing.
// `get(path)` reads the fmt+ API (/w/<addr>, /events, /board) and returns parsed JSON.
export const VERSION = '0.1.0';
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const wallet = { type: 'object', properties: { wallet: { type: 'string', description: 'Solana wallet address' } }, required: ['wallet'] };

export const TOOLS = [
  { name: 'whats_important', description: 'The biggest recent swaps of a wallet, ranked by SOL size.', inputSchema: wallet },
  { name: 'pnl', description: 'SOL in, SOL out and net over the wallet’s recent swaps.', inputSchema: wallet },
  { name: 'bags', description: 'Token holdings of a wallet with USD value, biggest first.', inputSchema: wallet },
  { name: 'style', description: 'Trading style: flipper or holder, typical buy size, swaps per hour.', inputSchema: wallet },
  { name: 'trades', description: 'The last swaps of a wallet: side, SOL, token, time, tx.', inputSchema: wallet },
  { name: 'live', description: 'Latest swaps across top Solana wallets fmt+ watches, with an importance score 0-100.', inputSchema: { type: 'object', properties: { min_sol: { type: 'number', description: 'Only swaps of this size and up' } } } },
  { name: 'top_wallets', description: 'Top wallets fmt+ watches: balance, swaps and SOL moved in 24h.', inputSchema: { type: 'object', properties: {} } },
];

const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `${m}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const tok = (s) => '$' + (s.sym || s.mint.slice(0, 4));

export async function run(name, a, get) {
  a = a || {};
  if (['whats_important', 'pnl', 'bags', 'style', 'trades'].includes(name)) {
    if (!ADDR.test(a.wallet || '')) throw new Error('wallet must be a Solana address');
    const v = await get(`/w/${a.wallet}`);
    const who = v.name || a.wallet.slice(0, 4) + '…' + a.wallet.slice(-4);
    const link = `\nhttps://fmt.plus/w/${a.wallet}`;
    switch (name) {
      case 'whats_important':
        return `${who}: ${v.sol} SOL\n` + v.swaps.slice().sort((x, y) => y.sol - x.sol).slice(0, 5).map((s) => `- ${s.side} ${s.sol} SOL ${tok(s)} · ${ago(s.t)} · ${s.mint}`).join('\n') + link;
      case 'pnl':
        return `${who} over last ${v.swaps.length} swaps: in ${v.flow.in} SOL, out ${v.flow.out} SOL, net ${v.flow.net} SOL. Holds ${v.sol} SOL + $${v.bagsUsd} in tokens.` + link;
      case 'bags':
        return (v.bags.length ? `${who} bags:\n` + v.bags.map((b) => `- $${b.sym} $${b.usd} · ${b.mint}`).join('\n') : `${who} holds ${v.sol} SOL and no priced tokens.`) + link;
      case 'style':
        return `${who} is a ${v.style.kind}: typical buy ${v.style.size} SOL, ${v.style.perHour} swaps/hour.` + link;
      case 'trades':
        return (v.swaps.slice(0, 15).map((s) => `- ${s.side} ${s.sol} SOL ${tok(s)} · ${ago(s.t)} · tx ${s.sig}`).join('\n') || 'No recent swaps.') + link;
    }
  }
  if (name === 'live') {
    const { events } = await get('/events');
    const min = Number(a.min_sol) || 0;
    return events.filter((e) => e.sol >= min).slice(0, 25).map((e) => `- [${e.score}] ${e.name} ${e.side} ${e.sol} SOL ${tok(e)} · ${ago(e.t)} · ${e.w}`).join('\n') || 'No swaps yet.';
  }
  if (name === 'top_wallets') {
    const { board } = await get('/board');
    return board.map((b) => `- ${b.name} ${b.w}: ${b.sol ?? '?'} SOL, ${b.trades} swaps / ${b.volume} SOL moved 24h`).join('\n');
  }
  throw new Error(`unknown tool ${name}`);
}

/** One JSON-RPC message → the reply, or null for a notification. */
export async function handle(msg, get) {
  const { id, method, params } = msg || {};
  if (id === undefined || id === null) return null;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  try {
    if (method === 'initialize')
      return ok({
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'fmt-plus', title: 'fmt+', version: VERSION },
        instructions: 'Read-only Solana trench intel. Start with whats_important(wallet) or live(min_sol).',
      });
    if (method === 'tools/list') return ok({ tools: TOOLS });
    if (method === 'ping') return ok({});
    if (method === 'tools/call') {
      try {
        return ok({ content: [{ type: 'text', text: await run(params?.name, params?.arguments, get) }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: String(e.message || e) }], isError: true });
      }
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found' } };
  } catch (e) {
    return { jsonrpc: '2.0', id, error: { code: -32603, message: String(e.message || e) } };
  }
}
