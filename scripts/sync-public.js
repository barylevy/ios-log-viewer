#!/usr/bin/env node
/**
 * Copies scripts/live-logs-server.js to client/public/ so the in-app setup
 * command downloads the current version. Run automatically by the client's
 * predev/prebuild scripts.
 */

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'live-logs-server.js');
const dest = path.join(__dirname, '..', 'client', 'public', 'live-logs-server.js');

try {
  fs.copyFileSync(src, dest);
  console.log(`[sync-public] ${path.relative(process.cwd(), dest)} updated`);
} catch (err) {
  // Never fail the dev/build run over this — just say what went wrong.
  console.warn(`[sync-public] Could not copy live-logs-server.js: ${err.message}`);
}
