import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { getLevelBackgroundColor } from './utils/logLevelColors';

// Extract tooltip text to avoid inline strings
const FILTER_TOOLTIP = `Advanced Filtering Guide:

• OR logic: Use '||': error || warning
• AND logic: Use '&&': bary && moshe
• Combine both: (bary && moshe) || david
• Grouping: Use parentheses to control precedence
• Exclude terms: Use '!' prefix: !heartbeat
• Exact phrases: Use quotes: "connection lost"
• Regex mode: Switch dropdown to 'Regex' for pattern matching: \\berror\\b || warn.*

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

const LogViewerFilters = ({ filters, onFiltersChange, moduleOptions = [], logsCount, filteredLogsCount, searchMatchCount, searchMatchPos, pivotGap, pivotLineNumber, stickyLogs, onRemoveStickyLog, onClearAllStickyLogs, onScrollToLog, onUpdateStickyLogTitle, activeFileIndex = 0 }) => {
  const [isLevelDropdownOpen, setIsLevelDropdownOpen] = useState(false);
  const [isFilterHistoryOpen, setIsFilterHistoryOpen] = useState(false);
  const [isSearchHistoryOpen, setIsSearchHistoryOpen] = useState(false);
  const [editingStickyId, setEditingStickyId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef(null);
  const [filterHistory, setFilterHistory] = useState(() => {
    // Load filter history from localStorage
    const saved = localStorage.getItem('logViewer_filterHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [searchHistory, setSearchHistory] = useState(() => {
    // Load search history from localStorage
    const saved = localStorage.getItem('logViewer_searchHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [filterMode, setFilterMode] = useState(() => {
    // Load filter mode from localStorage
    const saved = localStorage.getItem('logViewer_filterMode');
    return saved || 'text';
  });
  const [searchMode, setSearchMode] = useState(() => {
    // Load search mode from localStorage
    const saved = localStorage.getItem('logViewer_searchMode');
    return saved || 'text';
  });
  const [filterCaseSensitive, setFilterCaseSensitive] = useState(() => {
    return localStorage.getItem('logViewer_filterCaseSensitive') === 'true';
  });
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(() => {
    return localStorage.getItem('logViewer_searchCaseSensitive') === 'true';
  });

  // === Saved filters ===
  const SAVED_FILTERS_KEY = 'logViewer_savedFilters';
  const [savedFilters, setSavedFilters] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) || '[]'); } catch { return []; }
  });
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [saveInputName, setSaveInputName] = useState('');
  const [perTabPreset, setPerTabPreset] = useState({}); // { [tabIndex]: filterName | null }
  const activeFilterName = perTabPreset[activeFileIndex] ?? null;
  const setActiveFilterName = (name) => setPerTabPreset(prev => ({ ...prev, [activeFileIndex]: name ?? null }));
  const [fileFilters, setFileFilters] = useState([]); // array of presets from the open .json file
  const saveInputRef = useRef(null);
  const fileHandleRef = useRef(null);
  const loadFileInputRef = useRef(null);

  const dropdownRef = useRef(null);
  const portalRef = useRef(null);
  const filterInputRef = useRef(null);
  const filterHistoryRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchHistoryRef = useRef(null);
  // For portal positioning
  const buttonRef = useRef(null);
  const filterChevronRef = useRef(null);
  const searchChevronRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [filterDropdownPos, setFilterDropdownPos] = useState({ top: 0, left: 0 });
  const [searchDropdownPos, setSearchDropdownPos] = useState({ top: 0, left: 0 });

  // Save filter mode to localStorage and propagate to parent
  useEffect(() => {
    localStorage.setItem('logViewer_filterMode', filterMode);
    onFiltersChange({ filterMode });
  }, [filterMode]);

  // Save search mode to localStorage and propagate to parent
  useEffect(() => {
    localStorage.setItem('logViewer_searchMode', searchMode);
    onFiltersChange({ searchMode });
  }, [searchMode]);

  // Save case-sensitive flags to localStorage and propagate to parent
  useEffect(() => {
    localStorage.setItem('logViewer_filterCaseSensitive', filterCaseSensitive);
    onFiltersChange({ filterCaseSensitive });
  }, [filterCaseSensitive]);

  useEffect(() => {
    localStorage.setItem('logViewer_searchCaseSensitive', searchCaseSensitive);
    onFiltersChange({ searchCaseSensitive });
  }, [searchCaseSensitive]);

  const handleFilterChange = (key, value) => {
    onFiltersChange({ [key]: value });
  };

  // Save phrases to history when user finishes typing
  const handleFilterBlur = () => {
    const value = filters.searchText;
    if (value && value.trim()) {
      // Split by || and save each phrase individually
      const phrases = value.split(/\|\||&&/).map(phrase => phrase.trim().replace(/^\(|\)$/g, '')).filter(phrase => phrase.length > 0);
      phrases.forEach(phrase => saveToFilterHistory(phrase));
    }
  };

  // Handle Enter key to also save phrases
  const handleFilterKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleFilterBlur();
    }
  };

  // Save search phrases to history when user finishes typing
  const handleSearchBlur = () => {
    const value = filters.searchQuery;
    if (value && value.trim()) {
      // Split by || and && and save each phrase individually
      const phrases = value.split(/\|\||&&/).map(phrase => phrase.trim().replace(/^\(|\)$/g, '')).filter(phrase => phrase.length > 0);
      phrases.forEach(phrase => saveToSearchHistory(phrase));
    }
  };

  // Handle Enter key to also save search phrases
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearchBlur();
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

  // Save search phrase to history
  const saveToSearchHistory = (phrase) => {
    setSearchHistory(prevHistory => {
      // Remove if already exists
      const filtered = prevHistory.filter(item => item !== phrase);
      // Add to beginning
      const newHistory = [phrase, ...filtered].slice(0, 50); // Keep max 50 items

      // Save to localStorage
      localStorage.setItem('logViewer_searchHistory', JSON.stringify(newHistory));

      return newHistory;
    });
  };

  // Add phrase to current search
  const addPhraseToSearch = (phrase) => {
    const currentSearch = filters.searchQuery || '';
    const newSearch = currentSearch ? `${currentSearch} || ${phrase}` : phrase;
    handleFilterChange('searchQuery', newSearch);
    setIsSearchHistoryOpen(false);
  };

  // Clear search history
  const clearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('logViewer_searchHistory');
    setIsSearchHistoryOpen(false);
  };

  // Close dropdown when clicking outside (using click event to allow checkbox selection)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        (portalRef.current && portalRef.current.contains(event.target)) ||
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

      if (
        (searchHistoryRef.current && searchHistoryRef.current.contains(event.target)) ||
        (searchChevronRef.current && searchChevronRef.current.contains(event.target))
      ) {
        return; // Click is inside the search history dropdown, do nothing
      }

      // Close all dropdowns
      setIsLevelDropdownOpen(false);
      setIsFilterHistoryOpen(false);
      setIsSearchHistoryOpen(false);
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

  // Compute search dropdown position when opening
  useEffect(() => {
    if (isSearchHistoryOpen && searchChevronRef.current) {
      const rect = searchChevronRef.current.getBoundingClientRect();
      setSearchDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.right + window.scrollX - 300 // Align to right edge, adjust for dropdown width
      });
    }
  }, [isSearchHistoryOpen]);

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

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingStickyId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingStickyId]);

  // Handle double-click to start editing sticky title
  const handleStickyDoubleClick = (sticky) => {
    setEditingStickyId(sticky.id);
    setEditingTitle(sticky.title || `#${sticky.lineNumber}`);
  };

  // Save edited title
  const handleSaveStickyTitle = () => {
    if (editingStickyId !== null && onUpdateStickyLogTitle) {
      onUpdateStickyLogTitle(editingStickyId, editingTitle.trim() || `#${editingStickyId}`);
    }
    setEditingStickyId(null);
    setEditingTitle('');
  };

  // Cancel editing
  const handleCancelStickyEdit = () => {
    setEditingStickyId(null);
    setEditingTitle('');
  };

  // Handle key down in edit input
  const handleStickyEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveStickyTitle();
    } else if (e.key === 'Escape') {
      handleCancelStickyEdit();
    }
  };

  const handleLogLevelToggle = (level) => {
    const currentLevels = filters.logLevel;

    if (level === 'all') {
      // If 'all' is clicked, toggle between all levels and just 'all'
      if (currentLevels.includes('all')) {
        onFiltersChange({ logLevel: ['error', 'warning', 'info', 'debug', 'verbose'] });
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
      <div className="relative w-full flex border border-gray-300 dark:border-gray-600 rounded-md focus-within:ring-2 focus-within:ring-green-500 focus-within:border-green-500 bg-white dark:bg-gray-700">
        {/* Search Mode Dropdown */}
        <select
          value={searchMode}
          onChange={(e) => setSearchMode(e.target.value)}
          className="h-6 px-1 border-none bg-transparent text-gray-700 dark:text-gray-300 text-xs focus:outline-none cursor-pointer"
          title="Switch between text and regex search"
        >
          <option value="text">Text</option>
          <option value="regex">Regex</option>
        </select>
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search in record logs. Add #gap=5 for time gap indicators..."
          value={filters.searchQuery || ''}
          onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
          onBlur={handleSearchBlur}
          onKeyDown={handleSearchKeyDown}
          className="flex-1 min-w-0 h-6 px-2 border-none focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-xs placeholder:font-light"
          title="Search in logs. Add #gap=5 to show visual separators between records with 5+ second gaps. Combine with search terms: 'error #gap=3' shows errors with gap indicators."
        />
        {/* Right-side controls: prev/next match, Aa case-toggle, clear, history chevron */}
        <div className="flex items-center flex-shrink-0">
          {filters.searchQuery && (
            <>
              <button
                onClick={() => window.dispatchEvent(new Event('prevSearchMatch'))}
                title="Previous match"
                className="h-6 px-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 border-none focus:outline-none bg-transparent"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs text-gray-400 dark:text-gray-500 px-0.5">{searchMatchPos}/{searchMatchCount}</span>
              <button
                onClick={() => window.dispatchEvent(new Event('nextSearchMatch'))}
                title="Next match"
                className="h-6 px-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 border-none focus:outline-none bg-transparent"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
            </>
          )}
          <button
            onClick={() => setSearchCaseSensitive(v => !v)}
            title={searchCaseSensitive ? 'Case sensitive — click to make case insensitive' : 'Case insensitive — click to make case sensitive'}
            className={`h-6 px-1.5 text-xs font-bold border-none focus:outline-none rounded-sm ${
              searchCaseSensitive
                ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent'
            }`}
          >
            Aa
          </button>
          {filters.searchQuery && (
            <>
              <div className="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
              <button
                onClick={() => handleFilterChange('searchQuery', '')}
                className="h-6 px-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-none focus:outline-none bg-transparent"
              >
                ×
              </button>
            </>
          )}
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
          <button
            ref={searchChevronRef}
            onClick={() => setIsSearchHistoryOpen(!isSearchHistoryOpen)}
            className="w-8 h-6 border-none rounded-r-md bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none flex items-center justify-center"
            title="Search history"
          >
            <svg className={`w-3 h-3 transition-transform ${isSearchHistoryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search History Dropdown */}
      {isSearchHistoryOpen && searchHistory.length > 0 && ReactDOM.createPortal(
        <div
          ref={searchHistoryRef}
          style={{
            position: 'absolute',
            top: searchDropdownPos.top,
            left: searchDropdownPos.left,
            zIndex: 9999,
            width: '300px'
          }}
          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
        >
          <div className="py-1 max-h-80 overflow-y-auto">
            {/* History Items */}
            {searchHistory.slice(0, 10).map((phrase, index) => (
              <button
                key={index}
                onClick={() => addPhraseToSearch(phrase)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                title={`Add "${phrase}" to search`}
              >
                <div className="truncate">{phrase}</div>
              </button>
            ))}

            {/* Clear History Button */}
            <div className="border-t border-gray-200 dark:border-gray-600 mt-1">
              <button
                onClick={clearSearchHistory}
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

  const renderFilterInput = () => {
    return (
      <div className="flex-1 min-w-64 flex flex-col items-start">
        <div className="flex items-center w-full">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mr-2">Filter:</label>
          <div className="relative w-full flex border border-gray-300 dark:border-gray-600 rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white dark:bg-gray-700">
            {/* Filter Mode Dropdown */}
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="h-6 px-1 border-none bg-transparent text-gray-700 dark:text-gray-300 text-xs focus:outline-none cursor-pointer"
              title="Switch between text and regex search"
            >
              <option value="text">Text</option>
              <option value="regex">Regex</option>
            </select>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
            <input
              ref={filterInputRef}
              type="text"
              placeholder="Filter logs: text || terms, !exclude, #gap=5, #row::, #date:: ranges. Hover for full guide."
              value={filters.searchText}
              onChange={(e) => handleFilterChange('searchText', e.target.value)}
              onBlur={handleFilterBlur}
              onKeyDown={handleFilterKeyDown}
              className="flex-1 min-w-0 h-6 px-2 border-none focus:outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-xs placeholder:font-light"
              title={FILTER_TOOLTIP}
            />
            {/* Right-side controls: Aa case-toggle, clear, history chevron */}
            <div className="flex items-center flex-shrink-0">
              <button
                onClick={() => setFilterCaseSensitive(v => !v)}
                title={filterCaseSensitive ? 'Case sensitive — click to make case insensitive' : 'Case insensitive — click to make case sensitive'}
                className={`h-6 px-1.5 text-xs font-bold border-none focus:outline-none rounded-sm ${
                  filterCaseSensitive
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent'
                }`}
              >
                Aa
              </button>
              {filters.searchText && (
                <>
                  <div className="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
                  <button
                    onClick={() => handleFilterChange('searchText', '')}
                    className="h-6 px-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-none focus:outline-none bg-transparent"
                  >
                    ×
                  </button>
                </>
              )}
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
              <button
                ref={filterChevronRef}
                onClick={() => setIsFilterHistoryOpen(!isFilterHistoryOpen)}
                className="w-8 h-6 border-none rounded-r-md bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none flex items-center justify-center"
                title="Filter history"
              >
                <svg className={`w-3 h-3 transition-transform ${isFilterHistoryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
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
                { value: 'verbose', label: 'Verbose', color: 'text-purple-600 dark:text-purple-400' },

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

  const renderModuleFilter = () => (
    <div className="flex items-center gap-1">
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Module:</label>
      <select
        value={filters.selectedModule || 'all'}
        onChange={(e) => handleFilterChange('selectedModule', e.target.value)}
        className="px-2 h-6 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs w-28 max-w-28 truncate"
        title={filters.selectedModule && filters.selectedModule !== 'all' ? `Module: ${filters.selectedModule}` : 'Filter logs by module'}
      >
        <option value="all">All Modules</option>
        {moduleOptions.map(moduleName => (
          <option key={moduleName} value={moduleName}>{moduleName}</option>
        ))}
      </select>
    </div>
  );

  // === Saved filter helpers ===
  const persistSavedFilters = (list) => {
    try { localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(list)); } catch {}
  };

  const getFilterSnapshot = () => ({
    searchText: filters.searchText || '',
    logLevel: filters.logLevel || ['all'],
    contextLines: filters.contextLines || 0,
    selectedModule: filters.selectedModule || 'all',
    filterMode,
    searchMode,
    filterCaseSensitive,
    searchCaseSensitive,
  });

  const saveFilterWithName = (name) => {
    const entry = {
      id: Date.now().toString(),
      name,
      timestamp: new Date().toISOString(),
      data: getFilterSnapshot(),
    };
    const updated = [entry, ...savedFilters.filter(f => f.name !== name)];
    setSavedFilters(updated);
    persistSavedFilters(updated);
    setActiveFilterName(name);
  };

  const applyFilterData = (filterData, name, handle) => {
    onFiltersChange(filterData);
    if (filterData.filterMode !== undefined) setFilterMode(filterData.filterMode);
    if (filterData.searchMode !== undefined) setSearchMode(filterData.searchMode);
    if (filterData.filterCaseSensitive !== undefined) setFilterCaseSensitive(filterData.filterCaseSensitive);
    if (filterData.searchCaseSensitive !== undefined) setSearchCaseSensitive(filterData.searchCaseSensitive);
    fileHandleRef.current = handle;
    setActiveFilterName(name);
  };

  const buildFileJson = (filtersArray) => JSON.stringify(
    { version: 2, filters: filtersArray },
    null, 2
  );

  const writeFiltersArray = async (handle, filtersArray) => {
    const writable = await handle.createWritable();
    await writable.write(buildFileJson(filtersArray));
    await writable.close();
  };

  const downloadFiltersArray = (filtersArray) => {
    const blob = new Blob([buildFileJson(filtersArray)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'filters.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseFileToArray = (parsed, fallbackName) => {
    // v2: { version: 2, filters: [...] }
    if (Array.isArray(parsed.filters)) return parsed.filters;
    // v1: single filter { name, filters: {...} } or bare filter object
    const data = parsed.filters && typeof parsed.filters === 'object' && !Array.isArray(parsed.filters)
      ? parsed.filters : parsed;
    return [{ id: Date.now().toString(), name: parsed.name || fallbackName || 'Imported', savedAt: parsed.savedAt || new Date().toISOString(), data }];
  };

  // Save — update active entry in the array and write file
  const handleSave = async () => {
    if (!activeFilterName) return;
    const updatedEntry = {
      id: fileFilters.find(f => f.name === activeFilterName)?.id || Date.now().toString(),
      name: activeFilterName,
      savedAt: new Date().toISOString(),
      data: getFilterSnapshot(),
    };
    const newArray = fileFilters.some(f => f.name === activeFilterName)
      ? fileFilters.map(f => f.name === activeFilterName ? updatedEntry : f)
      : [...fileFilters, updatedEntry];
    setFileFilters(newArray);
    if (fileHandleRef.current) {
      try { await writeFiltersArray(fileHandleRef.current, newArray); return; } catch {}
    }
    saveFilterWithName(activeFilterName);
  };

  // Save As — always shows name dialog; adds entry to existing file (or creates new)
  const handleSaveAs = () => {
    setSaveInputName('');
    setIsSaveDialogOpen(true);
  };

  // Load — file picker; reads array from file
  const handleLoad = async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Filter JSON', accept: { 'application/json': ['.json'] } }],
        });
        const file = await handle.getFile();
        const parsed = JSON.parse(await file.text());
        const arr = parseFileToArray(parsed, handle.name.replace(/\.json$/i, ''));
        fileHandleRef.current = handle;
        setFileFilters(arr);
        if (arr.length > 0) applyFilterData(arr[0].data, arr[0].name, handle);
      } catch (e) { if (e.name !== 'AbortError') console.error(e); }
    } else {
      setIsLoadDialogOpen(true);
    }
  };

  const handleLoadFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const arr = parseFileToArray(parsed, file.name.replace(/\.json$/i, ''));
      fileHandleRef.current = null;
      setFileFilters(arr);
      if (arr.length > 0) applyFilterData(arr[0].data, arr[0].name, null);
    } catch {}
    e.target.value = '';
  };

  // Dialog OK — add new entry to array; write to open file or open save picker
  const handleSaveCurrentFilter = async () => {
    const name = saveInputName.trim();
    if (!name) return;
    const newEntry = {
      id: fileFilters.find(f => f.name === name)?.id || Date.now().toString(),
      name,
      savedAt: new Date().toISOString(),
      data: getFilterSnapshot(),
    };
    const newArray = fileFilters.some(f => f.name === name)
      ? fileFilters.map(f => f.name === name ? newEntry : f)
      : [...fileFilters, newEntry];
    setFileFilters(newArray);
    setActiveFilterName(name);
    saveFilterWithName(name);
    if (fileHandleRef.current) {
      try { await writeFiltersArray(fileHandleRef.current, newArray); }
      catch { downloadFiltersArray(newArray); }
    } else if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'filters.json',
          types: [{ description: 'Filter JSON', accept: { 'application/json': ['.json'] } }],
        });
        await writeFiltersArray(handle, newArray);
        fileHandleRef.current = handle;
      } catch (e) { if (e.name !== 'AbortError') downloadFiltersArray(newArray); }
    } else {
      downloadFiltersArray(newArray);
    }
    setSaveInputName('');
    setIsSaveDialogOpen(false);
  };

  const handleApplySavedFilter = (entry) => {
    applyFilterData(entry.data, entry.name, null);
    setIsLoadDialogOpen(false);
  };

  const handleDeleteSavedFilter = (id, e) => {
    e.stopPropagation();
    const updated = savedFilters.filter(f => f.id !== id);
    setSavedFilters(updated);
    persistSavedFilters(updated);
  };

  const formatSavedDate = (iso) => {
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const renderPresetRow = () => {
    const canSave = !!(fileHandleRef.current || activeFilterName);
    const tipCls = 'pointer-events-none absolute top-full right-0 mt-1.5 px-2 py-1 text-[10px] leading-none text-white bg-gray-800 dark:bg-gray-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-[60]';
    return (
      <div className="flex items-center mb-1.5">
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/70 dark:bg-gray-800/70 px-1 py-0.5">
        {/* Filter name dropdown — shows all entries in the open file */}
        {fileFilters.length > 0 ? (
          <select
            value={activeFilterName || ''}
            onChange={e => {
              const val = e.target.value;
              if (!val) {
                onFiltersChange({ searchText: '', searchQuery: '', logLevel: ['all'], selectedModule: 'all', contextLines: 0 });
                setActiveFilterName(null);
                return;
              }
              const entry = fileFilters.find(f => f.name === val);
              if (entry) applyFilterData(entry.data, entry.name, fileHandleRef.current);
            }}
            className="text-[10px] h-5 max-w-[120px] rounded bg-transparent text-blue-600 dark:text-blue-400 font-medium px-1 leading-none cursor-pointer focus:outline-none"
          >
            <option value="">— None —</option>
            {fileFilters.map(f => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-[10px] max-w-[110px] truncate leading-none mr-0.5 text-gray-400 dark:text-gray-500 italic">
            unsaved
          </span>
        )}
        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`relative group w-6 h-6 rounded-md transition-colors flex items-center justify-center ${
            canSave
              ? 'text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          <span className={tipCls}>{canSave ? `Save "${activeFilterName}"` : 'No filter loaded'}</span>
        </button>
        {/* Save As */}
        <button
          onClick={handleSaveAs}
          className="relative group w-6 h-6 rounded-md transition-colors flex items-center justify-center text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className={tipCls}>{fileFilters.length > 0 ? 'Add to file…' : 'Save As…'}</span>
        </button>
        {/* Load */}
        <button
          onClick={handleLoad}
          className="relative group w-6 h-6 rounded-md transition-colors flex items-center justify-center text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span className={tipCls}>Load file</span>
        </button>
        {/* Clear */}
        <button
          onClick={() => {
            onFiltersChange({ searchText: '', searchQuery: '', logLevel: ['all'], selectedModule: 'all', contextLines: 0 });
            fileHandleRef.current = null;
            setActiveFilterName(null);
            setFileFilters([]);
          }}
          className="relative group w-6 h-6 rounded-md transition-colors flex items-center justify-center text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className={tipCls}>Clear filters</span>
        </button>
        </div>
      </div>
    );
  };

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
      {filters.searchText && (filters.searchText.includes('||') || filters.searchText.includes('&&')) && (
        <span className="text-gray-400 dark:text-gray-500 opacity-75">
          Filtering for: {filters.searchText.split('||').flatMap(p => { let s = p.trim(); if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1,-1).trim(); return s.split('&&'); }).map(t => t.trim()).filter(t => t && !t.startsWith('!')).length} terms
        </span>
      )}
      {/* Pivot Gap Display */}
      {pivotGap && (
        <span className="text-gray-400 dark:text-gray-500 opacity-75">
          Pivot Log Line: #{pivotLineNumber} - {pivotGap}
        </span>
      )}

      {/* Sticky Logs Zone */}
      {stickyLogs && stickyLogs.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-gray-500 opacity-75">
            Sticky:
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {stickyLogs
              .slice() // Create a copy to avoid mutating the original array
              .sort((a, b) => {
                // Sort by timestamp, then by line number as fallback
                if (a.timestamp && b.timestamp) {
                  return new Date(a.timestamp) - new Date(b.timestamp);
                }
                // If timestamps are missing, sort by line number
                return a.lineNumber - b.lineNumber;
              })
              .map(sticky => (
                <div
                  key={sticky.id}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${getLevelBackgroundColor(sticky.level)}`}
                >
                  {/* Scroll to log button - editable on double-click */}
                  {editingStickyId === sticky.id ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={handleSaveStickyTitle}
                      onKeyDown={handleStickyEditKeyDown}
                      className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-1 py-0 text-xs w-24"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      onClick={() => onScrollToLog(sticky.lineNumber, sticky.sourceFile)}
                      onDoubleClick={() => handleStickyDoubleClick(sticky)}
                      className="hover:opacity-75"
                      title={sticky.sourceFile ? `[${sticky.sourceFile}] Line ${sticky.lineNumber}${sticky.title ? ` - ${sticky.title}` : ''}\nDouble-click to edit title` : `Line ${sticky.lineNumber}${sticky.title ? ` - ${sticky.title}` : ''}\nDouble-click to edit title`}
                    >
                      {sticky.title || `#${sticky.lineNumber}`}
                    </button>
                  )}
                  {/* Remove sticky log button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveStickyLog(sticky.id);
                    }}
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title={`Remove sticky log${sticky.sourceFile ? ` from ${sticky.sourceFile}` : ''}`}
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            {/* Clear All Sticky Logs Button */}
            <button
              onClick={onClearAllStickyLogs}
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors border border-gray-300 dark:border-gray-600"
              title="Clear all sticky logs"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
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
          <div className="flex flex-col items-end">
            {/* Preset name + Save / Save As / Load / Clear */}
            {renderPresetRow()}
            <div className="space-y-2 flex flex-col items-end">
              {/* Log Level Filter */}
              {renderLogLevelFilter()}
              {/* Module Filter */}
              {renderModuleFilter()}
            </div>
          </div>
        </div>

        {/* Bottom row: stats on the left, context lines pinned to the right under Module */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex-1 min-w-0">
            {renderStats()}
          </div>
          {renderContextLines()}
        </div>
      </div>

      {/* Hidden file input — fallback for browsers without File System Access API */}
      <input ref={loadFileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoadFileChange} />

      {/* Save As Fallback Dialog — shown when showSaveFilePicker is unavailable */}
      {isSaveDialogOpen && (() => {
        const isOverwrite = saveInputName.trim() && savedFilters.some(f => f.name === saveInputName.trim());
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setIsSaveDialogOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-4 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Add Filter to File</h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">{fileFilters.length > 0 ? 'Enter a name for this filter. It will be added to the open file.' : 'Enter a name. You\'ll be asked where to save the file.'}</p>
            <input
              ref={saveInputRef}
              autoFocus
              type="text"
              value={saveInputName}
              onChange={e => setSaveInputName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveCurrentFilter(); if (e.key === 'Escape') setIsSaveDialogOpen(false); }}
              placeholder="Filter preset name…"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isOverwrite && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">This will overwrite the existing "{saveInputName.trim()}" preset.</p>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setIsSaveDialogOpen(false)} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">Cancel</button>
              <button onClick={handleSaveCurrentFilter} disabled={!saveInputName.trim()} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{isOverwrite ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Load Filters Dialog */}
      {isLoadDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setIsLoadDialogOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 w-96 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-600">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Load Filters</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setIsLoadDialogOpen(false); loadFileInputRef.current?.click(); }}
                  className="px-2 py-1 text-[10px] rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  title="Load from a .json file"
                >
                  Browse file…
                </button>
                <button onClick={() => setIsLoadDialogOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 py-1">
              {savedFilters.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-gray-400 dark:text-gray-500">No saved filters yet</p>
              ) : savedFilters.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => handleApplySavedFilter(entry)}
                  className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{entry.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{formatSavedDate(entry.timestamp)}</p>
                    {entry.data.searchText && (
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 truncate mt-0.5 font-mono">"{entry.data.searchText}"</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDeleteSavedFilter(entry.id, e)}
                    title="Delete this saved filter"
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex-shrink-0 mt-0.5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogViewerFilters;
