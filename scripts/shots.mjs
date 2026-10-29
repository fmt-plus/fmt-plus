#!/usr/bin/env node
// npm run shots — the visual and "every button works" gate (≈ 30–60 s; the two viewports run in parallel).
//   node scripts/shots.mjs [--base=http://127.0.0.1:<webPort>] [--pages=/,/docs] [--no-clicks] [--no-stub]
// For 390×844 (an iPhone) and 1440×900, on every page:
//   • .shots/<page>-<width>.png (a long page: full length with fixed bars hidden, plus <page>-<width>-top.png),
//     one shot per dialog the clicks open, and <page>-<width>-later.png for live pages
//   • fails on console errors and page errors; expected API replies (4xx from /api/*, e.g. 401 before sign-in) are
//     listed separately and do not fail
//   • a live list ([data-live-list] holding [data-live-key] items, newest first) must fill and change within 20 s;
//     nothing scrolls sideways (the home may scroll down: constitution v0.2); no demo / beta / test / testnet / preview / pre-live text is shown
//   • clicks every button, [role=button], link and <summary> (one per data-qa group; dialogs one level deep). After a
//     click it waits for network idle and up to 3 s for a visible change (URL, dialog, toast, clipboard, popup,
//     download, aria/data-state, <details>, scroll). No change = inert. Errors are charged to the click they follow.
// A Phantom stand-in (scripts/phantom-stub.js) is injected, so Connect runs the real sign-in against the server.
// External requests are blocked (a navigation away gets a blank page and counts as the effect). Starts
// `npm run dev` itself when nothing answers.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launch } from './pw.mjs';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const has = (k) => process.argv.includes(`--${k}`);
const BASE = arg('base', process.env.BASE || `http://127.0.0.1:${pkg.trench?.webPort}`).replace(/\/$/, '');
const PAGES = arg('pages', '/,/docs').split(',').filter(Boolean);
const CLICKS = !has('no-clicks');
const STUB = !has('no-stub');
const OUT = root + '.shots/';
const LABELS = /\b(demo|beta|testnet|devnet|test mode|preview|pre-live|coming soon|lorem ipsum|placeholder)\b/i;
const CHANGE_MS = 3000;
const LIVE_MS = 20000;
const VIEWPORTS = [
  {
    name: '390',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  { name: '1440', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
];
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();

const up = async () => {
  try {
    const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(2000) });
    return r.status < 500;
  } catch {
    return false;
  }
};
let dev = null;
if (!(await up())) {
  console.log(`nothing at ${BASE}: starting npm run dev`);
  dev = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: root, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) {
    console.error('the dev servers did not start');
    process.kill(-dev.pid);
    process.exit(1);
  }
}
const origin = new URL(BASE).origin;
const stubSrc = readFileSync(root + 'scripts/phantom-stub.js', 'utf8');
const QA_INIT = `(() => {
  window.__qa = { clip: 0 };
  const c = navigator.clipboard;
  if (c && c.writeText) { const w = c.writeText.bind(c); c.writeText = (t) => { window.__qa.clip++; return w(t).catch(() => undefined); }; }
  const ex = document.execCommand.bind(document);
  document.execCommand = (cmd, ...a) => { if (cmd === 'copy') window.__qa.clip++; return ex(cmd, ...a); };
})();`;

const report = { base: BASE, at: new Date().toISOString(), runs: [], failures: [] };
const fail = (msg) => {
  report.failures.push(msg);
  return msg;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runViewport(browser, vp) {
  const lines = [];
  const say = (s) => lines.push(s);
  for (const path of PAGES) {
    const name = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-');
    const run = { page: path, width: vp.name, errors: [], apiReplies: [], external: [], clicks: [], shots: [] };
    report.runs.push(run);
    say(`\n■ ${path} @ ${vp.name}`);
    const ctx = await browser.newContext({ ...vp, acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).catch(() => undefined);
    await ctx.route('**/*', (r) => {
      const u = r.request().url();
      if (u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return r.continue();
      run.external.push(u.slice(0, 120));
      if (r.request().isNavigationRequest()) return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>external</title>' });
      return r.abort();
    });
    if (STUB) await ctx.addInitScript(stubSrc);
    await ctx.addInitScript(QA_INIT);
    const page = await ctx.newPage();
    const counters = { popups: 0, downloads: 0, pending: 0 };
    const errors = []; // { t, text }
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      const url = m.location()?.url ?? '';
      const st = /status of (\d{3})/.exec(text)?.[1];
      // an API answering 4xx (401 before sign-in, 404 for a missing item) is a reply, not a broken page
      if (st && st.startsWith('4') && url.startsWith(origin + '/api/')) run.apiReplies.push(`${st} ${url.slice(origin.length)}`);
      else errors.push({ t: Date.now(), text: text.slice(0, 300) });
    });
    page.on('pageerror', (e) => errors.push({ t: Date.now(), text: 'pageerror: ' + String(e.message).slice(0, 300) }));
    page.on('popup', (p) => {
      counters.popups++;
      void p.close().catch(() => undefined);
    });
    page.on('download', (d) => {
      counters.downloads++;
      void d.cancel().catch(() => undefined);
    });
    const isStream = (r) => r.url().includes('/api/stream');
    page.on('request', (r) => !isStream(r) && counters.pending++);
    page.on('requestfinished', (r) => !isStream(r) && (counters.pending = Math.max(0, counters.pending - 1)));
    page.on('requestfailed', (r) => !isStream(r) && (counters.pending = Math.max(0, counters.pending - 1)));

    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.live === '1', null, { timeout: 10000 }).catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);
    await sleep(900);
    const loadedAt = Date.now();

    // screenshots: a long page in full with its fixed bars hidden, plus the first screen as the visitor sees it
    const geo = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
      w: innerWidth,
      h: innerHeight,
      text: document.body.innerText,
      live: document.documentElement.dataset.live,
    }));
    const file = `${OUT}${name}-${vp.name}.png`;
    if (geo.sh > geo.h + 2) {
      await page.screenshot({ path: `${OUT}${name}-${vp.name}-top.png` });
      run.shots.push(`${OUT}${name}-${vp.name}-top.png`);
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('body *')) {
          if (getComputedStyle(el).position === 'fixed') {
            el.setAttribute('data-qa-hidden', el.style.visibility);
            el.style.visibility = 'hidden';
          }
        }
      });
      await page.screenshot({ path: file, fullPage: true });
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('[data-qa-hidden]')) {
          el.style.visibility = el.getAttribute('data-qa-hidden') || '';
          el.removeAttribute('data-qa-hidden');
        }
      });
    } else await page.screenshot({ path: file });
    run.shots.push(file);
    say('  shot ' + file);

    if (geo.sw > geo.w + 1) say('  ✖ ' + fail(`${path}@${vp.name}: scrolls sideways (${geo.sw}px > ${geo.w}px)`));
    // constitution v0.2 §2: the home may scroll (rich product); the first screen still has to carry the hero
    if (path === '/') say(`  · ${path}@${vp.name}: page ${geo.sh}px for a ${geo.h}px screen`);
    const label = LABELS.exec(geo.text);
    if (label) say('  ✖ ' + fail(`${path}@${vp.name}: shows "${label[0]}"`));
    if (geo.live !== '1') say('  ✖ ' + fail(`${path}@${vp.name}: the live stream did not connect`));
    const loadErrors = errors.splice(0);
    for (const e of loadErrors) say('  ✖ ' + fail(`${path}@${vp.name}: on load: ${e.text}`));
    run.errors.push(...loadErrors.map((e) => `load: ${e.text}`));

    const liveKey = () => page.evaluate(() => document.querySelector('[data-live-key]')?.getAttribute('data-live-key') ?? '');
    const firstKey = await liveKey();
    const liveList = firstKey !== '' || (await page.locator('[data-live-list]').count()) > 0;

    if (CLICKS) await clickAll(page, path, name, vp.name, run, counters, errors, say);

    // the live list must have moved by now (the clicks took a while), or within 20 s of the load
    if (liveList) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      let k = await liveKey();
      while ((k === firstKey || !k) && Date.now() - loadedAt < LIVE_MS) {
        await sleep(400);
        k = await liveKey();
      }
      run.liveUpdated = !!k && k !== firstKey;
      say(`  live list ${run.liveUpdated ? 'updated' : 'DID NOT UPDATE'} (${firstKey.slice(0, 6) || 'empty'} → ${k.slice(0, 6) || 'empty'})`);
      if (!run.liveUpdated) say('  ✖ ' + fail(`${path}@${vp.name}: the live list did not change in 20 s`));
      const later = `${OUT}${name}-${vp.name}-later.png`;
      await sleep(400);
      await page.screenshot({ path: later });
      run.shots.push(later);
    }
    for (const e of errors.splice(0)) {
      run.errors.push(`late: ${e.text}`);
      say('  ✖ ' + fail(`${path}@${vp.name}: ${e.text}`));
    }
    if (run.apiReplies.length) say(`  api replies (expected): ${[...new Set(run.apiReplies)].join(', ')}`);
    await ctx.close();
  }
  return lines;
}

async function clickAll(page, path, name, vpName, run, counters, errors, say) {
  const SEL = 'button, [role=button], a[href], summary';
  const tag = (scope) =>
    page.evaluate(
      ({ SEL, scope }) => {
        const rootEl = scope ? document.querySelector(scope) : document;
        if (!rootEl) return [];
        const seen = new Map();
        const groups = new Set();
        const out = [];
        for (const el of rootEl.querySelectorAll(SEL)) {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          if (r.width < 2 || r.height < 2 || st.visibility === 'hidden' || st.display === 'none' || el.disabled) continue;
          if (r.bottom < 0 || r.top > innerHeight * 3) continue;
          if (!scope && el.closest('[role=dialog]')) continue;
          const g = el.closest('[data-qa]')?.getAttribute('data-qa');
          if (g) {
            if (groups.has(g)) continue;
            groups.add(g);
          }
          const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
          const base = g ? `[${g}]` : `${el.tagName.toLowerCase()}:${text}|${el.getAttribute('href') ?? ''}`;
          const n = (seen.get(base) ?? 0) + 1;
          seen.set(base, n);
          const key = n > 1 ? `${base}#${n}` : base;
          el.setAttribute('data-qa-key', key);
          out.push({
            key,
            current: el.getAttribute('aria-current') === 'page',
            samePage: el.tagName === 'A' && el.getAttribute('href') === location.pathname,
          });
        }
        return out;
      },
      { SEL, scope },
    );
  const sig = async () => {
    const s = await page
      .evaluate(() => ({
        url: location.href,
        dialogs: document.querySelectorAll('[role=dialog]').length,
        toasts: [...document.querySelectorAll('[data-toast]')].map((t) => t.textContent).join('|'),
        clip: window.__qa?.clip ?? 0,
        state: [...document.querySelectorAll('[aria-current],[aria-expanded],[aria-pressed],[data-state],details')]
          .map((e) => `${e.getAttribute('aria-current') ?? ''}${e.getAttribute('aria-expanded') ?? ''}${e.getAttribute('aria-pressed') ?? ''}${e.getAttribute('data-state') ?? ''}${e.open ? 'o' : ''}`)
          .join('|'),
        scroll: Math.round(scrollY),
      }))
      .catch(() => ({ url: 'navigating' }));
    return { ...s, popups: counters.popups, downloads: counters.downloads };
  };
  const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
  const loc = (key) => page.locator(`[data-qa-key="${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`).first();
  const reset = async () => {
    for (let i = 0; i < 3 && (await page.locator('[role=dialog]').count()); i++) {
      await page.keyboard.press('Escape');
      await sleep(200);
    }
    if (!page.url().startsWith(BASE) || (await page.evaluate(() => location.pathname)) !== path) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.live === '1', null, { timeout: 5000 }).catch(() => undefined);
      await sleep(300);
    }
  };
  const idle = async (ms) => {
    const end = Date.now() + ms;
    while (counters.pending > 0 && Date.now() < end) await sleep(60);
  };
  const shotDialogs = new Set();

  async function tryClick(item, label) {
    const el = loc(item.key);
    if (!(await el.count())) return { key: label, result: 'gone' };
    // errors that came while the page sat idle (after the previous click settled) are reported on their own
    for (const e of errors.splice(0)) {
      run.errors.push(`idle: ${e.text}`);
      say('  ✖ ' + fail(`${path}@${vpName}: while idle: ${e.text}`));
    }
    const before = await sig();
    const start = Date.now();
    try {
      await el.click({ timeout: 4000 });
    } catch (e) {
      return { key: label, result: 'error', detail: String(e.message).split('\n')[0].slice(0, 160) };
    }
    // wait for a visible change (up to 3 s; the current page's own tab changes nothing and needs no wait)
    let changed = [];
    const limit = item.current || item.samePage ? 400 : CHANGE_MS;
    while (Date.now() - start < limit) {
      await sleep(120);
      changed = diff(before, await sig());
      if (changed.length) break;
    }
    await idle(1500);
    await sleep(150);
    changed = diff(before, await sig());
    const mine = errors.splice(0);
    if (mine.length) return { key: label, result: 'error', detail: mine.map((e) => e.text).join(' | ').slice(0, 220), ms: Date.now() - start };
    if (!changed.length) {
      if (item.current || item.samePage) return { key: label, result: 'ok', effect: 'current page' };
      return { key: label, result: 'inert' };
    }
    return { key: label, result: 'ok', effect: changed.join(','), ms: Date.now() - start };
  }

  const log = (r) => {
    run.clicks.push(r);
    say(`  ${r.result === 'ok' ? '✓' : r.result === 'gone' ? '·' : '✖'} ${r.key}${r.effect ? '  → ' + r.effect : r.detail ? '  ' + r.detail : ''}`);
    if (r.result === 'inert' || r.result === 'error') {
      fail(`${path}@${vpName}: "${r.key}" ${r.result}${r.detail ? ': ' + r.detail : ''}`);
      if (r.result === 'error') run.errors.push(`${r.key}: ${r.detail}`);
    }
  };

  const done = new Set();
  for (let pass = 0; pass < 3; pass++) {
    await reset();
    const items = (await tag(null)).filter((i) => !done.has(i.key));
    if (!items.length) break;
    for (const item of items) {
      done.add(item.key);
      await reset();
      await tag(null);
      log(await tryClick(item, item.key));
      if ((await page.locator('[role=dialog]').count()) > 0) {
        await sleep(300);
        const dname = (await page.locator('[role=dialog]').first().getAttribute('aria-label')) || 'dialog';
        if (!shotDialogs.has(dname)) {
          shotDialogs.add(dname);
          const f = `${OUT}${name}-${vpName}-sheet-${dname.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
          await page.screenshot({ path: f });
          run.shots.push(f);
        }
        for (const child of await tag('[role=dialog]')) {
          const ck = `${item.key} › ${child.key}`;
          if (done.has(ck)) continue;
          done.add(ck);
          if (!(await page.locator('[role=dialog]').count())) {
            await reset();
            await tag(null);
            await loc(item.key).click({ timeout: 4000 }).catch(() => undefined);
            await page.locator('[role=dialog]').first().waitFor({ timeout: 3000 }).catch(() => undefined);
            await sleep(250);
          }
          await tag('[role=dialog]');
          log(await tryClick(child, ck));
        }
      }
    }
  }
}

const browser = await launch();
try {
  const outs = await Promise.all(VIEWPORTS.map((vp) => runViewport(browser, vp)));
  for (const lines of outs) console.log(lines.join('\n'));
} finally {
  await browser.close();
  if (dev) process.kill(-dev.pid);
}

writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2));
const clicks = report.runs.flatMap((r) => r.clicks);
const consoleErrors = report.runs.reduce((a, r) => a + r.errors.length, 0);
const api = report.runs.reduce((a, r) => a + r.apiReplies.length, 0);
console.log(
  `\n${report.runs.length} page runs · ${clicks.filter((c) => c.result === 'ok').length}/${clicks.filter((c) => c.result !== 'gone').length} clicks did something · ${consoleErrors} console errors · ${api} expected API replies · ${((Date.now() - t0) / 1000).toFixed(0)} s`,
);
if (report.failures.length) for (const f of report.failures) console.log('  ✖ ' + f);
console.log(report.failures.length ? `SHOTS: FAIL (${report.failures.length})` : 'SHOTS: PASS');
process.exit(report.failures.length ? 1 : 0);
