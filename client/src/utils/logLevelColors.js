// Log level color utilities
import { LOG_LEVEL_MATRIX } from '../constants';
import { CLEAN_PATTERNS } from '../dateTimeUtils';

// Helper function to clean the message text - optimized with compiled patterns
export const cleanMessage = (message) => {
    if (!message) return '';

    // Remove timestamp prefixes using compiled patterns
    let cleaned = message
        .replace(CLEAN_PATTERNS.CHROME_METADATA, '') // Remove Chrome format metadata first
        .replace(CLEAN_PATTERNS.WINDOWS_METADATA, '') // Remove Windows format metadata
        .replace(CLEAN_PATTERNS.DATE_TIME_PREFIX, '') // Remove date-time prefix (YYYY-MM-DD HH:mm:ss)
        .replace(CLEAN_PATTERNS.DD_MM_YY_PREFIX, '') // Remove DD/MM/YY HH:mm:ss.SSS prefix
        .replace(CLEAN_PATTERNS.DD_MM_YYYY_PREFIX, '') // Remove DD/MM/YYYY HH:mm:ss.SSS prefix
        .replace(CLEAN_PATTERNS.BRACKET_TIME, '') // Remove [MM/dd/yy HH:mm:ss.fff]
        .replace(CLEAN_PATTERNS.PID, '') // Remove [PID]
        .replace(CLEAN_PATTERNS.DOUBLE_BRACKET, ''); // Remove other bracketed info at start

    // Remove iOS-style metadata prefix
    const iosMatch = cleaned.match(CLEAN_PATTERNS.IOS_METADATA);
    if (iosMatch) {
        cleaned = iosMatch[1];
    }

    // Remove comprehensive log level indicators using LOG_LEVEL_MATRIX
    for (const [level, ...patterns] of LOG_LEVEL_MATRIX) {
        for (const pattern of patterns) {
            if (cleaned.includes(pattern)) {
                // Remove the pattern from the line
                cleaned = cleaned.replace(pattern, '');
            }
        }
    }

    // Remove basic log level indicators using compiled patterns (fallback)
    cleaned = cleaned
        .replace(CLEAN_PATTERNS.LOG_LEVEL_SPACE, '') // Remove single letter + space at start
        .replace(CLEAN_PATTERNS.LOG_LEVEL_COLON, '') // Remove single letter + colon + space at start
        .replace(CLEAN_PATTERNS.LOG_LEVEL_WORD, '$1') // Remove "D " before "catoapi:"
        .replace(CLEAN_PATTERNS.FILE_LINE, ''); // Remove [file:line] patterns

    // Clean up whitespace: trim and normalize multiple spaces to single space
    cleaned = cleaned.trim().replace(/\s+/g, ' ');

    return cleaned;
};

// Get background colors for sticky log labels (lighter colors)
export const getLevelBackgroundColor = (level) => {
    switch (level) {
        case 'error':
            return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-200 dark:border-red-700';
        case 'warning':
            return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700';
        case 'info':
            return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-700';
        case 'debug':
            return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700';
        case 'trace':
            return 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700';
        default:
            return 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700';
    }
};

// Get button background colors for modal/interactive elements (darker colors)
export const getLevelButtonColor = (level) => {
    switch (level) {
        case 'error':
            return 'bg-red-500 hover:bg-red-600 text-white';
        case 'warning':
            return 'bg-yellow-500 hover:bg-yellow-600 text-white';
        case 'info':
            return 'bg-blue-500 hover:bg-blue-600 text-white';
        case 'debug':
            return 'bg-green-500 hover:bg-green-600 text-white';
        case 'trace':
            return 'bg-gray-500 hover:bg-gray-600 text-white';
        default:
            return 'bg-orange-500 hover:bg-orange-600 text-white'; // Default orange for unknown levels
    }
};

// Get text colors for log level indicators
export const getLevelTextColor = (level) => {
    switch (level) {
        case 'error': return 'text-red-600 dark:text-red-400';
        case 'warning': return 'text-yellow-600 dark:text-yellow-400';
        case 'info': return 'text-blue-600 dark:text-blue-400';
        case 'debug': return 'text-green-600 dark:text-green-400';
        case 'trace': return 'text-gray-600 dark:text-gray-400';
        default: return 'text-gray-800 dark:text-gray-200';
    }
};
