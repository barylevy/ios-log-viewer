#!/bin/bash
# Mirrors every Cato client log source on macOS into ~/.cato_live_logs/<key>/ once a
# second, so the viewer (a browser, which can't read /private/var/root) can tail
# them. Needs only tools that ship with macOS — no Node, no npm.
#
#   sudo bash sync-cato-logs.sh
#
# Then in the viewer: Live ▸ Choose folder ▸ ~/.cato_live_logs
#
# Mirrored via rsync --inplace, so a growing log grows in place (the viewer reads
# only the new bytes). Keep the <key> names in sync with FS_SOURCES in
# client/src/utils/liveLogsFsCore.js. Mirrored to client/public/ by
# scripts/sync-public.js — edit only this copy.

set -u

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: some Cato logs live under /private/var/root." >&2
  echo "  sudo bash $0" >&2
  exit 1
fi

# Whose home gets the mirror: the user who ran sudo, not root.
TARGET_USER="${SUDO_USER:-}"
if [ -z "$TARGET_USER" ] || [ "$TARGET_USER" = "root" ]; then
  echo "Run via sudo from your normal user account (SUDO_USER is empty)." >&2
  exit 1
fi
USER_HOME="$(dscl . -read "/Users/$TARGET_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
[ -n "$USER_HOME" ] || USER_HOME="/Users/$TARGET_USER"

DEST="$USER_HOME/.cato_live_logs"
GROUP="CKGSB8CH43.group"
ROOT_GC="/private/var/root/Library/Group Containers/$GROUP"
USER_GC="$USER_HOME/Library/Group Containers/$GROUP"
INTERVAL="${SYNC_INTERVAL:-1}"

mkdir -p "$DEST"
chown "$TARGET_USER" "$DEST"

# sync_dir <key> <source dir> [rsync filter args...]
sync_dir() {
  local key="$1" src="$2"; shift 2
  [ -d "$src" ] || return 0
  mkdir -p "$DEST/$key"
  rsync -a --inplace --delete "$@" "$src/" "$DEST/$key/" 2>/dev/null
}

# Anti-tamper is one file family inside the root AppLogs folder; fall back to the
# other places it has been seen. First candidate that holds a match wins.
sync_antitamper() {
  local dir
  for dir in "$ROOT_GC/AppLogs" "$ROOT_GC/AntiTamperLogs" "$USER_GC/AppLogs"; do
    if ls "$dir"/AntiTamperLogs* >/dev/null 2>&1; then
      sync_dir antitamper "$dir" --include='AntiTamperLogs*' --exclude='*'
      return 0
    fi
  done
}

sync_all() {
  sync_dir app    "$USER_GC/AppLogs"
  sync_dir ext    "$ROOT_GC/AppExtensionLogs"
  sync_dir dns    "$ROOT_GC/DNSExtensionLogs"
  sync_antitamper
  sync_dir agent  "$USER_HOME/Library/Logs/CatoNetworksUserAgent"
  sync_dir daemon "/private/var/root/Library/Logs/com.catonetworks.mac.CatoClient.helper"

  if [ -f /var/tmp/catoinstallext.txt ]; then
    mkdir -p "$DEST/install"
    cp -p /var/tmp/catoinstallext.txt "$DEST/install/" 2>/dev/null
  fi

  # Mirrored files are root-owned copies; hand them to the user so the browser can read them.
  chown -R "$TARGET_USER" "$DEST" 2>/dev/null
  chmod -R u+rX "$DEST" 2>/dev/null
}

# Status is replaced atomically so the browser never reads a partial response.
# Never interpret the request as a command or a path.
write_status() {
  local tmp
  tmp="$(mktemp "$DEST/.sync-status.XXXXXX")" || return 1
  printf '%s\n' "$1" > "$tmp"
  chown "$TARGET_USER" "$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$DEST/.sync-status"
}

read_request() {
  head -c 100 "$DEST/.sync-request" 2>/dev/null || true
}

trap 'echo; echo "Stopped."; exit 0' INT TERM

echo "Mirroring Cato logs to $DEST every ${INTERVAL}s (Ctrl-C to stop)."
echo "In the viewer: Live ▸ Choose folder ▸ select .cato_live_logs."
last_pause=""
while true; do
  request="$(read_request)"
  case "$request" in
    pause:*)
      # Pause copying while the browser removes the previous mirror. Recover
      # automatically if its tab closes before sending the resume request.
      if [ "$request" != "$last_pause" ]; then
        last_pause="$request"
        write_status "$request"
        attempts=0
        while [ "$(read_request)" = "$request" ] && [ "$attempts" -lt 30 ]; do
          sleep 1
          attempts=$((attempts + 1))
        done
        request="$(read_request)"
      fi
      ;;
  esac
  sync_all
  write_status "ready:$request"
  sleep "$INTERVAL"
done
