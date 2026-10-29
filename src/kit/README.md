# kit — familiar mechanics

Generic parts a trench trader already knows how to read, ported from flipfee and driven by the brand tokens
(`src/styles/tokens.css`). Import from `src/kit/index.ts`; styles live in `src/styles/kit.css`; default labels in
`copy.kit` (every part also takes its labels as props). The parts hold no product logic and make no server calls:
pass data in, get callbacks out. Motion: 140 / 220 / 320 ms, transform and opacity, reduced motion respected;
phone layouts at ≤ 760 px.

| Part | Familiar from | Key props | Use it for |
|---|---|---|---|
| `DitherDefs` · `DitherImg` · `DitherCoin` · `.dither-fill` | flipfee | `src`, `label`, `size`, `dither` · `n`, `size`, `mode` | token pictures in two brand colours (SVG `<image>` + `#tk-dither`, letters on failure); a spinning dithered coin; 2 px checker fills |
| `DotField` | treg.to | `gap`, `radius`, `push` | a pointer lens behind a hero or header (still on touch and reduced motion) |
| `TypedHero` · `FlowMap` | treg.to | `title`, `lead`, `items[{key, label, image, href}]`, `cycleMs` · `source`, `core`, `dest` (`{caption, children, tone}`) | the first screen: a typed live name, then the product in three parts joined by pulsing wires |
| `SectionTitle` | flipfee | `text` with `*key words*`, `as` | one-line section titles; key words dither in with an underline |
| `Ladder` · `OrderForm` | Polymarket, Hyperliquid, Kalshi | `asks`, `bids` (`{price, size, mine}`), `unit`, `sizeUnit`, `onPick` · `tick`, `sizes`, `preset`, `onPlace(side, price, size)` | any order book: tap a level to fill the form |
| `MarketList` | Polymarket, Kalshi | `rows[{id, title, subtitle, image, stat, bestBid, bestAsk, book, href}]`, `onSearch` (debounced) | a searchable list of markets with a short book per row |
| `HotTable` | pump.fun, GMGN / Axiom | `rows[{id, ticker, name, image, href, isNew}]`, `columns[{label, cell, width}]`, `action`, `live` | a live token board with one action per row; new rows glow |
| `Leaderboard` | pump.fun, Hyperliquid | `rows[{id, name, score, image}]`, `me`, `meRow` | ranks; the viewer's row stays pinned at the bottom when out of sight |
| `Tape` | Hyperliquid, pump.fun trades | `events[{id, tone, cells}]`, `max`, `cols` | a live event feed that never grows; new events slide in and glow |
| `Timeline` | Kalshi, Polymarket | `segments[{from, to, label, mine}]`, `from`, `to`, `now`, `ticks` | windows on a time axis: past, now, next, yours |
| `ShareCard` | pump.fun / GMGN PnL cards | `big`, `label`, `eyebrow`, `tag`, `url`, `text` | a result card that saves as a 1200×630 PNG and posts to X |
| `StatStrip` · `Flap` | Hyperliquid, pump.fun | `stats[{key, value, unit, label, tone}]`, `lead`, `face` | big live numbers that roll (or dither in); null values drop out |
| `Bars` · `Line` | Hyperliquid, DexScreener | `bars[{label, value, solid, tip}]` · `points[{label, value, tip}]`, `note` | small charts with hover values and a screen-reader table |
| `viewTransition` · `nameShared` · `vtName` | flipfee | — | page changes: `navigate()` cross-fades; `data-vt` parts inside a clicked link travel to the next page |

Wired into the template: Home (`DotField`, `TypedHero`, `StatStrip`, `FlowMap` + `Tape` + `DitherCoin`, `SectionTitle`
over the feed), Docs (`Bars`, `Line` from `src/economics.ts`, tagged "Example data"), every page change (`vt.ts`).
