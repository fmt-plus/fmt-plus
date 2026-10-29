// The blog lives on blog.<domain>; the rest of the site on <domain>. Inside the app every page keeps one path
// (/blog, /blog/<slug>, /wallets…); `to` turns it into the link for the host the page is on, and `inside`
// turns the blog host's URL back into that path. Local dev keeps every page on one host.
import { brand } from '../brand.ts';

const host = typeof location === 'undefined' ? '' : location.hostname;
const LOCAL = !host || /^(localhost|127\.|\[::1\])/.test(host);
export const ON_BLOG = host.startsWith('blog.');
export const SITE = `https://${brand.domain}`;
export const BLOG = `https://blog.${brand.domain}`;

const isBlog = (p: string) => p === '/blog' || p.startsWith('/blog/');
export function to(path: string): string {
  if (LOCAL) return path;
  if (isBlog(path)) {
    const rest = path.slice(5) || '/';
    return ON_BLOG ? rest : BLOG + rest;
  }
  return ON_BLOG ? SITE + path : path;
}
export const inside = (path: string) => (ON_BLOG ? '/blog' + (path === '/' ? '' : path) : path);
