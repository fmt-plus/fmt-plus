// A WebSocket client that stays connected (Node 22+ global WebSocket): exponential back-off with jitter, a stall
// watchdog (no message for `stallMs` = reconnect) and onOpen called on every (re)connect so the caller subscribes again.
import { log } from './log.mjs';

export function createWs({ name, url, onOpen, onMessage, stallMs = 60_000, WebSocketImpl = globalThis.WebSocket }) {
  let ws = null;
  let stopped = true;
  let tries = 0;
  let retryTimer = null;
  let watch = null;
  const stats = { connects: 0, messages: 0, connectedAt: 0, lastMsgAt: 0, lastError: null };

  function schedule() {
    if (stopped) return;
    clearTimeout(retryTimer);
    const ms = Math.round(Math.min(60_000, 1000 * 2 ** tries++) * (0.75 + Math.random() * 0.5));
    retryTimer = setTimeout(connect, ms);
    retryTimer.unref?.();
  }

  function connect() {
    if (stopped) return;
    let sock;
    try {
      sock = new WebSocketImpl(url);
    } catch (e) {
      stats.lastError = String(e?.message ?? e).slice(0, 160);
      schedule();
      return;
    }
    ws = sock;
    const t0 = Date.now();
    sock.onopen = () => {
      if (ws !== sock) return;
      stats.connects++;
      stats.connectedAt = stats.lastMsgAt = Date.now();
      log(`${name}.open`, { ms: Date.now() - t0 });
      try {
        onOpen?.(send);
      } catch (e) {
        stats.lastError = String(e?.message ?? e).slice(0, 160);
      }
    };
    sock.onmessage = (m) => {
      if (ws !== sock) return;
      stats.messages++;
      stats.lastMsgAt = Date.now();
      let d;
      try {
        d = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString('utf8'));
      } catch {
        return;
      }
      try {
        onMessage?.(d);
      } catch (e) {
        stats.lastError = String(e?.message ?? e).slice(0, 160);
      }
    };
    sock.onerror = (e) => {
      if (ws === sock) stats.lastError = String(e?.message ?? 'socket error').slice(0, 160);
    };
    sock.onclose = (e) => {
      if (ws !== sock) return;
      ws = null;
      if (stats.connectedAt && Date.now() - stats.connectedAt > 60_000) tries = 0;
      log(`${name}.close`, { code: e?.code });
      schedule();
    };
  }

  function send(obj) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }

  function restart(reason) {
    log(`${name}.restart`, { reason });
    const s = ws;
    ws = null;
    try {
      s?.close();
    } catch {
      // closed already
    }
    schedule();
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      connect();
      watch = setInterval(() => {
        if (stopped || !ws) return;
        if (ws.readyState === 1 && Date.now() - stats.lastMsgAt > stallMs) restart('stall');
      }, Math.max(1000, Math.min(10_000, stallMs / 3)));
      watch.unref?.();
    },
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(watch);
      try {
        ws?.close();
      } catch {
        // closed already
      }
      ws = null;
    },
    send,
    status: () => ({ connected: !!ws && ws.readyState === 1, ...stats }),
  };
}
