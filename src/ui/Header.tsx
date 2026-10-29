// Header in the Grid look: a ruled bar — wordmark · pages · X / GitHub · Deploy agent.
import { copy } from '../copy.ts';
import { brand } from '../brand.ts';
import { useStore } from '../lib/react.ts';
import { linkClick, route } from '../lib/router.ts';
import { IconArrowUpRight, IconGitHub, IconX } from './Icons.tsx';

export const NAV: [string, string][] = [
  ['/live', copy.home.footer.live],
  ['/wallets', copy.home.footer.wallets],
  ['/tools', copy.home.footer.tools],
  ['/docs', copy.nav.docs],
];

export const githubUrl = 'https://github.com/fmt-plus/fmt-plus';
export const xUrl = brand.x ? `https://x.com/${brand.x}` : 'https://x.com';

export function Header() {
  const path = useStore(route, (s) => s.path);
  return (
    <header className="gh">
      <a className="gh-word" href="/" onClick={linkClick} aria-label={copy.nav.home}>
        fmt<span>+</span>
      </a>
      <nav className="gh-nav" aria-label="Main">
        {NAV.map(([href, label]) => (
          <a key={href} href={href} onClick={linkClick} aria-current={path === href || path.startsWith(href + '/') ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <div className="gh-end">
        <a className="gh-icon" href={xUrl} target="_blank" rel="noopener noreferrer" aria-label={copy.nav.xLabel}>
          <IconX size={16} />
        </a>
        <a className="gh-icon" href={githubUrl} target="_blank" rel="noopener noreferrer" aria-label={copy.nav.github}>
          <IconGitHub size={17} />
        </a>
        <a className="gh-cta" href="/connect" onClick={linkClick}>
          {copy.home.deploy}
          <IconArrowUpRight size={15} />
        </a>
      </div>
    </header>
  );
}
