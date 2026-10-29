#!/usr/bin/env bash
# Runs ON THE BOX as root, from the uploaded release: bash activate-remote.sh <REL> <SLUG> <PORT> <APP_ONLY> <TOKEN_SET> [CA]
# Touches only this product: /srv/<slug>, /etc/<slug>, /etc/systemd/system/<slug>.service, /etc/caddy/sites/<slug>.caddy.
# Steps: user + dirs → (app-only: reuse the running server code) → token.json → database snapshot → unit → Caddy
# fragment (validated, reverted on error) → switch `current` → restart → health → keep 5 releases.
# A failed health check after the switch puts the previous release back and restarts it.
set -euo pipefail
REL="${1:?release}"; SLUG="${2:?slug}"; PORT="${3:?port}"; APP_ONLY="${4:-0}"; TOKEN_SET="${5:-0}"; CA="${6:-}"
[[ "$REL" =~ ^[0-9]{14}$ ]] || { echo "bad release id" >&2; exit 2; }
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,40}$ ]] || { echo "bad slug" >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] || { echo "bad port" >&2; exit 2; }
ROOT="/srv/$SLUG"
DEST="$ROOT/releases/$REL"
[ -d "$DEST/app/dist" ] || { echo "no app in $DEST" >&2; exit 2; }
exec 9>"$ROOT/.deploy.lock"
flock -n 9 || { echo "another release of $SLUG is running" >&2; exit 1; }

NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "node is missing on the box (need >= 22.13)" >&2; exit 1; }
"$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' ||
  { echo "node $("$NODE" -v) is too old (need >= 22.13)" >&2; exit 1; }

id -u "$SLUG" >/dev/null 2>&1 || useradd --system --home-dir "$ROOT" --no-create-home --shell /usr/sbin/nologin "$SLUG"
mkdir -p "$ROOT/data" "$ROOT/backups" "/etc/$SLUG"
chown "$SLUG:$SLUG" "$ROOT/data"
chmod 750 "$ROOT/data"
chmod 700 "$ROOT/backups"
[ -f "/etc/$SLUG/server.env" ] || (umask 077; printf '# %s server settings (AI_API_KEY, AI_MODEL, caps). chmod 600.\n' "$SLUG" >"/etc/$SLUG/server.env")

PREV="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
[ -n "$PREV" ] && [ "$PREV" = "$DEST" ] && PREV=""
if [ "$APP_ONLY" = 1 ]; then
  if [ -z "$PREV" ] || [ ! -d "$PREV/server" ]; then
    echo "--app-only needs a server already running (do a full release first)" >&2
    exit 1
  fi
  rm -rf "${DEST:?}/server"
  cp -a "$PREV/server" "$DEST/server"
  cp -a "$PREV/package.json" "$DEST/package.json" 2>/dev/null || true
fi
chown -R root:root "$DEST"
chmod -R u=rwX,go=rX "$DEST"

# the token card: data/token.json (the server re-reads it within 2 s)
if [ "$TOKEN_SET" = 1 ]; then
  if [ -n "$CA" ]; then
    [[ "$CA" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "bad CA" >&2; exit 2; }
    printf '{"ca":"%s","setAt":"%s"}\n' "$CA" "$(date -u +%FT%TZ)" >"$ROOT/data/token.json.tmp"
    chown "$SLUG:$SLUG" "$ROOT/data/token.json.tmp"
    mv -f "$ROOT/data/token.json.tmp" "$ROOT/data/token.json"
    echo "  token:  $CA (the card shows)"
  else
    rm -f "$ROOT/data/token.json"
    echo "  token:  none (the card is hidden)"
  fi
fi

# a consistent database snapshot before the new code runs (sqlite online backup), the 5 newest kept
if [ -f "$ROOT/data/app.db" ] && command -v python3 >/dev/null; then
  python3 - "$ROOT/data/app.db" "$ROOT/backups/app-$REL.db" <<'PY' || echo "  backup: skipped (sqlite backup failed)"
import sqlite3, sys
with sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True) as src, sqlite3.connect(sys.argv[2]) as dst:
    src.backup(dst)
PY
  ls -1t "$ROOT"/backups/app-*.db 2>/dev/null | tail -n +6 | xargs -r rm -f
fi

# systemd unit (node's path filled in here)
UNIT="/etc/systemd/system/$SLUG.service"
sed "s#{{NODE}}#$NODE#g" "$DEST/deploy/$SLUG.service" >"$DEST/deploy/$SLUG.service.final"
if ! cmp -s "$DEST/deploy/$SLUG.service.final" "$UNIT"; then
  cp "$DEST/deploy/$SLUG.service.final" "$UNIT"
  systemctl daemon-reload
  systemctl enable "$SLUG" >/dev/null 2>&1
  echo "  unit:   installed $UNIT"
fi

# Caddy: this product's fragment only; a fragment Caddy rejects is reverted and the old config keeps serving
if [ -d /etc/caddy ] && command -v caddy >/dev/null; then
  mkdir -p /etc/caddy/sites
  FRAG="/etc/caddy/sites/$SLUG.caddy"
  if ! cmp -s "$DEST/deploy/$SLUG.caddy" "$FRAG"; then
    [ -f "$FRAG" ] && cp "$FRAG" "$FRAG.prev"
    cp "$DEST/deploy/$SLUG.caddy" "$FRAG"
    if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
      systemctl reload caddy && echo "  caddy:  $FRAG loaded"
    else
      echo "  caddy:  the new fragment does not validate; the old one stays" >&2
      if [ -f "$FRAG.prev" ]; then mv -f "$FRAG.prev" "$FRAG"; else rm -f "$FRAG"; fi
    fi
  fi
  grep -Eq '^[[:space:]]*import[[:space:]]+(/etc/caddy/)?sites/\*' /etc/caddy/Caddyfile ||
    echo "  caddy:  add one line to /etc/caddy/Caddyfile, then reload caddy:  import sites/*.caddy"
fi

healthy() {
  for _ in $(seq 1 40); do
    if curl -fsS -m 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null |
      "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.exit(JSON.parse(s).ok===true?0:1)}catch{process.exit(1)}})'; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

SWITCHED=0
rollback() {
  local status=$?
  if [ "$SWITCHED" = 1 ] && [ -n "$PREV" ]; then
    echo "  health failed: back to $(basename "$PREV")" >&2
    ln -sfn "$PREV" "$ROOT/current.rollback" && mv -Tf "$ROOT/current.rollback" "$ROOT/current"
    systemctl restart "$SLUG" || true
    if healthy; then echo "  rolled back, healthy" >&2; else echo "  rolled back, health still failing" >&2; fi
  fi
  exit "$status"
}
trap rollback ERR

ln -sfn "$DEST" "$ROOT/current.next"
mv -Tf "$ROOT/current.next" "$ROOT/current"
SWITCHED=1
if [ "$APP_ONLY" = 1 ]; then echo "  server: kept running (app only)"; else systemctl restart "$SLUG"; fi
if ! healthy; then
  echo "  /api/health is not ok:" >&2
  curl -s -m 3 "http://127.0.0.1:$PORT/api/health" >&2 || true
  false
fi
SWITCHED=0
trap - ERR
echo "  server: $(systemctl is-active "$SLUG") · release $REL"

# keep the 5 newest releases (never the live one)
LIVE="$(readlink -f "$ROOT/current")"
ls -1dt "$ROOT"/releases/*/ 2>/dev/null | sed 's#/$##' | tail -n +6 | while read -r d; do
  if [ "$d" != "$LIVE" ]; then rm -rf "$d"; fi
done
echo "  done"
