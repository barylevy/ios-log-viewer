import React, { useRef, useState, useEffect, useCallback } from 'react';
import AboutModal from './AboutModal';
import ColumnSettings, { AVAILABLE_COLUMNS } from './ColumnSettings';
import SelectionFilesDialog from './SelectionFilesDialog';
import { CATO_COLORS } from './constants';
import { clearSession } from './utils/sessionStorage';
import { groupFilesByPrefix, groupFilesByDirectory, groupFilesByDirectoryAndFormat, getGroupDisplayName, naturalSort } from './utils/fileGrouping';
import { isArchiveFile, expandArchivesInList } from './utils/archiveExtractor';

// localStorage key for persisting which group names the user selected last time
const FOLDER_SELECTION_KEY = 'logViewer_folderGroupNames';

const LogViewerHeader = ({ onFileLoad, hasLogs, currentFileHeaders, onClearTabs, visibleColumns, onColumnsChange, onResetColumnDefaults, rightColumnOrder, onRightColumnOrderChange, logDuration, folderName, onPrepareFilesStart, onPrepareFilesEnd, onDownloadMerged, isDownloadingMerged, onClearFilters, isLiveMode = false, isLiveConnected = false, isLiveChecking = false, onLiveToggle }) => {
  const fileInputRef = useRef(null);
  const directoryInputRef = useRef(null);
  const [showFileDropdown, setShowFileDropdown] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  // State for the folder-file-selection dialog
  const [pendingFolderItems, setPendingFolderItems] = useState(null); // null | array of { id, name, fileObj }
  const [pendingFolderGroupMap, setPendingFolderGroupMap] = useState(null); // null | Map<id, File[]>
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
      if (showFileDropdown && !event.target.closest('.file-dropdown')) {
        setShowFileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown, showFileDropdown]);

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

  const handleFilesSelected = async (event) => {
    const picked = Array.from(event.target.files);
    event.target.value = '';
    if (!picked.length) return;

    onPrepareFilesStart && onPrepareFilesStart();
    try {
      const hasArchive = picked.some(isArchiveFile);

      let files;
      try {
        files = hasArchive ? await expandArchivesInList(picked) : picked;
      } catch (err) {
        alert(`Failed to extract archive: ${err.message || err}`);
        return;
      }

      // If the picked input contained an archive, treat it like a folder load:
      // clear current tabs and use the directory+format grouper so each
      // subdirectory becomes its own tab.
      if (hasArchive) {
        if (onClearTabs) onClearTabs();
        const fileGroups = await groupFilesByDirectoryAndFormat(files);
        fileGroups.forEach((groupFiles, groupKey) => {
          onFileLoad(groupFiles, false, groupKey);
        });
        return;
      }

      // Otherwise: standard "individual files" flow — group by name prefix.
      const sortedFiles = files.sort((a, b) => naturalSort(a.name, b.name));
      const fileGroups = groupFilesByPrefix(sortedFiles);
      fileGroups.forEach((groupFiles, prefix) => {
        onFileLoad(groupFiles, false, prefix);
      });
    } finally {
      onPrepareFilesEnd && onPrepareFilesEnd();
    }
  };

  const handleDirectorySelected = async (event) => {
    const allFiles = Array.from(event.target.files);
    event.target.value = '';

    // Filter out files that should not be loaded
    const EXCLUDED_FILES = [
      'systemextensionsctl_list.txt',
      'sudo_launchctl_list.txt',
      'digResults.txt',
      'networkServiceOrder.txt',
      'scutilDNS.txt',
      'scutilProxy.txt',
      'ifconfig.txt',
      'launchctl_list.txt'
    ];

    const files = allFiles.filter(file => !EXCLUDED_FILES.includes(file.name));
    if (!files.length) return;

    // Group files first, then show the selection dialog instead of loading everything
    onPrepareFilesStart && onPrepareFilesStart();
    let fileGroups;
    try {
      fileGroups = await groupFilesByDirectoryAndFormat(files);
    } finally {
      onPrepareFilesEnd && onPrepareFilesEnd();
    }

    if (!fileGroups.size) return;

    // Build dialog items from the grouped map
    const items = Array.from(fileGroups.entries()).map(([groupKey, groupFiles]) => ({
      id: groupKey,
      name: groupKey.split('/').pop().replace(/\s*\[.*?\]\s*$/, '').trim() || groupKey,
      fileObj: groupFiles,
    }));

    setPendingFolderGroupMap(fileGroups);
    setPendingFolderItems(items);
  };

  // Load saved folder group names from localStorage
  const getSavedGroupNames = () => {
    try {
      const saved = localStorage.getItem(FOLDER_SELECTION_KEY);
      return saved ? new Set(JSON.parse(saved)) : null;
    } catch { return null; }
  };

  // Called when user confirms the folder-file-selection dialog
  const handleFolderSelectionConfirm = useCallback((selectedIds) => {
    if (!pendingFolderGroupMap) return;

    // Persist chosen names (last segment of each selected groupKey, lowercase)
    const chosenNames = selectedIds.map(id => id.split('/').pop().replace(/\s*\[.*?\]\s*$/, '').trim().toLowerCase());
    try { localStorage.setItem(FOLDER_SELECTION_KEY, JSON.stringify(chosenNames)); } catch { /* ignore */ }

    // Clear previous tabs, then load only selected groups
    if (onClearTabs) onClearTabs();
    onPrepareFilesStart && onPrepareFilesStart();
    try {
      selectedIds.forEach(id => {
        const groupFiles = pendingFolderGroupMap.get(id);
        if (groupFiles) onFileLoad(groupFiles, false, id);
      });
    } finally {
      onPrepareFilesEnd && onPrepareFilesEnd();
    }

    setPendingFolderItems(null);
    setPendingFolderGroupMap(null);
  }, [pendingFolderGroupMap, onFileLoad, onClearTabs, onPrepareFilesStart, onPrepareFilesEnd]);

  const handleFolderSelectionClose = () => {
    setPendingFolderItems(null);
    setPendingFolderGroupMap(null);
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

  const handleColumnSettingsClick = () => {
    setShowColumnSettings(true);
    setShowDropdown(false);
  };

  const handleThemeToggle = () => {
    setIsDarkMode(!isDarkMode);
    setShowDropdown(false);
  };

  const handleClearCache = () => {
    // Clear all localStorage
    localStorage.clear();

    // Clear session storage (IndexedDB)
    clearSession();

    // Restore theme preference
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');

    setShowDropdown(false);

    // Show confirmation
    alert('Cache cleared successfully! The page will reload.');

    // Reload the page to reset all state
    window.location.reload();
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-600 p-2">
      {/* Folder-file selection dialog — shown after the user picks a directory */}
      {pendingFolderItems && (
        <SelectionFilesDialog
          isOpen={true}
          onClose={handleFolderSelectionClose}
          files={pendingFolderItems}
          onConfirm={handleFolderSelectionConfirm}
          title="Select Files to Load"
          description="Choose which log groups from this folder to open:"
          confirmLabel="Open"
          getDefaultChecked={(f) => {
            const savedNames = getSavedGroupNames();
            const nameLower = (f.name || '').toLowerCase();
            if (savedNames) return savedNames.has(nameLower);
            const DEFAULT_PREFIXES = ['applogs', 'appextensionlogs'];
            return DEFAULT_PREFIXES.some(p => nameLower === p || nameLower.startsWith(p));
          }}
        />
      )}
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
        {/* Online / Live button */}
        {onLiveToggle && (
          <button
            onClick={onLiveToggle}
            disabled={isLiveChecking}
            title={isLiveConnected ? 'Disconnect live logs' : 'Connect to live logs'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isLiveConnected
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : isLiveChecking
                  ? 'bg-blue-500 text-white cursor-wait'
                  : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            {isLiveChecking ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" className="opacity-75" />
                </svg>
                Connecting…
              </>
            ) : (
              <>
                <span className={`inline-block w-2 h-2 rounded-full ${isLiveConnected ? 'bg-white animate-pulse' : 'bg-gray-400 dark:bg-gray-500'}`} />
                {isLiveConnected ? 'Stop Live' : 'Live Logs'}
              </>
            )}
          </button>
        )}
        {onDownloadMerged && (
          <button
            onClick={onDownloadMerged}
            disabled={!hasLogs || isDownloadingMerged}
            title="Run mergeLogs.py on the loaded folder and download the merged output"
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isDownloadingMerged ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" className="opacity-75" />
                </svg>
                Merging…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                </svg>
                Download Merged
              </>
            )}
          </button>
        )}
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
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 z-50">
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
                  {onClearFilters && (
                    <button
                      onClick={() => { onClearFilters(); setShowDropdown(false); }}
                      className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear Filters
                    </button>
                  )}
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
        accept=".txt,.log,.ips,.zip,.xz,.txz"
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

      {/* Column Settings Modal */}
      <ColumnSettings
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        visibleColumns={visibleColumns}
        onColumnsChange={onColumnsChange}
        onResetDefaults={onResetColumnDefaults}
      />
    </header>
  );
};

export default LogViewerHeader;
