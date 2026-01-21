// Centralized date/time parsing utilities for the log viewer

// Compiled patterns for cleanMessage function
export const CLEAN_PATTERNS = {
    DATE_TIME_PREFIX: /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[:\.]?\d*\s*/,
    DD_MM_YY_PREFIX: /^\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s*/,
    DD_MM_YYYY_PREFIX: /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s*/,
    BRACKET_TIME: /^\[\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\]\s*/,
    CHROME_METADATA: /^\[\d+:\d+:\d{4}\/\d{6}\.\d{3}:[A-Z]+:[^\]]+\](?:\s+\[[^\]]+\])?\s*/, // Remove Chrome format metadata
    WINDOWS_METADATA: /^\[[\d\/]+\s[\d:.]+\]\s+\[[^\]]+\]\s+\[[^\]]+\]\s+\[\d+\]\s+\[\d+\]\s+/, // Remove Windows format metadata
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
 * Format a YYYY-MM-DD date string to human-readable format with month name
 * @param {string} dateStr - Date in YYYY-MM-DD format (e.g., "2025-05-23")
 * @returns {string} - Formatted date (e.g., "23-May-2025")
 */
export const formatDateWithMonthName = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  
  // Parse YYYY-MM-DD format
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  
  const [, year, month, day] = match;
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const monthIndex = parseInt(month, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return dateStr;
  
  const monthName = monthNames[monthIndex];
  const dayNum = parseInt(day, 10);
  
  return `${dayNum}-${monthName}-${year}`;
};

/**
 * Detect date format (MM/DD/YY vs DD/MM/YY) from log content
 * Strategy:
 * 1. First look for dates where one value > 12 (unambiguous)
 * 2. If all dates ambiguous, check chronological ordering
 * @param {string} content - Log file content
 * @returns {'MM/DD/YY' | 'DD/MM/YY'} - Detected format
 */
export const detectDateFormat = (content) => {
    const lines = content.split('\n');
    let mmddyyCount = 0;
    let ddmmyyCount = 0;
    const ambiguousDates = [];
    
    for (const line of lines) {
        // Only look for dates at the START of the line (with or without brackets)
        const bracketedMatch = line.match(/^\[(\d{2})\/(\d{2})\/(\d{2})\s\d{2}:\d{2}:\d{2}\.\d{3}\]/);
        const plainMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{2})\s\d{2}:\d{2}:\d{2}\.\d{3}/);
        
        const match = bracketedMatch || plainMatch;
        if (match) {
            const first = parseInt(match[1]);
            const second = parseInt(match[2]);
            const year = parseInt(match[3]);
            
            // If first > 12, must be DD/MM/YY (day can't be month)
            if (first > 12) {
                ddmmyyCount++;
            }
            // If second > 12, must be MM/DD/YY (month can't be > 12)
            else if (second > 12) {
                mmddyyCount++;
            }
            // If both <= 12, save for chronological check
            else if (ambiguousDates.length < 1000) { // Limit sample size
                ambiguousDates.push({ first, second, year });
            }
        }
    }
    
    // If we found clear indicators, use them
    if (mmddyyCount > 0 || ddmmyyCount > 0) {
        return mmddyyCount >= ddmmyyCount ? 'MM/DD/YY' : 'DD/MM/YY';
    }
    
    // All dates ambiguous - check chronological ordering
    if (ambiguousDates.length > 1) {
        let mmddyyInversions = 0;
        let ddmmyyInversions = 0;
        
        for (let i = 1; i < ambiguousDates.length; i++) {
            const prev = ambiguousDates[i - 1];
            const curr = ambiguousDates[i];
            
            // Check MM/DD/YY interpretation (first=month, second=day)
            const prevMmDdYy = prev.year * 10000 + prev.first * 100 + prev.second;
            const currMmDdYy = curr.year * 10000 + curr.first * 100 + curr.second;
            if (prevMmDdYy > currMmDdYy) mmddyyInversions++;
            
            // Check DD/MM/YY interpretation (first=day, second=month)
            const prevDdMmYy = prev.year * 10000 + prev.second * 100 + prev.first;
            const currDdMmYy = curr.year * 10000 + curr.second * 100 + curr.first;
            if (prevDdMmYy > currDdMmYy) ddmmyyInversions++;
        }
        
        // Choose format with fewer chronological inversions
        return mmddyyInversions < ddmmyyInversions ? 'MM/DD/YY' : 'DD/MM/YY';
    }
    
    // Fallback (extremely rare - single date or empty file)
    return 'DD/MM/YY';
};

/**
 * Extract timestamp from a log line - supports multiple formats
 * @param {string} line - The log line to parse
 * @returns {string} - Extracted timestamp or empty string
 */
export const extractTimestamp = (line) => {
    if (!line) return '';

    // Try to extract timestamp from common log formats with milliseconds
    // Order matters! Check Windows/DD/MM/YY formats FIRST before generic ISO dates
    const timestampPatterns = [
        // Windows formats at the beginning of line (prioritize these)
        /^\[(\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\]/,  // [23/08/25 20:12:54.294] at start
        /^(\d{2}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})/,  // 19/08/25 08:38:58.203 at start
        /^(\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}:\d{2}\.\d{3})/,  // 19/08/2025 08:38:58.203 at start
        // ISO formats with milliseconds
        /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}:\d{3})/,  // 2025-08-02 23:54:57:514 at start
        /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3,6})/,  // 2025-08-02 23:54:57.514 at start
        /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/,        // 2025-08-02 23:54:57 at start
        // Android format
        /\[(\d{4}-[A-Za-z]{3}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\]/,  // [2025-Jul-28 22:34:49.399]
        // Generic patterns (fallback - may match anywhere in line)
        /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}:\d{3})/,  // 2025-08-02 23:54:57:514
        /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3,6})/,  // 2025-08-02 23:54:57.514
        /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/,        // 2025-08-02 23:54:57
        /(\d{2}:\d{2}:\d{2}:\d{3})/,                      // 23:54:57:514
        /(\d{2}:\d{2}:\d{2}\.\d{3,6})/,                   // 23:54:57.514
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6})/,  // 2025-08-02T23:54:57.514
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/          // 2025-08-02T23:54:57
    ];

    for (const pattern of timestampPatterns) {
        const match = line.match(pattern);
        if (match) return match[1];
    }
    return '';
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
