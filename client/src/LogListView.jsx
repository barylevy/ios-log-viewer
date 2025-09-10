import React, { memo, useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';

// Compiled regex patterns for better performance
const DATE_PATTERNS = {
  ISO_DATE: /(\d{4}-\d{2}-\d{2})/,
  BRACKET_DATE: /\[(\d{2})\/(\d{2})\/(\d{2})/,
  ALT_DATE: /(\d{2}\/\d{2}\/\d{4})/
};

const TIME_PATTERNS = {
  WITH_MS: /(\d{2}:\d{2}:\d{2})[:.](\d{3,6})/,
  WITHOUT_MS: /(\d{2}:\d{2}:\d{2})/
};

const TIMESTAMP_PATTERNS = {
  FULL_TIMESTAMP: /(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})[:.](\d{3})/,
  DATE_TIME: /(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2}:\d{2})/
};

const GAP_PATTERN = /#gap=(\d+(?:\.\d+)?)/i;

// Compiled patterns for cleanMessage function
const CLEAN_PATTERNS = {
  DATE_TIME_PREFIX: /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[:\.]?\d*\s*/,
  BRACKET_TIME: /^\[\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\]\s*/,
  PID: /\[\d+\]\s*/,
  DOUBLE_BRACKET: /\[.*?\]\s*\[.*?\]\s*/,
  IOS_METADATA: /^.*?\s+0x[\da-fA-F]+\s+\w+\s+0x[\da-fA-F]+\s+\d+\s+\d+\s+(.+)$/,
  LOG_LEVEL_SPACE: /^[DIWETVF]\s+/g,
  LOG_LEVEL_COLON: /^[DIWETVF]:\s*/g,
  LOG_LEVEL_WORD: /^\s*[DIWETVF]\s+(\w+:)/,
  FILE_LINE: /\[[\w\.]+:\d+\]/g
};

// Helper functions for date handling - memoized for performance
const extractDateFromTimestamp = (timestamp) => {
  if (!timestamp) return null;

  // Try to extract date part from various timestamp formats:
  // 2025-08-02 23:54:57:514 -> 2025-08-02
  const dateMatch1 = timestamp.match(DATE_PATTERNS.ISO_DATE);
  if (dateMatch1) return dateMatch1[1];

  // [08/02/25 18:21:40.615] -> 2025-08-02 (convert from MM/dd/yy)
  const dateMatch2 = timestamp.match(DATE_PATTERNS.BRACKET_DATE);
  if (dateMatch2) {
    const month = dateMatch2[1];
    const day = dateMatch2[2];
    const year = '20' + dateMatch2[3]; // Assuming 21st century
    return `${year}-${month}-${day}`;
  }

  // Try other common formats
  const altMatch = timestamp.match(DATE_PATTERNS.ALT_DATE);
  if (altMatch) return altMatch[1];

  return null;
};

const extractTimeFromTimestamp = (timestamp) => {
  if (!timestamp) return null;

  // Try to match time with milliseconds first
  const timeWithMsMatch = timestamp.match(TIME_PATTERNS.WITH_MS);
  if (timeWithMsMatch) {
    const time = timeWithMsMatch[1];
    const ms = timeWithMsMatch[2].substring(0, 3); // Take only first 3 digits for milliseconds
    return `${time}.${ms}`;
  }

  // Fallback to time without milliseconds
  const timeMatch = timestamp.match(TIME_PATTERNS.WITHOUT_MS);
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

// Helper function to parse timestamp into milliseconds for time gap calculations
const parseTimestampToMs = (timestamp) => {
  if (!timestamp) return null;

  // Try to extract full timestamp: 2025-08-26 11:05:21:299 or 2025-08-26 11:05:21.299
  const fullMatch = timestamp.match(TIMESTAMP_PATTERNS.FULL_TIMESTAMP);
  if (fullMatch) {
    const [, year, month, day, hours, minutes, seconds, ms] = fullMatch;
    return new Date(year, month - 1, day, hours, minutes, seconds, parseInt(ms)).getTime();
  }

  // Fallback: Extract date and time separately and combine
  const dateTimeMatch = timestamp.match(TIMESTAMP_PATTERNS.DATE_TIME);
  if (dateTimeMatch) {
    const [, datePart, timePart] = dateTimeMatch;
    const [year, month, day] = datePart.split('-');
    const [hours, minutes, seconds] = timePart.split(':');
    return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
  }

  return null;
};

// Helper function to extract time gap value from search text
const extractTimeGapFromSearch = (searchText) => {
  if (!searchText) return 0;

  // Look for #gap=X pattern using compiled regex
  const gapMatch = searchText.match(GAP_PATTERN);
  if (gapMatch) {
    const gapValue = parseFloat(gapMatch[1]);
    return isNaN(gapValue) ? 0 : gapValue;
  }

  return 0;
};

// Helper function to format time gap duration
const formatTimeGap = (totalSeconds) => {
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  // Format time components with leading zeros
  const formatTime = (h, m, s) => {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (days > 0) {
    return `${days} Days ${formatTime(hours, minutes, seconds)}`;
  } else {
    return formatTime(hours, minutes, seconds);
  }
};

// Helper function to clean the message text - optimized with compiled patterns
const cleanMessage = (message) => {
  if (!message) return '';

  // Remove timestamp prefixes using compiled patterns
  let cleaned = message
    .replace(CLEAN_PATTERNS.DATE_TIME_PREFIX, '') // Remove date-time prefix
    .replace(CLEAN_PATTERNS.BRACKET_TIME, '') // Remove [MM/dd/yy HH:mm:ss.fff]
    .replace(CLEAN_PATTERNS.PID, '') // Remove [PID]
    .replace(CLEAN_PATTERNS.DOUBLE_BRACKET, ''); // Remove other bracketed info at start

  // Remove iOS-style metadata prefix
  const iosMatch = cleaned.match(CLEAN_PATTERNS.IOS_METADATA);
  if (iosMatch) {
    cleaned = iosMatch[1];
  }

  // Remove log level indicators using compiled patterns
  cleaned = cleaned
    .replace(CLEAN_PATTERNS.LOG_LEVEL_SPACE, '') // Remove single letter + space at start
    .replace(CLEAN_PATTERNS.LOG_LEVEL_COLON, '') // Remove single letter + colon + space at start
    .replace(CLEAN_PATTERNS.LOG_LEVEL_WORD, '$1') // Remove "D " before "catoapi:"
    .replace(CLEAN_PATTERNS.FILE_LINE, ''); // Remove [file:line] patterns

  return cleaned.trim();
};

// Helper function to clean and organize filters
const cleanAndCombineFilters = (currentFilter, newFilterType, newFilterValue) => {
  if (!currentFilter) return newFilterValue;

  // Split by || and clean each part
  const parts = currentFilter.split('||').map(part => part.trim()).filter(part => part);

  // Extract existing filters
  let rowFromFilter = null;
  let rowToFilter = null;
  let dateFromFilter = null;
  let dateToFilter = null;
  let gapFilter = null;
  let otherFilters = [];

  parts.forEach(part => {
    // Check for gap filter first
    if (GAP_PATTERN.test(part)) {
      gapFilter = part;
      return;
    }

    // Check for mixed ranges first
    const rowToDateMatch = part.match(/^#(\d+) :: #(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}:\d{3})?)$/);
    if (rowToDateMatch) {
      rowFromFilter = `#${rowToDateMatch[1]} ::`;
      dateToFilter = `:: #${rowToDateMatch[2]}`;
      return;
    }

    const dateToRowMatch = part.match(/^#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}:\d{3})?) :: #(\d+)$/);
    if (dateToRowMatch) {
      dateFromFilter = `#${dateToRowMatch[1]} ::`;
      rowToFilter = `:: #${dateToRowMatch[2]}`;
      return;
    }

    // Regular patterns
    if (part.match(/^#\d+ ::$/)) {
      rowFromFilter = part;
    } else if (part.match(/^:: #\d+$/)) {
      rowToFilter = part;
    } else if (part.match(/^#\d+ :: #\d+$/)) {
      // Combined row filter
      const match = part.match(/^#(\d+) :: #(\d+)$/);
      if (match) {
        rowFromFilter = `#${match[1]} ::`;
        rowToFilter = `:: #${match[2]}`;
      }
    } else if (part.match(/^#\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2}:\d{3})? ::$/)) {
      dateFromFilter = part;
    } else if (part.match(/^:: #\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2}:\d{3})?$/)) {
      dateToFilter = part;
    } else if (part.match(/^#\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2}:\d{3})? :: #\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2}:\d{3})?$/)) {
      // Combined date filter
      const match = part.match(/^#(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2}:\d{3})?) :: #(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2}:\d{3})?)$/);
      if (match) {
        dateFromFilter = `#${match[1]} ::`;
        dateToFilter = `:: #${match[3]}`;
      }
    } else {
      // Other filters (text search, etc.)
      otherFilters.push(part);
    }
  });

  // Apply the new filter
  if (newFilterType === 'rowFrom') {
    rowFromFilter = newFilterValue;
  } else if (newFilterType === 'rowTo') {
    rowToFilter = newFilterValue;
  } else if (newFilterType === 'dateFrom') {
    dateFromFilter = newFilterValue;
  } else if (newFilterType === 'dateTo') {
    dateToFilter = newFilterValue;
  }

  // Build the result - handle mixed ranges
  const result = [];

  // Add other filters first
  if (otherFilters.length > 0) {
    result.push(...otherFilters);
  }

  // Determine if we have a mixed range scenario
  const hasRowFrom = !!rowFromFilter;
  const hasRowTo = !!rowToFilter;
  const hasDateFrom = !!dateFromFilter;
  const hasDateTo = !!dateToFilter;

  // Handle all range combinations
  let rangeHandled = false;

  // Mixed range: row from + date to
  if (hasRowFrom && hasDateTo && !hasRowTo && !hasDateFrom) {
    const fromNum = rowFromFilter.replace('#', '').replace(' ::', '');
    const toDate = dateToFilter.replace(':: #', '');
    const mixedRange = `#${fromNum} :: #${toDate}`;
    result.push(mixedRange);
    rangeHandled = true;
  }
  // Mixed range: date from + row to
  else if (hasDateFrom && hasRowTo && !hasRowFrom && !hasDateTo) {
    const fromDate = dateFromFilter.replace('#', '').replace(' ::', '');
    const toNum = rowToFilter.replace(':: #', '');
    const mixedRange = `#${fromDate} :: #${toNum}`;
    result.push(mixedRange);
    rangeHandled = true;
  }
  // Pure row range
  else if (hasRowFrom && hasRowTo && !hasDateFrom && !hasDateTo) {
    const fromNum = rowFromFilter.replace('#', '').replace(' ::', '');
    const toNum = rowToFilter.replace(':: #', '');
    const rowRange = `#${fromNum} :: #${toNum}`;
    result.push(rowRange);
    rangeHandled = true;
  }
  // Pure date range
  else if (hasDateFrom && hasDateTo && !hasRowFrom && !hasDateTo) {
    const fromDate = dateFromFilter.replace('#', '').replace(' ::', '');
    const toDate = dateToFilter.replace(':: #', '');
    const dateRange = `#${fromDate} :: #${toDate}`;
    result.push(dateRange);
    rangeHandled = true;
  }

  // Handle single filters only if no range was created
  if (!rangeHandled) {
    if (hasRowFrom) {
      result.push(rowFromFilter);
    }
    if (hasRowTo) {
      result.push(rowToFilter);
    }
    if (hasDateFrom) {
      result.push(dateFromFilter);
    }
    if (hasDateTo) {
      result.push(dateToFilter);
    }
  }

  // Add gap filter if exists
  if (gapFilter) {
    result.push(gapFilter);
  }

  const finalResult = result.join(' || ');
  return finalResult;
}; const LogItem = memo(({ log, onClick, isHighlighted, filters, index, onFiltersChange, previousLog, contextMenu, setContextMenu, onHover }) => {
  // Process the log message and extract file info - memoized by log.id to prevent recalculation
  const cleanedMessage = useMemo(() => cleanMessage(log.message), [log.message]);
  const fileInfo = useMemo(() => extractFileInfo(log), [log.message, log.timestamp]);
  const timeInfo = useMemo(() => extractTimeFromTimestamp(log.timestamp || log.message) || '--:--:--.---', [log.timestamp, log.message]);

  // Calculate time gap threshold once and cache it
  const timeGapThreshold = useMemo(() => {
    const fromText = extractTimeGapFromSearch(filters.searchText);
    const fromQuery = extractTimeGapFromSearch(filters.searchQuery);
    return fromText || fromQuery || 0;
  }, [filters.searchText, filters.searchQuery]);

  // Calculate time gap from previous log - optimized with early returns
  const timeGapInfo = useMemo(() => {
    // Early return if no threshold or previous log
    if (!previousLog || timeGapThreshold <= 0) {
      return { hasGap: false, gapSeconds: 0 };
    }

    // Parse timestamps once - cache for performance
    const currentTime = parseTimestampToMs(log.timestamp || log.message);
    const previousTime = parseTimestampToMs(previousLog.timestamp || previousLog.message);

    if (!currentTime || !previousTime) {
      return { hasGap: false, gapSeconds: 0 };
    }

    const gapSeconds = Math.abs(currentTime - previousTime) / 1000;
    const hasGap = gapSeconds >= timeGapThreshold;

    return { hasGap, gapSeconds };
  }, [log.timestamp, log.message, previousLog?.timestamp, previousLog?.message, timeGapThreshold]);

  // Apply search highlighting if there's a search term - optimized to avoid repeated regex compilation
  const highlightedMessage = useMemo(() => {
    let messageHtml = cleanedMessage;

    // Helper function to process highlight terms
    const processHighlights = (searchText, markClass) => {
      if (!searchText) return;

      const terms = searchText
        .split('||')
        .map(term => term.trim())
        .filter(term => term.length > 0 && !GAP_PATTERN.test(term)); // Exclude #gap=X patterns

      terms.forEach(term => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        messageHtml = messageHtml.replace(regex, `<mark class="${markClass}">$1</mark>`);
      });
    };

    // Highlight filter terms (blue)
    processHighlights(filters.searchText, 'bg-blue-200 dark:bg-blue-600');

    // Highlight search query terms (green)
    processHighlights(filters.searchQuery, 'bg-green-200 dark:bg-green-600 font-bold');

    return messageHtml;
  }, [cleanedMessage, filters.searchQuery, filters.searchText]);

  // Determine log level for styling
  const logLevel = useMemo(() => {
    const message = (log.message || '');//.toLowerCase();
    const LOG_LEVEL_MATRIX = [
      ['error', '[Error]', ' E ', '[E]'],
      ['warning', '[Warn]', ' W ', '[W]'],
      ['info', '[Info]', ' I ', '[I]'],
      ['debug', '[Debug]', ' D ', '[D]'],
      ['trace', '[Trace]', ' T ', '[T]', '[verbose]'],
      ['activity', 'Activity']
    ];

    for (const [level, ...patterns] of LOG_LEVEL_MATRIX) {
      for (const pattern of patterns) {
        if (message.includes(pattern)) return level;
      }
    }
    return 'info';
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
      // Calculate menu dimensions (approximate)
      const menuHeight = 160; // Approximate height for 4 menu items
      const menuWidth = 192; // min-w-48 = 12rem = 192px

      // Get viewport dimensions
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // Calculate initial position
      let x = e.clientX;
      let y = e.clientY;

      // Adjust horizontal position if menu would go off-screen
      if (x + menuWidth > viewportWidth) {
        x = viewportWidth - menuWidth - 10; // 10px margin from edge
      }

      // Adjust vertical position if menu would go off-screen
      if (y + menuHeight > viewportHeight) {
        y = y - menuHeight; // Position above the cursor
        // Ensure it doesn't go above the top of the screen
        if (y < 10) {
          y = 10; // 10px margin from top
        }
      }

      setContextMenu({
        x: x,
        y: y,
        timestamp: log.timestamp,
        lineNumber: log.lineNumber,
        log: log
      });
    }
  }, [log.timestamp]);

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

  return (
    <>
      <div
        className={`border-b border-gray-100 dark:border-gray-800 px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900 hover:bg-opacity-50 cursor-pointer transition-colors ${isHighlighted
          ? 'bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700'
          : log.isContextLine
            ? 'bg-gray-50 dark:bg-gray-800 opacity-75'
            : index % 2 === 1
              ? 'bg-gray-50 dark:bg-gray-800'
              : 'bg-white dark:bg-gray-900'
          }`}
        onClick={() => onClick(log)}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => onHover(log.id)}
        onMouseLeave={() => onHover(null)}
      >
        <div className="flex items-start gap-2">
          {/* Timestamp */}
          <div className={`flex-shrink-0 text-xs font-mono min-w-14 ${timeInfo === '--:--:--.---'
            ? 'text-gray-300 dark:text-gray-600 opacity-50'
            : timeGapInfo.hasGap
              ? 'text-orange-600 dark:text-orange-400 font-semibold'
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

            {/* File info with gap time at the end */}
            {(fileInfo || timeGapInfo.hasGap) && (
              <div className="flex-shrink-0 flex items-center gap-3 pr-2">
                {/* Time Gap Indicator */}
                {timeGapInfo.hasGap && (
                  <div className="text-xs text-orange-600 dark:text-orange-400 font-mono bg-orange-100 dark:bg-orange-900/30 px-1 rounded">
                    +{timeGapInfo.gapSeconds >= 60
                      ? `${Math.floor(timeGapInfo.gapSeconds / 60)}m${Math.floor(timeGapInfo.gapSeconds % 60)}s`
                      : `${Math.floor(timeGapInfo.gapSeconds)}s`
                    }
                  </div>
                )}

                {/* File info */}
                {fileInfo && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                    {fileInfo}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
});

LogItem.displayName = 'LogItem';

const LogListView = ({ logs, onLogClick, highlightedLogId, selectedLogId, filters, onFiltersChange, onSearchMatchUpdate }) => {
  const virtuosoRef = useRef(null);
  // Refs for each item element to allow focus
  const itemRefs = useRef({});
  const [currentStickyDate, setCurrentStickyDate] = useState(null);
  // Search navigation state
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  // Shared context menu state for all log items
  const [contextMenu, setContextMenu] = useState(null);
  // Track which log item is currently being hovered
  const [hoveredLogId, setHoveredLogId] = useState(null);

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

  // Flatten for React Virtuoso - only logs, no separators - optimized dependencies
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
  }, [groupedLogs]); // Removed unnecessary filter dependencies
  // Compute search match positions based on searchQuery - optimized for performance
  const matchIndices = useMemo(() => {
    if (!filters.searchQuery || !flatLogs.length) return [];

    const terms = filters.searchQuery
      .split('||')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    if (!terms.length) return [];

    const indices = [];
    for (let idx = 0; idx < flatLogs.length; idx++) {
      const log = flatLogs[idx];
      const msg = cleanMessage(log.message || '').toLowerCase();

      // Use some() with early return for better performance
      if (terms.some(term => msg.includes(term))) {
        indices.push(idx);
      }
    }

    return indices;
  }, [filters.searchQuery, flatLogs]);
  // Reset on search query change (not on every matchIndices recalculation)
  useEffect(() => {
    setCurrentMatchIndex(matchIndices.length ? 0 : -1);
  }, [filters.searchQuery]); // Only reset when search query changes
  // Next/Prev navigation
  const goToNextMatch = useCallback(() => {
    if (!virtuosoRef.current || !matchIndices.length) return;
    // Non-cyclic: stop if already at last match
    if (currentMatchIndex >= matchIndices.length - 1) return;
    const next = currentMatchIndex + 1;
    const target = matchIndices[next];
    // Scroll to match without opening modal
    virtuosoRef.current.scrollToIndex({ index: target, align: 'start' });
    setCurrentMatchIndex(next);
    // Focus the target item after scrolling
    setTimeout(() => {
      const wrapper = itemRefs.current[target];
      if (wrapper) wrapper.focus();
    }, 100);
  }, [currentMatchIndex, matchIndices]);
  const goToPreviousMatch = useCallback(() => {
    if (!virtuosoRef.current || !matchIndices.length) return;
    // Non-cyclic: stop if already at first match
    if (currentMatchIndex <= 0) return;
    const prev = currentMatchIndex - 1;
    const target = matchIndices[prev];
    // Scroll to match without opening modal
    virtuosoRef.current.scrollToIndex({ index: target, align: 'start' });
    setCurrentMatchIndex(prev);
    // Focus the target item after scrolling
    setTimeout(() => {
      const wrapper = itemRefs.current[target];
      if (wrapper) wrapper.focus();
    }, 100);
  }, [currentMatchIndex, matchIndices]);

  // Notify parent when match position or total changes
  useEffect(() => {
    if (onSearchMatchUpdate) {
      const pos = currentMatchIndex >= 0 ? currentMatchIndex + 1 : 0;
      const total = matchIndices.length;
      onSearchMatchUpdate(pos, total);
    }
  }, [currentMatchIndex, matchIndices, onSearchMatchUpdate]);
  useEffect(() => {
    const handleNext = () => goToNextMatch();
    const handlePrev = () => goToPreviousMatch();
    window.addEventListener('nextSearchMatch', handleNext);
    window.addEventListener('prevSearchMatch', handlePrev);
    return () => {
      window.removeEventListener('nextSearchMatch', handleNext);
      window.removeEventListener('prevSearchMatch', handlePrev);
    };
  }, [goToNextMatch, goToPreviousMatch]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check if the click is outside the context menu
      if (contextMenu && !e.target.closest('.context-menu')) {
        e.stopPropagation();
        e.preventDefault();
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  }, [contextMenu]);

  // Handle space key for hovered items
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault(); // Prevent page scroll
        e.stopPropagation();

        let targetLog = null;

        // Priority 1: Use hovered log if available
        if (hoveredLogId !== null) {
          targetLog = logs.find(log => log.id === hoveredLogId);
          console.log('Space key triggered for hovered log:', hoveredLogId);
        }
        // Priority 2: If no hovered log but there's a selected log (modal open), use that
        else if (selectedLogId !== null) {
          targetLog = logs.find(log => log.id === selectedLogId);
          console.log('Space key triggered for selected log:', selectedLogId);
        }
        // Priority 3: If no hovered or selected log but there's a highlighted log, use that
        else if (highlightedLogId !== null) {
          targetLog = logs.find(log => log.id === highlightedLogId);
          console.log('Space key triggered for highlighted log:', highlightedLogId);
        }

        if (targetLog && onLogClick) {
          onLogClick(targetLog);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hoveredLogId, selectedLogId, highlightedLogId, logs, onLogClick]);

  // Context menu filter functions
  const extractFullTimestampForFilter = (timestamp) => {
    if (!timestamp) return '';
    // Match YYYY-MM-DD HH:MM:SS:MS
    const match = timestamp.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}:\d{3}/);
    if (match) return match[0];
    // If not matched, fallback to just the date
    const dateMatch = timestamp.match(/\d{4}-\d{2}-\d{2}/);
    return dateMatch ? dateMatch[0] : timestamp;
  };

  const setAsFromFilter = useCallback(() => {
    if (onFiltersChange && contextMenu) {
      const currentFilter = filters.searchText || '';
      const newFilter = cleanAndCombineFilters(currentFilter, 'rowFrom', `#${contextMenu.lineNumber} ::`);
      onFiltersChange({ searchText: newFilter });
    }
    setContextMenu(null);
  }, [onFiltersChange, contextMenu, filters.searchText]);

  const setAsToFilter = useCallback(() => {
    if (onFiltersChange && contextMenu) {
      const currentFilter = filters.searchText || '';
      const newFilter = cleanAndCombineFilters(currentFilter, 'rowTo', `:: #${contextMenu.lineNumber}`);
      onFiltersChange({ searchText: newFilter });
    }
    setContextMenu(null);
  }, [onFiltersChange, contextMenu, filters.searchText]);

  const setAsFromDateFilter = useCallback(() => {
    if (onFiltersChange && contextMenu) {
      const currentFilter = filters.searchText || '';
      const fullTimestamp = extractFullTimestampForFilter(contextMenu.timestamp);
      if (!fullTimestamp) return setContextMenu(null);

      const newFilter = cleanAndCombineFilters(currentFilter, 'dateFrom', `#${fullTimestamp} ::`);
      onFiltersChange({ searchText: newFilter });
    }
    setContextMenu(null);
  }, [onFiltersChange, contextMenu, filters.searchText]);

  const setAsToDateFilter = useCallback(() => {
    if (onFiltersChange && contextMenu) {
      const currentFilter = filters.searchText || '';
      const fullTimestamp = extractFullTimestampForFilter(contextMenu.timestamp);
      if (!fullTimestamp) return setContextMenu(null);

      const newFilter = cleanAndCombineFilters(currentFilter, 'dateTo', `:: #${fullTimestamp}`);
      onFiltersChange({ searchText: newFilter });
    }
    setContextMenu(null);
  }, [onFiltersChange, contextMenu, filters.searchText]);

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
        <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Previous Date Button */}
              <button
                onClick={goToPreviousDate}
                disabled={currentDateIndex <= 0}
                className={`p-1 rounded-md transition-colors ${currentDateIndex <= 0
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
              <span className="text-xs text-gray-700 dark:text-gray-300">
                {currentStickyDate}
              </span>

              {/* Next Date Button */}
              <button
                onClick={goToNextDate}
                disabled={currentDateIndex >= allDates.length - 1}
                className={`p-1 rounded-md transition-colors ${currentDateIndex >= allDates.length - 1
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
            <div
              ref={el => itemRefs.current[index] = el}
              tabIndex={-1}
              key={log.id}
              className="outline-none"
            >
              <LogItem
                log={log}
                onClick={onLogClick}
                isHighlighted={highlightedLogId === log.id}
                filters={filters}
                index={index}
                onFiltersChange={onFiltersChange}
                previousLog={index > 0 ? flatLogs[index - 1] : null}
                contextMenu={contextMenu}
                setContextMenu={setContextMenu}
                onHover={setHoveredLogId}
              />
            </div>
          )}
          rangeChanged={handleRangeChanged}
          style={{ height: '100%' }}
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-48"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={setAsFromFilter}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Set as "From" row filter
          </button>
          <button
            onClick={setAsToFilter}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Set as "To" row filter
          </button>
          <button
            onClick={setAsFromDateFilter}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Set "From" date
          </button>
          <button
            onClick={setAsToDateFilter}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Set "To" date
          </button>
        </div>
      )}
    </div>
  );
};

export default memo(LogListView);
