import type { LogHeaders, LogRecord } from '../domain/logRecord';
import { parseLogFile } from '../services/logParserClient';

/**
 * File Loading Utilities
 * Handles reading and loading log files
 */

// Generate unique file identifier
export const getFileIdentifier = (file: File) => {
  // Priority order for file identification:
  // 1. Full path if available (webkitRelativePath or path property)
  // 2. File name with last modified time for uniqueness
  // 3. File name only as fallback

  if (file.webkitRelativePath && file.webkitRelativePath !== '') {
    return file.webkitRelativePath;
  }

  // For drag-and-drop files, try to use the file name with size and modified date for uniqueness
  if (file.lastModified && file.size) {
    return `${file.name}_${file.size}_${file.lastModified}`;
  }

  // Fallback to just the file name
  return file.name;
};

// Returns a shortened display name (max 30 chars from the end, showing suffix)
export const getFileDisplayName = (fileId: string | null | undefined): string => {
  if (!fileId) return '';

  // Strip live: prefix from live-log tab IDs
  const id = fileId.startsWith('live:') ? fileId.slice(5) : fileId;

  // If it contains the size and timestamp pattern, extract just the filename
  const sizeTimestampPattern = /^(.+)_\d+_\d+$/;
  const match = id.match(sizeTimestampPattern);
  let name = id;
  if (match) {
    name = match[1];
  } else if (id.includes('/')) {
    name = id.split('/').pop() || id;
  }

  // Shorten to max 30 chars from the end (show suffix)
  if (name.length > 30) {
    return '...' + name.slice(-30);
  }
  return name;
};

// Returns the full file path/name for tooltip/hover, including folder if present
export const getFileFullName = (fileId: string | null | undefined): string => {
  if (!fileId) return '';
  // If it contains the size and timestamp pattern, extract just the filename with path
  const sizeTimestampPattern = /^(.+)_\d+_\d+$/;
  const match = fileId.match(sizeTimestampPattern);
  let fullPath = fileId;
  if (match) {
    fullPath = match[1];
  }
  // If it's a path, show the last two segments (folder + file)
  if (fullPath.includes('/')) {
    const parts = fullPath.split('/');
    if (parts.length >= 2) {
      return parts.slice(-2).join('/');
    }
    return fullPath;
  }
  return fullPath;
};

export { parseHeaderInfo } from '../domain/logHeaders';

export interface LoadedLogFile {
  fileId: string;
  logs: LogRecord[];
  headerData: LogHeaders;
}

export async function loadLogFile(file: File): Promise<LoadedLogFile> {
  if (file.size > 256 * 1024 * 1024) throw new Error('Log files must be smaller than 256 MB.');
  const result = await parseLogFile(file);
  return { fileId: getFileIdentifier(file), ...result };
}
