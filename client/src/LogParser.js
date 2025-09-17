import { 
  extractTimestamp, 
  parseTimestampToMs, 
  extractTimeGapFromSearch, 
  extractDateFromTimestamp,
  GAP_PATTERN 
} from './dateTimeUtils';
import { LOG_LEVEL_MATRIX } from './constants';

/**
 * Log parsing utilities - handles parsing of different log formats including iOS and Windows
 */

/**
 * Extract log level from a log line
 * @param {string} line - The log line to parse
 * @returns {string} - The log level (info, warning, error, etc.)
 */
export const extractLogLevel = (line) => {
  for (const [level, ...patterns] of LOG_LEVEL_MATRIX) {
    for (const pattern of patterns) {
      if (line.includes(pattern)) return level;
    }
  }
  return 'info';
};

/**
 * Extract module/component name from a log line
 * @param {string} line - The log line to parse
 * @returns {string} - The module name or empty string
 */
export const extractModule = (line) => {
  // Try to extract module/component name from brackets
  const moduleMatch = line.match(/\[([^\]]+)\]/);
  return moduleMatch ? moduleMatch[1] : '';
};

/**
 * Extract thread ID from a log line
 * @param {string} line - The log line to parse
 * @returns {string} - The thread ID or empty string
 */
export const extractThread = (line) => {
  // For iOS log format: try to extract the first bracketed number as thread ID
  // Pattern: [module:line] [thread] [process]
  const bracketNumbers = line.match(/\[(\d+)\]/g);
  if (bracketNumbers && bracketNumbers.length >= 1) {
    // Extract the first bracketed number (thread ID)
    const firstNumber = bracketNumbers[0].match(/\[(\d+)\]/);
    if (firstNumber) {
      return firstNumber[1];
    }
  }

  // Fallback: Try to extract thread ID - look for patterns like thread:12345
  const threadMatch = line.match(/(?:thread[:\s]*)?(\d+)(?:\]|$|\s)/i);
  return threadMatch ? threadMatch[1] : '';
};

/**
 * Extract process ID from a log line
 * Supports multiple formats:
 * - iOS format: [module:line] [thread] [process]
 * - Windows format 1: [processId:threadId] (combined)
 * - Windows format 2: [processId] [threadId] (separate)
 * - Generic: pid:12345, process:12345, [pid:12345]
 * @param {string} line - The log line to parse
 * @returns {string} - The process ID or process:thread combination
 */
export const extractProcess = (line) => {
  // Try to extract process ID - look for patterns like pid:12345, process:12345, or [pid:12345]
  const processMatch = line.match(/(?:pid|process)[:\s]*(\d+)/i) ||
    line.match(/\[(?:pid|process)[:\s]*(\d+)\]/i);
  if (processMatch) {
    return processMatch[1];
  }

  // Windows format variation 1: [processId:threadId] - extract both parts
  // Pattern matches hex or decimal numbers: [5938:4BE8] or [1234:5678]
  const windowsMatch1 = line.match(/\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]/);
  if (windowsMatch1) {
    const processId = windowsMatch1[1];
    const threadId = windowsMatch1[2];
    return `${processId}:${threadId}`;
  }

  // Windows format variation 2: [processId] [threadId] - separate brackets
  // Look for pattern: [level] [module] [processId] [threadId] [file:line]
  const windowsMatch2 = line.match(/\[[^\]]+\]\s+\[[^\]]+\]\s+\[(\d+)\]\s+\[(\d+)\]\s+\[[^\]]+\]/);
  if (windowsMatch2) {
    const processId = windowsMatch2[1];
    const threadId = windowsMatch2[2];
    return `${processId}:${threadId}`;
  }

  // For iOS log format: try to extract the second bracketed number as process ID
  // Pattern: [module:line] [thread] [process]
  const bracketNumbers = line.match(/\[(\d+)\]/g);
  if (bracketNumbers && bracketNumbers.length >= 2) {
    // Extract the second bracketed number (process ID)
    const secondNumber = bracketNumbers[1].match(/\[(\d+)\]/);
    return secondNumber ? secondNumber[1] : '';
  }

  return '';
};

/**
 * Normalize timestamps for comparison
 * Handles multiple timestamp formats and converts them to Date objects
 * @param {string} timestamp - The timestamp string to normalize
 * @returns {Date|null} - The normalized Date object or null if invalid
 */
export const normalizeTimestamp = (timestamp) => {
  if (!timestamp) return null;

  try {
    let date;

    if (timestamp.includes('T')) {
      // ISO format from datetime-local: 2025-08-02T23:54:57
      date = new Date(timestamp);
    } else if (timestamp.includes('-') && timestamp.includes(' ')) {
      // Log format: 2025-08-02 23:54:57:514 or 2025-08-02 23:54:57
      // Handle milliseconds properly by converting to ISO format
      let isoTimestamp = timestamp.replace(' ', 'T');

      // If it has milliseconds in format HH:MM:SS:mmm, convert to HH:MM:SS.mmm
      if (isoTimestamp.match(/\d{2}:\d{2}:\d{2}:\d{3}$/)) {
        isoTimestamp = isoTimestamp.replace(/(\d{2}:\d{2}:\d{2}):(\d{3})$/, '$1.$2');
      }

      date = new Date(isoTimestamp);
    } else if (timestamp.includes('-') && !timestamp.includes(' ') && !timestamp.includes(':')) {
      // Date only format: 2025-07-04 - assume start of day (00:00:00)
      date = new Date(`${timestamp}T00:00:00`);
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

/**
 * Parse a single log line and extract all relevant information
 * @param {string} line - The log line to parse
 * @param {number} lineNumber - The line number in the file
 * @param {number} logId - The unique ID for this log entry
 * @returns {Object} - Parsed log object with all extracted information
 */
export const parseLogLine = (line, lineNumber, logId) => {
  const timestamp = extractTimestamp(line);
  
  return {
    id: logId,
    raw: line,
    message: line,
    timestamp: timestamp,
    level: extractLogLevel(line),
    module: extractModule(line),
    thread: extractThread(line),
    process: extractProcess(line),
    lineNumber: lineNumber,
    originalLineNumbers: [lineNumber]
  };
};

/**
 * Parse log file content and group lines by timestamp
 * @param {string} content - The raw log file content
 * @param {Array} headerLines - Array of line numbers that are headers (to skip)
 * @returns {Array} - Array of parsed log objects
 */
export const parseLogContent = (content, headerLines = []) => {
  const allLines = content.split('\n'); // Keep all lines including empty ones
  const logs = [];
  let currentLog = null;

  allLines.forEach((line, idx) => {
    if (!line.trim() || headerLines.includes(idx)) return;
    
    const hasTimestamp = extractTimestamp(line);
    
    if (hasTimestamp) {
      // Start a new log entry
      if (currentLog) logs.push(currentLog);
      currentLog = parseLogLine(line, idx + 1, logs.length);
    } else if (currentLog) {
      // Append to previous log's message, but increment line number
      currentLog.message += '\n' + line;
      currentLog.raw += '\n' + line;
      currentLog.originalLineNumbers.push(idx + 1);
    } else {
      // If the first line(s) have no timestamp, treat as a log
      currentLog = parseLogLine(line, idx + 1, logs.length);
    }
  });
  
  if (currentLog) logs.push(currentLog);
  return logs;
};

/**
 * Parse Windows log format variations for detailed component extraction
 * @param {string} line - The Windows log line to parse
 * @returns {Object|null} - Parsed components or null if not a valid Windows format
 */
export const parseWindowsLogFormat = (line) => {
  // Windows format variation 1: date time [level] [module] [process:thread] [function:line] [unknown] [unknown] [message]
  const pattern1 = /^(\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([0-9A-Fa-f]+:[0-9A-Fa-f]+)\]\s+\[([^\]]+)\]\s+\[([^\]]*)\]\s+\[([^\]]*)\]\s+\[(.*)$/;
  
  let match = line.match(pattern1);
  if (match) {
    return {
      format: 'windows-combined',
      dateTime: match[1],
      logLevel: match[2],
      moduleName: match[3].trim(),
      processThreadIds: match[4],
      fileNameLine: match[5].trim(),
      unknown1: match[6],
      unknown2: match[7],
      message: match[8]
    };
  }

  // Windows format variation 2: [date time] [level] [module] [processId] [threadId] [file:line] message
  const pattern2 = /^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[(\d+)\]\s+\[(\d+)\]\s+\[([^\]]+)\]\s+(.*)$/;
  
  match = line.match(pattern2);
  if (match) {
    return {
      format: 'windows-separate',
      dateTime: match[1],
      logLevel: match[2],
      moduleName: match[3].trim(),
      processId: match[4],
      threadId: match[5],
      fileName: match[6],
      message: match[7]
    };
  }

  return null;
};