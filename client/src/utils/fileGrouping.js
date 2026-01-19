/**
 * Utility functions for grouping log files by prefix
 * Used for Windows logs which are divided into multiple groups with prefixes
 */

/**
 * Extract the prefix from a filename
 * For Windows logs, the prefix is everything before the first number or date pattern
 * Examples:
 *   "cato_vpn_5.17.3.8236_20250901075818.log" -> "cato_vpn"
 *   "cato_dem.1.log" -> "cato_dem"
 *   "CatoClient.Trace.5.16.5_2025-08-07.log" -> "CatoClient.Trace"
 *   "MSI1b377.LOG" -> "MSI"
 *   "cato_dem_5.11.18.3314.1.log" -> "cato_dem"
 * 
 * @param {string} fileName - The file name
 * @returns {string} The prefix (everything before first digit)
 */
export function extractFilePrefix(fileName) {
  // Remove extension
  const nameWithoutExt = fileName.replace(/\.(txt|log|json|etl|evtx)$/i, '');
  
  // Match everything up to (but not including) the first digit
  // This allows letters, underscores, dots, and hyphens in the prefix
  const match = nameWithoutExt.match(/^([^0-9]+)/);
  
  if (match) {
    let prefix = match[1];
    // Remove trailing underscores, dots, or hyphens
    prefix = prefix.replace(/[_.\-]+$/, '');
    return prefix;
  }
  
  // If no match (starts with digit), return the whole name
  return nameWithoutExt;
}

/**
 * Group files by their prefix
 * @param {File[]} files - Array of File objects
 * @returns {Map<string, File[]>} Map of prefix to array of files
 */
export function groupFilesByPrefix(files) {
  const groups = new Map();
  
  files.forEach(file => {
    const prefix = extractFilePrefix(file.name);
    
    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }
    
    groups.get(prefix).push(file);
  });
  
  // Sort files within each group by name
  groups.forEach((fileList, prefix) => {
    fileList.sort((a, b) => a.name.localeCompare(b.name));
  });
  
  return groups;
}

/**
 * Check if a file is likely part of a Windows log group
 * (has date/number suffix pattern suggesting it's part of a series)
 * @param {string} fileName - The file name
 * @returns {boolean} True if file appears to be part of a group
 */
export function isPartOfFileGroup(fileName) {
  const nameWithoutExt = fileName.replace(/\.(txt|log)$/i, '');
  
  // Check for date patterns: 2024-01-15, 20240115, 2024_01_15
  const hasDatePattern = /\d{4}[-_]?\d{2}[-_]?\d{2}/.test(nameWithoutExt);
  
  // Check for number patterns: _001, _part1, _1, -001
  const hasNumberPattern = /[_-](part|p)?\d+$/.test(nameWithoutExt);
  
  return hasDatePattern || hasNumberPattern;
}

/**
 * Get a display name for a file group
 * @param {string} prefix - The group prefix
 * @param {File[]} files - The files in the group
 * @returns {string} Display name like "AppLog (3 files)"
 */
export function getGroupDisplayName(prefix, files) {
  return `${prefix} (${files.length} file${files.length > 1 ? 's' : ''})`;
}
