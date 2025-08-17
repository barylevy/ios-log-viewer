import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LogListView from './LogListView';
import LogModal from './LogModal';
import LogViewerHeader from './LogViewerHeader';
import LogViewerFilters from './LogViewerFilters';
import LogTabs from './LogTabs';
import AIChat from './AIChat';
import useLogsModel from './useLogsModel';

const LogViewer = () => {
  console.log('LogViewer component loaded!');

  const {
    logs,
    filteredLogs,
    selectedLog,
    filters,
    highlightedLogId,
    loadLogs,
    setSelectedLog,
    updateFilters,
    highlightLog,
    clearHighlight
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
    console.log(`handleFileLoad called with file: ${file.name}`);

    // Additional filter check - only load .txt files with "log" in the name
    if (!file.name.toLowerCase().endsWith('.txt') || !file.name.toLowerCase().includes('log')) {
      console.log(`Rejecting file: ${file.name} - doesn't meet criteria (.txt and contains 'log')`);
      return;
    }

    console.log(`Accepting file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const lines = content.split('\n').filter(line => line.trim());

      const newFile = {
        name: file.name,
        logs: lines.map((line, index) => ({
          id: `${file.name}-${index}`,
          raw: line,
          message: line,
          sourceFile: file.name
        }))
      };

      setFiles(prev => {
        const existingIndex = prev.findIndex(f => f.name === file.name);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newFile;
          return updated;
        } else {
          const newFiles = [...prev, newFile];
          setActiveFileIndex(newFiles.length - 1);
          return newFiles;
        }
      });

      // Load into the main logs system for filtering
      loadLogs(file);
      setHasUserInteracted(true);
    };
    reader.readAsText(file);
  }, [loadLogs]);

  const handleFileSelect = useCallback((index) => {
    setActiveFileIndex(index);
    setShowCombined(false);

    // Update main logs with selected file
    if (files[index]) {
      const fileContent = files[index].logs.map(log => log.raw).join('\n');
      const blob = new Blob([fileContent], { type: 'text/plain' });
      const file = new File([blob], files[index].name, { type: 'text/plain' });
      loadLogs(file);
    }
  }, [files, loadLogs]);

  const handleFileClose = useCallback((index) => {
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

        // Load the new active file
        if (newFiles[newIndex]) {
          const fileContent = newFiles[newIndex].logs.map(log => log.raw).join('\n');
          const blob = new Blob([fileContent], { type: 'text/plain' });
          const file = new File([blob], newFiles[newIndex].name, { type: 'text/plain' });
          loadLogs(file);
        }
      }

      return newFiles;
    });
  }, [activeFileIndex, loadLogs]);

  const handleToggleCombined = useCallback(() => {
    setShowCombined(prev => {
      const newCombined = !prev;

      if (newCombined && files.length > 0) {
        // Combine all files
        const combinedLogs = files.flatMap(file => file.logs);
        const combinedContent = combinedLogs.map(log => log.raw).join('\n');
        const blob = new Blob([combinedContent], { type: 'text/plain' });
        const file = new File([blob], 'Combined Files', { type: 'text/plain' });
        loadLogs(file);
      } else if (files[activeFileIndex]) {
        // Switch back to active file
        const fileContent = files[activeFileIndex].logs.map(log => log.raw).join('\n');
        const blob = new Blob([fileContent], { type: 'text/plain' });
        const file = new File([blob], files[activeFileIndex].name, { type: 'text/plain' });
        loadLogs(file);
      }

      return newCombined;
    });
  }, [files, activeFileIndex, loadLogs]);

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
    console.log(`Drag & Drop: checking ${droppedFiles.length} files`);
    const textFiles = droppedFiles.filter(file => {
      const isValid = file.name.toLowerCase().endsWith('.txt') && file.name.toLowerCase().includes('log');
      console.log(`Dropped file: ${file.name}, valid: ${isValid}`);
      return isValid;
    });

    console.log(`Loading ${textFiles.length} valid dropped files`);
    textFiles.forEach(file => {
      console.log(`Loading dropped file: ${file.name}`);
      handleFileLoad(file);
    });
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
            <p className="text-xl mb-2">iOS Log Viewer</p>
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

      {files.length > 0 && (
        <LogTabs
          files={files}
          activeFileIndex={activeFileIndex}
          onFileSelect={handleFileSelect}
          onFileClose={handleFileClose}
          showCombined={showCombined}
          onToggleCombined={handleToggleCombined}
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
