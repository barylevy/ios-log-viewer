import React, { memo, useMemo, useState, useRef, useCallback, useEffect } from 'react';

// Helper functions for date handling
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
  // Extract time part from various formats:
  // 2025-08-02 23:54:57:514 -> 23:54:57
  // [08/02/25 18:21:40.615] -> 18:21:40
  // 2025-08-05 10:41:50.665754+0300 -> 10:41:50

  const timeMatch = timestamp.match(/(\d{2}:\d{2}:\d{2})(?::\d{3}|\.\d{3,6})?/);
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

const LogItem = memo(({ log, onClick, isHighlighted, filters, index }) => {
  // Process the log message and extract file info - memoized by log.id to prevent recalculation
  const cleanedMessage = useMemo(() => cleanMessage(log.message), [log.message]);
  const fileInfo = useMemo(() => extractFileInfo(log), [log.message, log.timestamp]);
  const timeInfo = useMemo(() => extractTimeFromTimestamp(log.timestamp || log.message) || '--:--:--', [log.timestamp, log.message]);

  // Pre-compile search regex for highlighting - memoized by search text
  const highlightRegex = useMemo(() => {
    if (!filters.searchText) return null;

    try {
      const searchTerms = filters.searchText.split('||')
        .map(term => term.trim())
        .filter(term => term.length > 0);
      const escapedTerms = searchTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const combinedPattern = `(${escapedTerms.join('|')})`;
      return new RegExp(combinedPattern, 'gi');
    } catch {
      return null;
    }
  }, [filters.searchText]);

  // Memoize highlighted text to avoid recalculation on every render
  const highlightedMessage = useMemo(() => {
    if (!highlightRegex) return cleanedMessage;

    try {
      return cleanedMessage.split(highlightRegex).map((part, index) => {
        // Reset regex for test since split consumes it
        highlightRegex.lastIndex = 0;
        if (highlightRegex.test(part)) {
          return (
            <mark
              key={index}
              className="bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100"
            >
              {part}
            </mark>
          );
        }
        return part;
      });
    } catch {
      return cleanedMessage;
    }
  }, [cleanedMessage, highlightRegex]);

  // Memoize the level indicator class to prevent recalculation
  const levelClass = useMemo(() => {
    const baseClass = 'w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ';
    switch (log.level) {
      case 'error': return baseClass + 'bg-red-500';
      case 'warning': return baseClass + 'bg-yellow-500';
      case 'info': return baseClass + 'bg-blue-500';
      case 'debug': return baseClass + 'bg-green-500';
      default: return baseClass + 'bg-gray-500';
    }
  }, [log.level]);

  // Memoize the click handler to prevent function recreation
  const handleClick = useCallback(() => onClick(log), [onClick, log]);

  // Determine if this is an odd or even line for alternating background
  const isOddLine = index % 2 === 1;

  return (
    <div
      onClick={handleClick}
      className={`px-3 py-1 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isOddLine ? 'bg-gray-50/50 dark:bg-gray-800/30' : 'bg-white dark:bg-gray-900'
        } ${isHighlighted ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Time only */}
        <div className="flex-shrink-0 w-20">
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
            {timeInfo}
          </span>
        </div>

        {/* Level indicator */}
        <div className={levelClass} />

        {/* Log content with file info */}
        <div className="flex-1 min-w-0 flex justify-between items-start">
          {/* Log message */}
          <div className="font-mono text-sm break-words text-gray-800 dark:text-gray-200 flex-1 mr-2">
            {highlightedMessage}
          </div>

          {/* File info at the end */}
          {fileInfo && (
            <div className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 font-mono">
              {fileInfo}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  return (
    prevProps.log.id === nextProps.log.id &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.filters.searchText === nextProps.filters.searchText &&
    prevProps.onClick === nextProps.onClick
  );
});

LogItem.displayName = 'LogItem';

const LogListView = ({ logs, onLogClick, highlightedLogId, filters }) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 100 });
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);
  const itemHeight = 50; // Height per log item

  // Reset visible range when logs change (but keep scroll position)
  useEffect(() => {
    // Only reset the visible range calculation, not the scroll position
    setVisibleRange(prev => ({ start: 0, end: Math.max(100, prev.end) }));
  }, [logs]);

  // Create a key that changes when logs change to force re-render
  const logsKey = useMemo(() => {
    return logs && logs.length > 0 ? `${logs.length}-${logs[0]?.id || ''}-${logs[logs.length - 1]?.id || ''}` : 'no-logs';
  }, [logs]);

  const memoizedLogs = useMemo(() => logs, [logs]);

  // Group logs by date for sticky headers
  const groupedLogs = useMemo(() => {
    if (!memoizedLogs || memoizedLogs.length === 0) return [];

    const groups = [];
    let currentDate = null;
    let currentGroup = [];

    memoizedLogs.forEach((log, index) => {
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
  }, [memoizedLogs]);

  // Flatten for virtual scrolling - only logs, no separators
  const virtualItems = useMemo(() => {
    if (!groupedLogs || groupedLogs.length === 0) return [];

    const items = [];

    groupedLogs.forEach(group => {
      // Add logs from this group (no date separators)
      group.logs.forEach(log => {
        items.push({
          type: 'log',
          log,
          date: group.date, // Store date for sticky header calculation
          id: `log-${log.originalIndex}`,
          height: itemHeight
        });
      });
    });

    return items;
  }, [groupedLogs, itemHeight]);

  // Find current sticky date based on scroll position
  const currentStickyDate = useMemo(() => {
    if (!virtualItems.length) return null;

    let currentHeight = 0;
    let currentIndex = 0;

    // Find which log we're currently looking at
    for (let i = 0; i < virtualItems.length; i++) {
      const item = virtualItems[i];

      if (currentHeight + item.height > scrollTop) {
        currentIndex = i;
        break;
      }

      currentHeight += item.height;
    }

    // If we've scrolled past all items, use the last item
    if (currentIndex >= virtualItems.length) {
      currentIndex = virtualItems.length - 1;
    }

    // Try to get date from current item
    let foundDate = virtualItems[currentIndex]?.date;

    // If current item doesn't have a date, search around it
    if (!foundDate || foundDate === null) {
      // Search backwards first (higher priority for previous dates)
      for (let i = currentIndex - 1; i >= 0; i--) {
        const date = virtualItems[i]?.date;
        if (date && date !== null) {
          foundDate = date;
          break;
        }
      }

      // If still no date found, search forwards
      if (!foundDate || foundDate === null) {
        for (let i = currentIndex + 1; i < virtualItems.length; i++) {
          const date = virtualItems[i]?.date;
          if (date && date !== null) {
            foundDate = date;
            break;
          }
        }
      }
    }

    return foundDate || null;
  }, [virtualItems, scrollTop]);

  // Memoized height calculations for virtual scrolling performance
  const itemHeights = useMemo(() => {
    if (!virtualItems || virtualItems.length === 0) return { heights: [], totalHeight: 0 };

    const heights = [];
    let accumulated = 0;
    virtualItems.forEach((item, index) => {
      const height = item?.height || itemHeight;
      heights[index] = { height, accumulated };
      accumulated += height;
    });
    return { heights, totalHeight: accumulated };
  }, [virtualItems, itemHeight]);

  // Update visible range and scroll position based on scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop: newScrollTop, clientHeight } = containerRef.current;
    setScrollTop(newScrollTop);

    const { heights } = itemHeights;
    let start = 0;
    let end = virtualItems.length;

    // Binary search for start position (more efficient for large lists)
    let left = 0, right = heights.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (heights[mid].accumulated <= newScrollTop - clientHeight) {
        start = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    start = Math.max(0, start - 10); // Buffer

    // Find end position
    left = 0; right = heights.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (heights[mid].accumulated <= newScrollTop + clientHeight * 2) {
        end = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    end = Math.min(virtualItems.length, end + 10); // Buffer

    setVisibleRange({ start, end });
  }, [virtualItems, itemHeight, itemHeights]);

  // Initialize visible range
  useEffect(() => {
    handleScroll();
  }, [handleScroll]);

  const visibleItems = useMemo(() => {
    const start = visibleRange.start;
    const end = visibleRange.end;
    return virtualItems.slice(start, end);
  }, [virtualItems, visibleRange.start, visibleRange.end]);

  // Calculate total height and offset for virtual scrolling
  const { totalHeight } = itemHeights;
  const offsetY = useMemo(() => {
    let offset = 0;
    for (let i = 0; i < visibleRange.start; i++) {
      offset += virtualItems[i]?.height || itemHeight;
    }
    return offset;
  }, [virtualItems, visibleRange.start, itemHeight]);

  // Early return AFTER all hooks have been called
  if (!logs || logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p>No logs to display</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto bg-white dark:bg-gray-900 relative"
      onScroll={handleScroll}
    >
      {/* Sticky Date Header */}
      {currentStickyDate && (
        <div className="sticky top-0 z-10 bg-blue-50 dark:bg-blue-900 border-b border-blue-200 dark:border-blue-800 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {currentStickyDate}
            </span>
          </div>
        </div>
      )}

      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, visibleIndex) => (
            <LogItem
              key={`${logsKey}-${item.id}`}
              log={item.log}
              onClick={onLogClick}
              isHighlighted={highlightedLogId === item.log.id}
              filters={filters}
              index={item.log.originalIndex || (visibleRange.start + visibleIndex)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default memo(LogListView);
