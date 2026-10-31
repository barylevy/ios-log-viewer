import { parseLogContent } from '../LogParser';
import { detectDateFormat } from '../dateTimeUtils';
import type { DateFormat, LogRecord } from './logRecord';

export const MAX_LIVE_RECORDS = 20000;
export const MAX_LIVE_CHARACTERS = 2 * 1024 * 1024;

/** Retain complete records and reparse only the final, possibly incomplete record. */
export class LiveLogBuffer {
  private records: LogRecord[] = [];
  private tail = '';
  private tailLine = 1;
  private generation = 0;
  private dateFormat: DateFormat = 'DD/MM/YY';
  private processNames = new Map<string, string>();

  constructor(private readonly cutoff: number) {}

  reset(text: string): LogRecord[] {
    this.generation++;
    this.processNames.clear();
    text = this.boundedText(text);
    this.dateFormat = detectDateFormat(text);
    let records = parseLogContent(text, [], this.dateFormat);
    const firstToday = records.findIndex(
      (record) => record.timestampMs !== null && record.timestampMs >= this.cutoff,
    );
    if (records.some((record) => record.timestampMs !== null)) {
      const first = Math.min(
        firstToday < 0 ? records.length : firstToday,
        Math.max(0, records.length - 200),
      );
      if (first > 0) {
        text = text
          .split('\n')
          .slice(records[first].lineNumber - 1)
          .join('\n');
        records = parseLogContent(text, [], this.dateFormat);
      }
    }
    this.records = [];
    this.accept(text, records, 1);
    return this.records;
  }

  append(text: string): LogRecord[] {
    if (!text) return this.records;
    if (this.tail.length + text.length > MAX_LIVE_CHARACTERS) {
      // An exceptionally large single record is treated as a fresh bounded snapshot.
      return this.reset(this.tail + text);
    }
    const combinedTail = this.tail + text;
    const parsed = parseLogContent(combinedTail, [], this.dateFormat);
    if (this.records.length) this.records = this.records.slice(0, -1);
    this.accept(combinedTail, parsed, this.tailLine);
    return this.records;
  }

  private accept(text: string, parsed: LogRecord[], firstLine: number): void {
    const last = parsed[parsed.length - 1];
    if (last) {
      this.tail = text
        .split('\n')
        .slice(last.lineNumber - 1)
        .join('\n');
      this.tailLine = firstLine + last.lineNumber - 1;
    } else {
      this.tail = text;
    }
    for (const record of parsed) {
      record.lineNumber += firstLine - 1;
      record.id = `${this.generation}:${record.lineNumber}`;
      if (record.processName && record.processName !== record.process)
        this.processNames.set(record.process, record.processName);
      record.processName = this.processNames.get(record.process) || record.processName;
    }
    this.records = [...this.records, ...parsed];
    let characters = 0;
    let start = this.records.length;
    while (start > 0 && this.records.length - start < MAX_LIVE_RECORDS) {
      const length = this.records[start - 1].raw.length + 1;
      if (characters + length > MAX_LIVE_CHARACTERS) break;
      characters += length;
      start--;
    }
    this.records = this.records.slice(start);
    // The metadata cache follows retained records, so long sessions cannot grow it indefinitely.
    const retainedProcesses = new Set(this.records.map((record) => record.process));
    for (const process of this.processNames.keys())
      if (!retainedProcesses.has(process)) this.processNames.delete(process);
  }

  private boundedText(text: string): string {
    if (text.length <= MAX_LIVE_CHARACTERS) return text;
    const tail = text.slice(-MAX_LIVE_CHARACTERS);
    const newline = tail.indexOf('\n');
    return newline >= 0 ? tail.slice(newline + 1) : tail;
  }
}
