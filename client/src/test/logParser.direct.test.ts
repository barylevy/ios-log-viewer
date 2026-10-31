import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLogFormat } from '../LogParser';

/**
 * Direct test using the LogRecordsTests data files
 * Each test file contains log lines followed by expected JSON results
 */

// Transform our parser output to match the expected format in test data
function transformToExpectedFormat(result: ReturnType<typeof parseLogFormat>) {
  if (!result) return null;

  const transformed: Record<string, string | null | undefined> = {};

  // Extract date and time from dateTime field
  if (result.dateTime) {
    const dateTimeStr = result.dateTime;

    // Handle different date formats
    if (
      dateTimeStr.includes('Jul-') ||
      dateTimeStr.includes('Aug-') ||
      dateTimeStr.includes('Sep-')
    ) {
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
    case 'ios-macos-explicit':
      // Mac explicit format with [t:thread] and [p:process]
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
      transformed.Module = result.moduleName || null;
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

    case 'windows-extended':
      // Windows extended format with account, user, project, userId
      transformed.logLevel = result.logLevel;
      transformed.Module = result.moduleName || null;
      transformed.ProcessId = result.processId;
      transformed.ThreadID = result.threadId;
      if (result.sourceName && result.sourceLine) {
        transformed.FileName = result.sourceName;
        transformed.Line = result.sourceLine;
      }
      break;

    case 'windows-simple':
      // Windows simple format (CatoClient trace): MM/DD/YY HH:MM:SS.SSS [ ] [          ] [PID:TID] message
      transformed.logLevel = result.logLevel || null;
      transformed.Module = result.moduleName || null;
      transformed.ProcessId = result.processId;
      transformed.ThreadID = result.threadId;
      break;

    case 'windows-hex':
      // Windows hex format: [date] [level] [module] [hexProcessId:hexThreadId] [function] [unknown] [unknown] message
      transformed.logLevel = result.logLevel;
      transformed.Module = result.moduleName || null;
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

    case 'windows-unified':
      // Windows unified format (consolidation of all Windows formats)
      transformed.logLevel = result.logLevel;
      transformed.Module = result.moduleName || null;
      transformed.ProcessId = result.processId;
      transformed.ThreadID = result.threadId;
      if (result.sourceName && result.sourceLine) {
        transformed.FileName = result.sourceName;
        transformed.Line = result.sourceLine;
      }
      break;

    case 'linux':
      // Linux format
      transformed.logLevel = result.logLevel;
      transformed.Module = result.moduleName || null;
      transformed.ThreadID = result.threadId || '_';
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
function parseTestData(fileName: string) {
  const filePath = join(process.cwd(), 'LogRecordsTests', fileName);
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const testCases: [string, Record<string, unknown> | undefined][] = [];

  for (let index = 0; index < lines.length; index++) {
    const logLine = lines[index].trim();
    if (!logLine || logLine.startsWith('#')) continue;
    if (logLine.startsWith('{'))
      throw new Error(`Orphan expected JSON in ${fileName}:${index + 1}`);
    const expectedLine = lines[index + 1]?.trim();
    if (expectedLine?.startsWith('{')) {
      // Malformed expectations must fail the suite rather than disappear from coverage.
      testCases.push([logLine, JSON.parse(expectedLine)]);
      index++;
    } else {
      // Raw examples without expected JSON still have to be recognized.
      testCases.push([logLine, undefined]);
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
      if (expected === undefined) expect(rawResult).not.toBeNull();
      else expect(result).toEqual(expected);
    });
  });

  describe('Windows Log Parsing', () => {
    const testData = parseTestData('windows_test_logs.test_log');

    test.each(testData)('should parse Windows log line correctly: %s', (logLine, expected) => {
      const rawResult = parseLogFormat(logLine);
      const result = transformToExpectedFormat(rawResult);
      if (expected === undefined) expect(rawResult).not.toBeNull();
      else expect(result).toEqual(expected);
    });
  });

  describe('Android Log Parsing', () => {
    const testData = parseTestData('android_test_logs.test_log');

    test.each(testData)('should parse Android log line correctly: %s', (logLine, expected) => {
      const rawResult = parseLogFormat(logLine);
      const result = transformToExpectedFormat(rawResult);
      if (expected === undefined) expect(rawResult).not.toBeNull();
      else expect(result).toEqual(expected);
    });
  });

  describe('Linux Log Parsing', () => {
    const testData = parseTestData('linux_test_logs.test_log');

    test.each(testData)('should parse Linux log line correctly: %s', (logLine, expected) => {
      const rawResult = parseLogFormat(logLine);
      const result = transformToExpectedFormat(rawResult);
      if (expected === undefined) expect(rawResult).not.toBeNull();
      else expect(result).toEqual(expected);
    });
  });
});
