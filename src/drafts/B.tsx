// Version B — the agent builder is the home: the product sentence and the four steps open the page beside the alert
// preview, your stats follow once the agent exists, then live data, the MCP and the blog; the big wordmark closes it.
import { copy } from '../copy.ts';
import { useStore } from '../lib/react.ts';
import { route } from '../lib/router.ts';
import { BlogIndex, BlogPost } from '../blog/Blog.tsx';
import { AgentBuilder, AgentDrawer, AlertFeed, Dither, Footer, Header, Phone, WalletHead, WalletStats, Wordmark, useAgent } from './shared.tsx';
import { BlogTeaser, DataRow, McpPage, McpRow, TradesPage, WalletPage, WalletsPage } from './pages.tsx';

const D = copy.d;

function Home() {
  const { agent } = useAgent();
  return (
    <main className="v">
      <section className="v-row v-r2 v-console v-console-home">
        <div>
          <h1 className="v-h1s">{D.product}</h1>
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
      <DataRow />
      <McpRow />
      <BlogTeaser />
      <div className="v-word v-word-end">
        <Wordmark />
      </div>
    </main>
  );
}

export function DraftB() {
  const path = useStore(route, (s) => s.path);
  const w = /^\/w\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(path)?.[1];
  const post = /^\/blog\/([\w-]+)$/.exec(path)?.[1];
  const page = w ? (
    <WalletPage key={w} w={w} />
  ) : post ? (
    <BlogPost key={post} slug={post} />
  ) : path === '/blog' ? (
    <BlogIndex />
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
      <Header agentHref="/" />
      {page}
      <Footer />
      <Dither />
      <AgentDrawer />
    </div>
  );
}
