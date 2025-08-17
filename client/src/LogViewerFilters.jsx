import React from 'react';

const LogViewerFilters = ({ filters, onFiltersChange, logsCount, filteredLogsCount }) => {
  const handleFilterChange = (key, value) => {
    onFiltersChange({ [key]: value });
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Search Input */}
        <div className="flex-1 min-w-64">
          <div className="relative">
            <input
              type="text"
              placeholder="Search logs... (use || to separate multiple terms)"
              value={filters.searchText}
              onChange={(e) => handleFilterChange('searchText', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
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
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Searching for: {filters.searchText.split('||').map(term => term.trim()).filter(term => term.length > 0).length} terms
            </div>
          )}
        </div>

        {/* Log Level Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Level:</label>
          <select
            value={filters.logLevel}
            onChange={(e) => handleFilterChange('logLevel', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">All</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
            <option value="trace">Trace</option>
          </select>
        </div>

        {/* Time Range */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">From:</label>
          <input
            type="datetime-local"
            value={filters.startTime}
            onChange={(e) => handleFilterChange('startTime', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">To:</label>
          <input
            type="datetime-local"
            value={filters.endTime}
            onChange={(e) => handleFilterChange('endTime', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        {/* Clear Filters */}
        {(filters.searchText || filters.logLevel !== 'all' || filters.startTime || filters.endTime) && (
          <button
            onClick={() => onFiltersChange({
              searchText: '',
              logLevel: 'all',
              startTime: '',
              endTime: ''
            })}
            className="px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
        Showing {filteredLogsCount.toLocaleString()} of {logsCount.toLocaleString()} logs
        {filteredLogsCount !== logsCount && (
          <span className="ml-2 text-blue-600 dark:text-blue-400">
            ({((filteredLogsCount / logsCount) * 100).toFixed(1)}% visible)
          </span>
        )}
      </div>
    </div>
  );
};

export default LogViewerFilters;
