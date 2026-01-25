/**
 * File Loading Utilities
 * Handles reading and loading log files
 */

// Generate unique file identifier
export const getFileIdentifier = (file) => {
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
export const getFileDisplayName = (fileId) => {
  if (!fileId) return '';

  // If it contains the size and timestamp pattern, extract just the filename
  const sizeTimestampPattern = /^(.+)_\d+_\d+$/;
  const match = fileId.match(sizeTimestampPattern);
  let name = fileId;
  if (match) {
    name = match[1];
  } else if (fileId.includes('/')) {
    name = fileId.split('/').pop();
  }

  // Shorten to max 30 chars from the end (show suffix)
  if (name.length > 30) {
    return '...' + name.slice(-30);
  }
  return name;
};

// Returns the full file path/name for tooltip/hover, including folder if present
export const getFileFullName = (fileId) => {
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

// Parse header information from log content
export const parseHeaderInfo = (content) => {
  const lines = content.split('\n');
  const headerData = {};
  const headerLines = [];

  // Check first 10 lines for headers
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].trim();

    if (line.startsWith('User:')) {
      headerData.user = line.substring(5).trim();
      headerLines.push(i);
    } else if (line.startsWith('Account:')) {
      headerData.account = line.substring(8).trim();
      headerLines.push(i);
    } else if (line.startsWith('Client version:')) {
      headerData.clientVersion = line.substring(15).trim();
      headerLines.push(i);
    } else if (line.startsWith('OS version:')) {
      headerData.osVersion = line.substring(11).trim();
      headerLines.push(i);
    }
  }

  return { headerData, headerLines };
};

/**
 * Load a log file and parse its content
 * @param {File} file - The file to load
 * @param {Function} parseLogContent - Parser function to parse log content
 * @returns {Promise} Promise that resolves with {fileId, logs, headerData}
 */
export const loadLogFile = (file, parseLogContent) => {
  return new Promise((resolve, reject) => {
    const fileId = getFileIdentifier(file);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        
        // Parse header information from start of file
        const { headerData, headerLines } = parseHeaderInfo(content);
        
        // Parse the log content using the provided parser
        const logs = parseLogContent(content, headerLines);
        
        resolve({
          fileId,
          logs,
          headerData
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    reader.readAsText(file);
  });
};
