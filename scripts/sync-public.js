#!/usr/bin/env node
/**
 * Copies the live-logs scripts (server and macOS log mirror) to client/public/ so the in-app setup
 * command downloads the current version. Run automatically by the client's
 * predev/prebuild scripts.
 */

const fs = require('fs');
const path = require('path');

const FILES = ['live-logs-server.js', 'sync-cato-logs.sh'];

for (const name of FILES) {
  const src = path.join(__dirname, name);
  const dest = path.join(__dirname, '..', 'client', 'public', name);

  try {
    fs.copyFileSync(src, dest);
    console.log(`[sync-public] ${path.relative(process.cwd(), dest)} updated`);
  } catch (err) {
    // Never fail the dev/build run over this — just say what went wrong.
    console.warn(`[sync-public] Could not copy ${name}: ${err.message}`);
  }
}
