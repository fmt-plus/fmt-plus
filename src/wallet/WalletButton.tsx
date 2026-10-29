import { copy } from '../copy.ts';
import { wallet } from '../core/wallet.ts';
import { session } from '../core/session.ts';
import { short } from '../core/format.ts';
import { useStore } from '../lib/react.ts';
import { openSheet } from '../state/ui.ts';
import { connectWallet } from './flow.ts';

export function WalletButton() {
  const account = useStore(wallet, (s) => s.account);
  const connecting = useStore(wallet, (s) => s.connecting);
  const busy = useStore(session, (s) => s.busy);
  const signed = useStore(session, (s) => !!s.s && s.s.address === account);
  if (!account) {
    return (
      <button type="button" className="btn btn-primary btn-wallet" data-state={connecting ? 'connecting' : 'guest'} onClick={() => void connectWallet()} disabled={connecting}>
        {connecting ? copy.wallet.connecting : copy.wallet.connect}
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-soft btn-wallet" data-state={signed ? 'signed' : 'connected'} onClick={() => openSheet('wallet')} aria-label={copy.wallet.menu}>
      <i className={`dot${signed ? ' dot-on' : ''}${busy ? ' dot-busy' : ''}`} aria-hidden="true" />
      <span className="mono">{short(account, 4)}</span>
    </button>
  );
}
