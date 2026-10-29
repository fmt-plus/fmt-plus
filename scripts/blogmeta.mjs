// After `vite build`: one HTML file per blog page with its own title, description and preview image, so link
// previews (X, Telegram, Discord) show the post. Caddy serves them on blog.<domain>: / → dist/b/index.html,
// /<slug> → dist/b/<slug>.html (deploy/caddy.fragment.tmpl). The app itself is the same bundle.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { brand } from '../src/brand.ts';
import { copy } from '../src/copy.ts';
import { POSTS } from '../src/blog/posts.ts';

const dist = new URL('../dist/', import.meta.url);
const base = readFileSync(new URL('index.html', dist), 'utf8');
const blog = `https://blog.${brand.domain}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function page({ title, description, url, image, type }) {
  const set = (re, val) => (html) => {
    if (!re.test(html)) throw new Error(`blogmeta: ${re} is missing in dist/index.html`);
    return html.replace(re, val);
  };
  return [
    set(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`),
    set(/(<meta name="description" content=")[^"]*/, `$1${esc(description)}`),
    set(/(<link rel="canonical" href=")[^"]*/, `$1${url}`),
    set(/(<meta property="og:type" content=")[^"]*/, `$1${type}`),
    set(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`),
    set(/(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`),
    set(/(<meta property="og:url" content=")[^"]*/, `$1${url}`),
    set(/(<meta property="og:image" content=")[^"]*/, `$1${image}`),
    set(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)}`),
    set(/(<meta name="twitter:description" content=")[^"]*/, `$1${esc(description)}`),
    set(/(<meta name="twitter:image" content=")[^"]*/, `$1${image}`),
  ].reduce((h, f) => f(h), base);
}

mkdirSync(new URL('b/', dist), { recursive: true });
writeFileSync(
  new URL('b/index.html', dist),
  page({ title: copy.blog.title, description: copy.blog.lead, url: `${blog}/`, image: `https://${brand.domain}/og.png`, type: 'website' }),
);
for (const p of POSTS) {
  const c = copy.blog.posts[p.key];
  writeFileSync(
    new URL(`b/${p.slug}.html`, dist),
    page({ title: c.title, description: c.description, url: `${blog}/${p.slug}`, image: `${blog}/blog/og-${p.slug}.jpg`, type: 'article' }),
  );
}
console.log(`blogmeta: ${POSTS.length + 1} pages in dist/b`);
