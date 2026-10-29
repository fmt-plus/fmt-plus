#!/usr/bin/env node
// npm run labels: no "demo / beta / test / testnet / preview / pre-live / coming soon" anywhere a visitor can see:
// src/copy.ts, index.html and the built dist/ (HTML text and the human-readable strings inside the JS bundle).
// Run after `npm run build`. Exit 1 on a hit (gates the release).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const WORDS = /\b(demo|beta|testnet|devnet|test mode|test|preview|pre-live|prelive|coming soon|lorem ipsum|placeholder)\b/i;
const hits = [];

function scanText(file, text) {
  text.split('\n').forEach((line, i) => {
    if (WORDS.test(line)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
}

// human-readable string literals in a bundle: they contain a space and a letter, and look like words
function scanBundle(file, js) {
  const re = /(["'`])((?:\\.|(?!\1)[^\\\n]){3,200})\1/g;
  let m;
  while ((m = re.exec(js))) {
    const s = m[2];
    if (!/\s/.test(s) || !/[a-z]{3}/i.test(s)) continue;
    if (/[{};=<>]|=>|\bfunction\b|\breturn\b/.test(s)) continue; // code, not copy
    if (WORDS.test(s)) hits.push(`${file}: "${s.slice(0, 120)}"`);
  }
}

function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) scanText(p.slice(root.length), readFileSync(p, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ''));
    else if (f.endsWith('.js')) scanBundle(p.slice(root.length), readFileSync(p, 'utf8'));
  }
}

const copyFile = join(root, 'src/copy.ts');
if (existsSync(copyFile)) {
  const src = readFileSync(copyFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  scanText('src/copy.ts', src);
}
scanText('index.html', readFileSync(join(root, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ''));
if (existsSync(join(root, 'dist'))) walk(join(root, 'dist'));
else console.log('  (no dist/ yet: run npm run build first for the full check)');

for (const h of hits) console.log('  ' + h);
console.log(hits.length ? `\nLABELS CHECK: FAIL (${hits.length})` : 'LABELS CHECK: PASS');
process.exit(hits.length ? 1 : 0);
