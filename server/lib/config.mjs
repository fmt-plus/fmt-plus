// Server settings. Everything has a working default for local runs; production pins them in the systemd unit.
//   PORT        API port (default: package.json trench.apiPort)
//   HOST        bind address (default 127.0.0.1; Caddy is the only public door)
//   DATA_DIR    sqlite, token.json, AI ledger (default <project>/data)
//   STATIC_DIR  serve a built app from here too (local `npm start`; Caddy serves it in production)
//   ORIGIN      the public site, e.g. https://example.fun (names the domain in the sign-in message)
//   RELEASE     release id, shown in /api/health
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = resolve(SERVER_DIR, '..');

function readPkg() {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** The release id when running from /srv/<slug>/releases/<UTC> (via the `current` symlink). */
function releaseId() {
  try {
    return /releases\/(\d{14})$/.exec(realpathSync(ROOT))?.[1] ?? '';
  } catch {
    return '';
  }
}

export function loadConfig(env = process.env) {
  const pkg = readPkg();
  const t = pkg.trench ?? {};
  const port = Number(env.PORT) || Number(t.apiPort) || 5301;
  const prod = env.NODE_ENV === 'production';
  const origin = String(env.ORIGIN || (t.domain && prod ? `https://${t.domain}` : '')).replace(/\/+$/, '');
  return {
    name: t.name || pkg.name || 'app',
    slug: t.slug || pkg.name || 'app',
    port,
    host: env.HOST || '127.0.0.1',
    prod,
    dataDir: resolve(env.DATA_DIR || join(ROOT, 'data')),
    staticDir: env.STATIC_DIR ? resolve(ROOT, env.STATIC_DIR) : '',
    origin,
    release: env.RELEASE || releaseId(),
    sessionHours: Number(env.SESSION_HOURS) || 24,
    env,
  };
}
