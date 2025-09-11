import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

// Extract tooltip text to avoid inline strings
const FILTER_TOOLTIP = `Advanced Filtering Guide:

• Multiple terms: Use '||' (OR logic): error || warning
• Exclude terms: Use '!' prefix: !heartbeat
• Exact phrases: Use quotes: "connection lost"

• Filter by row numbers:
  #415 :: — from row 415 onwards
  #415 :: #600 — rows 415 to 600
  :: #600 — from start to row 600

• Filter by dates (supports multiple formats):
  #2025-07-04 :: — from July 4th, 2025 onwards
  #2025-07-04 14:19:44 :: — from specific time onwards
  #2025-07-04 13:28:20.540 :: — with milliseconds
  #2025-07-04 :: #2025-07-05 — date range
  :: #2025-07-05 14:30:00 — until specific time

• Filter by time gaps:
  #gap=5 — show only records with 5+ second gaps from previous record

• Combine filters:
  error || #2025-07-04 :: #2025-07-05 — errors between dates
  !debug || #100 :: #500 — exclude debug in rows 100-500
  #gap=3 || error — records with 3+ second gaps OR containing 'error'

• Works with log level and context line filters`;

const LogViewerFilters = ({ filters, onFiltersChange, logsCount, filteredLogsCount, searchMatchCount, searchMatchPos, pivotGap }) => {
  const [isLevelDropdownOpen, setIsLevelDropdownOpen] = useState(false);
  const [isFilterHistoryOpen, setIsFilterHistoryOpen] = useState(false);
  const [filterHistory, setFilterHistory] = useState(() => {
    // Load filter history from localStorage
    const saved = localStorage.getItem('logViewer_filterHistory');
    return saved ? JSON.parse(saved) : [];
  });

  const dropdownRef = useRef(null);
  const portalRef = useRef(null);
  const filterInputRef = useRef(null);
  const filterHistoryRef = useRef(null);
  // For portal positioning
  const buttonRef = useRef(null);
  const filterChevronRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [filterDropdownPos, setFilterDropdownPos] = useState({ top: 0, left: 0 });

  const handleFilterChange = (key, value) => {
    onFiltersChange({ [key]: value });
  };

  // Save phrases to history when user finishes typing
  const handleFilterBlur = () => {
    const value = filters.searchText;
    if (value && value.trim()) {
      // Split by || and save each phrase individually
      const phrases = value.split('||').map(phrase => phrase.trim()).filter(phrase => phrase.length > 0);
      phrases.forEach(phrase => saveToFilterHistory(phrase));
    }
  };

  // Handle Enter key to also save phrases
  const handleFilterKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleFilterBlur();
    }
  };

  // Save filter phrase to history
  const saveToFilterHistory = (phrase) => {
    setFilterHistory(prevHistory => {
      // Remove if already exists
      const filtered = prevHistory.filter(item => item !== phrase);
      // Add to beginning
      const newHistory = [phrase, ...filtered].slice(0, 50); // Keep max 50 items

      // Save to localStorage
      localStorage.setItem('logViewer_filterHistory', JSON.stringify(newHistory));

      return newHistory;
    });
  };

  // Add phrase to current filter
  const addPhraseToFilter = (phrase) => {
    const currentFilter = filters.searchText || '';
    const newFilter = currentFilter ? `${currentFilter} || ${phrase}` : phrase;
    handleFilterChange('searchText', newFilter);
    setIsFilterHistoryOpen(false);
  };

  // Clear filter history
  const clearFilterHistory = () => {
    setFilterHistory([]);
    localStorage.removeItem('logViewer_filterHistory');
    setIsFilterHistoryOpen(false);
  };

  // Close dropdown when clicking outside (using click event to allow checkbox selection)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        (dropdownRef.current && dropdownRef.current.contains(event.target)) ||
        (buttonRef.current && buttonRef.current.contains(event.target))
      ) {
        return; // Click is inside the level dropdown, do nothing
      }

      if (
        (filterHistoryRef.current && filterHistoryRef.current.contains(event.target)) ||
        (filterChevronRef.current && filterChevronRef.current.contains(event.target))
      ) {
        return; // Click is inside the filter history dropdown, do nothing
      }

      // Close both dropdowns
      setIsLevelDropdownOpen(false);
      setIsFilterHistoryOpen(false);
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Compute filter dropdown position when opening
  useEffect(() => {
    if (isFilterHistoryOpen && filterChevronRef.current) {
      const rect = filterChevronRef.current.getBoundingClientRect();
      setFilterDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.right + window.scrollX - 300 // Align to right edge, adjust for dropdown width
      });
    }
  }, [isFilterHistoryOpen]);

  // Compute log level dropdown position when opening
  useEffect(() => {
    if (isLevelDropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
    }
  }, [isLevelDropdownOpen]);

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
          placeholder="Search in record logs. Add #gap=5 for time gap indicators..."
          value={filters.searchQuery || ''}
          onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
          className="w-full h-6 px-2 pr-28 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-xs placeholder:font-light"
          title="Search in logs. Add #gap=5 to show visual separators between records with 5+ second gaps. Combine with search terms: 'error #gap=3' shows errors with gap indicators."
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

  const renderFilterInput = () => {
    return (
      <div className="flex-1 min-w-64 flex flex-col items-start">
        <div className="flex items-center w-full">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mr-2">Filter:</label>
          <div className="relative w-full flex border border-gray-300 dark:border-gray-600 rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white dark:bg-gray-700">
            <input
              ref={filterInputRef}
              type="text"
              placeholder="Filter logs: text || terms, !exclude, #gap=5, #row::, #date:: ranges. Hover for full guide."
              value={filters.searchText}
              onChange={(e) => handleFilterChange('searchText', e.target.value)}
              onBlur={handleFilterBlur}
              onKeyDown={handleFilterKeyDown}
              className="w-full h-6 px-2 pr-16 border-none rounded-l-md focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-xs placeholder:font-light"
              title={FILTER_TOOLTIP}
            />
            {filters.searchText && (
              <button
                onClick={() => handleFilterChange('searchText', '')}
                className="absolute right-8 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 z-10"
              >
                ×
              </button>
            )}
            {filters.searchText && (
              <div className="absolute right-6 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600 z-10"></div>
            )}
            <button
              ref={filterChevronRef}
              onClick={() => setIsFilterHistoryOpen(!isFilterHistoryOpen)}
              className="px-2 h-6 border-none rounded-r-md bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
              title="Filter history"
            >
              <svg className={`w-3 h-3 transition-transform ${isFilterHistoryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filter History Dropdown */}
        {isFilterHistoryOpen && filterHistory.length > 0 && ReactDOM.createPortal(
          <div
            ref={filterHistoryRef}
            style={{
              position: 'absolute',
              top: filterDropdownPos.top,
              left: filterDropdownPos.left,
              zIndex: 9999,
              width: '300px'
            }}
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
          >
            <div className="py-1 max-h-80 overflow-y-auto">
              {/* History Items */}
              {filterHistory.slice(0, 10).map((phrase, index) => (
                <button
                  key={index}
                  onClick={() => addPhraseToFilter(phrase)}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                  title={`Add "${phrase}" to filter`}
                >
                  <div className="truncate">{phrase}</div>
                </button>
              ))}

              {/* Clear History Button */}
              <div className="border-t border-gray-200 dark:border-gray-600 mt-1">
                <button
                  onClick={clearFilterHistory}
                  className="w-full px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-center"
                >
                  Clear History
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  };

  const renderLogLevelFilter = () => {
    return (
      <div className="flex items-center gap-1" ref={dropdownRef}>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Level:</label>
        <button
          ref={buttonRef}
          onClick={() => setIsLevelDropdownOpen(o => !o)}
          className="flex items-center justify-between px-2 h-6 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs min-w-28"
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
        className="w-16 px-2 h-6 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
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
      className={`w-6 h-6 rounded-md transition-colors flex items-center justify-center ${!filters.searchText && !filters.searchQuery && filters.logLevel.includes('all') && !filters.contextLines
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
      {pivotGap && (
        <span className="text-gray-400 dark:text-gray-500 opacity-75">
          Pivot Log Line: {pivotGap}
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
