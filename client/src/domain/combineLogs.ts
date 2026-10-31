import type { LogRecord } from './logRecord';

export interface LogSource {
  id: string;
  logs: readonly LogRecord[];
}

/** A stable source identity survives sorting, tab switches, and live appends. */
export function combineLogs(sources: readonly LogSource[]): LogRecord[] {
  const records: LogRecord[] = [];
  const continuations = new Map<string, LogRecord[]>();
  for (const source of sources) {
    for (const record of source.logs) {
      const id = JSON.stringify([source.id, record.id]);
      const copy: LogRecord = {
        ...record,
        id,
        originalId: record.id,
        sourceFile: record.sourceFile || source.id,
        sourceTabId: source.id,
      };
      if (record.isContinuation && record.parentLogId !== undefined) {
        const parentId = JSON.stringify([source.id, record.parentLogId]);
        copy.parentLogId = parentId;
        const children = continuations.get(parentId) ?? [];
        children.push(copy);
        continuations.set(parentId, children);
      } else {
        records.push(copy);
      }
    }
  }
  records.sort((left, right) => {
    if (left.timestampMs !== null && right.timestampMs !== null)
      return left.timestampMs - right.timestampMs;
    // Undated records follow dated ones; equal timestamps retain source order.
    if (left.timestampMs === null && right.timestampMs !== null) return 1;
    if (left.timestampMs !== null && right.timestampMs === null) return -1;
    return 0;
  });
  const result: LogRecord[] = [];
  for (const record of records) {
    result.push(record, ...(continuations.get(String(record.id)) ?? []));
  }
  return result;
}
