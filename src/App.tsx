import { useEffect } from 'react';
import { useMedia, useStore, PHONE } from './lib/react.ts';
import { route } from './lib/router.ts';
import { ui } from './state/ui.ts';
import { Header } from './ui/Header.tsx';
import { TabBar } from './ui/TabBar.tsx';
import { Toasts } from './ui/Toasts.tsx';
import { Home } from './home/Home.tsx';
import { Wallet } from './home/Wallet.tsx';
import { Live, Wallets } from './home/Lists.tsx';
import { Connect, Tools } from './home/Connect.tsx';
import { Docs } from './docs/Docs.tsx';
import { Print } from './docs/Print.tsx';
import { ConnectSheet } from './wallet/ConnectSheet.tsx';
import { WalletMenu } from './wallet/WalletMenu.tsx';
import { ShareSheet } from './share/ShareSheet.tsx';
import { DitherDefs } from './kit/index.ts';
import { copy } from './copy.ts';
import { brand } from './brand.ts';

function Page({ path }: { path: string }) {
  const w = /^\/w\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(path);
  if (w) return <Wallet key={w[1]} w={w[1]} />;
  if (path.startsWith('/docs')) return <Docs />;
  if (path === '/live') return <Live />;
  if (path === '/wallets') return <Wallets />;
  if (path === '/tools') return <Tools />;
  if (path === '/connect') return <Connect />;
  return <Home />;
}

export function App() {
  const path = useStore(route, (s) => s.path);
  const sheet = useStore(ui, (s) => s.sheet);
  const phone = useMedia(PHONE);

  useEffect(() => {
    document.title = path.startsWith('/docs') ? `${copy.nav.docs} · ${brand.name}` : `${brand.name} · ${copy.tagline}`;
  }, [path]);

  const print = /^\/docs\/print(?:\/([\w-]+))?$/.exec(path);
  if (print) return <Print id={print[1]} />;

  return (
    <div className={`shell${phone ? ' is-phone' : ''}`}>
      <DitherDefs />
      <Header />
      <Page path={path} />
      {phone && <TabBar />}
      {sheet === 'connect' && <ConnectSheet />}
      {sheet === 'wallet' && <WalletMenu />}
      {sheet === 'share' && <ShareSheet />}
      <Toasts />
    </div>
  );
}
