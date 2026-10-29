// QA ONLY (scripts/shots.mjs injects it with addInitScript; the app never ships it).
// A stand-in Phantom: registers itself through the Wallet Standard and as legacy window.phantom.solana, holds an
// ed25519 key in WebCrypto (kept in localStorage, so a reload is the same wallet) and signs messages for real, so the
// server's Sign-In With Solana check runs end to end. window.__stubReject = true makes the next request fail like a
// user saying no (code 4001). Counters: window.__stubWallet.
(() => {
  if (!globalThis.crypto?.subtle || location.protocol === 'about:') return;
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const b58 = (bytes) => {
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    const d = [];
    for (let i = zeros; i < bytes.length; i++) {
      let c = bytes[i];
      for (let j = 0; j < d.length; j++) {
        c += d[j] << 8;
        d[j] = c % 58;
        c = (c / 58) | 0;
      }
      while (c) {
        d.push(c % 58);
        c = (c / 58) | 0;
      }
    }
    let s = '1'.repeat(zeros);
    for (let i = d.length - 1; i >= 0; i--) s += A[d[i]];
    return s;
  };
  const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const reject = () => Object.assign(new Error('User rejected the request.'), { code: 4001 });
  const maybeReject = () => {
    if (window.__stubReject) {
      window.__stubReject = false;
      throw reject();
    }
  };

  let priv = null;
  let raw = new Uint8Array(32);
  let address = '';
  window.__stubWallet = { address: '', connects: 0, signs: 0 };
  const ready = (async () => {
    let kept = localStorage.getItem('__stubKey');
    if (!kept) {
      const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
      kept = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
      localStorage.setItem('__stubKey', kept);
    }
    const jwk = JSON.parse(kept);
    priv = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, true, ['sign']);
    raw = fromB64u(jwk.x);
    address = b58(raw);
    window.__stubWallet.address = address;
  })();
  const sign = async (bytes) => new Uint8Array(await crypto.subtle.sign('Ed25519', priv, bytes));
  const TRUST = '__stubTrusted';

  // Wallet Standard
  const listeners = new Set();
  const account = () => ({ address, publicKey: raw, chains: ['solana:mainnet'], features: ['solana:signMessage'] });
  const icon = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#ab9ff2"/><circle cx="26" cy="30" r="5" fill="#fff"/><circle cx="40" cy="30" r="5" fill="#fff"/></svg>');
  const stdWallet = {
    version: '1.0.0',
    name: 'Phantom',
    icon,
    chains: ['solana:mainnet'],
    get accounts() {
      return localStorage.getItem(TRUST) === '1' && address ? [account()] : [];
    },
    features: {
      'standard:connect': {
        version: '1.0.0',
        async connect(input) {
          await ready;
          if (input?.silent && localStorage.getItem(TRUST) !== '1') return { accounts: [] };
          maybeReject();
          localStorage.setItem(TRUST, '1');
          window.__stubWallet.connects++;
          listeners.forEach((fn) => fn({ accounts: [account()] }));
          return { accounts: [account()] };
        },
      },
      'standard:disconnect': {
        version: '1.0.0',
        async disconnect() {
          localStorage.removeItem(TRUST);
          listeners.forEach((fn) => fn({ accounts: [] }));
        },
      },
      'standard:events': {
        version: '1.0.0',
        on(event, fn) {
          if (event !== 'change') return () => undefined;
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      },
      'solana:signMessage': {
        version: '1.0.0',
        async signMessage(...inputs) {
          await ready;
          maybeReject();
          window.__stubWallet.signs++;
          return Promise.all(inputs.map(async ({ message }) => ({ signedMessage: message, signature: await sign(message) })));
        },
      },
    },
  };
  const register = (api) => api.register(stdWallet);
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
  } catch {
    // ignore
  }
  window.addEventListener('wallet-standard:app-ready', (e) => register(e.detail));

  // legacy window.phantom.solana
  const key = () => ({ toBase58: () => address, toString: () => address, toBytes: () => raw });
  let connected = false;
  const legacyListeners = {};
  window.phantom = {
    solana: {
      isPhantom: true,
      get publicKey() {
        return connected ? key() : null;
      },
      async connect(o) {
        await ready;
        if (o?.onlyIfTrusted && localStorage.getItem(TRUST) !== '1') throw reject();
        maybeReject();
        connected = true;
        localStorage.setItem(TRUST, '1');
        return { publicKey: key() };
      },
      async disconnect() {
        connected = false;
        localStorage.removeItem(TRUST);
        (legacyListeners.disconnect || []).forEach((f) => f());
      },
      async signMessage(message) {
        await ready;
        maybeReject();
        window.__stubWallet.signs++;
        return { signature: await sign(message), publicKey: key() };
      },
      on(ev, fn) {
        (legacyListeners[ev] ||= []).push(fn);
      },
    },
  };
})();
