# Viewer features and source guide

See the [project README](../../README.md) for setup, architecture, TypeScript conventions, validation commands, privacy, limits, and live-log pairing.

## File handling

Use **Open Files**, drag and drop, or the operating system's file-open integration. Folder imports group related logs by directory and detected format. Archives are expanded in memory; metadata files such as AppleDouble resources are ignored. A combined **All Files** view sorts records across tabs while preserving each record's source identity.

## Filtering and search

Filter reduces the visible records. Search highlights and navigates matches without removing records. Both use the same parser:

```text
error || warning
error && timeout
(error && timeout) || (warning && !heartbeat)
"connection lost"
#415 :: #600
#2026-10-31 :: #2026-11-01
#415 :: #2026-11-01
#gap=5
#gap=5 || error
```

`&&` binds more tightly than `||`; parentheses group expressions. Negation applies to its term or group. Quotes preserve spaces and operators as literal text. Regex and case-sensitivity modes are available for both fields. Invalid expressions show an error. Date/row ranges constrain the whole query; a date-only upper bound includes the entire day. Gap predicates require a previous record and therefore exclude the first record.

Level and module filters further constrain the result. Context lines include surrounding records without duplicating overlapping windows.

## Records

The virtualized list supports column visibility, ordering, resizing, text scaling, record expansion, date navigation, bookmarks, pivot timestamps, context menus, and a Go to Line action. Log details show raw text or embedded JSON, support previous/next navigation, and provide copy and bookmark actions. Exports retain raw source text.

`LogListView.tsx` owns list interactions and presentation. `LogViewer.tsx` coordinates tabs and imports. `LogViewerFilters.tsx` owns the filter controls and saved presets. These typed components use the model and domain functions described in the project README.

## Persistence

Per-file filters and bookmarks are local preferences. Open-log sessions are stored separately in IndexedDB with 24-hour retention and an explicit settings switch. Disabling restoration clears stored sessions across tabs. Restored tabs retain their parsed records; merging an original support bundle requires reopening its source files.

## Tests

Use `npm test` from the repository root, or `npm run test:run` from `client`. Use `npm --prefix client run test:ui` for the test UI. The old wrapper scripts and references to nonexistent test suites have been removed.
