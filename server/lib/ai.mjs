// Optional AI helper over any OpenAI-compatible chat/completions API (Kimi / Moonshot by default). Never throws:
// every call resolves to { ok: true, text, data, usd } or { ok: false, reason }. Off when there is no key.
//
// Settings (env, e.g. /etc/<slug>/server.env):
//   AI_API_KEY or AI_KEY_FILE      the key (a file is read once a minute until found; chmod 600; never logged)
//   AI_BASE_URL                    default https://api.moonshot.ai/v1
//   AI_MODEL                       required to turn AI on (e.g. the model id your provider lists)
//   AI_PRICE_IN, AI_PRICE_OUT      USD per 1M input / output tokens (for the caps)
//   AI_DAILY_USD (default 2), AI_TOTAL_USD (default 20)   spend caps; a call that could pass a cap is refused
// Each call first reserves its worst case (prompt + max output) and settles to the real usage when it returns.
// The ledger is <DATA_DIR>/ai-ledger.json: { day, dayUsd, totalUsd, calls }.
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { log } from './log.mjs';

const day = () => new Date().toISOString().slice(0, 10);
const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

export function createAi({ env = process.env, dataDir, fetchFn = globalThis.fetch } = {}) {
  const base = String(env.AI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/+$/, '');
  const model = String(env.AI_MODEL || '').trim();
  const priceIn = pos(env.AI_PRICE_IN) || 0.6;
  const priceOut = pos(env.AI_PRICE_OUT) || 2.5;
  const dailyUsd = env.AI_DAILY_USD !== undefined ? pos(env.AI_DAILY_USD) : 2;
  const totalUsd = env.AI_TOTAL_USD !== undefined ? pos(env.AI_TOTAL_USD) : 20;
  const ledgerFile = dataDir ? join(dataDir, 'ai-ledger.json') : '';

  let key = String(env.AI_API_KEY || '').trim();
  let keyCheckedAt = -Infinity;
  function getKey() {
    if (key) return key;
    if (Date.now() - keyCheckedAt < 60_000) return '';
    keyCheckedAt = Date.now();
    const f = String(env.AI_KEY_FILE || '').replace(/^~(?=\/)/, homedir());
    if (!f) return '';
    try {
      if (statSync(f).size > 4096) return '';
      key = readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) || '';
    } catch {
      key = '';
    }
    return key;
  }

  let ledger = { day: day(), dayUsd: 0, totalUsd: 0, calls: 0 };
  try {
    const d = JSON.parse(readFileSync(ledgerFile, 'utf8'));
    ledger = { day: d.day || day(), dayUsd: pos(d.dayUsd), totalUsd: pos(d.totalUsd), calls: pos(d.calls) };
  } catch {
    // first run
  }
  let reserved = 0;
  function roll() {
    if (ledger.day !== day()) ledger = { ...ledger, day: day(), dayUsd: 0 };
  }
  function save() {
    if (!ledgerFile) return;
    try {
      mkdirSync(dirname(ledgerFile), { recursive: true });
      writeFileSync(ledgerFile + '.tmp', JSON.stringify(ledger));
      renameSync(ledgerFile + '.tmp', ledgerFile);
    } catch {
      // the caps still hold in memory
    }
  }
  const cost = (inTok, outTok) => (inTok * priceIn + outTok * priceOut) / 1e6;
  const redact = (s) => {
    let t = String(s ?? '');
    if (key) t = t.split(key).join('[key]');
    return t.replace(/\bsk-[A-Za-z0-9_*.-]{6,}/g, '[key]').slice(0, 200);
  };

  function status() {
    roll();
    const on = !!(model && getKey());
    return {
      on,
      model: model || null,
      day: ledger.day,
      dayUsd: +ledger.dayUsd.toFixed(4),
      totalUsd: +ledger.totalUsd.toFixed(4),
      dailyCapUsd: dailyUsd,
      totalCapUsd: totalUsd,
      calls: ledger.calls,
      exhausted: ledger.dayUsd >= dailyUsd || ledger.totalUsd >= totalUsd,
    };
  }

  /**
   * chat({ system, user, messages, maxTokens = 400, json = false, temperature = 0.4, timeoutMs = 20000 })
   * `json: true` asks for a JSON object and parses it into `data` (reason 'badjson' when it cannot).
   */
  async function chat({ system, user, messages, maxTokens = 400, json = false, temperature = 0.4, timeoutMs = 20_000 } = {}) {
    try {
      const k = getKey();
      if (!model || !k) return { ok: false, reason: 'off' };
      roll();
      const msgs = messages ?? [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: String(user ?? '') }];
      const promptChars = msgs.reduce((a, m) => a + String(m.content ?? '').length, 0);
      const worst = cost(Math.ceil(promptChars / 2.5) + 50, maxTokens);
      if (ledger.dayUsd + reserved + worst > dailyUsd || ledger.totalUsd + reserved + worst > totalUsd) return { ok: false, reason: 'budget' };
      reserved += worst;
      let usd = 0;
      try {
        const r = await fetchFn(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` },
          body: JSON.stringify({ model, messages: msgs, max_tokens: maxTokens, temperature, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          if (r.status === 401 || r.status === 403) key = '';
          log('ai.http', { status: r.status, error: redact(body?.error?.message ?? '') });
          return { ok: false, reason: r.status === 429 ? 'ratelimit' : r.status >= 500 ? 'server' : 'api' };
        }
        const u = body?.usage ?? {};
        usd = cost(pos(u.prompt_tokens), pos(u.completion_tokens));
        const textOut = String(body?.choices?.[0]?.message?.content ?? '').trim();
        if (!textOut) return { ok: false, reason: 'empty', usd };
        if (!json) return { ok: true, text: textOut, data: null, usd };
        try {
          return { ok: true, text: textOut, data: JSON.parse(textOut.replace(/^```(?:json)?\s*|\s*```$/g, '')), usd };
        } catch {
          return { ok: false, reason: 'badjson', usd };
        }
      } finally {
        reserved -= worst;
        if (usd > 0) {
          ledger.dayUsd += usd;
          ledger.totalUsd += usd;
          ledger.calls += 1;
          save();
        }
      }
    } catch (e) {
      log('ai.fail', { error: redact(e?.name === 'TimeoutError' ? 'timeout' : e?.message) });
      return { ok: false, reason: e?.name === 'TimeoutError' ? 'timeout' : 'network' };
    }
  }

  return { chat, status };
}
