#!/usr/bin/env node
/**
 * Copy check (forked from the owner's ft1/shared/copycheck.mjs). Usage: node scripts/copycheck.mjs src/copy.ts [...]
 * Every user-facing string literal must pass:
 *  - reading level: Flesch-Kincaid grade per sentence ≤ 4, average ≤ 3 (technical terms count as one syllable)
 *  - banned words: negations, contrasts, hype; zero "!"
 *  - forbidden labels: demo, beta, test, testnet, preview, pre-live, coming soon
 * Sentences end at . or ? and at every line break (so X-style lines without periods are graded one by one).
 * Product terms: scripts/copy-terms.txt (one per line) and the name / ticker / X handle in .trench/brand.json are
 * allowed and count as one syllable. Domains (pump.fun, x.com) are names, so their words are skipped.
 * Exit 1 on any failure, so `npm run copy` gates the release.
 */
import { existsSync, readFileSync } from 'node:fs';

const MAX_SENTENCE_GRADE = 4.0;
const MAX_AVG_GRADE = 3.0;

const TECH = new Set([
  // Solana / trench terms
  'sol', 'solana', 'token', 'tokens', 'coin', 'coins', 'memecoin', 'memecoins', 'ca', 'mcap', 'ath', 'pnl', 'usd', 'usdc',
  'fee', 'fees', 'creator', 'creators', 'bonding', 'curve', 'liquidity', 'holder', 'holders', 'supply', 'wallet', 'wallets',
  'phantom', 'solflare', 'backpack', 'jupiter', 'raydium', 'pumpswap', 'solscan', 'dexscreener', 'axiom', 'gmgn',
  'ticker', 'tickers', 'dev', 'devs', 'buyback', 'buybacks', 'airdrop', 'pot', 'payout', 'payouts', 'rug', 'rugs',
  'dump', 'dumps', 'snipe', 'sniper', 'snipers', 'volume', 'chart', 'charts', 'contract', 'protocol', 'onchain',
  'siws', 'signature', 'sign', 'faq', 'docs', 'app', 'x', 'percent', 'minute', 'minutes', 'leaderboard', 'avatar',
  'graduation', 'graduate', 'graduates', 'graduated', 'migration', 'market', 'cap', 'servers', 'server', 'deposit',
  'withdraw', 'refund', 'refunds', 'escrow', 'reward', 'rewards', 'prize', 'winners', 'winner', 'trader', 'traders',
  'official', 'telegram', 'website', 'pump.fun', 'memecoin',
]);

const APPROVED = new Set([
  'fmt+ is an MCP with a personalized AI agent on top: it tracks smart money, indexes every trade and alerts you to what matters.',
  'It tracks smart money on Solana, indexes every trade and alerts you to what matters.',
]); // strings the owner chose word for word (the grade check skips them)

const BANNED = [
  // negations
  'no', 'not', 'never', 'none', 'nothing', 'nobody', 'nowhere', 'without', 'neither', 'nor', 'cannot',
  "don't", "doesn't", "isn't", "aren't", "can't", "won't", "wasn't", "weren't", "didn't", "haven't", "hasn't", "shouldn't",
  // contrasts
  'but', 'however', 'although', 'though', 'instead', 'unlike', 'rather', 'whereas', 'yet',
  // hype
  'moon', 'mooning', 'rocket', 'lfg', 'insane', '100x', '1000x', 'wagmi', 'gm', 'ape', 'aping', 'degen', 'pump', 'pumping',
  'guaranteed', 'massive', 'huge', 'revolutionary', 'best',
];
const LABELS = /\b(demo|beta|test|testnet|devnet|preview|pre-live|prelive|coming soon|placeholder|lorem)\b/i;

// product terms
const root = new URL('..', import.meta.url).pathname;
const extra = new Set();
try {
  const b = JSON.parse(readFileSync(root + '.trench/brand.json', 'utf8'));
  for (const v of [b.name, b.ticker, b.x]) if (v) String(v).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).forEach((w) => extra.add(w));
} catch {
  // no brand file: generic rules only
}
if (existsSync(root + 'scripts/copy-terms.txt')) {
  for (const l of readFileSync(root + 'scripts/copy-terms.txt', 'utf8').split('\n')) {
    const w = l.replace(/#.*/, '').trim().toLowerCase();
    if (w) extra.add(w);
  }
}
for (const w of extra) TECH.add(w);

function extractStrings(src) {
  const out = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(code))) {
    // "\n" in a string is a line break: a line is its own sentence (X-style lines carry no closing period)
    const s = m[2].replace(/\$\{[^}]*\}/g, '12').replace(/\{\w+\}/g, '12').replace(/\\n/g, '\n').replace(/\\'/g, "'").trim();
    if (!/[a-z]{2,}/i.test(s)) continue; // symbols, numbers
    if (/^[a-z0-9_.:/#@-]+$/i.test(s) && !/\s/.test(s) && !/^[A-Z][a-z]+$/.test(s)) continue; // ids, routes, css, paths
    if (/^\.{0,2}\//.test(s) || /\.(ts|tsx|css|svg|png|json)$/.test(s)) continue; // imports
    out.push(s);
  }
  return out;
}

const stripNames = (s) => s.replace(/\b[a-z0-9-]+\.(fun|com|io|xyz|app|so|cash|org|net|gg|me|one|pro|click|link)\b/gi, 'site');

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (TECH.has(w)) return 1;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function grade(sentence) {
  const words = sentence.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (!words.length) return 0;
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return 0.39 * words.length + 11.8 * (syl / words.length) - 15.59;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/copycheck.mjs <file.ts> [...]');
  process.exit(2);
}

let fail = false;
const grades = [];
let count = 0;
for (const f of files) {
  for (const raw of extractStrings(readFileSync(f, 'utf8'))) {
    count++;
    const s = stripNames(raw);
    const words = s.toLowerCase().split(/[^a-z0-9'&]+/).filter(Boolean);
    const banned = words.filter((w) => BANNED.includes(w) && !extra.has(w));
    if (banned.length) {
      fail = true;
      console.log(`BANNED  ${JSON.stringify(banned)}  "${raw}"`);
    }
    if (raw.includes('!')) {
      fail = true;
      console.log(`EXCLAIM "${raw}"`);
    }
    if (LABELS.test(s)) {
      fail = true;
      console.log(`LABEL   "${raw}"`);
    }
    if (APPROVED.has(raw)) continue;
    for (const sent of s.split(/(?<=[.?])\s+|\s*\n+\s*/)) {
      if (sent.split(/\s+/).length < 3) continue; // labels and buttons
      const g = grade(sent);
      grades.push(g);
      if (g > MAX_SENTENCE_GRADE) {
        fail = true;
        console.log(`GRADE ${g.toFixed(1)}  "${sent}"`);
      }
    }
  }
}
const avg = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
console.log(`\n${count} strings · ${grades.length} sentences · average grade ${avg.toFixed(2)} (limit ${MAX_AVG_GRADE})`);
if (avg > MAX_AVG_GRADE) fail = true;
console.log(fail ? 'COPY CHECK: FAIL' : 'COPY CHECK: PASS');
process.exit(fail ? 1 : 0);
