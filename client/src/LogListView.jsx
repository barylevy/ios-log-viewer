import React, { memo, useMemo, useState, useRef, useCallback, useEffect } from 'react';

const LogItem = memo(({ log, onClick, isHighlighted, filters }) => {
  const getLevelColor = (level) => {
    switch (level) {
      case 'error': return 'text-red-600 dark:text-red-400';
      case 'warning': return 'text-yellow-600 dark:text-yellow-400';
      case 'info': return 'text-blue-600 dark:text-blue-400';
      case 'debug': return 'text-green-600 dark:text-green-400';
      case 'trace': return 'text-gray-600 dark:text-gray-400';
      default: return 'text-gray-800 dark:text-gray-200';
    }
  };

  const getBgColor = (level) => {
    switch (level) {
      case 'error': return 'bg-red-50 dark:bg-red-900/20';
      case 'warning': return 'bg-yellow-50 dark:bg-yellow-900/20';
      case 'info': return 'bg-blue-50 dark:bg-blue-900/20';
      case 'debug': return 'bg-green-50 dark:bg-green-900/20';
      case 'trace': return 'bg-gray-50 dark:bg-gray-900/20';
      default: return 'bg-white dark:bg-gray-800';
    }
  };

  // Memoize highlighted text to avoid recalculation on every render
  const highlightedMessage = useMemo(() => {
    if (!filters.searchText) return log.message;

    const flags = filters.caseSensitive ? 'g' : 'gi';
    try {
      // Split search terms by || and create a combined regex
      const searchTerms = filters.searchText.split('||').map(term => term.trim()).filter(term => term.length > 0);
      const escapedTerms = searchTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const combinedPattern = `(${escapedTerms.join('|')})`;
      const regex = new RegExp(combinedPattern, flags);

      return log.message.split(regex).map((part, index) => {
        if (regex.test(part)) {
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
      return log.message;
    }
  }, [log.message, filters.searchText, filters.caseSensitive]);

  return (
    <div
      onClick={() => onClick(log)}
      className={`px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isHighlighted ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
        } ${getBgColor(log.level)}`}
    >
      <div className="flex items-start gap-2">
        {/* Level indicator */}
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.level === 'error' ? 'bg-red-500' :
          log.level === 'warning' ? 'bg-yellow-500' :
            log.level === 'info' ? 'bg-blue-500' :
              log.level === 'debug' ? 'bg-green-500' :
                'bg-gray-500'
          }`} />

        {/* Log content */}
        <div className="flex-1 min-w-0">
          {/* Timestamp and metadata */}
          {filters.showTimestamps && (log.timestamp || log.module || log.thread) && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
              {log.timestamp && (
                <span className="font-mono">{log.timestamp}</span>
              )}
              {log.module && (
                <span className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{log.module}</span>
              )}
              {log.thread && (
                <span className="bg-gray-200 dark:bg-gray-700 px-1 rounded">#{log.thread}</span>
              )}
              <span className={`font-medium ${getLevelColor(log.level)}`}>
                {log.level.toUpperCase()}
              </span>
            </div>
          )}

          {/* Log message */}
          <div className={`font-mono text-sm break-words ${getLevelColor(log.level)}`}>
            {highlightedMessage}
          </div>
        </div>
      </div>
    </div>
  );
});

LogItem.displayName = 'LogItem';

const LogListView = ({ logs, onLogClick, highlightedLogId, filters }) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 100 });
  const containerRef = useRef(null);
  const itemHeight = 50; // Reduced height per log item for tighter spacing

  const memoizedLogs = useMemo(() => logs, [logs]);

  // Update visible range based on scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, clientHeight } = containerRef.current;
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 10); // Buffer of 10 items
    const end = Math.min(logs.length, start + Math.ceil(clientHeight / itemHeight) + 20); // Buffer of 20 items

    setVisibleRange({ start, end });
  }, [logs.length, itemHeight]);

  // Initialize visible range
  useEffect(() => {
    handleScroll();
  }, [handleScroll]);

  const visibleLogs = useMemo(() => {
    return memoizedLogs.slice(visibleRange.start, visibleRange.end);
  }, [memoizedLogs, visibleRange]);

  if (!logs || logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p>No logs to display</p>
      </div>
    );
  }

  const totalHeight = logs.length * itemHeight;
  const offsetY = visibleRange.start * itemHeight;

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto bg-white dark:bg-gray-900"
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleLogs.map((log, index) => (
            <LogItem
              key={log.id}
              log={log}
              onClick={onLogClick}
              isHighlighted={highlightedLogId === log.id}
              filters={filters}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default memo(LogListView);
