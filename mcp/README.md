# fmt+ MCP

Every trench tool for your AI agent. Read-only Solana wallet intel. Zero keys. MIT.

Remote, no install:

```bash
claude mcp add --transport http fmt https://mcp.fmt.plus
```

Local stdio:

```bash
claude mcp add fmt -- npx -y fmt-plus
```

Cursor / any MCP client:

```json
{ "mcpServers": { "fmt": { "url": "https://mcp.fmt.plus" } } }
```

Tools: `whats_important`, `trades`, `bags`, `pnl`, `style`, `live`, `top_wallets`, `wallet_stats`, `coins_up`, `digest`.
Self-host the API: set `FMT_API=http://127.0.0.1:5531/api`.
