#!/usr/bin/env node
// Brand → code. Every visual decision of the product comes from .trench/brand.json through this file:
//   src/styles/tokens.css   colors (OKLab-derived surfaces, tints, shadows), fonts, radii, motion tokens
//   src/brand.ts            name, ticker, domain, X, tagline, theme, motion family + signature, mark (typed)
//   src/brand.json          the same data for scripts and vite.config.ts (index.html)
//   src/fonts.ts            self-hosted @fontsource(-variable) imports (Google Fonts <link> only as a fallback)
//   public/mark.svg         the brand mark with its colours baked in (works as <img> and in canvas)
//   public/favicon.svg      the mark on a bg plate
// Mark path (CLAUDE.md "Path rules"): brand.json.mark is relative to the project root (the folder with .trench/);
// absolute → as is; else project root; else the folder of brand.json. Default: brand/mark.svg. No mark: a plain
// geometric placeholder (never a letter: images stay text-free) and a warning.
// `npm run brand` re-runs it after a brand.json edit (then `npm install` for new fonts and `npm run assets`).
// `trench init` (templates/scaffold.mjs) uses the same functions.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── colors (sRGB hex, WCAG contrast, OKLab mixing) ────────
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function hex(c) {
  const m = HEX.exec(String(c ?? '').trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return '#' + h;
}
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
function toLab(h) {
  const [r, g, b] = rgb(h).map((v) => s2l(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return toHex(lin.map((v) => l2s(Math.min(1, Math.max(0, v))) * 255));
}
/** a → b by t (0..1), in OKLab (no muddy midpoints). Accents are only ever mixed with neutrals. */
export const mix = (a, b, t) => fromLab(toLab(a).map((v, i) => v + (toLab(b)[i] - v) * t));
export const lighten = (h, dL) => {
  const [L, a, b] = toLab(h);
  return fromLab([Math.min(1, Math.max(0, L + dL)), a, b]);
};
export const rgba = (h, a) => `rgba(${rgb(h).join(', ')}, ${a})`;
export function luminance(h) {
  const [r, g, b] = rgb(h).map((v) => s2l(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Moves fg's lightness away from bg until it reaches the target contrast. */
export function ensureContrast(fg, bg, target = 4.5) {
  if (contrast(fg, bg) >= target) return fg;
  const dir = luminance(bg) < 0.2 ? 1 : -1;
  let c = fg;
  for (let i = 1; i <= 40 && contrast(c, bg) < target; i++) c = lighten(fg, dir * i * 0.02);
  return c;
}
const bestInk = (on, candidates) => candidates.reduce((best, c) => (contrast(on, c) > contrast(on, best) ? c : best));
/** The mark's main colour on the page ground (the media kit's rule): accent at 3:1, else ink, else accent2. */
export function primaryOnBg(pal) {
  for (const c of [pal.accent, pal.ink, pal.accent2]) if (contrast(c, pal.bg) >= 3) return c;
  return contrast(pal.ink, pal.bg) > contrast(pal.accent, pal.bg) ? pal.ink : pal.accent;
}

// ── brand.json ────────────────────────────────────────────
export const slugify = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

// Motion signatures: how new things arrive and how numbers move. `family` is the coarse value kept in
// brand.motion / html[data-motion] (glide | pop | flip) for templates written before signatures.
export const SIGNATURES = {
  glide: { family: 'glide', roll: ['var(--t-slow)', 'var(--ease)'], list: 'var(--ease)' },
  pop: { family: 'pop', roll: ['420ms', 'var(--spring)'], list: 'var(--spring)' },
  'split-flap': { family: 'flip', roll: ['380ms', 'cubic-bezier(0.3, 1.45, 0.5, 1)'], list: 'var(--ease)' },
  odometer: { family: 'glide', roll: ['560ms', 'cubic-bezier(0.65, 0, 0.35, 1)'], list: 'var(--ease)' },
  'card-deal': { family: 'glide', roll: ['var(--t-slow)', 'var(--ease)'], list: 'var(--spring)' },
  'pulse-ring': { family: 'pop', roll: ['var(--t-slow)', 'var(--ease)'], list: 'var(--ease)' },
  'ticker-tape': { family: 'glide', roll: ['220ms', 'linear'], list: 'linear' },
  stamp: { family: 'pop', roll: ['260ms', 'cubic-bezier(0.2, 1.6, 0.4, 1)'], list: 'var(--ease)' },
};
const ALIASES = {
  flip: 'split-flap', flap: 'split-flap', splitflap: 'split-flap', board: 'split-flap', departure: 'split-flap',
  roll: 'odometer', counter: 'odometer', odo: 'odometer', meter: 'odometer', digits: 'odometer',
  deal: 'card-deal', card: 'card-deal', cards: 'card-deal', shuffle: 'card-deal',
  pulse: 'pulse-ring', ring: 'pulse-ring', radar: 'pulse-ring', ripple: 'pulse-ring', ping: 'pulse-ring',
  ticker: 'ticker-tape', tape: 'ticker-tape', marquee: 'ticker-tape', crawl: 'ticker-tape',
  press: 'stamp', seal: 'stamp', slam: 'stamp', punch: 'stamp',
  spring: 'pop', bounce: 'pop', snap: 'pop', elastic: 'pop',
  slide: 'glide', fade: 'glide', smooth: 'glide', float: 'glide', drift: 'glide',
};
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** brand.json.motion → { signature, family, warning? }. Unknown values map to the nearest signature. */
export function signatureOf(m) {
  const s = String(m ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!s) return { signature: 'glide', family: 'glide' };
  if (SIGNATURES[s]) return { signature: s, family: SIGNATURES[s].family };
  for (const word of s.split('-').concat(s.replace(/-/g, ''))) {
    const hit = SIGNATURES[word] ? word : ALIASES[word];
    if (hit) return { signature: hit, family: SIGNATURES[hit].family, ...(hit === s ? {} : { warning: `motion "${m}" → "${hit}"` }) };
  }
  const names = [...Object.keys(SIGNATURES), ...Object.keys(ALIASES)];
  const near = names.reduce((best, n) => (lev(s, n) < lev(s, best) ? n : best), names[0]);
  const hit = SIGNATURES[near] ? near : ALIASES[near];
  return { signature: hit, family: SIGNATURES[hit].family, warning: `motion "${m}" is not a signature (${Object.keys(SIGNATURES).join(', ')}); using the nearest, "${hit}"` };
}
/** Kept for older callers: the coarse family. */
export const motionOf = (m) => signatureOf(m).family;

/** Validates and completes a brand.json. Returns { brand, warnings } or throws with every problem listed. */
export function normalizeBrand(raw) {
  const errors = [];
  const warnings = [];
  const b = raw && typeof raw === 'object' ? raw : {};
  const name = String(b.name ?? '').trim();
  if (!name) errors.push('name is required');
  if (name.length > 32) errors.push('name is longer than 32 characters');
  const slug = slugify(b.slug || name);
  if (name && !slug) errors.push('name needs at least one latin letter or digit (for the slug)');
  const ticker = String(b.ticker ?? '').trim().replace(/^\$/, '').toUpperCase();
  if (ticker && !/^[A-Z0-9]{1,12}$/.test(ticker)) errors.push('ticker must be 1–12 letters or digits');
  const domain = String(b.domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!domain) errors.push('domain is required (the site, the Caddy config and the share links use it)');
  else if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) errors.push(`domain "${domain}" is not a domain name`);
  const x = String(b.x ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(x|twitter)\.com\//, '');
  if (x && !/^[A-Za-z0-9_]{1,15}$/.test(x)) errors.push(`x "${x}" is not an X handle`);
  if (!x) warnings.push('no X handle: the header X link opens x.com');
  const tagline = String(b.tagline ?? '').trim();
  if (!tagline) errors.push('tagline is required (the hook, ≤ 10 words)');
  else if (tagline.split(/\s+/).length > 10) warnings.push(`tagline has ${tagline.split(/\s+/).length} words (the hook should be ≤ 10)`);

  const p = b.palette ?? {};
  const pal = {};
  for (const k of ['bg', 'surface', 'ink', 'mute', 'accent']) {
    pal[k] = hex(p[k]);
    if (!pal[k]) errors.push(`palette.${k} must be a hex color`);
  }
  if (errors.length) throw new Error('brand.json:\n  - ' + errors.join('\n  - '));
  const theme = b.theme === 'light' || b.theme === 'dark' ? b.theme : luminance(pal.bg) > 0.4 ? 'light' : 'dark';
  const dark = theme === 'dark';
  pal.line = hex(p.line) ?? mix(pal.surface, pal.ink, 0.1);
  pal.accent2 = hex(p.accent2) ?? (dark ? '#ffb547' : '#f08c00');
  pal.up = hex(p.up) ?? (dark ? '#3fd68b' : '#14a35a');
  pal.down = hex(p.down) ?? (dark ? '#ff6f6f' : '#e0453f');
  for (const k of ['line', 'accent2', 'up', 'down']) if (p[k] !== undefined && !hex(p[k])) warnings.push(`palette.${k} is not a hex color: using ${pal[k]}`);
  if (contrast(pal.ink, pal.bg) < 7) warnings.push(`ink on bg contrast is ${contrast(pal.ink, pal.bg).toFixed(1)} (aim for 7+)`);
  if (contrast(pal.mute, pal.surface) < 3.2) warnings.push(`mute on surface contrast is ${contrast(pal.mute, pal.surface).toFixed(1)} (aim for 3.2+)`);
  if (contrast(pal.accent, pal.bg) < 2) warnings.push(`accent on bg contrast is ${contrast(pal.accent, pal.bg).toFixed(1)} (the accent will look faint)`);
  if ((dark && luminance(pal.bg) > 0.2) || (!dark && luminance(pal.bg) < 0.4)) warnings.push(`theme "${theme}" with bg ${pal.bg}: check the theme`);

  const f = b.fonts ?? {};
  const fonts = {
    display: String(f.display || 'Archivo').trim(),
    body: String(f.body || f.display || 'Archivo').trim(),
    mono: String(f.mono || 'JetBrains Mono').trim(),
  };
  const sig = signatureOf(b.motion);
  if (sig.warning) warnings.push(sig.warning);
  return {
    brand: {
      name, slug, ticker, domain, x, tagline, theme, palette: pal, fonts,
      mark: typeof b.mark === 'string' && b.mark.trim() ? b.mark.trim() : 'brand/mark.svg',
      markGiven: typeof b.mark === 'string' && !!b.mark.trim(),
      motion: sig.family, signature: sig.signature, motionRaw: b.motion ?? '',
    },
    warnings,
  };
}

// ── fonts ─────────────────────────────────────────────────
const WANT = { display: [600, 700, 800], body: [400, 500, 600, 700], mono: [400, 500, 600] };
const fontId = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function npmLatest(pkg, fetchFn) {
  const r = await fetchFn(`https://registry.npmjs.org/${pkg.replace('/', '%2f')}/latest`, { signal: AbortSignal.timeout(10000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`npm registry ${r.status}`);
  return (await r.json()).version ?? null;
}
async function fontMeta(pkg, version, fetchFn) {
  try {
    const r = await fetchFn(`https://cdn.jsdelivr.net/npm/${pkg}@${version}/metadata.json`, { signal: AbortSignal.timeout(10000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/**
 * Picks a self-hosted package per family: @fontsource-variable/<id>, else @fontsource/<id> (the weights it has),
 * else a Google Fonts <link>. Returns { deps, imports, stacks, links, displayWeight, notes }.
 */
export async function resolveFonts(fonts, { fetchFn = globalThis.fetch } = {}) {
  const deps = {};
  const imports = [];
  const links = [];
  const notes = [];
  const stacks = {};
  const fallback = {
    display: 'ui-sans-serif, system-ui, sans-serif',
    body: 'ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  };
  let displayWeight = 760;
  const byFamily = new Map();
  for (const role of ['display', 'body', 'mono']) {
    const fam = fonts[role];
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam).push(role);
  }
  for (const [family, roles] of byFamily) {
    const id = fontId(family);
    let done = false;
    try {
      const vv = await npmLatest(`@fontsource-variable/${id}`, fetchFn);
      if (vv) {
        const pkg = `@fontsource-variable/${id}`;
        const meta = await fontMeta(pkg, vv, fetchFn);
        deps[pkg] = vv;
        imports.push(pkg);
        const max = Number(meta?.variable?.wght?.max) || 900;
        if (roles.includes('display')) displayWeight = Math.min(760, max);
        for (const r of roles) stacks[r] = `'${family} Variable', '${family}', ${fallback[r]}`;
        notes.push(`${family}: ${pkg}@${vv} (variable)`);
        done = true;
      } else {
        const sv = await npmLatest(`@fontsource/${id}`, fetchFn);
        if (sv) {
          const pkg = `@fontsource/${id}`;
          const meta = await fontMeta(pkg, sv, fetchFn);
          const has = Array.isArray(meta?.weights) ? meta.weights.map(Number) : [400, 700];
          const want = [...new Set(roles.flatMap((r) => WANT[r]))].filter((w) => has.includes(w)).sort((a, b) => a - b);
          deps[pkg] = sv;
          if (want.length) for (const w of want) imports.push(`${pkg}/${w}.css`);
          else imports.push(pkg);
          if (roles.includes('display')) displayWeight = Math.max(...has.filter((w) => w <= 800), 400);
          for (const r of roles) stacks[r] = `'${family}', ${fallback[r]}`;
          notes.push(`${family}: ${pkg}@${sv} (weights ${want.join(', ') || 'default'})`);
          done = true;
        }
      }
    } catch (e) {
      notes.push(`${family}: npm registry unreachable (${e.message}); using Google Fonts`);
    }
    if (!done) {
      const q = family.trim().replace(/\s+/g, '+');
      if (!links.length) links.push('<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />');
      links.push(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${q}:wght@400;700&display=swap" />`);
      for (const r of roles) stacks[r] = `'${family}', ${fallback[r]}`;
      if (roles.includes('display')) displayWeight = 700;
      if (!notes.some((n) => n.startsWith(family + ':'))) notes.push(`${family}: no @fontsource package; Google Fonts link`);
    }
  }
  return { deps, imports, stacks, links, displayWeight, notes };
}

// ── generated files ───────────────────────────────────────
const SPRING = 'linear(0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%, 0.849 31.5%, 0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.1%, 1.015 55%, 1.017 63.9%, 1.001 85.6%, 1)';

export function tokensCss(brand, font) {
  const p = brand.palette;
  const dark = brand.theme === 'dark';
  const white = '#ffffff';
  const darkest = luminance(p.bg) < luminance(p.ink) ? p.bg : p.ink;
  const near = mix(darkest, '#000000', 0.35);
  const accentInk = bestInk(p.accent, [white, near]);
  const accent2Ink = bestInk(p.accent2, [white, near]);
  const surface2 = mix(p.surface, p.ink, dark ? 0.05 : 0.035);
  const surface3 = mix(p.surface, p.ink, dark ? 0.09 : 0.07);
  const surfaceHi = dark ? mix(p.surface, p.ink, 0.025) : mix(p.surface, white, 0.6);
  const shade = dark ? '0, 0, 0' : rgb(p.ink).join(', ');
  // avatar tints: each colour mixed with the neutral ground only (two accents never mix: no off-brand hues)
  const strong = dark ? 0.24 : 0.16;
  const soft = dark ? 0.13 : 0.09;
  const tint = (c, t) => {
    const bg = mix(surface2, c, t);
    return [bg, ensureContrast(c, bg, 3.4)];
  };
  const tints = [tint(p.accent, strong), tint(p.accent2, strong), tint(p.up, strong * 0.9), tint(p.accent, soft), tint(p.accent2, soft), tint(p.ink, dark ? 0.08 : 0.06)];
  const sig = SIGNATURES[brand.signature] ?? SIGNATURES.glide;
  return `/* GENERATED from .trench/brand.json by scripts/brand.mjs — edit brand.json and run \`npm run brand\`. */
:root {
  color-scheme: ${brand.theme};
  /* palette */
  --bg: ${p.bg};
  --surface: ${p.surface};
  --surface-hi: ${surfaceHi};
  --surface-2: ${surface2};
  --surface-3: ${surface3};
  --ink: ${p.ink};
  --ink-2: ${mix(p.ink, p.bg, 0.18)};
  --mute: ${p.mute};
  --line: ${p.line};
  --accent: ${p.accent};
  --accent-hi: ${lighten(p.accent, dark ? 0.05 : 0.04)};
  --accent-ink: ${accentInk};
  --accent-edge: ${accentInk === white ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.4)'};
  --accent-soft: ${rgba(p.accent, dark ? 0.14 : 0.12)};
  --accent-wash: ${rgba(p.accent, dark ? 0.11 : 0.1)};
  --accent-glow: ${rgba(p.accent, dark ? 0.5 : 0.42)};
  --accent2: ${p.accent2};
  --accent2-ink: ${accent2Ink};
  --accent2-wash: ${rgba(p.accent2, dark ? 0.05 : 0.07)};
  --up: ${p.up};
  --down: ${p.down};
  --up-soft: ${rgba(p.up, 0.18)};
  --down-soft: ${rgba(p.down, 0.18)};
${tints.map(([bg, ink], i) => `  --tint-${i}: ${bg};\n  --tint-${i}-ink: ${ink};`).join('\n')}
  --tint-ink: var(--tint-0-ink);
  --mark-color: ${primaryOnBg(p)};
  --hl: ${dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.85)'};
  --scrim: ${dark ? 'rgba(0, 0, 0, 0.58)' : `rgba(${shade}, 0.34)`};
  --shadow-card: ${
    dark
      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.45), 0 22px 44px -24px rgba(0, 0, 0, 0.75)'
      : `0 1px 2px rgba(${shade}, 0.05), 0 14px 36px -18px rgba(${shade}, 0.2), inset 0 0 0 1px rgba(${shade}, 0.035)`
  };
  --shadow-1: ${dark ? '0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 18px -10px rgba(0, 0, 0, 0.55)' : `0 1px 2px rgba(${shade}, 0.06), 0 6px 16px -8px rgba(${shade}, 0.14)`};
  --shadow-pop: ${dark ? '0 30px 70px -20px rgba(0, 0, 0, 0.8), 0 2px 8px rgba(0, 0, 0, 0.45)' : `0 30px 70px -22px rgba(${shade}, 0.38), 0 2px 8px rgba(${shade}, 0.08)`};

  /* type */
  --font-display: ${font.stacks.display};
  --font-body: ${font.stacks.body};
  --font-mono: ${font.stacks.mono};
  --display-weight: ${font.displayWeight};
  --display-tracking: -0.035em;

  /* shape */
  --page: 1440px;
  --gutter: clamp(16px, 3vw, 40px);
  --r-sm: 12px;
  --r-md: 16px;
  --r-lg: 24px;
  --r-xl: 32px;

  /* motion (signature: ${brand.signature}) */
  --t-fast: 140ms;
  --t-med: 220ms;
  --t-slow: 320ms;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --spring: ${SPRING};
  --t-roll: ${sig.roll[0]};
  --ease-roll: ${sig.roll[1]};
  --ease-glide: ${sig.list};
}
`;
}

export function brandData(brand, markFile) {
  return {
    name: brand.name,
    slug: brand.slug,
    ticker: brand.ticker,
    domain: brand.domain,
    x: brand.x,
    tagline: brand.tagline,
    theme: brand.theme,
    motion: brand.motion,
    signature: brand.signature,
    markFile,
    markColor: primaryOnBg(brand.palette),
    palette: brand.palette,
    fonts: brand.fonts,
  };
}

export function brandTs(brand, markFile) {
  const data = brandData(brand, markFile);
  return `// GENERATED from .trench/brand.json by scripts/brand.mjs — edit brand.json and run \`npm run brand\`.
// markFile: the brand has its own SVG mark (public/mark.svg is always there: the mark, or a placeholder).
export const brand = ${JSON.stringify(data, null, 2)} as const;
export type Brand = typeof brand;
`;
}

export function fontsTs(font) {
  return `// GENERATED by scripts/brand.mjs: self-hosted fonts (bundled by Vite, no font CDN).
${font.imports.map((i) => `import '${i}';`).join('\n')}
`;
}

// ── the mark ──────────────────────────────────────────────
/** A text-free stand-in until the real mark is drawn (`trench media mark`). */
export const PLACEHOLDER_MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="currentColor" fill-rule="evenodd" d="M32 6a26 26 0 1 1 0 52a26 26 0 0 1 0-52zm0 15a11 11 0 1 0 0 22a11 11 0 0 0 0-22z"/><circle cx="32" cy="32" r="5" fill="var(--mark-2, currentColor)"/></svg>';

/** Path rules: absolute → as is; else project root; else the folder of brand.json. */
export function resolveMarkPath(ref, { root, brandDir } = {}) {
  if (!ref) return null;
  if (isAbsolute(ref)) return existsSync(ref) ? ref : null;
  for (const base of [root, brandDir].filter(Boolean)) {
    const p = resolve(base, ref);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Cleans an SVG for embedding: no XML prolog, doctype, scripts, event handlers or external hrefs. */
export function cleanSvg(svg) {
  return String(svg)
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\s(xlink:)?href\s*=\s*("https?:[^"]*"|'https?:[^']*')/gi, '')
    .trim();
}

function splitSvg(svg) {
  const m = /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(cleanSvg(svg));
  if (!m) throw new Error('the mark is not an <svg> file');
  const attrs = m[1];
  let vb = /viewBox\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
  if (!vb) {
    const w = parseFloat(/\swidth\s*=\s*["']([\d.]+)/i.exec(attrs)?.[1] ?? '64');
    const h = parseFloat(/\sheight\s*=\s*["']([\d.]+)/i.exec(attrs)?.[1] ?? '64');
    vb = `0 0 ${w} ${h}`;
  }
  const style = /\sstyle\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? '';
  return { vb, inner: m[2], style, hasText: /<\s*(text|tspan|textPath)\b/i.test(m[2]) };
}

/** Mark colours (the media kit's convention): currentColor = main, --mark-2 = detail, --mark-bg = knock-outs. */
export function markColors(pal, plate = pal.bg) {
  const mark = plate === pal.bg ? primaryOnBg(pal) : ensureContrast(primaryOnBg(pal), plate, 3);
  const mark2 = contrast(pal.accent2, plate) >= 1.6 && mark.toLowerCase() !== pal.accent2.toLowerCase() ? pal.accent2 : mark;
  return { mark, mark2, markBg: plate };
}
const colorStyle = (c) => `color:${c.mark};--mark:${c.mark};--mark-2:${c.mark2};--mark-bg:${c.markBg}`;

/** The mark as a standalone SVG with its colours baked in (for <img>, canvas and the og image). */
export function coloredMarkSvg(svg, colors) {
  const { vb, inner, style } = splitSvg(svg);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" style="${style ? style.replace(/;?\s*$/, ';') : ''}${colorStyle(colors)}">${inner}</svg>\n`;
}

/** The favicon: the mark on a rounded bg plate. */
export function faviconSvg(svg, pal) {
  const { vb, inner, style } = splitSvg(svg);
  const c = markColors(pal, pal.bg);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${pal.bg}"/><svg x="9" y="9" width="46" height="46" viewBox="${vb}" style="${style ? style.replace(/;?\s*$/, ';') : ''}${colorStyle(c)}">${inner}</svg></svg>\n`;
}

/**
 * Writes every brand file into a project (root = `dir`, the folder that holds .trench/). `brandDir`: the folder of
 * the brand.json being used (a draft, or .trench/). A relative mark found outside the project is copied in at the
 * same relative path, so `npm run brand` finds it at the project root later. Returns { brand, markFile, markPath,
 * font, warnings }.
 */
export async function writeBrandFiles(dir, raw, { brandDir = join(dir, '.trench'), fetchFn, font: given } = {}) {
  const { brand, warnings } = normalizeBrand(raw);
  const font = given ?? (await resolveFonts(brand.fonts, { fetchFn }));
  mkdirSync(join(dir, 'src/styles'), { recursive: true });
  mkdirSync(join(dir, 'public'), { recursive: true });

  let markPath = resolveMarkPath(brand.mark, { root: dir, brandDir });
  let svg = null;
  if (markPath) {
    try {
      svg = readFileSync(markPath, 'utf8');
      const parts = splitSvg(svg);
      if (parts.hasText) warnings.push(`mark ${brand.mark} has <text>: images must stay text-free (draw the letters as paths)`);
      if (!isAbsolute(brand.mark) && relative(dir, markPath).startsWith('..')) {
        const dest = join(dir, brand.mark);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(markPath, dest);
        markPath = dest;
      }
    } catch (e) {
      warnings.push(`mark ${brand.mark}: ${e.message}; using the placeholder mark`);
      svg = null;
      markPath = null;
    }
  } else if (brand.markGiven) warnings.push(`mark "${brand.mark}" not found (project root, then ${brandDir}): using the placeholder mark`);
  else warnings.push('no mark yet (brand/mark.svg): using the placeholder mark. Draw one with `trench media mark`.');
  const markFile = !!svg;
  const source = svg ?? PLACEHOLDER_MARK;
  writeFileSync(join(dir, 'public/mark.svg'), coloredMarkSvg(source, markColors(brand.palette)));
  writeFileSync(join(dir, 'public/favicon.svg'), faviconSvg(source, brand.palette));

  writeFileSync(join(dir, 'src/styles/tokens.css'), tokensCss(brand, font));
  writeFileSync(join(dir, 'src/brand.ts'), brandTs(brand, markFile));
  writeFileSync(join(dir, 'src/fonts.ts'), fontsTs(font));
  writeFileSync(
    join(dir, 'src/brand.json'),
    JSON.stringify(
      {
        ...brandData(brand, markFile),
        fontLinks: font.links,
        displayWeight: font.displayWeight,
        surface2: mix(brand.palette.surface, brand.palette.ink, brand.theme === 'dark' ? 0.05 : 0.035),
      },
      null,
      2,
    ) + '\n',
  );
  // the font packages in package.json (old @fontsource entries replaced)
  const pkgFile = join(dir, 'package.json');
  if (existsSync(pkgFile)) {
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    const deps = Object.fromEntries(Object.entries(pkg.dependencies ?? {}).filter(([k]) => !k.startsWith('@fontsource')));
    pkg.dependencies = Object.fromEntries(Object.entries({ ...deps, ...font.deps }).sort(([a], [b]) => a.localeCompare(b)));
    pkg.trench = { ...(pkg.trench ?? {}), name: brand.name, slug: brand.slug, domain: brand.domain };
    writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  }
  // a manifest that works before `npm run assets` copies or draws the PNG icons
  if (!existsSync(join(dir, 'public/site.webmanifest'))) {
    writeFileSync(
      join(dir, 'public/site.webmanifest'),
      JSON.stringify({ name: brand.name, short_name: brand.name, start_url: '/', display: 'standalone', background_color: brand.palette.bg, theme_color: brand.palette.bg, icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }] }, null, 2) + '\n',
    );
  }
  return { brand, markFile, markPath, font, warnings };
}

/** Kept for older callers: now the placeholder mark (images stay text-free). */
export const letterMarkSvg = (brand) => faviconSvg(PLACEHOLDER_MARK, brand.palette);

// ── CLI: npm run brand ────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, '.trench/brand.json');
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const out = await writeBrandFiles(root, raw, { brandDir: dirname(file) });
    for (const n of out.font.notes) console.log('  font   ' + n);
    console.log(`  mark   ${out.markPath ? relative(root, out.markPath) : 'placeholder'} · signature ${out.brand.signature}`);
    for (const w of out.warnings) console.log('  note   ' + w);
    console.log(`\n  ${out.brand.name}: tokens.css, brand.ts, brand.json, fonts.ts, mark.svg, favicon.svg written.`);
    console.log('  Next: npm install (new fonts) · npm run assets (icons, og.png) · npm run shots');
  } catch (e) {
    console.error('✖ ' + e.message);
    process.exit(1);
  }
}
