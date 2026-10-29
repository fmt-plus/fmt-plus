// Solana wallets, Phantom first. Discovery through the Wallet Standard (Phantom, Solflare, Backpack and any wallet
// that registers itself), plus Phantom's legacy window.phantom.solana when it is the only thing injected.
// No wallet in this browser: phones open the page in Phantom's in-app browser (deeplink.ts); desktops get Phantom.
import { createStore, storage } from './store.ts';

interface StdAccount {
  address: string;
  publicKey: Uint8Array;
  chains: readonly string[];
  features: readonly string[];
}
interface StdWallet {
  name: string;
  icon: string;
  version: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, unknown>;
}
interface StdConnect {
  connect(input?: { silent?: boolean }): Promise<{ accounts: readonly StdAccount[] }>;
}
interface StdDisconnect {
  disconnect(): Promise<void>;
}
interface StdEvents {
  on(event: 'change', fn: (p: { accounts?: readonly StdAccount[] }) => void): () => void;
}
interface StdSignMessage {
  signMessage(...inputs: Array<{ account: StdAccount; message: Uint8Array }>): Promise<Array<{ signedMessage: Uint8Array; signature: Uint8Array }>>;
}
interface LegacyKey {
  toBase58(): string;
}
interface LegacyPhantom {
  isPhantom?: boolean;
  publicKey?: LegacyKey | null;
  connect(o?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: LegacyKey }>;
  disconnect(): Promise<void>;
  signMessage(m: Uint8Array, display?: 'utf8'): Promise<{ signature: Uint8Array }>;
  on?(ev: 'accountChanged' | 'disconnect', fn: (k?: LegacyKey | null) => void): void;
}

export interface WalletInfo {
  id: string;
  name: string;
  icon: string;
}

interface WState {
  wallets: WalletInfo[];
  /** Discovery had its chance (wallets inject at load). */
  ready: boolean;
  account: string | null;
  walletId: string | null;
  connecting: boolean;
}

export const wallet = createStore<WState>({ wallets: [], ready: false, account: null, walletId: null, connecting: false });

const KEY = 'tk.wallet';
const ORDER = ['phantom', 'solflare', 'backpack'];
const std = new Map<string, StdWallet>();
let current: { id: string; account?: StdAccount; off?: () => void } | null = null;
let started = false;

const idOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const rank = (id: string) => {
  const i = ORDER.indexOf(id);
  return i < 0 ? ORDER.length : i;
};

function legacy(): LegacyPhantom | null {
  const p = (window as Window & { phantom?: { solana?: LegacyPhantom } }).phantom?.solana;
  return p && p.isPhantom ? p : null;
}

function isSolana(w: StdWallet): boolean {
  return (
    !!w &&
    Array.isArray(w.chains) &&
    w.chains.some((c) => String(c).startsWith('solana:')) &&
    !!w.features?.['standard:connect'] &&
    !!w.features?.['solana:signMessage']
  );
}

function publish(): void {
  const list: WalletInfo[] = [...std.values()].map((w) => ({ id: idOf(w.name), name: w.name, icon: w.icon }));
  if (!list.some((w) => w.id === 'phantom') && legacy()) list.push({ id: 'phantom', name: 'Phantom', icon: '' });
  list.sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
  wallet.set({ wallets: list });
}

function setAccount(id: string | null, address: string | null): void {
  wallet.set({ account: address, walletId: address ? id : null, connecting: false });
  if (address && id) storage.set(KEY, { id });
}

/** Starts discovery and reconnects a wallet that said yes before (no prompt). Call once at boot. */
export function startWallets(): void {
  if (started) return;
  started = true;
  const api = Object.freeze({
    register(...ws: StdWallet[]) {
      for (const w of ws) if (isSolana(w)) std.set(idOf(w.name), w);
      publish();
      return () => {
        for (const w of ws) std.delete(idOf(w.name));
        publish();
      };
    },
  });
  window.addEventListener('wallet-standard:register-wallet', (e) => {
    try {
      (e as CustomEvent<(a: typeof api) => void>).detail(api);
    } catch {
      // a broken wallet must not break the app
    }
  });
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch {
    // ignore
  }
  // legacy Phantom injects at load: look a few times
  let tries = 0;
  const look = () => {
    publish();
    if (++tries < 6 && !wallet.get().wallets.length) window.setTimeout(look, 150);
    else {
      wallet.set({ ready: true });
      const kept = storage.get<{ id: string }>(KEY);
      if (kept?.id) void connect(kept.id, true).catch(() => storage.remove(KEY));
    }
  };
  look();
}

/** The id Connect should use: Phantom when present, else the first wallet, else null (no wallet here). */
export function preferred(): string | null {
  const ws = wallet.get().wallets;
  return ws.find((w) => w.id === 'phantom')?.id ?? ws[0]?.id ?? null;
}

/** Connects a wallet; `silent` reconnects only one that already trusts this site. Resolves to the address. */
export async function connect(id = preferred() ?? 'phantom', silent = false): Promise<string> {
  wallet.set({ connecting: !silent });
  try {
    current?.off?.();
    const w = std.get(id);
    if (w) {
      const res = await (w.features['standard:connect'] as StdConnect).connect(silent ? { silent: true } : undefined);
      const accs = res?.accounts?.length ? res.accounts : w.accounts;
      const acc = accs.find((a) => a.chains?.some((c) => String(c).startsWith('solana:'))) ?? accs[0];
      if (!acc) throw Object.assign(new Error('no account'), { code: 4001 });
      const events = w.features['standard:events'] as StdEvents | undefined;
      const off = events?.on('change', ({ accounts }) => {
        if (!accounts) return;
        const next = accounts[0];
        if (!next) void disconnect();
        else if (current?.id === id) {
          current.account = next;
          setAccount(id, next.address);
        }
      });
      current = { id, account: acc, off };
      setAccount(id, acc.address);
      return acc.address;
    }
    const p = id === 'phantom' ? legacy() : null;
    if (!p) throw new Error('no wallet');
    const r = await p.connect(silent ? { onlyIfTrusted: true } : undefined);
    const address = r.publicKey.toBase58();
    p.on?.('accountChanged', (k) => (k ? setAccount('phantom', k.toBase58()) : void disconnect()));
    p.on?.('disconnect', () => setAccount(null, null));
    current = { id };
    setAccount(id, address);
    return address;
  } finally {
    wallet.set({ connecting: false });
  }
}

/** Signs bytes (the sign-in text). */
export async function signMessage(message: Uint8Array): Promise<Uint8Array> {
  if (!current) throw new Error('no wallet');
  const w = std.get(current.id);
  if (w && current.account) {
    const [out] = await (w.features['solana:signMessage'] as StdSignMessage).signMessage({ account: current.account, message });
    return out.signature;
  }
  const p = legacy();
  if (!p) throw new Error('no wallet');
  const { signature } = await p.signMessage(message, 'utf8');
  return signature;
}

export async function disconnect(): Promise<void> {
  const c = current;
  current = null;
  c?.off?.();
  setAccount(null, null);
  storage.remove(KEY);
  try {
    const w = c ? std.get(c.id) : undefined;
    if (w) await (w.features['standard:disconnect'] as StdDisconnect | undefined)?.disconnect();
    else if (c?.id === 'phantom') await legacy()?.disconnect();
  } catch {
    // the wallet may be gone already
  }
}

/** The user said no in the wallet (code 4001 or a "rejected" message). */
export function isRejection(e: unknown): boolean {
  const x = e as { code?: number; message?: string; name?: string } | null;
  if (!x) return false;
  if (x.code === 4001) return true;
  return /reject|denied|declin|cancel|closed/i.test(`${x.message ?? ''} ${x.name ?? ''}`);
}
