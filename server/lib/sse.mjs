// Server-Sent Events hub with a ring buffer. publish(type, data) sends `event: <type>` with an id to every client and
// keeps the last `ring` events, so a client that reconnects with Last-Event-ID (or ?after=<id>) gets the gap replayed.
// Ids are "<boot>.<n>": after a restart old ids replay nothing and the client re-reads /api/snapshot.
// Unbuffered through proxies: no compression, `x-accel-buffering: no`, a 2 KB comment first, Nagle off, and an
// `event: ping` every 15 s (a named event, so the browser's watchdog sees it; comments are invisible to EventSource).

export function frame(type, data, id) {
  let out = '';
  if (id) out += `id: ${id}\n`;
  if (type) out += `event: ${type}\n`;
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  for (const l of text.split('\n')) out += `data: ${l}\n`;
  return out + '\n';
}

export function createHub({ ring = 500, maxClients = 5000, maxPerIp = 16, pingMs = 15_000, maxBuffered = 1_000_000 } = {}) {
  const boot = Date.now().toString(36);
  let n = 0;
  const buf = [];
  const clients = new Set();
  const perIp = new Map();
  let sent = 0;
  let dropped = 0;

  function write(c, text) {
    const { res } = c;
    if (res.writableEnded || res.destroyed) return;
    if (res.writableLength > maxBuffered) {
      dropped++;
      res.destroy(); // a client that stopped reading reconnects and replays
      return;
    }
    res.write(text);
    sent++;
  }

  function publish(type, data) {
    const id = `${boot}.${++n}`;
    const ev = { id, type, data };
    buf.push(ev);
    if (buf.length > ring) buf.splice(0, buf.length - ring);
    if (clients.size) {
      const text = frame(type, data, id);
      for (const c of clients) if (!c.types || c.types.has(type)) write(c, text);
    }
    return id;
  }

  /** Events after `id` (same boot only), oldest first. */
  function after(id) {
    if (typeof id !== 'string' || !id.startsWith(boot + '.')) return [];
    const k = Number(id.slice(boot.length + 1));
    return buf.filter((e) => Number(e.id.slice(boot.length + 1)) > k);
  }

  /** Opens a stream. Returns false when a limit says no (the caller answers 429). */
  function open(req, res, { ip = '', lastId = '', types = null } = {}) {
    const k = perIp.get(ip) ?? 0;
    if (clients.size >= maxClients || k >= maxPerIp) return false;
    perIp.set(ip, k + 1);
    req.socket.setNoDelay?.(true);
    req.socket.setKeepAlive?.(true, 30_000);
    req.socket.setTimeout?.(0);
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.flushHeaders?.();
    const c = { res, ip, types: types && types.size ? types : null };
    clients.add(c);
    res.write(`: ok${' '.repeat(2048)}\n\nretry: 3000\n\n`);
    for (const ev of after(lastId)) if (!c.types || c.types.has(ev.type)) write(c, frame(ev.type, ev.data, ev.id));
    const done = () => {
      if (!clients.delete(c)) return;
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left <= 0) perIp.delete(ip);
      else perIp.set(ip, left);
    };
    req.on('close', done);
    res.on('close', done);
    res.on('error', done);
    return true;
  }

  const ping = setInterval(() => {
    const text = frame('ping', Date.now());
    for (const c of clients) write(c, text);
  }, pingMs);
  ping.unref?.();

  function close() {
    clearInterval(ping);
    for (const c of clients) c.res.end();
    clients.clear();
  }

  const status = () => ({ clients: clients.size, ips: perIp.size, buffered: buf.length, sent, dropped });
  return { publish, open, after, close, status, get lastId() {
    return buf.length ? buf[buf.length - 1].id : '';
  } };
}
