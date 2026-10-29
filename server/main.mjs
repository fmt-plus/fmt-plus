// The product server: node --disable-warning=ExperimentalWarning server/main.mjs
// Loopback only; Caddy proxies https://<domain>/api/* here and serves the built app itself.
// Settings: server/lib/config.mjs. Product endpoints: server/routes/*.mjs (see server/lib/app.mjs).
import http from 'node:http';
import { loadConfig } from './lib/config.mjs';
import { createApp } from './lib/app.mjs';
import { sendJson, staticHandler } from './lib/http.mjs';
import { log } from './lib/log.mjs';

const cfg = loadConfig();
const app = await createApp(cfg);
const serveStatic = cfg.staticDir ? staticHandler(cfg.staticDir) : null;

const server = http.createServer(async (req, res) => {
  if (await app.router.handle(req, res)) return;
  if (serveStatic && serveStatic(req, res)) return;
  sendJson(res, 404, { error: 'notFound' });
});
server.keepAliveTimeout = 65_000;
server.requestTimeout = 0; // SSE streams stay open

server.listen(cfg.port, cfg.host, () => {
  log('server.listen', { host: cfg.host, port: cfg.port, data: cfg.dataDir, static: cfg.staticDir || null, modules: app.modules });
});

let stopping = false;
const stop = (sig) => {
  if (stopping) return;
  stopping = true;
  log('server.stop', { sig });
  server.close();
  void app.stop().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
