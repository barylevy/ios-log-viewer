import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LogListView from './LogListView';
import LogModal from './LogModal';
import LogViewerHeader from './LogViewerHeader';
import LogViewerFilters from './LogViewerFilters';
import LogTabs from './LogTabs';
import AIChat from './AIChat';
import useLogsModel, { getFileIdentifier } from './useLogsModel';

const LogViewer = () => {
  const {
    logs,
    filteredLogs,
    selectedLog,
    filters,
    highlightedLogId,
    logFileHeaders,
    allFileLogs,
    loadLogs,
    requestFileLoad,
    isFileLoading,
    setSelectedLog,
    updateFilters,
    highlightLog,
    clearHighlight,
    getCurrentFileHeaders,
    setLogsForFile,
    switchToFile
  } = useLogsModel();

  const [isFileDropActive, setIsFileDropActive] = useState(false);
  // Track current search match position and total
  const [searchPos, setSearchPos] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [headerState, setHeaderState] = useState(null);

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

  // Clear existing tabs before loading a new folder
  const handleClearTabs = useCallback(() => {
    setFiles([]);
    setActiveFileIndex(0);
    setShowingCombinedView(false);
    setCombinedViewLoaded(false);
    setHasUserInteracted(false);
    setHeaderState(null); // Clear header details
  }, []);

  // AI Chat
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [isAIChatFullWidth, setIsAIChatFullWidth] = useState(false);

  const handleFileLoad = useCallback((file, clearTabsFirst = false) => {
    // Only load .txt files or .log files
    if (!file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.log')) {
      return;
    }
    const fileId = getFileIdentifier(file);
    // Optionally clear all tabs before loading (for new folder)
    if (clearTabsFirst) {
      handleClearTabs();
    }
    // Check if file already exists
    const existingIndex = files.findIndex(f => f.id === fileId);
    if (existingIndex >= 0) {
      setActiveFileIndex(existingIndex);
      setShowingCombinedView(false);
      switchToFile(fileId);
      return;
    }
    setFiles(prev => {
      const newFiles = [...prev, { name: file.name, id: fileId, fileObj: file }];
      if (prev.length === 0) {
        setActiveFileIndex(0);
        setShowingCombinedView(false);
        requestFileLoad(fileId, file);
        // Immediately switch to the first file to show its logs
        setTimeout(() => {
          switchToFile(fileId);
        }, 0);
      }
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

    setFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      if (newFiles.length === 0) {
        setHasUserInteracted(false);
        setActiveFileIndex(0);
        setShowingCombinedView(false);
        setCombinedViewLoaded(false);
        setHeaderState(null); // Clear header details when last tab is closed
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

    // Clean up stored logs for the closed file
    if (fileToClose) {
      // Use a workaround since setAllFileLogs isn't available directly
      // The cleanup will happen naturally when the component re-renders
    }
  }, [activeFileIndex, files, switchToFile, showingCombinedView]);

  const handleCombinedViewSelect = useCallback(() => {
    setShowingCombinedView(true);

    // Lazy load combined view only if not already loaded
    if (!combinedViewLoaded && files.length > 0) {

      // Combine all files - get logs from allFileLogs
      const combinedLogs = files.flatMap(file => {
        const fileLogs = allFileLogs[file.id] || [];
        return fileLogs.map((log, index) => ({
          ...log,
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

  const memoizedContent = useMemo(() => {
    if (!hasUserInteracted) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <p className="text-xl mb-2">Cato Client Log Viewer</p>
            <p>Drop log files here or click "Load Files" to get started</p>
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
        onLogClick={setSelectedLog}
        highlightedLogId={highlightedLogId}
        filters={filters}
        onFiltersChange={updateFilters}
        onSearchMatchUpdate={(pos, total) => {
          setSearchPos(pos);
          setSearchTotal(total);
        }}
      />
    );
  }, [hasUserInteracted, files.length, filteredLogs, setSelectedLog, highlightedLogId, filters]);

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
          onHighlight={highlightLog}
          onClearHighlight={clearHighlight}
        />
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
