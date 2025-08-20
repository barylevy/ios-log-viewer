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
    setSelectedLog,
    updateFilters,
    highlightLog,
    clearHighlight,
    getCurrentFileHeaders,
    setLogsForFile,
    switchToFile
  } = useLogsModel();

  const [isFileDropActive, setIsFileDropActive] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Multi-file support
  const [files, setFiles] = useState([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [combinedViewLoaded, setCombinedViewLoaded] = useState(false);
  const [showingCombinedView, setShowingCombinedView] = useState(false);

  // AI Chat
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  const handleFileLoad = useCallback((file) => {
    // Only load .txt files with "log" in the name
    if (!file.name.toLowerCase().endsWith('.txt') || !file.name.toLowerCase().includes('log')) {
      return;
    }

    const fileId = getFileIdentifier(file);

    // Check if file already exists
    const existingIndex = files.findIndex(f => f.id === fileId);
    if (existingIndex >= 0) {
      // File already exists, just switch to it
      setActiveFileIndex(existingIndex);
      setShowingCombinedView(false);
      switchToFile(fileId);
      return;
    }

    // Load the file content first
    loadLogs(file);

    // Then add file to files list
    setFiles(prev => {
      const newFiles = [...prev, { name: file.name, id: fileId }];

      // If this is the first file being added, make it active
      // Otherwise, keep the current active file (usually the first one)
      if (prev.length === 0) {
        console.log('🎯 Setting first file as active:', file.name);
        setActiveFileIndex(0);
        setShowingCombinedView(false);

        // Use setTimeout to ensure loadLogs has completed
        setTimeout(() => {
          switchToFile(fileId);
        }, 0);
      } else {
        console.log('📄 Added additional file:', file.name, '(keeping focus on first file)');
      }

      return newFiles;
    });

    setHasUserInteracted(true);
  }, [files, loadLogs, switchToFile]);

  const handleFileSelect = useCallback((index) => {
    setActiveFileIndex(index);
    setShowingCombinedView(false);

    // Switch to show logs for the selected file
    if (files[index]) {
      switchToFile(files[index].id);
    }
  }, [files, switchToFile, activeFileIndex]);

  const handleFileClose = useCallback((index) => {
    const fileToClose = files[index];

    setFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      if (newFiles.length === 0) {
        setHasUserInteracted(false);
        setActiveFileIndex(0);
        setShowingCombinedView(false);
        setCombinedViewLoaded(false);
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
      console.log('🔄 Loading combined view for the first time...');

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
      file.name.toLowerCase().endsWith('.txt') && file.name.toLowerCase().includes('log')
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

    return (
      <LogListView
        logs={filteredLogs}
        onLogClick={setSelectedLog}
        highlightedLogId={highlightedLogId}
        filters={filters}
        onFiltersChange={updateFilters}
      />
    );
  }, [hasUserInteracted, files.length, filteredLogs, setSelectedLog, highlightedLogId, filters]);

  // Get current file headers
  const currentFileHeaders = useMemo(() => {
    if (files.length === 0) {
      return null;
    }

    if (showingCombinedView) {
      return null;
    }

    const currentFile = files[activeFileIndex];
    const headers = currentFile ? getCurrentFileHeaders(currentFile.name) : null;

    return headers;
  }, [files, activeFileIndex, showingCombinedView, getCurrentFileHeaders, logFileHeaders]);

  return (
    <div
      className={`h-screen flex flex-col bg-gray-50 dark:bg-gray-900 ${isFileDropActive ? 'bg-blue-50 dark:bg-blue-900' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <LogViewerHeader
        onFileLoad={handleFileLoad}
        onToggleAIChat={() => setShowAIChat(!showAIChat)}
        showAIChat={showAIChat}
        hasLogs={files.length > 0}
        currentFileHeaders={currentFileHeaders}
      />

      {files.length > 0 && (
        <LogTabs
          files={files}
          activeFileIndex={activeFileIndex}
          onFileSelect={handleFileSelect}
          onFileClose={handleFileClose}
          showingCombinedView={showingCombinedView}
          onCombinedViewSelect={handleCombinedViewSelect}
          allFileLogs={allFileLogs}
        />
      )}

      {/* Main content area - Panel container for left + right */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left panel - Log container with fixed structure */}
        <div 
          className="overflow-hidden"
          style={{
            width: showAIChat ? `calc(100% - ${chatPanelWidth}px)` : '100%',
            transition: isResizing ? 'none' : 'width 0.2s ease'
          }}
        >
          {/* Log viewing container with rounded border - only when logs are available */}
          {hasUserInteracted && logs.length > 0 ? (
            <div className="h-full mt-2 mb-2 ml-2 mr-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col pb-0">
              <LogViewerFilters
                filters={filters}
                onFiltersChange={updateFilters}
                logsCount={logs.length}
                filteredLogsCount={filteredLogs.length}
              />
              <div className="flex-1 overflow-hidden">
                {memoizedContent}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center ml-2 mr-2">
              {memoizedContent}
            </div>
          )}
        </div>

        {/* AI Chat Panel - Right panel */}
        {showAIChat && (
          <>
            {/* Dynamic separator/resize handle - wider for easier dragging */}
            <div
              className="w-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-col-resize flex-shrink-0"
              onMouseDown={handleMouseDown}
              style={{ cursor: isResizing ? 'col-resize' : 'col-resize' }}
            />

            {/* Right panel - AI Chat with margin from edge */}
            <div
              className="bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex-shrink-0 mr-2"
              style={{ width: chatPanelWidth }}
            >
              <AIChat
                logs={currentDisplayContext.logs}
                fileName={currentDisplayContext.fileName}
                isOpen={showAIChat}
                onClose={() => setShowAIChat(false)}
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
