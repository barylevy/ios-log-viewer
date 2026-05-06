/**
 * Browser port of `mergeLogs.py` (sdp/apple/CatoVPN/Scripts/mergeLogs.py).
 *
 * Takes a flat list of File objects (each with `webkitRelativePath`) from a
 * folder picker, classifies them into known Cato Apple-client log sources,
 * sorts each source chronologically, and produces:
 *   - One merged output file per source (e.g. AppLogs.log).
 *   - A cross-source merged.log with [TAG] markers (selected sources only).
 *   - A list of "passthrough" files that should be copied as-is.
 *
 * Mirrors the Python logic 1:1 except that it works on in-memory File objects.
 */

// ---------------------------------------------------------------------------
// Timestamp parsers
// ---------------------------------------------------------------------------

const CATO_TS_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}:\d{3})\s/;
const DEM_TS_RE = /^\[(\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\]/;

/** Parse `YYYY-MM-DD HH:MM:SS:mmm ...` → ms since epoch, or null. */
export function parseCatoTimestamp(line) {
  const m = CATO_TS_RE.exec(line);
  if (!m) return null;
  const raw = m[1]; // 2026-04-28 23:14:36:308
  const iso = raw.slice(0, 19).replace(' ', 'T') + '.' + raw.slice(20);
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Parse `[MM/DD/YY HH:MM:SS.mmm] ...` → ms since epoch, or null. */
export function parseDemTimestamp(line) {
  const m = DEM_TS_RE.exec(line);
  if (!m) return null;
  // MM/DD/YY HH:MM:SS.mmm
  const [datePart, timePart] = m[1].split(' ');
  const [mm, dd, yy] = datePart.split('/').map(s => parseInt(s, 10));
  const fullYear = 2000 + yy;
  const [hh, mi, rest] = timePart.split(':');
  const [ss, ms] = rest.split('.');
  const t = Date.UTC(
    fullYear, mm - 1, dd,
    parseInt(hh, 10), parseInt(mi, 10), parseInt(ss, 10), parseInt(ms, 10),
  );
  return Number.isFinite(t) ? t : null;
}

// ---------------------------------------------------------------------------
// Source configuration — matches mergeLogs.py SOURCES exactly
// ---------------------------------------------------------------------------

export const SOURCES = [
  {
    key: 'ext',
    folderName: 'AppExtensionLogs',
    tag: 'EXT',
    outputFilename: 'NetworkExtensionLogs.log',
    parseTs: parseCatoTimestamp,
    loosePattern: /^(?:CatoNetworks\.CatoVPN\.)?CatoVPNNEExtenstion.*\.log$/,
  },
  {
    key: 'app',
    folderName: 'AppLogs',
    tag: 'APP',
    outputFilename: 'AppLogs.log',
    parseTs: parseCatoTimestamp,
    loosePattern: /^(?:CatoNetworks\.)?CatoVPN .*\.log$/,
  },
  {
    key: 'dnsrelay',
    folderName: 'DNSExtensionLogs',
    tag: 'DNS',
    outputFilename: 'DNSExtensionLogs.log',
    parseTs: parseCatoTimestamp,
  },
  {
    key: 'dem',
    folderName: 'DemLogs',
    tag: 'DEM',
    outputFilename: 'DemLogs.log',
    parseTs: parseDemTimestamp,
  },
  {
    key: 'daemon',
    folderName: 'daemon_log.txt',
    tag: 'DAEMON',
    outputFilename: 'daemon_log.txt',
    parseTs: parseCatoTimestamp,
  },
];

const SOURCE_BY_KEY = Object.fromEntries(SOURCES.map(s => [s.key, s]));

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single file's text into entries: { ts, tag, lines: string[] }.
 * Continuation lines (no timestamp) attach to the previous entry.
 */
export function parseLogText(text, tag, parseTs) {
  const entries = [];
  let current = null;
  let lastTs = -Infinity;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    const ts = parseTs(line);
    if (ts !== null) {
      if (current) entries.push(current);
      lastTs = ts;
      current = { ts, tag, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      entries.push({ ts: lastTs, tag, lines: [line] });
    }
  }
  if (current) entries.push(current);
  return entries;
}

// ---------------------------------------------------------------------------
// Source discovery from a flat File[] (from <input webkitdirectory>)
// ---------------------------------------------------------------------------

/**
 * Walk `webkitRelativePath` of every file and partition them into source
 * buckets.  Mirrors `discover_sources` + `unwrap_single_dir` from the Python.
 *
 * @param {File[]} files
 * @returns {{
 *   fileMap: Record<string, File[]>,
 *   passthrough: File[],
 *   baseDir: string,
 * }}
 */
export function discoverSources(files) {
  if (!files.length) {
    return { fileMap: {}, passthrough: [], baseDir: '' };
  }

  // Strip the leading folder name (the picked directory itself) so paths are
  // relative to the bundle root — same effect as `unwrap_single_dir`.
  const firstPath = files[0].webkitRelativePath || files[0].name;
  const root = firstPath.split('/')[0];
  const stripRoot = (p) => {
    if (!p) return p;
    const parts = p.split('/');
    return parts[0] === root ? parts.slice(1).join('/') : p;
  };

  const fileMap = Object.fromEntries(SOURCES.map(s => [s.key, []]));
  const consumed = new Set(); // relative paths we've claimed
  const passthrough = [];

  // 1) Subdirectory-based sources (AppLogs/, AppExtensionLogs/, …)
  for (const src of SOURCES) {
    if (src.folderName.endsWith('.txt') || src.folderName.endsWith('.log')) {
      continue; // single-file sources, handled below
    }
    for (const f of files) {
      const rel = stripRoot(f.webkitRelativePath || f.name);
      if (!rel) continue;
      const parts = rel.split('/');
      // accept either "<folder>/file" or "<anything>/<folder>/file" (one level deeper)
      const idx = parts.indexOf(src.folderName);
      if (idx >= 0 && idx === parts.length - 2 && !parts[parts.length - 1].startsWith('.')) {
        fileMap[src.key].push(f);
        consumed.add(rel);
      }
    }
  }

  // 2) Single-file sources at the root (daemon_log.txt)
  for (const src of SOURCES) {
    if (!src.folderName.endsWith('.txt') && !src.folderName.endsWith('.log')) continue;
    for (const f of files) {
      const rel = stripRoot(f.webkitRelativePath || f.name);
      if (!rel || consumed.has(rel)) continue;
      const parts = rel.split('/');
      const last = parts[parts.length - 1];
      // accept at root or one level deep (mirrors find_item)
      if (last === src.folderName && parts.length <= 2) {
        fileMap[src.key].push(f);
        consumed.add(rel);
      }
    }
  }

  // 3) Loose patterns at the root: classify root-level files by regex.
  for (const f of files) {
    const rel = stripRoot(f.webkitRelativePath || f.name);
    if (!rel || consumed.has(rel)) continue;
    const parts = rel.split('/');
    if (parts.length !== 1) continue; // root-level only
    const name = parts[0];
    if (name.startsWith('.')) continue;
    const matched = SOURCES.find(s => s.loosePattern && s.loosePattern.test(name));
    if (matched) {
      fileMap[matched.key].push(f);
      consumed.add(rel);
    }
  }

  // 4) Everything else is passthrough.
  for (const f of files) {
    const rel = stripRoot(f.webkitRelativePath || f.name);
    if (!rel || consumed.has(rel)) continue;
    const parts = rel.split('/');
    if (parts[parts.length - 1].startsWith('.')) continue;
    passthrough.push(f);
  }

  // Sort each bucket by filename (natural sort) for stable output.
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  for (const key of Object.keys(fileMap)) {
    fileMap[key].sort((a, b) => collator.compare(a.name, b.name));
  }

  return { fileMap, passthrough, baseDir: root };
}

// ---------------------------------------------------------------------------
// Merge phases
// ---------------------------------------------------------------------------

const CONTINUATION_INDENT = ' '.repeat(24);

function formatTaggedLine(tag, line) {
  for (const re of [CATO_TS_RE, DEM_TS_RE]) {
    const m = re.exec(line);
    if (m) {
      const pos = m[0].length; // includes trailing space (CATO) / nothing (DEM)
      return `${line.slice(0, pos)}[${tag}]${pos < line.length && line[pos] !== ' ' ? ' ' : ''}${line.slice(pos)}`;
    }
  }
  return `[${tag}] ${line}`;
}

/**
 * Run the full merge. Returns the artifacts ready for writing.
 *
 * @param {File[]} files            All files from a folder picker.
 * @param {string[]} mergeSelected  Source keys included in merged.log
 *                                  (default ['app','ext'] like the Python).
 */
export async function mergeLogs(files, mergeSelected = ['app', 'ext']) {
  const { fileMap, passthrough, baseDir } = discoverSources(files);

  // Per-source parse + sort
  const sourceEntries = {};   // key -> entries[]
  const perSourceOutput = {}; // outputFilename -> string

  for (const src of SOURCES) {
    const list = fileMap[src.key] || [];
    if (!list.length) continue;

    const entries = [];
    for (const f of list) {
      const text = await f.text();
      entries.push(...parseLogText(text, src.tag, src.parseTs));
    }
    if (!entries.length) continue;

    entries.sort((a, b) => a.ts - b.ts);
    sourceEntries[src.key] = entries;

    let body = '';
    for (const e of entries) {
      for (const ln of e.lines) body += ln + '\n';
    }
    perSourceOutput[src.outputFilename] = body;
  }

  // Cross-source merged.log
  const allEntries = [];
  const producedTags = [];
  for (const key of mergeSelected) {
    if (sourceEntries[key]) {
      allEntries.push(...sourceEntries[key]);
      producedTags.push(SOURCE_BY_KEY[key].tag);
    }
  }

  let mergedText = null;
  if (allEntries.length) {
    allEntries.sort((a, b) => a.ts - b.ts);

    const infoFile = passthrough.find(f => {
      const rel = (f.webkitRelativePath || f.name).split('/').pop();
      return rel === 'info.txt';
    });
    let header = '';
    if (infoFile) header += (await infoFile.text()).trim() + '\n';
    header += `Merged sources: ${producedTags.join(', ')}\n`;
    header += '='.repeat(72) + '\n\n';

    let body = '';
    for (const e of allEntries) {
      body += formatTaggedLine(e.tag, e.lines[0]) + '\n';
      for (let i = 1; i < e.lines.length; i++) {
        body += `${CONTINUATION_INDENT}[${e.tag}] ${e.lines[i]}\n`;
      }
    }
    mergedText = header + body;
  }

  // Counts for the summary
  const counts = {};
  for (const tag of producedTags) {
    counts[tag] = allEntries.reduce((n, e) => n + (e.tag === tag ? 1 : 0), 0);
  }

  return {
    baseDir,
    perSource: perSourceOutput,        // { 'AppLogs.log': '...', ... }
    merged: mergedText,                // string | null
    passthrough,                       // File[] to copy as-is
    counts,                            // { APP: N, EXT: M, ... }
    totalEntries: allEntries.length,
    producedTags,
    fileMap,                           // for diagnostics
  };
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------

/**
 * Write the merge result into a directory chosen via the File System Access
 * API. Requires a Chromium-based browser. Returns the directory handle on
 * success.
 */
export async function writeMergeToDirectory(result, dirHandle) {
  const writeFile = async (relPath, contents /* string|Blob */) => {
    const parts = relPath.split('/');
    let dir = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
  };

  for (const [name, content] of Object.entries(result.perSource)) {
    await writeFile(name, content);
  }
  if (result.merged !== null) {
    await writeFile('merged.log', result.merged);
  }
  for (const f of result.passthrough) {
    const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
    await writeFile(rel, f);
  }
}

/**
 * Fallback when File System Access API isn't available: trigger a download
 * for each generated file. The browser will save them to the default
 * downloads folder.
 */
export function downloadMergeAsFiles(result) {
  const trigger = (name, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  for (const [name, content] of Object.entries(result.perSource)) {
    trigger(name, new Blob([content], { type: 'text/plain' }));
  }
  if (result.merged !== null) {
    trigger('merged.log', new Blob([result.merged], { type: 'text/plain' }));
  }
}
