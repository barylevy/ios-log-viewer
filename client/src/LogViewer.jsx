import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LogListView from './LogListView';
import LogModal from './LogModal';
import LogViewerHeader from './LogViewerHeader';
import LogViewerFilters from './LogViewerFilters';
import LogTabs from './LogTabs';
import AIChat from './AIChat';
import useLogsModel, { getFileIdentifier } from './useLogsModel';
import { saveSession, loadSession, clearSession } from './utils/sessionStorage';
import { AVAILABLE_COLUMNS } from './ColumnSettings';

const LogViewer = () => {
  const {
    logs,
    filteredLogs,
    selectedLog,
    filters,
    highlightedLogId,
    logFileHeaders,
    allFileLogs,
    stickyLogs,
    loadLogs,
    requestFileLoad,
    isFileLoading,
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
    scrollToLog
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

  // Handler that updates columns and increments version
  const handleColumnsChange = useCallback((newColumns) => {
    setVisibleColumns(newColumns);
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

  // Compute number of search matches
  const searchMatchCount = useMemo(() => {
    if (!filters.searchQuery) return 0;
    const terms = filters.searchQuery
      .split('||')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);
    if (!terms.length) return 0;
    return filteredLogs.reduce((cnt, log) => {
      const msg = (log.message || '').toLowerCase();
      return terms.some(term => msg.includes(term)) ? cnt + 1 : cnt;
    }, 0);
  }, [filters.searchQuery, filteredLogs]);
  
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

  // AI Chat
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [isAIChatFullWidth, setIsAIChatFullWidth] = useState(false);

  const handleFileLoad = useCallback((fileOrFiles, clearTabsFirst = false, groupPrefix = null) => {
    // Support both single file and array of files (for grouped Windows logs)
    const isFileArray = Array.isArray(fileOrFiles);
    const firstFile = isFileArray ? fileOrFiles[0] : fileOrFiles;
    
    // Only load .txt files or .log files
    if (!firstFile.name.toLowerCase().endsWith('.txt') && !firstFile.name.toLowerCase().endsWith('.log')) {
      return;
    }
    
    // Optionally clear all tabs before loading (for new folder)
    if (clearTabsFirst) {
      handleClearTabs();
    }
    
    // For grouped files, use the prefix with file count as the identifier
    const fileId = isFileArray && groupPrefix 
      ? `${groupPrefix} (${fileOrFiles.length})` 
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
        ? `${groupPrefix} (${fileOrFiles.length})`
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

      // Switch to the new file to show its logs
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
    
    // Try to get folder from any file (they should all be from the same folder)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check webkitRelativePath - return the full path without the filename
      if (file && file.fileObj && file.fileObj.webkitRelativePath) {
        const pathParts = file.fileObj.webkitRelativePath.split('/');
        // Return the full path excluding the filename (last part)
        if (pathParts.length > 1) {
          return pathParts.slice(0, -1).join('/');
        }
      }
      
      // Also try extracting from file.id if it contains path
      if (file && file.id && file.id.includes('/')) {
        const pathParts = file.id.split('/');
        if (pathParts.length > 1) {
          return pathParts.slice(0, -1).join('/');
        }
      }
      
      // Try to get path from fileObj.path (some browsers/contexts provide this)
      if (file && file.fileObj && file.fileObj.path) {
        const pathParts = file.fileObj.path.split('/');
        if (pathParts.length > 1) {
          return pathParts.slice(0, -1).join('/');
        }
      }
    }
    
    return null;
  }, [files]);

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

    // Lazy load: If logs for this file are not loaded, load them now
    const file = files[index];
    if (file) {
      if (!allFileLogs[file.id] && file.fileObj) {
        requestFileLoad(file.id, file.fileObj);
      }
      switchToFile(file.id);
    }
  }, [files, allFileLogs, requestFileLoad, switchToFile]);

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
    // Remove logs for all files
    files.forEach(file => {
      removeLogsForFile(file.id);
    });

    // Clear all state
    setFiles([]);
    setHasUserInteracted(false);
    setActiveFileIndex(0);
    setShowingCombinedView(false);
    setCombinedViewLoaded(false);
    setHeaderState(null);
    
    // Clear session storage
    clearSession();
  }, [files, removeLogsForFile, clearSession]);

  const handleCombinedViewSelect = useCallback(() => {
    setShowingCombinedView(true);

    // Lazy load combined view only if not already loaded
    if (!combinedViewLoaded && files.length > 0) {

      // Combine all files - get logs from allFileLogs
      const combinedLogs = files.flatMap(file => {
        const fileLogs = allFileLogs[file.id] || [];
        return fileLogs.map((log, index) => ({
          ...log,
          baseId: log.baseId || log.id, // Preserve baseId for sticky log matching
          id: `${file.id}-${log.id}`, // Ensure unique IDs
          sourceFile: file.name
        }));
      });

      // Sort by timestamp if available
      combinedLogs.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return a.timestamp.localeCompare(b.timestamp);
        }
        return 0;
      });

      setLogsForFile('Combined Files', combinedLogs);
      setCombinedViewLoaded(true);
    } else if (combinedViewLoaded) {
      // Switch to already loaded combined view
      switchToFile('Combined Files');
    }
  }, [files, allFileLogs, setLogsForFile, switchToFile, combinedViewLoaded]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsFileDropActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsFileDropActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsFileDropActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const textFiles = droppedFiles.filter(file =>
      file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.log')
    );

    // Sort files by name before loading
    const sortedTextFiles = textFiles.sort((a, b) => a.name.localeCompare(b.name));

    sortedTextFiles.forEach(file => handleFileLoad(file));
  }, [handleFileLoad]);

  // Chat panel resizing
  const handleMouseDown = useCallback((e) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      setChatPanelWidth(Math.max(300, Math.min(800, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Get current display context for AI
  const currentDisplayContext = useMemo(() => {
    if (showingCombinedView) {
      return {
        logs: allFileLogs['Combined Files'] || [],
        fileName: `Combined Files (${files.map(f => f.name).join(', ')})`
      };
    } else if (files[activeFileIndex]) {
      // Use the current logs from useLogsModel, which should be the active file's logs
      return {
        logs: logs || [],
        fileName: files[activeFileIndex].name
      };
    }
    return { logs: [], fileName: 'No File' };
  }, [files, activeFileIndex, showingCombinedView, allFileLogs, logs]);

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
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <p className="text-xl mb-2">Cato Client Log Viewer</p>
            <p>Drop log files here or click "Open Files" to get started</p>
            <p className="text-sm mt-2">Supports multiple files and AI-powered analysis</p>
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
      />
    );
  }, [hasUserInteracted, files.length, filteredLogs, handleLogClick, highlightedLogId, filters, pivotLog, setPivotTime, clearPivotTime, stickyLogs, addStickyLog, highlightLog, setSearchPos, setSearchTotal, updateFilters, setHoveredLog, visibleColumns, columnVersion]);

  // Remove old currentFileHeaders logic - now using headerState

  return (
    <div
      className={`h-screen flex flex-col bg-gray-50 dark:bg-gray-900 ${isFileDropActive ? 'bg-blue-50 dark:bg-blue-900' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <LogViewerHeader
        onClearTabs={handleClearTabs}
        onFileLoad={handleFileLoad}
        onToggleAIChat={() => {
          setShowAIChat(!showAIChat);
          if (showAIChat) {
            // If closing AI chat, also reset full-width mode
            setIsAIChatFullWidth(false);
          }
        }}
        showAIChat={showAIChat}
        hasLogs={files.length > 0}
        currentFileHeaders={headerState}
        currentLogs={currentDisplayContext.logs}
        currentFileName={currentDisplayContext.fileName}
        visibleColumns={visibleColumns}
        onColumnsChange={handleColumnsChange}
        logDuration={logDuration}
        folderName={currentFolderName}
      />

      {/* Main content area - Split panel container */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left panel - Contains tabs, filters, and log content */}
        {!isAIChatFullWidth && (
          <div
            className="overflow-hidden flex flex-col"
            style={{
              width: showAIChat ? `calc(100% - ${chatPanelWidth}px - 4px)` : '100%',
              transition: isResizing ? 'none' : 'width 0.2s ease'
            }}
          >
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
              />
            )}

            {/* Log viewing container with filters and content */}
            {hasUserInteracted && logs.length > 0 ? (
              <div className="flex-1 mt-2 mb-2 ml-2 mr-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col pb-0">
                <LogViewerFilters
                  filters={filters}
                  onFiltersChange={updateFilters}
                  logsCount={logs.length}
                  filteredLogsCount={filteredLogs.length}
                  searchMatchCount={searchMatchCount}
                  searchMatchPos={searchPos}
                  pivotGap={currentPivotGap}
                  pivotLineNumber={pivotLog?.lineNumber}
                  stickyLogs={stickyLogs}
                  onRemoveStickyLog={removeStickyLog}
                  onClearAllStickyLogs={clearAllStickyLogs}
                  onScrollToLog={scrollToLog}
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
        )}

        {/* AI Chat Panel - Right panel */}
        {showAIChat && (
          <>
            {/* Dynamic separator/resize handle - only show when not in full width mode */}
            {!isAIChatFullWidth && (
              <div
                className="w-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-col-resize flex-shrink-0"
                onMouseDown={handleMouseDown}
                style={{ cursor: isResizing ? 'col-resize' : 'col-resize' }}
              />
            )}
            {/* Right panel - AI Chat */}
            <div
              className="bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex-shrink-0 mr-2"
              style={{
                width: isAIChatFullWidth ? '100%' : chatPanelWidth,
                transition: isResizing ? 'none' : 'width 0.2s ease'
              }}
            >
              <AIChat
                logs={currentDisplayContext.logs}
                fileName={currentDisplayContext.fileName}
                isOpen={showAIChat}
                onClose={() => {
                  setShowAIChat(false);
                  setIsAIChatFullWidth(false);
                }}
                isFullWidth={isAIChatFullWidth}
                onToggleFullWidth={() => setIsAIChatFullWidth(!isAIChatFullWidth)}
              />
            </div>
          </>
        )}
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
