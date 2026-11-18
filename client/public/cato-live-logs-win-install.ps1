# Installs the Cato live-logs server on Windows as a per-user
# background process that starts when you sign in. No administrator rights:
# everything lives under your own profile. Installs Node.js with winget first
# if it is missing.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File cato-live-logs-win-install.ps1 `
#     install -Origin <viewer origin> -Token <pairing token> [-LogDir <log folder>]
#
# Downloads live-logs-server.js, its package.json and the uninstall script from
# the viewer origin. To remove: cato-live-logs-win-uninstall.ps1, kept in the
# install folder as uninstall.ps1.
# Installing again from another browser adds that browser's token (up to 8 are
# kept). The hosted viewer origin is always allowed by the server.
#
# Mirrored to client/public/ by scripts/sync-public.js — edit only this copy.

param(
  [Parameter(Position = 0)][ValidateSet('install')][string]$Action = 'install',
  [string]$Origin,
  [string]$Token,
  [string]$LogDir
)

$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:LOCALAPPDATA 'CatoLogViewerLiveLogs'
$ConfigFile = Join-Path $HOME '.cato-live-logs.json'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$RunName = 'CatoLogViewerLiveLogs'
$Port = 4000

# Our server (node running live-logs-server.js, including a copy started by hand
# from an older setup command) and the hidden PowerShell that launched it.
function Stop-LiveServer {
  Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -and (
      ($_.Name -eq 'node.exe' -and $_.CommandLine.Contains('live-logs-server.js')) -or
      ($_.Name -eq 'powershell.exe' -and $_.CommandLine.Contains((Join-Path $Dir 'start.ps1')))
    )
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

if ($Origin -notmatch '^https?://[A-Za-z0-9.-]+(:\d{1,5})?$') { throw 'Invalid -Origin.' }
if ($Token -notmatch '^[A-Za-z0-9-]{16,128}$') { throw 'Invalid -Token.' }
if ($LogDir -and $LogDir -match '[\x00-\x1f]') { throw 'Invalid -LogDir.' }

# Node.js: install it if missing, then refresh PATH for this session (winget
# only updates the stored environment).
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required. Install the LTS version from https://nodejs.org, then run this again.'
  }
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
    [Environment]::GetEnvironmentVariable('Path', 'User')
}
$Node = (Get-Command node -ErrorAction Stop).Source

Stop-LiveServer
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

Write-Host 'Downloading the live-logs server...'
Invoke-WebRequest -UseBasicParsing -Uri "$Origin/live-logs-server.js" -OutFile (Join-Path $Dir 'live-logs-server.js')
Invoke-WebRequest -UseBasicParsing -Uri "$Origin/live-logs-server-package.json" -OutFile (Join-Path $Dir 'package.json')
Invoke-WebRequest -UseBasicParsing -Uri "$Origin/cato-live-logs-win-uninstall.ps1" -OutFile (Join-Path $Dir 'uninstall.ps1')

Write-Host 'Installing the ws dependency...'
Push-Location $Dir
try {
  & npm install --omit=dev --no-audit --no-fund --loglevel=error
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
} finally { Pop-Location }

# Pairing: keep tokens/origins from earlier installs (other browsers), newest last.
$config = @{}
if (Test-Path -LiteralPath $ConfigFile) {
  try {
    $stored = (Get-Content -LiteralPath $ConfigFile -Raw) | ConvertFrom-Json
    foreach ($property in $stored.PSObject.Properties) { $config[$property.Name] = $property.Value }
  } catch { Write-Warning "Ignoring unreadable $ConfigFile" }
}
function Merge-List($Existing, [string]$Value) {
  $kept = @(@($Existing) | Where-Object { $_ -is [string] -and $_ -ne $Value })
  return , @(($kept + $Value) | Select-Object -Last 8)
}
$config['origins'] = Merge-List $config['origins'] $Origin
$config['tokens'] = Merge-List $config['tokens'] $Token
if ($LogDir) { $config['logDir'] = $LogDir }
Write-Utf8NoBom $ConfigFile ($config | ConvertTo-Json -Depth 4)

# Launcher: a hidden PowerShell that runs node and keeps its output in server.log.
$quote = { param($s) "'" + ($s -replace "'", "''") + "'" }
$launcher = @(
  '# Started at sign-in by the CatoLogViewerLiveLogs Run entry.'
  "Set-Location -LiteralPath $(& $quote $Dir)"
  "& $(& $quote $Node) $(& $quote (Join-Path $Dir 'live-logs-server.js')) *> $(& $quote (Join-Path $Dir 'server.log'))"
) -join "`r`n"
Write-Utf8NoBom (Join-Path $Dir 'start.ps1') $launcher

$startArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $Dir 'start.ps1')`""
Set-ItemProperty -Path $RunKey -Name $RunName -Value "powershell.exe $startArgs"
Start-Process -FilePath 'powershell.exe' -ArgumentList $startArgs -WindowStyle Hidden

for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -Headers @{ 'X-Viewer-Token' = $Token }
    if ($response.StatusCode -eq 200) {
      Write-Host 'Cato live-logs server is running and starts when you sign in.'
      Write-Host 'Go back to the viewer and click Live Log.'
      Write-Host "To remove it: Settings > Live Logs Settings in the viewer, or run $(Join-Path $Dir 'uninstall.ps1')"
      exit 0
    }
  } catch { }
}
Write-Warning "The server did not answer on port $Port. See $(Join-Path $Dir 'server.log') (is another program using port $Port?)"
exit 1
