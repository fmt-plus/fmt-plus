// Sign-In With Solana, zero dependencies.
//   POST /api/auth/nonce  { address }                       → { nonce, message, expiresAt }
//   POST /api/auth/verify { address, nonce, signature }     → { token, address, exp }
// The wallet signs the exact message text (signMessage, no transaction, no fee). The nonce is single use and lives
// 10 minutes. The signature is ed25519 over the UTF-8 bytes, checked with node:crypto: the 32-byte public key is
// wrapped in its DER (SPKI) header. Sessions are random bearer tokens; only their sha256 is stored (SESSION_HOURS).
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { b58decode, isAddress } from './base58.mjs';

export const NONCE_TTL_MS = 10 * 60_000;
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** The text the wallet shows (SIWS / CAIP-122 layout). */
export function buildMessage({ domain, address, statement, uri, nonce, issuedAt, expirationTime }) {
  return [
    `${domain} wants you to sign in with your Solana account:`,
    address,
    '',
    statement,
    '',
    `URI: ${uri}`,
    'Version: 1',
    'Chain ID: mainnet',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join('\n');
}

/** Signature bytes from base58, base64 or hex (wallets and clients differ). */
export function decodeSignature(v) {
  if (typeof v !== 'string' || !v) return null;
  if (/^(0x)?[0-9a-fA-F]{128}$/.test(v)) return Buffer.from(v.replace(/^0x/, ''), 'hex');
  try {
    const b = b58decode(v);
    if (b.length === 64) return Buffer.from(b);
  } catch {
    // not base58
  }
  try {
    const b = Buffer.from(v, 'base64');
    if (b.length === 64) return b;
  } catch {
    // not base64
  }
  return null;
}

/** ed25519 check of `message` (string or bytes) by `address` (base58 public key). */
export function verifySolana(message, signature, address) {
  try {
    if (!isAddress(address)) return false;
    const sig = typeof signature === 'string' ? decodeSignature(signature) : Buffer.from(signature);
    if (!sig || sig.length !== 64) return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(b58decode(address))]), format: 'der', type: 'spki' });
    const bytes = typeof message === 'string' ? Buffer.from(message, 'utf8') : Buffer.from(message);
    return verify(null, bytes, key, sig);
  } catch {
    return false;
  }
}

export function createAuth({ db, name = 'the app', origin = '', sessionHours = 24, now = () => Date.now() }) {
  const nonces = new Map();
  const sessionMs = Math.round(sessionHours * 3_600_000);
  const statement = `Sign in to ${name}. This is free and sends no transaction.`;

  function sweep(t) {
    if (nonces.size < 5000) return;
    for (const [k, v] of nonces) if (v.exp < t) nonces.delete(k);
    while (nonces.size > 20_000) nonces.delete(nonces.keys().next().value);
  }

  /** `siteOrigin`: the public origin this request came through (ORIGIN in production, else the request's host). */
  function challenge(address, siteOrigin) {
    if (!isAddress(address)) return null;
    const t = now();
    sweep(t);
    const base = new URL(origin || siteOrigin || 'http://localhost');
    const nonce = randomBytes(12).toString('hex');
    const message = buildMessage({
      domain: base.host,
      address,
      statement,
      uri: base.origin,
      nonce,
      issuedAt: new Date(t).toISOString(),
      expirationTime: new Date(t + NONCE_TTL_MS).toISOString(),
    });
    nonces.set(nonce, { address, message, exp: t + NONCE_TTL_MS });
    return { nonce, message, expiresAt: t + NONCE_TTL_MS };
  }

  /** Checks the signature; on success opens a session. Returns { token, address, exp } or { error }. */
  function finish({ address, nonce, signature }) {
    const t = now();
    const rec = typeof nonce === 'string' ? nonces.get(nonce) : null;
    if (!rec) return { error: 'nonce' };
    nonces.delete(nonce); // single use, even when the signature is wrong
    if (rec.exp < t) return { error: 'expired' };
    if (rec.address !== address) return { error: 'address' };
    if (!verifySolana(rec.message, signature, address)) return { error: 'signature' };
    const token = randomBytes(32).toString('base64url');
    const exp = t + sessionMs;
    db.tx(() => {
      db.run('INSERT INTO sessions (hash, address, created, exp) VALUES (?, ?, ?, ?)', sha(token), address, t, exp);
      db.run(
        'INSERT INTO users (address, first_seen, last_seen) VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET last_seen = excluded.last_seen',
        address,
        t,
        t,
      );
      db.run('DELETE FROM sessions WHERE exp < ?', t);
    });
    return { token, address, exp };
  }

  /** The signed-in wallet for a request (Authorization: Bearer <token>), or null. */
  function sessionOf(req) {
    const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(String(req.headers.authorization || ''));
    if (!m) return null;
    const row = db.get('SELECT address, exp, created FROM sessions WHERE hash = ?', sha(m[1]));
    if (!row || row.exp < now()) return null;
    return { address: row.address, exp: row.exp, since: row.created, hash: sha(m[1]) };
  }

  function signOut(req) {
    const s = sessionOf(req);
    if (s) db.run('DELETE FROM sessions WHERE hash = ?', s.hash);
    return !!s;
  }

  return { challenge, finish, sessionOf, signOut, statement };
}
