// Phones without a wallet in the browser: open this page inside Phantom's in-app browser.
export function isPhone(): boolean {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

/** Phantom's universal link: https://phantom.app/ul/browse/<url>?ref=<origin> */
export function phantomBrowseLink(page = window.location.href.split('#')[0]): string {
  return `https://phantom.app/ul/browse/${encodeURIComponent(page)}?ref=${encodeURIComponent(window.location.origin)}`;
}

export const PHANTOM_GET = 'https://phantom.com/download';
