import type { LogRecord } from './logRecord';

/** Prefer an exact source line; equal distances retain the first displayed record. */
export function findNearestLogIndex(
  logs: readonly LogRecord[],
  lineNumber: number,
  sourceFile: string | null = null,
): number {
  let nearest = -1;
  let distance = Infinity;
  for (let index = 0; index < logs.length; index++) {
    const log = logs[index];
    if (sourceFile && log.sourceFile !== sourceFile) continue;
    const candidate = Math.abs(log.lineNumber - lineNumber);
    if (candidate === 0) return index;
    if (candidate < distance) {
      nearest = index;
      distance = candidate;
    }
  }
  return nearest;
}
