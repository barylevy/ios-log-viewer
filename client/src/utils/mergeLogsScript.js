// Browser port of sdp/apple/CatoVPN/Scripts/mergeLogs.py.
//
// Input:  array of `File` objects (each with `webkitRelativePath` set).
// Output: a JSZip blob holding the same `<folder>_merged/` layout the python
//         script produces (per-source .log files, merged.log, plus
//         pass-through copies of every other file in the source folder).
//
// Logic mirrors mergeLogs.py 1:1 — keep them in sync.

import JSZip from 'jszip';

// ---------------------------------------------------------------------------
// Timestamp parsing
// ---------------------------------------------------------------------------

const CATO_TS_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}):(\d{3})\s/;
const DEM_TS_RE = /^\[(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/;

function parseCatoTimestamp(line) {
  const m = CATO_TS_RE.exec(line);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms);
}

function parseDemTimestamp(line) {
  const m = DEM_TS_RE.exec(line);
  if (!m) return null;
  const [, mo, d, y, h, mi, s, ms] = m;
  // 2-digit year: assume 2000+
  return Date.UTC(2000 + +y, +mo - 1, +d, +h, +mi, +s, +ms);
}

// ---------------------------------------------------------------------------
// Source configuration — same order/keys as the python script
// ---------------------------------------------------------------------------

const SOURCES = [
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

const SOURCE_BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s]));
const ALL_KEYS = SOURCES.map((s) => s.key);
const CONTINUATION_INDENT = ' '.repeat(24);

// ---------------------------------------------------------------------------
// Virtual filesystem built from the dropped/loaded files
// ---------------------------------------------------------------------------

// Build a tree:
//   { dirs: Map<name, node>, files: Map<name, File> }
// Returns { root, baseSegments } where baseSegments is the path inside the
// tree that we treat as the "input directory" (mirrors python's
// unwrap_single_dir).
function buildFsTree(files) {
  const root = { dirs: new Map(), files: new Map() };

  for (const f of files) {
    const rel = (f.webkitRelativePath || f.name).replace(/^\/+/, '').replace(/\\/g, '/');
    const segments = rel.split('/').filter(Boolean);
    if (!segments.length) continue;
    const fileName = segments.pop();
    let node = root;
    for (const seg of segments) {
      if (seg.startsWith('.')) { node = null; break; }
      let next = node.dirs.get(seg);
      if (!next) {
        next = { dirs: new Map(), files: new Map() };
        node.dirs.set(seg, next);
      }
      node = next;
    }
    if (node && !fileName.startsWith('.')) {
      node.files.set(fileName, f);
    }
  }

  // unwrap_single_dir: if root has exactly one dir and no files, descend.
  let base = root;
  const baseSegments = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const dirNames = Array.from(base.dirs.keys());
    if (dirNames.length === 1 && base.files.size === 0) {
      const only = dirNames[0];
      baseSegments.push(only);
      base = base.dirs.get(only);
      // Only unwrap once like the python helper — but be tolerant of
      // multiple wrappers added by the browser folder picker.
      // python only does it once; we do likewise to stay faithful.
      break;
    }
    break;
  }
  return { base, baseSegments };
}

// Look for a child by name at the given node, or one level deeper (mirrors
// python's find_item which checks base/<name> then base/*/<name>).
function findItem(node, name, isDir) {
  if (isDir) {
    if (node.dirs.has(name)) return { node: node.dirs.get(name), parent: node, name };
    for (const [childName, child] of node.dirs.entries()) {
      if (child.dirs.has(name)) {
        return { node: child.dirs.get(name), parent: child, name, viaDir: childName };
      }
    }
    return null;
  }
  if (node.files.has(name)) return { file: node.files.get(name), parent: node, name };
  for (const [childName, child] of node.dirs.entries()) {
    if (child.files.has(name)) {
      return { file: child.files.get(name), parent: child, name, viaDir: childName };
    }
  }
  return null;
}

function classifyLooseFile(name) {
  for (const src of SOURCES) {
    if (src.loosePattern && src.loosePattern.test(name)) return src.key;
  }
  return null;
}

// Discover sources at the base level. Returns { fileMap, consumed }.
// fileMap: key -> Array<{file, name}>; consumed: Set of base-level names.
function discoverSources(base) {
  const fileMap = Object.fromEntries(SOURCES.map((s) => [s.key, []]));
  const consumed = new Set();

  for (const src of SOURCES) {
    const folder = findItem(base, src.folderName, true);
    if (folder) {
      consumed.add(folder.viaDir || folder.name);
      const list = Array.from(folder.node.files.entries())
        .filter(([n]) => !n.startsWith('.'))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([n, f]) => ({ name: n, file: f }));
      fileMap[src.key] = list;
      continue;
    }
    const single = findItem(base, src.folderName, false);
    if (single) {
      consumed.add(single.viaDir || single.name);
      fileMap[src.key] = [{ name: single.name, file: single.file }];
    }
  }

  // Loose files at the base level.
  const baseFileNames = Array.from(base.files.keys()).sort();
  for (const name of baseFileNames) {
    if (name.startsWith('.') || consumed.has(name)) continue;
    const key = classifyLooseFile(name);
    if (key !== null) {
      fileMap[key].push({ name, file: base.files.get(name) });
      consumed.add(name);
    }
  }

  return { fileMap, consumed };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

async function readFileText(file) {
  // Some File-like objects (extracted from archives) may lack .text(); fall
  // back to FileReader.
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

async function parseLogFile(file, tag, parseTs) {
  let text;
  try { text = await readFileText(file); }
  catch (e) { console.warn(`[merge] could not read ${file.name}:`, e); return []; }

  const entries = [];
  let current = null;
  let lastTs = -Infinity;

  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const ts = parseTs(line);
    if (ts !== null) {
      if (current) entries.push(current);
      lastTs = ts;
      current = { timestamp: ts, tag, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      entries.push({ timestamp: lastTs, tag, lines: [line] });
    }
  }
  if (current) entries.push(current);
  return entries;
}

async function parseSourceFiles(items, src) {
  const all = [];
  for (const it of items) {
    const entries = await parseLogFile(it.file, src.tag, src.parseTs);
    for (const e of entries) all.push(e);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function formatTaggedLine(tag, line) {
  for (const re of [CATO_TS_RE, DEM_TS_RE]) {
    const m = re.exec(line);
    if (m) {
      const pos = m[0].length;
      return `${line.slice(0, pos)}[${tag}]${line.slice(pos)}`;
    }
  }
  return `[${tag}] ${line}`;
}

function entryToPlain(entry) {
  return entry.lines.join('\n') + '\n';
}

function entryToTagged(entry) {
  const out = [formatTaggedLine(entry.tag, entry.lines[0])];
  for (let i = 1; i < entry.lines.length; i++) {
    out.push(`${CONTINUATION_INDENT}[${entry.tag}] ${entry.lines[i]}`);
  }
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Pass-through copy
// ---------------------------------------------------------------------------

async function addPassthrough(zip, base, consumed, log) {
  const baseFileNames = Array.from(base.files.keys()).sort();
  for (const name of baseFileNames) {
    if (name.startsWith('.') || consumed.has(name)) continue;
    zip.file(name, base.files.get(name));
    log.push(`  [copy] ${name}`);
  }

  const baseDirNames = Array.from(base.dirs.keys()).sort();
  for (const name of baseDirNames) {
    if (name.startsWith('.') || consumed.has(name)) continue;
    const folder = zip.folder(name);
    addDirRecursive(folder, base.dirs.get(name));
    log.push(`  [copy] ${name}/`);
  }
}

function addDirRecursive(zipFolder, node) {
  for (const [name, file] of node.files.entries()) {
    zipFolder.file(name, file);
  }
  for (const [name, child] of node.dirs.entries()) {
    addDirRecursive(zipFolder.folder(name), child);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the merge over the supplied files (each must have webkitRelativePath).
 *
 * @param {File[]} files
 * @param {object} [opts]
 * @param {string[]} [opts.mergeSelected] keys to include in merged.log
 *        (default: all)
 * @param {string} [opts.outputFolderName] name for the top-level folder
 *        inside the produced .zip (default: '<root>_merged' or 'logs_merged')
 * @returns {Promise<{ blob: Blob, fileName: string, log: string[] }>}
 */
export async function mergeLogsToZip(files, opts = {}) {
  if (!files || !files.length) throw new Error('no files supplied');

  const mergeSelected = (opts.mergeSelected && opts.mergeSelected.length)
    ? opts.mergeSelected
    : ALL_KEYS;

  const { base, baseSegments } = buildFsTree(files);
  const { fileMap, consumed } = discoverSources(base);

  const log = [];
  const sourceEntries = {};

  for (const src of SOURCES) {
    const items = fileMap[src.key];
    if (!items.length) { log.push(`  [skip] ${src.tag}: no files found`); continue; }
    const entries = await parseSourceFiles(items, src);
    if (!entries.length) { log.push(`  [skip] ${src.tag}: no parseable entries`); continue; }
    entries.sort((a, b) => a.timestamp - b.timestamp);
    sourceEntries[src.key] = entries;
    log.push(`  ${src.tag}: ${entries.length.toLocaleString()} entries from ${items.length} file(s) -> ${src.outputFilename}`);
  }

  // Build the output zip.
  const zip = new JSZip();
  const rootName = opts.outputFolderName
    || `${baseSegments[baseSegments.length - 1] || 'logs'}_merged`;
  const outRoot = zip.folder(rootName);

  // Per-source plain files.
  for (const src of SOURCES) {
    const entries = sourceEntries[src.key];
    if (!entries) continue;
    const text = entries.map(entryToPlain).join('');
    outRoot.file(src.outputFilename, text);
  }

  // merged.log (cross-source).
  const merged = [];
  const producedTags = [];
  for (const key of mergeSelected) {
    const entries = sourceEntries[key];
    if (!entries) continue;
    for (const e of entries) merged.push(e);
    producedTags.push(SOURCE_BY_KEY[key].tag);
  }

  if (merged.length) {
    merged.sort((a, b) => a.timestamp - b.timestamp);
    let header = '';
    const info = findItem(base, 'info.txt', false);
    if (info) {
      try { header += (await readFileText(info.file)).trim() + '\n'; }
      catch (_) { /* ignore */ }
    }
    header += `Merged sources: ${producedTags.join(', ')}\n`;
    header += '='.repeat(72) + '\n\n';
    outRoot.file('merged.log', header + merged.map(entryToTagged).join(''));
    log.push(`  merged.log: ${merged.length.toLocaleString()} entries (${producedTags.join(' + ')})`);
  } else {
    log.push('  [skip] merged.log: no entries from selected sources');
  }

  // Pass-through everything else from the base directory.
  consumed.add('merged.log');
  await addPassthrough(outRoot, base, consumed, log);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, fileName: `${rootName}.zip`, log };
}
