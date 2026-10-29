import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';

// Ports come from package.json "trench" (picked by `trench init` so products never collide).
//   npm run dev       server (API on apiPort) + this dev server (webPort) with /api proxied, SSE unbuffered
//   npm run build     dist/ (Caddy serves it in production; `npm start` serves it locally on apiPort)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { trench: { webPort: number; apiPort: number } };
const API = process.env.API_URL || `http://127.0.0.1:${pkg.trench.apiPort}`;

// index.html takes its brand bits (%TK_NAME%, %TK_BG%, …) from src/brand.json (written by scripts/brand.mjs), the icon
// links from the files that exist in public/ (scripts/assets.mjs), with ?v=<src/assets.json v> so browsers refetch.
function brandHtml(): Plugin {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  return {
    name: 'trench-brand-html',
    transformIndexHtml: {
      order: 'pre', // before Vite's own %ENV% replacement
      handler(html) {
        const b = JSON.parse(readFileSync(new URL('./src/brand.json', import.meta.url), 'utf8'));
        const assets = new URL('./src/assets.json', import.meta.url);
        const ver = existsSync(assets) ? String(JSON.parse(readFileSync(assets, 'utf8')).v ?? '1') : '1';
        const has = (f: string) => existsSync(new URL(`./public/${f}`, import.meta.url));
        const icons = [
          has('favicon.ico') && `<link rel="icon" href="/favicon.ico?v=${ver}" sizes="48x48" />`,
          has('favicon.svg') && `<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=${ver}" />`,
          has('apple-touch-icon.png') && `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=${ver}" />`,
          has('site.webmanifest') && `<link rel="manifest" href="/site.webmanifest?v=${ver}" />`,
        ].filter(Boolean);
        const v: Record<string, string> = {
          NAME: esc(b.name),
          TAGLINE: esc(b.tagline),
          DOMAIN: esc(b.domain),
          X: esc(b.x),
          THEME: esc(b.theme),
          BG: esc(b.palette.bg),
          SURFACE: esc(b.palette.surface),
          SURFACE2: esc(b.surface2),
          ACCENT: esc(b.palette.accent),
          FONT_LINKS: (b.fontLinks ?? []).join(''),
          ICON_LINKS: icons.join('\n    '),
          ASSET_V: esc(ver),
        };
        return html.replace(/%TK_([A-Z0-9_]+)%/g, (m, k: string) => (k in v ? v[k] : m));
      },
    },
  };
}

export default defineConfig({
  plugins: [brandHtml(), react()],
  server: {
    host: '127.0.0.1',
    port: pkg.trench.webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: API,
        timeout: 0,
        proxyTimeout: 0,
        configure: (p) => {
          p.on('proxyRes', (res) => {
            if (String(res.headers['content-type'] || '').includes('text/event-stream')) {
              res.headers['cache-control'] = 'no-cache, no-transform';
              res.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
  preview: { host: '127.0.0.1', port: pkg.trench.webPort, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 600 },
});
