import React, { useRef, useState, useEffect } from 'react';
import AboutModal from './AboutModal';
import AIConfigSettings from './Settings';
import ColumnSettings, { AVAILABLE_COLUMNS } from './ColumnSettings';
import { CATO_COLORS } from './constants';
import { openAIChatInNewWindow, openAIChatInNewTab } from './utils/aiChatUtils';
import { clearSession } from './utils/sessionStorage';
import { groupFilesByPrefix, getGroupDisplayName } from './utils/fileGrouping';

const LogViewerHeader = ({ onFileLoad, onToggleAIChat, showAIChat, hasLogs, currentFileHeaders, onClearTabs, currentLogs, currentFileName, visibleColumns, onColumnsChange, logDuration, folderName }) => {
  const fileInputRef = useRef(null);
  const directoryInputRef = useRef(null);
  const [showFileDropdown, setShowFileDropdown] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showAIChatDropdown, setShowAIChatDropdown] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('.settings-dropdown')) {
        setShowDropdown(false);
      }
      if (showAIChatDropdown && !event.target.closest('.ai-chat-dropdown')) {
        setShowAIChatDropdown(false);
      }
      if (showFileDropdown && !event.target.closest('.file-dropdown')) {
        setShowFileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown, showAIChatDropdown, showFileDropdown]);

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
    setShowFileDropdown(false);
  };

  const handleChooseDirectory = () => {
    directoryInputRef.current?.click();
    setShowFileDropdown(false);
  };

  const handleFilesSelected = (event) => {
    const files = Array.from(event.target.files);

    // Sort files by name before grouping
    const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name));

    // Group files by prefix (same as directory loading)
    const fileGroups = groupFilesByPrefix(sortedFiles);

    // Load files - grouped or individual
    fileGroups.forEach((groupFiles, prefix) => {
      if (groupFiles.length === 1) {
        // Single file in group - load normally
        onFileLoad(groupFiles[0]);
      } else {
        // Multiple files in group - load as merged group
        onFileLoad(groupFiles, false, prefix);
      }
    });
    
    event.target.value = '';
  };

  const handleDirectorySelected = (event) => {
    const files = Array.from(event.target.files);

    // Clear previous files when loading new directory
    if (onClearTabs) {
      onClearTabs();
    }

    // Group files by prefix for Windows logs
    const fileGroups = groupFilesByPrefix(files);

    // If all files are in a single group (no grouping needed), load normally
    if (fileGroups.size === 1 && fileGroups.values().next().value.length === files.length) {
      // Sort files by name before loading
      const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name));
      
      // Load all files
      sortedFiles.forEach(file => {
        onFileLoad(file);
      });
    } else {
      // Multiple groups detected - load as grouped files
      fileGroups.forEach((groupFiles, prefix) => {
        if (groupFiles.length === 1) {
          // Single file in group - load normally
          onFileLoad(groupFiles[0]);
        } else {
          // Multiple files in group - load as merged group
          onFileLoad(groupFiles, false, prefix);
        }
      });
    }
    
    event.target.value = '';
  };

  const handleLoadFilesClick = () => {
    // Default action: open file picker
    handleChooseFiles();
  };

  const handleFileDropdownToggle = () => {
    setShowFileDropdown(!showFileDropdown);
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

  const handleColumnSettingsClick = () => {
    setShowColumnSettings(true);
    setShowDropdown(false);
  };

  const handleThemeToggle = () => {
    setIsDarkMode(!isDarkMode);
    setShowDropdown(false);
  };

  const handleClearCache = () => {
    // Get API key before clearing (to preserve it)
    const apiKey = localStorage.getItem('openai_api_key');
    
    // Clear all localStorage
    localStorage.clear();
    
    // Clear session storage (IndexedDB)
    clearSession();
    
    // Restore API key if it existed
    if (apiKey) {
      localStorage.setItem('openai_api_key', apiKey);
    }
    
    // Restore theme preference
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    setShowDropdown(false);
    
    // Show confirmation
    alert('Cache cleared successfully! The page will reload.');
    
    // Reload the page to reset all state
    window.location.reload();
  };

  const handleOpenAIChatNewWindow = () => {
    if (currentLogs && currentFileName) {
      openAIChatInNewWindow(currentLogs, currentFileName);
    }
    setShowAIChatDropdown(false);
  };

  const handleOpenAIChatNewTab = () => {
    if (currentLogs && currentFileName) {
      openAIChatInNewTab(currentLogs, currentFileName);
    }
    setShowAIChatDropdown(false);
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-600 p-2">
      <div className="flex items-center justify-between flex-nowrap gap-4">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <img src="/cato-logo.svg" alt="Cato Networks" className="h-8 w-auto flex-shrink-0" />
          <div className="flex flex-col gap-1">
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
            {/* Log Time Range and Folder Name */}
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 ml-1">
              {logDuration && (
                <span className="font-medium">{logDuration}</span>
              )}
              {folderName && logDuration && <span className="text-gray-400">•</span>}
              {folderName && (
                <span className="flex items-baseline gap-1">
                  <span className="text-gray-500 dark:text-gray-500">Folder:</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">{folderName}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
        <div className="relative file-dropdown">
            <div className="flex">
              {/* Main Button */}
              <button
                onClick={handleLoadFilesClick}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-l-md text-sm font-medium transition-colors"
              >
                Open Files
              </button>
              
              {/* Dropdown Arrow Button */}
              <button
                onClick={handleFileDropdownToggle}
                className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-2 rounded-r-md text-sm font-medium transition-colors border-l border-blue-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            
            {/* Dropdown Menu */}
            {showFileDropdown && (
              <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 z-50">
                <div className="py-1">
                  <button
                    onClick={handleChooseFiles}
                    className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Choose Files
                  </button>
                  <button
                    onClick={handleChooseDirectory}
                    className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    Choose Folder
                  </button>
                </div>
              </div>
            )}
          </div>

          {hasLogs && (
            <div className="relative ai-chat-dropdown">
              <div className="flex">
                {/* Main AI Chat Button */}
                <button
                  onClick={onToggleAIChat}
                  className={`px-4 py-2 rounded-l-md text-sm font-medium transition-colors ${showAIChat
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                >
                  {showAIChat ? 'Hide AI Chat' : 'Show AI Chat'}
                </button>

                {/* Dropdown Arrow Button */}
                <button
                  onClick={() => setShowAIChatDropdown(!showAIChatDropdown)}
                  className={`px-2 py-2 rounded-r-md text-sm font-medium transition-colors border-l border-opacity-20 ${showAIChat
                    ? 'bg-red-600 hover:bg-red-700 text-white border-white'
                    : 'bg-green-600 hover:bg-green-700 text-white border-white'
                    }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Dropdown Menu */}
              {showAIChatDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 z-50">
                  <div className="py-1">
                    <button
                      onClick={onToggleAIChat}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {showAIChat ? 'Hide Side Panel' : 'Show Side Panel'}
                    </button>
                    <button
                      onClick={handleOpenAIChatNewTab}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Open in New Tab
                    </button>
                    <button
                      onClick={handleOpenAIChatNewWindow}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Open in New Window
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings Dropdown */}
          <div className="relative settings-dropdown">
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
                    onClick={handleColumnSettingsClick}
                    className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                    Column Settings
                  </button>
                  <button
                    onClick={handleClearCache}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Clear Cache
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

      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />

      {/* AI Config Settings Modal */}
      <AIConfigSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Column Settings Modal */}
      <ColumnSettings
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        visibleColumns={visibleColumns}
        onColumnsChange={onColumnsChange}
      />
    </header>
  );
};

export default LogViewerHeader;
