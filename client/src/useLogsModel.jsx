import { useState, useCallback, useMemo } from 'react';

const useLogsModel = () => {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [highlightedLogId, setHighlightedLogId] = useState(null);
  const [filters, setFilters] = useState({
    searchText: '',
    logLevel: 'all',
    startTime: '',
    endTime: '',
    showTimestamps: true,
    caseSensitive: false
  });

  const loadLogs = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const lines = content.split('\n').filter(line => line.trim());

      const parsedLogs = lines.map((line, index) => ({
        id: index,
        raw: line,
        message: line,
        timestamp: extractTimestamp(line),
        level: extractLogLevel(line),
        module: extractModule(line),
        thread: extractThread(line)
      }));

      setLogs(parsedLogs);
      setSelectedLog(null);
      setHighlightedLogId(null);
    };
    reader.readAsText(file);
  }, []);

  const extractTimestamp = (line) => {
    // Try to extract timestamp from common log formats
    const timestampPatterns = [
      /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/,
      /(\d{2}:\d{2}:\d{2}:\d{3})/,
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/
    ];

    for (const pattern of timestampPatterns) {
      const match = line.match(pattern);
      if (match) return match[1];
    }
    return '';
  };

  const extractLogLevel = (line) => {
    const upperLine = line.toUpperCase();
    if (upperLine.includes('ERROR') || upperLine.includes('ERR')) return 'error';
    if (upperLine.includes('WARN') || upperLine.includes('WARNING')) return 'warning';
    if (upperLine.includes('INFO') || upperLine.includes('INF')) return 'info';
    if (upperLine.includes('DEBUG') || upperLine.includes('DBG')) return 'debug';
    if (upperLine.includes('TRACE') || upperLine.includes('TRC')) return 'trace';
    return 'info';
  };

  const extractModule = (line) => {
    // Try to extract module/component name from brackets
    const moduleMatch = line.match(/\[([^\]]+)\]/);
    return moduleMatch ? moduleMatch[1] : '';
  };

  const extractThread = (line) => {
    // Try to extract thread ID
    const threadMatch = line.match(/\[(\d+)\]/);
    return threadMatch ? threadMatch[1] : '';
  };

  const filteredLogs = useMemo(() => {
    if (!logs.length) return [];

    let filtered = logs;

    // Pre-compile search regex if using search
    let searchRegex = null;
    if (filters.searchText) {
      try {
        const flags = filters.caseSensitive ? 'g' : 'gi';
        searchRegex = new RegExp(filters.searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      } catch {
        // If regex fails, fallback to string search
        searchRegex = null;
      }
    }

    // Single pass filtering - much more efficient
    filtered = logs.filter(log => {
      // Search text filter
      if (filters.searchText) {
        if (searchRegex) {
          if (!searchRegex.test(log.message)) return false;
        } else {
          const searchText = filters.caseSensitive ? filters.searchText : filters.searchText.toLowerCase();
          const message = filters.caseSensitive ? log.message : log.message.toLowerCase();
          if (!message.includes(searchText)) return false;
        }
      }

      // Log level filter
      if (filters.logLevel !== 'all' && log.level !== filters.logLevel) {
        return false;
      }

      // Time range filters
      if (filters.startTime && log.timestamp && log.timestamp < filters.startTime) {
        return false;
      }

      if (filters.endTime && log.timestamp && log.timestamp > filters.endTime) {
        return false;
      }

      return true;
    });

    return filtered;
  }, [logs, filters.searchText, filters.logLevel, filters.startTime, filters.endTime, filters.caseSensitive]); const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const highlightLog = useCallback((logId) => {
    setHighlightedLogId(logId);
    // Auto-clear highlight after 3 seconds
    setTimeout(() => setHighlightedLogId(null), 3000);
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightedLogId(null);
  }, []);

  return {
    logs,
    filteredLogs,
    selectedLog,
    filters,
    highlightedLogId,
    loadLogs,
    setSelectedLog,
    updateFilters,
    highlightLog,
    clearHighlight
  };
};

export default useLogsModel;
