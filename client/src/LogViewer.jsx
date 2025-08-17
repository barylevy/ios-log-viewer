import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LogListView from './LogListView';
import LogModal from './LogModal';
import LogViewerHeader from './LogViewerHeader';
import LogViewerFilters from './LogViewerFilters';
import LogTabs from './LogTabs';
import AIChat from './AIChat';
import useLogsModel from './useLogsModel';

const LogViewer = () => {
  console.log('LogViewer component loading...');

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
  const [showCombined, setShowCombined] = useState(false);

  // AI Chat
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  const handleFileLoad = useCallback((file) => {
    // Only load .txt files with "log" in the name
    if (!file.name.toLowerCase().endsWith('.txt') || !file.name.toLowerCase().includes('log')) {
      return;
    }

    // Add file to files list if not already present
    setFiles(prev => {
      const existingIndex = prev.findIndex(f => f.name === file.name);
      if (existingIndex >= 0) {
        // File already exists, just switch to it
        setActiveFileIndex(existingIndex);
        switchToFile(file.name);
        return prev;
      } else {
        // New file, add it and set as active
        const newFiles = [...prev, { name: file.name }];
        setActiveFileIndex(newFiles.length - 1);
        return newFiles;
      }
    });

    // Load the file content and process it
    loadLogs(file);
    setHasUserInteracted(true);
  }, [loadLogs, switchToFile]);

  const handleFileSelect = useCallback((index) => {
    setActiveFileIndex(index);
    setShowCombined(false);

    // Switch to show logs for the selected file
    if (files[index]) {
      switchToFile(files[index].name);
    }
  }, [files, switchToFile]);

  const handleFileClose = useCallback((index) => {
    const fileToClose = files[index];
    
    setFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      if (newFiles.length === 0) {
        setHasUserInteracted(false);
        setActiveFileIndex(0);
        setShowCombined(false);
        return [];
      }

      if (activeFileIndex >= index && activeFileIndex > 0) {
        setActiveFileIndex(activeFileIndex - 1);
      } else if (activeFileIndex === index) {
        const newIndex = Math.min(activeFileIndex, newFiles.length - 1);
        setActiveFileIndex(newIndex);

        // Switch to the new active file
        if (newFiles[newIndex]) {
          switchToFile(newFiles[newIndex].name);
        }
      }

      return newFiles;
    });

    // Clean up stored logs for the closed file
    if (fileToClose) {
      // Use a workaround since setAllFileLogs isn't available directly
      // The cleanup will happen naturally when the component re-renders
    }
  }, [activeFileIndex, files, switchToFile]);

  const handleToggleCombined = useCallback(() => {
    console.log('🔄 handleToggleCombined called');
    console.log('Current state:', { showCombined, files, allFileLogs, activeFileIndex });
    
    setShowCombined(prev => {
      const newCombined = !prev;
      console.log('Setting combined to:', newCombined);

      if (newCombined && files.length > 0) {
        console.log('Combining files...');
        // Combine all files - get logs from allFileLogs
        const combinedLogs = files.flatMap(file => {
          const fileLogs = allFileLogs[file.name] || [];
          console.log(`File ${file.name} has ${fileLogs.length} logs`);
          return fileLogs;
        });
        console.log(`Total combined logs: ${combinedLogs.length}`);
        setLogsForFile('Combined Files', combinedLogs);
      } else if (files[activeFileIndex]) {
        console.log('Switching back to active file:', files[activeFileIndex].name);
        // Switch back to active file
        switchToFile(files[activeFileIndex].name);
      }

      return newCombined;
    });
  }, [files, activeFileIndex, allFileLogs, setLogsForFile, switchToFile]);

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

    textFiles.forEach(file => handleFileLoad(file));
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
    if (showCombined) {
      return {
        logs: files.flatMap(file => file.logs),
        fileName: `Combined Files (${files.map(f => f.name).join(', ')})`
      };
    } else if (files[activeFileIndex]) {
      return {
        logs: files[activeFileIndex].logs,
        fileName: files[activeFileIndex].name
      };
    }
    return { logs: [], fileName: 'No File' };
  }, [files, activeFileIndex, showCombined]);

  const memoizedContent = useMemo(() => {
    if (!hasUserInteracted) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <p className="text-xl mb-2">Cato Client Log Viewer</p>
            <p>Drop log files here or click "Choose Files" to get started</p>
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
      />
    );
  }, [hasUserInteracted, files.length, filteredLogs, setSelectedLog, highlightedLogId, filters]);

  // Get current file headers
  const currentFileHeaders = useMemo(() => {
    console.log('🔍 Calculating currentFileHeaders:');
    console.log('  files.length:', files.length);
    console.log('  activeFileIndex:', activeFileIndex);
    console.log('  showCombined:', showCombined);
    console.log('  logFileHeaders:', logFileHeaders);

    if (files.length === 0) {
      console.log('  → No files, returning null');
      return null;
    }

    if (showCombined) {
      console.log('  → Combined view, returning null');
      return null;
    }

    const currentFile = files[activeFileIndex];
    console.log('  currentFile:', currentFile);

    const headers = currentFile ? getCurrentFileHeaders(currentFile.name) : null;
    console.log('  → Final headers:', headers);

    return headers;
  }, [files, activeFileIndex, showCombined, getCurrentFileHeaders, logFileHeaders]);

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
      />

      {/* Log File Headers - Display above tabs */}
      {console.log('🔍 Header display check:', {
        currentFileHeaders,
        hasHeaders: !!currentFileHeaders,
        headerKeys: currentFileHeaders ? Object.keys(currentFileHeaders) : [],
        headerDetails: currentFileHeaders ? JSON.stringify(currentFileHeaders, null, 2) : 'null',
        filesLength: files.length,
        activeFileIndex,
        showCombined,
        shouldDisplay: currentFileHeaders && Object.keys(currentFileHeaders).length > 0
      })}
      {currentFileHeaders && Object.keys(currentFileHeaders).length > 0 && (
        <div className="mx-4 mb-2">
          {console.log('🎯 Displaying headers above tabs:', JSON.stringify(currentFileHeaders, null, 2))}
          <div className="flex items-center gap-6 text-sm text-gray-600">
            {currentFileHeaders.user && (
              <span className="flex items-center gap-1">
                <span className="text-gray-500">User:</span>
                <span className="font-medium">{currentFileHeaders.user}</span>
              </span>
            )}
            {currentFileHeaders.account && (
              <span className="flex items-center gap-1">
                <span className="text-gray-500">Account:</span>
                <span className="font-medium">{currentFileHeaders.account}</span>
              </span>
            )}
            {currentFileHeaders.clientVersion && (
              <span className="flex items-center gap-1">
                <span className="text-gray-500">Client:</span>
                <span className="font-medium">{currentFileHeaders.clientVersion}</span>
              </span>
            )}
            {currentFileHeaders.osVersion && (
              <span className="flex items-center gap-1">
                <span className="text-gray-500">OS:</span>
                <span className="font-medium">{currentFileHeaders.osVersion}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <LogTabs
          files={files}
          activeFileIndex={activeFileIndex}
          onFileSelect={handleFileSelect}
          onFileClose={handleFileClose}
          showCombined={showCombined}
          onToggleCombined={handleToggleCombined}
          allFileLogs={allFileLogs}
        />
      )}

      {hasUserInteracted && logs.length > 0 && (
        <LogViewerFilters
          filters={filters}
          onFiltersChange={updateFilters}
          logsCount={logs.length}
          filteredLogsCount={filteredLogs.length}
        />
      )}

      <div className="flex-1 overflow-hidden flex">
        {/* Main content */}
        <div
          className="flex-1 overflow-hidden"
          style={{
            marginRight: showAIChat ? chatPanelWidth : 0,
            transition: isResizing ? 'none' : 'margin-right 0.2s ease'
          }}
        >
          {memoizedContent}
        </div>

        {/* AI Chat Panel */}
        {showAIChat && (
          <>
            {/* Resize handle */}
            <div
              className="w-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-col-resize flex-shrink-0"
              onMouseDown={handleMouseDown}
              style={{ cursor: isResizing ? 'col-resize' : 'col-resize' }}
            />

            {/* Chat panel */}
            <div
              className="bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex-shrink-0"
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
