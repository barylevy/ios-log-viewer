import Alert from '@mui/material/Alert';
import Backdrop from '@mui/material/Backdrop';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ViewerDialog from './components/ViewerDialog';
import ToolbarIcon from './components/ToolbarIcon';
import type { DragEvent } from 'react';
import type { LogRecord, LogHeaders } from './domain/logRecord';
import {
  errorMessage,
  type ViewerFile,
  type LiveSourceUpdate,
  type ColumnVisibility,
} from './domain/viewerTypes';
import { collectDroppedFiles } from './services/dropFiles';
import { combineLogs } from './domain/combineLogs';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import LogListView from './LogListView';
import LogModal from './LogModal';
import LogViewerHeader from './LogViewerHeader';
import LogViewerFilters from './LogViewerFilters';
import LogTabs from './LogTabs';
import SelectionFilesDialog from './SelectionFilesDialog';
import useLogsModel from './useLogsModel';
import { getFileIdentifier, getFileDisplayName } from './utils/fileLoader';
import { saveSession, loadSession, clearSession } from './utils/sessionStorage';
import {
  groupFilesByDirectoryAndFormat,
  naturalSort,
  hasValidLogExtension,
} from './utils/fileGrouping';
import { isArchiveFile, expandArchivesInList } from './utils/archiveExtractor';
import { exportLogsToFile } from './utils/exportLogs';
import { DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS } from './constants';
import useLiveLogs from './utils/useLiveLogs';
import useClientLiveLogs, { hasClientLiveLogs } from './utils/useClientLiveLogs';
import LiveLogsSettings from './components/LiveLogsSettings';
import {
  checkLiveHealth,
  fetchLiveConfig,
  applySavedLogDir,
  buildSetupCommand,
  buildMacInstallCommand,
  getSavedLogDir,
  isWindows,
} from './utils/liveLogsServer';

// Turn a raw folder name like "2387341752-260422074919 (1)" into the short
// label we want in the page title.
//   - drop any trailing " (N)" duplicate marker
//   - if the name is "<id>-<YYMMDDHHMMSS>" or just "<YYMMDDHHMMSS>", format
//     the timestamp as "YY.MM.DD-HHMMSS"  (e.g. 260428063435 -> 26.04.28-063435)
//   - otherwise: if it's "<id>-<suffix>", keep just the suffix
function cleanFolderLabel(name: string | null | undefined) {
  if (!name) return '';
  let label = String(name).trim();
  label = label.replace(/\s*\(\d+\)\s*$/, '');

  // Look at the part after the last '-' (or the whole label if no '-').
  const dashIdx = label.lastIndexOf('-');
  const tail = dashIdx >= 0 ? label.slice(dashIdx + 1) : label;
  const tsMatch = /^(\d{2})(\d{2})(\d{2})(\d{6})$/.exec(tail);
  if (tsMatch) {
    const [, yy, mm, dd, hms] = tsMatch;
    return `${yy}.${mm}.${dd}-${hms}`;
  }

  if (dashIdx >= 0 && dashIdx < label.length - 1) {
    label = label.slice(dashIdx + 1);
  }
  return label.trim();
}

const LogViewer = () => {
  const {
    loadError,
    logs,
    filteredLogs,
    moduleOptions,
    selectedLog,
    filters,
    highlightedLogId,
    logFileHeaders,
    allFileLogs,
    stickyLogs,
    requestFileLoad,
    isFileLoading,
    isAnyFileLoading,
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
    addStickyLog,
    removeStickyLog,
    clearAllStickyLogs,
    updateStickyLogTitle,
    scrollToLog,
    resetModel,
  } = useLogsModel();

  // Pivot time tracking
  const [pivotLog, setPivotLog] = useState<LogRecord | null>(null);
  const [hoveredLog, setHoveredLog] = useState<LogRecord | null>(null);
  const [lastHoveredLog, setLastHoveredLog] = useState<LogRecord | null>(null);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibility>(() => {
    const saved = localStorage.getItem('logViewerColumns');
    if (saved) {
      return JSON.parse(saved);
    }
    return { ...DEFAULT_VISIBLE_COLUMNS };
  });

  const [rightColumnOrder, setRightColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('logViewerColumnOrder');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const known = parsed.filter((id) => DEFAULT_COLUMN_ORDER.includes(id));
          DEFAULT_COLUMN_ORDER.forEach((id) => {
            if (!known.includes(id)) known.push(id);
          });
          return known;
        }
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_COLUMN_ORDER.slice();
  });

  const handleRightColumnOrderChange = useCallback((newOrder: string[]) => {
    setRightColumnOrder(newOrder);
    try {
      localStorage.setItem('logViewerColumnOrder', JSON.stringify(newOrder));
    } catch {
      /* ignore */
    }
  }, []);

  // Bumped only when the user clicks "Reset to Default" so the log list
  // remounts and re-initialises column-sizing state from (now empty) storage.
  const [columnResetKey, setColumnResetKey] = useState(0);

  // Reset column order and per-column widths to defaults. Visibility is reset
  // by ColumnSettings itself (it owns the temp checkbox state).
  const handleResetColumnDefaults = useCallback(() => {
    setRightColumnOrder(DEFAULT_COLUMN_ORDER.slice());
    try {
      localStorage.removeItem('logViewerColumnOrder');
      localStorage.removeItem('logViewerColumnSizing');
      localStorage.removeItem('logViewerCollapsedColumns');
    } catch {
      /* ignore */
    }
    setColumnResetKey((prev) => prev + 1);
  }, []);

  // Update lastHoveredLog whenever hoveredLog changes to a non-null value
  useEffect(() => {
    if (hoveredLog) {
      setLastHoveredLog(hoveredLog);
    }
  }, [hoveredLog]);

  // Calculate pivot time gap in DD Days, HH:MM:SS format (or just HH:MM:SS if no days)
  const calculatePivotGap = useCallback(
    (pivotLog: LogRecord | null, currentLog: LogRecord | null) => {
      const pivotMs = pivotLog?.timestampMs;
      const currentMs = currentLog?.timestampMs;

      if (!pivotMs || !currentMs) return null;

      const diffMs = Math.abs(currentMs - pivotMs);
      const totalSeconds = Math.floor(diffMs / 1000);

      const days = Math.floor(totalSeconds / (24 * 3600));
      const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const milliseconds = diffMs % 1000;

      // Always show with milliseconds precision
      if (days > 0) {
        return `${String(days).padStart(2, '0')} Days, ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
      } else {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
      }
    },
    [],
  );

  // Calculate current pivot gap for display
  const currentPivotGap = useMemo(() => {
    if (!pivotLog) return null;

    // Use current hovered log if available, otherwise use last hovered log
    const logToCompare = hoveredLog || lastHoveredLog;

    if (logToCompare) {
      // Show gap to hovered or last hovered log (pass entire log objects)
      return calculatePivotGap(pivotLog, logToCompare);
    } else {
      // Show that pivot is set (no specific gap)
      return 'Set';
    }
  }, [pivotLog, hoveredLog, lastHoveredLog, calculatePivotGap]);

  // Pivot control functions
  const setPivotTime = useCallback((log: LogRecord) => {
    setPivotLog(log);
    // Save to localStorage for persistence
    localStorage.setItem(
      'logViewer_pivotLog',
      JSON.stringify({
        id: log.id,
        timestamp: log.timestamp,
        lineNumber: log.lineNumber,
      }),
    );
  }, []);

  const clearPivotTime = useCallback(() => {
    setPivotLog(null);
    localStorage.removeItem('logViewer_pivotLog');
  }, []);

  // Restore pivot from localStorage on mount
  useEffect(() => {
    const savedPivot = localStorage.getItem('logViewer_pivotLog');
    if (savedPivot) {
      try {
        const pivotData = JSON.parse(savedPivot);
        // Verify the pivot log still exists in current logs
        const foundLog = filteredLogs.find((log) => log.id === pivotData.id);
        if (foundLog) {
          setPivotLog(foundLog);
        } else {
          // Clear invalid pivot
          localStorage.removeItem('logViewer_pivotLog');
        }
      } catch {
        localStorage.removeItem('logViewer_pivotLog');
      }
    }
  }, [filteredLogs]);

  // Notification listener for sticky log messages
  useEffect(() => {
    const handleLogNotVisible = (event: WindowEventMap['showLogNotVisible']) => {
      const { lineNumber, message } = event.detail;
      setNotification({ lineNumber, message });

      // Auto-hide notification after 3 seconds
      setTimeout(() => {
        setNotification(null);
      }, 3000);
    };

    window.addEventListener('showLogNotVisible', handleLogNotVisible);
    return () => window.removeEventListener('showLogNotVisible', handleLogNotVisible);
  }, []);

  // ===== UI STATE MANAGEMENT =====
  const [isFileDropActive, setIsFileDropActive] = useState(false);
  const [searchPos, setSearchPos] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [notification, setNotification] = useState<{ lineNumber: number; message: string } | null>(
    null,
  );
  // Counter of in-flight "prepare files" operations (archive expand, grouping,
  // dispatching loads). The loading overlay stays visible while > 0 OR while
  // any single file is still being parsed by the model.
  const [prepareFilesCount, setPrepareFilesCount] = useState(0);
  const beginPreparingFiles = useCallback(() => setPrepareFilesCount((c) => c + 1), []);
  const endPreparingFiles = useCallback(() => setPrepareFilesCount((c) => Math.max(0, c - 1)), []);
  const [isDownloadingMerged, setIsDownloadingMerged] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);

  // Multi-file support
  const [files, setFiles] = useState<ViewerFile[]>([]);
  const lastSelectedFileCount = useRef(0);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [showingCombinedView, setShowingCombinedView] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [pendingActiveFileId, setPendingActiveFileId] = useState<string | null>(null);

  // Watch for when logs are restored and switch to the pending active file
  useEffect(() => {
    if (pendingActiveFileId && allFileLogs[pendingActiveFileId]) {
      switchToFile(pendingActiveFileId);
      const index = files.findIndex((file) => file.id === pendingActiveFileId);
      if (index >= 0) setActiveFileIndex(index);
      setPendingActiveFileId(null);
      setIsRestoringSession(false);
    }
  }, [allFileLogs, pendingActiveFileId, switchToFile, files]);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      setIsRestoringSession(true);
      const session = await loadSession();

      if (session && session.files && session.files.length > 0) {
        // Restore UI state first
        const restoredActiveIndex = session.activeFileIndex || 0;
        lastSelectedFileCount.current = session.files.length;
        setFiles(session.files);
        setActiveFileIndex(restoredActiveIndex);
        setShowingCombinedView(session.showingCombinedView || false);
        setHasUserInteracted(true); // Mark as interacted so saves will work

        // Restore all logs for all files
        if (session.allFileLogs) {
          // First, restore all logs
          Object.entries(session.allFileLogs).forEach(([fileId, logs]) => {
            setLogsForFile(fileId, logs);
          });

          // Restore log file headers if available
          if (session.logFileHeaders) {
            setLogFileHeaders(session.logFileHeaders);
          }

          // Set the pending active file - the useEffect above will switch to it once logs are available
          const activeFile = session.files[restoredActiveIndex];
          if (activeFile) {
            setPendingActiveFileId(activeFile.id);
          } else {
            setIsRestoringSession(false);
          }
        } else {
          setIsRestoringSession(false);
        }
      } else {
        setIsRestoringSession(false);
      }
    };

    restoreSession();
  }, []); // Run only once on mount

  // Save session when state changes
  useEffect(() => {
    // Don't save during restoration or if no user interaction yet
    if (isRestoringSession || !hasUserInteracted) return;

    // Debounce saves to avoid too frequent writes
    const timeoutId = setTimeout(() => {
      if (files.length > 0) {
        // Only save files that are currently open (in files array)
        // This ensures closed tabs don't get restored
        const filesToSave = files.map((f) => ({ name: f.name, id: f.id }));

        // Only save logs for currently open files
        const logsToSave: Record<string, LogRecord[]> = {};
        files.forEach((f) => {
          if (allFileLogs[f.id]) {
            logsToSave[f.id] = allFileLogs[f.id];
          }
        });

        saveSession({
          files: filesToSave,
          activeFileIndex,
          showingCombinedView,
          allFileLogs: logsToSave,
          logFileHeaders,
        });
      }
    }, 1000); // Save after 1 second of inactivity

    return () => clearTimeout(timeoutId);
  }, [
    files,
    activeFileIndex,
    showingCombinedView,
    allFileLogs,
    hasUserInteracted,
    isRestoringSession,
    logFileHeaders,
  ]);

  // Clear existing tabs before loading a new folder
  const handleClearTabs = useCallback(() => {
    resetModel();
    setFiles([]);
    setActiveFileIndex(0);
    setShowingCombinedView(false);
    setHasUserInteracted(false);
  }, [resetModel]);

  // ── Live / Online mode ────────────────────────────────────────────────────
  const [isLiveMode, setIsLiveMode] = useState(false);
  const liveTabIdsRef = useRef(new Set<string>());

  const handleLiveSourceUpdate = useCallback(
    ({ sourceKey, label, logs: parsedLogs, isInitial }: LiveSourceUpdate) => {
      const tabId = `live:${sourceKey}`;

      if (isInitial) {
        // 'initial' creates the tab; 'reset' (after a rotation) also arrives here.
        const isFirstLiveTab = liveTabIdsRef.current.size === 0;

        if (!liveTabIdsRef.current.has(tabId)) {
          liveTabIdsRef.current.add(tabId);
          setFiles((prev) =>
            prev.some((f) => f.id === tabId)
              ? prev
              : [...prev, { name: label, id: tabId, isLive: true }],
          );
          if (isFirstLiveTab) {
            // Tabs are cleared when the live connection opens, so this is index 0.
            setActiveFileIndex(0);
            setShowingCombinedView(false);
          }
        }

        // Only the very first live tab may take over the visible list. Every
        // later source — and every rotation reset — must update in the
        // background, or whichever file rotated last would replace whatever tab
        // the user is actually looking at. updateLogsBackground refreshes the
        // visible rows only when the update belongs to the active tab.
        if (isFirstLiveTab) {
          setLogsForFile(tabId, parsedLogs);
        } else {
          updateLogsBackground(tabId, parsedLogs);
        }
      } else {
        updateLogsBackground(tabId, parsedLogs);
      }

      setHasUserInteracted(true);
    },
    [setLogsForFile, updateLogsBackground],
  );

  const [showServerDialog, setShowServerDialog] = useState(false);
  // Both platforms stream from a local server; only its setup differs.
  const setupOnWindows = isWindows();

  const handleLiveConnected = useCallback(() => {
    handleClearTabs();
    liveTabIdsRef.current = new Set();
    setIsLiveMode(true);
  }, [handleClearTabs]);

  const {
    isConnected: isWsConnected,
    connect: liveConnect,
    disconnect: liveDisconnect,
  } = useLiveLogs({
    onSourceUpdate: handleLiveSourceUpdate,
    onConnected: handleLiveConnected,
    onError: () => setShowServerDialog(true),
  });

  const [nativeError, setNativeError] = useState(false);
  const {
    isConnected: isNativeConnected,
    connect: nativeConnect,
    disconnect: nativeDisconnect,
  } = useClientLiveLogs({
    onSourceUpdate: handleLiveSourceUpdate,
    onConnected: handleLiveConnected,
    onDisconnected: () => setIsLiveMode(false),
    onError: () => setNativeError(true),
  });
  const isLiveConnected = isWsConnected || isNativeConnected;

  const [isLiveChecking, setIsLiveChecking] = useState(false);
  const [showLiveSettings, setShowLiveSettings] = useState(false);

  const handleLiveToggle = useCallback(async () => {
    if (isLiveConnected) {
      liveDisconnect();
      nativeDisconnect();
      setIsLiveMode(false);
      return;
    }
    setIsLiveChecking(true);
    try {
      if (hasClientLiveLogs()) {
        setNativeError(false);
        await nativeConnect();
        return;
      }
      // Not installed, not running, or not paired with this browser: show setup.
      if (!(await checkLiveHealth())) {
        setShowServerDialog(true);
        return;
      }
      // macOS: the background server reads fixed locations — nothing to configure.
      if (!isWindows()) {
        liveConnect();
        return;
      }
      // A Windows server with no (or an empty) log folder would connect and
      // then show nothing — send the user to the folder picker instead.
      let config = await fetchLiveConfig();
      if (!config) {
        setShowLiveSettings(true);
        return;
      }
      // A folder configured before the server existed gets applied here.
      if (config?.needsConfig) {
        config = (await applySavedLogDir()) || config;
      }
      if (config?.configurable && (config.needsConfig || config.matchCount === 0)) {
        setShowLiveSettings(true);
        return;
      }
      liveConnect();
    } finally {
      setIsLiveChecking(false);
    }
  }, [isLiveConnected, liveConnect, liveDisconnect, nativeConnect, nativeDisconnect]);

  const handleFileLoad = useCallback(
    (fileOrFiles: File | File[], clearTabsFirst = false, groupPrefix: string | null = null) => {
      const isFileArray = Array.isArray(fileOrFiles);
      const inputFiles = isFileArray ? fileOrFiles : [fileOrFiles];
      const firstFile = inputFiles[0];
      if (!firstFile || !inputFiles.some(hasValidLogExtension)) return;
      if (clearTabsFirst) handleClearTabs();

      let groupName: string | null = null;
      if (isFileArray && groupPrefix) {
        groupName = inputFiles.length > 1 ? `${groupPrefix} (${inputFiles.length})` : groupPrefix;
      }
      const fileId = groupName ?? getFileIdentifier(firstFile);
      const displayName = groupName ?? firstFile.name;

      // Check if file/group already exists
      const existingIndex = files.findIndex((f) => f.id === fileId);
      if (existingIndex >= 0) {
        setActiveFileIndex(existingIndex);
        setShowingCombinedView(false);
        switchToFile(fileId);
        return;
      }

      setFiles((previous) =>
        previous.some((file) => file.id === fileId)
          ? previous
          : [
              ...previous,
              {
                name: displayName,
                id: fileId,
                fileObj: fileOrFiles,
                isGroup: isFileArray,
                groupPrefix,
              },
            ],
      );
      setShowingCombinedView(false);
      requestFileLoad(fileId, fileOrFiles);
      switchToFile(fileId);
      setPendingActiveFileId(fileId);
      setHasUserInteracted(true);
    },
    [files, switchToFile, requestFileLoad, handleClearTabs],
  );

  const headerState = useMemo((): LogHeaders | null => {
    if (!logs.length) return null;
    const file = files[activeFileIndex];
    const headers = file ? getCurrentFileHeaders(file.id) : null;
    const keys = ['user', 'account', 'clientVersion', 'osVersion'] as const;
    if (headers && keys.some((key) => headers[key])) return headers;

    const metadata: LogHeaders = {};
    for (const log of logs.slice(0, 10)) {
      for (const key of keys) {
        if (log[key] && !metadata[key]) metadata[key] = log[key];
      }
    }
    return Object.keys(metadata).length ? metadata : null;
  }, [logs, files, activeFileIndex, getCurrentFileHeaders]);

  const currentFolderName = useMemo(() => {
    const paths: string[] = [];
    for (const file of files) {
      const sourceFiles = Array.isArray(file.fileObj)
        ? file.fileObj
        : file.fileObj
          ? [file.fileObj]
          : [];
      for (const source of sourceFiles) {
        if (source.webkitRelativePath) paths.push(source.webkitRelativePath);
      }
      if (file.id.includes('/')) paths.push(file.id);
    }
    // Prefer a real parent directory to the bare name of an individually dropped file.
    for (const path of paths) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length > 1) return parts.slice(0, -1).join('/');
    }
    return paths.map((path) => path.split('/').filter(Boolean)[0]).find(Boolean) ?? null;
  }, [files]);

  // Update the document title based on what's loaded:
  //   - Folder load (multiple files OR a single file whose webkitRelativePath
  //     contains a parent folder)  -> "Log Viewer - <folder leaf>"
  //   - Single file load and nothing previously loaded -> "Log Viewer - <file>"
  //   - Single file added on top of existing content   -> leave title alone
  //   - No files loaded                                -> reset to default
  const DEFAULT_TITLE = 'Cato Client Log Viewer';
  const previousFilesCountRef = useRef(0);
  useEffect(() => {
    const count = files ? files.length : 0;

    if (count === 0) {
      document.title = DEFAULT_TITLE;
      previousFilesCountRef.current = 0;
      return;
    }

    const folderLeaf = currentFolderName
      ? cleanFolderLabel(currentFolderName.split('/').filter(Boolean)[0])
      : null;

    if (folderLeaf) {
      document.title = `Log Viewer-${folderLeaf}`;
    } else if (previousFilesCountRef.current === 0) {
      // First load and it's a single file with no folder context.
      const first = files[0];
      const fileLabel = first ? getFileDisplayName(first.id) : 'file';
      document.title = `Log Viewer-${fileLabel}`;
    }
    // else: file added while content was already loaded -> keep current title

    previousFilesCountRef.current = count;
  }, [files, currentFolderName]);

  const logDuration = useMemo(() => {
    if (!logs.length) return null;
    const first = logs[0];
    const last = logs[logs.length - 1];
    if (first.displayDate && first.displayTime && last.displayDate && last.displayTime) {
      return `${first.displayDate} ${first.displayTime} → ${last.displayDate} ${last.displayTime}`;
    }
    if (!first.timestamp || !last.timestamp) return null;
    const start = first.timestamp.replace(/[:.](\d{3})$/, '.$1');
    const end = last.timestamp.replace(/[:.](\d{3})$/, '.$1');
    return `${start} → ${end}`;
  }, [logs]);

  const handleFileSelect = useCallback(
    (index: number) => {
      setActiveFileIndex(index);
      setShowingCombinedView(false);

      // Lazy load: If logs for this file/group are not loaded, load them now
      const file = files[index];
      if (file) {
        if (!allFileLogs[file.id] && file.fileObj) {
          requestFileLoad(file.id, file.fileObj);
        }
        // Switch to file works for both single files and groups (logs already combined)
        switchToFile(file.id);
      }
    },
    [files, allFileLogs, requestFileLoad, switchToFile],
  );

  // After all files finish loading + sorting, auto-select the first tab
  // (alphabetically by display title — same order as the sorted tab strip).
  useEffect(() => {
    if (files.length === 0) {
      lastSelectedFileCount.current = 0;
      return;
    }
    if (
      isAnyFileLoading ||
      prepareFilesCount > 0 ||
      isRestoringSession ||
      showingCombinedView ||
      isLiveMode
    )
      return;
    if (lastSelectedFileCount.current === files.length) return;
    lastSelectedFileCount.current = files.length;
    const sorted = files
      .map((file, index) => ({ index, label: getFileDisplayName(file.id) }))
      .sort((left, right) =>
        left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }),
      );
    setPendingActiveFileId(null);
    handleFileSelect(sorted[0].index);
  }, [
    files,
    isAnyFileLoading,
    prepareFilesCount,
    isRestoringSession,
    showingCombinedView,
    isLiveMode,
    handleFileSelect,
  ]);

  const handleFileClose = useCallback(
    (index: number) => {
      const closing = files[index];
      if (!closing) return;
      const remaining = files.filter((_, position) => position !== index);
      lastSelectedFileCount.current = remaining.length;
      removeLogsForFile(closing.id);
      setFiles(remaining);
      if (!remaining.length) {
        resetModel();
        setHasUserInteracted(false);
        setActiveFileIndex(0);
        setShowingCombinedView(false);
        clearSession();
        return;
      }
      const nextIndex = Math.max(
        0,
        Math.min(
          activeFileIndex > index ? activeFileIndex - 1 : activeFileIndex,
          remaining.length - 1,
        ),
      );
      setActiveFileIndex(nextIndex);
      if (remaining.length < 2) {
        setShowingCombinedView(false);
      }
      if (!showingCombinedView || remaining.length < 2) switchToFile(remaining[nextIndex].id);
    },
    [files, activeFileIndex, showingCombinedView, removeLogsForFile, resetModel, switchToFile],
  );

  const handleCloseAll = useCallback(() => {
    liveDisconnect();
    nativeDisconnect();
    setIsLiveMode(false);
    liveTabIdsRef.current.clear();
    // Wipe the entire model (logs, sticky notes, headers, current file, etc.)
    resetModel();

    // Clear all UI state in this component
    setFiles([]);
    setHasUserInteracted(false);
    setActiveFileIndex(0);
    setShowingCombinedView(false);
    setPivotLog(null);
    setHoveredLog(null);
    setLastHoveredLog(null);

    // Clear session storage
    clearSession();
  }, [resetModel, liveDisconnect, nativeDisconnect]);

  // Export visible records of the active tab. Uses filteredLogs which already
  // reflects all active filters (text/regex search, level, module, date range,
  // line ranges, etc.) and works for both single-file tabs and the combined
  // "All Files" view.
  const handleExportActive = useCallback(() => {
    let suggestedName;
    let tagSourceFile = false;
    if (showingCombinedView) {
      suggestedName = 'AllFiles_filtered';
      tagSourceFile = true;
    } else if (files[activeFileIndex]) {
      suggestedName = `${files[activeFileIndex].name}_filtered`;
    } else {
      suggestedName = 'logs_filtered';
    }
    exportLogsToFile(filteredLogs, suggestedName, { tagSourceFile, header: headerState });
  }, [showingCombinedView, files, activeFileIndex, filteredLogs, headerState]);

  // Build (or rebuild) the combined "All Files" model from currently-loaded
  // per-tab logs. Wrapped in useCallback so a useEffect can re-invoke it
  // whenever a previously-unloaded tab finishes loading.
  const buildCombinedView = useCallback(() => {
    if (files.length === 0) return;

    const combinedLogs = combineLogs(
      files.map((file) => ({ id: file.id, logs: allFileLogs[file.id] || [] })),
    );

    setLogsForFile('Combined Files', combinedLogs);
  }, [files, allFileLogs, setLogsForFile]);

  const handleCombinedViewSelect = useCallback(() => {
    setShowingCombinedView(true);
    // Force a rebuild on (re)entry — the dedupe ref below would otherwise
    // skip the build if the source signature happens to match the last one.
    lastCombinedSourcesRef.current = [];

    // Force-load any tabs whose logs aren't in memory yet so the combined
    // view will include records from every tab, not just the previously
    // visited ones.
    files.forEach((file) => {
      if (!allFileLogs[file.id] && file.fileObj) {
        requestFileLoad(file.id, file.fileObj);
      }
    });

    if (files.length > 0) {
      buildCombinedView();
    }
    switchToFile('Combined Files');
  }, [files, allFileLogs, requestFileLoad, buildCombinedView, switchToFile]);

  // While the combined view is active, rebuild it whenever a tab finishes
  // loading (one of its per-file log arrays appears/changes) or the set of
  // tabs changes. We deliberately key off the per-file entries only —
  // `allFileLogs['Combined Files']` is written *by* this rebuild, so
  // depending on the whole `allFileLogs` object would create an infinite
  // loop (and tank scroll performance).
  const combinedSources = useMemo(
    () => files.map((file) => allFileLogs[file.id]),
    [files, allFileLogs],
  );
  const lastCombinedSourcesRef = useRef<(LogRecord[] | undefined)[]>([]);
  useEffect(() => {
    if (!showingCombinedView || files.length === 0) return;
    const previous = lastCombinedSourcesRef.current;
    if (
      previous.length === combinedSources.length &&
      previous.every((logs, index) => logs === combinedSources[index])
    )
      return;
    lastCombinedSourcesRef.current = combinedSources;
    buildCombinedView();
  }, [showingCombinedView, files.length, combinedSources, buildCombinedView]);

  // Only treat a drag as a file-drop when the OS is actually dragging files.
  // Internal drags (e.g. column reorder in the Column Settings modal) use
  // the 'text/plain' type and must not trigger the file-drop overlay.
  const isFileDrag = (e: DragEvent) => {
    const types = e.dataTransfer && e.dataTransfer.types;
    if (!types) return false;
    // DataTransferItemList vs DOMStringList — both support contains/includes via Array.from
    return Array.from(types).includes('Files');
  };

  // Recursively walk DataTransferItem entries (FileSystemEntry) and collect
  // every File. Sets webkitRelativePath on each file so directory-based
  // grouping works the same as the <input type="file" webkitdirectory> path.
  const collectFilesFromEntries = collectDroppedFiles;

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setIsFileDropActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setIsFileDropActive(false);
  }, []);

  // Shared ingestion path for files that arrive from outside the file pickers:
  // drag & drop and the PWA file handler ("Open With" in Finder/Explorer).
  const ingestExternalFiles = useCallback(
    async (incomingFiles: File[]) => {
      if (!incomingFiles || !incomingFiles.length) return;

      beginPreparingFiles();
      try {
        // Expand any incoming .zip / .tar.xz archives in place.
        const hasArchive = incomingFiles.some(isArchiveFile);
        let allFiles;
        try {
          allFiles = hasArchive ? await expandArchivesInList(incomingFiles) : incomingFiles;
        } catch (err) {
          alert(`Failed to extract archive: ${errorMessage(err)}`);
          return;
        }

        const textFiles = allFiles.filter(hasValidLogExtension);

        // Sort files by name before grouping (natural sort for numbered files)
        const sortedTextFiles = textFiles.sort((a, b) => naturalSort(a.name, b.name));

        // Group files by subdirectory + prefix, then split by detected log format
        // so only files sharing the same pattern end up in the same tab.
        const groupedFiles = await groupFilesByDirectoryAndFormat(sortedTextFiles);

        // If an archive came in, treat it like a folder load (clear tabs first).
        if (hasArchive) handleClearTabs();

        // Load each group
        groupedFiles.forEach((filesInGroup, groupKey) => {
          // Load as merged group with the groupKey as identifier
          handleFileLoad(filesInGroup, false, groupKey);
        });
      } finally {
        endPreparingFiles();
      }
    },
    [handleFileLoad, handleClearTabs, beginPreparingFiles, endPreparingFiles],
  );

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setIsFileDropActive(false);

      // If folders were dropped, walk their entries so we get every file with
      // a webkitRelativePath set (matches the folder-picker code path).
      const items = e.dataTransfer.items ? Array.from(e.dataTransfer.items) : [];
      const entries = items
        .filter((it) => it.kind === 'file')
        .map((it) => (typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null))
        .filter(Boolean);

      const droppedFiles = entries.length
        ? await collectFilesFromEntries(entries)
        : Array.from(e.dataTransfer.files);

      await ingestExternalFiles(droppedFiles);
    },
    [ingestExternalFiles],
  );

  // PWA file handling: when the installed app is launched by opening a log file
  // from the OS (Finder "Open With", Explorer double-click), the file handles
  // arrive through the launch queue. Requires the app to be installed as a PWA;
  // in a normal browser tab `launchQueue` is simply absent.
  useEffect(() => {
    if (!('launchQueue' in window) || !window.launchQueue) return;

    window.launchQueue.setConsumer(async (launchParams) => {
      const handles = launchParams?.files || [];
      if (!handles.length) return;

      const launchedFiles = [];
      for (const handle of handles) {
        try {
          launchedFiles.push(await handle.getFile());
        } catch (err) {
          console.error('Could not read launched file:', err);
        }
      }

      await ingestExternalFiles(launchedFiles);
    });
  }, [ingestExternalFiles]);

  // Open the tab-selection dialog
  const handleExportFile = useCallback(
    (fileId: string, label: string) => {
      const logs = allFileLogs[fileId] || [];
      exportLogsToFile(logs, label || fileId);
    },
    [allFileLogs],
  );

  const handleDownloadMerged = useCallback(() => {
    if (!files || files.length === 0) return;
    if (isLiveMode) {
      // For live logs: merge all live tabs in-memory sorted by timestamp
      const liveLogs = files.filter((f) => f.isLive).flatMap((f) => allFileLogs[f.id] || []);
      liveLogs.sort((a, b) =>
        (a.timestamp || '') < (b.timestamp || '')
          ? -1
          : (a.timestamp || '') > (b.timestamp || '')
            ? 1
            : 0,
      );
      exportLogsToFile(liveLogs, 'live_logs_merged', { tagSourceFile: true });
      return;
    }
    setIsMergeDialogOpen(true);
  }, [files, isLiveMode, allFileLogs]);

  // Run the JS port of mergeLogs.py against the selected tabs
  const handleConfirmMerge = useCallback(
    async (selectedIds: string[]) => {
      setIsMergeDialogOpen(false);

      // Collect raw File objects only from selected tabs
      const rawFiles: File[] = [];
      const seen = new Set();
      files.forEach((entry) => {
        if (!selectedIds.includes(entry.id)) return;
        const obj = entry && entry.fileObj;
        if (!obj) return;
        const list = Array.isArray(obj) ? obj : [obj];
        list.forEach((f) => {
          if (f && !seen.has(f)) {
            seen.add(f);
            rawFiles.push(f);
          }
        });
      });

      if (!rawFiles.length) {
        alert('No source files available to merge. Try re-loading the folder.');
        return;
      }

      setIsDownloadingMerged(true);
      try {
        const { mergeLogsToZip } = await import('./utils/mergeLogsScript');
        const folderLeaf = (currentFolderName || '').split('/').pop();
        const outputFolderName = folderLeaf ? `${folderLeaf}_merged` : undefined;
        const { blob, fileName, log } = await mergeLogsToZip(rawFiles, { outputFolderName });
        if (log && log.length) console.log('[merge-logs]\n' + log.join('\n'));

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Download Merged failed:', err);
        alert(`Download Merged failed: ${errorMessage(err)}`);
      } finally {
        setIsDownloadingMerged(false);
      }
    },
    [files, currentFolderName],
  );

  // Toggle log selection - if same log is clicked, close it; if different log, open it
  const handleLogClick = useCallback(
    (log: LogRecord) => {
      if (selectedLog && selectedLog.id === log.id) {
        // Same log clicked - close the modal
        setSelectedLog(null);
      } else {
        // Different log clicked - open the modal
        setSelectedLog(log);
      }
    },
    [selectedLog, setSelectedLog],
  );

  const selectedLogIndex = useMemo(
    () => (selectedLog ? filteredLogs.findIndex((log) => log.id === selectedLog.id) : -1),
    [selectedLog, filteredLogs],
  );
  const hasNextLog = selectedLogIndex >= 0 && selectedLogIndex < filteredLogs.length - 1;
  const hasPrevLog = selectedLogIndex > 0;
  const navigateSelectedLog = (direction: -1 | 1) => {
    const index = selectedLogIndex + direction;
    if (selectedLogIndex >= 0 && index >= 0 && index < filteredLogs.length) {
      setSelectedLog(filteredLogs[index]);
    }
  };

  const memoizedContent = useMemo(() => {
    if (!hasUserInteracted) {
      return (
        <Paper
          variant="outlined"
          sx={{
            width: 'min(640px, 90vw)',
            p: { xs: 3, sm: 6 },
            textAlign: 'center',
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: isFileDropActive ? 'primary.main' : 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ color: 'primary.main', mb: 2, '& svg': { fontSize: 44 } }}>
            <ToolbarIcon name="folder" />
          </Box>
          <Typography variant="h5" component="h2" sx={{ mb: 1, fontWeight: 600 }}>
            Drop log files here
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Choose Open Files in the toolbar, or drag files and folders into this window.
          </Typography>
          <Typography color="text.secondary" variant="caption" component="p" sx={{ mt: 2 }}>
            Windows · Apple · Linux · Android
          </Typography>
          <Typography color="text.secondary" variant="caption">
            .log, .txt, .ips, .zip, .xz, .txz
          </Typography>
        </Paper>
      );
    }

    if (files.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
          <p>No logs to display</p>
        </div>
      );
    }

    // Only render the list; filters toolbar is rendered above
    return (
      <LogListView
        key={columnResetKey}
        logs={filteredLogs}
        allLogs={logs}
        onLogClick={handleLogClick}
        highlightedLogId={highlightedLogId}
        selectedLogId={selectedLog?.id || null}
        filters={filters}
        onFiltersChange={updateFilters}
        onSearchMatchUpdate={(pos, total) => {
          setSearchPos(pos);
          setSearchTotal(total);
        }}
        onHover={setHoveredLog}
        pivotLog={pivotLog}
        onSetPivot={setPivotTime}
        onClearPivot={clearPivotTime}
        stickyLogs={stickyLogs}
        onAddStickyLog={addStickyLog}
        highlightLog={highlightLog}
        visibleColumns={visibleColumns}
        columnOrder={rightColumnOrder}
        onColumnOrderChange={handleRightColumnOrderChange}
        viewKey={
          showingCombinedView
            ? 'combined'
            : `file:${files[activeFileIndex]?.name || activeFileIndex}`
        }
        isLiveMode={isLiveMode}
      />
    );
  }, [
    hasUserInteracted,
    files,
    activeFileIndex,
    showingCombinedView,
    filteredLogs,
    handleLogClick,
    highlightedLogId,
    filters,
    pivotLog,
    setPivotTime,
    clearPivotTime,
    stickyLogs,
    addStickyLog,
    highlightLog,
    setSearchPos,
    setSearchTotal,
    updateFilters,
    setHoveredLog,
    visibleColumns,
    rightColumnOrder,
    handleRightColumnOrderChange,
    columnResetKey,
    isLiveMode,
  ]);

  return (
    <div
      className={`h-screen viewer-shell flex flex-col bg-gray-50 dark:bg-gray-900 ${isFileDropActive ? 'bg-blue-50 dark:bg-blue-900' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <SelectionFilesDialog
        isOpen={isMergeDialogOpen}
        onClose={() => setIsMergeDialogOpen(false)}
        files={files}
        onConfirm={handleConfirmMerge}
      />
      {loadError && <Alert severity="error">{loadError}</Alert>}
      {nativeError && (
        <Alert severity="error" onClose={() => setNativeError(false)}>
          Unable to read live logs. Check that the matching Cato helper is installed.
        </Alert>
      )}
      <LogViewerHeader
        onClearTabs={handleClearTabs}
        onFileLoad={handleFileLoad}
        onPrepareFilesStart={beginPreparingFiles}
        onPrepareFilesEnd={endPreparingFiles}
        hasLogs={files.length > 0}
        currentFileHeaders={headerState}
        visibleColumns={visibleColumns}
        onColumnsChange={setVisibleColumns}
        onResetColumnDefaults={handleResetColumnDefaults}
        logDuration={logDuration}
        folderName={currentFolderName}
        onDownloadMerged={handleDownloadMerged}
        isDownloadingMerged={isDownloadingMerged}
        onClearFilters={() =>
          updateFilters({
            searchText: '',
            searchQuery: '',
            logLevel: ['all'],
            selectedModule: 'all',
            contextLines: 0,
          })
        }
        isLiveConnected={isLiveConnected}
        isLiveChecking={isLiveChecking}
        onLiveToggle={handleLiveToggle}
        onOpenLiveSettings={() => setShowLiveSettings(true)}
      />

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex">
        <div className="overflow-hidden flex flex-col w-full">
          {/* Tabs - now inside left panel */}
          {files.length > 0 && (
            <LogTabs
              files={files}
              activeFileIndex={activeFileIndex}
              onFileSelect={handleFileSelect}
              onFileClose={handleFileClose}
              showingCombinedView={showingCombinedView}
              onCombinedViewSelect={handleCombinedViewSelect}
              isFileLoading={isFileLoading}
              onCloseAll={handleCloseAll}
              onExportActive={handleExportActive}
              onExportFile={handleExportFile}
              isLiveMode={isLiveMode}
              onFromNow={() => {
                const now = new Date();
                const pad = (n: number, len = 2) => String(n).padStart(len, '0');
                const yy = String(now.getFullYear());
                const mm = pad(now.getMonth() + 1);
                const dd = pad(now.getDate());
                const HH = pad(now.getHours());
                const MM = pad(now.getMinutes());
                const SS = pad(now.getSeconds());
                const ms = pad(now.getMilliseconds(), 3);
                const dateStr = `${yy}-${mm}-${dd} ${HH}:${MM}:${SS}.${ms}`;
                const clause = `#${dateStr} ::`;
                updateFiltersForAllFiles({ searchText: clause });
              }}
            />
          )}

          {/* Log viewing container with filters and content */}
          {hasUserInteracted && logs.length > 0 ? (
            <div className="flex-1 min-h-0 m-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
              <LogViewerFilters
                filters={filters}
                onFiltersChange={updateFilters}
                moduleOptions={moduleOptions}
                logsCount={logs.length}
                filteredLogsCount={filteredLogs.length}
                searchMatchCount={searchTotal}
                searchMatchPos={searchPos}
                pivotGap={currentPivotGap}
                pivotLineNumber={pivotLog?.lineNumber}
                stickyLogs={stickyLogs}
                onRemoveStickyLog={removeStickyLog}
                onClearAllStickyLogs={clearAllStickyLogs}
                onUpdateStickyLogTitle={updateStickyLogTitle}
                onScrollToLog={scrollToLog}
                activeFileId={showingCombinedView ? 'Combined Files' : files[activeFileIndex]?.id}
              />
              <div className="flex-1 overflow-hidden">{memoizedContent}</div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center ml-2 mr-2">
              {memoizedContent}
            </div>
          )}
        </div>
      </div>

      {selectedLog && (
        <LogModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onAddStickyLog={addStickyLog}
          onNext={() => navigateSelectedLog(1)}
          onPrev={() => navigateSelectedLog(-1)}
          hasNext={hasNextLog}
          hasPrev={hasPrevLog}
        />
      )}

      <Backdrop
        open={isAnyFileLoading || prepareFilesCount > 0}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <CircularProgress size={24} />
            <Typography role="status">Loading log files…</Typography>
          </Stack>
        </Paper>
      </Backdrop>
      <Snackbar open={!!notification} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert severity="warning" variant="filled" onClose={() => setNotification(null)}>
          {notification?.message}
        </Alert>
      </Snackbar>
      <Backdrop
        open={isFileDropActive}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 2, pointerEvents: 'none' }}
      >
        <Paper sx={{ p: 4 }}>
          <Typography variant="h6" color="primary">
            Drop your log files here
          </Typography>
        </Paper>
      </Backdrop>

      {/* Live logs folder configuration */}
      <LiveLogsSettings isOpen={showLiveSettings} onClose={() => setShowLiveSettings(false)} />

      {/* Live server not running dialog */}
      {showServerDialog && (
        <ViewerDialog open onClose={() => setShowServerDialog(false)} label="Set Up Live Logs">
          <DialogTitle>Set Up Live Logs</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {setupOnWindows
                ? 'Run this once in PowerShell. It installs a small background service that streams the Cato logs to the viewer and starts when you sign in.'
                : 'Run this once in Terminal. It installs a small background service that streams the Cato logs to the viewer, using only tools built into macOS.'}
            </Typography>
            {/* macOS: one-time background service (preferred) */}
            {!setupOnWindows &&
              (() => {
                const installCmd = buildMacInstallCommand(window.location.origin);
                return (
                  <div className="mb-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      One-time install
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      Asks for your Mac password once. The service starts with your Mac, so
                      afterwards just click Live Log — no folder and no terminal.
                    </p>
                    <div className="font-mono text-xs text-green-400 bg-gray-900 dark:bg-gray-950 rounded px-3 py-2 break-all select-all mb-2">
                      {installCmd}
                    </div>
                    <Button
                      variant="outlined"
                      onClick={() => navigator.clipboard.writeText(installCmd)}
                    >
                      Copy command
                    </Button>
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      It listens on this Mac only (127.0.0.1:4000) and answers only this viewer.
                      Using another browser? Run the command from that browser too. To remove it
                      later, open <span className="font-medium">Settings ▸ Live Logs Service</span>.
                    </p>
                  </div>
                );
              })()}

            {/* Windows: one-time background service */}
            {setupOnWindows &&
              (() => {
                const cmd = buildSetupCommand(window.location.origin, getSavedLogDir());
                return (
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg px-4 py-3 mb-5">
                    <div className="font-mono text-sm text-green-400 break-all mb-3 select-all leading-relaxed">
                      {cmd}
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outlined" onClick={() => navigator.clipboard.writeText(cmd)}>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy command
                      </Button>
                    </div>
                  </div>
                );
              })()}

            {setupOnWindows && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                Installs Node.js first if it's missing (via winget — accept the UAC prompt), then
                sets the service up under your profile. No administrator rights needed. It reads the
                installed Cato Client's logs automatically; to use another folder (a dev build,
                say), or to update or uninstall the service, open{' '}
                <span className="font-medium">Settings ▸ Live Logs Settings</span>.
              </p>
            )}
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={() => setShowServerDialog(false)}>
              Got it
            </Button>
          </DialogActions>
        </ViewerDialog>
      )}
    </div>
  );
};

export default LogViewer;
