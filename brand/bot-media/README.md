# Bot & Mini App media — backgrounds

Put the generated files in this folder: `~/fmt-plus/brand/bot-media/`.
The server draws all text and numbers on top, so every image has NO text, NO numbers, NO logos.

## Technical rules
- Format: PNG (8-bit RGB, no transparency) or WebP lossless. Max 2 MB per file.
- Color: sRGB.
- Size: exactly as in the table (1200×675 = 16:9, the Telegram photo-preview ratio).
- Data zone: keep it calm and even (low detail) — text and numbers go there.
- Keep 48 px from every edge free of important detail (some Telegram clients crop).
- File names exactly as in the table, lowercase. Variants: add `-2`, `-3` (e.g. `alert-buy-2.png`); the server picks one at random.

## Files

| File | Size | Data zone | Prompt |
|---|---|---|---|
| `welcome.png` | 1200×675 | left 55% | Background for the welcome screen of a Telegram bot that tracks crypto wallets. Style like all other media materials of the project. Calm empty area on the left 55% for text. No text, letters, numbers or logos. |
| `menu.png` | 1200×675 | center 70% | Background for the main menu of a Telegram bot. Style like all other media materials of the project. Calm empty area in the center. No text, letters, numbers or logos. |
| `login.png` | 1200×675 | left 55% | Background for the "connect your wallet" step of a Telegram bot. Style like all other media materials of the project. Calm empty area on the left 55%. No text, letters, numbers or logos. |
| `linked.png` | 1200×675 | left 55% | Background for a "wallet connected" message. Style like all other media materials of the project. Calm empty area on the left 55%. No text, letters, numbers or logos. |
| `agent.png` | 1200×675 | right 60% | Background for a "your agent is ready" card. Style like all other media materials of the project. Calm empty area on the right 60%. No text, letters, numbers or logos. |
| `alert-buy.png` | 1200×675 | center 80% | Background for a "wallet bought a token" alert card. Style like all other media materials of the project. Calm empty area in the center. No text, letters, numbers or logos. |
| `alert-sell.png` | 1200×675 | center 80% | Background for a "wallet sold a token" alert card. Style like all other media materials of the project. Calm empty area in the center. No text, letters, numbers or logos. |
| `wallet-card.png` | 1200×675 | center 80% | Background for a wallet stats card with numbers and a small chart. Style like all other media materials of the project. Calm empty area in the center. No text, letters, numbers or logos. |
| `digest.png` | 1200×675 | center 80% | Background for a daily summary card of trades. Style like all other media materials of the project. Calm empty area in the center. No text, letters, numbers or logos. |
| `win.png` | 1200×675 | center 70% | Background for a "closed a trade in profit" card people share on X. Style like all other media materials of the project. Calm empty area in the center. No text, letters, numbers or logos. |
| `empty.png` | 1200×675 | center 60% | Background for a "no trades yet" state. Style like all other media materials of the project. Calm empty area in the center. No text, letters, numbers or logos. |
| `miniapp-cover.png` | 640×360 | none | Cover image for a Telegram Mini App. Style like all other media materials of the project. No text, letters, numbers or logos. |
| `bot-avatar.png` | 640×640 (round crop) | none | Avatar for a Telegram bot. Style like all other media materials of the project. Centered mark, fully inside a circle. No text, letters or numbers. |

When the files are in place, say "фоны готовы": I check sizes and wire them into the bot cards and the Mini App.
