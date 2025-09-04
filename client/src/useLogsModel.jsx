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

// Returns a shortened display name (max 30 chars from the end, showing suffix)
const getFileDisplayName = (fileId) => {
  if (!fileId) return '';

  // If it contains the size and timestamp pattern, extract just the filename
  const sizeTimestampPattern = /^(.+)_\d+_\d+$/;
  const match = fileId.match(sizeTimestampPattern);
  let name = fileId;
  if (match) {
    name = match[1];
  } else if (fileId.includes('/')) {
    name = fileId.split('/').pop();
  }

  // Shorten to max 30 chars from the end (show suffix)
  if (name.length > 30) {
    return '...' + name.slice(-30);
  }
  return name;
};

// Returns the full file path/name for tooltip/hover, including folder if present
const getFileFullName = (fileId) => {
  if (!fileId) return '';
  // If it contains the size and timestamp pattern, extract just the filename with path
  const sizeTimestampPattern = /^(.+)_\d+_\d+$/;
  const match = fileId.match(sizeTimestampPattern);
  let fullPath = fileId;
  if (match) {
    fullPath = match[1];
  }
  // If it's a path, show the last two segments (folder + file)
  if (fullPath.includes('/')) {
    const parts = fullPath.split('/');
    if (parts.length >= 2) {
      return parts.slice(-2).join('/');
    }
    return fullPath;
  }
  return fullPath;
};

const useLogsModel = () => {
  const [fileLoadingState, setFileLoadingState] = useState({}); // { [fileId]: true/false }
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
    searchQuery: '',
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

  // Internal: load logs for a file object (async)
  const loadLogs = useCallback((file) => {
    const fileId = getFileIdentifier(file);
    // Mark loading as started
    setFileLoadingState(prev => ({ ...prev, [fileId]: true }));
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      // Parse header information from start of file
      const { headerData, headerLines } = parseHeaderInfo(content);
      setLogFileHeaders(prev => {
        const existingHeaders = prev[fileId] || {};
        const hasNewHeaders = headerData && Object.keys(headerData).length > 0;
        const hasExistingHeaders = Object.keys(existingHeaders).length > 0;
        if (hasExistingHeaders && !hasNewHeaders) return prev;
        if (hasNewHeaders) {
          return { ...prev, [fileId]: headerData };
        }
        if (!hasExistingHeaders && !hasNewHeaders) return prev;
        return prev;
      });
      const allLines = content.split('\n'); // Keep all lines including empty ones
      // New logic: group lines by timestamp
      const logs = [];
      let currentLog = null;
      allLines.forEach((line, idx) => {
        if (!line.trim() || headerLines.includes(idx)) return;
        const hasTimestamp = extractTimestamp(line);
        if (hasTimestamp) {
          // Start a new log entry
          if (currentLog) logs.push(currentLog);
          currentLog = {
            id: logs.length,
            raw: line,
            message: line,
            timestamp: hasTimestamp,
            level: extractLogLevel(line),
            module: extractModule(line),
            thread: extractThread(line),
            lineNumber: idx + 1,
            originalLineNumbers: [idx + 1]
          };
        } else if (currentLog) {
          // Append to previous log's message, but increment line number
          currentLog.message += '\n' + line;
          currentLog.raw += '\n' + line;
          currentLog.originalLineNumbers.push(idx + 1);
        } else {
          // If the first line(s) have no timestamp, treat as a log
          currentLog = {
            id: logs.length,
            raw: line,
            message: line,
            timestamp: '',
            level: extractLogLevel(line),
            module: extractModule(line),
            thread: extractThread(line),
            lineNumber: idx + 1,
            originalLineNumbers: [idx + 1]
          };
        }
      });
      if (currentLog) logs.push(currentLog);
      setAllFileLogs(prev => ({ ...prev, [fileId]: logs }));
      setLogs(logs);
      setSelectedLog(null);
      setHighlightedLogId(null);
      setCurrentFileName(fileId);
      setFileLoadingState(prev => ({ ...prev, [fileId]: false }));
    };
    reader.readAsText(file);
  }, []);

  // Request file load if not loaded yet
  const requestFileLoad = useCallback((fileId, fileObj) => {
    if (!allFileLogs[fileId] && !fileLoadingState[fileId]) {
      loadLogs(fileObj);
    }
  }, [allFileLogs, fileLoadingState, loadLogs]);

  // Is file loading?
  const isFileLoading = useCallback((fileId) => {
    return !!fileLoadingState[fileId];
  }, [fileLoadingState]);

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
        if (line.includes(pattern)) return level;
      }
    }
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
  // Parse row range filter: #start :: #end
  const searchData = useMemo(() => {
    if (!filters.searchText) return null;

    // Extract row range filter if present
    let rowStart = null, rowEnd = null;
    let searchText = filters.searchText;
    const rowRangeRegex = /(^|\s)::\s*#(\d+)/; // :: #600
    const rowStartRegex = /#(\d+)\s*::/; // #415 ::
    const rowBothRegex = /#(\d+)\s*::\s*#(\d+)/; // #415 :: #600

    // #415 :: #600
    const bothMatch = searchText.match(rowBothRegex);
    if (bothMatch) {
      rowStart = parseInt(bothMatch[1], 10);
      rowEnd = parseInt(bothMatch[2], 10);
      searchText = searchText.replace(rowBothRegex, '').replace('||', '').trim();
    } else {
      // #415 ::
      const startMatch = searchText.match(rowStartRegex);
      if (startMatch) {
        rowStart = parseInt(startMatch[1], 10);
        searchText = searchText.replace(rowStartRegex, '').replace('||', '').trim();
      }
      // :: #600
      const endMatch = searchText.match(rowRangeRegex);
      if (endMatch) {
        rowEnd = parseInt(endMatch[2], 10);
        searchText = searchText.replace(rowRangeRegex, '').replace('||', '').trim();
      }
    }

    // Split by ||, trim, and classify as include/exclude
    const terms = searchText.split('||').map(term => term.trim()).filter(Boolean);
    const includeTerms = terms.filter(term => !term.startsWith('!'));
    const excludeTerms = terms.filter(term => term.startsWith('!')).map(term => term.slice(1));

    // Build regexes for each term (case-insensitive, supports spaces)
    const includeRegexes = includeTerms.map(term => {
      try {
        return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      } catch {
        return null;
      }
    });
    const excludeRegexes = excludeTerms.map(term => {
      try {
        return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      } catch {
        return null;
      }
    });

    return { includeTerms, excludeTerms, includeRegexes, excludeRegexes, rowStart, rowEnd };
  }, [filters.searchText]);


  const filteredLogs = useMemo(() => {
    if (!logs.length) return [];

    const matchingLogIndices = [];

    logs.forEach((log, index) => {
      if (searchData) {
        const { includeTerms, excludeTerms, includeRegexes, excludeRegexes, rowStart, rowEnd } = searchData;
        const message = log.message.toLowerCase();

        // Row range filter (use real line number in file)
        if (rowStart !== null && log.lineNumber < rowStart) return;
        if (rowEnd !== null && log.lineNumber > rowEnd) return;

        // Exclude logic: if any exclude term matches, skip this log
        const isExcluded = excludeTerms.some((term, i) => {
          const regex = excludeRegexes[i];
          if (regex) return regex.test(message);
          return message.includes(term.toLowerCase());
        });
        if (isExcluded) return;

        // Include logic: if there are include terms, at least one must match
        if (includeTerms.length > 0) {
          const matchesAnyInclude = includeTerms.some((term, i) => {
            const regex = includeRegexes[i];
            if (regex) return regex.test(message);
            return message.includes(term.toLowerCase());
          });
          if (!matchesAnyInclude) return;
        }
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
      return matchingLogIndices.map(i => logs[i]);
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
  }, [logs, filters, searchData, normalizeTimestamp]);

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

  // Returns a shortened display name (max 30 chars from the end, showing suffix)
  const getFileDisplayName = useCallback((fileId) => {
    if (!fileId) return '';

    // If it contains the size and timestamp pattern, extract just the filename
    const sizeTimestampPattern = /^(.+)_\d+_\d+$/;
    const match = fileId.match(sizeTimestampPattern);
    let name = fileId;
    if (match) {
      name = match[1];
    } else if (fileId.includes('/')) {
      name = fileId.split('/').pop();
    }

    // Shorten to max 30 chars from the end (show suffix)
    if (name.length > 30) {
      return '...' + name.slice(-30);
    }
    return name;
  }, []);

  // Returns the full file path/name for tooltip/hover
  const getFileFullName = useCallback((fileId) => {
    if (!fileId) return '';
    // If it contains the size and timestamp pattern, extract just the filename
    const sizeTimestampPattern = /^(.+)_\d+_\d+$/;
    const match = fileId.match(sizeTimestampPattern);
    if (match) {
      return match[1];
    }
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
    requestFileLoad,
    isFileLoading,
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
export { getFileIdentifier, getFileDisplayName, getFileFullName };