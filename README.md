# Cato Client Log Viewer

A local-first viewer for Apple, Windows, Linux, Android, and socket logs. File contents are processed in the browser. Windows live logs use an optional loopback server; macOS live logs use a mirrored folder.

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

All application source and tests under `client/src` use strict TypeScript. `allowJs` is disabled. React components declare their props, DOM references, and state types; external file/HTTP data is validated before use. The standalone downloadable Node server, service worker, and Node tool configurations remain JavaScript because their runtimes consume them directly.

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

On macOS, follow the in-app mirror setup and choose `~/.cato_live_logs` in Chrome or Edge. The script needs sudo to read root-owned logs. Stop it in the terminal when finished.

On Windows, the in-app setup command configures both the viewer origin and pairing token. A manually started server requires those explicitly when using a hosted viewer:

```sh
npm --prefix scripts ci
node scripts/live-logs-server.js --origin=https://your-viewer.example --dir="C:\\path\\to\\logs"
```

Paste the token printed by the server into **Settings → Live Logs Settings → Live server pairing token**. For local development, the default allowed origins are localhost/127.0.0.1 on ports 3000 and 5173. The server listens only on `127.0.0.1:4000`, validates the Host and exact Origin, and requires pairing for configuration and WebSocket access. Its health check contains no log data.

Edit the source scripts under `scripts/`. `predev` and `prebuild` regenerate their downloadable copies under `client/public`; synchronization failures fail the command.

There is currently no AI chat route or AI API-key setting.
