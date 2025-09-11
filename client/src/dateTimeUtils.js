// Centralized date/time parsing utilities for the log viewer

// Compiled regex patterns for better performance
export const DATE_PATTERNS = {
    ISO_DATE: /(\d{4}-\d{2}-\d{2})/,
    BRACKET_DATE: /\[(\d{2})\/(\d{2})\/(\d{2})/,
    ALT_DATE: /(\d{2}\/\d{2}\/\d{4})/,
    SHORT_DATE: /(\d{2}\/\d{2}\/\d{2})/
};

export const TIME_PATTERNS = {
    WITH_MS: /(\d{2}:\d{2}:\d{2})[:.](\d{3,6})/,
    WITHOUT_MS: /(\d{2}:\d{2}:\d{2})/
};

export const TIMESTAMP_PATTERNS = {
    FULL_TIMESTAMP: /(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})[:.](\d{3})/,
    DATE_TIME: /(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2}:\d{2})/,
    DD_MM_YY: /(\d{2})\/(\d{2})\/(\d{2})\s(\d{2}):(\d{2}):(\d{2})\.(\d{3})/,
    DD_MM_YYYY: /(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
};

// Compiled patterns for cleanMessage function
export const CLEAN_PATTERNS = {
    DATE_TIME_PREFIX: /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[:\.]?\d*\s*/,
    DD_MM_YY_PREFIX: /^\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s*/,
    DD_MM_YYYY_PREFIX: /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s*/,
    BRACKET_TIME: /^\[\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\]\s*/,
    PID: /\[\d+\]\s*/,
    DOUBLE_BRACKET: /\[.*?\]\s*\[.*?\]\s*/,
    IOS_METADATA: /^.*?\s+0x[\da-fA-F]+\s+\w+\s+0x[\da-fA-F]+\s+\d+\s+\d+\s+(.+)$/,
    LOG_LEVEL_SPACE: /^[DIWETVF]\s+/g,
    LOG_LEVEL_COLON: /^[DIWETVF]:\s*/g,
    LOG_LEVEL_WORD: /^\s*[DIWETVF]\s+(\w+:)/,
    FILE_LINE: /\[[\w\.]+:\d+\]/g
};

export const GAP_PATTERN = /#gap=(\d+(?:\.\d+)?)/i;

/**
 * Extract timestamp from a log line - supports multiple formats
 * @param {string} line - The log line to parse
 * @returns {string} - Extracted timestamp or empty string
 */
export const extractTimestamp = (line) => {
    if (!line) return '';

    // Try to extract timestamp from common log formats with milliseconds
    const timestampPatterns = [
        /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}:\d{3})/,  // 2025-08-02 23:54:57:514
        /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3,6})/,  // 2025-08-02 23:54:57.514 or .514123
        /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/,        // 2025-08-02 23:54:57 (fallback without ms)
        /(\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})/,  // 19/08/25 08:38:58.203
        /(\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}:\d{2}\.\d{3})/,  // 19/08/2025 08:38:58.203
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

/**
 * Extract time portion from timestamp - for display purposes
 * @param {string} timestamp - The timestamp to parse
 * @returns {string|null} - Formatted time string (HH:mm:ss.SSS) or null
 */
export const extractTimeFromTimestamp = (timestamp) => {
    if (!timestamp) return null;

    // Try to match time with milliseconds first
    const timeWithMsMatch = timestamp.match(TIME_PATTERNS.WITH_MS);
    if (timeWithMsMatch) {
        const time = timeWithMsMatch[1];
        const ms = timeWithMsMatch[2].substring(0, 3); // Take only first 3 digits for milliseconds
        return `${time}.${ms}`;
    }

    // Fallback to time without milliseconds
    const timeMatch = timestamp.match(TIME_PATTERNS.WITHOUT_MS);
    return timeMatch ? timeMatch[1] : null;
};

/**
 * Parse timestamp into milliseconds for time gap calculations
 * @param {string} timestamp - The timestamp to parse
 * @returns {number|null} - Milliseconds since epoch or null
 */
export const parseTimestampToMs = (timestamp) => {
    if (!timestamp) return null;

    // Try to extract full timestamp: 2025-08-26 11:05:21:299 or 2025-08-26 11:05:21.299
    const fullMatch = timestamp.match(TIMESTAMP_PATTERNS.FULL_TIMESTAMP);
    if (fullMatch) {
        const [, year, month, day, hours, minutes, seconds, ms] = fullMatch;
        return new Date(year, month - 1, day, hours, minutes, seconds, parseInt(ms)).getTime();
    }

    // Try DD/MM/YY format: 19/08/25 08:38:58.203
    const ddmmyyMatch = timestamp.match(TIMESTAMP_PATTERNS.DD_MM_YY);
    if (ddmmyyMatch) {
        const [, day, month, year, hours, minutes, seconds, ms] = ddmmyyMatch;
        // Assume 20XX for years 00-29, 19XX for years 30-99
        const fullYear = parseInt(year) <= 29 ? 2000 + parseInt(year) : 1900 + parseInt(year);
        return new Date(fullYear, month - 1, day, hours, minutes, seconds, parseInt(ms)).getTime();
    }

    // Try DD/MM/YYYY format: 19/08/2025 08:38:58.203
    const ddmmyyyyMatch = timestamp.match(TIMESTAMP_PATTERNS.DD_MM_YYYY);
    if (ddmmyyyyMatch) {
        const [, day, month, year, hours, minutes, seconds, ms] = ddmmyyyyMatch;
        return new Date(year, month - 1, day, hours, minutes, seconds, parseInt(ms)).getTime();
    }

    // Fallback: Extract date and time separately and combine
    const dateTimeMatch = timestamp.match(TIMESTAMP_PATTERNS.DATE_TIME);
    if (dateTimeMatch) {
        const [, datePart, timePart] = dateTimeMatch;
        const [year, month, day] = datePart.split('-');
        const [hours, minutes, seconds] = timePart.split(':');
        return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
    }

    return null;
};

/**
 * Extract date from timestamp for grouping purposes
 * @param {string} timestamp - The timestamp to parse
 * @returns {string|null} - Date string or null
 */
export const extractDateFromTimestamp = (timestamp) => {
    if (!timestamp) return null;

    // Try to extract date part from various timestamp formats:
    // 1. Standard ISO format: 2025-08-02
    const isoMatch = timestamp.match(DATE_PATTERNS.ISO_DATE);
    if (isoMatch) return isoMatch[1];

    // 2. DD/MM/YY format: 19/08/25
    const ddmmyyMatch = timestamp.match(/(\d{2})\/(\d{2})\/(\d{2})/);
    if (ddmmyyMatch) {
        const [, day, month, year] = ddmmyyMatch;
        const fullYear = parseInt(year) <= 29 ? 2000 + parseInt(year) : 1900 + parseInt(year);
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // 3. DD/MM/YYYY format: 19/08/2025
    const ddmmyyyyMatch = timestamp.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // 4. Bracketed format: [02/08/25
    const bracketMatch = timestamp.match(DATE_PATTERNS.BRACKET_DATE);
    if (bracketMatch) {
        const [, day, month, year] = bracketMatch;
        const fullYear = parseInt(year) <= 29 ? 2000 + parseInt(year) : 1900 + parseInt(year);
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // 5. Alternative format: 02/08/2025
    const altMatch = timestamp.match(DATE_PATTERNS.ALT_DATE);
    if (altMatch) {
        const [, day, month, year] = altMatch[1].split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return null;
};

/**
 * Extract time gap value from search text
 * @param {string} searchText - The search text to parse
 * @returns {number} - Gap value in seconds or 0
 */
export const extractTimeGapFromSearch = (searchText) => {
    if (!searchText) return 0;

    // Look for #gap=X pattern using compiled regex
    const gapMatch = searchText.match(GAP_PATTERN);
    if (gapMatch) {
        const gapValue = parseFloat(gapMatch[1]);
        return isNaN(gapValue) ? 0 : gapValue;
    }

    return 0;
};

/**
 * Format time gap duration for display
 * @param {number} gapSeconds - Gap in seconds
 * @returns {string} - Formatted gap string
 */
export const formatTimeGap = (gapSeconds) => {
    if (gapSeconds < 60) {
        return `${gapSeconds.toFixed(1)}s`;
    } else if (gapSeconds < 3600) {
        const minutes = Math.floor(gapSeconds / 60);
        const seconds = (gapSeconds % 60).toFixed(1);
        return `${minutes}m ${seconds}s`;
    } else {
        const hours = Math.floor(gapSeconds / 3600);
        const minutes = Math.floor((gapSeconds % 3600) / 60);
        const seconds = (gapSeconds % 60).toFixed(1);
        return `${hours}h ${minutes}m ${seconds}s`;
    }
};
