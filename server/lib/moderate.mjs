// Moderation for any text other people read (user notes, nicknames, coin names from third parties).
// Hate slurs and hate-group names are blocked; plain swearing stays (trench coin names use it a lot). Matching folds
// case, accents, Cyrillic/Greek look-alikes and leet digits, and also reads the text with separators removed, so
// "N.1.G.G.E.R" counts. Forked from the owner's callpeek moderation module.

export const MASK = '•';

const LOOKALIKE = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i',
  ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't',
  0: 'o', 1: 'i', '!': 'i', '|': 'i', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 6: 'g', 7: 't', 9: 'g',
};

const ANYWHERE = [
  /n+i+g{2,}(?:e+r|a+|u+h|r+)/,
  /f+a+g{2,}o+t/,
  /w+e+t+b+a+c+k/,
  /r+a+g+h+e+a+d/,
  /t+o+w+e+l+h+e+a+d/,
  /z+i+p+p+e+r+h+e+a+d/,
  /p+o+r+c+h+m+o+n+k+e+y/,
  /j+i+g+a+b+o+o/,
  /j+u+n+g+l+e+b+u+n+n+y/,
  /h+e+i+l+h+i+t+l+e+r/,
  /s+i+e+g+h+e+i+l/,
  /h+o+l+o+h+o+a+x/,
  /g+a+s+t+h+e+j+e+w+s/,
  /k+u+k+l+u+x/,
  /w+h+i+t+e+p+o+w+e+r/,
];

const WORDS = new Set([
  'fag', 'fags', 'fagot', 'fagots', 'faggit', 'faggits', 'kike', 'kikes', 'kyke', 'kykes', 'spic', 'spics', 'spick',
  'spicks', 'chink', 'chinks', 'gook', 'gooks', 'beaner', 'beaners', 'tranny', 'trannies', 'dyke', 'dykes', 'paki',
  'pakis', 'wog', 'wogs', 'darkie', 'darkies', 'golliwog', 'golliwogs', 'heeb', 'heebs', 'hymie', 'hymies',
  'kkk', 'klan', 'klans', 'klansman', 'klansmen', 'nazi', 'nazis', 'neonazi', 'neonazis', 'hitler', 'hitlers',
]);

const INNOCENT = new Set([
  'snigger', 'sniggers', 'sniggered', 'sniggering', 'niggle', 'niggles', 'niggled', 'niggling', 'niggly', 'niggard',
  'niggards', 'niggardly',
]);

const fold = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/./gsu, (ch) => LOOKALIKE[ch] ?? ch);

/** True when the text holds a hate slur. */
export function hasSlur(text) {
  if (!text) return false;
  const words = fold(text)
    .split(/[^a-z]+/)
    .filter((w) => w && !INNOCENT.has(w));
  if (words.some((w) => WORDS.has(w) || ANYWHERE.some((re) => re.test(w)))) return true;
  const compact = words.join('');
  return ANYWHERE.some((re) => re.test(compact));
}

const dots = (s) => MASK.repeat(Math.min(8, Math.max(3, [...s].length)));

/** A name or ticker with each slur word masked; a slur spread over several words masks it all. */
export function maskSlurs(text) {
  const s = String(text ?? '');
  if (!hasSlur(s)) return s;
  const out = s.replace(/\S+/g, (w) => (hasSlur(w) ? dots(w) : w));
  return hasSlur(out) ? dots(s) : out;
}

// Third-party coin names only (stricter than user text): words that, in a memecoin name, nearly always target a
// group of people. A feed skips these coins entirely.
const COIN_WORDS = new Set(['jew', 'jews', 'jewz', 'zog', 'goyim', 'goy', 'shoah', 'holocaust', 'auschwitz', 'reich', 'aryan']);

function targetsGroup(text) {
  if (!text) return false;
  const raw = String(text).toLowerCase();
  if (/\b1488\b/.test(raw) || (/\b14\b/.test(raw) && /\b88\b/.test(raw))) return true;
  return fold(text)
    .split(/[^a-z]+/)
    .some((w) => w && COIN_WORDS.has(w));
}

/** A coin whose name or symbol carries a slur or targets a group: feeds skip it. */
export const badCoin = (c) => !!c && (hasSlur(c.symbol) || hasSlur(c.name) || targetsGroup(c.symbol) || targetsGroup(c.name));

/**
 * Cleans user-written text before it is stored or shown.
 * Returns { ok: true, text } or { ok: false, reason: 'empty' | 'long' | 'slur' | 'link' }.
 */
export function cleanText(input, { max = 280, allowLinks = false, allowNewlines = false } = {}) {
  let s = String(input ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  s = allowNewlines ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  s = s.trim();
  if (!s) return { ok: false, reason: 'empty' };
  if ([...s].length > max) return { ok: false, reason: 'long' };
  if (hasSlur(s)) return { ok: false, reason: 'slur' };
  if (!allowLinks && /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|io|xyz|fun|net|org|gg|app|so|me|ly)\b|t\.me\/)/i.test(s)) {
    return { ok: false, reason: 'link' };
  }
  return { ok: true, text: s };
}
