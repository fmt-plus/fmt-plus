// /blog and /blog/<slug> in the Grid look: the newest post as a split hero, then cards; a post is its cover, the
// body in one reading column with a table of contents beside it, figures inline, then a call to action and more posts.
import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { fill } from '../core/format.ts';
import { linkClick } from '../lib/router.ts';
import { McpSnippets, McpTools, MoreLink } from '../drafts/shared.tsx';
import { to } from '../lib/hosts.ts';
import { POSTS, blocksOf, postBySlug, postPath, readMin, slugOf } from './posts.ts';
import type { Post } from './posts.ts';

const B = copy.blog;
const F = B.fig;
const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function Meta({ post }: { post: Post }) {
  return (
    <p className="b-meta">
      {B.by} · {date(post.date)} · {fill(B.read, { n: readMin(post) })}
    </p>
  );
}

export function Card({ post }: { post: Post }) {
  const c = B.posts[post.key];
  return (
    <a className="b-card" href={postPath(post)} onClick={linkClick}>
      <img src={post.cover} alt="" loading="lazy" />
      <h3>{c.title}</h3>
      <p>{c.description}</p>
      <Meta post={post} />
    </a>
  );
}

export function BlogIndex() {
  const [first, ...rest] = POSTS;
  const c = B.posts[first.key];
  return (
    <main className="v b">
      <header className="b-top">
        <h1>{B.title}</h1>
        <p>{B.lead}</p>
      </header>
      <a className="b-hero" href={postPath(first)} onClick={linkClick}>
        <img src={first.cover} alt="" />
        <div>
          <h2>{c.title}</h2>
          <p>{c.description}</p>
          <Meta post={first} />
        </div>
      </a>
      <div className="b-grid">
        {rest.map((p) => (
          <Card key={p.slug} post={p} />
        ))}
      </div>
    </main>
  );
}

// ── figures ──────────────────────────────────────────────
function Fig({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="b-fig">
      {children}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/** Solana swaps → fmt+ keeps real trades → site / Telegram / your AI. */
function FlowFig() {
  const f = F.flow;
  const out = [f.site, f.tg, f.ai];
  return (
    <Fig label={f.label}>
      <svg className="b-svg" viewBox="0 0 960 300" role="img" aria-label={`${f.chain}, ${f.core}, ${out.join(', ')}`}>
        <defs>
          <marker id="b-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0 0L10 5L0 10z" className="b-tip" />
          </marker>
        </defs>
        <rect x="10" y="100" width="230" height="100" rx="18" className="b-ink" />
        <text x="125" y="150" className="b-t b-t-l" textAnchor="middle" dominantBaseline="central">
          {f.chain}
        </text>
        <path d="M250 150H322" className="b-ln" markerEnd="url(#b-a)" />
        <rect x="330" y="80" width="280" height="140" rx="18" className="b-blue" />
        <text x="470" y="150" className="b-t b-t-l" textAnchor="middle" dominantBaseline="central">
          {f.core}
        </text>
        {out.map((t, i) => {
          const y = 20 + i * 100;
          return (
            <g key={t}>
              <path d={`M620 150C660 150 660 ${y + 40} 702 ${y + 40}`} className="b-ln" markerEnd="url(#b-a)" />
              <rect x="710" y={y} width="240" height="80" rx="16" className="b-lime" />
              <text x="830" y={y + 40} className="b-t" textAnchor="middle" dominantBaseline="central">
                {t}
              </text>
            </g>
          );
        })}
      </svg>
    </Fig>
  );
}

/** Spawn → Choose wallets → Set rules → Telegram. */
function StepsFig() {
  const s = F.steps.s;
  return (
    <Fig label={F.steps.label}>
      <ol className="b-steps">
        {s.map((t, i) => (
          <li key={t}>
            <span>{i + 1}</span>
            <b>{t}</b>
          </li>
        ))}
      </ol>
    </Fig>
  );
}

function OutputsFig() {
  const f = F.flow;
  const lists = blocksOf(POSTS[0]).flatMap((b) => ('ul' in b ? [b.ul] : []));
  const ul = { ul: lists.find((l) => l[0]?.startsWith('The site')) ?? [] };
  const rows = [f.site, f.tg, f.ai];
  return (
    <Fig label={F.outputs.label}>
      <div className="b-outs">
        {rows.map((t, i) => (
          <div key={t}>
            <b>{t}</b>
            <p>{ul?.ul[i]}</p>
          </div>
        ))}
      </div>
    </Fig>
  );
}

function AlertFig() {
  return (
    <Fig label={F.alert.label}>
      <div className="b-tg">
        <div className="b-tg-msg">
          <b>fmt+</b>
          <p>{F.alert.text}</p>
          <p className="b-tg-links">{F.alert.links}</p>
        </div>
      </div>
    </Fig>
  );
}

function figure(key: string) {
  switch (key) {
    case 'flow':
      return <FlowFig />;
    case 'steps':
      return <StepsFig />;
    case 'outputs':
      return <OutputsFig />;
    case 'filter':
      return (
        <Fig label={F.filter.label}>
          <img className="b-img" src="/blog/thread-02.png" alt={F.filter.label} loading="lazy" />
        </Fig>
      );
    case 'tools':
      return (
        <Fig label={F.tools.label}>
          <McpTools />
        </Fig>
      );
    case 'install':
      return <McpSnippets />;
    case 'alert':
      return <AlertFig />;
    default:
      return null;
  }
}

export function BlogPost({ slug }: { slug: string }) {
  const post = postBySlug(slug);
  if (!post) return <BlogIndex />;
  const c = B.posts[post.key];
  const blocks = blocksOf(post);
  const heads = blocks.flatMap((b) => ('h' in b ? [b.h] : []));
  const others = POSTS.filter((p) => p.slug !== slug);
  return (
    <main className="v b">
      <article className="b-post">
        <p className="b-crumb">
          <a href={to('/blog')} onClick={linkClick}>
            {B.all}
          </a>
        </p>
        <img className="b-cover" src={post.cover} alt="" />
        <h1>{c.title}</h1>
        <Meta post={post} />
        <div className="b-cols">
          <div className="b-body">
            {blocks.map((b, i) =>
              'p' in b ? (
                <p key={i}>{b.p}</p>
              ) : 'h' in b ? (
                <h2 key={i} id={slugOf(b.h)}>
                  {b.h}
                </h2>
              ) : 'ul' in b ? (
                <ul key={i}>
                  {b.ul.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : (
                <div key={i}>{figure(b.fig)}</div>
              ),
            )}
          </div>
          {heads.length > 0 && (
            <aside className="b-toc">
              <p>{B.toc}</p>
              <ul>
                {heads.map((h) => (
                  <li key={h}>
                    <a href={`#${slugOf(h)}`}>{h}</a>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </article>
      <section className="b-cta">
        <h2>{B.cta}</h2>
        <MoreLink href={to('/agent')}>{copy.d.spawnCta}</MoreLink>
      </section>
      <section className="b-rel">
        <h2>{B.related}</h2>
        <div className="b-grid">
          {others.map((p) => (
            <Card key={p.slug} post={p} />
          ))}
        </div>
      </section>
    </main>
  );
}
