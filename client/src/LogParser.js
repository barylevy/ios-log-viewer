import { 
  extractTimestamp, 
  extractTimeGapFromSearch, 
  formatDateWithMonthName,
  GAP_PATTERN 
} from './dateTimeUtils.js';
import { LOG_LEVEL_MATRIX } from './constants.js';
import { getProcessTypeFromModule } from './utils/processTypeMapper.js';

/**
 * Log parsing utilities - handles parsing of different log formats including iOS and Windows
 */

/**
 * Extract log level from a log line
 * Returns the original format when found in structured logs, null when not present
 * @param {string} line - The log line to parse
 * @returns {string|null} - The original log level format or null if not found
 */
export const extractLogLevel = (line) => {
  // Windows format with brackets: [Date] [Level] [Module] [ProcessId] [ThreadId] [File:Line]
  const windowsMatch = line.match(/^\[[\d\/]+\s[\d:.]+\]\s+\[([^\]]+)\]/);
  if (windowsMatch) {
    return windowsMatch[1]; // Return original format like "I", "W", "ERROR"
  }

  // Windows format without brackets: Date [Level] [Module] [ProcessId:ThreadId] [File:Line]
  const windowsNoBracketsMatch = line.match(/^\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+\[([^\]]+)\]/);
  if (windowsNoBracketsMatch) {
    return windowsNoBracketsMatch[1]; // Return original format like "W", "I", "E"
  }

  // Mac/iOS format: timestamp [module:line] [Level] [t:thread] [p:process]
  const macMatch = line.match(/\]\s+\[([DIWEVT])\]\s+\[t:/);
  if (macMatch) {
    return macMatch[1]; // Return original format like "D", "I", "W", "E"
  }

  // Android format: [date] [thread] [module] - [Level] - message
  const androidMatch = line.match(/\]\s+-\s+\[([DVWE])\]\s+-/);
  if (androidMatch) {
    return androidMatch[1]; // Return original format like "D", "V", "W", "E"
  }

  // Linux format: date [Level][module][function:line]
  const linuxMatch = line.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\[([DWIE])\]/);
  if (linuxMatch) {
    return linuxMatch[1]; // Return original format like "I", "W", "E", "D"
  }

  // Chrome format: [processId:threadId:timestamp:LEVEL:file]
  const chromeMatch = line.match(/^\[\d+:\d+:\d+\/\d+\.\d+:([A-Z]+):[^\]]+\]/);
  if (chromeMatch) {
    return chromeMatch[1]; // Return original format like "INFO", "WARNING", "ERROR"
  }

  // Check for various log level patterns and return original format
  const exactMatches = [
    { pattern: /\[Error\]/i, level: 'Error' },
    { pattern: /\[Warning\]/i, level: 'Warning' },
    { pattern: /\[Info\]/i, level: 'Info' },
    { pattern: /\[Debug\]/i, level: 'Debug' },
    { pattern: /\[Trace\]/i, level: 'Trace' },
    { pattern: /ERROR:/i, level: 'ERROR' },
    { pattern: /WARNING:/i, level: 'WARNING' },
    { pattern: /INFO:/i, level: 'INFO' },
    { pattern: /DEBUG:/i, level: 'DEBUG' }
  ];

  for (const {pattern, level} of exactMatches) {
    if (pattern.test(line)) {
      return level;
    }
  }

  // For Mac/iOS logs and other formats without explicit log levels, return null
  return null;
};

/**
 * Extract module/component name from a log line
 * Supports multiple formats:
 * - iOS/macOS format: [ModuleName:line] [thread] [process]
 * - Windows format: [level] [ModuleName] [processId] [threadId] [file:line]
 * - Linux format: [level][ModuleName][function:line][unknown][unknown][thread]
 * - Android format: [thread] [ModuleName] - [level] -
 * @param {string} line - The log line to parse
 * @returns {string} - The module name or empty string
 */
export const extractModule = (line) => {
  // Windows simple format (CatoClient trace): MM/DD/YY HH:MM:SS.SSS [ ] [          ] [PID:TID] message
  // This format has empty level and module fields - no module to extract
  const windowsSimpleMatch = line.match(/^\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s+\[\s*\]\s+\[\s*\]\s+\[[0-9A-Fa-f]+:[0-9A-Fa-f]+\]/);
  if (windowsSimpleMatch) {
    return ''; // No module in this format
  }

  // Windows format: date time [level] [module] [process:thread] ...
  // Extract module from the second bracket (after level)
  const windowsMatch = line.match(/^\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s+\[[^\]]+\]\s+\[([^\]]+)\]\s+\[[0-9A-Fa-f]+:[0-9A-Fa-f]+\]\s+\[/);
  if (windowsMatch) {
    return windowsMatch[1].trim();
  }

  // Chrome/Windows format: [processId:threadId:MMDD/HHMMSS.SSS:LEVEL:file.cc(line)]
  const chromeMatch = line.match(/^\[\d+:\d+:\d{4}\/\d{6}\.\d{3}:[A-Z]+:([^\]]+)\]/);
  if (chromeMatch) {
    const fileName = chromeMatch[1]; // Extract filename from the Chrome format
    // Extract just the filename without path and line number
    const fileNameOnly = fileName.split('/').pop().split('(')[0];
    return fileNameOnly.trim();
  }

  // Android format: [date] [thread] [domain] - [level] - message
  const androidMatch = line.match(/^\[[\w-]+\s[\d:.]+\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+-\s+\[[DWE]\]\s+-/);
  if (androidMatch) {
    const domain = androidMatch[2]; // Third bracket is the domain/module
    return domain.trim();
  }

  // Linux format: date [level][module][function:line][unknown][unknown][thread]
  const linuxMatch = line.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\[[DWIE]\]\[([^\]]+)\]\[[^\]]+\]/);
  if (linuxMatch) {
    const module = linuxMatch[1];
    return module.trim();
  }

  // Windows format variation 2: [date] [level] [module] [processId] [threadId] [file:line]
  const windowsBracketedMatch = line.match(/^\[[\d/]+\s[\d:.]+\]\s+\[[^\]]+\]\s+\[([^\]]+)\]\s+\[\d+\]\s+\[\d+\]\s+\[[^\]]+\]/);
  if (windowsBracketedMatch) {
    const module = windowsBracketedMatch[1];
    return module.trim();
  }

  // iOS/macOS format: [ModuleName:line] [thread] [process] - extract module with line number
  const iosModuleMatch = line.match(/\[([^:\]]+:\d+)\]/);
  if (iosModuleMatch) {
    return iosModuleMatch[1].trim();
  }

  // iOS/macOS/Windows format variation 1: Try to extract module/component name from brackets
  // This should be the first bracketed item that contains text (not just numbers)
  const moduleMatch = line.match(/\[([^\]]+)\]/);
  if (moduleMatch) {
    const potential = moduleMatch[1];
    // Skip if it's just numbers (likely thread/process ID)
    if (!/^\d+$/.test(potential) && !potential.includes(':')) {
      return potential;
    }
  }

  return '';
};

/**
 * Extract thread ID from a log line
 * Supports multiple formats:
 * - iOS/macOS format: [module:line] [thread] [process]
 * - Windows format: already handled in extractProcess
 * - Linux format: [level][module][function:line][unknown][unknown][thread]
 * - Android format: [thread] [module] - [level] -
 * @param {string} line - The log line to parse
 * @returns {string} - The thread ID or empty string
 */
export const extractThread = (line) => {
  // Mac/iOS explicit format: [module:line] [level] [t:thread] [p:process]
  const macExplicitMatch = line.match(/\[t:(\d+)\]/);
  if (macExplicitMatch) {
    return macExplicitMatch[1];
  }

  // Android format: [date] [thread] [domain] - [level] - message
  const androidMatch = line.match(/^\[[\w-]+\s[\d:.]+\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+-\s+\[[DWE]\]\s+-/);
  if (androidMatch) {
    const thread = androidMatch[1]; // Second bracket is the thread
    return thread.trim();
  }

  // Linux format: date [level][module][function:line][unknown][unknown][thread]
  const linuxMatch = line.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\[[DWIE]\]\[[^\]]+\]\[[^\]]+\]\[[^\]]*\]\[[^\]]*\]\[([^\]]+)\]/);
  if (linuxMatch) {
    const thread = linuxMatch[1];
    return thread === '_:' ? '_' : thread;
  }

  // Windows format with combined hex IDs (date NOT in brackets): date [level] [module] [processId:threadId] [function]
  const windowsHexNoBracketsMatch = line.match(/^\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s+\[[^\]]+\]\s+\[[^\]]+\]\s+\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]/);
  if (windowsHexNoBracketsMatch) {
    const threadId = windowsHexNoBracketsMatch[2]; // Second part after colon is thread ID
    return threadId;
  }

  // Windows format with combined hex IDs: [date] [level] [module] [processId:threadId] [function]
  const windowsHexMatch = line.match(/^\[[\d\/]+\s[\d:.]+\]\s+\[[^\]]+\]\s+\[[^\]]+\]\s+\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]/);
  if (windowsHexMatch) {
    const threadId = windowsHexMatch[2]; // Second part after colon is thread ID
    return threadId;
  }

  // Windows format: [date] [level] [module] [processId] [threadId] [file:line]
  const windowsMatch = line.match(/^\[[\d\/]+\s[\d:.]+\]\s+\[[^\]]+\]\s+\[[^\]]+\]\s+\[(\d+)\]\s+\[(\d+)\]\s+\[[^\]]+\]/);
  if (windowsMatch) {
    const threadId = windowsMatch[2]; // Second number is thread ID
    return threadId;
  }

  // Chrome/Windows format: [processId:threadId:timestamp:level:file]
  const chromeMatch = line.match(/^\[(\d+):(\d+):\d+\/\d+\.\d+:[A-Z]+:[^\]]+\]/);
  if (chromeMatch) {
    const threadId = chromeMatch[2]; // Second number is thread ID
    return threadId;
  }

  // For iOS/macOS log format: detect app vs daemon format
  // App format: [module:line] [thread] [process] - smaller numbers first
  // Daemon format: [module:line] [process] [thread] - larger numbers first
  const iosMacPattern = line.match(/\[[^:\]]+:\d+\]\s+\[(\d+)\]\s+\[(\d+)\]/);
  if (iosMacPattern) {
    const firstNum = parseInt(iosMacPattern[1]);
    const secondNum = parseInt(iosMacPattern[2]);
    
    // Heuristic: if first number is much larger, it's daemon format [process] [thread]
    // If second number is larger, it's app format [thread] [process]
    if (firstNum > secondNum * 10) {
      // Daemon format: [process] [thread]
      return iosMacPattern[2]; // Second number is thread ID
    } else {
      // App format: [thread] [process]  
      return iosMacPattern[1]; // First number is thread ID
    }
  }

  // For other iOS/macOS log format: try to extract the first bracketed number as thread ID
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
 * - macOS format: [module:line] [thread] [process] 
 * - Windows format 1: [processId:threadId] (combined)
 * - Windows format 2: [processId] [threadId] (separate)
 * - Linux format: [level][module][function:line][unknown][unknown][thread]
 * - Android format: [thread] [module] - [level] -
 * - Generic: pid:12345, process:12345, [pid:12345]
 * @param {string} line - The log line to parse
 * @returns {string} - The process ID or process:thread combination
 */
export const extractProcess = (line) => {
  // Mac/iOS explicit format: [module:line] [level] [t:thread] [p:process]
  const macExplicitMatch = line.match(/\[p:(\d+)\]/);
  if (macExplicitMatch) {
    return macExplicitMatch[1];
  }

  // Try to extract process ID - look for patterns like pid:12345, process:12345, or [pid:12345]
  const processMatch = line.match(/(?:pid|process)[:\s]*(\d+)/i) ||
    line.match(/\[(?:pid|process)[:\s]*(\d+)\]/i);
  if (processMatch) {
    return processMatch[1];
  }

  // Chrome/Windows format: [processId:threadId:timestamp:level:file] - handle this first
  const chromeMatch = line.match(/^\[(\d+):(\d+):\d+\/\d+\.\d+:[A-Z]+:[^\]]+\]/);
  if (chromeMatch) {
    const processId = chromeMatch[1]; // First number is process ID
    return processId;
  }

  // Windows format variation 1 (date NOT in brackets): date [level] [module] [processId:threadId] [function]
  const windowsMatch1NoBrackets = line.match(/^\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3}\s+\[[^\]]+\]\s+\[[^\]]+\]\s+\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]/);
  if (windowsMatch1NoBrackets) {
    const processId = windowsMatch1NoBrackets[1]; // Just the process part
    return processId; // Return only process ID, not combined
  }

  // Windows format variation 1: [date] [level] [module] [processId:threadId] [function] [unknown] [unknown] [message]
  const windowsMatch1 = line.match(/^\[[\d\/]+\s[\d:.]+\]\s+\[[^\]]+\]\s+\[[^\]]+\]\s+\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]/);
  if (windowsMatch1) {
    const processId = windowsMatch1[1]; // Just the process part
    return processId; // Return only process ID, not combined
  }

  // Windows format variation 1b: [processId:threadId] - simple format only (not part of structured log)
  // Pattern matches hex or decimal numbers: [5938:4BE8] or [1234:5678] but not complex Chrome format
  const windowsMatchSimple = line.match(/\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\](?!\s*\[)/);
  if (windowsMatchSimple) {
    const processId = windowsMatchSimple[1];
    const threadId = windowsMatchSimple[2];
    return `${processId}:${threadId}`;
  }

  // Windows format variation 2: [date] [level] [module] [processId] [threadId] [file:line]
  const windowsMatch2 = line.match(/^\[[\d\/]+\s[\d:.]+\]\s+\[[^\]]+\]\s+\[[^\]]+\]\s+\[(\d+)\]\s+\[(\d+)\]\s+\[[^\]]+\]/);
  if (windowsMatch2) {
    const processId = windowsMatch2[1]; // First number is process ID
    const threadId = windowsMatch2[2];  // Second number is thread ID
    return processId;
  }

  // Windows format variation 3: [processId] [threadId] - separate brackets (legacy pattern)
  // Look for pattern: [level] [module] [processId] [threadId] [file:line]
  const windowsMatch3 = line.match(/\[[^\]]+\]\s+\[[^\]]+\]\s+\[(\d+)\]\s+\[(\d+)\]\s+\[[^\]]+\]/);
  if (windowsMatch3) {
    const processId = windowsMatch3[1];
    const threadId = windowsMatch3[2];
    return `${processId}:${threadId}`;
  }

  // Android format: [date] [thread] [domain] - [level] - message
  // For Android, we'll use the thread as the process identifier
  const androidMatch = line.match(/^\[[\w-]+\s[\d:.]+\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+-\s+\[[DWE]\]\s+-/);
  if (androidMatch) {
    const thread = androidMatch[1]; // Use thread as process identifier for Android
    return thread.trim();
  }

  // Linux format: date [level][module][function:line][unknown][unknown][thread]
  // Pattern: 2025-08-04 11:18:00 [I][client  ][log_client_version:1716][:][:][_:]
  const linuxMatch = line.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\[[DWIE]\]\[[^\]]+\]\[[^\]]+\]\[[^\]]*\]\[[^\]]*\]\[([^\]]+)\]/);
  if (linuxMatch) {
    const thread = linuxMatch[1];
    return thread === '_:' ? '_' : thread;
  }

  // For iOS/macOS log format: detect app vs daemon format
  // App format: [module:line] [thread] [process] - smaller numbers first
  // Daemon format: [module:line] [process] [thread] - larger numbers first
  const iosMacPattern = line.match(/\[[^:\]]+:\d+\]\s+\[(\d+)\]\s+\[(\d+)\]/);
  if (iosMacPattern) {
    const firstNum = parseInt(iosMacPattern[1]);
    const secondNum = parseInt(iosMacPattern[2]);
    
    // Heuristic: if first number is much larger, it's daemon format [process] [thread]
    // If second number is larger, it's app format [thread] [process]
    if (firstNum > secondNum * 10) {
      // Daemon format: [process] [thread]
      return iosMacPattern[1]; // First number is process ID
    } else {
      // App format: [thread] [process]  
      return iosMacPattern[2]; // Second number is process ID
    }
  }

  // For other iOS/macOS log format: try to extract the second bracketed number as process ID
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
 * @param {string} dateFormat - The date format detected from file (MM/DD/YY or DD/MM/YY)
 * @returns {Object} - Parsed log object with all extracted information
 */
export const parseLogLine = (line, lineNumber, logId, dateFormat = 'DD/MM/YY') => {
  const timestamp = extractTimestamp(line);
  
  // Use parseLogFormat to get properly extracted message and other fields
  const parsedFormat = parseLogFormat(line);
  const cleanMessage = parsedFormat?.message || line; // Fallback to full line if parsing fails
  
  // Create display-ready timestamp, date and time at parse time
  // Also create numeric timestamp for sorting/comparisons
  let displayDate = null;
  let displayTime = null;
  let timestampMs = null;
  
  if (timestamp) {
    // Handle slash format like "01/06/25 07:48:11.989"
    const slashMatch = timestamp.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})[:.](\d{3})/);
    if (slashMatch) {
      const [, first, second, year, hours, minutes, seconds, ms] = slashMatch;
      const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
      const day = dateFormat === 'MM/DD/YY' ? second : first;
      const month = dateFormat === 'MM/DD/YY' ? first : second;
      const isoDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      // Create Date object and extract timestamp
      const dateObj = new Date(`${isoDate}T${hours}:${minutes}:${seconds}.${ms}`);
      timestampMs = dateObj.getTime();
      
      // Create display strings
      displayDate = formatDateWithMonthName(isoDate);
      displayTime = `${hours}:${minutes}:${seconds}.${ms}`;
    } else {
      // Handle ISO format like "2025-05-23 12:34:56:789"
      const isoMatch = timestamp.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})[:.](\d{3})/);
      if (isoMatch) {
        const [, year, month, day, hours, minutes, seconds, ms] = isoMatch;
        const isoDate = `${year}-${month}-${day}`;
        
        // Create Date object and extract timestamp
        const dateObj = new Date(`${isoDate}T${hours}:${minutes}:${seconds}.${ms}`);
        timestampMs = dateObj.getTime();
        
        // Create display strings
        displayDate = formatDateWithMonthName(isoDate);
        displayTime = `${hours}:${minutes}:${seconds}.${ms}`;
      }
    }
  }
  
  return {
    id: logId,
    raw: line,
    message: cleanMessage,
    timestamp: timestamp, // Keep original string for compatibility
    timestampMs: timestampMs, // Numeric timestamp for sorting/comparisons
    displayDate: displayDate, // Formatted date with month name (e.g., "23-May-2025")
    displayTime: displayTime, // Formatted time (e.g., "14:23:45.123")
    level: parsedFormat?.logLevel || extractLogLevel(line),
    module: extractModule(line),
    sourceName: parsedFormat?.sourceName || '',
    sourceLine: parsedFormat?.sourceLine || '',
    thread: parsedFormat?.threadId || extractThread(line),
    process: parsedFormat?.processId || extractProcess(line),
    lineNumber: lineNumber,
    originalLineNumbers: [lineNumber]
  };
};

/**
 * Parse log file content and group lines by timestamp
 * @param {string} content - The raw log file content
 * @param {Array} headerLines - Array of line numbers that are headers (to skip)
 * @param {string} dateFormat - The date format detected from file (MM/DD/YY or DD/MM/YY)
 * @returns {Array} - Array of parsed log objects
 */
export const parseLogContent = (content, headerLines = [], dateFormat = 'DD/MM/YY') => {
  const allLines = content.split('\n'); // Keep all lines including empty ones
  const logs = [];
  let currentLog = null;

  // First pass: parse all logs
  allLines.forEach((line, idx) => {
    if (!line.trim() || headerLines.includes(idx)) return;
    
    const hasTimestamp = extractTimestamp(line);
    
    if (hasTimestamp) {
      // Start a new log entry
      if (currentLog) logs.push(currentLog);
      currentLog = parseLogLine(line, idx + 1, logs.length, dateFormat);
    } else if (currentLog) {
      // Append to previous log's message, but increment line number
      currentLog.message += '\n' + line;
      currentLog.raw += '\n' + line;
      currentLog.originalLineNumbers.push(idx + 1);
    } else {
      // If the first line(s) have no timestamp, treat as a log
      currentLog = parseLogLine(line, idx + 1, logs.length, dateFormat);
    }
  });
  
  if (currentLog) logs.push(currentLog);

  // Second pass: build process ID to process type mapping
  const processIdToTypeMap = new Map();
  
  logs.forEach(log => {
    if (log.process && log.module) {
      const processType = getProcessTypeFromModule(log.module);
      if (processType && !processIdToTypeMap.has(log.process)) {
        processIdToTypeMap.set(log.process, processType);
      }
    }
  });

  // Third pass: update all logs with processName
  logs.forEach(log => {
    if (log.process) {
      log.processName = processIdToTypeMap.get(log.process) || log.process;
    } else {
      log.processName = '';
    }
  });

  return logs;
};

/**
 * Parse different log format variations for detailed component extraction
 * @param {string} line - The log line to parse
 * @returns {Object|null} - Parsed components or null if not a recognized format
 */
export const parseLogFormat = (line) => {
  // iOS/macOS explicit format: date time [module:line] [level] [t:thread] [p:process] message
  const iosExplicitMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}:\d{3})\s+\[([^\]]+)\]\s+\[([DIWEVT])\]\s+\[t:(\d+)\]\s+\[p:(\d+)\]\s+(.*)$/);
  if (iosExplicitMatch) {
    return {
      format: 'ios-macos-explicit',
      dateTime: iosExplicitMatch[1],
      moduleInfo: iosExplicitMatch[2].trim(),
      logLevel: iosExplicitMatch[3],
      threadId: iosExplicitMatch[4],
      processId: iosExplicitMatch[5],
      message: iosExplicitMatch[6]
    };
  }

  // iOS/macOS format: date time [module:line] [thread] [process] message
  const iosMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}:\d{3})\s+\[([^\]]+)\]\s+\[(\d+)\]\s+\[(\d+)\]\s+(.*)$/);
  if (iosMatch) {
    const firstNum = parseInt(iosMatch[3]);
    const secondNum = parseInt(iosMatch[4]);
    
    // Apply same daemon/app heuristic as in extractThread/extractProcess
    // If first number is much larger, it's daemon format [process] [thread]
    // If second number is larger, it's app format [thread] [process]
    let threadId, processId;
    if (firstNum > secondNum * 10) {
      // Daemon format: [process] [thread]
      processId = iosMatch[3];
      threadId = iosMatch[4];
    } else {
      // App format: [thread] [process]
      threadId = iosMatch[3];
      processId = iosMatch[4];
    }
    
    // Extract log level if it's a standalone letter at the start of the message
    const messageWithLevel = iosMatch[5];
    const logLevelMatch = messageWithLevel.match(/^\s*([DIWEVT])\s+/);
    const logLevel = logLevelMatch ? logLevelMatch[1] : null;
    const cleanMessage = logLevelMatch ? messageWithLevel.replace(/^\s*[DIWEVT]\s+/, '') : messageWithLevel;
    
    return {
      format: 'ios-macos',
      dateTime: iosMatch[1],
      moduleInfo: iosMatch[2].trim(),
      threadId: threadId,
      processId: processId,
      logLevel: logLevel,
      message: cleanMessage
    };
  }

  // Windows unified format: date time [level] [module] [process:thread] [function:line] [...metadata fields...] message
  // Handles all variations with 2-4 metadata fields that can be:
  // - [:] or [ :] - empty
  // - [p:project] - project name
  // - [account:user] - account and user
  // - [U:userId] - user ID
  // - [:value] - any value with colon prefix
  // - [message] - message in brackets (when last field contains non-colon text)
  // Examples with 3 fields:
  // 09/01/26 18:16:49.013 [D] [Routing] [1474:2788] [getRoutingTable:82] [:] [p:chicatod12a] [ :] getRoutingTable
  // 21/01/26 21:30:19.765 [I] [VPNProc] [1634:2BE4] [getAdditionalProducts : 3264] [:] [:TnlsOfficeMode] [getAdditionalProducts started
  // 09/01/26 18:05:38.395 [E] [Configurat] [20AC:2490] [logError : 407] [:] [:] [ :] openImp
  // 09/01/26 18:17:24.436 [E] [Configurat] [1474:22D4] [getLastActiveSessionAccountManager : 2672] [:] [:] [message in brackets]
  // Example with 4 fields:
  // 20/01/26 16:30:14.825 [D] [Configurat] [1474:33FC] [getLastActiveSessionCredentials : 2695] [2217:prelogin] [p:auscatod1a] [U:857242227937794636] message
  
  // Determine how many fields by counting brackets after [processId:threadId] [function:line]
  // Look for the pattern and count what comes after
  const processThreadPattern = /\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]\s+\[([^\]]+?)\s*:\s*(\d+)\]/;
  const processThreadMatch = line.match(processThreadPattern);
  let has4Fields = false;
  
  if (processThreadMatch) {
    const afterFunctionLine = line.substring(line.indexOf(processThreadMatch[0]) + processThreadMatch[0].length);
    // Count opening brackets
    const bracketCount = (afterFunctionLine.match(/\[/g) || []).length;
    has4Fields = bracketCount >= 4;
  }
  
  if (has4Fields) {
    // Try 4 fields
    const windowsUnified4Match = line.match(/^(\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]\s+\[([^\]]+?)\s*:\s*(\d+)\]\s+\[([^\]]*)\]\s+\[([^\]]*)\]\s+\[([^\]]*)\]\s+\[([^\]]*)\]\s*(.*)$/);
    if (windowsUnified4Match) {
      const field1 = windowsUnified4Match[8].trim();
      const field2 = windowsUnified4Match[9].trim();
      const field3 = windowsUnified4Match[10].trim();
      const field4 = windowsUnified4Match[11].trim();
      const remainingText = windowsUnified4Match[12].trim();
      
      // Parse metadata fields
      let account = '', user = '', project = '', userId = '', secondField = '';
      let message = remainingText;
      
      // Parse field1: can be [account:user] or [:] or empty
      if (field1 && field1 !== ':') {
        const accountMatch = field1.match(/^([^:]+):(.+)$/);
        if (accountMatch) {
          account = accountMatch[1];
          user = accountMatch[2];
        }
      }
      
      // Parse field2: can be [p:project] or [:value] or [:] or empty
      if (field2) {
        if (field2.startsWith('p:')) {
          project = field2.substring(2);
        } else if (field2.startsWith(':') && field2.length > 1) {
          secondField = field2.substring(1);
        }
      }
      
      // Parse field3: can be [U:userId] or [ :] or [:] or empty
      if (field3) {
        if (field3.startsWith('U:')) {
          userId = field3.substring(2);
        }
      }
      
      // Parse field4: can be [U:userId] or [message] or empty
      // Check if it's userId first, then check if it's a message
      if (field4) {
        if (field4.startsWith('U:')) {
          userId = field4.substring(2);
        } else if (field4 !== ':' && field4 !== ' :' && field4.trim() !== '') {
          // It's a message in brackets (no colon prefix or just empty colon)
          message = field4;
        }
      }
      
      return {
        format: 'windows-unified',
        dateTime: windowsUnified4Match[1],
        logLevel: windowsUnified4Match[2],
        moduleName: windowsUnified4Match[3].trim(),
        processId: windowsUnified4Match[4],
        threadId: windowsUnified4Match[5],
        sourceName: windowsUnified4Match[6].trim(),
        sourceLine: windowsUnified4Match[7],
        account: account,
        user: user,
        project: project,
        userId: userId,
        secondField: secondField,
        message: message
      };
    }
  }
  
  // Try 3 fields
  const windowsUnified3Match = line.match(/^(\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]\s+\[([^\]]+?)\s*:\s*(\d+)\]\s+\[([^\]]*)\]\s+\[([^\]]*)\]\s+(.*)$/);
  if (windowsUnified3Match) {
    const field1 = windowsUnified3Match[8].trim();
    const field2 = windowsUnified3Match[9].trim();
    const remainingText = windowsUnified3Match[10].trim();
    
    // Parse metadata fields
    let account = '', user = '', project = '', userId = '', secondField = '';
    let message = remainingText;
    
    // Parse field1: can be [account:user] or [:] or empty
    if (field1 && field1 !== ':') {
      const accountMatch = field1.match(/^([^:]+):(.+)$/);
      if (accountMatch) {
        account = accountMatch[1];
        user = accountMatch[2];
      }
    }
    
    // Parse field2: can be [p:project] or [:value] or [:] or empty
    if (field2) {
      if (field2.startsWith('p:')) {
        project = field2.substring(2);
      } else if (field2.startsWith(':') && field2.length > 1) {
        secondField = field2.substring(1);
      }
    }
    
    return {
      format: 'windows-unified',
      dateTime: windowsUnified3Match[1],
      logLevel: windowsUnified3Match[2],
      moduleName: windowsUnified3Match[3].trim(),
      processId: windowsUnified3Match[4],
      threadId: windowsUnified3Match[5],
      sourceName: windowsUnified3Match[6].trim(),
      sourceLine: windowsUnified3Match[7],
      account: account,
      user: user,
      project: project,
      userId: userId,
      secondField: secondField,
      message: message
    };
  }

  // Windows simple format (CatoClient trace): MM/DD/YY HH:MM:SS.SSS [ ] [          ] [PID:TID] message
  // This format has empty/spaces in level and module fields
  const windowsSimpleMatch = line.match(/^(\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+\[\s*\]\s+\[\s*\]\s+\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]\s+(.*)$/);
  if (windowsSimpleMatch) {
    return {
      format: 'windows-simple',
      dateTime: windowsSimpleMatch[1],
      logLevel: '',
      moduleName: '',
      processId: windowsSimpleMatch[2],
      threadId: windowsSimpleMatch[3],
      message: windowsSimpleMatch[4]
    };
  }

  // Windows format variation 2: [date time] [level] [module] [processId] [threadId] [file:line] message
  const windowsMatch2 = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[(\d+)\]\s+\[(\d+)\]\s+\[([^\]]+)\]\s+(.*)$/);
  if (windowsMatch2) {
    return {
      format: 'windows-separate',
      dateTime: windowsMatch2[1],
      logLevel: windowsMatch2[2],
      moduleName: windowsMatch2[3].trim(),
      processId: windowsMatch2[4],
      threadId: windowsMatch2[5],
      fileName: windowsMatch2[6],
      message: windowsMatch2[7]
    };
  }

  // Windows format variation 3a: [date time] [level] [module] [hexProcessId:hexThreadId] [function:line] message (simpler format)
  const windowsHexSimple = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]\s+\[([^\]]+)\]\s+(.*)$/);
  if (windowsHexSimple) {
    return {
      format: 'windows-hex',
      dateTime: windowsHexSimple[1],
      logLevel: windowsHexSimple[2],
      moduleName: windowsHexSimple[3].trim(),
      processId: windowsHexSimple[4], // Hex process ID
      threadId: windowsHexSimple[5],  // Hex thread ID
      fileName: windowsHexSimple[6],
      message: windowsHexSimple[7]
    };
  }

  // Windows format variation 3b: [date time] [level] [module] [hexProcessId:hexThreadId] [function:line] [...] [...] message (with extra brackets)
  const windowsHexMatch = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([0-9A-Fa-f]+):([0-9A-Fa-f]+)\]\s+\[([^\]]+)\]\s+\[([^\]]*)\]\s+\[([^\]]*)\]\s+(.*)$/);
  if (windowsHexMatch) {
    return {
      format: 'windows-hex',
      dateTime: windowsHexMatch[1],
      logLevel: windowsHexMatch[2],
      moduleName: windowsHexMatch[3].trim(),
      processId: windowsHexMatch[4], // Hex process ID
      threadId: windowsHexMatch[5],  // Hex thread ID
      fileName: windowsHexMatch[6],
      unknown1: windowsHexMatch[7],
      unknown2: windowsHexMatch[8],
      message: windowsHexMatch[9]
    };
  }

  // Linux format: date time [level][module][function:line][unknown][unknown][thread] message
  const linuxMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\s+\[([DWIE])\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]*)\]\[([^\]]*)\]\[([^\]]+)\]\s+(.*)$/);
  if (linuxMatch) {
    return {
      format: 'linux',
      dateTime: linuxMatch[1],
      logLevel: linuxMatch[2],
      moduleName: linuxMatch[3].trim(),
      functionLine: linuxMatch[4],
      unknown1: linuxMatch[5],
      unknown2: linuxMatch[6],
      threadId: linuxMatch[7] === '_:' ? '' : linuxMatch[7],
      message: linuxMatch[8]
    };
  }

  // Android format: [date time] [thread] [module] - [level] - message
  const androidMatch = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+-\s+\[([DVWE])\]\s+-\s+(.*)$/);
  if (androidMatch) {
    return {
      format: 'android',
      dateTime: androidMatch[1],
      threadId: androidMatch[2],
      moduleName: androidMatch[3].trim(),
      logLevel: androidMatch[4],
      message: androidMatch[5]
    };
  }

  // Android system log format: MM-dd HH:mm:ss.SSS  processId  threadId level module: message
  const androidSystemMatch = line.match(/^(\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([DVIWEF])\s+([^:]+):\s+(.*)$/);
  if (androidSystemMatch) {
    return {
      format: 'android-system',
      dateTime: androidSystemMatch[1],
      processId: androidSystemMatch[2],
      threadId: androidSystemMatch[3],
      logLevel: androidSystemMatch[4],
      moduleName: androidSystemMatch[5].trim(),
      message: androidSystemMatch[6]
    };
  }

  // Chrome/Windows format: [processId:threadId:MMDD/HHMMSS.SSS:LEVEL:file.cc(line)] [optional timestamp] message
  const chromeMatch = line.match(/^\[(\d+):(\d+):(\d{4})\/(\d{6}\.\d{3}):([A-Z]+):([^\]]+)\](?:\s+\[([^\]]+)\])?\s+(.*)$/);
  if (chromeMatch) {
    return {
      format: 'chrome-windows',
      processId: chromeMatch[1],
      threadId: chromeMatch[2],
      date: chromeMatch[3], // MMDD format
      time: chromeMatch[4], // HHMMSS.SSS format
      logLevel: chromeMatch[5],
      fileName: chromeMatch[6],
      optionalTimestamp: chromeMatch[7] || null,
      message: chromeMatch[8]
    };
  }

  return null;
};

/**
 * Parse Windows log format variations for detailed component extraction
 * @param {string} line - The Windows log line to parse
 * @returns {Object|null} - Parsed components or null if not a valid Windows format
 * @deprecated Use parseLogFormat instead
 */
export const parseWindowsLogFormat = (line) => {
  const result = parseLogFormat(line);
  return result && result.format.startsWith('windows') ? result : null;
};