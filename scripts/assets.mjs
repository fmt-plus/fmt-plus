#!/usr/bin/env node
// npm run assets — the site's share image and icons. Images carry no text (owner rule): only colour and the mark.
//   .trench/media/ has a rendered kit (`trench media render`)  → copy it into public/: og-1200x630.png → og.png,
//       favicon.svg/.ico/-16/-32/-48, apple-touch-icon-180 → apple-touch-icon.png, icon-192/512, icon-maskable-512,
//       site.webmanifest (icon paths made absolute)
//   no kit → render: og.png (a soft gradient in the palette + the mark), the icon set from public/favicon.svg,
//       favicon.ico (PNG-embedded 16/32/48) and site.webmanifest
// Then writes src/assets.json { v } (a hash of the files): index.html links them as ?v=<v>, so browsers refetch.
// Uses the system Chrome (scripts/pw.mjs) only when it renders.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pub = join(root, 'public');
const kit = join(root, '.trench/media');
const brand = JSON.parse(readFileSync(join(root, 'src/brand.json'), 'utf8'));
const pal = brand.palette;

const KIT = [
  ['og-1200x630.png', 'og.png'],
  ['favicon.svg', 'favicon.svg'],
  ['favicon.ico', 'favicon.ico'],
  ['favicon-16.png', 'favicon-16.png'],
  ['favicon-32.png', 'favicon-32.png'],
  ['favicon-48.png', 'favicon-48.png'],
  ['apple-touch-icon-180.png', 'apple-touch-icon.png'],
  ['icon-192.png', 'icon-192.png'],
  ['icon-512.png', 'icon-512.png'],
  ['icon-maskable-512.png', 'icon-maskable-512.png'],
];
const OUTPUTS = [...KIT.map(([, to]) => to), 'site.webmanifest', 'mark.svg'];

function manifest(icons) {
  return (
    JSON.stringify(
      { name: brand.name, short_name: brand.name, description: brand.tagline, start_url: '/', display: 'standalone', background_color: pal.bg, theme_color: pal.bg, icons },
      null,
      2,
    ) + '\n'
  );
}
const ICONS = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

/** favicon.ico with PNG-embedded entries. */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(([size, buf], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map(([, b]) => b)]);
}

let mode;
if (existsSync(join(kit, 'og-1200x630.png'))) {
  mode = 'media kit';
  for (const [from, to] of KIT) {
    if (existsSync(join(kit, from))) {
      copyFileSync(join(kit, from), join(pub, to));
      console.log(`public/${to}  ← .trench/media/${from}`);
    }
  }
  let icons = ICONS;
  try {
    const m = JSON.parse(readFileSync(join(kit, 'site.webmanifest'), 'utf8'));
    if (Array.isArray(m.icons) && m.icons.length) {
      icons = m.icons
        .map((i) => ({ ...i, src: '/' + String(i.src).replace(/^\.?\//, '').replace(/^apple-touch-icon-180\.png$/, 'apple-touch-icon.png') }))
        .filter((i) => existsSync(join(pub, i.src.slice(1))));
    }
  } catch {
    // the kit's manifest is optional: ours lists the copied icons
  }
  writeFileSync(join(pub, 'site.webmanifest'), manifest(icons));
} else {
  mode = 'rendered (no .trench/media kit yet)';
  const { launch } = await import('./pw.mjs');
  const mark = readFileSync(join(pub, 'mark.svg'), 'utf8');
  const favicon = readFileSync(join(pub, 'favicon.svg'), 'utf8');
  const dark = brand.theme === 'dark';
  // a soft field of the two accents over the ground, each blended only with the bg (never with each other)
  const og = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:${pal.bg};position:relative}
.f{position:absolute;inset:0;background:
  radial-gradient(in oklab 760px 520px at 78% 18%, color-mix(in oklab, ${pal.accent} ${dark ? 46 : 34}%, ${pal.bg}), ${pal.bg} 72%),
  ${pal.bg}}
.g{position:absolute;inset:0;background:radial-gradient(in oklab 620px 420px at 12% 100%, color-mix(in oklab, ${pal.accent2} ${dark ? 26 : 22}%, transparent), transparent 70%)}
.s{position:absolute;inset:-20%;background:linear-gradient(115deg, transparent 38%, color-mix(in oklab, ${pal.surface} 55%, transparent) 50%, transparent 62%);opacity:${dark ? 0.55 : 0.8}}
.m{position:absolute;left:50%;top:50%;width:240px;height:240px;transform:translate(-50%,-50%);filter:drop-shadow(0 24px 48px ${dark ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.14)'})}
.m svg{width:100%;height:100%;display:block}
</style></head><body><div class="f"></div><div class="g"></div><div class="s"></div><div class="m">${mark}</div></body></html>`;
  const icon = (size, maskable = false) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0}body{width:${size}px;height:${size}px;overflow:hidden;background:${pal.bg};display:grid;place-items:center}
.i{width:${maskable ? 62 : 100}%;height:${maskable ? 62 : 100}%}.i svg{width:100%;height:100%;display:block}
</style></head><body><div class="i">${maskable ? mark : favicon}</div></body></html>`;
  const b = await launch();
  const shots = {};
  try {
    const shot = async (html, w, h, out) => {
      const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await p.setContent(html, { waitUntil: 'load' });
      await p.waitForTimeout(80);
      const buf = await p.screenshot({ omitBackground: false });
      await p.close();
      writeFileSync(join(pub, out), buf);
      shots[out] = buf;
      console.log('public/' + out);
    };
    await shot(og, 1200, 630, 'og.png');
    await shot(icon(180), 180, 180, 'apple-touch-icon.png');
    await shot(icon(192), 192, 192, 'icon-192.png');
    await shot(icon(512), 512, 512, 'icon-512.png');
    await shot(icon(512, true), 512, 512, 'icon-maskable-512.png');
    for (const s of [16, 32, 48]) await shot(icon(s), s, s, `favicon-${s}.png`);
  } finally {
    await b.close();
  }
  writeFileSync(join(pub, 'favicon.ico'), ico([16, 32, 48].map((s) => [s, shots[`favicon-${s}.png`]])));
  console.log('public/favicon.ico');
  writeFileSync(join(pub, 'site.webmanifest'), manifest(ICONS));
}
console.log('public/site.webmanifest');

const h = createHash('sha1');
for (const f of OUTPUTS) if (existsSync(join(pub, f))) h.update(readFileSync(join(pub, f)));
const v = h.digest('hex').slice(0, 8);
writeFileSync(join(root, 'src/assets.json'), JSON.stringify({ v, source: mode }, null, 2) + '\n');
console.log(`src/assets.json  v=${v} (${mode})`);
