import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  // Mirror of currentFileName accessible inside async callbacks (e.g. the
  // file-load .then handlers) without making them stale-closure dependent.
  const currentFileNameRef = useRef(null);
  useEffect(() => { currentFileNameRef.current = currentFileName; }, [currentFileName]);
  const [filters, setFilters] = useState(() => {
    // Initialize with localStorage values for modes
    const filterMode = localStorage.getItem('logViewer_filterMode') || 'text';
    const searchMode = localStorage.getItem('logViewer_searchMode') || 'text';
    const filterCaseSensitive = localStorage.getItem('logViewer_filterCaseSensitive') === 'true';
    const searchCaseSensitive = localStorage.getItem('logViewer_searchCaseSensitive') === 'true';
    
    return {
      searchText: '',
      searchQuery: '',
      logLevel: ['all'], // Array to support multiple levels
      selectedModule: 'all',
      contextLines: 0,
      filterMode, // 'text' or 'regex'
      searchMode,  // 'text' or 'regex'
      filterCaseSensitive,
      searchCaseSensitive
    };
  });

  // Load filters when current file changes
  useEffect(() => {
    if (currentFileName && allFileFilters[currentFileName]) {
      // Merge with current modes from localStorage to ensure they're always present
      const filterMode = localStorage.getItem('logViewer_filterMode') || 'text';
      const searchMode = localStorage.getItem('logViewer_searchMode') || 'text';
      const filterCaseSensitive = localStorage.getItem('logViewer_filterCaseSensitive') === 'true';
      const searchCaseSensitive = localStorage.getItem('logViewer_searchCaseSensitive') === 'true';
      
      setFilters({
        selectedModule: 'all',
        ...allFileFilters[currentFileName],
        filterMode,
        searchMode,
        filterCaseSensitive,
        searchCaseSensitive
      });
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
          // Add source file info to each sticky log.
          // Preserve the original sourceFile when present (e.g. grouped tabs
          // store the actual filename inside the group); fall back to the
          // tab's fileName so single-file tabs still resolve correctly.
          stickyLogsArray.forEach(stickyLog => {
            allSticky.push({
              ...stickyLog,
              sourceFile: stickyLog.sourceFile || fileName
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
          cleanedMessage: log.cleanedMessage || log.message || 'No message',
          sourceFile: log.sourceFile // Save source file for multi-file navigation
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
      // In the combined "All Files" view, the sticky lives in its original
      // per-file bucket — search every bucket and remove from wherever it is.
      if (currentFileName === 'Combined Files') {
        const next = { ...prev };
        Object.keys(next).forEach(fileName => {
          if (fileName === 'Combined Files') return;
          const list = next[fileName] || [];
          if (list.some(sticky => sticky.id === logId)) {
            next[fileName] = list.filter(sticky => sticky.id !== logId);
          }
        });
        return next;
      }

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
      // In the combined "All Files" view, clearing should empty every
      // per-file bucket so all stickies disappear.
      if (currentFileName === 'Combined Files') {
        const next = {};
        Object.keys(prev).forEach(fileName => {
          next[fileName] = [];
        });
        return next;
      }

      return {
        ...prev,
        [currentFileName]: []
      };
    });
  }, [currentFileName]);

  const updateStickyLogTitle = useCallback((logId, newTitle) => {
    if (!currentFileName) return;

    setAllFileStickyLogs(prev => {
      const currentFileStickyLogs = prev[currentFileName] || [];
      const updatedFileStickyLogs = currentFileStickyLogs.map(sticky => 
        sticky.id === logId ? { ...sticky, title: newTitle } : sticky
      );

      return {
        ...prev,
        [currentFileName]: updatedFileStickyLogs
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
          
          results.forEach(({ fileId, logs, headerData }, fileIndex) => {
            // Add logs to combined array, tagging each with its source file ID and original sequence
            const logsWithSource = logs.map((log, logIndex) => ({
              ...log,
              sourceFile: fileId, // Tag with original file ID for sticky log matching
              originalFileIndex: fileIndex, // Track which file this came from
              originalLogIndex: logIndex, // Track position within original file
              originalId: log.id // Save original ID before we change it
            }));
            combinedLogs = combinedLogs.concat(logsWithSource);
            
            // Merge headers (first file's headers take precedence)
            if (Object.keys(combinedHeaders).length === 0 && headerData) {
              combinedHeaders = headerData;
            }
          });
          
          // Sort combined logs by timestamp, but keep continuation lines with their parent
          // Strategy: separate normal logs from continuation logs, sort normal logs, then insert continuations
          const normalLogs = [];
          const continuationsByParent = new Map(); // Map of "fileIndex:originalId" to continuation logs
          
          combinedLogs.forEach(log => {
            if (log.isContinuation && log.parentLogId !== undefined) {
              // Create unique key using file index and parent's original ID
              const key = `${log.originalFileIndex}:${log.parentLogId}`;
              if (!continuationsByParent.has(key)) {
                continuationsByParent.set(key, []);
              }
              continuationsByParent.get(key).push(log);
            } else {
              normalLogs.push(log);
            }
          });
          
          // Sort only normal logs by timestamp, then by file order, then by original position
          normalLogs.sort((a, b) => {
            // Primary sort: by timestamp
            if (a.timestampMs && b.timestampMs && a.timestampMs !== b.timestampMs) {
              return a.timestampMs - b.timestampMs;
            }
            if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) {
              return a.timestamp.localeCompare(b.timestamp);
            }
            // Secondary sort: by file order
            if (a.originalFileIndex !== b.originalFileIndex) {
              return a.originalFileIndex - b.originalFileIndex;
            }
            // Tertiary sort: by position within file
            return a.originalLogIndex - b.originalLogIndex;
          });
          
          // Rebuild combined logs: insert continuation logs right after their parent
          combinedLogs = [];
          let newLogId = 0;
          normalLogs.forEach(log => {
            // Update log ID for the new sorted order
            log.id = newLogId++;
            combinedLogs.push(log);
            
            // Insert continuation logs right after this parent
            // Use the original file index and original ID to find continuations
            const key = `${log.originalFileIndex}:${log.originalId}`;
            const continuations = continuationsByParent.get(key) || [];
            continuations.forEach(contLog => {
              contLog.id = newLogId++;
              contLog.parentLogId = log.id; // Update parent reference to new ID
              combinedLogs.push(contLog);
            });
          });
          
          // Store the combined logs under the GROUP ID (not individual files)
          const storeId = groupId || results[0]?.fileId;
          setAllFileLogs(prev => ({ ...prev, [storeId]: combinedLogs }));
          
          if (Object.keys(combinedHeaders).length > 0) {
            setLogFileHeaders(prev => ({ ...prev, [storeId]: combinedHeaders }));
          }

          // Only swap the visible logs/selection if the user is on this tab
          // (or hasn't picked one yet). Otherwise we'd clobber a click made
          // in another tab — e.g. while "All Files" is showing.
          const activeTab = currentFileNameRef.current;
          if (!activeTab || activeTab === storeId) {
            setLogs(combinedLogs);
            setSelectedLog(null);
            setHighlightedLogId(null);
            setCurrentFileName(storeId);
          }
          
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
          // Only swap the visible logs/selection if the user is on this tab
          // (or hasn't picked one yet). Avoids clobbering selection while
          // "All Files" or another tab is active.
          const activeTab = currentFileNameRef.current;
          if (!activeTab || activeTab === fileId) {
            setLogs(logs);
            setSelectedLog(null);
            setHighlightedLogId(null);
            setCurrentFileName(fileId);
          }
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

  // True while any file is currently being loaded
  const isAnyFileLoading = useMemo(
    () => Object.values(fileLoadingState).some(Boolean),
    [fileLoadingState]
  );

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

    // Parse expression supporting || (OR) and && (AND) with parentheses.
    // Split by || respecting parentheses, then split each OR group by &&.
    // Spaces adjacent to operators are stripped; trailing spaces within a term are preserved
    // so that e.g. "app " (with space) matches "App success" but not "sendAppIsRegister".
    const splitByOr = (text) => {
      const groups = [];
      let depth = 0;
      let current = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '(') { depth++; current += ch; }
        else if (ch === ')') { depth--; current += ch; }
        else if (ch === '|' && text[i + 1] === '|' && depth === 0) {
          groups.push(current.trimEnd()); // strip trailing space adjacent to ||
          current = '';
          i++; // skip second |
          // skip leading spaces adjacent to ||
          while (i + 1 < text.length && text[i + 1] === ' ') i++;
        } else {
          current += ch;
        }
      }
      // Preserve both leading and trailing spaces in the last segment (may be intentional search criteria),
      // but skip if the segment is entirely whitespace
      if (current.trim()) groups.push(current);
      return groups.filter(Boolean);
    };

    const buildRegex = (term) => {
      try {
        const flags = filters.filterCaseSensitive ? '' : 'i';
        if (filters.filterMode === 'regex') {
          return new RegExp(term, flags);
        } else {
          return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
        }
      } catch (e) {
        console.error('Invalid regex pattern:', term, e);
        return null;
      }
    };

    // Strip outer double-quotes for exact phrase matching — preserves internal spaces.
    // e.g. "app " || moshe  →  /app /i  OR  /moshe/i
    const unquote = (t) =>
      t.startsWith('"') && t.endsWith('"') && t.length >= 2 ? t.slice(1, -1) : t;

    const orSegments = splitByOr(searchText);
    const includeGroups = []; // each entry = { terms: [...], regexes: [...] }
    const excludeTerms = [];
    const excludeRegexes = [];

    orSegments.forEach(segment => {
      // Strip outer parentheses
      let inner = segment;
      if (inner.startsWith('(') && inner.endsWith(')')) {
        inner = inner.slice(1, -1).trim();
      }
      // Split by && within this OR group
      // Strip spaces adjacent to && operators, but preserve the spaces within a standalone term
      const andTerms = inner.split('&&').map((t, idx, arr) => {
        if (arr.length === 1) return t; // No &&: preserve term exactly as typed
        if (idx < arr.length - 1) return t.trim(); // Non-last: strip both sides (adjacent to &&)
        return t.trimStart(); // Last: strip leading (adjacent to &&), preserve trailing
      }).filter(t => t.trim());
      // Unquote after splitting so "app " keeps its internal space
      const inclTerms = andTerms.filter(t => !t.trimStart().startsWith('!')).map(unquote);
      const exclTerms = andTerms.filter(t => t.trimStart().startsWith('!')).map(t => unquote(t.trimStart().slice(1)));

      exclTerms.forEach(term => {
        excludeTerms.push(term);
        excludeRegexes.push(buildRegex(term));
      });

      if (inclTerms.length > 0) {
        includeGroups.push({
          terms: inclTerms,
          regexes: inclTerms.map(buildRegex)
        });
      }
    });

    // Flat list of all include terms (for backwards-compat where needed)
    const includeTerms = includeGroups.flatMap(g => g.terms);

    return {
      includeGroups,
      includeTerms,
      excludeTerms,
      excludeRegexes,
      rowStart,
      rowEnd,
      dateStart,
      dateEnd,
      gapThreshold
    };
  }, [filters.searchText, filters.filterMode, filters.filterCaseSensitive]);

  const filteredLogs = useMemo(() => {
    if (!logs.length) return [];

    const matchingLogIndices = [];

    // Helper function to get all searchable text from a log entry
    const getSearchableText = (log) => {
      const parts = [
        log.message || '',
        log.timestamp || '',
        log.level || '',
        log.module || '',
        log.thread || '',
        log.process || '',
        log.processName || '',
        log.lineNumber?.toString() || ''
      ];
      return parts.join(' ');
    };

    // Pre-lowercase all searchable text once for performance (for text mode)
    const lowerTexts = logs.map(log => getSearchableText(log).toLowerCase());

    logs.forEach((log, index) => {
      if (searchData) {
        const { includeGroups, excludeTerms, excludeRegexes, rowStart, rowEnd, dateStart, dateEnd, gapThreshold } = searchData;
        const searchableText = getSearchableText(log);
        const lowerText = lowerTexts[index];

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
          if (regex) {
            // In regex mode, test against full searchable text
            return regex.test(searchableText);
          }
          // In text mode, case-sensitive or insensitive comparison
          if (filters.filterCaseSensitive) return searchableText.includes(term);
          return lowerText.includes(term.toLowerCase());
        });
        if (isExcluded) return;

        // Include logic: if there are include groups, at least one group must fully match (AND within group, OR between groups)
        if (includeGroups.length > 0) {
          const matchesAnyGroup = includeGroups.some(group =>
            group.terms.every((term, i) => {
              const regex = group.regexes[i];
              if (regex) return regex.test(searchableText);
              if (filters.filterCaseSensitive) return searchableText.includes(term);
              return lowerText.includes(term.toLowerCase());
            })
          );
          if (!matchesAnyGroup) return;
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

      // Module filter
      if (filters.selectedModule && filters.selectedModule !== 'all') {
        const logModule = (log.module || '').trim();
        if (logModule !== filters.selectedModule) {
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

  const moduleOptions = useMemo(() => {
    if (!logs.length) return [];

    return Array.from(
      new Set(
        logs
          .map(log => (log.module || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [logs]);

  const scrollToLog = useCallback((lineNumber, sourceFile = null) => {
    try {
      // Find the log with the given line number (and optionally sourceFile) in filtered logs
      const targetLogIndex = filteredLogs.findIndex(log => {
        if (sourceFile) {
          // When sourceFile is provided, match both lineNumber and sourceFile
          return log.lineNumber === lineNumber && log.sourceFile === sourceFile;
        } else {
          // Without sourceFile, match only lineNumber (backward compatibility)
          return log.lineNumber === lineNumber;
        }
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
      } else if (sourceFile) {
        // If sourceFile was provided but not found, try without sourceFile as fallback
        const fallbackIndex = filteredLogs.findIndex(log => log.lineNumber === lineNumber);
        
        if (fallbackIndex !== -1) {
          const targetLog = filteredLogs[fallbackIndex];
          
          setTimeout(() => {
            const scrollEvent = new CustomEvent('scrollToLogIndex', {
              detail: { index: fallbackIndex, logId: targetLog.id, shouldHighlight: true }
            });
            window.dispatchEvent(scrollEvent);
          }, 100);
        }
      } else {
        // Log is not visible due to filtering - find it in all logs first
        const targetLogInAll = logs.find(log => {
          if (sourceFile) {
            return log.lineNumber === lineNumber && log.sourceFile === sourceFile;
          } else {
            return log.lineNumber === lineNumber;
          }
        });

        if (targetLogInAll) {
          // Find the closest visible log in filtered logs
          let closestIndex = -1;
          let minDistance = Infinity;

          filteredLogs.forEach((log, index) => {
            // When sourceFile is specified, prefer logs from the same file
            const sameFile = sourceFile ? (log.sourceFile === sourceFile) : true;
            const distance = Math.abs(log.lineNumber - lineNumber);
            
            // Give priority to logs from the same file
            const adjustedDistance = sameFile ? distance : distance + 10000;
            
            if (adjustedDistance < minDistance) {
              minDistance = adjustedDistance;
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
                  message: `Log line ${lineNumber}${sourceFile ? ` from ${sourceFile}` : ''} is not visible due to current filters. Scrolled to nearest visible log.`
                }
              });
              window.dispatchEvent(notificationEvent);
            }, 100);
          }
        } else {
          // Log doesn't exist
          console.warn(`Log line ${lineNumber}${sourceFile ? ` from ${sourceFile}` : ''} not found`);
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

  const updateFiltersForAllFiles = useCallback((newFilters) => {
    // newFilters may contain a 'searchText' to append to each tab's existing searchText.
    // All other keys are merged directly.
    const mergeForFile = (existing) => {
      const merged = { ...existing, ...newFilters };
      if (newFilters.searchText !== undefined) {
        const cur = (existing.searchText || '').trim();
        merged.searchText = cur ? `${cur} && ${newFilters.searchText}` : newFilters.searchText;
      }
      return merged;
    };

    // Update the current active filter state
    setFilters(prev => {
      const updatedFilters = mergeForFile(prev);

      // Update allFileFilters for every loaded file
      setAllFileFilters(prevFileFilters => {
        const updated = { ...prevFileFilters };
        const allKeys = new Set([
          ...Object.keys(prevFileFilters),
          ...Object.keys(allFileLogs)
        ]);
        allKeys.forEach(fileId => {
          updated[fileId] = mergeForFile(prevFileFilters[fileId] || {});
        });
        // Also ensure the active tab's entry reflects the merged filters
        if (currentFileName) {
          updated[currentFileName] = updatedFilters;
        }
        return updated;
      });

      return updatedFilters;
    });
  }, [allFileLogs, currentFileName]);

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

      // Detect a true tab switch vs. a rebuild of the currently visible
      // view. We must not clear the user's selected log on a rebuild,
      // otherwise clicking a row in "All Files" closes its modal as soon as
      // the combined view rebuilds in response to the re-render.
      const isSwitching = currentFileName !== fileName;

      // Set current file name
      setCurrentFileName(fileName);

      if (isSwitching) {
        // Load filters for this file if they exist, otherwise use defaults
        const defaultFilters = {
          searchQuery: '',
          searchText: '',
          logLevel: ['all'],
          selectedModule: 'all',
          contextLines: 0
        };
        const fileFilters = allFileFilters[fileName];
        setFilters(fileFilters ? { ...defaultFilters, ...fileFilters } : defaultFilters);
      }

      setLogs(processedLogs);

      if (isSwitching) {
        setSelectedLog(null);
        setHighlightedLogId(null);
      }
    } catch (error) {
      console.error('❌ Error in setLogsForFile:', error);
    }
  }, [allFileFilters, currentFileName]);

  // Update logs for a file without switching the active tab (used for live background updates)
  const updateLogsBackground = useCallback((fileName, fileLogs) => {
    setAllFileLogs(prev => ({ ...prev, [fileName]: fileLogs }));
    // If this file happens to be the one currently on screen, refresh the visible list too
    if (currentFileNameRef.current === fileName) {
      setLogs(fileLogs);
    }
  }, []);

  // Switch to show logs for a specific file
  const switchToFile = useCallback((fileName) => {
    const fileLogs = allFileLogs[fileName] || [];

    // Set current file name
    setCurrentFileName(fileName);

    // Load filters for this file if they exist, otherwise use default filters
    const defaultFilters = {
      searchText: '',
      logLevel: ['all'],
      selectedModule: 'all',
      contextLines: 0
    };

    const fileFilters = allFileFilters[fileName];
    setFilters(fileFilters ? { ...defaultFilters, ...fileFilters } : defaultFilters);

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

  // Reset the entire model — used when closing all tabs.
  const resetModel = useCallback(() => {
    setLogs([]);
    setSelectedLog(null);
    setHighlightedLogId(null);
    setLogFileHeaders({});
    setAllFileLogs({});
    setAllFileStickyLogs({});
    setCurrentFileName(null);
    setFileLoadingState({});
    setFilters(prev => ({
      ...prev,
      searchText: '',
      searchQuery: '',
      logLevel: ['all'],
      selectedModule: 'all',
      contextLines: 0,
    }));
  }, []);

  return {
    logs,
    filteredLogs,
    moduleOptions,
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
    isAnyFileLoading,
    setSelectedLog,
    updateFilters,
    updateFiltersForAllFiles,
    highlightLog,
    clearHighlight,
    getCurrentFileHeaders,
    setLogsForFile,
    updateLogsBackground,
    setLogFileHeaders,
    switchToFile,
    removeLogsForFile,
    clearSavedFilters,
    resetModel,
    getFileDisplayName: (fileId) => getFileDisplayName(fileId), // Use imported function
    getFileFullName: (fileId) => getFileFullName(fileId), // Use imported function
    addStickyLog,
    removeStickyLog,
    clearAllStickyLogs,
    updateStickyLogTitle,
    scrollToLog
  };
};

export default useLogsModel;
export { getFileIdentifier, getFileDisplayName, getFileFullName };