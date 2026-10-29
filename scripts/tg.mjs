#!/usr/bin/env node
// Load the Telegram bot token: npm run tg -- <token>
// Checks it with getMe, saves data/telegram.json (0600, gitignored). Restart the server to pick it up.
// On the VPS the same file lives in the release's shared data dir (or set TG_BOT_TOKEN in the service env).
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const token = (process.argv[2] || '').trim();
if (!/^\d+:[\w-]{30,}$/.test(token)) {
  console.error('usage: npm run tg -- <bot token from @BotFather>');
  process.exit(1);
}
const r = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((x) => x.json()).catch(() => null);
if (!r?.ok) {
  console.error('Telegram rejected this token:', r?.description ?? 'network error');
  process.exit(1);
}
const dir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(dir, { recursive: true });
const file = join(dir, 'telegram.json');
writeFileSync(file, JSON.stringify({ token, username: r.result.username, at: new Date().toISOString() }, null, 2) + '\n');
chmodSync(file, 0o600);
console.log(`✓ @${r.result.username} saved to ${file}`);
console.log('  prod: put TG_BOT_TOKEN in /etc/<slug>/server.env · local: TG_DEV=1 npm run dev');
