#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_NAME="com.tennreserve.watcher.plist"
SRC="$ROOT/scripts/com.tennreserve.watcher.plist.example"
DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__REPO_ROOT__|$ROOT|g" "$SRC" > "$DEST"
echo "Installed $DEST (repo root: $ROOT)"
