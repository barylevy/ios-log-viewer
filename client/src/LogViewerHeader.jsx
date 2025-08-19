import React, { useRef, useState } from 'react';
import FileSelectionModal from './FileSelectionModal';

const LogViewerHeader = ({ onFileLoad, onToggleAIChat, showAIChat, hasLogs, currentFileHeaders }) => {
  const fileInputRef = useRef(null);
  const directoryInputRef = useRef(null);
  const [showFileSelectionModal, setShowFileSelectionModal] = useState(false);

  const handleChooseFiles = () => {
    console.log('Choose Files clicked');
    fileInputRef.current?.click();
    setShowFileSelectionModal(false);
  };

  const handleChooseDirectory = () => {
    console.log('Choose Directory clicked');
    directoryInputRef.current?.click();
    setShowFileSelectionModal(false);
  };

  const handleFilesSelected = (event) => {
    const files = Array.from(event.target.files);
    console.log('Files selected:', files);

    // Filter and sort files by name
    const logFiles = files.filter(file =>
      file.name.toLowerCase().endsWith('.txt') && file.name.toLowerCase().includes('log')
    ).sort((a, b) => a.name.localeCompare(b.name));

    logFiles.forEach(file => {
      onFileLoad(file);
    });
    event.target.value = '';
  };

  const handleDirectorySelected = (event) => {
    const files = Array.from(event.target.files);
    console.log('Directory selected:', files);
    const logFiles = files.filter(file =>
      file.name.toLowerCase().endsWith('.txt') && file.name.toLowerCase().includes('log')
    );

    // Sort files by name before loading
    const sortedLogFiles = logFiles.sort((a, b) => a.name.localeCompare(b.name));
    console.log('Sorted log files:', sortedLogFiles.map(f => f.name));

    sortedLogFiles.forEach(file => {
      onFileLoad(file);
    });
    event.target.value = '';
  };

  const handleLoadFilesClick = () => {
    setShowFileSelectionModal(true);
  };

  const handleCloseModal = () => {
    setShowFileSelectionModal(false);
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-600 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <img src="/cato-logo.svg" alt="Cato Networks" className="h-8 w-auto" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Cato Client Log Viewer</h1>
        </div>

        <div className="flex flex-col space-y-2">
          {/* Display parsed headers from log files */}
          {currentFileHeaders && Object.keys(currentFileHeaders).length > 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-300 text-right">
              {currentFileHeaders.user && (
                <div>User: {currentFileHeaders.user}</div>
              )}
              {currentFileHeaders.timestamp && (
                <div>Timestamp: {currentFileHeaders.timestamp}</div>
              )}
              {currentFileHeaders.device && (
                <div>Device: {currentFileHeaders.device}</div>
              )}
            </div>
          )}

          <div className="flex items-center space-x-3">
            <button
              onClick={handleLoadFilesClick}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Load Files
            </button>

            {hasLogs && (
              <button
                onClick={onToggleAIChat}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${showAIChat
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
              >
                {showAIChat ? 'Hide AI Chat' : 'Show AI Chat'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt"
        onChange={handleFilesSelected}
        style={{ display: 'none' }}
      />
      <input
        ref={directoryInputRef}
        type="file"
        webkitdirectory=""
        onChange={handleDirectorySelected}
        style={{ display: 'none' }}
      />

      <FileSelectionModal
        isOpen={showFileSelectionModal}
        onClose={handleCloseModal}
        onChooseFiles={handleChooseFiles}
        onChooseDirectory={handleChooseDirectory}
      />
    </header>
  );
};

export default LogViewerHeader;
