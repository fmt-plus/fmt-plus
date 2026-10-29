// The way in when Connect cannot go straight to Phantom: a wallet list, Phantom's in-app browser on phones, or the
// Phantom download on desktops.
import { copy } from '../copy.ts';
import { wallet } from '../core/wallet.ts';
import { isPhone, phantomBrowseLink, PHANTOM_GET } from '../core/deeplink.ts';
import { useStore } from '../lib/react.ts';
import { Sheet } from '../ui/Sheet.tsx';
import { IconOut, IconWallet } from '../ui/Icons.tsx';
import { connectWallet } from './flow.ts';

export function ConnectSheet() {
  const wallets = useStore(wallet, (s) => s.wallets);
  const phone = isPhone();
  return (
    <Sheet title={wallets.length > 0 ? copy.wallet.pick : copy.wallet.connect}>
      {wallets.length > 0 ? (
        <div className="wl">
          {wallets.map((w) => (
            <button key={w.id} type="button" className="wl-row" onClick={() => void connectWallet(w.id)}>
              {w.icon ? <img src={w.icon} alt="" width={36} height={36} /> : <span className="wl-ic"><IconWallet size={20} /></span>}
              <b>{w.name}</b>
            </button>
          ))}
        </div>
      ) : phone ? (
        <div className="sheet-body">
          <p className="sheet-line">{copy.wallet.phoneLine}</p>
          <a className="btn btn-primary btn-lg btn-block" href={phantomBrowseLink()}>
            {copy.wallet.openPhantom}
          </a>
        </div>
      ) : (
        <div className="sheet-body">
          <p className="sheet-line">{copy.wallet.deskLine}</p>
          <a className="btn btn-primary btn-lg btn-block" href={PHANTOM_GET} target="_blank" rel="noopener noreferrer">
            {copy.wallet.getPhantom}
            <IconOut size={18} />
          </a>
        </div>
      )}
    </Sheet>
  );
}
