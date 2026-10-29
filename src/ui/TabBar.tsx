// Phones (≤760 px): the bottom tab bar in the thumb zone.
import { copy } from '../copy.ts';
import { useStore } from '../lib/react.ts';
import { linkClick, route } from '../lib/router.ts';
import { IconChart, IconDocs, IconHome, IconLink } from './Icons.tsx';

const TABS = [
  ['/', copy.nav.home, IconHome],
  ['/live', copy.home.footer.live, IconChart],
  ['/tools', copy.home.footer.tools, IconLink],
  ['/docs', copy.nav.docs, IconDocs],
] as const;

export function TabBar() {
  const path = useStore(route, (s) => s.path);
  return (
    <nav className="tabs" aria-label="Tabs">
      {TABS.map(([href, label, Icon]) => (
        <a key={href} href={href} onClick={linkClick} aria-current={(href === '/' ? path === '/' : path.startsWith(href)) ? 'page' : undefined}>
          <Icon size={22} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
