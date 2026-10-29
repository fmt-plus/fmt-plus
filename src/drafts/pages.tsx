// Pages both versions share: tracked wallets, recent trades, the MCP, one wallet, the blog teaser and the agent page.
import { to } from '../lib/hosts.ts';
import { copy } from '../copy.ts';
import { linkClick } from '../lib/router.ts';
import { POSTS } from '../blog/posts.ts';
import { Card } from '../blog/Blog.tsx';
import {
  AgentBuilder,
  AlertFeed,
  Lookup,
  McpSnippets,
  McpTools,
  MoreLink,
  Phone,
  RecentTable,
  TrackedTable,
  WalletHead,
  WalletStats,
  useAgent,
  useWallet,
} from './shared.tsx';

const D = copy.d;

export function PageHead({ title, lead }: { title: string; lead?: string }) {
  return (
    <section className="v-row v-r1 v-head">
      <div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
    </section>
  );
}

export function WalletsPage() {
  return (
    <main className="v">
      <PageHead title={D.tracked.title} lead={D.tracked.lead} />
      <section className="v-row v-r1">
        <div>
          <Lookup />
        </div>
      </section>
      <section className="v-row v-r1">
        <div>
          <h2>{D.tracked.top}</h2>
          <TrackedTable group="top" />
        </div>
      </section>
      <section className="v-row v-r1">
        <div>
          <h2>{D.tracked.added}</h2>
          <TrackedTable group="added" />
        </div>
      </section>
    </main>
  );
}

export function TradesPage() {
  return (
    <main className="v">
      <PageHead title={D.recent.title} lead={D.recent.lead} />
      <section className="v-row v-r1">
        <div>
          <RecentTable limit={50} />
        </div>
      </section>
    </main>
  );
}

export function McpPage() {
  return (
    <main className="v">
      <PageHead title={D.mcp.title} lead={D.mcp.lead} />
      <section className="v-row v-r2">
        <div>
          <McpSnippets />
        </div>
        <div>
          <h2>{D.mcp.tools}</h2>
          <p className="v-lead">{D.mcp.toolsLead}</p>
          <McpTools />
        </div>
      </section>
    </main>
  );
}

export function WalletPage({ w }: { w: string }) {
  const st = useWallet(w);
  return (
    <main className="v">
      <section className="v-row v-r1 v-head">
        <div>
          <a className="v-link" href="/" onClick={linkClick}>
            {D.back}
          </a>
          <h1>{st?.v?.name ?? D.stats.other}</h1>
          <WalletHead w={w} />
        </div>
      </section>
      <section className="v-row v-r1">
        <div>
          <WalletStats w={w} />
        </div>
      </section>
    </main>
  );
}

/** The agent builder beside the alert preview; the wallet's stats under them once the agent exists. */
export function AgentBlock({ title }: { title: 'h1' | 'h2' }) {
  const { agent } = useAgent();
  const H = title;
  return (
    <>
      <section className="v-row v-r2 v-console">
        <div>
          <H className="v-h">{D.agent.title}</H>
          <p className="v-lead">{D.agent.lead}</p>
          <AgentBuilder />
        </div>
        <div className="v-side">
          <Phone mid caption={D.phones.alert}>
            <AlertFeed n={8} />
          </Phone>
        </div>
      </section>
      {agent && (
        <section className="v-row v-r1" id="stats">
          <div>
            <h2>{D.stats.title}</h2>
            <WalletHead w={agent.wallet} />
            <WalletStats w={agent.wallet} />
          </div>
        </section>
      )}
    </>
  );
}

export function AgentPage() {
  return (
    <main className="v">
      <AgentBlock title="h1" />
    </main>
  );
}

export function DataRow() {
  return (
    <section className="v-row v-r2">
      <div>
        <h2>{D.recent.latest}</h2>
        <RecentTable limit={8} />
        <MoreLink href="/trades">{D.recent.all}</MoreLink>
      </div>
      <div>
        <h2>{D.tracked.top}</h2>
        <TrackedTable group="top" limit={8} />
        <MoreLink href="/wallets">{D.tracked.title}</MoreLink>
      </div>
    </section>
  );
}

export function McpRow() {
  return (
    <section className="v-row v-r2">
      <div>
        <h2>{D.mcp.title}</h2>
        <p className="v-lead">{D.mcp.lead}</p>
        <McpSnippets />
      </div>
      <div>
        <h2>{D.mcp.tools}</h2>
        <McpTools />
      </div>
    </section>
  );
}

export function BlogTeaser() {
  return (
    <section className="v-row v-r1">
      <div>
        <div className="v-head-row">
          <h2>{D.blogTeaser.title}</h2>
          <MoreLink href={to('/blog')}>{D.blogTeaser.all}</MoreLink>
        </div>
        <div className="b-grid b-grid-3">
          {POSTS.map((p) => (
            <Card key={p.slug} post={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
