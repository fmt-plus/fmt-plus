// Phones (≤760 px): the bottom tab bar in the thumb zone.
import { copy } from '../copy.ts';
import { useStore } from '../lib/react.ts';
import { linkClick, route } from '../lib/router.ts';
import { openSheet } from '../state/ui.ts';
import { xUrl } from './Header.tsx';
import { IconDocs, IconHome, IconShare, IconX } from './Icons.tsx';

export function TabBar() {
  const path = useStore(route, (s) => s.path);
  const docs = path.startsWith('/docs');
  return (
    <nav className="tabs" aria-label="Tabs">
      <a href="/" onClick={linkClick} aria-current={docs ? undefined : 'page'}>
        <IconHome size={22} />
        <span>{copy.nav.app}</span>
      </a>
      <a href="/docs" onClick={linkClick} aria-current={docs ? 'page' : undefined}>
        <IconDocs size={22} />
        <span>{copy.nav.docs}</span>
      </a>
      <button type="button" onClick={() => openSheet('share')}>
        <IconShare size={22} />
        <span>{copy.nav.share}</span>
      </button>
      <a href={xUrl} target="_blank" rel="noopener noreferrer">
        <IconX size={19} />
        <span>{copy.nav.x}</span>
      </a>
    </nav>
  );
}
