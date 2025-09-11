import React, { useRef, useState, useEffect } from 'react';
import FileSelectionModal from './FileSelectionModal';
import AboutModal from './AboutModal';
import AIConfigSettings from './Settings';
import { CATO_COLORS } from './constants';

const LogViewerHeader = ({ onFileLoad, onToggleAIChat, showAIChat, hasLogs, currentFileHeaders, onClearTabs }) => {
  const fileInputRef = useRef(null);
  const directoryInputRef = useRef(null);
  const [showFileSelectionModal, setShowFileSelectionModal] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('.relative')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Apply theme on mount and when theme changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

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

    // Sort files by name before loading
    const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name));

    // Load all files
    sortedFiles.forEach(file => {
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

    // Sort files by name before loading
    const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name));

    // Load all files
    sortedFiles.forEach(file => {
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

  const handleDropdownToggle = () => {
    setShowDropdown(!showDropdown);
  };

  const handleAboutClick = () => {
    setShowAbout(true);
    setShowDropdown(false);
  };

  const handleAIConfigClick = () => {
    setShowSettings(true);
    setShowDropdown(false);
  };

  const handleThemeToggle = () => {
    setIsDarkMode(!isDarkMode);
    setShowDropdown(false);
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-600 p-2">
      <div className="flex items-center justify-between flex-nowrap gap-4">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <img src="/cato-logo.svg" alt="Cato Networks" className="h-8 w-auto flex-shrink-0" />
          <div className="flex items-baseline space-x-3">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white whitespace-nowrap">Cato Client Log Viewer</h1>
            {/* User Details */}
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
        </div>

        <div className="flex items-center space-x-3 flex-shrink-0">
          <button
            onClick={handleLoadFilesClick}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            Open Files
          </button>

          {hasLogs && (
            <button
              onClick={onToggleAIChat}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${showAIChat
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'text-white hover:opacity-90'
                }`}
              style={{
                backgroundColor: showAIChat ? undefined : CATO_COLORS.PRIMARY
              }}
            >
              {showAIChat ? 'Hide AI Chat' : 'Show AI Chat'}
            </button>
          )}

          {/* Settings Dropdown */}
          <div className="relative">
            <button
              onClick={handleDropdownToggle}
              className="p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Settings menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 z-50">
                <div className="py-1">
                  <button
                    onClick={handleThemeToggle}
                    className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                  </button>
                  <button
                    onClick={handleAIConfigClick}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    AI Config
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
                  <button
                    onClick={handleAboutClick}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    About
                  </button>
                </div>
              </div>
            )}
          </div>
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

      {/* AI Config Settings Modal */}
      <AIConfigSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </header>
  );
};

export default LogViewerHeader;
