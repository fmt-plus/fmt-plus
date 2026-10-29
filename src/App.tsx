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
import { DraftA } from './drafts/A.tsx';
import { MiniApp } from './tg/MiniApp.tsx';
import { DraftB } from './drafts/B.tsx';
import { copy } from './copy.ts';
import { brand } from './brand.ts';
import { inside } from './lib/hosts.ts';
import { postBySlug } from './blog/posts.ts';

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
    const p = inside(path);
    const post = p.startsWith('/blog/') ? postBySlug(p.slice(6)) : null;
    document.title = path.startsWith('/docs')
      ? `${copy.nav.docs} · ${brand.name}`
      : post
        ? copy.blog.posts[post.key].title
        : p === '/blog'
          ? copy.blog.title
          : brand.name;
  }, [path]);

  // the Telegram Mini App (src/tg): opened from the bot's menu button
  if (path === '/tg' || path.startsWith('/tg/')) return <MiniApp />;

  const print = /^\/docs\/print(?:\/([\w-]+))?$/.exec(path);
  if (print) return <Print id={print[1]} />;

  // redesign drafts: VITE_DRAFT=a (npm run dev, :5530) or b (npm run dev:b, :5540)
  // production runs version A (the owner's pick); VITE_DRAFT=b still serves version B for comparison
  const draft = import.meta.env.VITE_DRAFT || 'a';
  if (draft === 'a' || draft === 'b')
    return (
      <>
        {draft === 'a' ? <DraftA /> : <DraftB />}
        {sheet === 'connect' && <ConnectSheet />}
        {sheet === 'wallet' && <WalletMenu />}
        <Toasts />
      </>
    );


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
