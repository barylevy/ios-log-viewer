import React, { useRef, useState } from 'react';
import FileSelectionModal from './FileSelectionModal';
import AboutModal from './AboutModal';

const LogViewerHeader = ({ onFileLoad, onToggleAIChat, showAIChat, hasLogs, currentFileHeaders, onClearTabs }) => {
  const fileInputRef = useRef(null);
  const directoryInputRef = useRef(null);
  const [showFileSelectionModal, setShowFileSelectionModal] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const handleChooseFiles = () => {
    fileInputRef.current?.click();
    setShowFileSelectionModal(false);
  };

  const handleChooseDirectory = () => {
    directoryInputRef.current?.click();
    setShowFileSelectionModal(false);
  };

  const handleFilesSelected = (event) => {
    console.debug('handleFilesSelected triggered');
    const files = Array.from(event.target.files);
    console.debug('Files selected:', files);

    // Load all files without filtering by name
    files.forEach(file => {
      console.debug('Loading file:', file.name);
      onFileLoad(file);
    });
    event.target.value = '';
  };

  const handleDirectorySelected = (event) => {
    console.debug('handleDirectorySelected triggered');
    const files = Array.from(event.target.files);
    console.debug('Directory files selected:', files);

    // Clear previous files when loading new directory
    if (onClearTabs) {
      onClearTabs();
    }

    // Load all files without filtering by name
    files.forEach(file => {
      console.debug('Loading file:', file.name);
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
      <div className="flex items-center justify-between flex-nowrap gap-4">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <img src="/cato-logo.svg" alt="Cato Networks" className="h-8 w-auto flex-shrink-0" />
          <div className="flex items-baseline space-x-3">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">Cato Client Log Viewer</h1>

            {/* User Details - Baseline aligned with title */}
            {currentFileHeaders && Object.keys(currentFileHeaders).length > 0 && (
              <div className="flex items-baseline gap-3 text-sm text-gray-600 dark:text-gray-400">
                {currentFileHeaders.user && (
                  <>
                    <span className="flex items-baseline gap-1">
                      <span className="text-gray-500 dark:text-gray-500">User:</span>
                      <span className="font-medium">{currentFileHeaders.user}</span>
                    </span>
                    {(currentFileHeaders.account || currentFileHeaders.clientVersion || currentFileHeaders.osVersion) && (
                      <span className="text-gray-400">•</span>
                    )}
                  </>
                )}
                {currentFileHeaders.account && (
                  <>
                    <span className="flex items-baseline gap-1">
                      <span className="text-gray-500 dark:text-gray-500">Account:</span>
                      <span className="font-medium">{currentFileHeaders.account}</span>
                    </span>
                    {(currentFileHeaders.clientVersion || currentFileHeaders.osVersion) && (
                      <span className="text-gray-400">•</span>
                    )}
                  </>
                )}
                {currentFileHeaders.clientVersion && (
                  <>
                    <span className="flex items-baseline gap-1">
                      <span className="text-gray-500 dark:text-gray-500">Client:</span>
                      <span className="font-medium">{currentFileHeaders.clientVersion}</span>
                    </span>
                    {currentFileHeaders.osVersion && (
                      <span className="text-gray-400">•</span>
                    )}
                  </>
                )}
                {currentFileHeaders.osVersion && (
                  <span className="flex items-baseline gap-1">
                    <span className="text-gray-500 dark:text-gray-500">OS:</span>
                    <span className="font-medium">{currentFileHeaders.osVersion}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          {/* About button */}
          <button
            onClick={() => setShowAbout(true)}
            className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-2 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600"
          >
            About
          </button>
        </div>

        <div className="flex items-center space-x-3 flex-shrink-0">
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

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.log"
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
      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </header>
  );
};

export default LogViewerHeader;
