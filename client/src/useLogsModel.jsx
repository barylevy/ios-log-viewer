import { useState, useCallback, useMemo, useEffect } from 'react';
import { LOG_LEVEL_MATRIX } from './constants';
import {
  getFileIdentifier,
  getFileDisplayName,
  getFileFullName,
  loadLogFile,
  parseHeaderInfo
} from './utils/fileLoader';
import {
  DATE_RANGE_REGEX,
  DATE_START_REGEX,
  DATE_BOTH_REGEX,
  ROW_RANGE_REGEX,
  ROW_START_REGEX,
  ROW_BOTH_REGEX,
  ROW_TO_DATE_REGEX,
  DATE_TO_ROW_REGEX,
  extractTimestamp,
  extractTimeGapFromSearch,
  GAP_PATTERN,
  extractLogLevel,
  extractModule,
  extractThread,
  extractProcess,
  normalizeTimestamp,
  parseLogLine,
  parseLogContent,
  parseLogFormat,
  parseWindowsLogFormat
} from './utils/logParsingUtils';

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
  const stickyLogs = useMemo(() => {
    if (!currentFileName) return [];
    
    // For "Combined Files" (All Tabs), collect sticky logs from ALL files
    if (currentFileName === 'Combined Files') {
      const allSticky = [];
      
      // Iterate through all files and collect their sticky logs
      Object.entries(allFileStickyLogs).forEach(([fileName, stickyLogsArray]) => {
        if (fileName !== 'Combined Files' && stickyLogsArray && stickyLogsArray.length > 0) {
          // Add source file info to each sticky log
          stickyLogsArray.forEach(stickyLog => {
            allSticky.push({
              ...stickyLog,
              sourceFile: fileName // Add source file so we know which tab it came from
            });
          });
        }
      });
      
      // Sort by timestamp or line number
      allSticky.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return a.timestamp.localeCompare(b.timestamp);
        }
        if (a.lineNumber && b.lineNumber) {
          return a.lineNumber - b.lineNumber;
        }
        return 0;
      });
      
      return allSticky;
    }
    
    // For regular files/groups, return only their sticky logs
    return allFileStickyLogs[currentFileName] || [];
  }, [allFileStickyLogs, currentFileName]);

  const addStickyLog = useCallback((log) => {
    if (!currentFileName) return;

    try {
      setAllFileStickyLogs(prev => {
        const currentFileStickyLogs = prev[currentFileName] || [];

        // Avoid duplicates
        if (currentFileStickyLogs.find(sticky => sticky.id === log.id)) {
          return prev;
        }

        const newStickyLog = {
          id: log.id,
          lineNumber: log.lineNumber,
          timestamp: log.timestamp,
          level: log.level,
          message: log.message ? log.message.substring(0, 50) + (log.message.length > 50 ? '...' : '') : 'No message',
          cleanedMessage: log.cleanedMessage || log.message || 'No message'
        };

        return {
          ...prev,
          [currentFileName]: [...currentFileStickyLogs, newStickyLog]
        };
      });
    } catch (error) {
      console.error('Error adding sticky log:', error);
    }
  }, [currentFileName]);

  const removeStickyLog = useCallback((logId) => {
    if (!currentFileName) return;

    setAllFileStickyLogs(prev => {
      const currentFileStickyLogs = prev[currentFileName] || [];
      const updatedFileStickyLogs = currentFileStickyLogs.filter(sticky => sticky.id !== logId);

      return {
        ...prev,
        [currentFileName]: updatedFileStickyLogs
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

  // Internal: load logs for a file object (async)
  const loadLogs = useCallback((fileOrFiles, groupId = null) => {
    // Handle both single file and array of files (for grouped files)
    const isFileArray = Array.isArray(fileOrFiles);
    
    if (isFileArray) {
      // Load multiple files and combine their logs into ONE model
      const filePromises = fileOrFiles.map(file => loadLogFile(file, parseLogContent));
      
      Promise.all(filePromises)
        .then(results => {
          // Combine ALL logs from all files into one array
          let combinedLogs = [];
          let combinedHeaders = {};
          
          results.forEach(({ fileId, logs, headerData }) => {
            // Add logs to combined array, tagging each with its source file ID
            const logsWithSource = logs.map(log => ({
              ...log,
              sourceFile: fileId // Tag with original file ID for sticky log matching
            }));
            combinedLogs = combinedLogs.concat(logsWithSource);
            
            // Merge headers (first file's headers take precedence)
            if (Object.keys(combinedHeaders).length === 0 && headerData) {
              combinedHeaders = headerData;
            }
          });
          
          // Sort combined logs by timestamp
          combinedLogs.sort((a, b) => {
            if (a.timestamp && b.timestamp) {
              return a.timestamp.localeCompare(b.timestamp);
            }
            if (a.lineNumber && b.lineNumber) {
              return a.lineNumber - b.lineNumber;
            }
            return 0;
          });
          
          // Store the combined logs under the GROUP ID (not individual files)
          const storeId = groupId || results[0]?.fileId;
          setAllFileLogs(prev => ({ ...prev, [storeId]: combinedLogs }));
          
          if (Object.keys(combinedHeaders).length > 0) {
            setLogFileHeaders(prev => ({ ...prev, [storeId]: combinedHeaders }));
          }
          
          // Set as current logs
          setLogs(combinedLogs);
          setSelectedLog(null);
          setHighlightedLogId(null);
          setCurrentFileName(storeId);
          
          // Clear loading state
          setFileLoadingState(prev => {
            const newState = { ...prev };
            if (groupId) {
              newState[groupId] = false;
            }
            fileOrFiles.forEach(file => {
              newState[getFileIdentifier(file)] = false;
            });
            return newState;
          });
        })
        .catch(error => {
          console.error('Error loading files:', error);
          setFileLoadingState(prev => {
            const newState = { ...prev };
            if (groupId) {
              newState[groupId] = false;
            }
            fileOrFiles.forEach(file => {
              newState[getFileIdentifier(file)] = false;
            });
            return newState;
          });
        });
    } else {
      // Single file - existing logic
      const file = fileOrFiles;
      const fileId = getFileIdentifier(file);
      // Mark loading as started
      setFileLoadingState(prev => ({ ...prev, [fileId]: true }));
      
      loadLogFile(file, parseLogContent)
        .then(({ fileId, logs, headerData }) => {
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
          
          setAllFileLogs(prev => ({ ...prev, [fileId]: logs }));
          setLogs(logs);
          setSelectedLog(null);
          setHighlightedLogId(null);
          setCurrentFileName(fileId);
          setFileLoadingState(prev => ({ ...prev, [fileId]: false }));
        })
        .catch(error => {
          console.error('Error loading file:', error);
          setFileLoadingState(prev => ({ ...prev, [fileId]: false }));
        });
    }
  }, []);

  // Request file load if not loaded yet
  const requestFileLoad = useCallback((fileId, fileObj) => {
    const isFileArray = Array.isArray(fileObj);
    
    if (isFileArray) {
      // For grouped files, check if any of the individual files are already loaded
      const allFilesLoaded = fileObj.every(file => {
        const individualFileId = getFileIdentifier(file);
        return allFileLogs[individualFileId];
      });
      
      const anyFileLoading = fileObj.some(file => {
        const individualFileId = getFileIdentifier(file);
        return fileLoadingState[individualFileId];
      });
      
      if (!allFilesLoaded && !anyFileLoading) {
        // Mark the group as loading
        setFileLoadingState(prev => {
          const newState = { ...prev, [fileId]: true };
          fileObj.forEach(file => {
            newState[getFileIdentifier(file)] = true;
          });
          return newState;
        });
        // Pass the group ID to loadLogs so it can clear the loading state
        loadLogs(fileObj, fileId);
      }
    } else {
      // Single file
      if (!allFileLogs[fileId] && !fileLoadingState[fileId]) {
        loadLogs(fileObj);
      }
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
        if (gapThreshold > 0 && index > 0) {
          const currentTime = parseTimestampToMs(log.timestamp || log.message);
          const previousTime = parseTimestampToMs(logs[index - 1].timestamp || logs[index - 1].message);

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

  const scrollToLog = useCallback((lineNumber) => {
    try {
      // Find the log with the given line number in filtered logs (what's actually displayed)
      const targetLogIndex = filteredLogs.findIndex(log => log.lineNumber === lineNumber);

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
        const targetLogInAll = logs.find(log => log.lineNumber === lineNumber);

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
    getFileDisplayName: (fileId) => getFileDisplayName(fileId), // Use imported function
    getFileFullName: (fileId) => getFileFullName(fileId), // Use imported function
    addStickyLog,
    removeStickyLog,
    clearAllStickyLogs,
    scrollToLog
  };
};

export default useLogsModel;
export { getFileIdentifier, getFileDisplayName, getFileFullName };