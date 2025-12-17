import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLogFormat } from '../logParser.js';

/**
 * Direct test using the LogRecordsTests data files
 * Each test file contains log lines followed by expected JSON results
 */

// Transform our parser output to match the expected format in test data
function transformToExpectedFormat(result) {
  if (!result) return null;
  
  const transformed = {};
  
  // Extract date and time from dateTime field
  if (result.dateTime) {
    const dateTimeStr = result.dateTime;
    
    // Handle different date formats
    if (dateTimeStr.includes('Jul-') || dateTimeStr.includes('Aug-') || dateTimeStr.includes('Sep-')) {
      // Android format: "2025-Jul-28 22:34:49.399"
      const parts = dateTimeStr.split(' ');
      transformed.Date = parts[0];
      transformed.Time = parts[1];
    } else if (dateTimeStr.match(/^\d{2}-\d{2}\s/)) {
      // Android system format: "07-12 04:09:59.854"
      const parts = dateTimeStr.split(' ');
      transformed.Date = parts[0];
      transformed.Time = parts[1];
    } else if (dateTimeStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      // ISO format: "2025-08-04 07:10:36:859"
      const parts = dateTimeStr.split(' ');
      transformed.Date = parts[0];
      transformed.Time = parts[1];
    } else if (dateTimeStr.match(/^\d{2}\/\d{2}\/\d{2}/)) {
      // Windows format: "08/31/25 16:27:00.072"
      const parts = dateTimeStr.split(' ');
      transformed.Date = parts[0];
      transformed.Time = parts[1];
    }
  }
  
  // Handle chrome format specially
  if (result.format === 'chrome-windows') {
    // Chrome format has separate date and time fields
    if (result.date) {
      // Convert "0831" to "08/31"
      const dateStr = result.date;
      if (dateStr.length === 4) {
        transformed.Date = dateStr.substring(0, 2) + '/' + dateStr.substring(2, 4);
      }
    }
    if (result.time) {
      // Convert "192716.301" to "19:27:16.301"
      const timeStr = result.time;
      if (timeStr.length >= 6) {
        const hours = timeStr.substring(0, 2);
        const minutes = timeStr.substring(2, 4);
        const seconds = timeStr.substring(4);
        transformed.Time = hours + ':' + minutes + ':' + seconds;
      }
    }
  }

  // Handle different format outputs
  switch (result.format) {
    case 'ios-macos':
      // Mac format
      if (result.moduleInfo) {
        const moduleMatch = result.moduleInfo.match(/^([^:]+):(\d+)$/);
        if (moduleMatch) {
          transformed.FileName = moduleMatch[1];
          transformed.Line = moduleMatch[2];
          transformed.Module = moduleMatch[1];
        }
      }
      transformed.ProcessId = result.processId;
      transformed.ThreadID = result.threadId;
      transformed.logLevel = result.logLevel || null;
      break;
      
    case 'windows-separate':
      // Windows format
      transformed.logLevel = result.logLevel;
      transformed.Module = result.moduleName;
      transformed.ProcessId = result.processId;
      transformed.ThreadID = result.threadId;
      if (result.fileName) {
        const fileMatch = result.fileName.match(/^([^:]+):(\d+)$/);
        if (fileMatch) {
          transformed.FileName = fileMatch[1];
          transformed.Line = fileMatch[2];
        }
      }
      break;
      
    case 'chrome-windows':
      // Chrome format
      transformed.logLevel = result.logLevel;
      transformed.ProcessId = result.processId;
      transformed.ThreadID = result.threadId;
      transformed.Module = null;
      if (result.fileName) {
        const fileMatch = result.fileName.match(/^([^(]+)\((\d+)\)$/);
        if (fileMatch) {
          transformed.FileName = fileMatch[1];
          transformed.Line = fileMatch[2];
        }
      }
      break;
      
    case 'android':
      // Android format
      transformed.logLevel = result.logLevel;
      transformed.ThreadID = result.threadId ? result.threadId.trim() : null;
      transformed.Module = result.moduleName ? result.moduleName.trim() : null;
      transformed.ProcessId = result.processId || null;
      transformed.FileName = null;
      transformed.Line = null;
      break;
      
    case 'android-system':
      // Android system log format: MM-dd HH:mm:ss.SSS  processId  threadId level module: message
      transformed.logLevel = result.logLevel;
      transformed.ThreadID = result.threadId;
      transformed.Module = result.moduleName ? result.moduleName.trim() : null;
      transformed.ProcessId = result.processId;
      transformed.FileName = null;
      transformed.Line = null;
      break;
      
    case 'windows-hex':
      // Windows hex format: [date] [level] [module] [hexProcessId:hexThreadId] [function] [unknown] [unknown] message
      transformed.logLevel = result.logLevel;
      transformed.Module = result.moduleName;
      transformed.ProcessId = result.processId;
      transformed.ThreadID = result.threadId;
      if (result.fileName) {
        // Handle spaces in function name: "getConfig                          :  227"
        const funcMatch = result.fileName.match(/^([^:]+):\s*(\d+)$/);
        if (funcMatch) {
          transformed.FileName = funcMatch[1].trim();
          transformed.Line = funcMatch[2];
        }
      }
      break;
      
    case 'linux':
      // Linux format
      transformed.logLevel = result.logLevel;
      transformed.Module = result.moduleName;
      transformed.ThreadID = result.threadId || "_";
      transformed.ProcessId = null;
      if (result.functionLine) {
        const funcMatch = result.functionLine.match(/^([^:]+):\s*(\d+)$/);
        if (funcMatch) {
          transformed.FileName = funcMatch[1].trim();
          transformed.Line = funcMatch[2];
        }
      }
      break;
  }
  
  return transformed;
}

// Function to parse test data from files
function parseTestData(fileName) {
  const filePath = join(process.cwd(), 'LogRecordsTests', fileName);
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const testCases = [];
  
  for (let i = 0; i < lines.length; i += 2) {
    const logLine = lines[i];
    const expectedLine = lines[i + 1];
    
    // Skip empty lines or incomplete pairs
    if (!logLine || !expectedLine || logLine.trim() === '' || expectedLine.trim() === '') {
      continue;
    }
    
    // Skip comments
    if (logLine.trim().startsWith('#')) {
      continue;
    }
    
    try {
      const expected = JSON.parse(expectedLine);
      testCases.push([logLine, expected]);
    } catch (error) {
      console.warn(`Failed to parse expected result at line ${i + 2}: ${expectedLine}`);
    }
  }
  
  return testCases;
}

describe('LogParser Direct Tests with LogRecordsTests Data', () => {
  describe('Mac/iOS Log Parsing', () => {
    const testData = parseTestData('mac_test_logs.test_log');

    test.each(testData)('should parse Mac/iOS log line correctly: %s', (logLine, expected) => {
      const rawResult = parseLogFormat(logLine);
      const result = transformToExpectedFormat(rawResult);
      expect(result).toEqual(expected);
    });
  });

  describe('Windows Log Parsing', () => {
    const testData = parseTestData('windows_test_logs.test_log');

    test.each(testData)('should parse Windows log line correctly: %s', (logLine, expected) => {
      const rawResult = parseLogFormat(logLine);
      const result = transformToExpectedFormat(rawResult);
      expect(result).toEqual(expected);
    });
  });

  describe('Android Log Parsing', () => {
    const testData = parseTestData('android_test_logs.test_log');

    test.each(testData)('should parse Android log line correctly: %s', (logLine, expected) => {
      const rawResult = parseLogFormat(logLine);
      const result = transformToExpectedFormat(rawResult);
      expect(result).toEqual(expected);
    });
  });

  describe('Linux Log Parsing', () => {
    const testData = parseTestData('linux_test_logs.test_log');

    test.each(testData)('should parse Linux log line correctly: %s', (logLine, expected) => {
      const rawResult = parseLogFormat(logLine);
      const result = transformToExpectedFormat(rawResult);
      expect(result).toEqual(expected);
    });
  });
});

// Helper function to extract actual results from a log line
function extractActualResults(logLine) {
  const timestamp = extractTimestamp(logLine);
  const date = extractDateFromTimestamp(timestamp);
  const time = extractTimeFromTimestamp(timestamp);
  const processId = extractProcess(logLine);
  const threadId = extractThread(logLine);
  const logLevel = extractLogLevel(logLine);
  const module = extractModule(logLine);
  
  // Extract filename and line number from module info
  let fileName = null;
  let line = null;
  
  // Parse format for different log types
  const parsed = parseLogFormat(logLine);
  if (parsed) {
    if (parsed.format === 'ios-macos' && parsed.moduleInfo) {
      const moduleMatch = parsed.moduleInfo.match(/^([^:]+):(\d+)$/);
      if (moduleMatch) {
        fileName = moduleMatch[1];
        line = moduleMatch[2];
      }
    } else if (parsed.format.startsWith('windows') && parsed.fileName) {
      const fileMatch = parsed.fileName.match(/^([^:]+):(\d+)$/);
      if (fileMatch) {
        fileName = fileMatch[1];
        line = fileMatch[2];
      }
    } else if (parsed.format === 'linux' && parsed.functionLine) {
      const functionMatch = parsed.functionLine.match(/^([^:]+):(\d+)$/);
      if (functionMatch) {
        fileName = functionMatch[1];
        line = functionMatch[2];
      }
    } else if (parsed.format === 'chrome-windows' && parsed.fileName) {
      const fileMatch = parsed.fileName.match(/^([^(]+)\((\d+)\)$/);
      if (fileMatch) {
        fileName = fileMatch[1];
        line = fileMatch[2];
      }
    }
  }
  
  // If we didn't get filename/line from parsing, try direct extraction from module
  if (!fileName && module) {
    const moduleMatch = logLine.match(/\[([^:\]]+):(\d+)\]/);
    if (moduleMatch) {
      fileName = moduleMatch[1];
      line = moduleMatch[2];
    }
  }
  
  return {
    Date: date,
    Time: time,
    ProcessId: processId,
    ThreadID: threadId,
    logLevel: logLevel,
    FileName: fileName,
    Line: line,
    Module: module
  };
}

// Remove duplicate test suites - keeping only the working transformation-based tests above