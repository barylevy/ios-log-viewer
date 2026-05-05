# iOS Log Viewer — Full Feature Reference

A standalone single-page log viewer built with React, Tailwind CSS, and react-virtuoso. Designed to analyse iOS/macOS/Windows/Linux/Android client logs in the browser with zero server dependency.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Supported Log Formats](#supported-log-formats)
3. [File Management](#file-management)
4. [Log Display & Columns](#log-display--columns)
5. [Filtering & Searching](#filtering--searching)
6. [Log Navigation & Interaction](#log-navigation--interaction)
7. [Log Detail Modal](#log-detail-modal)
8. [AI Chat](#ai-chat)
9. [Dark Mode](#dark-mode)
10. [Settings & Preferences](#settings--preferences)
11. [Session Persistence](#session-persistence)
12. [Keyboard Shortcuts](#keyboard-shortcuts)
13. [File Structure](#file-structure)
14. [Architecture Notes](#architecture-notes)

---

## Getting Started

```bash
cd ios-log-viewer/client
npm install
npm run dev
```

Navigate to `http://localhost:5173`.

Routes:
- `/` — Main log viewer
- `/ai-chat` — Standalone AI chat page

---

## Supported Log Formats

Format is auto-detected on load. Date format (MM/DD/YY vs DD/MM/YY) is also auto-detected.

| Format | Example |
|--------|---------|
| **iOS / macOS (explicit level)** | `2025-05-23 12:34:56:789 [MainView:123] [D] [t:456] [p:789] message` |
| **iOS / macOS (implicit level)** | `2025-05-23 12:34:56:789 [MainView:123] [thread] [process] message` |
| **Windows (bracket hex)** | `[07/04/25 14:00:00.123] [I] [Module] [0x1a2b:0x3c4d] [fn:line] message` |
| **Windows (no-brackets decimal)** | `07/04/25 14:00:00.123 [I] [Module] [PID:TID] [fn:line] message` |
| **Windows (unified — account:user)** | `09/01/26 18:16:49.013 [D] [Routing] [1474:2788] [fn:82] [:] [p:acct]` |
| **Windows (simple)** | `MM/DD/YY HH:MM:SS.SSS [ ] [ ] [PID:TID] message` |
| **Linux** | `2025-08-04 11:18:00 [I][client][fn:line][:][:][_:] message` |
| **Android (Cato)** | `[2025-07-04 14:00:00.123] [thread] [Module] - [D] - message` |
| **Android (System)** | `07-04 14:00:00.123 PID TID D Module: message` |
| **Chrome** | `[PID:TID:MMDD/HHMMSS.SSS:LEVEL:file.cc(line)] message` |

---

## File Management

### Opening Files

The header **"Open Files" dropdown** offers two options via `FileSelectionModal`:

| Option | Description |
|--------|-------------|
| **Select Individual Files** | Standard file-picker; multiple files can be selected at once |
| **Select Entire Folder** | Directory picker (`webkitdirectory`); all `.log`, `.txt`, `.ips` files inside are loaded |

Accepted extensions: `.log`, `.txt`, `.ips`

### Automatic File Grouping

When multiple files are selected from the same folder:

- Files with a common numeric-sequence prefix (e.g., `cato.1.log`, `cato.2.log`, `cato.3.log`) are **grouped into a single tab** and merged in natural sort order.
- Files in **separate subdirectories** each become one merged group (only files with valid log extensions are included; non-log files like `.pcap` are filtered out).
- Within a single flat directory, files are grouped by prefix.
- Files at the **root** of a picked folder (next to subfolders) are treated as root-level and each becomes its own tab named after the file.

#### Pattern-aware splitting

After directory/prefix grouping, each multi-file group is **split by detected log format** so only files sharing the same pattern share a tab:

- The first ~16 KB of every file is parsed with `parseLogFormat`.
- All files with the same known format → kept merged.
- Mixed formats → split into one sub-group per format (tab key becomes `dir [format]`).
- Files whose content doesn't match any known pattern (free-form text, `.ips` crash dumps, `netstat.txt`, etc.) → **each becomes its own single-file tab**, even when they sit in the same folder.

Grouping logic: `utils/fileGrouping.js` — `groupFilesByPrefix()`, `groupFilesByDirectory()`, `groupFilesByDirectoryAndFormat()`, `detectFileFormat()`

### File Tabs (`LogTabs.jsx`)

- Each file or group shows as a tab with a **close (×)** button
- Active tab: blue border + highlighted background; inactive: hover effects
- A **"All Files"** combined-view tab (green) appears automatically when 2+ files are open
- **Loading spinner** shown while a file is being parsed
- **"Close All"** button removes every open tab at once

---

## Log Display & Columns

### Togglable Columns

Managed via the **Column Settings** modal (`ColumnSettings.jsx`). Column state saved to `localStorage` key `logViewerColumns`.

| Column ID | Label | Default | Notes |
|-----------|-------|---------|-------|
| `timestamp` | Timestamp | ✅ visible | `displayTime` (HH:MM:SS.mmm) |
| `lineNumber` | Line # | ✅ visible | Original line number in source file |
| `logLevel` | Level | ✅ visible | Colour-coded label |
| `message` | Message | always | Cannot be hidden |
| `module` | Module | ✅ visible | Source module/class name |
| `sourceFile` | Source file | ✅ visible | For merged views |
| `processThread` | P:T | ✅ visible | Process : Thread IDs |
| `timeGap` | Time Gap | ✅ visible | Seconds gap from previous log |

### Log Level Colours

| Level | Colour |
|-------|--------|
| Error | red (`text-red-600`) |
| Warning | yellow (`text-yellow-600`) |
| Info | blue (`text-blue-600`) |
| Debug | green (`text-green-600`) |
| Verbose | purple (`text-purple-600`) |

### Process / Thread Colouring

- Each unique process ID receives a consistent colour from a 10-colour palette (violet, amber, pink, teal, orange…)
- Thread IDs get colours from the same palette independently
- Hovering a P:T cell shows a tooltip: **"Process Type: X (ID: Y) | Module: Z | Thread ID: T"**
- A visual change indicator appears when process or thread ID changes between consecutive rows

### Time Gap Column

Shows the number of seconds elapsed since the previous log entry. Populated by comparing `timestampMs` values. Only non-zero when a `#gap=<N>` filter is active or the gap column is enabled.

### Message Expand / Collapse

Log rows with messages longer than ~3 lines (or 300 characters) show an **▼ expand button**. Clicking expands the row to show the full message. Clicking again collapses it.

### Dual Filter Highlights

- **Filter terms** (from the filter field) are highlighted in **blue** (`bg-blue-200`)
- **Search query terms** (from the search field) are highlighted in **green, bold** (`bg-green-200 font-bold`)

### Sticky Log Markers

Bookmarked rows display a **yellow left border** and yellow background tint.

### Pivot Log Marker

The pivot row displays a **teal/green (#008C73) left border** and tinted background.

### Continuation Lines

Log lines without a timestamp are grouped with the preceding log entry, inheriting its metadata. Displayed below the parent with reduced opacity.

---

## Filtering & Searching

### Two Independent Fields

| Field | Highlight colour | Purpose |
|-------|-----------------|---------|
| **Filter** | Blue | Reduces visible log lines |
| **Search / Highlight** | Green + bold | Highlights within the filtered set; Prev/Next navigation |

Both fields support **Text** and **Regex** mode (dropdown switch).

Mode is persisted to `localStorage`:
- `logViewer_filterMode`
- `logViewer_searchMode`

### Filter / Search History

Each field has a **▾ history chevron** button. Clicking it opens a dropdown of the last **50 phrases** typed (saved per phrase via `||` splitting).

| Action | Result |
|--------|--------|
| Click a phrase | Appended to current field with `||` |
| Clear History | Removes all history items |

Storage keys:
- `logViewer_filterHistory`
- `logViewer_searchHistory`

### Filter Syntax

```
# Boolean / text
error || warning          OR logic
!heartbeat                Exclude lines containing "heartbeat"
"connection lost"         Exact phrase

# Row range
#415 ::                   From line 415 to end
:: #600                   From start to line 600
#415 :: #600              Lines 415–600

# Date / time range (multiple precision levels)
#2025-07-04 ::
:: #2025-07-05
#2025-07-04 :: #2025-07-05
#2025-07-04 14:19:44 ::
#2025-07-04 14:19:44.540 :: #2025-07-04 15:00:00

# Time gap
#gap=5                    Show only entries with ≥5 s gap from previous

# Combined
error || #2025-07-04 :: #2025-07-05
!debug || #100 :: #500
#gap=3 || error
```

### Log Level Filter

**Multi-select dropdown** ("All Levels" or any combination of Error / Warning / Info / Debug / Verbose). Applied independently of the text filter.

### Module Filter

Dropdown populated from modules present in the loaded file.

### Context Lines

Numeric field: expands each matched row to include ±N surrounding lines for context.

### Pivot Gap in Filter Bar

When a **Pivot Time** is set (via right-click → Set Pivot Time), the filter bar shows the time gap between the pivot log and the currently hovered log:

```
⏱ Pivot: #1234  →  Gap: 0 Days, 00:01:23.456
```

---

## Log Navigation & Interaction

### Sticky Date Header

A floating header above the log list shows the current visible date. **← Prev Day** / **Next Day →** buttons jump to the first log line of each date within the filtered set.

### Pivot Time

| Action | Description |
|--------|-------------|
| Right-click → **Set Pivot Time** | Marks a log as the time reference point |
| Right-click → **Clear Pivot Time** | Removes the pivot marker |
| Hover another log | Filter bar shows the time gap from the pivot |

Pivot is saved to `localStorage` key `logViewer_pivotLog`.

### Context Menu (right-click a row)

| Item | Effect |
|------|--------|
| Sticky Log Line | Bookmark this log |
| Set as "From" log line index | Sets `#<n> ::` range start |
| Set as "To" log line index | Sets `:: #<n>` range end |
| Set "From" date | Sets `#<date> ::` date range start |
| Set "To" date | Sets `:: #<date>` date range end |
| Set Pivot Time | Sets this log as the pivot reference |
| Clear Pivot Time | Removes the pivot (shown only if pivot is set) |

### Sticky Logs

Bookmarked log lines shown in a collapsible sidebar panel.

- Click a sticky log to scroll the list to that line
- **Double-click the title** to rename it
- Delete individually or **clear all** at once
- Saved to `localStorage` key `logViewerStickyLogs`

---

## Log Detail Modal

Click any row to open the detail modal (`LogModal.jsx`).

**Metadata section**:
- Timestamp (formatted as `DD-Mon-YYYY HH:MM:SS.mmm`)
- Process ID / Process Type
- Log Line number
- Module
- Thread ID
- Source file

**View modes** (tabs):

| Mode | Description |
|------|-------------|
| **Text** | Raw log message as plain text |
| **JSON** | If JSON is detected in the message — pretty-printed tree view |

**JSON Tree View** (`JsonTreeViewer.jsx`):
- Expand / Collapse individual nodes
- **Expand All** / **Collapse All** buttons
- **Search within JSON** — highlights matching keys/values in yellow
- Shows prefix and suffix text around the embedded JSON

**Navigation**:
- **← / → arrow keys**: previous / next log
- **Previous / Next** buttons (disabled at boundaries)
- **Escape**: close

**Actions**:
- **Copy**: copies JSON (in JSON mode) or full raw text
- **Add as Sticky Log Line**: bookmarks the log and closes modal

---

## AI Chat

### Integrated Side Panel (`AIChat.jsx`)

Shown on the right side of the log viewer via a toggle button.

| Feature | Detail |
|---------|--------|
| **Resize** | Drag the left edge to adjust panel width (default 400 px) |
| **Maximize** | Toggle to full-width view |
| **Context** | First 100 filtered log lines sent as context with each message |
| **Model** | `gpt-4o-mini`, temperature 0.3, max 1500 tokens |

**AI Chat Display Dropdown** (`AIChatDisplayDropdown.jsx`): button to choose where to open the chat:
- Side panel (default)
- New browser tab (`/ai-chat` route)
- New popup window

### Standalone AI Chat Page (`AIChatPage.jsx`)

Route: `/ai-chat`

- Full-width chat interface
- Receives log data via:
  1. `sessionStorage` keys: `aiChatLogs`, `aiChatFileName`
  2. URL params: `?logs=&fileName=`
  3. `postMessage` from parent window: `{ type: 'LOG_DATA', logs, fileName }`

### Message Types

| Type | Style |
|------|-------|
| User | Blue background, right-aligned |
| Assistant | Grey background, left-aligned |
| System | Light-blue background with info icon |
| Error | Red background |

**Input**: multi-line textarea; Enter sends, Shift+Enter for newline.

### AI Configuration Settings (`Settings.jsx`)

Opened via the gear icon in the header.

| Setting | Description |
|---------|-------------|
| **OpenAI API Key** | Password field with show/hide toggle. Stored encrypted (base64) in `localStorage` key `openai_api_key_enc`. |
| **Custom Context Message** | Textarea to override the default system prompt. Reset to Default button. Saved to `localStorage` key `ai_context_message`. |

---

## Dark Mode

Toggle via the **moon / sun icon** in the header.

- On first load: checks `localStorage` key `theme`, then falls back to `prefers-color-scheme`
- Applies/removes the `dark` class on `<html>`
- Tailwind `dark:` variants used throughout

---

## Settings & Preferences

### Header Settings Menu (gear icon dropdown)

| Option | Description |
|--------|-------------|
| About | App info, feature list, contact email, Slack DM link |
| AI Configuration | OpenAI key + custom context |
| Column Settings | Toggle which columns are visible |
| Theme | Dark / Light mode toggle |
| Clear Cache | Clears **all** localStorage + IndexedDB (preserves API key and theme). Prompts for confirmation. Reloads page after clearing. |

---

## Session Persistence

State is persisted to **IndexedDB** so refreshing the page restores the previous session.

Each browser tab has its own unique session key (stored in `sessionStorage`, unique per tab). Sessions expire after **24 hours**.

**What is saved:**

| Data | Storage |
|------|---------|
| Open file tabs | IndexedDB |
| Active tab index | IndexedDB |
| Combined-view flag | IndexedDB |
| Log data per file | IndexedDB |
| File header metadata | IndexedDB |
| Per-file filters | localStorage (`logViewerFilters`) |
| Sticky logs per file | localStorage (`logViewerStickyLogs`) |
| Column visibility | localStorage (`logViewerColumns`) |
| Pivot log | localStorage (`logViewer_pivotLog`) |
| Filter/search mode | localStorage (`logViewer_filterMode/searchMode`) |
| Filter/search history | localStorage (`logViewer_filterHistory/searchHistory`) |
| Theme | localStorage (`theme`) |
| OpenAI API key | localStorage (`openai_api_key_enc`) |
| Custom AI context | localStorage (`ai_context_message`) |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + F` | Focus filter input and select all text |
| `↑ / ↓` arrow | In LogModal: move to previous / next log |
| `Escape` | Close open modals (LogModal, FileSelectionModal, ColumnSettings, About, AI Settings) |
| `Shift + Enter` | New line in AI chat textarea |
| `Enter` | Send message in AI chat |

---

## File Structure

```
client/src/
├── App.jsx                   React Router setup: routes / and /ai-chat
├── LogViewer.jsx             Top-level component: layout, state wiring
├── LogViewerHeader.jsx       Header bar: file open, metadata, settings dropdown
├── LogViewerFilters.jsx      Filter bar: text/regex filter & search, history dropdowns,
│                             level filter, module, context lines, sticky logs, pivot gap
├── LogTabs.jsx               Browser-style file tabs with combined-view and Close All
├── LogListView.jsx           Virtual log list (react-virtuoso): rows, sticky date header,
│                             context menu, dual highlights, expand/collapse, process colours
├── LogModal.jsx              Log detail modal: text/JSON view, JSON tree search, navigation
├── AIChat.jsx                AI chat side panel (OpenAI, resizable)
├── AIChatPage.jsx            Standalone /ai-chat route
├── ColumnSettings.jsx        Column visibility toggle modal
├── FileSelectionModal.jsx    File-vs-folder picker card UI
├── Settings.jsx              AI config: API key + custom context
├── AboutModal.jsx            App info, features, contact
├── LogParser.js              Multi-format log line parser
├── dateTimeUtils.js          Timestamp extraction (14+ patterns), date format detection
├── constants.js              LOG_LEVEL_MATRIX, CATO_COLORS
│
└── utils/
    ├── fileLoader.js          File reading, header extraction, ID generation
    ├── fileGrouping.js        Prefix-based + directory-based file grouping
    ├── sessionStorage.js      IndexedDB session save/load/clear
    ├── aiChatUtils.js         Open AI chat in new window / new tab via sessionStorage + postMessage
    ├── aiDisplayUtils.js      AI message rendering helpers
    ├── logLevelColors.js      Level → color mapping, message cleaning
    ├── logParsingUtils.js     Shared parsing primitives: GAP_PATTERN, CLEAN_PATTERNS
    └── processTypeMapper.js   Module name → process type (UI / Extn / Daemon / UsrAgnt)

components/
├── AIChatDisplayDropdown.jsx  Dropdown: choose side-panel / new tab / new window
├── JsonTreeViewer.jsx         Interactive JSON expand/collapse tree with search
└── StandaloneAIChat.jsx       Thin wrapper used by /ai-chat route

resources/
└── aiContext.js               Default AI system prompt
```

---

## Architecture Notes  

### State management (`useLogsModel.jsx`)

Central hook. All log data, filters, and derived state live here; components receive only what they need via props.

Key state:

| Field | Type | Description |
|-------|------|-------------|
| `logs` | `LogEntry[]` | Current file's parsed logs |
| `filteredLogs` | `LogEntry[]` | After applying all active filters |
| `filters` | `LogFilters` | `searchText`, `searchQuery`, `logLevel`, `selectedModule`, `contextLines`, `filterMode`, `searchMode` |
| `allFileLogs` | `Record<id, LogEntry[]>` | Cached logs per file |
| `allFileFilters` | `Record<id, LogFilters>` | Per-file filter state |
| `allFileStickyLogs` | `Record<id, StickyLog[]>` | Per-file bookmarks |
| `logFileHeaders` | `Record<id, HeaderInfo>` | Per-file metadata |
| `pivotLog` | `LogEntry \| null` | Current time-pivot reference |

### `LogEntry` fields

```js
{
  id, lineNumber, timestamp, timestampMs,
  displayDate, displayTime,
  level, module, message, raw,
  thread, process, processName,
  sourceFile, isContinuation, isContextLine,
  user, account, clientVersion, osVersion,
  baseId,  // original id before merge in combined view
}
```

### Filtering pipeline

`useLogsModel` applies filters in order:
1. Log level filter
2. Module filter
3. Text / regex filter (`searchText`)
4. Row range (`#415 :: #600`)
5. Date / time range
6. Time gap filter (`#gap=N`)
7. Context lines expansion

### Virtual Rendering

`react-virtuoso` renders only visible rows — handles 100 000+ lines smoothly.

### Combined View

Merges all open files, sorts by `timestampMs`, assigns unique IDs `${fileId}-${logId}` while preserving `baseId` and `sourceFile` for context menu and sticky log operations.
