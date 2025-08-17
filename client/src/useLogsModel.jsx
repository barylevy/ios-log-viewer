import { useState, useCallback, useMemo } from 'react';

const useLogsModel = () => {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [highlightedLogId, setHighlightedLogId] = useState(null);
  const [filters, setFilters] = useState({
    searchText: '',
    logLevel: 'all',
    startTime: '',
    endTime: ''
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

  // Pre-compile search terms and regexes for performance
  const searchData = useMemo(() => {
    if (!filters.searchText) return null;

    const searchTerms = filters.searchText.split('||')
      .map(term => term.trim())
      .filter(term => term.length > 0);

    const searchRegexes = searchTerms.map(term => {
      try {
        return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      } catch {
        return null;
      }
    });

    return { searchTerms, searchRegexes };
  }, [filters.searchText]);

  const filteredLogs = useMemo(() => {
    if (!logs.length) return [];

    // Single pass filtering - much more efficient
    return logs.filter(log => {
      // Search text filter - now supports multiple terms with ||
      if (searchData) {
        const { searchTerms, searchRegexes } = searchData;

        // Check if ANY of the search terms match (OR logic)
        const matchesAnyTerm = searchTerms.some((term, index) => {
          const regex = searchRegexes[index];
          if (regex) {
            return regex.test(log.message);
          } else {
            // Fallback to string search (case insensitive)
            const searchText = term.toLowerCase();
            const message = log.message.toLowerCase();
            return message.includes(searchText);
          }
        });

        if (!matchesAnyTerm) return false;
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
  }, [logs, searchData, filters.logLevel, filters.startTime, filters.endTime]); const updateFilters = useCallback((newFilters) => {
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
