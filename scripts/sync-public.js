#!/usr/bin/env node
/**
 * Copies the live-logs scripts (server and macOS log mirror) to client/public/ so the in-app setup
 * command downloads the current version. Run automatically by the client's
 * predev/prebuild scripts.
 */

const fs = require('fs');
const path = require('path');

const FILES = [
  ['live-logs-server.js', 'live-logs-server.js'],
  ['cato-live-logs-mac-install.sh', 'cato-live-logs-mac-install.sh'],
  ['cato-live-logs-mac-server.pl', 'cato-live-logs-mac-server.pl'],
  ['cato-live-logs-win-install.ps1', 'cato-live-logs-win-install.ps1'],
  ['cato-live-logs-win-uninstall.ps1', 'cato-live-logs-win-uninstall.ps1'],
  ['package.json', 'live-logs-server-package.json'],
];

for (const [name, outputName] of FILES) {
  const src = path.join(__dirname, name);
  const dest = path.join(__dirname, '..', 'client', 'public', outputName);

  try {
    fs.copyFileSync(src, dest);
    console.log(`[sync-public] ${path.relative(process.cwd(), dest)} updated`);
  } catch (err) {
    process.exitCode = 1;
    console.error(`[sync-public] Could not copy ${name}: ${err.message}`);
  }
}
