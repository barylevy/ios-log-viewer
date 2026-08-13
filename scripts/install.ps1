# Installs the live-logs server dependency and starts it (Windows).
#
# Usage:
#   .\install.ps1
#   .\install.ps1 -Dir "C:\Users\you\ws\endpoint\endpoint\sdp\win\Product\Debug\x64"
#
# -Dir is the full path to the folder holding the cato_vpn_*.log files; it is
# used exactly as given. Once set it is remembered in ~\.cato-live-logs.json, so
# later runs need no argument. You can also change it from the viewer's
# Settings > Live Logs Settings dialog.
#
# No administrator rights are needed — the build output folder lives under your
# own user profile.

param([string]$Dir)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

npm install --prefix $here

if ($Dir) {
    node (Join-Path $here 'live-logs-server.js') --dir="$Dir"
} else {
    node (Join-Path $here 'live-logs-server.js')
}
