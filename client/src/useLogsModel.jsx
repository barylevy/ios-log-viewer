import { useState, useCallback, useMemo } from 'react';

const useLogsModel = () => {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [highlightedLogId, setHighlightedLogId] = useState(null);
  const [logFileHeaders, setLogFileHeaders] = useState({});
  const [allFileLogs, setAllFileLogs] = useState({}); // Store logs per file
  const [filters, setFilters] = useState({
    searchText: '',
    logLevel: ['all'], // Array to support multiple levels
    startTime: '',
    endTime: '',
    contextLines: 0
  });

  // Parse header information from log content
  const parseHeaderInfo = (content) => {
    const lines = content.split('\n');
    const headerData = {};
    const headerLines = [];

    // Check first 10 lines for headers
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();

      if (line.startsWith('User:')) {
        headerData.user = line.substring(5).trim();
        headerLines.push(i);
      } else if (line.startsWith('Account:')) {
        headerData.account = line.substring(8).trim();
        headerLines.push(i);
      } else if (line.startsWith('Client version:')) {
        headerData.clientVersion = line.substring(15).trim();
        headerLines.push(i);
      } else if (line.startsWith('OS version:')) {
        headerData.osVersion = line.substring(11).trim();
        headerLines.push(i);
      }
    }

    return { headerData, headerLines };
  };

  const loadLogs = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;

      // Parse header information from start of file
      const { headerData, headerLines } = parseHeaderInfo(content);

      // Store headers for this file - smart merge logic
      setLogFileHeaders(prev => {
        const existingHeaders = prev[file.name] || {};
        const hasNewHeaders = headerData && Object.keys(headerData).length > 0;
        const hasExistingHeaders = Object.keys(existingHeaders).length > 0;

        // If we have existing headers and no new headers - keep existing
        if (hasExistingHeaders && !hasNewHeaders) {
          return prev;
        }

        // If we have new headers - use them (merge with existing if needed)
        if (hasNewHeaders) {
          return {
            ...prev,
            [file.name]: headerData
          };
        }

        // If no existing headers and no new headers - don't add entry
        if (!hasExistingHeaders && !hasNewHeaders) {
          return prev;
        }

        return prev;
      });

      const lines = content.split('\n').filter(line => line.trim());

      // Filter out header lines and create log entries
      const parsedLogs = lines
        .map((line, index) => ({ line, index }))
        .filter(({ index }) => !headerLines.includes(index))
        .map(({ line }, logIndex) => ({
          id: logIndex,
          raw: line,
          message: line,
          timestamp: extractTimestamp(line),
          level: extractLogLevel(line),
          module: extractModule(line),
          thread: extractThread(line)
        }));

      // Store logs for this specific file
      setAllFileLogs(prev => ({
        ...prev,
        [file.name]: parsedLogs
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

  // Normalize timestamps for comparison
  const normalizeTimestamp = (timestamp) => {
    if (!timestamp) return null;

    try {
      let date;

      if (timestamp.includes('T')) {
        // ISO format from datetime-local: 2025-08-02T23:54:57
        date = new Date(timestamp);
      } else if (timestamp.includes('-') && timestamp.includes(' ')) {
        // Log format: 2025-08-02 23:54:57:514 or 2025-08-02 23:54:57
        const cleanTimestamp = timestamp.replace(/:\d{3}$/, ''); // Remove milliseconds if present
        date = new Date(cleanTimestamp.replace(' ', 'T'));
      } else if (timestamp.includes(':')) {
        // Time only: 23:54:57 - use today's date
        const today = new Date().toISOString().split('T')[0];
        date = new Date(`${today}T${timestamp}`);
      } else {
        return null;
      }

      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
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

    // First pass: find all logs that match the base filters (excluding context)
    const matchingLogIndices = [];

    logs.forEach((log, index) => {
      // Search text filter - now supports multiple terms with ||
      if (searchData) {
        const { searchTerms, searchRegexes } = searchData;

        // Check if ANY of the search terms match (OR logic)
        const matchesAnyTerm = searchTerms.some((term, termIndex) => {
          const regex = searchRegexes[termIndex];
          if (regex) {
            return regex.test(log.message);
          } else {
            // Fallback to string search (case insensitive)
            const searchText = term.toLowerCase();
            const message = log.message.toLowerCase();
            return message.includes(searchText);
          }
        });

        if (!matchesAnyTerm) return;
      }

      // Log level filter - support multiple levels
      if (!filters.logLevel.includes('all') && !filters.logLevel.includes(log.level)) {
        return;
      }

      // Time range filters - convert to comparable timestamps
      if (filters.startTime && log.timestamp) {
        const logTime = normalizeTimestamp(log.timestamp);
        const startTime = normalizeTimestamp(filters.startTime);
        if (logTime && startTime && logTime < startTime) {
          return;
        }
      }

      if (filters.endTime && log.timestamp) {
        const logTime = normalizeTimestamp(log.timestamp);
        const endTime = normalizeTimestamp(filters.endTime);
        if (logTime && endTime && logTime > endTime) {
          return;
        }
      }

      // This log matches all filters
      matchingLogIndices.push(index);
    });

    // If no context lines requested, just return the matching logs
    if (!filters.contextLines || filters.contextLines === 0) {
      return matchingLogIndices.map(index => ({
        ...logs[index],
        isContextLine: false
      }));
    }

    // Second pass: include context lines around matching logs
    const includedIndices = new Set();

    matchingLogIndices.forEach(matchingIndex => {
      // Add context lines before
      const startIndex = Math.max(0, matchingIndex - filters.contextLines);
      // Add context lines after
      const endIndex = Math.min(logs.length - 1, matchingIndex + filters.contextLines);

      // Include all indices in the range
      for (let i = startIndex; i <= endIndex; i++) {
        includedIndices.add(i);
      }
    });

    // Convert set to sorted array and return the corresponding logs with metadata
    const sortedIndices = Array.from(includedIndices).sort((a, b) => a - b);
    const matchingIndicesSet = new Set(matchingLogIndices);

    return sortedIndices.map(index => ({
      ...logs[index],
      isContextLine: !matchingIndicesSet.has(index)
    }));
  }, [logs, searchData, filters.logLevel, filters.startTime, filters.endTime, filters.contextLines]); const updateFilters = useCallback((newFilters) => {
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

  const getCurrentFileHeaders = useCallback((fileName) => {
    // First try to get headers from the specific file
    let result = logFileHeaders[fileName] || null;

    // If no headers for this file, try to get headers from any file in the session
    // (assuming all files in a session belong to the same user)
    if (!result) {
      const allHeaders = Object.values(logFileHeaders);
      result = allHeaders.find(headers => headers && Object.keys(headers).length > 0) || null;
    }

    return result;
  }, [logFileHeaders]);

  // Set logs for a specific file (used when switching tabs)
  const setLogsForFile = useCallback((fileName, fileLogs) => {
    try {
      // If this is a combined view, ensure unique IDs
      let processedLogs = fileLogs;
      if (fileName === 'Combined Files' && Array.isArray(fileLogs)) {
        processedLogs = fileLogs.map((log, index) => ({
          ...log,
          id: `combined-${index}`,
          originalId: log.id
        }));
      }

      setAllFileLogs(prev => ({
        ...prev,
        [fileName]: processedLogs
      }));
      setLogs(processedLogs);
      setSelectedLog(null);
      setHighlightedLogId(null);
    } catch (error) {
      console.error('❌ Error in setLogsForFile:', error);
    }
  }, []);

  // Switch to show logs for a specific file
  const switchToFile = useCallback((fileName) => {
    const fileLogs = allFileLogs[fileName] || [];

    setLogs(fileLogs);
    setSelectedLog(null);
    setHighlightedLogId(null);
  }, [allFileLogs]);

  return {
    logs,
    filteredLogs,
    selectedLog,
    filters,
    highlightedLogId,
    logFileHeaders,
    allFileLogs,
    loadLogs,
    setSelectedLog,
    updateFilters,
    highlightLog,
    clearHighlight,
    getCurrentFileHeaders,
    setLogsForFile,
    switchToFile
  };
};

export default useLogsModel;
