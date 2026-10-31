/** Source data stays separate from the order in which a view displays records. */
export type LogId = string | number;
export type DateFormat = 'MM/DD/YY' | 'DD/MM/YY';
export type MatchMode = 'text' | 'regex';

export interface LogRecord {
  id: LogId;
  raw: string;
  message: string;
  timestamp: string;
  timestampMs: number | null;
  displayDate: string | null;
  displayTime: string | null;
  level: string | null;
  module: string;
  sourceName: string;
  sourceLine: string;
  thread: string;
  process: string;
  processName?: string;
  lineNumber: number;
  originalLineNumbers: number[];
  sourceFile?: string;
  sourceTabId?: string;
  baseId?: LogId;
  originalId?: LogId;
  originalFileIndex?: number;
  originalLogIndex?: number;
  originalLogId?: LogId;
  isContinuation?: boolean;
  parentLogId?: LogId;
  originalParentLogId?: LogId;
  isContextLine?: boolean;
  lineIndex?: number;
  user?: string;
  account?: string;
  clientVersion?: string;
  osVersion?: string;
}

export interface LogHeaders {
  user?: string;
  account?: string;
  clientVersion?: string;
  osVersion?: string;
  rawLines?: string[];
}

export interface LogFilters {
  searchText: string;
  searchQuery: string;
  logLevel: string[];
  selectedModule: string;
  contextLines: number;
  filterMode: MatchMode;
  searchMode: MatchMode;
  filterCaseSensitive: boolean;
  searchCaseSensitive: boolean;
}

export interface StickyLog {
  id: LogId;
  lineNumber: number;
  timestamp: string;
  level: string | null;
  message: string;
  cleanedMessage: string;
  sourceFile?: string;
  title?: string;
}

/** Preferences belong to the viewer; switching files must not reset them. */
export function createDefaultFilters(): LogFilters {
  function readPreference(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return {
    searchText: '',
    searchQuery: '',
    logLevel: ['all'],
    selectedModule: 'all',
    contextLines: 0,
    filterMode: readPreference('logViewer_filterMode') === 'regex' ? 'regex' : 'text',
    searchMode: readPreference('logViewer_searchMode') === 'regex' ? 'regex' : 'text',
    filterCaseSensitive: readPreference('logViewer_filterCaseSensitive') === 'true',
    searchCaseSensitive: readPreference('logViewer_searchCaseSensitive') === 'true',
  };
}
