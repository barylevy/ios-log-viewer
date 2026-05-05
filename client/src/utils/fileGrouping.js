/**
 * Utility functions for grouping log files by prefix
 * Used for Windows logs which are divided into multiple groups with prefixes
 */

import { parseLogFormat } from '../LogParser.js';

/**
 * Check if a file has a valid log extension
 * @param {File} file - The file object
 * @returns {boolean} True if file has .txt, .log, or .ips extension
 */
export function hasValidLogExtension(file) {
  const name = file.name.toLowerCase();
  return name.endsWith('.txt') || name.endsWith('.log') || name.endsWith('.ips');
}

/**
 * Natural sort comparison for filenames with numbers
 * Correctly sorts files like: cato_dem.1.log, cato_dem.2.log, ... cato_dem.10.log
 * @param {string} a - First filename
 * @param {string} b - Second filename
 * @returns {number} Comparison result
 */
export function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

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
  
  // Sort files within each group by name (natural sort for numbered files)
  groups.forEach((fileList, prefix) => {
    fileList.sort((a, b) => naturalSort(a.name, b.name));
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

/**
 * Extract the directory path from a file's webkitRelativePath
 * @param {File} file - The file object
 * @returns {string} The directory path (e.g., "folder1/subfolder") or empty string for root
 */
export function extractDirectory(file) {
  if (!file.webkitRelativePath) return '';
  
  const parts = file.webkitRelativePath.split('/');
  // Remove the filename (last part) and return the directory path
  parts.pop();
  return parts.join('/');
}

/**
 * Group files by subdirectory structure and prefix
 * 
 * Logic:
 * - If files are in MULTIPLE subdirectories (e.g., AppLogs/, DemLogs/, SystemLogs/):
 *   Each subdirectory becomes ONE merged group (all files together)
 * 
 * - If all files are in ONE directory or flat structure:
 *   Group files by prefix (e.g., cato_dem, cato_vpn, cato_ua)
 * 
 * @param {File[]} files - Array of File objects
 * @returns {Map<string, File[]>} Map of group key to array of files
 */
export function groupFilesByDirectory(files) {
  // First, group by directory
  const dirGroups = new Map();
  
  files.forEach(file => {
    const dir = extractDirectory(file);
    
    if (!dirGroups.has(dir)) {
      dirGroups.set(dir, []);
    }
    
    dirGroups.get(dir).push(file);
  });
  
  // Check if we have MULTIPLE subdirectories with valid log files
  // Ignore subdirectories that only contain non-log files
  const validDirectories = Array.from(dirGroups.entries())
    .filter(([dir, files]) => {
      if (dir === '') return false; // Skip root
      // Only count directories that have at least one valid log file
      return files.some(hasValidLogExtension);
    })
    .map(([dir]) => dir);
  
  const hasMultipleSubdirectories = validDirectories.length > 1;
  
  if (hasMultipleSubdirectories) {
    // Detect a "root parent" directory: when files were picked via the folder
    // picker, every entry's webkitRelativePath starts with the picked folder
    // name, so root-level files have a non-empty `dir` that is also a strict
    // ancestor of every other directory. Treat that parent as root.
    const allDirs = Array.from(dirGroups.keys()).filter(d => d !== '');
    const rootParent = allDirs.find(candidate =>
      allDirs.every(d => d === candidate || d.startsWith(candidate + '/'))
    );

    // If we have MULTIPLE subdirectories, each subdirectory becomes ONE group (no prefix splitting)
    const finalGroups = new Map();
    
    dirGroups.forEach((filesInDir, dir) => {
      if (dir && dir !== rootParent) {
        // Only include subdirectories that have valid log files,
        // and only include the valid log files (filter out .pcap, etc.)
        const validFiles = filesInDir.filter(hasValidLogExtension);
        if (validFiles.length > 0) {
          // Sort files by name (natural sort for numbered files)
          validFiles.sort((a, b) => naturalSort(a.name, b.name));
          finalGroups.set(dir, validFiles);
        }
        // Subdirectories without valid log files are ignored
      } else {
        // Root directory (either empty webkitRelativePath, or the common
        // parent folder): group by filename prefix so each root-level file
        // becomes its own tab named after the file.
        const validRootFiles = filesInDir.filter(hasValidLogExtension);
        const prefixGroups = groupFilesByPrefix(validRootFiles);
        prefixGroups.forEach((groupedFiles, prefix) => {
          finalGroups.set(prefix, groupedFiles);
        });
      }
    });
    
    return finalGroups;
  } else {
    // No subdirectories OR only one directory: use prefix-based grouping for all files
    // Combine all files from all directory groups and apply prefix grouping
    const allFiles = [];
    dirGroups.forEach((filesInDir) => {
      allFiles.push(...filesInDir);
    });

    return groupFilesByPrefix(allFiles.filter(hasValidLogExtension));
  }
}

/**
 * Detect the log format of a single file by reading the first chunk
 * and trying parseLogFormat on each non-empty line.
 * Returns a format string (e.g. 'ios-macos', 'windows-unified', 'linux'…)
 * or 'unknown' when no known pattern matches.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function detectFileFormat(file) {
  try {
    // Read up to ~16KB — plenty for header noise + several real log lines
    const blob = file.slice(0, 16384);
    const text = await blob.text();
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = parseLogFormat(line);
      if (parsed && parsed.format) {
        return parsed.format;
      }
    }
  } catch {
    // Ignore read errors and fall through to 'unknown'
  }
  return 'unknown';
}

/**
 * Like groupFilesByDirectory, but additionally splits each multi-file group
 * by detected log format so files only share a tab if they share a pattern.
 *
 * Behavior:
 * - Single-file groups are returned as-is.
 * - Multi-file groups where every file has the same format are kept merged.
 * - Multi-file groups with mixed formats are split:
 *   - Files of the same known format are merged into one sub-group, key
 *     becomes `${groupKey} [${format}]`.
 *   - Files of unknown format each get their own tab keyed by file path so
 *     unrelated free-form text files aren't merged together.
 *
 * @param {File[]} files
 * @returns {Promise<Map<string, File[]>>}
 */
export async function groupFilesByDirectoryAndFormat(files) {
  const baseGroups = groupFilesByDirectory(files);
  const finalGroups = new Map();

  for (const [groupKey, groupFiles] of baseGroups.entries()) {
    if (groupFiles.length <= 1) {
      finalGroups.set(groupKey, groupFiles);
      continue;
    }

    const formats = await Promise.all(groupFiles.map(detectFileFormat));

    const byFormat = new Map();
    groupFiles.forEach((file, i) => {
      const fmt = formats[i];
      if (!byFormat.has(fmt)) byFormat.set(fmt, []);
      byFormat.get(fmt).push(file);
    });

    // Single known format -> keep merged.
    // Single unknown format or mixed -> split (unknown files get one tab each).
    if (byFormat.size === 1 && !byFormat.has('unknown')) {
      finalGroups.set(groupKey, groupFiles);
      continue;
    }

    byFormat.forEach((filesOfFormat, fmt) => {
      if (fmt === 'unknown') {
        // Unrelated free-form files: one tab per file
        filesOfFormat.forEach(file => {
          const key = `${groupKey}/${file.name}`;
          finalGroups.set(key, [file]);
        });
      } else if (byFormat.size === 1) {
        // Only one (known) format present alongside no others -> keep groupKey
        finalGroups.set(groupKey, filesOfFormat);
      } else {
        const key = `${groupKey} [${fmt}]`;
        finalGroups.set(key, filesOfFormat);
      }
    });
  }

  return finalGroups;
}
