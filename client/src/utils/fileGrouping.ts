import { parseLogFormat } from '../LogParser';
import { readFileText } from './readFileText';

export function hasValidLogExtension(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.txt') || name.endsWith('.log') || name.endsWith('.ips');
}

/** Sort app.2.log before app.10.log. */
export function naturalSort(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

/** Example: cato_vpn_5.17_20250901.log becomes cato_vpn. */
export function extractFilePrefix(fileName: string): string {
  const stem = fileName.replace(/\.(txt|log|json|etl|evtx)$/i, '');
  const prefix = stem.match(/^[^0-9]+/)?.[0];
  return prefix === undefined ? stem : prefix.replace(/[_.-]+$/, '');
}

export function groupFilesByPrefix(files: File[]): Map<string, File[]> {
  const groups = new Map<string, File[]>();
  for (const file of files) {
    const prefix = extractFilePrefix(file.name);
    const group = groups.get(prefix) ?? [];
    group.push(file);
    groups.set(prefix, group);
  }
  for (const group of groups.values())
    group.sort((left, right) => naturalSort(left.name, right.name));
  return groups;
}

export function extractDirectory(file: File): string {
  return (file.webkitRelativePath || '').split('/').slice(0, -1).join('/');
}

/** Multiple log directories become separate groups; a single directory uses file prefixes. */
export function groupFilesByDirectory(files: File[]): Map<string, File[]> {
  const directories = new Map<string, File[]>();
  for (const file of files) {
    const path = extractDirectory(file);
    const group = directories.get(path) ?? [];
    group.push(file);
    directories.set(path, group);
  }
  const logDirectories = [...directories].filter(
    ([path, group]) => path && group.some(hasValidLogExtension),
  );
  if (logDirectories.length <= 1) {
    return groupFilesByPrefix([...directories.values()].flat().filter(hasValidLogExtension));
  }

  // Folder pickers include the selected folder name in every relative path.
  const paths = [...directories.keys()].filter(Boolean);
  const root = paths.find((candidate) =>
    paths.every((path) => path === candidate || path.startsWith(`${candidate}/`)),
  );
  const groups = new Map<string, File[]>();
  for (const [path, group] of directories) {
    const logs = group.filter(hasValidLogExtension);
    if (!path || path === root) {
      for (const [prefix, files] of groupFilesByPrefix(logs)) groups.set(prefix, files);
    } else if (logs.length) {
      groups.set(
        path,
        logs.sort((left, right) => naturalSort(left.name, right.name)),
      );
    }
  }
  return groups;
}

/** Inspect at most 16 KB; unreadable and unrecognized files remain independent. */
export async function detectFileFormat(file: File): Promise<string> {
  try {
    const text = await readFileText(file.slice(0, 16384));
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parsed = parseLogFormat(line);
      if (parsed?.format) return parsed.format;
    }
  } catch {
    // Keep the file as an unknown source so opening it can report the read error.
  }
  return 'unknown';
}

/** Only files sharing a known format may share a merged tab. */
export async function groupFilesByDirectoryAndFormat(files: File[]): Promise<Map<string, File[]>> {
  const groups = new Map<string, File[]>();
  for (const [key, group] of groupFilesByDirectory(files)) {
    if (group.length <= 1) {
      groups.set(key, group);
      continue;
    }
    const formats = await Promise.all(group.map(detectFileFormat));
    const byFormat = new Map<string, File[]>();
    for (let index = 0; index < group.length; index++) {
      const format = formats[index];
      const matching = byFormat.get(format) ?? [];
      matching.push(group[index]);
      byFormat.set(format, matching);
    }
    if (byFormat.size === 1 && !byFormat.has('unknown')) {
      groups.set(key, group);
      continue;
    }
    for (const [format, matching] of byFormat) {
      if (format === 'unknown') {
        for (const file of matching) groups.set(`${key}/${file.name}`, [file]);
      } else {
        groups.set(`${key} [${format}]`, matching);
      }
    }
  }
  return groups;
}
