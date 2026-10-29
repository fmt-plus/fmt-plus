// Version A — the Grid home as a showcase: the big wordmark, the product sentence with two actions beside three
// captioned phones, how it works in four cells, live data, the MCP and the blog. The agent builder has its own page.
import { inside } from '../lib/hosts.ts';
import { copy } from '../copy.ts';
import { useStore } from '../lib/react.ts';
import { linkClick, route } from '../lib/router.ts';
import { BlogIndex, BlogPost } from '../blog/Blog.tsx';
import { AgentDrawer, Dither, Footer, Header, SpawnButton, Wordmark } from './shared.tsx';
import { PhoneDemo } from './phones.tsx';
import { AgentPage, BlogTeaser, DataRow, McpPage, McpRow, TradesPage, WalletPage, WalletsPage } from './pages.tsx';

const D = copy.d;

function Home() {
  return (
    <main className="v">
      <div className="v-word">
        <Wordmark />
      </div>
      <section className="v-row v-r2 v-hero">
        <div className="v-pitch">
          <h1>{D.product}</h1>
          <p className="v-lead">{D.how}</p>
          <div className="v-ctas">
            <SpawnButton large />
            <a className="v-pill v-pill-blue v-pill-l" href="/mcp" onClick={linkClick}>
              {D.mcpCta}
            </a>
          </div>
        </div>
        <div className="v-phones">
          <PhoneDemo />
        </div>
      </section>
      <section className="v-row v-r1">
        <div>
          <h2>{D.how4.title}</h2>
        </div>
      </section>
      <section className="v-row v-r4 v-how">
        {D.how4.steps.map((s, i) => (
          <div key={s.t}>
            <span className="v-how-n">{i + 1}</span>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </section>
      <DataRow />
      <McpRow />
      <BlogTeaser />
    </main>
  );
}

export function DraftA() {
  const path = inside(useStore(route, (s) => s.path));
  const w = /^\/w\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(path)?.[1];
  const post = /^\/blog\/([\w-]+)$/.exec(path)?.[1];
  const page = w ? (
    <WalletPage key={w} w={w} />
  ) : post ? (
    <BlogPost key={post} slug={post} />
  ) : path === '/blog' ? (
    <BlogIndex />
  ) : path === '/agent' ? (
    <AgentPage />
  ) : path === '/wallets' ? (
    <WalletsPage />
  ) : path === '/trades' ? (
    <TradesPage />
  ) : path === '/mcp' ? (
    <McpPage />
  ) : (
    <Home />
  );
  return (
    <div className="v-shell">
      <Header agentHref="/agent" />
      {page}
      <Footer />
      <Dither />
      <AgentDrawer />
    </div>
  );
}
