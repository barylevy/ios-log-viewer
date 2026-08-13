# Installs the live-logs server dependency and starts it (Windows).
#
# Usage:
#   .\install.ps1
#   .\install.ps1 -Root "C:\Users\you\ws"
#
# The root is the folder containing "endpoint\endpoint\sdp\win\Product\Debug\x64".
# Once set it is remembered in ~\.cato-live-logs.json, so later runs need no
# argument. You can also change it from the viewer's
# Settings > Live Logs Settings dialog.
#
# No administrator rights are needed — the build output folder lives under your
# own user profile.

param([string]$Root)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

npm install --prefix $here

if ($Root) {
    node (Join-Path $here 'live-logs-server.js') --root="$Root"
} else {
    node (Join-Path $here 'live-logs-server.js')
}
