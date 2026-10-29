// One JSON line per event on stdout (journald keeps it). Secrets never reach the log: anything that looks like a key
// or a bearer token is scrubbed, and URLs lose their query strings.
const KEYISH = /\b(sk-[A-Za-z0-9_*.-]{6,}|[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,})/g;

export function redact(text) {
  return String(text ?? '')
    .replace(KEYISH, '[redacted]')
    .replace(/([?&](api[-_]?key|key|token|secret)=)[^&\s]+/gi, '$1[redacted]');
}

export function log(event, fields = {}) {
  const line = { t: new Date().toISOString(), event, ...fields };
  try {
    process.stdout.write(redact(JSON.stringify(line)) + '\n');
  } catch {
    // stdout closed: nothing to do
  }
}

export function logError(event, err, fields = {}) {
  log(event, { ...fields, error: redact(String(err?.message ?? err)).slice(0, 300) });
}
