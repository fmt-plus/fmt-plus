// The blog's posts: slug, cover, date and the copy block (copy.ts `blog.posts`). Newest first.
import { copy } from '../copy.ts';
import { to } from '../lib/hosts.ts';

export type PostKey = keyof typeof copy.blog.posts;
export interface Post {
  key: PostKey;
  slug: string;
  cover: string;
  date: string;
}
export const POSTS: Post[] = [
  { key: 'what', slug: 'what-is-fmt-plus', cover: '/blog/cover-01.jpg', date: '2026-10-29' },
  { key: 'spawn', slug: 'spawn-an-agent', cover: '/blog/cover-04.jpg', date: '2026-10-29' },
  { key: 'mcp', slug: 'use-fmt-plus-in-your-ai', cover: '/blog/cover-05.jpg', date: '2026-10-29' },
];
export const postPath = (p: Post) => to(`/blog/${p.slug}`);
export const postBySlug = (slug: string) => POSTS.find((p) => p.slug === slug) ?? null;

type Block = { p: string } | { h: string } | { ul: readonly string[] } | { fig: string };
export const blocksOf = (p: Post) => copy.blog.posts[p.key].body as readonly Block[];
export function readMin(p: Post): number {
  const words = blocksOf(p)
    .map((b) => ('p' in b ? b.p : 'h' in b ? b.h : 'ul' in b ? b.ul.join(' ') : ''))
    .join(' ')
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
export const slugOf = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
