#!/usr/bin/env node
// npm run dev: the API server (restarts on server/ changes) and the Vite dev server together, one Ctrl-C stops both.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));
const { webPort, apiPort } = pkg.trench ?? {};
const kids = [];

function run(name, color, cmd, args) {
  const p = spawn(cmd, args, { cwd: root, env: { ...process.env, FORCE_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${color}m${name.padEnd(6)}\x1b[0m `;
  const out = (s) => s.toString().split('\n').filter(Boolean).forEach((l) => process.stdout.write(tag + l + '\n'));
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  p.on('exit', (code) => {
    process.stdout.write(tag + `exited (${code})\n`);
    stop(code ?? 0);
  });
  kids.push(p);
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const k of kids) k.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

run('api', '36', process.execPath, ['--disable-warning=ExperimentalWarning', '--watch-path=server', 'server/main.mjs']);
run('web', '35', process.execPath, ['node_modules/vite/bin/vite.js']);
console.log(`\n  app  http://127.0.0.1:${webPort}/\n  api  http://127.0.0.1:${apiPort}/api/health\n`);
