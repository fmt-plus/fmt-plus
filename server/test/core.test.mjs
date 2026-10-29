// Core server checks: node --test server/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { b58decode, b58encode, isAddress } from '../lib/base58.mjs';
import { verifySolana } from '../lib/auth.mjs';
import { badCoin, cleanText, hasSlur, maskSlurs } from '../lib/moderate.mjs';
import { createHub } from '../lib/sse.mjs';
import { createApp } from '../lib/app.mjs';

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { address: b58encode(raw), sign: (msg) => sign(null, Buffer.from(msg, 'utf8'), privateKey) };
}

test('base58 round trip and address check', () => {
  const bytes = Uint8Array.from([0, 0, 1, 2, 3, 255, 128, 64]);
  assert.deepEqual([...b58decode(b58encode(bytes))], [...bytes]);
  assert.equal(isAddress('So11111111111111111111111111111111111111112'), true);
  assert.equal(isAddress('So1111111111111111111111111111111111111111'), false);
  assert.equal(isAddress('0OIl' + 'a'.repeat(40)), false);
  assert.throws(() => b58decode('0'));
});

test('ed25519 verify with a raw key in DER', () => {
  const k = keypair();
  const sig = k.sign('hello');
  assert.equal(verifySolana('hello', b58encode(sig), k.address), true);
  assert.equal(verifySolana('hello', sig.toString('base64'), k.address), true);
  assert.equal(verifySolana('hellp', b58encode(sig), k.address), false);
  assert.equal(verifySolana('hello', b58encode(sig), keypair().address), false);
});

test('moderation', () => {
  assert.equal(hasSlur('N.1.G.G.E.R coin'), true);
  assert.equal(hasSlur('Ku Klux Kat'), true);
  assert.equal(hasSlur('spice pakistan niggle'), false);
  assert.equal(maskSlurs('good nazi dog'), 'good •••• dog');
  assert.deepEqual(cleanText('  hi   there '), { ok: true, text: 'hi there' });
  assert.equal(cleanText('').reason, 'empty');
  assert.equal(cleanText('x'.repeat(300)).reason, 'long');
  assert.equal(cleanText('buy at scam.xyz').reason, 'link');
  assert.equal(badCoin({ name: 'STOP FEEDING JEW PROSPER', symbol: 'cheese' }), true);
  assert.equal(badCoin({ name: 'Jewel Cat', symbol: 'JWL' }), false);
  assert.equal(badCoin({ name: 'Magic Internet Cat', symbol: 'MIC' }), false);
});

test('sse ring buffer replays after an id', () => {
  const hub = createHub({ ring: 3 });
  const a = hub.publish('x', 1);
  hub.publish('x', 2);
  hub.publish('x', 3);
  hub.publish('x', 4);
  assert.deepEqual(hub.after(a).map((e) => e.data), [2, 3, 4].slice(-3));
  assert.deepEqual(hub.after('old.1'), []);
  hub.close();
});

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tk-test-'));
  const routes = mkdtempSync(join(tmpdir(), 'tk-routes-'));
  writeFileSync(
    join(routes, 'hello.mjs'),
    "export default (ctx) => { ctx.route('GET', '/api/hello/:who', (req, res, c) => ({ hi: c.params.who })); ctx.snapshot('hello', async () => 42); ctx.health('hello', () => ({ ok: true })); };",
  );
  const app = await createApp({ name: 'Testapp', dataDir: dir, origin: 'https://example.fun', sessionHours: 24, env: {} }, { routesDir: routes });
  const server = http.createServer(async (req, res) => {
    if (!(await app.router.handle(req, res))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json() };
  };
  try {
    await fn({ call, dir });
  } finally {
    server.close();
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
    rmSync(routes, { recursive: true, force: true });
  }
}

test('api: health, snapshot, module route, token off', async () => {
  await withServer(async ({ call }) => {
    const h = await call('/api/health');
    assert.equal(h.json.ok, true);
    assert.equal(h.json.modules.hello, 'ok');
    const s = await call('/api/snapshot');
    assert.equal(s.json.hello, 42);
    assert.deepEqual(s.json.token, { on: false });
    assert.deepEqual((await call('/api/hello/sol')).json, { hi: 'sol' });
    assert.equal((await call('/api/me')).status, 401);
  });
});

test('api: token card reads data/token.json', async () => {
  await withServer(async ({ call, dir }) => {
    writeFileSync(join(dir, 'token.json'), JSON.stringify({ ca: 'not-an-address' }));
    assert.deepEqual((await call('/api/snapshot')).json.token, { on: false });
  });
});

test('api: sign in with Solana, single-use nonce, session, logout', async () => {
  await withServer(async ({ call }) => {
    const k = keypair();
    const n = await call('/api/auth/nonce', { method: 'POST', body: { address: k.address } });
    assert.equal(n.status, 200);
    assert.match(n.json.message, /^example\.fun wants you to sign in with your Solana account:\n/);
    assert.match(n.json.message, /free and sends no transaction/);
    const bad = await call('/api/auth/verify', { method: 'POST', body: { address: k.address, nonce: n.json.nonce, signature: b58encode(k.sign('other')) } });
    assert.equal(bad.status, 401);
    // the nonce is gone after one try
    const again = await call('/api/auth/verify', { method: 'POST', body: { address: k.address, nonce: n.json.nonce, signature: b58encode(k.sign(n.json.message)) } });
    assert.equal(again.json.error, 'nonce');
    const n2 = await call('/api/auth/nonce', { method: 'POST', body: { address: k.address } });
    const v = await call('/api/auth/verify', { method: 'POST', body: { address: k.address, nonce: n2.json.nonce, signature: b58encode(k.sign(n2.json.message)) } });
    assert.equal(v.status, 200);
    assert.ok(v.json.exp > Date.now() + 23 * 3600e3);
    const me = await call('/api/me', { token: v.json.token });
    assert.equal(me.json.address, k.address);
    await call('/api/auth/logout', { method: 'POST', token: v.json.token });
    assert.equal((await call('/api/me', { token: v.json.token })).status, 401);
  });
});
