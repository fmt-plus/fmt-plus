#!/usr/bin/env node
// npm run numbers: the docs' numbers add up. Runs src/economics.ts in plain Node (type stripping):
//  1. every invariant in checks() holds for the EXAMPLE
//  2. every row of exampleRows() is a finite, non-negative number with a label in copy.docs
//  3. copy.docs holds no typed numbers (they must come from economics.ts)
// Exit 1 on any failure (gates the release).
const root = new URL('..', import.meta.url);
const eco = await import(new URL('src/economics.ts', root).href);
const { copy } = await import(new URL('src/copy.ts', root).href);

let fail = false;
const ok = (what, holds) => {
  console.log(`${holds ? '  ok  ' : '  FAIL'}  ${what}`);
  if (!holds) fail = true;
};

if (typeof eco.checks !== 'function') ok('src/economics.ts exports checks()', false);
else for (const [what, holds] of eco.checks()) ok(what, !!holds);

if (typeof eco.exampleRows === 'function') {
  const rows = eco.exampleRows();
  const labels = copy?.docs?.example?.rows ?? {};
  console.log('\n  worked example');
  for (const r of rows) {
    const label = labels[r.key];
    console.log(`    ${String(label ?? '(no label)').padEnd(28)} ${r.unit === 'usd' ? '$' : ''}${Number(r.value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
    if (!label) ok(`row "${r.key}" has a label in copy.docs.example.rows`, false);
    if (!Number.isFinite(r.value) || r.value < 0) ok(`row "${r.key}" is a finite, non-negative number`, false);
  }
  console.log('');
}

const typed = [];
(function walk(v, path) {
  if (typeof v === 'string') {
    if (/\d/.test(v.replace(/\{\w+\}/g, ''))) typed.push(`${path}: "${v}"`);
  } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
})(copy?.docs, 'copy.docs');
ok('copy.docs has no typed numbers (they come from economics.ts)', typed.length === 0);
for (const t of typed) console.log('        ' + t);

console.log(fail ? '\nNUMBERS CHECK: FAIL' : '\nNUMBERS CHECK: PASS');
process.exit(fail ? 1 : 0);
