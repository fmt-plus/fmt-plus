// History routing: '/', '/docs', '/docs/print', '/docs/print/<id>'. Caddy serves index.html for every path.
// Page changes run through a view transition (src/kit/vt.ts): a fast cross-fade, and parts named with data-vt inside
// the clicked link travel to their twin on the next page. Reduced motion or an older browser: the page swaps at once.
import type { MouseEvent } from 'react';
import { createStore } from '../core/store.ts';
import { nameShared, viewTransition } from '../kit/vt.ts';

const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/';
export const route = createStore({ path: norm(window.location.pathname) });

window.addEventListener('popstate', () => route.set({ path: norm(window.location.pathname) }));

export function navigate(to: string): void {
  const path = norm(to);
  if (path === route.get().path) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  viewTransition(() => {
    window.history.pushState(null, '', path);
    route.set({ path });
    window.scrollTo(0, 0);
  });
}

/** onClick for internal <a href>: keeps new-tab clicks native. */
export function linkClick(e: MouseEvent<HTMLAnchorElement>): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const href = e.currentTarget.getAttribute('href');
  if (!href || !href.startsWith('/')) return;
  e.preventDefault();
  nameShared(e.currentTarget, norm(href));
  navigate(href);
}
