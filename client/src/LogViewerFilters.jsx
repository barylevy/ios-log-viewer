import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

const LogViewerFilters = ({ filters, onFiltersChange, logsCount, filteredLogsCount, searchMatchCount, searchMatchPos }) => {
  const [isLevelDropdownOpen, setIsLevelDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const portalRef = useRef(null);
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

  const handleLogLevelToggle = (level) => {
    const currentLevels = filters.logLevel;

    if (level === 'all') {
      // If 'all' is clicked, toggle between all levels and just 'all'
      if (currentLevels.includes('all')) {
        onFiltersChange({ logLevel: ['error', 'warning', 'info', 'debug', 'trace', 'activity', 'default'] });
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
      <label className="text-xs font-medium text-gray-400 dark:text-gray-500 mr-2">Search:</label>
      <div className="relative w-full">
        <input
          type="text"
          placeholder="Search in logs..."
          value={filters.searchQuery || ''}
          onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
          className="w-full h-10 px-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-xs placeholder:font-light"
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
    <div className="flex-1 min-w-64 flex items-center">
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mr-2">Filter:</label>
      <div className="relative w-full">
        <input
          type="text"
          placeholder="Filter logs... (use || to separate multiple terms)"
          value={filters.searchText}
          onChange={(e) => handleFilterChange('searchText', e.target.value)}
          className="w-full h-10 px-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-xs placeholder:font-light"
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
      {filters.searchText && filters.searchText.includes('||') && (
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 opacity-75">
          Filtering for: {filters.searchText.split('||').map(t => t.trim()).filter(t => t).length} terms
        </div>
      )}
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
          className="flex items-center justify-between px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs min-w-28"
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
                { value: 'default', label: 'Default', color: 'text-gray-500 dark:text-gray-400' }
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

  const renderTimeRangeFilter = () => (
    <div className={`flex items-center gap-2 min-w-fit rounded-md ${(filters.startTime || filters.endTime) ? 'px-3 bg-gray-100 dark:bg-gray-600' : ''}`}>
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Date:</label>
      <select
        onChange={(e) => {
          const value = e.target.value;
          if (value === 'custom') {
            // If no dates are set yet, set default range (today)
            if (!filters.startTime && !filters.endTime) {
              const today = new Date().toISOString().split('T')[0];
              handleFilterChange('startTime', `${today}T00:00`);
              handleFilterChange('endTime', `${today}T23:59`);
            }
            // If dates already exist, keep them as is
            return;
          } else if (value === 'today') {
            const today = new Date().toISOString().split('T')[0];
            handleFilterChange('startTime', `${today}T00:00`);
            handleFilterChange('endTime', `${today}T23:59`);
          } else if (value === 'yesterday') {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            handleFilterChange('startTime', `${yesterdayStr}T00:00`);
            handleFilterChange('endTime', `${yesterdayStr}T23:59`);
          } else if (value === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const today = new Date();
            handleFilterChange('startTime', weekAgo.toISOString().slice(0, 16));
            handleFilterChange('endTime', today.toISOString().slice(0, 16));
          }
        }}
        value={filters.startTime || filters.endTime ? 'custom' : ''}
        className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
      >
        <option value="">All time</option>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="week">Last 7 days</option>
        <option value="custom">Custom range...</option>
      </select>

      {/* Show custom inputs only when custom range is selected or dates are set */}
      {(filters.startTime || filters.endTime) && (
        <>
          <input
            type="datetime-local"
            value={filters.startTime}
            onChange={(e) => handleFilterChange('startTime', e.target.value)}
            className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
            placeholder="From"
          />
          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
          <input
            type="datetime-local"
            value={filters.endTime}
            onChange={(e) => handleFilterChange('endTime', e.target.value)}
            className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
            placeholder="To"
          />
          <button
            onClick={() => {
              handleFilterChange('startTime', '');
              handleFilterChange('endTime', '');
            }}
            className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
            title="Clear dates"
          >
            ×
          </button>
        </>
      )}
    </div>
  );

  const renderContextLines = () => (
    <div className="flex items-center gap-1">
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Context:</label>
      <input
        type="number"
        min="0"
        max="50"
        value={filters.contextLines || 0}
        onChange={(e) => handleFilterChange('contextLines', parseInt(e.target.value) || 0)}
        className="w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
        placeholder="0"
      />
      <span className="text-xs text-gray-500 dark:text-gray-400">lines</span>
    </div>
  );

  const renderClearFiltersButton = () => (
    <button
      onClick={() => onFiltersChange({ searchText: '', logLevel: ['all'], startTime: '', endTime: '', contextLines: 0 })}
      disabled={!filters.searchText && filters.logLevel.includes('all') && !filters.startTime && !filters.endTime && !filters.contextLines}
      className={`px-2 py-1.5 rounded-md transition-colors text-xs ${!filters.searchText && filters.logLevel.includes('all') && !filters.startTime && !filters.endTime && !filters.contextLines
        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
        : 'bg-gray-500 text-white hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500'
        }`}
    >
      Clear Filters
    </button>
  );

  const renderStats = () => (
    <div className="mt-1 text-[10px] text-gray-600 dark:text-gray-400">
      Showing {filteredLogsCount.toLocaleString()} of {logsCount.toLocaleString()} logs
      {filteredLogsCount !== logsCount && (
        <span className="ml-2 text-blue-600 dark:text-blue-400">
          ({((filteredLogsCount / logsCount) * 100).toFixed(1)}% visible)
        </span>
      )}
    </div>
  );

  return (
    <div className="overflow-visible bg-white/50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 px-2 py-4">
      {/* Main filter row - no-wrap with horizontal scroll to keep all controls on one line */}
      <div className="relative z-10 overflow-visible">
        <div className="flex items-center gap-6 flex-nowrap overflow-x-auto overflow-y-visible h-14">
          {renderSearchNavigationInput()}
          {renderFilterInput()}
          {renderLogLevelFilter()}
          {renderTimeRangeFilter()}
          {renderContextLines()}
          {renderClearFiltersButton()}
        </div>
      </div>

      {renderStats()}
    </div>
  );
};

export default LogViewerFilters;
