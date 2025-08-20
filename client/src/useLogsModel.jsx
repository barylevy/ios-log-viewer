import { useState, useCallback, useMemo, useEffect } from 'react';

// Generate unique file identifier
const getFileIdentifier = (file) => {
  // Priority order for file identification:
  // 1. Full path if available (webkitRelativePath or path property)
  // 2. File name with last modified time for uniqueness
  // 3. File name only as fallback

  if (file.webkitRelativePath && file.webkitRelativePath !== '') {
    return file.webkitRelativePath;
  }

  // For drag-and-drop files, try to use the file name with size and modified date for uniqueness
  if (file.lastModified && file.size) {
    return `${file.name}_${file.size}_${file.lastModified}`;
  }

  // Fallback to just the file name
  return file.name;
};

const useLogsModel = () => {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [highlightedLogId, setHighlightedLogId] = useState(null);
  const [logFileHeaders, setLogFileHeaders] = useState({});
  const [allFileLogs, setAllFileLogs] = useState({}); // Store logs per file
  const [allFileFilters, setAllFileFilters] = useState(() => {
    // Load saved filters from localStorage on initial load
    try {
      const saved = localStorage.getItem('logViewerFilters');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('Failed to load saved filters:', error);
      return {};
    }
  }); // Store filters per file
  const [currentFileName, setCurrentFileName] = useState(null); // Track current file
  const [filters, setFilters] = useState({
    searchText: '',
    logLevel: ['all'], // Array to support multiple levels
    startTime: '',
    endTime: '',
    contextLines: 0
  });

  // Load filters when current file changes
  useEffect(() => {
    if (currentFileName && allFileFilters[currentFileName]) {
      setFilters({ ...allFileFilters[currentFileName] });
    }
  }, [currentFileName, allFileFilters]);

  // Save filters to localStorage whenever allFileFilters changes
  useEffect(() => {
    try {
      // Clean up old entries if we have too many (keep only last 50 files)
      const entries = Object.entries(allFileFilters);
      if (entries.length > 50) {
        const recentEntries = entries.slice(-50);
        const cleanedFilters = Object.fromEntries(recentEntries);
        localStorage.setItem('logViewerFilters', JSON.stringify(cleanedFilters));
      } else {
        localStorage.setItem('logViewerFilters', JSON.stringify(allFileFilters));
      }
    } catch (error) {
      console.error('Failed to save filters to localStorage:', error);
      // If localStorage is full, clear old data and try again
      if (error.name === 'QuotaExceededError') {
        try {
          localStorage.removeItem('logViewerFilters');
          localStorage.setItem('logViewerFilters', JSON.stringify({}));
        } catch (clearError) {
          console.error('Failed to clear localStorage:', clearError);
        }
      }
    }
  }, [allFileFilters]);

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

      // Create unique file identifier
      const fileId = getFileIdentifier(file);

      // Parse header information from start of file
      const { headerData, headerLines } = parseHeaderInfo(content);

      // Store headers for this file - smart merge logic
      setLogFileHeaders(prev => {
        const existingHeaders = prev[fileId] || {};
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
            [fileId]: headerData
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
        .map(({ line, index }, logIndex) => ({
          id: logIndex,
          raw: line,
          message: line,
          timestamp: extractTimestamp(line),
          level: extractLogLevel(line),
          module: extractModule(line),
          thread: extractThread(line),
          lineNumber: index + 1 // Store original line number from file (1-based)
        }));

      // Store logs for this specific file
      setAllFileLogs(prev => ({
        ...prev,
        [fileId]: parsedLogs
      }));

      // Set current file name using the unique identifier
      setCurrentFileName(fileId);

      setLogs(parsedLogs);
      setSelectedLog(null);
      setHighlightedLogId(null);
    };
    reader.readAsText(file);
  }, []);

  const extractTimestamp = (line) => {
    // Try to extract timestamp from common log formats with milliseconds
    const timestampPatterns = [
      /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}:\d{3})/,  // 2025-08-02 23:54:57:514
      /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3,6})/,  // 2025-08-02 23:54:57.514 or .514123
      /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/,        // 2025-08-02 23:54:57 (fallback without ms)
      /(\d{2}:\d{2}:\d{2}:\d{3})/,                      // 23:54:57:514
      /(\d{2}:\d{2}:\d{2}\.\d{3,6})/,                   // 23:54:57.514 or .514123
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6})/,  // 2025-08-02T23:54:57.514
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/          // 2025-08-02T23:54:57 (fallback without ms)
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
  }, [logs, searchData, filters.logLevel, filters.startTime, filters.endTime, filters.contextLines]);

  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => {
      const updatedFilters = { ...prev, ...newFilters };

      // Save filters for current file if we have one
      if (currentFileName) {
        setAllFileFilters(prevFileFilters => ({
          ...prevFileFilters,
          [currentFileName]: updatedFilters
        }));
      }

      return updatedFilters;
    });
  }, [currentFileName]);

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

      // Set current file name
      setCurrentFileName(fileName);

      // Load filters for this file if they exist, otherwise use default filters
      const defaultFilters = {
        searchText: '',
        logLevel: ['all'],
        startTime: '',
        endTime: '',
        contextLines: 0
      };

      const fileFilters = allFileFilters[fileName];
      setFilters(fileFilters ? { ...fileFilters } : defaultFilters);

      setLogs(processedLogs);
      setSelectedLog(null);
      setHighlightedLogId(null);
    } catch (error) {
      console.error('❌ Error in setLogsForFile:', error);
    }
  }, [allFileFilters]);

  // Switch to show logs for a specific file
  const switchToFile = useCallback((fileName) => {
    const fileLogs = allFileLogs[fileName] || [];

    // Set current file name
    setCurrentFileName(fileName);

    // Load filters for this file if they exist, otherwise use default filters
    const defaultFilters = {
      searchText: '',
      logLevel: ['all'],
      startTime: '',
      endTime: '',
      contextLines: 0
    };

    const fileFilters = allFileFilters[fileName];
    setFilters(fileFilters ? { ...fileFilters } : defaultFilters);

    setLogs(fileLogs);
    setSelectedLog(null);
    setHighlightedLogId(null);
  }, [allFileLogs, allFileFilters]);

  // Clear all saved filters from localStorage
  const clearSavedFilters = useCallback(() => {
    try {
      localStorage.removeItem('logViewerFilters');
      setAllFileFilters({});
    } catch (error) {
      console.error('Failed to clear saved filters:', error);
    }
  }, []);

  // Get display name from file identifier
  const getFileDisplayName = useCallback((fileId) => {
    if (!fileId) return '';

    // If it contains the size and timestamp pattern, extract just the filename
    const sizeTimestampPattern = /^(.+)_\d+_\d+$/;
    const match = fileId.match(sizeTimestampPattern);
    if (match) {
      return match[1]; // Return just the filename part
    }

    // If it's a path, return just the filename
    if (fileId.includes('/')) {
      return fileId.split('/').pop();
    }

    // Otherwise return as-is
    return fileId;
  }, []);

  return {
    logs,
    filteredLogs,
    selectedLog,
    filters,
    highlightedLogId,
    logFileHeaders,
    allFileLogs,
    allFileFilters,
    currentFileName,
    loadLogs,
    setSelectedLog,
    updateFilters,
    highlightLog,
    clearHighlight,
    getCurrentFileHeaders,
    setLogsForFile,
    switchToFile,
    clearSavedFilters,
    getFileDisplayName
  };
};

export default useLogsModel;
export { getFileIdentifier };