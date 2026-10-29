#!/usr/bin/env node
// fmt+ MCP server (stdio, JSON-RPC 2.0, zero dependencies). Read-only: it never asks for keys or signs anything.
//   npx fmt-plus          run as an MCP server over stdio. Remote, no install: https://mcp.fmt.plus
//   npx fmt-plus skill    print the Agent Skill (SKILL.md)
// Data: the fmt+ API (FMT_API, default https://fmt.plus/api), which reads Solana via Helius.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { handle } from './core.mjs';

const API = (process.env.FMT_API || 'https://fmt.plus/api').replace(/\/+$/, '');

if (process.argv[2] === 'skill') {
  process.stdout.write(readFileSync(new URL('./SKILL.md', import.meta.url), 'utf8'));
  process.exit(0);
}

const get = async (p) => {
  const r = await fetch(API + p, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`fmt+ API ${r.status}`);
  return r.json();
};

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const out = await handle(msg, get);
  if (out) send(out);
});
