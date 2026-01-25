/**
 * Log Parsing Utilities
 * Centralizes all log parsing-related functions and regex patterns
 */

// Date range patterns
export const DATE_RANGE_REGEX = /(^|\s)::\s*#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)/; // :: #date
export const DATE_START_REGEX = /#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)\s*::/; // #date ::
export const DATE_BOTH_REGEX = /#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)\s*::\s*#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)/; // #date :: #date

// Row range patterns
export const ROW_RANGE_REGEX = /(^|\s)::\s*#(\d+)(?!\d{4})/; // :: #600 (but not :: #2025...)
export const ROW_START_REGEX = /#(\d+)(?!\d{4})\s*::/; // #415 :: (but not #2025...)
export const ROW_BOTH_REGEX = /#(\d+)(?!\d{4})\s*::\s*#(\d+)(?!\d{4})/; // #415 :: #600

// Mixed range patterns: row to date or date to row
export const ROW_TO_DATE_REGEX = /#(\d+)(?!\d{4})\s*::\s*#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)/; // #9 :: #2025-07-04 13:29:11:645
export const DATE_TO_ROW_REGEX = /#(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2}(?:[:.]\d{3})?)?)\s*::\s*#(\d+)(?!\d{4})/; // #2025-07-04 13:29:11:645 :: #500

/**
 * Re-export all parsing functions from LogParser for centralized access
 */
export {
  extractLogLevel,
  extractModule,
  extractThread,
  extractProcess,
  normalizeTimestamp,
  parseLogLine,
  parseLogContent,
  parseLogFormat,
  parseWindowsLogFormat
} from '../LogParser';

/**
 * Re-export datetime utilities for parsing
 */
export {
  extractTimestamp,
  extractTimeGapFromSearch,
  GAP_PATTERN,
  formatTimeGap,
  formatDateWithMonthName,
  detectDateFormat,
  CLEAN_PATTERNS
} from '../dateTimeUtils';
