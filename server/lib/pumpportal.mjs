// PumpPortal data feed (wss://pumpportal.fun/api/data), free and keyless for launches and graduations:
// subscribeNewToken → every new pump.fun coin; subscribeMigration → coins leaving the bonding curve.
// (Trades of chosen coins need a funded PumpPortal key; leave them out unless the product has one.)
// One connection per server, as PumpPortal asks. Subscriptions are sent again on every reconnect.
import { createWs } from './ws.mjs';
import { text } from './market.mjs';

const n = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : null);

/** A launch, normalized. */
export function normCreate(d, t = Date.now()) {
  if (!d?.mint || d.txType !== 'create') return null;
  return {
    mint: String(d.mint),
    name: text(d.name, 48),
    symbol: text(d.symbol, 16),
    creator: d.traderPublicKey ?? null,
    devBuySol: n(d.solAmount) ?? 0,
    mcapSol: n(d.marketCapSol),
    uri: typeof d.uri === 'string' ? d.uri.slice(0, 300) : null,
    pool: d.pool ?? 'pump',
    sig: d.signature ?? null,
    t,
  };
}

export function createPumpPortal({ onCreate, onMigrate, migrations = false, url = 'wss://pumpportal.fun/api/data' } = {}) {
  const counts = { creates: 0, migrations: 0 };
  const ws = createWs({
    name: 'pumpportal',
    url,
    stallMs: 90_000,
    onOpen(send) {
      send({ method: 'subscribeNewToken' });
      if (migrations) send({ method: 'subscribeMigration' });
    },
    onMessage(d) {
      if (d?.txType === 'create') {
        const c = normCreate(d);
        if (c) {
          counts.creates++;
          onCreate?.(c);
        }
      } else if ((d?.txType === 'migrate' || d?.txType === 'migration') && d.mint) {
        counts.migrations++;
        onMigrate?.({ mint: String(d.mint), pool: d.pool ?? null, sig: d.signature ?? null, t: Date.now() });
      }
    },
  });
  return { start: ws.start, stop: ws.stop, status: () => ({ ...ws.status(), ...counts }) };
}
