import type { LogFilters } from './logRecord';

export interface FilterPreset {
  id: string;
  name: string;
  data: Partial<LogFilters>;
  timestamp?: string;
  savedAt?: string;
}

/** Whitelist file contents before they become application state. */
export function readFilterData(value: unknown): Partial<LogFilters> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid filter settings.');
  const source = value as Record<string, unknown>;
  const result: Partial<LogFilters> = {};
  for (const key of ['searchText', 'searchQuery', 'selectedModule'] as const) {
    const item = source[key];
    if (item === undefined) continue;
    if (typeof item !== 'string' || item.length > 4096) throw new Error(`Invalid ${key}.`);
    result[key] = item;
  }
  for (const key of ['filterMode', 'searchMode'] as const) {
    if (source[key] === undefined) continue;
    if (source[key] !== 'text' && source[key] !== 'regex') throw new Error(`Invalid ${key}.`);
    result[key] = source[key];
  }
  for (const key of ['filterCaseSensitive', 'searchCaseSensitive'] as const) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
    result[key] = source[key];
  }
  if (source.contextLines !== undefined) {
    if (
      typeof source.contextLines !== 'number' ||
      !Number.isInteger(source.contextLines) ||
      source.contextLines < 0 ||
      source.contextLines > 1000
    )
      throw new Error('Invalid context lines.');
    result.contextLines = source.contextLines;
  }
  if (source.logLevel !== undefined) {
    const levels = source.logLevel;
    if (
      !Array.isArray(levels) ||
      !levels.every(
        (level) =>
          typeof level === 'string' &&
          ['all', 'error', 'warning', 'info', 'debug', 'verbose'].includes(level),
      )
    )
      throw new Error('Invalid log levels.');
    result.logLevel = levels;
  }
  return result;
}

export function parsePresetFile(value: unknown, fallbackName = 'Imported'): FilterPreset[] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid filter file.');
  const source = value as Record<string, unknown>;
  const entries: unknown[] = Array.isArray(source.filters)
    ? source.filters
    : [
        {
          name: typeof source.name === 'string' ? source.name : fallbackName,
          data: source.filters || source,
        },
      ];
  if (entries.length > 1000) throw new Error('Too many saved filters.');
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid saved filter.');
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== 'string' || item.name.length > 200)
      throw new Error('Invalid filter name.');
    return {
      id: typeof item.id === 'string' ? item.id : String(index),
      name: item.name,
      data: readFilterData(item.data),
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : undefined,
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
    };
  });
}

export function readStringHistory(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(-50)
      : [];
  } catch {
    return [];
  }
}
