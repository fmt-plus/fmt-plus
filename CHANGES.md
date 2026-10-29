# _shared changes (for templates built on it)

Newest first. Each entry says what changed in a shared contract and what a template must do.

## 2026-10-13 · brand, assets, diagrams, shots, copy, token, scaffold

- **brand.mjs / src/brand.json.** `brand.json.mark` resolves per CLAUDE.md "Path rules" (absolute → project root →
  folder of brand.json; default `brand/mark.svg`); a mark found outside the project is copied in at the same relative
  path. `public/mark.svg` is now **always** written, with the mark colours baked in (media-kit convention:
  `currentColor` main, `--mark-2` detail, `--mark-bg` knock-outs), so `<img src="/mark.svg">` and canvas draw it
  right; without a mark it is a plain geometric placeholder (never a letter: images stay text-free). `favicon.svg` is
  the mark on a bg plate. `markFile` keeps its meaning (the brand has its own mark). New fields in `src/brand.ts` /
  `src/brand.json`: `signature` (one of glide, pop, split-flap, odometer, card-deal, pulse-ring, ticker-tape, stamp;
  unknown values map to the nearest with a warning) and `markColor`. `motion` stays the coarse family
  (glide | pop | flip) for `html[data-motion]` CSS written before; set `html[data-signature]` for the new ones.
  Colours mix in OKLab; tints mix each colour with the neutral ground only (the two accents never mix).
  New CSS variable: `--mark-color`; `--tint-N-ink` per tint (`--tint-ink` kept as an alias).
- **assets.mjs.** Text-free. With `.trench/media/og-1200x630.png` (a `trench media render` kit) it copies the kit
  into `public/` (og.png, favicon.svg/.ico/-16/-32/-48, apple-touch-icon.png, icon-192/512, icon-maskable-512,
  site.webmanifest); else it renders a gradient + mark og.png and the icon set (+ a real favicon.ico). It writes
  `src/assets.json { v }`. The app's vite plugin now also fills `%TK_ICON_LINKS%` (links only for files that exist,
  with `?v=`) and `%TK_ASSET_V%`; copy `brandHtml()` from `templates/app/vite.config.ts` to use them (optional).
- **diagrams.mjs.** Output moved to `.trench/launch/images/<id>-1600x900.png` (was `.trench/media/diagrams/<id>.png`).
  It screenshots every `[data-diagram="<id>"]` on `/docs/print`; frames should be 1600×900, carry no title text and
  use labels ≥ 32 px.
- **shots.mjs.** Viewports run in parallel (≈ 30–60 s). A click waits for network idle and up to 3 s for a visible
  change; errors are charged to the click they follow (errors while idle are reported as such). 4xx replies from
  `/api/*` are listed as "expected API replies", not console errors. Long pages: full-length shot with
  `position: fixed` elements hidden, plus `<page>-<w>-top.png`. The live check now uses a `[data-live-list]` container
  holding `[data-live-key]` items (newest first) on any page that has one (was `.rows [data-mint]` on `/`): the list
  must fill and its first key change within 20 s; pages without one skip it.
- **copycheck.mjs.** A line break ends a sentence (X-style lines without periods are graded one by one).
- **server token card.** `lib/market.mjs` `tokenMarket(ca)`: DexScreener → GeckoTerminal → Jupiter; `/api/token`
  adds `source`. No price anywhere → `priceUsd: null` (hide the stats row; no placeholders).
- **moderate.mjs.** `badCoin()` also skips third-party coin names that target a group (coin names only).
- **scaffold.mjs.** `--draft <dir>` (copied into `.trench/` after templating; its brand.json is the default brand),
  `.trench/pipeline.md` (10 steps; Scaffold ticked), existing `.trench/{brief.md,names.md,brand.json,look/,pipeline.md}`
  are never overwritten, a folder holding only `.trench/` counts as empty, and the next steps print the full
  `trench registry add …` command.
