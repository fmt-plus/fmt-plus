#!/usr/bin/env bash
# Release this product to the owner's box. It asks no questions and runs every gate first.
#
#   npm run release                       gates, build, upload, switch, restart, health (the token stays as it is)
#   npm run release -- --token <CA>       the same, and the token card shows this CA (base58, 32 bytes)
#   npm run release -- --token ""         the same, and the token card is hidden (also: --no-token)
#   npm run release -- --app-only         the site only; the server keeps running
#   npm run release -- --dry-run          gates, build and the plan; nothing leaves this machine
#
# Settings: deploy/release.conf (HOST, SSH_USER, KEY, SLUG, PORT, DOMAIN, NAME).
# On the box: /srv/<slug>/releases/<UTC> (app/dist + server), /srv/<slug>/current → the live one, data in
# /srv/<slug>/data, unit <slug>.service, Caddy fragment /etc/caddy/sites/<slug>.caddy. A failed health check rolls
# back to the previous release. The 5 newest releases are kept.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

say() { printf '\033[1m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }

CONF=deploy/release.conf
[ -f "$CONF" ] || CONF=deploy/release.conf.example
HOST="" SSH_USER=root KEY="" SLUG="" PORT="" DOMAIN="" NAME=""
while IFS='=' read -r k v || [ -n "$k" ]; do
  k="$(printf '%s' "$k" | tr -d '[:space:]')"
  case "$k" in
    HOST | SSH_USER | KEY | SLUG | PORT | DOMAIN) printf -v "$k" '%s' "$(printf '%s' "$v" | tr -d '[:space:]')" ;;
    NAME) NAME="$(printf '%s' "$v" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')" ;;
  esac
done <"$CONF"

DRY=0
APP_ONLY=0
TOKEN_SET=0
TOKEN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --app-only) APP_ONLY=1; shift ;;
    --token)
      TOKEN_SET=1
      if [ $# -ge 2 ] && [ "${2#--}" = "$2" ]; then TOKEN="$2"; shift 2; else TOKEN=""; shift; fi ;;
    --token=*) TOKEN_SET=1; TOKEN="${1#*=}"; shift ;;
    --no-token) TOKEN_SET=1; TOKEN=""; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown flag: $1 (see --help)" ;;
  esac
done

[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,40}$ ]] || die "SLUG in $CONF must be lowercase letters, digits and dashes"
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] || die "PORT in $CONF must be a number"
[ -n "$DOMAIN" ] || die "DOMAIN is empty in $CONF"
[ -n "$HOST" ] || die "HOST is empty in $CONF"
NAME="${NAME:-$SLUG}"
KEY="${KEY/#\~/$HOME}"

TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
if [ -n "$TOKEN" ]; then
  node --input-type=module -e '
    import { isAddress } from "./server/lib/base58.mjs";
    process.exit(isAddress(process.argv[1]) ? 0 : 1);' "$TOKEN" || die "\"$TOKEN\" is not a Solana address (base58, 32 bytes)"
fi

say "gates: copy, numbers, server tests, build, labels"
npm run --silent copy >/dev/null || { npm run --silent copy; die "copy check failed"; }
npm run --silent numbers >/dev/null || { npm run --silent numbers; die "numbers check failed"; }
npm test --silent >/dev/null 2>&1 || { npm test; die "server tests failed"; }
npm run --silent build >/dev/null || die "build failed: npm run build"
npm run --silent labels || die "a demo/beta/test label is in the build"

REL="$(date -u +%Y%m%d%H%M%S)"
STAGE="deploy/.stage/$REL"
rm -rf deploy/.stage
mkdir -p "$STAGE/app" "$STAGE/deploy"
cp -R dist "$STAGE/app/dist"
if [ "$APP_ONLY" = 0 ]; then
  rsync -a --exclude test --exclude '*.db*' server/ "$STAGE/server/"
  cp package.json "$STAGE/package.json"
fi
render() { sed -e "s#{{SLUG}}#$SLUG#g" -e "s#{{PORT}}#$PORT#g" -e "s#{{DOMAIN}}#$DOMAIN#g" -e "s#{{NAME}}#$NAME#g" "$1"; }
render deploy/systemd.service.tmpl >"$STAGE/deploy/$SLUG.service"
render deploy/caddy.fragment.tmpl >"$STAGE/deploy/$SLUG.caddy"
cp deploy/activate-remote.sh "$STAGE/deploy/activate-remote.sh"

echo "  box:     $SSH_USER@$HOST:/srv/$SLUG/releases/$REL"
echo "  site:    https://$DOMAIN (www → apex, docs.$DOMAIN → /docs), API 127.0.0.1:$PORT"
echo "  server:  $([ "$APP_ONLY" = 1 ] && echo "kept running (app only)" || echo "restart $SLUG.service")"
if [ "$TOKEN_SET" = 1 ]; then echo "  token:   ${TOKEN:-none (the card is hidden)}"; else echo "  token:   as it is"; fi
echo "  files:   $(find "$STAGE" -type f | wc -l | tr -d ' ') in $STAGE"
if [ "$DRY" = 1 ]; then
  say "dry run: nothing left this machine"
  exit 0
fi

[ -f "$KEY" ] || die "no SSH key at $KEY (KEY in $CONF)"
TARGET="$SSH_USER@$HOST"
SOCK="$(mktemp -u "${TMPDIR:-/tmp}/rel-$SLUG.XXXXXX")"
trap 'ssh -S "$SOCK" -O exit "$TARGET" >/dev/null 2>&1 || true' EXIT
say "connect $TARGET"
for i in 1 2 3 4 5; do
  ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=20 \
    -o StrictHostKeyChecking=accept-new -o ControlMaster=yes -o ControlPersist=10m -S "$SOCK" -fN "$TARGET" 2>/dev/null && break
  [ "$i" = 5 ] && die "$HOST does not answer over SSH"
  sleep $((i * 3))
done
R() { ssh -S "$SOCK" "$TARGET" "$@"; }

say "upload release $REL"
R "mkdir -p /srv/$SLUG/releases/$REL"
for i in 1 2 3; do
  rsync -az -e "ssh -S $SOCK" "$STAGE/" "$TARGET:/srv/$SLUG/releases/$REL/" && break
  [ "$i" = 3 ] && die "upload failed"
  sleep 3
done

say "activate"
R "bash /srv/$SLUG/releases/$REL/deploy/activate-remote.sh '$REL' '$SLUG' '$PORT' '$APP_ONLY' '$TOKEN_SET' '$TOKEN'" ||
  die "activation failed (the previous release is back if there was one)"
rm -rf deploy/.stage

say "public check"
if curl -fsS -m 15 "https://$DOMAIN/api/health" -o /dev/null; then
  echo "  https://$DOMAIN/api/health 200"
  curl -fsS -m 15 -o /dev/null -w "  https://$DOMAIN/ %{http_code}\n" "https://$DOMAIN/" || true
else
  echo "  https://$DOMAIN is not answering yet: point an A record for $DOMAIN, www and docs at $HOST"
fi
say "done: https://$DOMAIN"
