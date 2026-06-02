import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LogListView from './LogListView';
import LogModal from './LogModal';
import LogViewerHeader from './LogViewerHeader';
import LogViewerFilters from './LogViewerFilters';
import LogTabs from './LogTabs';
import SelectionFilesDialog from './SelectionFilesDialog';
import useLogsModel from './useLogsModel';
import { getFileIdentifier } from './utils/fileLoader';
import { getFileDisplayName } from './utils/fileLoader';
import { saveSession, loadSession, clearSession } from './utils/sessionStorage';
import { groupFilesByPrefix, groupFilesByDirectory, groupFilesByDirectoryAndFormat, naturalSort, hasValidLogExtension } from './utils/fileGrouping';
import { isArchiveFile, expandArchivesInList } from './utils/archiveExtractor';
import { exportLogsToFile } from './utils/exportLogs';
import { AVAILABLE_COLUMNS } from './ColumnSettings';

// Turn a raw folder name like "2387341752-260422074919 (1)" into the short
// label we want in the page title.
//   - drop any trailing " (N)" duplicate marker
//   - if the name is "<id>-<YYMMDDHHMMSS>" or just "<YYMMDDHHMMSS>", format
//     the timestamp as "YY.MM.DD-HHMMSS"  (e.g. 260428063435 -> 26.04.28-063435)
//   - otherwise: if it's "<id>-<suffix>", keep just the suffix
function cleanFolderLabel(name) {
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
    logs,
    filteredLogs,
    moduleOptions,
    selectedLog,
    filters,
    highlightedLogId,
    logFileHeaders,
    allFileLogs,
    stickyLogs,
    loadLogs,
    requestFileLoad,
    isFileLoading,
    isAnyFileLoading,
    setSelectedLog,
    updateFilters,
    highlightLog,
    clearHighlight,
    getCurrentFileHeaders,
    setLogsForFile,
    setLogFileHeaders,
    switchToFile,
    removeLogsForFile,
    addStickyLog,
    removeStickyLog,
    clearAllStickyLogs,
    updateStickyLogTitle,
    scrollToLog,
    resetModel
  } = useLogsModel();

  // Pivot time tracking
  const [pivotLog, setPivotLog] = useState(null);
  const [hoveredLog, setHoveredLog] = useState(null);
  const [lastHoveredLog, setLastHoveredLog] = useState(null);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('logViewerColumns');
    if (saved) {
      return JSON.parse(saved);
    }
    // Default columns
    const defaultColumns = {};
    AVAILABLE_COLUMNS.forEach(col => {
      defaultColumns[col.id] = col.defaultVisible;
    });
    return defaultColumns;
  });

  // Column change version to force re-render
  const [columnVersion, setColumnVersion] = useState(0);

  // Order of all log-row columns. Persisted via the Column Settings modal.
  // Falls back to the default order and merges in any new column ids added
  // in future versions.
  const DEFAULT_COLUMN_ORDER = ['timestamp', 'lineNumber', 'logLevel', 'message', 'module', 'sourceFile', 'timeGap', 'processThread'];
  const [rightColumnOrder, setRightColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('logViewerColumnOrder');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const known = parsed.filter(id => DEFAULT_COLUMN_ORDER.includes(id));
          DEFAULT_COLUMN_ORDER.forEach(id => { if (!known.includes(id)) known.push(id); });
          return known;
        }
      }
    } catch { /* ignore */ }
    return DEFAULT_COLUMN_ORDER.slice();
  });

  const handleRightColumnOrderChange = useCallback((newOrder) => {
    setRightColumnOrder(newOrder);
    try { localStorage.setItem('logViewerColumnOrder', JSON.stringify(newOrder)); } catch { /* ignore */ }
    setColumnVersion(prev => prev + 1);
  }, []);

  // Handler that updates columns and increments version
  const handleColumnsChange = useCallback((newColumns) => {
    setVisibleColumns(newColumns);
    setColumnVersion(prev => prev + 1);
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
    } catch { /* ignore */ }
    setColumnResetKey(prev => prev + 1);
    setColumnVersion(prev => prev + 1);
  }, []);

  // Update lastHoveredLog whenever hoveredLog changes to a non-null value
  useEffect(() => {
    if (hoveredLog) {
      setLastHoveredLog(hoveredLog);
    }
  }, [hoveredLog]);

  // Calculate pivot time gap in DD Days, HH:MM:SS format (or just HH:MM:SS if no days)
  const calculatePivotGap = useCallback((pivotLog, currentLog) => {
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
  }, []);

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
      return "Set";
    }
  }, [pivotLog, hoveredLog, lastHoveredLog, calculatePivotGap]);

  // Pivot control functions
  const setPivotTime = useCallback((log) => {
    setPivotLog(log);
    // Save to localStorage for persistence
    localStorage.setItem('logViewer_pivotLog', JSON.stringify({
      id: log.id,
      timestamp: log.timestamp,
      lineNumber: log.lineNumber
    }));
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
        const foundLog = filteredLogs.find(log => log.id === pivotData.id);
        if (foundLog) {
          setPivotLog(foundLog);
        } else {
          // Clear invalid pivot
          localStorage.removeItem('logViewer_pivotLog');
        }
      } catch (e) {
        localStorage.removeItem('logViewer_pivotLog');
      }
    }
  }, [filteredLogs]);

  // Notification listener for sticky log messages
  useEffect(() => {
    const handleLogNotVisible = (event) => {
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
  const [headerState, setHeaderState] = useState(null);
  const [logDuration, setLogDuration] = useState(null);
  const [notification, setNotification] = useState(null);
  // Counter of in-flight "prepare files" operations (archive expand, grouping,
  // dispatching loads). The loading overlay stays visible while > 0 OR while
  // any single file is still being parsed by the model.
  const [prepareFilesCount, setPrepareFilesCount] = useState(0);
  const beginPreparingFiles = useCallback(() => setPrepareFilesCount(c => c + 1), []);
  const endPreparingFiles = useCallback(() => setPrepareFilesCount(c => Math.max(0, c - 1)), []);
  const [isDownloadingMerged, setIsDownloadingMerged] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);

  // Compute number of search matches
  const searchMatchCount = useMemo(() => {
    if (!filters.searchQuery) return 0;
    const unquote = (t) =>
      t.startsWith('"') && t.endsWith('"') && t.length >= 2 ? t.slice(1, -1) : t;
    const terms = filters.searchQuery
      .split('||')
      .flatMap((part, partIdx, allParts) => {
        let inner = partIdx < allParts.length - 1 ? part.trimEnd() : part;
        if (partIdx > 0) inner = inner.trimStart();
        if (inner.startsWith('(') && inner.endsWith(')')) inner = inner.slice(1, -1).trim();
        return inner.split('&&').map((t, tIdx, allT) => {
          if (allT.length === 1) return unquote(t);
          if (tIdx < allT.length - 1) return unquote(t.trim());
          return unquote(t.trimStart());
        });
      })
      .filter(t => t.trim())
      .map(t => t.toLowerCase());
    if (!terms.length) return 0;
    return filteredLogs.reduce((cnt, log) => {
      const msg = (log.message || '');
      const compare = filters.searchCaseSensitive
        ? (haystack, needle) => haystack.includes(needle)
        : (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());
      return terms.some(term => compare(msg, term)) ? cnt + 1 : cnt;
    }, 0);
  }, [filters.searchQuery, filters.searchCaseSensitive, filteredLogs]);
  
  // Multi-file support
  const [files, setFiles] = useState([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [combinedViewLoaded, setCombinedViewLoaded] = useState(false);
  const [showingCombinedView, setShowingCombinedView] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [pendingActiveFileId, setPendingActiveFileId] = useState(null);

  // Watch for when logs are restored and switch to the pending active file
  useEffect(() => {
    if (pendingActiveFileId && allFileLogs[pendingActiveFileId]) {
      switchToFile(pendingActiveFileId);
      setPendingActiveFileId(null);
      setIsRestoringSession(false);
    }
  }, [allFileLogs, pendingActiveFileId, switchToFile]);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      setIsRestoringSession(true);
      const session = await loadSession();
      
      if (session && session.files && session.files.length > 0) {
        // Restore UI state first
        const restoredActiveIndex = session.activeFileIndex || 0;
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
        const filesToSave = files.map(f => ({ name: f.name, id: f.id }));
        
        // Only save logs for currently open files
        const logsToSave = {};
        files.forEach(f => {
          if (allFileLogs[f.id]) {
            logsToSave[f.id] = allFileLogs[f.id];
          }
        });
        
        
        saveSession({
          files: filesToSave,
          activeFileIndex,
          showingCombinedView,
          allFileLogs: logsToSave,
          logFileHeaders
        });
      }
    }, 1000); // Save after 1 second of inactivity
    
    return () => clearTimeout(timeoutId);
  }, [files, activeFileIndex, showingCombinedView, allFileLogs, hasUserInteracted, isRestoringSession]);

  // Clear existing tabs before loading a new folder
  const handleClearTabs = useCallback(() => {
    setFiles([]);
    setActiveFileIndex(0);
    setShowingCombinedView(false);
    setCombinedViewLoaded(false);
    setHasUserInteracted(false);
    setHeaderState(null); // Clear header details
    setLogDuration(null); // Clear time range
  }, []);


  const handleFileLoad = useCallback((fileOrFiles, clearTabsFirst = false, groupPrefix = null) => {
    // Support both single file and array of files (for grouped Windows logs)
    const isFileArray = Array.isArray(fileOrFiles);
    const firstFile = isFileArray ? fileOrFiles[0] : fileOrFiles;
    
    // Only load .txt, .log, or .ips files
    // For file groups, check if AT LEAST ONE file has a valid extension
    if (isFileArray) {
      // For groups, check if at least one file is valid
      const hasValidFile = fileOrFiles.some(hasValidLogExtension);
      if (!hasValidFile) {
        return;
      }
    } else {
      // For single file, check the file itself
      if (!hasValidLogExtension(fileOrFiles)) {
        return;
      }
    }
    
    // Optionally clear all tabs before loading (for new folder)
    if (clearTabsFirst) {
      handleClearTabs();
    }
    
    // For grouped files, use the prefix with file count as the identifier
    // (only append the count when there is more than one file in the group)
    const fileId = isFileArray && groupPrefix
      ? (fileOrFiles.length > 1 ? `${groupPrefix} (${fileOrFiles.length})` : groupPrefix)
      : getFileIdentifier(firstFile);
    
    // Check if file/group already exists
    const existingIndex = files.findIndex(f => f.id === fileId);
    if (existingIndex >= 0) {
      setActiveFileIndex(existingIndex);
      setShowingCombinedView(false);
      switchToFile(fileId);
      return;
    }
    
    setFiles(prev => {
      const displayName = isFileArray && groupPrefix
        ? (fileOrFiles.length > 1 ? `${groupPrefix} (${fileOrFiles.length})` : groupPrefix)
        : firstFile.name;
      
      const newFiles = [...prev, { 
        name: displayName, 
        id: fileId, 
        fileObj: fileOrFiles, // Store array or single file
        isGroup: isFileArray,
        groupPrefix: groupPrefix
      }];
      const newIndex = newFiles.length - 1;

      // Always set the newly loaded file as active
      setActiveFileIndex(newIndex);
      setShowingCombinedView(false);
      
      // Request load with proper file(s)
      requestFileLoad(fileId, fileOrFiles);

      // Switch to the new file to show its logs (works for both single and grouped)
      setTimeout(() => {
        switchToFile(fileId);
      }, 0);

      return newFiles;
    });
    setHasUserInteracted(true);
  }, [files, switchToFile, requestFileLoad, handleClearTabs]);

  // Watch for logs changes to update header
  useEffect(() => {
    if (logs && logs.length > 0) {
      // First try to get headers from file headers using file ID instead of name
      const currentFile = files[activeFileIndex];
      if (currentFile) {
        const fileHeaders = getCurrentFileHeaders(currentFile.id);
        if (fileHeaders && (fileHeaders.user || fileHeaders.account || fileHeaders.clientVersion || fileHeaders.osVersion)) {
          setHeaderState(fileHeaders);
          return;
        }
      }

      // If no file headers, try to find header details from first few logs
      const headerInfo = {};
      for (let i = 0; i < Math.min(logs.length, 10); i++) {
        const log = logs[i];
        if (log.user && !headerInfo.user) headerInfo.user = log.user;
        if (log.account && !headerInfo.account) headerInfo.account = log.account;
        if (log.clientVersion && !headerInfo.clientVersion) headerInfo.clientVersion = log.clientVersion;
        if (log.osVersion && !headerInfo.osVersion) headerInfo.osVersion = log.osVersion;
      }
      if (Object.keys(headerInfo).length > 0) {
        setHeaderState(headerInfo);
      }
    }
  }, [logs, files, activeFileIndex, getCurrentFileHeaders]);

  // Get folder name from current file
  const currentFolderName = useMemo(() => {
    if (!files || files.length === 0) return null;

    // Walk every loaded tab and every underlying File to collect the parent
    // path of each file. We then pick the first non-empty parent path that
    // contains a separator (i.e. has a real folder, not a bare filename).
    const collectPaths = () => {
      const paths = [];
      const visit = (obj) => {
        if (!obj) return;
        if (Array.isArray(obj)) { obj.forEach(visit); return; }
        if (obj.webkitRelativePath) paths.push(obj.webkitRelativePath);
        else if (obj.path) paths.push(obj.path);
      };
      files.forEach(file => {
        visit(file && file.fileObj);
        if (file && file.id && typeof file.id === 'string' && file.id.includes('/')) {
          paths.push(file.id);
        }
      });
      return paths;
    };

    const paths = collectPaths();
    for (const p of paths) {
      const parts = p.split('/').filter(Boolean);
      if (parts.length > 1) return parts.slice(0, -1).join('/');
    }
    // Fallback: a bare folder name with no children (rare).
    for (const p of paths) {
      const parts = p.split('/').filter(Boolean);
      if (parts.length === 1) return parts[0];
    }
    return null;
  }, [files]);

  // Update the document title based on what's loaded:
  //   - Folder load (multiple files OR a single file whose webkitRelativePath
  //     contains a parent folder)  -> "Log Viewer - <folder leaf>"
  //   - Single file load and nothing previously loaded -> "Log Viewer - <file>"
  //   - Single file added on top of existing content   -> leave title alone
  //   - No files loaded                                -> reset to default
  const DEFAULT_TITLE = 'Cato Client Log Viewer';
  const previousFilesCountRef = React.useRef(0);
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

  // Calculate log time range (start - end)
  useEffect(() => {
    if (logs && logs.length > 0) {
      const firstLog = logs[0];
      const lastLog = logs[logs.length - 1];
      
      if (firstLog.displayDate && firstLog.displayTime && lastLog.displayDate && lastLog.displayTime) {
        setLogDuration(`${firstLog.displayDate} ${firstLog.displayTime} → ${lastLog.displayDate} ${lastLog.displayTime}`);
      } else if (firstLog.timestamp && lastLog.timestamp) {
        // Fallback if display fields are not available
        const startTime = firstLog.timestamp.replace(/[:.](\d{3})$/, '.$1');
        const endTime = lastLog.timestamp.replace(/[:.](\d{3})$/, '.$1');
        setLogDuration(`${startTime} → ${endTime}`);
      } else {
        setLogDuration(null);
      }
    } else {
      setLogDuration(null);
    }
  }, [logs]);

  const handleFileSelect = useCallback((index) => {
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
  }, [files, allFileLogs, requestFileLoad, switchToFile]);

  // After all files finish loading + sorting, auto-select the first tab
  // (alphabetically by display title — same order as the sorted tab strip).
  const wasLoadingRef = React.useRef(false);
  useEffect(() => {
    const isLoading = isAnyFileLoading || prepareFilesCount > 0;
    if (wasLoadingRef.current && !isLoading) {
      // Just transitioned from loading → idle. Pick the first sorted tab.
      if (files.length > 0 && !showingCombinedView && !isRestoringSession) {
        const sorted = files
          .map((file, originalIndex) => ({
            originalIndex,
            label: getFileDisplayName(file.id),
          }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }));

        const firstIndex = sorted[0].originalIndex;
        if (firstIndex !== activeFileIndex) {
          handleFileSelect(firstIndex);
        }
      }
    }
    wasLoadingRef.current = isLoading;
  }, [isAnyFileLoading, prepareFilesCount, files, showingCombinedView, isRestoringSession, activeFileIndex, handleFileSelect]);

  const handleFileClose = useCallback((index) => {
    const fileToClose = files[index];

    // Clean up stored logs for the closed file first
    if (fileToClose) {
      removeLogsForFile(fileToClose.id);

    }

    setFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      
      // Immediately save or clear session
      setTimeout(() => {
        if (newFiles.length > 0) {
          const logsToSave = {};
          newFiles.forEach(f => {
            if (allFileLogs[f.id]) {
              logsToSave[f.id] = allFileLogs[f.id];
            }
          });
          
          const newIndex = activeFileIndex >= index && activeFileIndex > 0 
            ? activeFileIndex - 1 
            : Math.min(activeFileIndex, newFiles.length - 1);
          
          console.log(`Immediately saving session after closing file. Remaining files: ${newFiles.length}`);
          saveSession({
            files: newFiles.map(f => ({ name: f.name, id: f.id })),
            activeFileIndex: newIndex,
            showingCombinedView: newFiles.length < 2 ? false : showingCombinedView,
            allFileLogs: logsToSave
          });
        } else {
          clearSession();
        }
      }, 50);
      
      if (newFiles.length === 0) {
        setHasUserInteracted(false);
        setActiveFileIndex(0);
        setShowingCombinedView(false);
        setCombinedViewLoaded(false);
        setHeaderState(null); // Clear header details when last tab is closed
        setLogDuration(null); // Clear time range when last tab is closed
        return [];
      }

      // Reset combined view if we have less than 2 files
      if (newFiles.length < 2) {
        setShowingCombinedView(false);
        setCombinedViewLoaded(false);
      } else if (showingCombinedView) {
        // If combined view was active and we still have multiple files, 
        // we need to reload the combined view
        setCombinedViewLoaded(false);
      }

      if (activeFileIndex >= index && activeFileIndex > 0) {
        setActiveFileIndex(activeFileIndex - 1);
      } else if (activeFileIndex === index) {
        const newIndex = Math.min(activeFileIndex, newFiles.length - 1);
        setActiveFileIndex(newIndex);

        // Switch to the new active file
        if (newFiles[newIndex]) {
          switchToFile(newFiles[newIndex].id);
        }
      }

      return newFiles;
    });
  }, [activeFileIndex, files, switchToFile, showingCombinedView, removeLogsForFile, allFileLogs, saveSession]);

  const handleCloseAll = useCallback(() => {
    // Wipe the entire model (logs, sticky notes, headers, current file, etc.)
    resetModel();
    resetModel();

    // Clear all UI state in this component
    setFiles([]);
    setHasUserInteracted(false);
    setActiveFileIndex(0);
    setShowingCombinedView(false);
    setCombinedViewLoaded(false);
    setHeaderState(null);
    setLogDuration(null);
    setPivotLog(null);
    setHoveredLog(null);
    setLastHoveredLog(null);

    // Clear session storage
    clearSession();
  }, [resetModel, clearSession]);

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

    // Combine all existing models from all tabs (no re-parsing!)
    const allCombinedLogs = files.flatMap((file, fileIndex) => {
      const fileLogs = allFileLogs[file.id] || [];
      return fileLogs.map((log, logIndex) => {
        const newLog = {
          ...log,
          baseId: log.baseId || log.id,
          id: `${file.id}-${log.id}`,
          sourceFile: log.sourceFile || file.id,
          originalFileIndex: fileIndex,
          originalLogIndex: logIndex,
          originalLogId: log.id
        };
        if (log.isContinuation && log.parentLogId !== undefined) {
          newLog.parentLogId = `${file.id}-${log.parentLogId}`;
          newLog.originalParentLogId = log.parentLogId;
        }
        return newLog;
      });
    });

    const normalLogs = [];
    const continuationsByParent = new Map();
    allCombinedLogs.forEach(log => {
      if (log.isContinuation && log.originalParentLogId !== undefined) {
        const key = `${log.originalFileIndex}:${log.originalParentLogId}`;
        if (!continuationsByParent.has(key)) continuationsByParent.set(key, []);
        continuationsByParent.get(key).push(log);
      } else {
        normalLogs.push(log);
      }
    });

    normalLogs.sort((a, b) => {
      if (a.timestampMs && b.timestampMs && a.timestampMs !== b.timestampMs) {
        return a.timestampMs - b.timestampMs;
      }
      if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) {
        return a.timestamp.localeCompare(b.timestamp);
      }
      if (a.originalFileIndex !== b.originalFileIndex) {
        return a.originalFileIndex - b.originalFileIndex;
      }
      return a.originalLogIndex - b.originalLogIndex;
    });

    const combinedLogs = [];
    normalLogs.forEach(log => {
      combinedLogs.push(log);
      const key = `${log.originalFileIndex}:${log.originalLogId}`;
      const continuations = continuationsByParent.get(key) || [];
      continuations.forEach(contLog => combinedLogs.push(contLog));
    });

    setLogsForFile('Combined Files', combinedLogs);
  }, [files, allFileLogs, setLogsForFile]);

  const handleCombinedViewSelect = useCallback(() => {
    setShowingCombinedView(true);
    // Force a rebuild on (re)entry — the dedupe ref below would otherwise
    // skip the build if the source signature happens to match the last one.
    lastBuiltSignatureRef.current = null;

    // Force-load any tabs whose logs aren't in memory yet so the combined
    // view will include records from every tab, not just the previously
    // visited ones.
    files.forEach(file => {
      if (!allFileLogs[file.id] && file.fileObj) {
        requestFileLoad(file.id, file.fileObj);
      }
    });

    if (files.length > 0) {
      buildCombinedView();
      setCombinedViewLoaded(true);
    }
    switchToFile('Combined Files');
  }, [files, allFileLogs, requestFileLoad, buildCombinedView, switchToFile]);

  // While the combined view is active, rebuild it whenever a tab finishes
  // loading (one of its per-file log arrays appears/changes) or the set of
  // tabs changes. We deliberately key off the per-file entries only —
  // `allFileLogs['Combined Files']` is written *by* this rebuild, so
  // depending on the whole `allFileLogs` object would create an infinite
  // loop (and tank scroll performance).
  const combinedSourceSignature = useMemo(() => (
    files.map(f => `${f.id}:${(allFileLogs[f.id] || []).length}`).join('|')
  ), [files, allFileLogs]);
  const lastBuiltSignatureRef = React.useRef(null);
  useEffect(() => {
    if (!showingCombinedView) return;
    if (files.length === 0) return;
    if (lastBuiltSignatureRef.current === combinedSourceSignature) return;
    lastBuiltSignatureRef.current = combinedSourceSignature;
    buildCombinedView();
  }, [showingCombinedView, files.length, combinedSourceSignature, buildCombinedView]);

  // Only treat a drag as a file-drop when the OS is actually dragging files.
  // Internal drags (e.g. column reorder in the Column Settings modal) use
  // the 'text/plain' type and must not trigger the file-drop overlay.
  const isFileDrag = (e) => {
    const types = e.dataTransfer && e.dataTransfer.types;
    if (!types) return false;
    // DataTransferItemList vs DOMStringList — both support contains/includes via Array.from
    return Array.from(types).includes('Files');
  };

  // Recursively walk DataTransferItem entries (FileSystemEntry) and collect
  // every File. Sets webkitRelativePath on each file so directory-based
  // grouping works the same as the <input type="file" webkitdirectory> path.
  const collectFilesFromEntries = async (entries) => {
    const results = [];

    const readDirectory = (dirReader) => new Promise((resolve, reject) => {
      const all = [];
      const readBatch = () => {
        dirReader.readEntries((batch) => {
          if (!batch.length) {
            resolve(all);
          } else {
            all.push(...batch);
            readBatch();
          }
        }, reject);
      };
      readBatch();
    });

    const getFile = (fileEntry) => new Promise((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });

    const walk = async (entry, pathPrefix) => {
      if (!entry) return;
      if (entry.isFile) {
        try {
          const file = await getFile(entry);
          const relPath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
          // webkitRelativePath is read-only on File; redefine it so downstream
          // grouping by directory works as expected.
          try {
            Object.defineProperty(file, 'webkitRelativePath', {
              value: relPath,
              configurable: true,
              writable: false,
            });
          } catch (_) { /* ignore — best effort */ }
          results.push(file);
        } catch (_) { /* skip unreadable file */ }
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const children = await readDirectory(reader);
        const nextPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
        for (const child of children) {
          await walk(child, nextPrefix);
        }
      }
    };

    for (const entry of entries) {
      await walk(entry, '');
    }
    return results;
  };

  const handleDragOver = useCallback((e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setIsFileDropActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setIsFileDropActive(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
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

    let droppedFiles = entries.length
      ? await collectFilesFromEntries(entries)
      : Array.from(e.dataTransfer.files);

    if (!droppedFiles.length) return;

    beginPreparingFiles();
    try {
      // Expand any dropped .zip / .tar.xz archives in place.
      const hasArchive = droppedFiles.some(isArchiveFile);
      let allFiles;
      try {
        allFiles = hasArchive ? await expandArchivesInList(droppedFiles) : droppedFiles;
      } catch (err) {
        alert(`Failed to extract archive: ${err.message || err}`);
        return;
      }

      const textFiles = allFiles.filter(hasValidLogExtension);

      // Sort files by name before grouping (natural sort for numbered files)
      const sortedTextFiles = textFiles.sort((a, b) => naturalSort(a.name, b.name));

      // Group files by subdirectory + prefix, then split by detected log format
      // so only files sharing the same pattern end up in the same tab.
      const groupedFiles = await groupFilesByDirectoryAndFormat(sortedTextFiles);

      // If an archive was dropped, treat it like a folder load (clear tabs first).
      if (hasArchive) handleClearTabs();

      // Load each group
      groupedFiles.forEach((filesInGroup, groupKey) => {
        // Load as merged group with the groupKey as identifier
        handleFileLoad(filesInGroup, false, groupKey);
      });
    } finally {
      endPreparingFiles();
    }
  }, [handleFileLoad, handleClearTabs, beginPreparingFiles, endPreparingFiles]);


  // Open the tab-selection dialog
  const handleDownloadMerged = useCallback(() => {
    if (!files || files.length === 0) return;
    setIsMergeDialogOpen(true);
  }, [files]);

  // Run the JS port of mergeLogs.py against the selected tabs
  const handleConfirmMerge = useCallback(async (selectedIds) => {
    setIsMergeDialogOpen(false);

    // Collect raw File objects only from selected tabs
    const rawFiles = [];
    const seen = new Set();
    files.forEach(entry => {
      if (!selectedIds.includes(entry.id)) return;
      const obj = entry && entry.fileObj;
      if (!obj) return;
      const list = Array.isArray(obj) ? obj : [obj];
      list.forEach(f => {
        if (f && !seen.has(f)) { seen.add(f); rawFiles.push(f); }
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
      alert(`Download Merged failed: ${err.message || err}`);
    } finally {
      setIsDownloadingMerged(false);
    }
  }, [files, currentFolderName]);


  // Toggle log selection - if same log is clicked, close it; if different log, open it
  const handleLogClick = useCallback((log) => {
    if (selectedLog && selectedLog.id === log.id) {
      // Same log clicked - close the modal
      setSelectedLog(null);
    } else {
      // Different log clicked - open the modal
      setSelectedLog(log);
    }
  }, [selectedLog, setSelectedLog]);

  // Navigation functions for modal
  const navigateToNextLog = useCallback(() => {
    if (!selectedLog || !filteredLogs.length) return;

    const currentIndex = filteredLogs.findIndex(log => log.id === selectedLog.id);
    if (currentIndex >= 0 && currentIndex < filteredLogs.length - 1) {
      const nextLog = filteredLogs[currentIndex + 1];
      setSelectedLog({ ...nextLog, lineIndex: currentIndex + 2 }); // Keep lineIndex for modal navigation, lineNumber is preserved from original log
    }
  }, [selectedLog, filteredLogs, setSelectedLog]);

  const navigateToPrevLog = useCallback(() => {
    if (!selectedLog || !filteredLogs.length) return;

    const currentIndex = filteredLogs.findIndex(log => log.id === selectedLog.id);
    if (currentIndex > 0) {
      const prevLog = filteredLogs[currentIndex - 1];
      setSelectedLog({ ...prevLog, lineIndex: currentIndex }); // Keep lineIndex for modal navigation, lineNumber is preserved from original log
    }
  }, [selectedLog, filteredLogs, setSelectedLog]);

  // Check if next/prev navigation is available
  const hasNextLog = useMemo(() => {
    if (!selectedLog || !filteredLogs.length) return false;
    const currentIndex = filteredLogs.findIndex(log => log.id === selectedLog.id);
    return currentIndex >= 0 && currentIndex < filteredLogs.length - 1;
  }, [selectedLog, filteredLogs]);

  const hasPrevLog = useMemo(() => {
    if (!selectedLog || !filteredLogs.length) return false;
    const currentIndex = filteredLogs.findIndex(log => log.id === selectedLog.id);
    return currentIndex > 0;
  }, [selectedLog, filteredLogs]);

  const memoizedContent = useMemo(() => {
    if (!hasUserInteracted) {
      return (
        <div className="flex items-center justify-center h-full">
          <div
            style={{ width: '50vw', height: '50vh' }}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors
              ${isFileDropActive
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400'
              }`}
          >
            {/* Cloud / upload icon */}
            <svg className="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-2xl font-semibold mb-2">Drop log files here</p>
            <p className="text-sm mb-1">or click <span className="font-medium">"Open Files"</span> in the toolbar to get started</p>
            <p className="text-xs mt-3 opacity-60">Supports .log, .txt, .ips — single files, folders, or archives</p>
          </div>
        </div>
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
        viewKey={showingCombinedView ? 'combined' : `file:${files[activeFileIndex]?.name || activeFileIndex}`}
      />
    );
  }, [hasUserInteracted, isFileDropActive, files, activeFileIndex, showingCombinedView, filteredLogs, handleLogClick, highlightedLogId, filters, pivotLog, setPivotTime, clearPivotTime, stickyLogs, addStickyLog, highlightLog, setSearchPos, setSearchTotal, updateFilters, setHoveredLog, visibleColumns, columnVersion, rightColumnOrder, handleRightColumnOrderChange, columnResetKey]);

  // Remove old currentFileHeaders logic - now using headerState

  return (
    <div
      className={`h-screen flex flex-col bg-gray-50 dark:bg-gray-900 ${isFileDropActive ? 'bg-blue-50 dark:bg-blue-900' : ''}`}
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
      <LogViewerHeader
        onClearTabs={handleClearTabs}
        onFileLoad={handleFileLoad}
        onPrepareFilesStart={beginPreparingFiles}
        onPrepareFilesEnd={endPreparingFiles}
        hasLogs={files.length > 0}
        currentFileHeaders={headerState}
        visibleColumns={visibleColumns}
        onColumnsChange={handleColumnsChange}
        onResetColumnDefaults={handleResetColumnDefaults}
        logDuration={logDuration}
        folderName={currentFolderName}
        onDownloadMerged={handleDownloadMerged}
        isDownloadingMerged={isDownloadingMerged}
        onClearFilters={() => updateFilters({ searchText: '', searchQuery: '', logLevel: ['all'], selectedModule: 'all', contextLines: 0 })}
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
                allFileLogs={allFileLogs}
                isFileLoading={isFileLoading}
                onCloseAll={handleCloseAll}
                onExportActive={handleExportActive}
              />
            )}

            {/* Log viewing container with filters and content */}
            {hasUserInteracted && logs.length > 0 ? (
              <div className="flex-1 mt-2 mb-2 ml-2 mr-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col pb-0">
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
                  activeFileIndex={activeFileIndex}
                />
                <div className="flex-1 overflow-hidden">
                  {memoizedContent}
                </div>
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
          onNext={navigateToNextLog}
          onPrev={navigateToPrevLog}
          hasNext={hasNextLog}
          hasPrev={hasPrevLog}
        />
      )}

      {/* Loading overlay shown while any file is being parsed or prepared */}
      {(isAnyFileLoading || prepareFilesCount > 0) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl px-6 py-5 flex items-center gap-3 border border-gray-200 dark:border-gray-700">
            <svg className="animate-spin h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <div className="text-sm text-gray-800 dark:text-gray-100">
              Loading log files…
            </div>
          </div>
        </div>
      )}

      {/* Sticky Log Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-lg shadow-lg max-w-sm">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">
                  {notification.message}
                </p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setNotification(null)}
                  className="inline-flex text-yellow-400 hover:text-yellow-600 focus:outline-none focus:text-yellow-600"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isFileDropActive && (
        <div className="fixed inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg">
            <p className="text-xl text-blue-600 dark:text-blue-400">Drop your log files here</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogViewer;
