#!/bin/bash
# Installs (or removes) the Cato live-logs server as a macOS LaunchDaemon.
# Uses only what ships with macOS (bash, /usr/bin/perl, launchctl) — no Node,
# no Homebrew. Run once; the server then starts with the Mac and the viewer's
# Live Log button connects to it without any folder or terminal.
#
#   sudo bash install.sh install --origin=<viewer origin> --token=<pairing token>
#   sudo bash '/Library/Application Support/CatoLogViewerLiveLogs/install.sh' uninstall
#
# Expects cato-live-logs-mac-server.pl next to it, saved as server.pl (the
# viewer's setup command downloads both). Installing again from another browser
# adds that browser's token; up to 8 are kept. The hosted viewer origin is
# always allowed in addition to the one given.
#
# Mirrored to client/public/ by scripts/sync-public.js — edit only this copy.

set -euo pipefail

LABEL="local.cato-log-viewer.live-logs"
DIR="/Library/Application Support/CatoLogViewerLiveLogs"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
LOG_FILE="/Library/Logs/cato-log-viewer-live-logs.log"
PORT=4000
PROD_ORIGIN="https://cato-client-log-viewer.vercel.app"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "Error: $*" >&2; exit 1; }
usage() {
  echo "Usage: sudo bash $0 install --origin=<viewer origin> --token=<pairing token>" >&2
  echo "       sudo bash $0 uninstall" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "run with sudo."
action="${1:-}"
[ $# -gt 0 ] && shift

stop_daemon() { launchctl bootout "system/$LABEL" >/dev/null 2>&1 || true; }

case "$action" in
  uninstall)
    stop_daemon
    rm -f "$PLIST"
    rm -rf "$DIR"
    rm -f "$LOG_FILE"
    # The downloaded setup copy in the invoking user's home, if any.
    if [[ "${SUDO_USER:-}" =~ ^[A-Za-z0-9._-]+$ ]] && [ "$SUDO_USER" != "root" ]; then
      user_home="$(dscl . -read "/Users/$SUDO_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
      [ -n "$user_home" ] && rm -rf -- "$user_home/.cato-live-logs-setup"
    fi
    echo "Cato live-logs server removed."
    exit 0
    ;;
  install) ;;
  *) usage ;;
esac

origin="" token=""
for arg in "$@"; do
  case "$arg" in
    --origin=*) origin="${arg#--origin=}" ;;
    --token=*) token="${arg#--token=}" ;;
    *) usage ;;
  esac
done
[[ "$origin" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]] || die "invalid --origin."
[[ "$token" =~ ^[A-Za-z0-9-]{16,128}$ ]] || die "invalid --token."

user="${SUDO_USER:-}"
[[ "$user" =~ ^[A-Za-z0-9._-]+$ ]] && [ "$user" != "root" ] \
  || die "run via sudo from your normal user account."
home="$(dscl . -read "/Users/$user" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
[ -n "$home" ] || home="/Users/$user"
[[ "$home" =~ ^/[^[:cntrl:]]+$ ]] || die "unexpected home folder for $user."

SERVER_SRC="$HERE/server.pl"
[ -f "$SERVER_SRC" ] || die "server.pl not found next to this script."
/usr/bin/perl -c "$SERVER_SRC" >/dev/null 2>&1 || die "server.pl failed Perl's syntax check."

# Keep tokens/origins paired earlier (other browsers), newest last, at most 8 each.
merge() {
  local key="$1" value="$2"
  { [ -f "$DIR/config" ] && grep "^$key=" "$DIR/config" | cut -d= -f2- | grep -vxF -- "$value" || true
    echo "$value"; } | tail -n 8
}
origins="$(merge origin "$origin")"
# The hosted viewer is always allowed, so an install made from a dev or preview
# viewer also works there (it still needs a paired token).
grep -qxF -- "$PROD_ORIGIN" <<< "$origins" || origins="$PROD_ORIGIN"$'\n'"$origins"
tokens="$(merge token "$token")"

stop_daemon
install -d -o root -g wheel -m 755 "$DIR"
install -o root -g wheel -m 644 "$SERVER_SRC" "$DIR/server.pl"
# A root-owned copy of this script, so uninstall works without the setup folder.
install -o root -g wheel -m 644 "${BASH_SOURCE[0]}" "$DIR/install.sh"

# The config holds the pairing tokens: root-only, replaced atomically.
tmp="$(mktemp "$DIR/config.XXXXXX")"
{
  echo "user=$user"
  echo "home=$home"
  while IFS= read -r o; do echo "origin=$o"; done <<< "$origins"
  while IFS= read -r t; do echo "token=$t"; done <<< "$tokens"
} > "$tmp"
chown root:wheel "$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$DIR/config"

# Only fixed values go into the plist.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/perl</string>
    <string>$DIR/server.pl</string>
    <string>--config</string>
    <string>$DIR/config</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardErrorPath</key><string>$LOG_FILE</string>
</dict>
</plist>
EOF
chown root:wheel "$PLIST"
chmod 644 "$PLIST"

launchctl bootstrap system "$PLIST"
launchctl enable "system/$LABEL"

# The token goes in a header file rather than on curl's command line.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if printf 'X-Viewer-Token: %s\n' "$token" \
      | curl -fsS -o /dev/null -H @- "http://127.0.0.1:$PORT/health" 2>/dev/null; then
    echo "Cato live-logs server is running and starts with your Mac."
    echo "Go back to the viewer and click Live Log."
    echo "To remove it: Settings > Live Logs Service in the viewer, or"
    echo "  sudo bash '$DIR/install.sh' uninstall"
    exit 0
  fi
  sleep 1
done
echo "The server did not answer on port $PORT. See $LOG_FILE" >&2
echo "(is another program using port $PORT?)" >&2
exit 1
