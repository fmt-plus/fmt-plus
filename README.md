[![fmt+ — Solana wallet data for AI agents](brand/readme-banner.png)](https://fmt.plus)

# fmt+

**fmt+ is an MCP with a personalized AI agent on top: it tracks smart money, indexes every trade and alerts you to what matters.**

fmt+ tracks wallet trades, token holdings and SOL flows on Solana. Spawn your agent on the site, pick the wallets and rules it follows, and get the matching trades in Telegram. Connect your AI through MCP for the same data. Everything is read-only: fmt+ uses public addresses and never signs transactions.

[Open the app](https://fmt.plus) · [Blog](https://fmt.plus/blog) · [Telegram](https://t.me/fmtplus_bot) · [X](https://x.com/fmtplus)

## What you can do

- Spawn a personal agent, choose the wallets it watches and the rules for its alerts.
- Check a wallet's biggest recent buys and sells, with transaction references.
- Read priced token holdings, recent SOL flows and trading patterns.
- Give an AI agent access to ten tools through one MCP connection.
- Follow wallets in Telegram and choose the minimum swap size for alerts.
- Run the app, API and bot on your own server.

## Your agent

1. **Spawn.** Your wallet signs one free message (it moves zero funds), and fmt+ creates your agent.
2. **Choose wallets.** Your own wallet, top traders from the list, or any address (up to 20).
3. **Set rules.** Smallest trade size in SOL, trade side (all, buys, sells), new tokens only, and timing: each trade, an hourly digest or a daily digest.
4. **Connect Telegram.** The site opens [@fmtplus_bot](https://t.me/fmtplus_bot) bound to your agent; press Start.

The site, the Telegram bot and its Mini App edit the same agent, so a change in one place shows everywhere. API: `GET/POST/PATCH /api/agent` with a Sign-In With Solana session ([`server/routes/agent.mjs`](server/routes/agent.mjs)).

## Connect your AI

### Remote MCP

Use the hosted endpoint at `https://mcp.fmt.plus`.

**Claude Code**

```bash
claude mcp add --transport http fmt https://mcp.fmt.plus
```

**Cursor and clients that support remote MCP**

```json
{
  "mcpServers": {
    "fmt": {
      "url": "https://mcp.fmt.plus"
    }
  }
}
```

Then ask your agent:

> Show the largest recent swaps for this Solana wallet: `<wallet address>`.

> Check this wallet's token holdings and typical trade size.

### Local MCP over stdio

```bash
claude mcp add fmt -- npx -y fmt-plus
```

For another stdio client, use `npx` as the command and `["-y", "fmt-plus"]` as the arguments.

The local MCP process uses the hosted fmt+ API by default. To point it at your own API, set `FMT_API` in the MCP process environment:

```bash
FMT_API=http://127.0.0.1:5531/api npx -y fmt-plus
```

See [MCP setup](mcp/README.md) and the [Agent Skill](mcp/SKILL.md).

## MCP tools

| Tool | What it returns |
| --- | --- |
| `whats_important(wallet)` | The wallet's largest recent swaps, ranked by SOL size |
| `trades(wallet)` | Recent swaps: buy or sell, SOL size, token, time and transaction signature |
| `bags(wallet)` | Priced token holdings, largest first |
| `pnl(wallet)` | SOL in, SOL out and net over the wallet's recent swaps |
| `style(wallet)` | Trading pattern: flipper or holder, typical buy size and swaps per hour |
| `live(min_sol)` | Recent swaps across watched wallets, with a size-based score and optional SOL threshold |
| `top_wallets()` | The wallets fmt+ watches, with balances and activity summaries |
| `wallet_stats(wallet)` | Win rate, buys, sells and tokens closed over the wallet's recent swaps |
| `coins_up()` | Coins up 50% or more in 1 hour that tracked wallets traded, with CA, market cap and the traders |
| `digest()` | The last hour across tracked wallets: trades, SOL moved, the biggest trade and coins up 50% |

`wallet` is a Solana wallet address. `min_sol` is optional.

**Reading `pnl()`:** this tool reports SOL flow over the sampled recent swaps. It is not a full cost-basis or lifetime-profit calculation. Current token holdings are reported separately.

## Telegram alerts

Open [@fmtplus_bot](https://t.me/fmtplus_bot), send `/start`, then choose the wallets and swap sizes you want to follow.

| Command | Action |
| --- | --- |
| `/start` | Subscribe to the default watched-wallet feed |
| `/watch <wallet>` | Add a wallet to your personal watch list |
| `/unwatch <wallet>` | Remove a wallet from your watch list |
| `/bar 10` | Receive alerts for swaps of 10 SOL or more |
| `/list` | Show your watched wallets and current threshold |
| `/w <wallet>` | Get a wallet summary |
| `/stop` | Pause alerts |

Adding a wallet switches the chat to its personal watch list. Removing the last wallet returns it to the default feed; use `/stop` to pause.

The default alert threshold is **10 SOL**. Alerts use swap size, separately from the feed's importance score. Each alert links to the token chart, wallet page and transaction.

## How the data works

```text
Solana transactions → Helius → fmt+ parser → wallet data
                                              ├─ Web app and live feed
                                              ├─ MCP tools → your AI agent
                                              └─ SOL-size filter → Telegram
```

- **Swap parsing.** The transaction must succeed and the tracked wallet must pay its fee. The parser checks token transfers and the wallet's SOL movement, including wrapped SOL. Entries without a qualifying token transfer or with less than 0.05 SOL of movement are dropped.
- **Feed score.** Swap size determines the score; sells receive a 10-point bonus. Scores are capped at 100.
- **Coverage.** The feed covers wallets tracked by fmt+. A wallet lookup requests data for the supplied address. Recent-swap summaries reflect the available sample.

The score is a transparent ranking rule:

```text
score = min(100, round(45 × log10(1 + swap_size_SOL) + sell_bonus))
sell_bonus = 10 for sells, 0 for buys
```

For the same 10 SOL size, a buy scores **47** and a sell scores **57**. The score describes size and side, not the likelihood of a profitable trade.

The [documentation](https://fmt.plus/docs) includes worked examples. The [wallet parser](server/routes/wallets.mjs), [MCP tool definitions](server/lib/mcp-core.mjs) and [Telegram filters](server/routes/telegram.mjs) show the implementation.

## Run locally

Requires **Node.js 22.13 or newer**, npm and a Helius API key.

```bash
git clone https://github.com/fmt-plus/fmt-plus.git
cd fmt-plus
npm ci
```

Set `HELIUS_KEY` in the server environment, or save the key as plain text in the gitignored `data/helius.key` file. Create the `data/` directory first if needed. This is a data-provider API key, not a wallet private key.

```bash
npm run dev
```

- Web app: `http://127.0.0.1:5530`
- API health: `http://127.0.0.1:5531/api/health`

### Optional: your own Telegram bot

Create a bot with BotFather and set `TG_BOT_TOKEN` in the server environment. The server starts the configured bot alongside the API.

Alternatively, the repository's `npm run tg -- <bot-token>` helper saves the bot configuration to the local data directory. When using that saved configuration in development, run:

```bash
TG_DEV=1 npm run dev
```

Use a separate bot for development if your production bot is already running: one token should have one polling process.

### Configuration

| Setting | Purpose |
| --- | --- |
| `HELIUS_KEY` | Helius API key; alternatively `data/helius.key` |
| `TG_BOT_TOKEN` | Optional Telegram bot token |
| `TG_DEV=1` | Enable the saved Telegram bot configuration in development |
| `DATA_DIR` | Local data directory; defaults to `data/` |
| `HOST` / `PORT` | API bind address and port; defaults to `127.0.0.1:5531` |
| `ORIGIN` | Public site URL, used in server links and sign-in messages |
| `FMT_API` | API URL used by the local MCP process; defaults to `https://fmt.plus/api` |

### Checks and build

```bash
npm run check   # Copy rules, example math, TypeScript and server tests
npm run build   # TypeScript check and production web build
npm start       # Serve the built app with the API
```

The repository also includes a Caddy/systemd deployment workflow. Copy [the release configuration example](deploy/release.conf.example) to `deploy/release.conf`, configure your host, SSH key, domain and ports, then review [the deployment script](deploy/release.sh) before running `npm run release`.

## Repository map

| Path | Contents |
| --- | --- |
| [`src/home/`](src/home/) | Home, wallet, feed, tools and connection screens |
| [`src/blog/`](src/blog/) | The blog: posts with diagrams |
| [`server/routes/agent.mjs`](server/routes/agent.mjs) | Personal agents: spawn, watch list, rules, timing |
| [`server/lib/chain.mjs`](server/lib/chain.mjs) | Solana reads: Helius first, the public RPC as a fallback |
| [`src/docs/`](src/docs/) | Product documentation and diagrams |
| [`src/economics.ts`](src/economics.ts) | Worked examples and their arithmetic |
| [`server/routes/wallets.mjs`](server/routes/wallets.mjs) | Helius reads, swap parsing, wallet views and live events |
| [`server/routes/telegram.mjs`](server/routes/telegram.mjs) | Telegram commands, watch lists and alerts |
| [`server/routes/mcp.mjs`](server/routes/mcp.mjs) | Remote MCP transport |
| [`server/lib/mcp-core.mjs`](server/lib/mcp-core.mjs) | Shared MCP tools and request handling |
| [`mcp/`](mcp/) | Local stdio MCP package and Agent Skill |
| [`deploy/`](deploy/) | Deployment scripts and configuration |

## License

[MIT](LICENSE).
