import { copy } from '../copy.ts';
import { wallet } from '../core/wallet.ts';
import { session } from '../core/session.ts';
import { copyText } from '../core/clipboard.ts';
import { short } from '../core/format.ts';
import { useStore } from '../lib/react.ts';
import { toast } from '../state/ui.ts';
import { Sheet } from '../ui/Sheet.tsx';
import { IconCheck, IconCopy } from '../ui/Icons.tsx';
import { disconnectWallet, signInNow } from './flow.ts';

export function WalletMenu() {
  const account = useStore(wallet, (s) => s.account);
  const signed = useStore(session, (s) => !!s.s && s.s.address === account);
  const busy = useStore(session, (s) => s.busy);
  if (!account) return null;
  return (
    <Sheet title={copy.wallet.menu}>
      <div className="sheet-body">
        <button
          type="button"
          className="addr"
          onClick={() => void copyText(account).then((ok) => ok && toast(copy.toast.addrCopied))}
          aria-label={copy.wallet.copy}
        >
          <span className="mono">{short(account, 6)}</span>
          <IconCopy size={18} />
        </button>
        {signed ? (
          <p className="signed">
            <IconCheck size={18} />
            {copy.wallet.signedIn}
          </p>
        ) : (
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void signInNow()} disabled={busy}>
            {copy.wallet.signIn}
          </button>
        )}
        <button type="button" className="btn btn-soft btn-lg btn-block" onClick={() => void disconnectWallet()}>
          {copy.wallet.disconnect}
        </button>
      </div>
    </Sheet>
  );
}
