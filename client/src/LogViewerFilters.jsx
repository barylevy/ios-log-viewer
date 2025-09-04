import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

const LogViewerFilters = ({ filters, onFiltersChange, logsCount, filteredLogsCount, searchMatchCount, searchMatchPos }) => {
  const [isLevelDropdownOpen, setIsLevelDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const portalRef = useRef(null);
  const filterInputRef = useRef(null);
  // For portal positioning
  const buttonRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const handleFilterChange = (key, value) => {
    onFiltersChange({ [key]: value });
  };

  // Close dropdown when clicking outside (using click event to allow checkbox selection)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        (dropdownRef.current && dropdownRef.current.contains(event.target)) ||
        (portalRef.current && portalRef.current.contains(event.target))
      ) {
        return;
      }
      setIsLevelDropdownOpen(false);
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [dropdownRef, portalRef]);

  // Handle Cmd+F to focus filter input
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check for Cmd+F (Mac)
      if (event.metaKey && event.key === 'f') {
        event.preventDefault();
        if (filterInputRef.current) {
          filterInputRef.current.focus();
          filterInputRef.current.select();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleLogLevelToggle = (level) => {
    const currentLevels = filters.logLevel;

    if (level === 'all') {
      // If 'all' is clicked, toggle between all levels and just 'all'
      if (currentLevels.includes('all')) {
        onFiltersChange({ logLevel: ['error', 'warning', 'info', 'debug', 'trace', 'activity'] });
      } else {
        onFiltersChange({ logLevel: ['all'] });
      }
    } else {
      // Remove 'all' if it exists and we're selecting specific levels
      let newLevels = currentLevels.filter(l => l !== 'all');

      if (newLevels.includes(level)) {
        // Remove the level
        newLevels = newLevels.filter(l => l !== level);
        // If no levels selected, default to 'all'
        if (newLevels.length === 0) {
          newLevels = ['all'];
        }
      } else {
        // Add the level
        newLevels.push(level);
      }

      onFiltersChange({ logLevel: newLevels });
    }
  };

  // Get display text for selected levels
  const getSelectedLevelsText = () => {
    if (filters.logLevel.includes('all')) {
      return 'All Levels';
    }
    if (filters.logLevel.length === 1) {
      return filters.logLevel[0].charAt(0).toUpperCase() + filters.logLevel[0].slice(1);
    }
    if (filters.logLevel.length <= 2) {
      return filters.logLevel.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ');
    }
    return `${filters.logLevel.length} levels selected`;
  };

  // Extracted UI sections as render functions
  const renderSearchNavigationInput = () => (
    <div className="flex-1 min-w-64 flex items-center">
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mr-2">Search:</label>
      <div className="relative w-full">
        <input
          type="text"
          placeholder="Search in logs..."
          value={filters.searchQuery || ''}
          onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
          className="w-full h-8 px-2 pr-28 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-xs placeholder:font-light"
        />
        {filters.searchQuery && (
          <button
            onClick={() => handleFilterChange('searchQuery', '')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ×
          </button>
        )}
        {filters.searchQuery && (
          <div className="absolute right-10 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
            <button
              onClick={() => window.dispatchEvent(new Event('prevSearchMatch'))}
              title="Previous match"
              className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500">{searchMatchPos}/{searchMatchCount}</span>
            <button
              onClick={() => window.dispatchEvent(new Event('nextSearchMatch'))}
              title="Next match"
              className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderFilterInput = () => (
    <div className="flex-1 min-w-64 flex flex-col items-start">
      <div className="flex items-center w-full">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mr-2">Filter:</label>
        <div className="relative w-full">
          <input
            ref={filterInputRef}
            type="text"
            placeholder="Search logs: text || terms, !exclude, #row::, #date:: ranges. Hover for full guide."
            value={filters.searchText}
            onChange={(e) => handleFilterChange('searchText', e.target.value)}
            className="w-full h-8 px-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-xs placeholder:font-light"
            title={
              `Advanced Filtering Guide:\n
• Multiple terms: Use '||' (OR logic): error || warning\n
• Exclude terms: Use '!' prefix: !heartbeat\n
• Exact phrases: Use quotes: "connection lost"\n
\n
• Filter by row numbers:\n
  #415 :: — from row 415 onwards\n
  #415 :: #600 — rows 415 to 600\n
  :: #600 — from start to row 600\n
\n
• Filter by dates (supports multiple formats):\n
  #2025-07-04 :: — from July 4th, 2025 onwards\n
  #2025-07-04 14:19:44 :: — from specific time onwards\n
  #2025-07-04 13:28:20.540 :: — with milliseconds\n
  #2025-07-04 :: #2025-07-05 — date range\n
  :: #2025-07-05 14:30:00 — until specific time\n
\n
• Combine filters:\n
  error || #2025-07-04 :: #2025-07-05 — errors between dates\n
  !debug || #100 :: #500 — exclude debug in rows 100-500\n
\n
• Works with log level and context line filters`
            }
          />
          {filters.searchText && (
            <button
              onClick={() => handleFilterChange('searchText', '')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderLogLevelFilter = () => {
    // Compute dropdown position when opening
    useEffect(() => {
      if (isLevelDropdownOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
      }
    }, [isLevelDropdownOpen]);

    return (
      <div className="flex items-center gap-1" ref={dropdownRef}>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Level:</label>
        <button
          ref={buttonRef}
          onClick={() => setIsLevelDropdownOpen(o => !o)}
          className="flex items-center justify-between px-2 h-8 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs min-w-28"
        >
          <span>{getSelectedLevelsText()}</span>
          <svg className={`w-3 h-3 ml-1 transition-transform ${isLevelDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isLevelDropdownOpen && ReactDOM.createPortal(
          <div
            ref={portalRef}
            style={{ position: 'absolute', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
          >
            <div className="py-1">
              {[
                { value: 'all', label: 'All Levels', color: 'text-gray-700 dark:text-gray-300' },
                { value: 'error', label: 'Error', color: 'text-red-600 dark:text-red-400' },
                { value: 'warning', label: 'Warning', color: 'text-yellow-600 dark:text-yellow-400' },
                { value: 'info', label: 'Info', color: 'text-blue-600 dark:text-blue-400' },
                { value: 'debug', label: 'Debug', color: 'text-green-600 dark:text-green-400' },
                { value: 'trace', label: 'Trace', color: 'text-purple-600 dark:text-purple-400' },
                { value: 'activity', label: 'Activity', color: 'text-indigo-600 dark:text-indigo-400' },
              ].map(({ value, label, color }) => (
                <label
                  key={value}
                  className="flex items-center px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={filters.logLevel.includes(value)}
                    onChange={() => handleLogLevelToggle(value)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 mr-2"
                  />
                  <span className={`text-sm ${color}`}>{label}</span>
                </label>
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  };



  const renderContextLines = () => (
    <div className="flex items-center gap-1">
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Context:</label>
      <input
        type="number"
        min="0"
        max="50"
        value={filters.contextLines || 0}
        onChange={(e) => handleFilterChange('contextLines', parseInt(e.target.value) || 0)}
        className="w-16 px-2 h-8 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
        placeholder="0"
      />
      <span className="text-xs text-gray-500 dark:text-gray-400">lines</span>
    </div>
  );

  const renderClearFiltersButton = () => (
    <button
      onClick={() => onFiltersChange({ searchText: '', searchQuery: '', logLevel: ['all'], contextLines: 0 })}
      disabled={!filters.searchText && !filters.searchQuery && filters.logLevel.includes('all') && !filters.contextLines}
      title="Clear all filters - Reset search text, search query, log level to 'All', and context lines to 0"
      className={`w-8 h-8 rounded-md transition-colors flex items-center justify-center ${!filters.searchText && !filters.searchQuery && filters.logLevel.includes('all') && !filters.contextLines
        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
        : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );

  const renderStats = () => (
    <div className="text-[10px] text-gray-600 dark:text-gray-400 flex items-center gap-4">
      <span>
        Showing {filteredLogsCount.toLocaleString()} of {logsCount.toLocaleString()} logs
        {filteredLogsCount !== logsCount && (
          <span className="ml-2 text-blue-600 dark:text-blue-400">
            ({((filteredLogsCount / logsCount) * 100).toFixed(1)}% visible)
          </span>
        )}
      </span>
      {filters.searchText && filters.searchText.includes('||') && (
        <span className="text-gray-400 dark:text-gray-500 opacity-75">
          Filtering for: {filters.searchText.split('||').map(t => t.trim()).filter(t => t).length} terms
        </span>
      )}
    </div>
  );

  return (
    <div className="overflow-visible bg-white/50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 px-2 py-2">
      {/* 2x2 Grid Layout */}
      <div className="relative z-10 overflow-visible">
        <div className="grid grid-cols-[1fr,auto] gap-4">
          {/* Left side - takes remaining space */}
          <div className="space-y-2">
            {/* Filter Input */}
            {renderFilterInput()}
            {/* Search Navigation Input */}
            {renderSearchNavigationInput()}
          </div>

          {/* Right side - auto width, aligned to right */}
          <div className="flex items-center gap-4">
            <div className="space-y-2 flex flex-col items-end">
              {/* Log Level Filter */}
              {renderLogLevelFilter()}
              {/* Context Lines */}
              {renderContextLines()}
            </div>
            {/* Clear Filters Button */}
            {renderClearFiltersButton()}
          </div>
        </div>

        {/* Bottom row with stats only */}
        <div className="flex items-center mt-2">
          {renderStats()}
        </div>
      </div>
    </div>
  );
};

export default LogViewerFilters;
