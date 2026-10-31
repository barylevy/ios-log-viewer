import { describe, expect, it } from 'vitest';
import { parseLogContent, parseLogLine } from '../LogParser';
import {
  compileQuery,
  filterLogs,
  highlightSegments,
  matchesQuery,
  updateQueryRange,
  type RangeBoundary,
} from '../domain/logQuery';
import { createDefaultFilters } from '../domain/logRecord';
import { parseTimestamp } from '../domain/timestamps';
import { combineLogs } from '../domain/combineLogs';

function record(message: string, seconds = 0, id = 0) {
  return parseLogLine(
    `2026-10-31 12:00:${String(seconds).padStart(2, '0')}.000 [Main:1] [D] [t:1] [p:2] ${message}`,
    id + 1,
    id,
  );
}

describe('one expression grammar for filters and search', () => {
  it.each([
    ['error && timeout', 'error timeout', true],
    ['error && timeout', 'error only', false],
    ['(error && timeout) || warning', 'warning', true],
    ['error && (timeout || refused)', 'error refused', true],
    ['error || (warning && !heartbeat)', 'error heartbeat', true],
    ['error || (warning && !heartbeat)', 'warning heartbeat', false],
    ['"error || warning"', 'literal error || warning', true],
    ['"app "', 'sendAppIsRegistered', false],
    ['!heartbeat', 'connection failed', true],
  ])('%s against %s', (query, text, expected) => {
    expect(matchesQuery(compileQuery(query), record(text))).toBe(expected);
  });

  it('supports regex grouping and case sensitivity', () => {
    expect(matchesQuery(compileQuery('^(foo|bar)\\b', 'regex'), record('foo'))).toBe(true);
    expect(matchesQuery(compileQuery('ERROR', 'text', true), record('error'))).toBe(false);
  });
  it('fails malformed expressions visibly', () => {
    for (const query of ['error &&', '(error', '"error', '!'])
      expect(compileQuery(query).error).toBeTruthy();
    expect(compileQuery('[', 'regex').error).toBeTruthy();
  });
  it('does not give the first record a time gap', () => {
    const logs = [record('first', 0, 0), record('second', 1, 1), record('third', 8, 2)];
    expect(
      filterLogs(logs, { ...createDefaultFilters(), searchText: '#gap=5' }).map((log) => log.id),
    ).toEqual([2]);
    expect(
      filterLogs(logs, { ...createDefaultFilters(), searchText: '#gap=5 || first' }).map(
        (log) => log.id,
      ),
    ).toEqual([0, 2]);
  });
  it('includes the whole end date and rejects records without a timestamp', () => {
    const query = compileQuery('#2026-10-31 :: #2026-10-31');
    expect(matchesQuery(query, record('message'))).toBe(true);
    expect(matchesQuery(query, { ...record('message'), timestampMs: null })).toBe(false);
    expect(compileQuery('#2026-02-30 ::').error).toBeTruthy();
  });
  it('supports mixed line/date ranges', () => {
    expect(matchesQuery(compileQuery('#2 :: #2026-10-31'), record('message', 0, 0))).toBe(false);
    expect(matchesQuery(compileQuery('#2026-10-31 :: #2'), record('message', 0, 1))).toBe(true);
  });
  it('merges overlapping context without duplicating records', () => {
    const logs = Array.from({ length: 5 }, (_, id) => record(id === 2 ? 'match' : 'other', id, id));
    const filtered = filterLogs(logs, {
      ...createDefaultFilters(),
      searchText: 'match',
      contextLines: 1,
    });
    expect(filtered.map((log) => [log.id, log.isContextLine])).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ]);
  });
  it('highlights literal text and gives the search field priority on overlaps', () => {
    const text = '<b>error warning</b>';
    const segments = highlightSegments(text, compileQuery('error'), compileQuery('error warning'));
    expect(segments.map((segment) => segment.text).join('')).toBe(text);
    expect(
      segments
        .filter((segment) => segment.kind === 'search')
        .map((segment) => segment.text)
        .join(''),
    ).toBe('error warning');
  });
});

describe('editing query ranges', () => {
  it.each<{ boundary: RangeBoundary; value: string; expected: string }>([
    { boundary: 'rowFrom', value: '3', expected: '#3 :: #9' },
    { boundary: 'rowTo', value: '8', expected: '#1 :: #8' },
    { boundary: 'dateFrom', value: '2026-10-31', expected: '#1 :: #9 || #2026-10-31 ::' },
    { boundary: 'dateTo', value: '2026-10-31', expected: '#1 :: #9 || :: #2026-10-31' },
  ])('updates $boundary without dropping other bounds', ({ boundary, value, expected }) => {
    const query = updateQueryRange('#1::#9', boundary, value);
    expect(query).toBe(expected);
    expect(compileQuery(query).error).toBeNull();
  });

  it('keeps the upper date when replacing the lower date', () => {
    const query = updateQueryRange('#2026-10-30 :: #2026-10-31', 'dateFrom', '2026-10-29');
    expect(query).toBe('#2026-10-29 :: #2026-10-31');
    expect(matchesQuery(compileQuery(query), record('included'))).toBe(true);
    expect(
      matchesQuery(compileQuery(query), {
        ...record('later'),
        timestampMs: parseTimestamp('2026-11-01'),
      }),
    ).toBe(false);
  });

  it.each(['#2 :: #2026-10-31', '#2026-10-31 :: #2'])(
    'preserves mixed row/date range %s',
    (query) => {
      const updated = updateQueryRange(query, 'rowFrom', '2');
      const compiled = compileQuery(updated);
      expect(compiled.error).toBeNull();
      expect(matchesQuery(compiled, record('before', 0, 0))).toBe(false);
      expect(matchesQuery(compiled, record('included', 0, 1))).toBe(true);
    },
  );

  it('retains grouping, negation, and gap expressions when replacing a range', () => {
    const expression = '(error || warning) && !heartbeat || #gap=5';
    const query = updateQueryRange(
      '(error || warning) && !heartbeat || #1 :: #9 || #gap=5',
      'rowFrom',
      '2',
    );
    expect(query).toBe(`${expression} || #2 :: #9`);
    expect(matchesQuery(compileQuery(query), record('warning', 0, 1))).toBe(true);
    expect(matchesQuery(compileQuery(query), record('warning heartbeat', 0, 1))).toBe(false);
  });

  it('leaves quoted operators and quoted range syntax literal', () => {
    const expression = '"error || warning" && "#1 :: #9"';
    const query = updateQueryRange(expression, 'rowFrom', '2');
    expect(query).toBe(`${expression} || #2 ::`);
    expect(compileQuery(expression).rowStart).toBeNull();
    expect(matchesQuery(compileQuery(query), record('error || warning #1 :: #9', 0, 1))).toBe(true);
  });

  it('applies every row and date constraint instead of only the first range', () => {
    const query = compileQuery(
      '#2 :: #4 || #2026-10-31T12:00:01.000Z :: #2026-10-31T12:00:03.000Z',
    );
    const timedRecord = (id: number, second: number) => ({
      ...record('message', second, id),
      timestampMs: Date.parse(`2026-10-31T12:00:0${second}.000Z`),
    });
    expect(query.error).toBeNull();
    expect(matchesQuery(query, timedRecord(1, 2))).toBe(true);
    expect(matchesQuery(query, timedRecord(0, 2))).toBe(false);
    expect(matchesQuery(query, timedRecord(1, 4))).toBe(false);
  });

  it('retains the strictest unedited limit when ranges overlap', () => {
    const text = updateQueryRange('#1 :: #2 || #1 :: #9', 'rowFrom', '2');
    const query = compileQuery(text);
    expect(query.rowStart).toBe(2);
    expect(query.rowEnd).toBe(2);
    expect(matchesQuery(query, record('included', 0, 1))).toBe(true);
    expect(matchesQuery(query, record('outside', 0, 2))).toBe(false);
  });

  it.each(['[#1 :: #9]', '\\#1 :: #9'])(
    'leaves regex classes and escaped range text untouched: %s',
    (text) => {
      const query = compileQuery(text, 'regex');
      expect(query.error).toBeNull();
      expect(query.rowStart).toBeNull();
      expect(query.rowEnd).toBeNull();
    },
  );

  it.each(['error && #2 :: #9 && warning', '(#2 :: #9) && error && warning'])(
    'removes only the range from %s',
    (text) => {
      const query = compileQuery(text);
      expect(query.error).toBeNull();
      expect(matchesQuery(query, record('error warning', 0, 1))).toBe(true);
      expect(matchesQuery(query, record('error', 0, 1))).toBe(false);
    },
  );
});

describe('timestamps', () => {
  it('detects US and European dates on the real content path', () => {
    for (const date of ['08/31/25', '31/08/25']) {
      const [log] = parseLogContent(`${date} 16:27:00.072 [I] [VPN] [123:456] [run:1] message`);
      expect(log.displayDate).toBe('31-Aug-2025');
      expect(Number.isFinite(log.timestampMs)).toBe(true);
    }
  });
  it.each([
    '2026-10-31 12:00:00',
    '2026-10-31 12:00:00:123',
    '2026-10-31T12:00:00.123456Z',
    '2026-Oct-31 12:00:00.123',
  ])('supports %s', (value) => {
    expect(parseTimestamp(value)).not.toBeNull();
  });
  it.each(['2026-02-30 12:00:00', '2026-10-31 25:00:00', 'invalid'])(
    'rejects invalid time %s',
    (value) => {
      expect(parseTimestamp(value)).toBeNull();
    },
  );
  it('does not silently treat an offset-free ISO timestamp as UTC', () => {
    const value = '2026-10-31T12:00:00.123';
    expect(parseTimestamp(value)).toBe(new Date(value).getTime());
  });
});

describe('combined views', () => {
  it('keeps source identity stable when sorting inserts an earlier record', () => {
    const source = { id: 'app', logs: [record('later', 5, 0)] };
    const original = combineLogs([source]);
    const updated = combineLogs([{ id: 'other', logs: [record('earlier', 0, 0)] }, source]);
    expect(updated[1].id).toBe(original[0].id);
    expect(source.logs[0].id).toBe(0);
  });
  it('keeps continuation parent references consistent', () => {
    const parent = record('parent', 0, 0);
    const continuation = { ...record('continuation', 0, 1), isContinuation: true, parentLogId: 0 };
    const result = combineLogs([{ id: 'file', logs: [parent, continuation] }]);
    expect(result[1].parentLogId).toBe(result[0].id);
  });
});
