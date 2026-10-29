// Playwright with the system Chrome (no browser download). CHROME=<path> overrides.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export const CHROME = CANDIDATES.find((p) => existsSync(p)) ?? null;

export function launch(opts = {}) {
  if (!CHROME) throw new Error('Chrome not found: set CHROME=/path/to/chrome');
  return chromium.launch({ executablePath: CHROME, headless: true, ...opts });
}
