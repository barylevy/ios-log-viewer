# Cato Client Log Viewer

A local-first viewer for Apple, Windows, Linux, Android, and socket logs. File contents are processed in the browser. Live logs on Windows and macOS use a loopback service installed once from the viewer.

## Run

Use Node 22.13+ or Node 24+.

```sh
npm --prefix client ci
npm run dev
```

Open http://127.0.0.1:3000. Build with `npm run build`.

## Validate a change

```sh
npm run check
```

This runs strict TypeScript checks, lint, tests, and the production build. The build itself also checks TypeScript. Run `npm --prefix client run format` to format the TypeScript files, or `npm --prefix client run format:check` to check formatting.

The tests cover source-format fixtures, timestamps, filtering, search, stable merge identities, state transitions, live reads, archive limits, session retention, safe text rendering, dialogs, and live-server access control. Fixture expectations are read explicitly: malformed JSON fails the suite, and raw examples without expectations must still be recognized.

## Read the code

Start with these files:

| File | Responsibility |
| --- | --- |
| `client/src/domain/logRecord.ts` | Explicit record, filter, header, and bookmark types |
| `client/src/useLogsModel.ts` | Viewer state and commands, expressed as a typed reducer |
| `client/src/domain/logQuery.ts` | One grammar for filtering, search navigation, and highlights |
| `client/src/domain/timestamps.ts` | Validated timestamp conversion, including source offsets |
| `client/src/domain/combineLogs.ts` | Sorting and merging without changing source identities |
| `client/src/domain/logNavigation.ts` | Shared nearest-line navigation for bookmarks and the line dialog |
| `client/src/domain/liveLogBuffer.ts` | Incremental parsing and bounded live retention |
| `client/src/domain/parseFile.ts` | File/header parsing shared by the worker and fallback |
| `client/src/services/logParserClient.ts` | Queued background parsing for large files |
| `client/src/utils/sessionStorage.ts` | IndexedDB transactions and expiry cleanup |
| `client/src/components/ViewerDialog.tsx` | Shared Material UI dialog behavior |

For a Swift/C++/Java developer:

- An `interface` describes a data record, like a Swift struct's public shape. Optional fields use `?`; absent values use `null` or `undefined` as declared.
- `Action` is a tagged union, similar to a Swift enum with associated values. The reducer's `switch` handles every supported action.
- The reducer returns the next state instead of mutating the old state. This is how React knows which views need updating.
- Domain functions are ordinary typed functions. They do not depend on React, browser rendering, or component lifecycle.
- Hooks connect those functions to the UI. `useMemo` caches derived data; `useEffect` manages external resources or persistence.

All application source and tests under `client/src` use strict TypeScript. `allowJs` is disabled, and unused local variables and parameters fail the type check. React components declare their props, DOM references, and state types; external file/HTTP data is validated before use. The standalone downloadable Node server, service worker, and Node tool configurations remain JavaScript because their runtimes consume them directly.

## UI

React 19, Material UI 9, Tailwind 3, TanStack Table, and React Virtuoso. MUI supplies shared dialogs, focus management, theming, and the retention switch. The dense log list keeps its existing virtualized rendering. Tailwind remains for the existing layout; this is a gradual component migration rather than a visual redesign.

## Files, privacy, and limits

- Open `.log`, `.txt`, and `.ips` files, folders, `.zip`, and `.tar.xz` archives.
- Ordinary file parsing above 1 MB runs in a Web Worker. Parsing jobs are queued to bound concurrent memory use, with a 30-second timeout.
- Individual log files are limited to 256 MB.
- Archives are limited to 256 MB compressed, 512 MB expanded in total, 128 MB per extracted file, and 10,000 files. Tar headers and paths are validated.
- Live sessions keep at most 20,000 records and approximately 2 million text characters per source. Appends reparse only the final incomplete record. Older live records are evicted; export logs before the retention window fills if you need a complete history.
- Open logs can be restored for 24 hours. Disable **Settings → Remember logs for 24 hours** to delete stored sessions and stop writing them. Bookmarks and filter preferences are separate local preferences.
- Expired sessions from every browser tab are deleted during session reads and saves. Expiry cleanup runs when the app is used; it is not a background browser timer.
- Log messages and process/thread metadata render as text, including strings that resemble HTML.

Dates without a year use the current year. Ambiguous numeric dates are inferred from the file and fall back to day/month/year. Unlabelled legacy macOS process/thread fields retain the existing numeric heuristic; explicit `[t:...]` and `[p:...]` fields are unambiguous. Four contradictory macOS fixture expectations were aligned with adjacent records using that same established field-order heuristic.

## Live logs

Inside the macOS Cato Client, enable Developer mode, choose **Window → Open Log Viewer**, then click **Live Log**. A compatible client exposes `window.webkit.messageHandlers.clientLiveLogs`; the viewer automatically uses that native transport instead of the local service. The client and its installed privileged helper must both include the native live-log API, and this frontend version must be deployed to the hosted viewer.

The promise-based bridge accepts `{ action: 'start' | 'read' | 'stop' }`. Reads return updates shaped as `{ sourceKey, label, type: 'reset' | 'append', content }`. Swift owns the file cursors and accepts no paths from JavaScript. Sources are fixed to the client, user agent, tunnel, DNS, anti-tamper, helper, and installation logs. Each read is bounded to 256 KiB per source; initial reads and rotations return the recent tail of the newest log file, and subsequent reads return complete appended lines. The UI retains its existing live buffer limits.

The native wrapper accepts bridge messages only from the main frame of `https://cato-client-log-viewer.vercel.app`, with Developer mode active. Reads stop on disconnect, navigation, window teardown, or leaving Developer mode. Log contents are made available to that hosted page; do not add arbitrary filesystem or command execution operations to the bridge. A missing or outdated helper surfaces an error in the viewer.

In a standalone browser, the viewer uses the local service below.

On macOS, live logs need a one-time install from the in-app **Set Up Live Logs** dialog. It downloads `cato-live-logs-mac-install.sh` and `cato-live-logs-mac-server.pl` into `~/.cato-live-logs-setup` and runs the installer with sudo. The installer registers a root LaunchDaemon (`local.cato-log-viewer.live-logs`) that runs the server with the system `/usr/bin/perl` (core modules only, nothing else installed). The server reads the Cato logs in place and streams them over the same WebSocket protocol as the Windows server, on `127.0.0.1:4000` only. It accepts only the hosted viewer origin (`https://cato-client-log-viewer.vercel.app`, always allowed), the origin the install ran from, and the pairing token(s) stored in `/Library/Application Support/CatoLogViewerLiveLogs/config` (root-only). Logs under the user's home are read with the user's identity, and no path or command is taken from clients. After installing, **Live Log** connects with no folder or terminal. Running the command from another browser adds that browser's token. **Settings ▸ Live Logs Service** has a **Reinstall / Update** button (copies the install command, to update the service or pair the current browser) and the uninstall command `sudo bash '/Library/Application Support/CatoLogViewerLiveLogs/install.sh' uninstall` (the installer keeps that root-owned copy of itself). The server's own log is `/Library/Logs/cato-log-viewer-live-logs.log`.

On Windows, live logs also need a one-time install from the **Set Up Live Logs** dialog, pasted into PowerShell. It downloads `cato-live-logs-win-install.ps1`, which installs Node.js with winget if it is missing, sets up `live-logs-server.js` and its `ws` dependency under `%LOCALAPPDATA%\CatoLogViewerLiveLogs`, and starts it hidden now and at every sign-in (an `HKCU\...\Run` entry). No administrator rights are needed. The pairing origin and token are merged into `~/.cato-live-logs.json`, so running the command from another browser adds that browser; the hosted viewer origin is always allowed. It reads the installed client's logs (`Cato Networks\Cato Client` under `Program Files (x86)` or `Program Files`) automatically; a different folder, such as a dev build, can be set in **Settings ▸ Live Logs Settings**, which also has **Reinstall / Update** and the uninstall command `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\CatoLogViewerLiveLogs\uninstall.ps1"`, which runs `cato-live-logs-win-uninstall.ps1` (the installer keeps it there; it stops the server, removes the Run entry, the folder and the pairing file; Node.js stays). The server's output is in `server.log` in that folder.

To start the server by hand instead (development):

```sh
npm --prefix scripts ci
node scripts/live-logs-server.js --origin=https://your-viewer.example --dir="C:\\path\\to\\logs"
```

Paste the token printed by the server into **Settings → Live Logs Settings → Live server pairing token**. For local development, the default allowed origins are localhost/127.0.0.1 on ports 3000 and 5173. The server listens only on `127.0.0.1:4000`, validates the Host and exact Origin, and requires pairing for every request, health check included. The health check contains no log data.

Edit the source scripts under `scripts/`. `predev` and `prebuild` regenerate their downloadable copies under `client/public`; synchronization failures fail the command.

There is currently no AI chat route or AI API-key setting.
