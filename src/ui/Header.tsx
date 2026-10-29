// Header: mark + name · App / Docs · X · wallet. Phones keep the mark and the wallet; App / Docs move to the tab bar.
import { copy } from '../copy.ts';
import { brand } from '../brand.ts';
import { useStore } from '../lib/react.ts';
import { linkClick, route } from '../lib/router.ts';
import { WalletButton } from '../wallet/WalletButton.tsx';
import { IconX } from './Icons.tsx';
import { Mark } from './Mark.tsx';

export const NAV: [string, string][] = [
  ['/live', copy.home.footer.live],
  ['/wallets', copy.home.footer.wallets],
  ['/tools', copy.home.footer.tools],
  ['/docs', copy.nav.docs],
];

export const xUrl = brand.x ? `https://x.com/${brand.x}` : 'https://x.com';

export function Header() {
  const path = useStore(route, (s) => s.path);
  return (
    <header className="hd">
      <a className="hd-brand" href="/" onClick={linkClick} aria-label={copy.nav.home}>
        <Mark size={36} />
        <b>{brand.name}</b>
      </a>
      <nav className="hd-nav" aria-label="Main">
        {NAV.map(([href, label]) => (
          <a key={href} href={href} onClick={linkClick} aria-current={path === href || (href !== '/' && path.startsWith(href)) ? 'page' : undefined}>
            {label}
          </a>
        ))}
        <a className="hd-cta" href="/connect" onClick={linkClick}>
          {copy.home.deploy} ↗
        </a>
      </nav>
      <div className="hd-end">
        <a className="btn-icon hd-x" href={xUrl} target="_blank" rel="noopener noreferrer" aria-label={copy.nav.xLabel}>
          <IconX size={17} />
        </a>
        <WalletButton />
      </div>
    </header>
  );
}
