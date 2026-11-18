# Removes the Cato live-logs server installed by cato-live-logs-win-install.ps1:
# stops it, removes its sign-in (Run) entry, its folder and the pairing file.
# Node.js stays installed. No administrator rights needed.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File `
#     "$env:LOCALAPPDATA\CatoLogViewerLiveLogs\uninstall.ps1"
#
# The installer keeps this copy in the install folder. Mirrored to
# client/public/ by scripts/sync-public.js — edit only this copy.

$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:LOCALAPPDATA 'CatoLogViewerLiveLogs'
$ConfigFile = Join-Path $HOME '.cato-live-logs.json'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$RunName = 'CatoLogViewerLiveLogs'

# The server (node running live-logs-server.js) and the hidden PowerShell that
# launched it — never this process.
Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $PID -and $_.CommandLine -and (
    ($_.Name -eq 'node.exe' -and $_.CommandLine.Contains('live-logs-server.js')) -or
    ($_.Name -eq 'powershell.exe' -and $_.CommandLine.Contains((Join-Path $Dir 'start.ps1')))
  )
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

Remove-ItemProperty -Path $RunKey -Name $RunName -ErrorAction SilentlyContinue
# Pairing tokens, origins and the chosen log folder.
if (Test-Path -LiteralPath $ConfigFile) { Remove-Item -LiteralPath $ConfigFile -Force }
# Safe while this script runs from there: PowerShell has already read it.
if (Test-Path -LiteralPath $Dir) { Remove-Item -LiteralPath $Dir -Recurse -Force }

Write-Host 'Cato live-logs server removed. (Node.js stays installed.)'
