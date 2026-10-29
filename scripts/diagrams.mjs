#!/usr/bin/env node
// npm run diagrams — saves every docs diagram as a 1600×900 PNG for X posts: .trench/launch/images/<id>-1600x900.png
// (renders /docs/print on the running app; starts `npm run dev` when nothing answers).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { launch } from './pw.mjs';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));
const BASE = (process.env.BASE || `http://127.0.0.1:${pkg.trench?.webPort}`).replace(/\/$/, '');
const OUT = root + '.trench/launch/images/';
mkdirSync(OUT, { recursive: true });

const up = () => fetch(BASE + '/docs/print', { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
let dev = null;
if (!(await up())) {
  dev = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: root, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}
const b = await launch();
try {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await p.goto(BASE + '/docs/print', { waitUntil: 'load' });
  await p.waitForSelector('[data-diagram]', { timeout: 15000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  for (const el of await p.$$('[data-diagram]')) {
    const id = await el.getAttribute('data-diagram');
    await el.screenshot({ path: `${OUT}${id}-1600x900.png` });
    console.log(`.trench/launch/images/${id}-1600x900.png`);
  }
} finally {
  await b.close();
  if (dev) process.kill(-dev.pid);
}
