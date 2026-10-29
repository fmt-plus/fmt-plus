// Connect = connect the wallet, then Sign-In With Solana (one free signature). Phantom first: with Phantom in the
// browser, Connect asks it at once; other wallets get a short list; no wallet opens the way in (deep link / install).
import { copy } from '../copy.ts';
import { connect, disconnect, isRejection, preferred, wallet } from '../core/wallet.ts';
import { signIn, signOut } from '../core/session.ts';
import { openSheet, closeSheet, toast } from '../state/ui.ts';

export async function connectWallet(id?: string): Promise<void> {
  const ws = wallet.get().wallets;
  const pick = id ?? (ws.some((w) => w.id === 'phantom') ? 'phantom' : ws.length === 1 ? preferred() : null);
  if (!pick) {
    openSheet('connect');
    return;
  }
  closeSheet();
  try {
    await connect(pick);
  } catch (e) {
    toast(isRejection(e) ? copy.toast.rejected : copy.toast.failed, 'warn');
    return;
  }
  await signInNow();
}

export async function signInNow(): Promise<void> {
  try {
    await signIn();
    toast(copy.toast.signedIn);
  } catch (e) {
    toast(isRejection(e) ? copy.toast.rejected : copy.toast.failed, 'warn');
  }
}

export async function disconnectWallet(): Promise<void> {
  closeSheet();
  await signOut();
  await disconnect();
  toast(copy.toast.signedOut);
}
