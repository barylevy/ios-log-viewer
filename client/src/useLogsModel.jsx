import { useState, useCallback, useMemo, useEffect } from 'react';
import { LOG_LEVEL_MATRIX } from './constants';
import {
  detectDateFormat,
  GAP_PATTERN
} from './dateTimeUtils';
import {
  normalizeTimestamp,
  parseLogContent
} from './LogParser';
const DATE_RANGE_REGEX = /(^|\s)::\s*#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)/; // :: #date
const DATE_START_REGEX = /#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)\s*::/; // #date ::
const DATE_BOTH_REGEX = /#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)\s*::\s*#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)/; // #date :: #date

const ROW_RANGE_REGEX = /(^|\s)::\s*#(\d+)(?!\d{4})/; // :: #600 (but not :: #2025...)
const ROW_START_REGEX = /#(\d+)(?!\d{4})\s*::/; // #415 :: (but not #2025...)
const ROW_BOTH_REGEX = /#(\d+)(?!\d{4})\s*::\s*#(\d+)(?!\d{4})/; // #415 :: #600

// Mixed range patterns: row to date or date to row
const ROW_TO_DATE_REGEX = /#(\d+)(?!\d{4})\s*::\s*#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)/; // #9 :: #2025-07-04 13:29:11:645
const DATE_TO_ROW_REGEX = /#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)\s*::\s*#(\d+)(?!\d{4})/; // #2025-07-04 13:29:11:645 :: #500

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

// Returns a shortened display name (max 50 chars from the end, showing suffix)
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

  // Shorten to max 50 chars from the end (show suffix)
  if (name.length > 50) {
    return '...' + name.slice(-50);
  }
  return name;
};

// Returns the full file path/name for tooltip/hover
const getFileFullName = (fileId) => {
  if (!fileId) return '';
  // If it contains the size and timestamp pattern, extract just the filename
  const sizeTimestampPattern = /^(.+)_\d+_\d+$/;
  const match = fileId.match(sizeTimestampPattern);
  if (match) {
    return match[1];
  }
  return fileId;
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

  // ===== STICKY LOGS MANAGEMENT =====
  const [allFileStickyLogs, setAllFileStickyLogs] = useState(() => {
    // Load saved sticky logs from localStorage on initial load
    try {
      const saved = localStorage.getItem('logViewerStickyLogs');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('Failed to load saved sticky logs:', error);
      return {};
    }
  }); // Store sticky logs per file

  // Save sticky logs to localStorage whenever allFileStickyLogs changes
  useEffect(() => {
    try {
      // Clean up old entries if we have too many (keep only last 50 files)
      const entries = Object.entries(allFileStickyLogs);
      if (entries.length > 50) {
        const recentEntries = entries.slice(-50);
        const cleanedStickyLogs = Object.fromEntries(recentEntries);
        localStorage.setItem('logViewerStickyLogs', JSON.stringify(cleanedStickyLogs));
      } else {
        localStorage.setItem('logViewerStickyLogs', JSON.stringify(allFileStickyLogs));
      }
    } catch (error) {
      console.error('Failed to save sticky logs to localStorage:', error);
      // If localStorage is full, clear old data and try again
      if (error.name === 'QuotaExceededError') {
        try {
          localStorage.removeItem('logViewerStickyLogs');
          localStorage.setItem('logViewerStickyLogs', JSON.stringify({}));
        } catch (clearError) {
          console.error('Failed to clear localStorage:', clearError);
        }
      }
    }
  }, [allFileStickyLogs]);

  // Get sticky logs for current file
  // For merged files (All logs tab), aggregate sticky logs from all source files
  const stickyLogs = useMemo(() => {
    if (!currentFileName) return [];
    
    const currentFileStickyLogs = allFileStickyLogs[currentFileName] || [];
    
    // Check if current file is a merged view by looking at the logs
    const currentLogs = allFileLogs[currentFileName] || [];
    const sourceFiles = new Set(currentLogs.map(log => log.sourceFile).filter(Boolean));
    
    // If we have multiple source files, it's a merged view - aggregate all sticky logs
    if (sourceFiles.size > 1) {
      const aggregatedSticky = [];
      
      // Collect sticky logs from all files that match any of the source files
      Object.entries(allFileStickyLogs).forEach(([fileKey, stickyLogsArray]) => {
        // Check if this file's sticky logs should be included
        // Match by checking if the fileKey contains any of the sourceFile names
        sourceFiles.forEach(sourceFile => {
          if (fileKey.includes(sourceFile) || sourceFile === fileKey) {
            // Add these sticky logs, avoiding duplicates
            stickyLogsArray.forEach(sticky => {
              const exists = aggregatedSticky.find(s => 
                s.baseId === sticky.baseId && s.sourceFile === sticky.sourceFile
              );
              if (!exists) {
                aggregatedSticky.push(sticky);
              }
            });
          }
        });
      });
      
      return aggregatedSticky;
    }
    
    // Single file view - return only that file's sticky logs
    return currentFileStickyLogs;
  }, [allFileStickyLogs, currentFileName, allFileLogs]);

  const addStickyLog = useCallback((log) => {
    if (!currentFileName) return;

    try {
      setAllFileStickyLogs(prev => {
        // Determine which file to add the sticky log to
        // If the log has a sourceFile, we need to find the matching file key
        let targetFileKey = currentFileName;
        
        if (log.sourceFile) {
          // Search for a file key that matches the sourceFile
          // This handles cases where the file key might include path or timestamp
          const matchingKey = Object.keys(prev).find(key => 
            key === log.sourceFile || key.includes(log.sourceFile)
          );
          
          // If we found a matching key, use it; otherwise try to use sourceFile directly
          if (matchingKey) {
            targetFileKey = matchingKey;
          } else {
            // For merged views, use the sourceFile as the key
            targetFileKey = log.sourceFile;
          }
        }
        
        const currentFileStickyLogs = prev[targetFileKey] || [];

        // Extract the base ID (remove file prefix if present)
        const baseId = typeof log.id === 'string' && log.id.includes('_') 
          ? log.id.split('_')[1] 
          : log.id;

        // Avoid duplicates - check by baseId and sourceFile
        if (currentFileStickyLogs.find(sticky => {
          const stickyBaseId = typeof sticky.id === 'string' && sticky.id.includes('_')
            ? sticky.id.split('_')[1]
            : sticky.id;
          return stickyBaseId === baseId && sticky.sourceFile === log.sourceFile;
        })) {
          return prev;
        }

        const newStickyLog = {
          id: log.id,
          baseId: baseId, // Store base ID for matching
          sourceFile: log.sourceFile, // Store source file for matching
          lineNumber: log.lineNumber,
          timestamp: log.timestamp,
          level: log.level,
          message: log.message ? log.message.substring(0, 50) + (log.message.length > 50 ? '...' : '') : 'No message',
          cleanedMessage: log.cleanedMessage || log.message || 'No message'
        };

        return {
          ...prev,
          [targetFileKey]: [...currentFileStickyLogs, newStickyLog]
        };
      });
    } catch (error) {
      console.error('Error adding sticky log:', error);
    }
  }, [currentFileName]);

  const removeStickyLog = useCallback((logId) => {
    if (!currentFileName) return;

    setAllFileStickyLogs(prev => {
      // First try to find the sticky log in current file
      let targetFileKey = currentFileName;
      let stickyToRemove = (prev[currentFileName] || []).find(sticky => sticky.id === logId);
      
      // If not found in current file, search across all files (for merged view)
      if (!stickyToRemove) {
        for (const [fileKey, stickyArray] of Object.entries(prev)) {
          const found = stickyArray.find(sticky => sticky.id === logId);
          if (found) {
            targetFileKey = fileKey;
            stickyToRemove = found;
            break;
          }
        }
      }
      
      // If still not found, try matching by baseId and sourceFile
      if (!stickyToRemove) {
        const baseId = typeof logId === 'string' && logId.includes('_') 
          ? logId.split('_')[1] 
          : logId;
          
        for (const [fileKey, stickyArray] of Object.entries(prev)) {
          const found = stickyArray.find(sticky => {
            const stickyBaseId = typeof sticky.id === 'string' && sticky.id.includes('_')
              ? sticky.id.split('_')[1]
              : sticky.id;
            return stickyBaseId === baseId;
          });
          if (found) {
            targetFileKey = fileKey;
            stickyToRemove = found;
            break;
          }
        }
      }
      
      // Remove the sticky log from the target file
      const currentFileStickyLogs = prev[targetFileKey] || [];
      const updatedFileStickyLogs = currentFileStickyLogs.filter(sticky => 
        sticky.id !== (stickyToRemove?.id || logId)
      );

      return {
        ...prev,
        [targetFileKey]: updatedFileStickyLogs
      };
    });
  }, [currentFileName]);

  const clearAllStickyLogs = useCallback(() => {
    if (!currentFileName) return;

    setAllFileStickyLogs(prev => {
      return {
        ...prev,
        [currentFileName]: []
      };
    });
  }, [currentFileName]);

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

  // Sort logs by timestamp using pre-parsed timestampMs
  const sortLogsByTimestamp = (logs) => {
    return logs.sort((a, b) => {
      if (a.timestampMs && b.timestampMs) {
        return a.timestampMs - b.timestampMs;
      }
      
      // Fallback to string comparison if timestampMs is missing
      if (a.timestamp && b.timestamp) {
        return a.timestamp.localeCompare(b.timestamp);
      }
      return 0;
    });
  };

  // Internal: load logs for a file object or array of files (async)
  const loadLogs = useCallback((fileOrFiles) => {
    const isFileArray = Array.isArray(fileOrFiles);
    const firstFile = isFileArray ? fileOrFiles[0] : fileOrFiles;
    const fileId = getFileIdentifier(firstFile);
    
    // Mark loading as started
    setFileLoadingState(prev => ({ ...prev, [fileId]: true }));
    
    if (isFileArray) {
      // Load multiple files and merge them
      const fileReadPromises = fileOrFiles.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target.result;
            const { headerData, headerLines } = parseHeaderInfo(content);
            const dateFormat = detectDateFormat(content);
            const logs = parseLogContent(content, headerLines, dateFormat);
            resolve({ logs, headerData, fileName: file.name, dateFormat });
          };
          reader.readAsText(file);
        });
      });
      
      Promise.all(fileReadPromises).then(results => {
        // Merge all logs from all files
        const allLogs = results.flatMap((result, index) => 
          result.logs.map(log => ({
            ...log,
            baseId: log.id, // Store original ID for matching
            id: `${index}_${log.id}`, // Ensure unique IDs across files
            sourceFile: result.fileName // Track which file each log came from
          }))
        );
        
        // Sort by timestamp
        sortLogsByTimestamp(allLogs);
        
        // Merge headers from all files (prefer non-empty values)
        const mergedHeaders = results.reduce((acc, result) => {
          if (result.headerData) {
            Object.entries(result.headerData).forEach(([key, value]) => {
              if (value && !acc[key]) {
                acc[key] = value;
              }
            });
          }
          return acc;
        }, {});
        
        if (Object.keys(mergedHeaders).length > 0) {
          setLogFileHeaders(prev => ({ ...prev, [fileId]: mergedHeaders }));
        }
        
        setAllFileLogs(prev => ({ ...prev, [fileId]: allLogs }));
        setLogs(allLogs);
        setSelectedLog(null);
        setHighlightedLogId(null);
        setCurrentFileName(fileId);
        setFileLoadingState(prev => ({ ...prev, [fileId]: false }));
      });
    } else {
      // Single file - original logic
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        
        // Detect date format from file content (used for parsing)
        const dateFormat = detectDateFormat(content);
        
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
        
        // Parse the log content using the dedicated parser with date format
        const logs = parseLogContent(content, headerLines, dateFormat);
        
        // Add sourceFile to all logs for consistency with merged view
        const logsWithSource = logs.map(log => ({
          ...log,
          sourceFile: fileOrFiles.name // Add source file name
        }));
        
        // Sort logs by timestamp (important for merged log files)
        sortLogsByTimestamp(logsWithSource);
        
        setAllFileLogs(prev => ({ ...prev, [fileId]: logsWithSource }));
        setLogs(logsWithSource);
        setSelectedLog(null);
        setHighlightedLogId(null);
        setCurrentFileName(fileId);
        setFileLoadingState(prev => ({ ...prev, [fileId]: false }));
      };
      reader.readAsText(fileOrFiles);
    }
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

  // Pre-compile search terms and regexes for performance
  // Parse row range filter or date range filter if present
  const searchData = useMemo(() => {
    if (!filters.searchText) return null;

    // Extract row range filter or date range filter if present
    let rowStart = null, rowEnd = null;
    let dateStart = null, dateEnd = null;
    let searchText = filters.searchText;

    // First, check for mixed ranges: row to date or date to row
    const rowToDateMatch = searchText.match(ROW_TO_DATE_REGEX);
    if (rowToDateMatch) {
      rowStart = parseInt(rowToDateMatch[1], 10);
      dateEnd = rowToDateMatch[2];
      searchText = searchText.replace(ROW_TO_DATE_REGEX, '').replace(/\|\|\s*$/, '').replace(/^\s*\|\|/, '').trim();
    }

    const dateToRowMatch = searchText.match(DATE_TO_ROW_REGEX);
    if (dateToRowMatch) {
      dateStart = dateToRowMatch[1];
      rowEnd = parseInt(dateToRowMatch[2], 10);
      searchText = searchText.replace(DATE_TO_ROW_REGEX, '').replace(/\|\|\s*$/, '').replace(/^\s*\|\|/, '').trim();
    }

    // If no mixed ranges found, try pure date ranges
    if (!rowStart && !dateEnd && !dateStart && !rowEnd) {
      // Date range patterns: Support multiple formats (both dot and colon for milliseconds)
      // #2025-07-04 13:28:20.540 :: #2025-07-05 13:28:20.540 (with milliseconds - dot format)
      // #2025-07-04 13:28:20:540 :: #2025-07-05 13:28:20:540 (with milliseconds - colon format, legacy)
      // #2025-07-04 14:19:44 :: #2025-07-05 14:19:44 (without milliseconds)  
      // #2025-07-04 :: #2025-07-05 (date only)

      const dateBothMatch = searchText.match(DATE_BOTH_REGEX);
      if (dateBothMatch) {
        dateStart = dateBothMatch[1];
        dateEnd = dateBothMatch[2];
        searchText = searchText.replace(DATE_BOTH_REGEX, '').replace(/\|\|\s*$/, '').replace(/^\s*\|\|/, '').trim();
      } else {
        // #date ::
        const dateStartMatch = searchText.match(DATE_START_REGEX);
        if (dateStartMatch) {
          dateStart = dateStartMatch[1];
          searchText = searchText.replace(DATE_START_REGEX, '').replace(/\|\|\s*$/, '').replace(/^\s*\|\|/, '').trim();
        }
        // :: #date
        const dateEndMatch = searchText.match(DATE_RANGE_REGEX);
        if (dateEndMatch) {
          dateEnd = dateEndMatch[2];
          searchText = searchText.replace(DATE_RANGE_REGEX, '').replace(/\|\|\s*$/, '').replace(/^\s*\|\|/, '').trim();
        }
      }
    }

    // If no date ranges found (pure or mixed), try pure row ranges
    if (!dateStart && !dateEnd && !rowStart && !rowEnd) {
      // #415 :: #600
      const rowBothMatch = searchText.match(ROW_BOTH_REGEX);
      if (rowBothMatch) {
        rowStart = parseInt(rowBothMatch[1], 10);
        rowEnd = parseInt(rowBothMatch[2], 10);
        searchText = searchText.replace(ROW_BOTH_REGEX, '').replace(/\|\|\s*$/, '').replace(/^\s*\|\|/, '').trim();
      } else {
        // #415 ::
        const rowStartMatch = searchText.match(ROW_START_REGEX);
        if (rowStartMatch) {
          rowStart = parseInt(rowStartMatch[1], 10);
          searchText = searchText.replace(ROW_START_REGEX, '').replace(/\|\|\s*$/, '').replace(/^\s*\|\|/, '').trim();
        }
        // :: #600
        const rowEndMatch = searchText.match(ROW_RANGE_REGEX);
        if (rowEndMatch) {
          rowEnd = parseInt(rowEndMatch[2], 10);
          searchText = searchText.replace(ROW_RANGE_REGEX, '').replace(/\|\|\s*$/, '').replace(/^\s*\|\|/, '').trim();
        }
      }
    }

    // Extract gap filter if present
    let gapThreshold = 0;
    const gapMatch = filters.searchText.match(GAP_PATTERN);
    if (gapMatch) {
      gapThreshold = parseFloat(gapMatch[1]) || 0;
      // Remove gap pattern from search text
      searchText = searchText.replace(GAP_PATTERN, '').replace(/\|\|\s*\|\|/g, '||').replace(/^\s*\|\|/, '').replace(/\|\|\s*$/, '').trim();
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

    return {
      includeTerms,
      excludeTerms,
      includeRegexes,
      excludeRegexes,
      rowStart,
      rowEnd,
      dateStart,
      dateEnd,
      gapThreshold
    };
  }, [filters.searchText]);

  const filteredLogs = useMemo(() => {
    if (!logs.length) return [];

    const matchingLogIndices = [];

    // Pre-lowercase all messages once for performance
    const lowerMessages = logs.map(log => log.message.toLowerCase());

    logs.forEach((log, index) => {
      if (searchData) {
        const { includeTerms, excludeTerms, includeRegexes, excludeRegexes, rowStart, rowEnd, dateStart, dateEnd, gapThreshold } = searchData;
        const message = lowerMessages[index];

        // Range filtering: handle date, row, and mixed ranges
        // Row start filter: check if log line number is >= rowStart
        if (rowStart !== null && log.lineNumber < rowStart) return;

        // Row end filter: check if log line number is <= rowEnd
        if (rowEnd !== null && log.lineNumber > rowEnd) return;

        // Date start filter: check if log timestamp is >= dateStart
        if (dateStart && log.timestamp) {
          const logTime = normalizeTimestamp(log.timestamp);
          if (logTime) {
            const startTime = normalizeTimestamp(dateStart);
            if (startTime && logTime < startTime) return;
          }
        }

        // Date end filter: check if log timestamp is <= dateEnd
        if (dateEnd && log.timestamp) {
          const logTime = normalizeTimestamp(log.timestamp);
          if (logTime) {
            const endTime = normalizeTimestamp(dateEnd);
            if (endTime && logTime > endTime) return;
          }
        }

        // Gap filter: check if this log has the required time gap from previous log
        // Use pre-parsed timestampMs for performance
        if (gapThreshold > 0 && index > 0) {
          const currentTime = log.timestampMs;
          const previousTime = logs[index - 1].timestampMs;

          if (currentTime && previousTime) {
            const gapSeconds = Math.abs(currentTime - previousTime) / 1000;
            if (gapSeconds < gapThreshold) return; // Skip if gap is less than threshold
          } else {
            return; // Skip if we can't parse timestamps
          }
        }

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
      
      // Log level filter - support multiple levels using LOG_LEVEL_MATRIX
      if (!filters.logLevel.includes('all')) {
        if (!log.level) return; // Skip logs without a level
        
        // Find which normalized level this log belongs to using LOG_LEVEL_MATRIX
        const normalizedLogLevel = LOG_LEVEL_MATRIX.find(levelGroup => 
          levelGroup.some(variant => 
            variant.toLowerCase().trim() === log.level.toLowerCase().trim()
          )
        )?.[0]; // Get the first element (normalized name) from the matching group
        
        // Check if the normalized log level matches any selected filter
        if (!normalizedLogLevel || !filters.logLevel.includes(normalizedLogLevel)) {
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

  const scrollToLog = useCallback((lineNumber, sourceFile = null) => {
    try {
      // Find the log with the given line number (and sourceFile if provided) in filtered logs
      const targetLogIndex = filteredLogs.findIndex(log => {
        const lineMatch = log.lineNumber === lineNumber;
        // If sourceFile is provided, also match by sourceFile
        if (sourceFile) {
          return lineMatch && log.sourceFile === sourceFile;
        }
        return lineMatch;
      });

      if (targetLogIndex !== -1) {
        // Log is visible - scroll to it
        const targetLog = filteredLogs[targetLogIndex];

        setTimeout(() => {
          const scrollEvent = new CustomEvent('scrollToLogIndex', {
            detail: { index: targetLogIndex, logId: targetLog.id, shouldHighlight: true }
          });
          window.dispatchEvent(scrollEvent);
        }, 100);
      } else {
        // Log is not visible due to filtering - find it in all logs first
        const targetLogInAll = logs.find(log => {
          const lineMatch = log.lineNumber === lineNumber;
          if (sourceFile) {
            return lineMatch && log.sourceFile === sourceFile;
          }
          return lineMatch;
        });

        if (targetLogInAll) {
          // Find the closest visible log in filtered logs
          let closestIndex = -1;
          let minDistance = Infinity;

          filteredLogs.forEach((log, index) => {
            const distance = Math.abs(log.lineNumber - lineNumber);
            if (distance < minDistance) {
              minDistance = distance;
              closestIndex = index;
            }
          });

          if (closestIndex !== -1) {
            // Scroll to closest visible log and show notification
            setTimeout(() => {
              const scrollEvent = new CustomEvent('scrollToLogIndex', {
                detail: { index: closestIndex, logId: filteredLogs[closestIndex].id, shouldHighlight: true }
              });
              window.dispatchEvent(scrollEvent);

              // Show notification that target log is not visible
              const notificationEvent = new CustomEvent('showLogNotVisible', {
                detail: {
                  lineNumber: lineNumber,
                  message: `Log line ${lineNumber} is not visible due to current filters. Scrolled to nearest visible log.`
                }
              });
              window.dispatchEvent(notificationEvent);
            }, 100);
          }
        } else {
          // Log doesn't exist
          console.warn(`Log line ${lineNumber} not found`);
        }
      }
    } catch (error) {
      console.error('Error scrolling to log:', error);
    }
  }, [logs, filteredLogs]);

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
    // Highlight persists until manually cleared or another log is highlighted
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
        searchQuery: '',
        searchText: '',
        logLevel: ['all'],
        contextLines: 0
      }; const fileFilters = allFileFilters[fileName];
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
      contextLines: 0
    };

    const fileFilters = allFileFilters[fileName];
    setFilters(fileFilters ? { ...fileFilters } : defaultFilters);

    setLogs(fileLogs);
    setSelectedLog(null);
    setHighlightedLogId(null);
  }, [allFileLogs, allFileFilters]);

  // Remove logs for a specific file (when closing a tab)
  const removeLogsForFile = useCallback((fileName) => {
    setAllFileLogs(prev => {
      const newLogs = { ...prev };
      delete newLogs[fileName];
      return newLogs;
    });
  }, []);

  // Clear all saved filters from localStorage
  const clearSavedFilters = useCallback(() => {
    try {
      localStorage.removeItem('logViewerFilters');
      setAllFileFilters({});
    } catch (error) {
      console.error('Failed to clear saved filters:', error);
    }
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
    stickyLogs,
    loadLogs,
    requestFileLoad,
    isFileLoading,
    setSelectedLog,
    updateFilters,
    highlightLog,
    clearHighlight,
    getCurrentFileHeaders,
    setLogsForFile,
    setLogFileHeaders,
    switchToFile,
    removeLogsForFile,
    clearSavedFilters,
    addStickyLog,
    removeStickyLog,
    clearAllStickyLogs,
    scrollToLog
  };
};

export default useLogsModel;
export { getFileIdentifier, getFileDisplayName, getFileFullName };