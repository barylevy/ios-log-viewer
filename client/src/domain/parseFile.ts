import { parseLogContent } from '../LogParser';
import { parseHeaderInfo } from './logHeaders';
import type { LogHeaders, LogRecord } from './logRecord';

export interface ParsedFile {
  logs: LogRecord[];
  headerData: LogHeaders;
}

async function readText(file: File): Promise<string> {
  if (file.text) return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
    reader.readAsText(file);
  });
}

export async function parseFileContents(file: File): Promise<ParsedFile> {
  const text = await readText(file);
  const { headerData, headerLines } = parseHeaderInfo(text);
  return { headerData, logs: parseLogContent(text, headerLines) };
}
