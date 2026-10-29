// Sign-In With Solana: POST /api/auth/nonce → the wallet signs the server's message (free, no transaction) →
// POST /api/auth/verify → a 24 h bearer token, kept in localStorage per wallet address.
import { createStore, storage } from './store.ts';
import { api, setAuth } from './http.ts';
import { b58encode } from './base58.ts';
import { wallet, signMessage } from './wallet.ts';

interface Session {
  address: string;
  token: string;
  exp: number;
}

const KEY = 'tk.session';

function load(): Session | null {
  const s = storage.get<Session>(KEY);
  return s && typeof s.token === 'string' && s.exp > Date.now() + 60000 ? s : null;
}

export const session = createStore<{ s: Session | null; busy: boolean }>({ s: load(), busy: false });

function save(s: Session | null): void {
  session.set({ s });
  if (s) storage.set(KEY, s);
  else storage.remove(KEY);
}

/** The token, only while it belongs to the connected wallet. */
export function token(): string | null {
  const s = session.get().s;
  const a = wallet.get().account;
  if (!s || !a || s.address !== a || s.exp < Date.now() + 30000) return null;
  return s.token;
}

export const signedIn = (): boolean => !!token();

setAuth(token, () => save(null));

// another wallet: its own session (or none)
wallet.subscribe(() => {
  const s = session.get().s;
  const a = wallet.get().account;
  if (s && a && s.address !== a) save(null);
});

let inflight: Promise<string> | null = null;

/** One signature unless a session is already there. Resolves to the token. */
export function signIn(): Promise<string> {
  const t = token();
  if (t) return Promise.resolve(t);
  if (inflight) return inflight;
  inflight = (async () => {
    const address = wallet.get().account;
    if (!address) throw new Error('no wallet');
    session.set({ busy: true });
    try {
      const n = await api<{ nonce: string; message: string }>('/auth/nonce', { body: { address }, auth: false });
      const sig = await signMessage(new TextEncoder().encode(n.message));
      const v = await api<{ token: string; exp: number; address: string }>('/auth/verify', {
        body: { address, nonce: n.nonce, signature: b58encode(sig) },
        auth: false,
      });
      save({ address, token: v.token, exp: v.exp });
      return v.token;
    } finally {
      session.set({ busy: false });
      inflight = null;
    }
  })();
  return inflight;
}

export async function signOut(): Promise<void> {
  if (token()) await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
  save(null);
}
