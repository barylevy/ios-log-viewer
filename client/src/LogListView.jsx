import React, { memo, useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';

// Helper functions for date handling (same as before)
const extractDateFromTimestamp = (timestamp) => {
  if (!timestamp) return null;

  // Try to extract date part from various timestamp formats:
  // 2025-08-02 23:54:57:514 -> 2025-08-02
  const dateMatch1 = timestamp.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch1) return dateMatch1[1];

  // [08/02/25 18:21:40.615] -> 2025-08-02 (convert from MM/dd/yy)
  const dateMatch2 = timestamp.match(/\[(\d{2})\/(\d{2})\/(\d{2})/);
  if (dateMatch2) {
    const month = dateMatch2[1];
    const day = dateMatch2[2];
    const year = '20' + dateMatch2[3]; // Assuming 21st century
    return `${year}-${month}-${day}`;
  }

  // Try other common formats
  const altMatch = timestamp.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (altMatch) return altMatch[1];

  return null;
};

const extractTimeFromTimestamp = (timestamp) => {
  if (!timestamp) return null;
  // Extract time part from various formats with milliseconds:
  // 2025-08-02 23:54:57:514 -> 23:54:57.514
  // 2025-08-02 23:54:57.514 -> 23:54:57.514
  // [08/02/25 18:21:40.615] -> 18:21:40.615
  // 2025-08-05 10:41:50.665754+0300 -> 10:41:50.665

  // Try to match time with milliseconds first
  const timeWithMsMatch = timestamp.match(/(\d{2}:\d{2}:\d{2})[:.](\d{3,6})/);
  if (timeWithMsMatch) {
    const time = timeWithMsMatch[1];
    const ms = timeWithMsMatch[2].substring(0, 3); // Take only first 3 digits for milliseconds
    return `${time}.${ms}`;
  }

  // Fallback to time without milliseconds
  const timeMatch = timestamp.match(/(\d{2}:\d{2}:\d{2})/);
  return timeMatch ? timeMatch[1] : null;
};

// Helper function to extract file and line information
const extractFileInfo = (log) => {
  if (!log.message) return null;

  // Look for patterns like:
  // [CNVpnConfManager:404]
  // [cato_dev_posture_run:358]
  // [DEMModule.cpp:189]
  const fileInfoMatch = log.message.match(/\[([^:\]]+):(\d+)\]/);
  if (fileInfoMatch) {
    return `${fileInfoMatch[1]}:${fileInfoMatch[2]}`;
  }

  // Look for module or component info
  if (log.module) {
    return log.module;
  }

  return null;
};

// Helper function to clean the message text
const cleanMessage = (message) => {
  if (!message) return '';

  // Remove timestamp prefixes
  let cleaned = message
    .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[:\.]?\d*\s*/, '') // Remove date-time prefix
    .replace(/^\[\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\]\s*/, '') // Remove [MM/dd/yy HH:mm:ss.fff]
    .replace(/\[\d+\]\s*/, '') // Remove [PID]
    .replace(/\[.*?\]\s*\[.*?\]\s*/, ''); // Remove other bracketed info at start

  // Remove iOS-style metadata prefix
  // Example: "2025-08-05 10:41:50.696074+0300 0xf4f0 Fault 0x4b8ed 1283 14 CloudTelemetryService:"
  // We want to keep only from "CloudTelemetryService:" onwards
  const iosMatch = cleaned.match(/^.*?\s+0x[\da-fA-F]+\s+\w+\s+0x[\da-fA-F]+\s+\d+\s+\d+\s+(.+)$/);
  if (iosMatch) {
    cleaned = iosMatch[1];
  }

  // Remove log level indicators (single letters followed by space or colon)
  // Examples: "D catoapi:", "I main", "E error", etc.
  // This needs to be more aggressive to catch patterns like "D catoapi:"
  cleaned = cleaned.replace(/^[DIWETVF]\s+/g, ''); // Remove single letter + space at start
  cleaned = cleaned.replace(/^[DIWETVF]:\s*/g, ''); // Remove single letter + colon + space at start

  // Also remove patterns where the log level is followed by a word and colon
  // Example: "D catoapi:" -> "catoapi:"
  cleaned = cleaned.replace(/^[DIWETVF]\s+(\w+:)/g, '$1'); // Remove "D " before "catoapi:"

  // Remove file:line info from anywhere in the message since we show it at the end
  // Examples: [DEMModule.cpp:46], [CNVpnConfManager:404]
  cleaned = cleaned.replace(/\[[\w\.]+:\d+\]/g, ''); // Remove [file:line] patterns

  return cleaned.trim();
};

const LogItem = memo(({ log, onClick, isHighlighted, filters, index, onFiltersChange }) => {
  const [contextMenu, setContextMenu] = useState(null);

  // Process the log message and extract file info - memoized by log.id to prevent recalculation
  const cleanedMessage = useMemo(() => cleanMessage(log.message), [log.message]);
  const fileInfo = useMemo(() => extractFileInfo(log), [log.message, log.timestamp]);
  const timeInfo = useMemo(() => extractTimeFromTimestamp(log.timestamp || log.message) || '--:--:--.---', [log.timestamp, log.message]);

  // Apply search highlighting if there's a search term
  const highlightedMessage = useMemo(() => {
    if (!filters.searchText) return cleanedMessage;

    const searchTerms = filters.searchText
      .split('||')
      .map(term => term.trim())
      .filter(term => term.length > 0);

    if (searchTerms.length === 0) return cleanedMessage;

    let highlighted = cleanedMessage;
    searchTerms.forEach(term => {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-600">$1</mark>');
    });

    return highlighted;
  }, [cleanedMessage, filters.searchText]);

  // Determine log level for styling
  const logLevel = useMemo(() => {
    const message = (log.message || '').toLowerCase();
    if (message.includes('error') || message.includes('err') || message.includes('fail')) return 'error';
    if (message.includes('warn') || message.includes('warning')) return 'warning';
    if (message.includes('info') || message.includes('information')) return 'info';
    if (message.includes('debug') || message.includes('dbg')) return 'debug';
    if (message.includes('trace') || message.includes('verbose')) return 'trace';
    return 'info'; // default
  }, [log.message]);

  const logLevelColor = {
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-500',
    info: 'text-blue-600 dark:text-blue-400',
    debug: 'text-green-600 dark:text-green-400',
    trace: 'text-purple-600 dark:text-purple-400'
  }[logLevel];

  // Handle right-click context menu
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    if (log.timestamp) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        timestamp: log.timestamp
      });
    }
  }, [log.timestamp]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Convert timestamp to datetime-local format
  const formatTimestampForInput = (timestamp) => {
    if (!timestamp) return '';

    // Handle different timestamp formats
    let date;
    if (timestamp.includes('T')) {
      // ISO format: 2025-08-02T23:54:57
      date = new Date(timestamp);
    } else if (timestamp.includes('-') && timestamp.includes(' ')) {
      // Format: 2025-08-02 23:54:57:514
      const cleanTimestamp = timestamp.replace(/:\d{3}$/, ''); // Remove milliseconds
      date = new Date(cleanTimestamp.replace(' ', 'T'));
    } else if (timestamp.includes(':')) {
      // Time only: 23:54:57 - use today's date
      const today = new Date().toISOString().split('T')[0];
      date = new Date(`${today}T${timestamp}`);
    } else {
      return '';
    }

    if (isNaN(date.getTime())) return '';

    // Format for datetime-local input (YYYY-MM-DDTHH:mm:ss) using local time
    // Avoid toISOString() which converts to UTC - use local time instead
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  // Set as from filter
  const setAsFromFilter = () => {
    const formattedTime = formatTimestampForInput(log.timestamp);
    if (formattedTime && onFiltersChange) {
      onFiltersChange({ startTime: formattedTime });
    }
    setContextMenu(null);
  };

  // Set as to filter
  const setAsToFilter = () => {
    const formattedTime = formatTimestampForInput(log.timestamp);
    if (formattedTime && onFiltersChange) {
      onFiltersChange({ endTime: formattedTime });
    }
    setContextMenu(null);
  };

  return (
    <>
      <div
        className={`border-b border-gray-100 dark:border-gray-800 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${isHighlighted ? 'bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700' : ''
          } ${log.isContextLine ? 'bg-gray-50 dark:bg-gray-850 opacity-75' : ''}`}
        onClick={() => onClick(log)}
        onContextMenu={handleContextMenu}
      >
        <div className="flex items-start gap-2">
          {/* Timestamp */}
          <div className={`flex-shrink-0 text-xs font-mono min-w-14 ${
            timeInfo === '--:--:--.---' 
              ? 'text-gray-300 dark:text-gray-600 opacity-50' 
              : 'text-gray-500 dark:text-gray-400'
          }`}>
            {timeInfo}
          </div>

          {/* Line Number */}
          <div className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 font-mono min-w-12 text-right mr-3">
            {log.lineNumber ? `#${log.lineNumber}` : ''}
          </div>

          {/* Log Level Indicator */}
          <div className={`flex-shrink-0 text-xs font-semibold uppercase min-w-8 ${logLevelColor}`}>
            {logLevel.charAt(0).toUpperCase()}
          </div>

          {/* Context Line Indicator */}
          {log.isContextLine && (
            <div className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 font-mono">
              ~
            </div>
          )}

          {/* Message content */}
          <div className="flex-1 flex items-start justify-between gap-1 min-w-0">
            <div
              className={`text-xs break-words ${log.isContextLine
                ? 'text-gray-600 dark:text-gray-400'
                : 'text-gray-800 dark:text-gray-200'
                }`}
              dangerouslySetInnerHTML={{ __html: highlightedMessage }}
            />

            {/* File info at the end */}
            {fileInfo && (
              <div className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 font-mono">
                {fileInfo}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-48"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={setAsFromFilter}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Set as "From" time filter
          </button>
          <button
            onClick={setAsToFilter}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Set as "To" time filter
          </button>
        </div>
      )}
    </>
  );
});

LogItem.displayName = 'LogItem';

const LogListView = ({ logs, onLogClick, highlightedLogId, filters, onFiltersChange }) => {
  const virtuosoRef = useRef(null);
  const [currentStickyDate, setCurrentStickyDate] = useState(null);

  // Group logs by date for sticky headers
  const groupedLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    // Filter out user details/header lines since they're shown in the header
    const filteredLogs = logs.filter(log => {
      const message = log.message || log.raw || '';
      const trimmedMessage = message.trim();

      // Filter out header/user details lines
      return !(
        trimmedMessage.startsWith('User:') ||
        trimmedMessage.startsWith('Account:') ||
        trimmedMessage.startsWith('Client version:') ||
        trimmedMessage.startsWith('OS version:')
      );
    });

    const groups = [];
    let currentDate = null;
    let currentGroup = [];

    filteredLogs.forEach((log, index) => {
      const logDate = extractDateFromTimestamp(log.timestamp);

      // If this log has a date
      if (logDate && logDate !== currentDate) {
        // Save previous group if it exists
        if (currentGroup.length > 0) {
          groups.push({
            type: 'group',
            date: currentDate,
            logs: currentGroup
          });
        }

        // Start new group
        currentDate = logDate;
        currentGroup = [{ ...log, originalIndex: index }];
      } else {
        // Log doesn't have a date or has the same date
        // Use the current date (could be null for logs without dates)
        currentGroup.push({ ...log, originalIndex: index });
      }
    });

    // Add the last group
    if (currentGroup.length > 0) {
      groups.push({
        type: 'group',
        date: currentDate,
        logs: currentGroup
      });
    }

    return groups;
  }, [logs]);

  // Flatten for React Virtuoso - only logs, no separators
  const flatLogs = useMemo(() => {
    if (!groupedLogs || groupedLogs.length === 0) return [];

    const items = [];
    groupedLogs.forEach(group => {
      // Add logs from this group with date metadata
      group.logs.forEach(log => {
        items.push({
          ...log,
          date: group.date // Store date for sticky header calculation
        });
      });
    });

    return items;
  }, [groupedLogs]);

  // Get all unique dates in chronological order
  const allDates = useMemo(() => {
    const uniqueDates = new Set();
    groupedLogs.forEach(group => {
      if (group.date) {
        uniqueDates.add(group.date);
      }
    });
    return Array.from(uniqueDates).sort();
  }, [groupedLogs]);

  // Find current date index for navigation
  const currentDateIndex = useMemo(() => {
    if (!currentStickyDate || !allDates.length) return -1;
    return allDates.indexOf(currentStickyDate);
  }, [currentStickyDate, allDates]);

  // Navigation functions
  const scrollToDate = useCallback((targetDate) => {
    if (!virtuosoRef.current || !targetDate) return;

    // Find the first log with this date
    const targetIndex = flatLogs.findIndex(log => log.date === targetDate);
    if (targetIndex >= 0) {
      virtuosoRef.current.scrollToIndex({ index: targetIndex, align: 'start' });
    }
  }, [flatLogs]);

  const goToPreviousDate = useCallback(() => {
    if (currentDateIndex > 0) {
      const prevDate = allDates[currentDateIndex - 1];
      scrollToDate(prevDate);
    }
  }, [currentDateIndex, allDates, scrollToDate]);

  const goToNextDate = useCallback(() => {
    if (currentDateIndex < allDates.length - 1) {
      const nextDate = allDates[currentDateIndex + 1];
      scrollToDate(nextDate);
    }
  }, [currentDateIndex, allDates, scrollToDate]);

  // Handle range changes to update sticky date
  const handleRangeChanged = useCallback((range) => {
    if (range && range.startIndex < flatLogs.length) {
      const firstVisibleLog = flatLogs[range.startIndex];
      if (firstVisibleLog?.date) {
        setCurrentStickyDate(firstVisibleLog.date);
      }
    }
  }, [flatLogs]);

  // Early return AFTER all hooks have been called
  if (!logs || logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p>No logs to display</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Fixed Date Header with Navigation - Outside of scroll container */}
      {currentStickyDate && (
        <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Previous Date Button */}
              <button
                onClick={goToPreviousDate}
                disabled={currentDateIndex <= 0}
                className={`p-1.5 rounded-md transition-colors ${currentDateIndex <= 0
                  ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                title={currentDateIndex > 0 ? `Go to ${allDates[currentDateIndex - 1]}` : 'No previous date'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Current Date */}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {currentStickyDate}
              </span>

              {/* Next Date Button */}
              <button
                onClick={goToNextDate}
                disabled={currentDateIndex >= allDates.length - 1}
                className={`p-1.5 rounded-md transition-colors ${currentDateIndex >= allDates.length - 1
                  ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                title={currentDateIndex < allDates.length - 1 ? `Go to ${allDates[currentDateIndex + 1]}` : 'No next date'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Date Counter */}
            {allDates.length > 1 && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {currentDateIndex + 1} of {allDates.length}
              </div>
            )}
          </div>
        </div>
      )}

      {/* React Virtuoso List - NO CUSTOM VIRTUAL SCROLLING! */}
      <div className="flex-1">
        <Virtuoso
          ref={virtuosoRef}
          data={flatLogs}
          itemContent={(index, log) => (
            <LogItem
              log={log}
              onClick={onLogClick}
              isHighlighted={highlightedLogId === log.id}
              filters={filters}
              index={index}
              onFiltersChange={onFiltersChange}
            />
          )}
          rangeChanged={handleRangeChanged}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
};

export default memo(LogListView);
