#!/usr/bin/env bash
# Push secrets + scheduled attempts to a DigitalOcean (or other) watcher host.
# Does NOT overwrite remote bookings/ledger/logs.
#
# Usage:
#   ./scripts/sync-to-droplet.sh user@droplet-ip
#   ./scripts/sync-to-droplet.sh user@droplet-ip --with-profile
#   REMOTE_DIR=/opt/TennReserve ./scripts/sync-to-droplet.sh user@host
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR="${REMOTE_DIR:-/opt/TennReserve}"
WITH_PROFILE=0
TARGET=""

for arg in "$@"; do
  case "$arg" in
    --with-profile) WITH_PROFILE=1 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      if [[ -z "$TARGET" ]]; then
        TARGET="$arg"
      else
        echo "Unexpected argument: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 user@droplet-ip [--with-profile]" >&2
  exit 1
fi

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing $ROOT/.env — copy .env.example and fill it in first." >&2
  exit 1
fi

if [[ ! -f "$ROOT/config/targets.yaml" ]]; then
  echo "Missing $ROOT/config/targets.yaml" >&2
  exit 1
fi

ssh "$TARGET" "mkdir -p '$REMOTE_DIR/config' '$REMOTE_DIR/storage'"

echo "Syncing .env → $TARGET:$REMOTE_DIR/.env"
rsync -az "$ROOT/.env" "$TARGET:$REMOTE_DIR/.env"

echo "Syncing config/targets.yaml"
rsync -az "$ROOT/config/targets.yaml" "$TARGET:$REMOTE_DIR/config/targets.yaml"

if [[ -f "$ROOT/storage/attempts.json" ]]; then
  echo "Syncing storage/attempts.json"
  rsync -az "$ROOT/storage/attempts.json" "$TARGET:$REMOTE_DIR/storage/attempts.json"
else
  echo "No local storage/attempts.json — skipping (create/schedule an attempt first)."
fi

if [[ "$WITH_PROFILE" -eq 1 ]]; then
  if [[ -d "$ROOT/storage/profile" ]]; then
    echo "Syncing storage/profile/ (warm WAF cookies)"
    rsync -az "$ROOT/storage/profile/" "$TARGET:$REMOTE_DIR/storage/profile/"
  else
    echo "No local storage/profile/ — skipping."
  fi
fi

echo "Done. Watcher re-reads attempts.json each poll; no restart required."
echo "Optional: ssh $TARGET 'journalctl -u tennreserve-watcher -n 20 --no-pager'"
