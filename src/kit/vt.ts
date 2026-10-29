// Seamless page changes (ported from flipfee's router): src/lib/router.ts runs every navigation through
// viewTransition(), so the page cross-fades fast and elements that share a view-transition-name travel from the old
// page to the new one. A name must be unique on a page, so names are set only on what was clicked: [data-vt] inside
// the clicked link (and [data-vt-with="<path>"] anywhere), then cleared. The twin on the next page carries the same
// name, e.g. style={vtName('coin-pic')}. Off with reduced motion, in hidden tabs and where the browser has no
// startViewTransition: the change then happens at once.
import { flushSync } from 'react-dom';
import type { CSSProperties } from 'react';

const REDUCED = '(prefers-reduced-motion: reduce)';
const WAIT_MS = 400;

interface Transition {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
}
type VTDocument = Document & { startViewTransition?: (cb: () => Promise<void> | void) => Transition };

/** Runs `apply` (a state change that swaps the page) inside a view transition when the browser can. */
export function viewTransition(apply: () => void): void {
  const doc = document as VTDocument;
  if (!doc.startViewTransition || window.matchMedia(REDUCED).matches || document.visibilityState !== 'visible') {
    apply();
    return;
  }
  try {
    const t = doc.startViewTransition(async () => {
      flushSync(apply);
      await pageShown();
    });
    // an aborted transition still lands on the new page; only the animation is lost
    t.ready.catch(() => undefined);
    t.finished.catch(() => undefined);
    t.updateCallbackDone.catch(() => undefined);
  } catch {
    apply();
  }
}

/**
 * Resolves once the new page has painted past its loading state: no [data-page-wait] element left (a page that loads
 * its data puts one on its skeleton), at most WAIT_MS. Timers, not frames: rendering is paused while a view
 * transition waits for its update.
 */
function pageShown(): Promise<void> {
  return new Promise((done) => {
    const t0 = performance.now();
    const check = () => {
      if (!document.querySelector('[data-page-wait]') || performance.now() - t0 > WAIT_MS) done();
      else window.setTimeout(check, 16);
    };
    window.setTimeout(check, 16);
  });
}

/** Names the clicked link's [data-vt] elements (and [data-vt-with=path] ones) for the next transition only. */
export function nameShared(link: Element | null, path?: string): void {
  if (!link) return;
  const els = [...link.querySelectorAll<HTMLElement>('[data-vt]')];
  if (path) els.push(...document.querySelectorAll<HTMLElement>(`[data-vt-with="${CSS.escape(path)}"]`));
  for (const el of els) if (el.dataset.vt) el.style.setProperty('view-transition-name', el.dataset.vt);
  if (els.length) window.setTimeout(() => els.forEach((el) => el.style.removeProperty('view-transition-name')), 900);
}

/** A view-transition name on the element that receives the travelling part (one element per page). */
export const vtName = (name: string): CSSProperties => ({ viewTransitionName: name }) as CSSProperties;
