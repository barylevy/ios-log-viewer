import { readFileText } from '../utils/readFileText';
import { parseLogContent } from '../LogParser';
import { parseHeaderInfo } from './logHeaders';
import type { LogHeaders, LogRecord } from './logRecord';

export interface ParsedFile {
  logs: LogRecord[];
  headerData: LogHeaders;
}

export async function parseFileContents(file: File): Promise<ParsedFile> {
  const text = await readFileText(file);
  const { headerData, headerLines } = parseHeaderInfo(text);
  return { headerData, logs: parseLogContent(text, headerLines) };
}
