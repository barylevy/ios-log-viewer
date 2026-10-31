import type { LogHeaders } from './logRecord';

// Parse header information from log content
export const parseHeaderInfo = (content: string) => {
  const lines = content.split('\n');
  const headerData: LogHeaders = {};
  const headerLines: number[] = [];
  const rawHeaderLines: string[] = [];

  // Recognize a "Key: Value" style line where Key uses letters/spaces/_/-
  // and the line does not start with a digit/timestamp/bracket. We scan the
  // first ~15 lines and stop at the first line that doesn't look like a
  // header (so we don't accidentally pick up colons inside log records).
  const headerLineRegex = /^([A-Za-z][A-Za-z0-9 _-]*?):\s*(.+)$/;

  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      // Allow a single blank line within the header block
      if (rawHeaderLines.length > 0) continue;
      continue;
    }
    // Skip obvious log-record starters
    if (/^[[\d]/.test(line)) break;
    const m = line.match(headerLineRegex);
    if (!m) {
      if (rawHeaderLines.length > 0) break;
      continue;
    }

    rawHeaderLines.push(line);
    headerLines.push(i);

    // Map well-known fields onto the structured headerData so the rest of
    // the app continues to work unchanged.
    if (line.startsWith('User:')) {
      headerData.user = line.substring(5).trim();
    } else if (line.startsWith('Account:')) {
      headerData.account = line.substring(8).trim();
    } else if (line.startsWith('Client version:')) {
      headerData.clientVersion = line.substring(15).trim();
    } else if (line.startsWith('OS version:')) {
      headerData.osVersion = line.substring(11).trim();
    }
  }

  if (rawHeaderLines.length) headerData.rawLines = rawHeaderLines;
  return { headerData, headerLines };
};
