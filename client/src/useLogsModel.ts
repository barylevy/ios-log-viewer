import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { getFileIdentifier, loadLogFile } from './utils/fileLoader';
import { combineLogs } from './domain/combineLogs';
import { findNearestLogIndex } from './domain/logNavigation';
import { filterLogs } from './domain/logQuery';
import {
  createDefaultFilters,
  type LogFilters,
  type LogHeaders,
  type LogId,
  type LogRecord,
  type StickyLog,
} from './domain/logRecord';

const COMBINED_VIEW = 'Combined Files';
const EMPTY_LOGS: LogRecord[] = [];
type FileLogs = Record<string, LogRecord[]>;
type FileHeaders = Record<string, LogHeaders>;
type FileFilters = Record<string, LogFilters>;
type FileBookmarks = Record<string, StickyLog[]>;

interface ViewerState {
  activeFileId: string | null;
  logsByFile: FileLogs;
  headersByFile: FileHeaders;
  filtersByFile: FileFilters;
  bookmarksByFile: FileBookmarks;
  loadingByFile: Record<string, boolean>;
  filters: LogFilters;
  selectedId: LogId | null;
  highlightedId: LogId | null;
  loadError: string | null;
}

type Action =
  | { type: 'loading'; fileId: string }
  | { type: 'loaded'; fileId: string; logs: LogRecord[]; headers?: LogHeaders; activate: boolean }
  | { type: 'failed'; fileId: string; message: string }
  | { type: 'select-file'; fileId: string }
  | { type: 'remove-file'; fileId: string }
  | { type: 'filters'; changes: Partial<LogFilters>; allFiles?: boolean }
  | { type: 'select-record'; id: LogId | null }
  | { type: 'highlight'; id: LogId | null }
  | { type: 'headers'; headers: FileHeaders }
  | { type: 'bookmarks'; bookmarks: FileBookmarks }
  | { type: 'clear-filters' }
  | { type: 'reset' };

function readSavedObject(key: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function savedFilters(): FileFilters {
  const result: FileFilters = {};
  for (const [id, value] of Object.entries(readSavedObject('logViewerFilters')).slice(-50)) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Partial<LogFilters>;
    if (typeof candidate.searchText !== 'string' || !Array.isArray(candidate.logLevel)) continue;
    result[id] = { ...createDefaultFilters(), ...candidate };
  }
  return result;
}

function savedBookmarks(): FileBookmarks {
  const result: FileBookmarks = {};
  for (const [id, value] of Object.entries(readSavedObject('logViewerStickyLogs')).slice(-50)) {
    if (!Array.isArray(value)) continue;
    result[id] = value.filter((item: unknown): item is StickyLog => {
      if (!item || typeof item !== 'object') return false;
      const bookmark = item as Partial<StickyLog>;
      return (
        (typeof bookmark.id === 'number' || typeof bookmark.id === 'string') &&
        typeof bookmark.lineNumber === 'number' &&
        typeof bookmark.message === 'string'
      );
    });
  }
  return result;
}

function initialState(): ViewerState {
  return {
    activeFileId: null,
    logsByFile: {},
    headersByFile: {},
    loadingByFile: {},
    filtersByFile: savedFilters(),
    bookmarksByFile: savedBookmarks(),
    filters: createDefaultFilters(),
    selectedId: null,
    highlightedId: null,
    loadError: null,
  };
}

function selectFile(state: ViewerState, fileId: string): ViewerState {
  const preferences = state.filters;
  return {
    ...state,
    activeFileId: fileId,
    selectedId: null,
    highlightedId: null,
    filters: {
      ...createDefaultFilters(),
      ...state.filtersByFile[fileId],
      filterMode: preferences.filterMode,
      searchMode: preferences.searchMode,
      filterCaseSensitive: preferences.filterCaseSensitive,
      searchCaseSensitive: preferences.searchCaseSensitive,
    },
  };
}

/** Each action is an atomic state transition, like a small view-model command. */
function reduceViewer(state: ViewerState, action: Action): ViewerState {
  switch (action.type) {
    case 'loading':
      return {
        ...state,
        loadError: null,
        loadingByFile: { ...state.loadingByFile, [action.fileId]: true },
      };
    case 'loaded': {
      let updated = {
        ...state,
        logsByFile: { ...state.logsByFile, [action.fileId]: action.logs },
        headersByFile: action.headers
          ? { ...state.headersByFile, [action.fileId]: action.headers }
          : state.headersByFile,
        loadingByFile: { ...state.loadingByFile, [action.fileId]: false },
      };
      if (action.activate && state.activeFileId !== action.fileId)
        updated = selectFile(updated, action.fileId);
      return updated;
    }
    case 'failed':
      return {
        ...state,
        loadError: action.message,
        loadingByFile: { ...state.loadingByFile, [action.fileId]: false },
      };
    case 'select-file':
      return selectFile(state, action.fileId);
    case 'select-record':
      return { ...state, selectedId: action.id };
    case 'highlight':
      return { ...state, highlightedId: action.id };
    case 'headers':
      return { ...state, headersByFile: action.headers };
    case 'bookmarks':
      return { ...state, bookmarksByFile: action.bookmarks };
    case 'remove-file': {
      const logsByFile = { ...state.logsByFile };
      const headersByFile = { ...state.headersByFile };
      const loadingByFile = { ...state.loadingByFile };
      delete logsByFile[action.fileId];
      delete headersByFile[action.fileId];
      delete loadingByFile[action.fileId];
      return {
        ...state,
        logsByFile,
        headersByFile,
        loadingByFile,
        ...(state.activeFileId === action.fileId ? { activeFileId: null, selectedId: null } : {}),
      };
    }
    case 'filters': {
      const { changes, allFiles } = action;
      function merge(existing: LogFilters): LogFilters {
        const next = { ...existing, ...changes };
        if (allFiles && changes.searchText !== undefined && existing.searchText) {
          next.searchText = `(${existing.searchText}) && (${changes.searchText})`;
        }
        return next;
      }
      const filters = merge(state.filters);
      const filtersByFile = { ...state.filtersByFile };
      if (allFiles) {
        for (const fileId of new Set([
          ...Object.keys(filtersByFile),
          ...Object.keys(state.logsByFile),
        ])) {
          filtersByFile[fileId] = merge(filtersByFile[fileId] || createDefaultFilters());
        }
      }
      if (state.activeFileId) filtersByFile[state.activeFileId] = filters;
      return { ...state, filters, filtersByFile };
    }
    case 'clear-filters':
      return { ...state, filtersByFile: {}, filters: createDefaultFilters() };
    case 'reset':
      return {
        ...initialState(),
        filtersByFile: state.filtersByFile,
        bookmarksByFile: {},
        filters: {
          ...state.filters,
          searchText: '',
          searchQuery: '',
          logLevel: ['all'],
          selectedModule: 'all',
          contextLines: 0,
        },
      };
  }
}

function persistObject(key: string, value: object): void {
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(value).slice(-50))));
  } catch (error) {
    console.warn(`Unable to save ${key}:`, error);
  }
}

export default function useLogsModel() {
  const [state, dispatch] = useReducer(reduceViewer, undefined, initialState);
  const pendingLoads = useRef(new Map<string, symbol>());
  const currentFileNameRef = useRef(state.activeFileId);
  currentFileNameRef.current = state.activeFileId;
  const logs = state.activeFileId ? state.logsByFile[state.activeFileId] || EMPTY_LOGS : EMPTY_LOGS;
  const filteredLogs = useMemo(() => filterLogs(logs, state.filters), [logs, state.filters]);
  const selectedLog = useMemo(
    () => logs.find((log) => log.id === state.selectedId) || null,
    [logs, state.selectedId],
  );
  const moduleOptions = useMemo(
    () => [...new Set(logs.map((log) => log.module.trim()).filter(Boolean))].sort(),
    [logs],
  );

  useEffect(() => persistObject('logViewerFilters', state.filtersByFile), [state.filtersByFile]);
  useEffect(
    () => persistObject('logViewerStickyLogs', state.bookmarksByFile),
    [state.bookmarksByFile],
  );

  const loadLogs = useCallback(async (input: File | File[], groupId: string | null = null) => {
    const files = Array.isArray(input) ? input : [input];
    if (!files.length) return;
    const fileId = groupId || getFileIdentifier(files[0]);
    if (pendingLoads.current.has(fileId)) return;
    const token = Symbol(fileId);
    pendingLoads.current.set(fileId, token);
    dispatch({ type: 'loading', fileId });
    try {
      // The parser client serializes work to avoid loading a whole folder concurrently.
      const results = await Promise.all(files.map(loadLogFile));
      if (pendingLoads.current.get(fileId) !== token) return;
      const records = Array.isArray(input)
        ? combineLogs(results.map((result) => ({ id: result.fileId, logs: result.logs })))
        : results[0].logs;
      const headers =
        results.find((result) => Object.keys(result.headerData).length > 0)?.headerData || {};
      dispatch({
        type: 'loaded',
        fileId,
        logs: records,
        headers,
        activate: currentFileNameRef.current === null,
      });
    } catch (error) {
      if (pendingLoads.current.get(fileId) !== token) return;
      dispatch({
        type: 'failed',
        fileId,
        message: error instanceof Error ? error.message : 'Unable to load logs.',
      });
    } finally {
      if (pendingLoads.current.get(fileId) === token) pendingLoads.current.delete(fileId);
    }
  }, []);

  const requestFileLoad = useCallback(
    (fileId: string, input: File | File[]) => {
      if (!state.logsByFile[fileId]) void loadLogs(input, fileId);
    },
    [state.logsByFile, loadLogs],
  );
  const switchToFile = useCallback((fileId: string) => {
    currentFileNameRef.current = fileId;
    dispatch({ type: 'select-file', fileId });
  }, []);
  const setLogsForFile = useCallback((fileId: string, records: LogRecord[]) => {
    currentFileNameRef.current = fileId;
    dispatch({ type: 'loaded', fileId, logs: records, activate: true });
  }, []);
  const updateLogsBackground = useCallback((fileId: string, records: LogRecord[]) => {
    dispatch({ type: 'loaded', fileId, logs: records, activate: false });
  }, []);
  const resetModel = useCallback(() => {
    pendingLoads.current.clear();
    currentFileNameRef.current = null;
    dispatch({ type: 'reset' });
  }, []);
  const removeLogsForFile = useCallback((fileId: string) => {
    pendingLoads.current.delete(fileId);
    dispatch({ type: 'remove-file', fileId });
  }, []);
  const updateFilters = useCallback(
    (changes: Partial<LogFilters>) => dispatch({ type: 'filters', changes }),
    [],
  );
  const updateFiltersForAllFiles = useCallback(
    (changes: Partial<LogFilters>) => dispatch({ type: 'filters', changes, allFiles: true }),
    [],
  );
  const setSelectedLog = useCallback(
    (record: LogRecord | null) => dispatch({ type: 'select-record', id: record?.id ?? null }),
    [],
  );
  const highlightLog = useCallback((id: LogId | null) => dispatch({ type: 'highlight', id }), []);
  const setLogFileHeaders = useCallback(
    (headers: FileHeaders) => dispatch({ type: 'headers', headers }),
    [],
  );
  const clearSavedFilters = useCallback(() => dispatch({ type: 'clear-filters' }), []);
  const isFileLoading = useCallback(
    (fileId: string) => !!state.loadingByFile[fileId],
    [state.loadingByFile],
  );
  const getCurrentFileHeaders = useCallback(
    (fileId: string): LogHeaders | null =>
      state.headersByFile[fileId] ||
      (fileId === COMBINED_VIEW
        ? Object.values(state.headersByFile).find((header) => Object.keys(header).length > 0) ||
          null
        : null),
    [state.headersByFile],
  );

  const stickyLogs = useMemo(() => {
    if (state.activeFileId !== COMBINED_VIEW)
      return state.bookmarksByFile[state.activeFileId || ''] || [];
    return Object.entries(state.bookmarksByFile).flatMap(([fileId, bookmarks]) =>
      bookmarks.map((bookmark) => ({
        ...bookmark,
        id: JSON.stringify([fileId, bookmark.id]),
        sourceFile: bookmark.sourceFile || fileId,
      })),
    );
  }, [state.activeFileId, state.bookmarksByFile]);

  const addStickyLog = useCallback(
    (record: LogRecord & { cleanedMessage?: string }) => {
      if (!state.activeFileId) return;
      const combined = state.activeFileId === COMBINED_VIEW;
      const fileId = combined ? record.sourceTabId : state.activeFileId;
      if (!fileId) return;
      const id = combined ? (record.originalId ?? record.id) : record.id;
      const existing = state.bookmarksByFile[fileId] || [];
      if (existing.some((bookmark) => bookmark.id === id)) return;
      const bookmark: StickyLog = {
        id,
        lineNumber: record.lineNumber,
        timestamp: record.timestamp,
        level: record.level,
        message: record.message.slice(0, 50),
        cleanedMessage: record.cleanedMessage || record.message,
        sourceFile: record.sourceFile,
      };
      dispatch({
        type: 'bookmarks',
        bookmarks: { ...state.bookmarksByFile, [fileId]: [...existing, bookmark] },
      });
    },
    [state.activeFileId, state.bookmarksByFile],
  );

  const editBookmark = useCallback(
    (id: LogId, title: string | null) => {
      const bookmarks = { ...state.bookmarksByFile };
      for (const [fileId, entries] of Object.entries(bookmarks)) {
        if (state.activeFileId !== COMBINED_VIEW && state.activeFileId !== fileId) continue;
        const matches = (entry: StickyLog) =>
          (state.activeFileId === COMBINED_VIEW ? JSON.stringify([fileId, entry.id]) : entry.id) ===
          id;
        bookmarks[fileId] =
          title === null
            ? entries.filter((entry) => !matches(entry))
            : entries.map((entry) => (matches(entry) ? { ...entry, title } : entry));
      }
      dispatch({ type: 'bookmarks', bookmarks });
    },
    [state.bookmarksByFile, state.activeFileId],
  );
  const removeStickyLog = useCallback((id: LogId) => editBookmark(id, null), [editBookmark]);
  const updateStickyLogTitle = useCallback(
    (id: LogId, title: string) => editBookmark(id, title),
    [editBookmark],
  );
  const clearAllStickyLogs = useCallback(() => {
    const bookmarks =
      state.activeFileId === COMBINED_VIEW
        ? {}
        : { ...state.bookmarksByFile, [state.activeFileId || '']: [] };
    dispatch({ type: 'bookmarks', bookmarks });
  }, [state.activeFileId, state.bookmarksByFile]);
  const scrollToLog = useCallback(
    (lineNumber: number, sourceFile: string | null = null) => {
      const index = findNearestLogIndex(filteredLogs, lineNumber, sourceFile);
      if (index < 0 || filteredLogs[index].lineNumber !== lineNumber) {
        window.dispatchEvent(
          new CustomEvent('showLogNotVisible', {
            detail: {
              lineNumber,
              message: `Log line ${lineNumber} is hidden by the current filters.`,
            },
          }),
        );
      }
      if (index >= 0)
        window.dispatchEvent(
          new CustomEvent('scrollToLogIndex', {
            detail: { index, logId: filteredLogs[index].id, shouldHighlight: true },
          }),
        );
    },
    [filteredLogs],
  );

  return {
    logs,
    filteredLogs,
    moduleOptions,
    selectedLog,
    filters: state.filters,
    loadError: state.loadError,
    highlightedLogId: state.highlightedId,
    logFileHeaders: state.headersByFile,
    allFileLogs: state.logsByFile,
    currentFileName: state.activeFileId,
    stickyLogs,
    loadLogs,
    requestFileLoad,
    isFileLoading,
    isAnyFileLoading: Object.values(state.loadingByFile).some(Boolean),
    setSelectedLog,
    updateFilters,
    updateFiltersForAllFiles,
    highlightLog,
    getCurrentFileHeaders,
    setLogsForFile,
    updateLogsBackground,
    setLogFileHeaders,
    switchToFile,
    removeLogsForFile,
    clearSavedFilters,
    resetModel,
    addStickyLog,
    removeStickyLog,
    clearAllStickyLogs,
    updateStickyLogTitle,
    scrollToLog,
  };
}
