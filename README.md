# fmt+

**Every trench tool. One agent. Yours.** — [fmt.plus](https://fmt.plus)

fmt+ reads Solana wallets the way a trader does: what a wallet just bought or sold, how big, its bags, its style.
One MCP gives that to any AI agent. A Telegram bot pushes only the big moves. Read-only — fmt+ never asks for keys.

## Use it

**Remote MCP (no install)**

```bash
claude mcp add --transport http fmt https://mcp.fmt.plus
```

Cursor / any MCP client:

```json
{ "mcpServers": { "fmt": { "url": "https://mcp.fmt.plus" } } }
```

**Local MCP (stdio)** — [`mcp/`](mcp): `npx fmt-plus`

| Tool | Returns |
|---|---|
| `whats_important(wallet)` | biggest recent swaps, ranked |
| `trades(wallet)` | last swaps: side, SOL, token, tx |
| `bags(wallet)` | holdings with USD value |
| `pnl(wallet)` | SOL in / out / net over recent swaps |
| `style(wallet)` | flipper or holder, typical size, pace |
| `live(min_sol)` | swaps across top wallets with a 0–100 score |
| `top_wallets()` | the wallets fmt+ watches |

**Telegram** — `/start`, `/watch <wallet>`, `/bar 10`, `/list`, `/w <wallet>`, `/stop`.

## Run your own

```bash
npm install
echo "<helius api key>" > data/helius.key     # or HELIUS_KEY=...
npm run tg -- <bot token>                      # optional: Telegram pushes (local: TG_DEV=1)
npm run dev                                    # app http://127.0.0.1:5530 · API :5531
```

```bash
npm run check          # copy, numbers, types, server tests
npm run build
cp deploy/release.conf.example deploy/release.conf && npm run release   # Caddy + systemd on your box
```

| Path | What |
|---|---|
| `server/routes/wallets.mjs` | watched wallets → swaps (Helius), wallet view, SSE `trade` |
| `server/routes/telegram.mjs` | the bot (long polling, per-chat watch list and bar) |
| `server/routes/mcp.mjs` + `server/lib/mcp-core.mjs` | remote MCP, Streamable HTTP |
| `mcp/` | the stdio MCP package and the Agent Skill |
| `src/home/` | Home, Wallet, Live, Wallets, Tools, Connect pages |
| `src/copy.ts` | every UI string |

A swap counts only when the wallet paid the fee: spam and dust transfers that merely mention a wallet are dropped.

## License

MIT
