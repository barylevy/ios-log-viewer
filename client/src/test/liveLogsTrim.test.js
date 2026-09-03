/**
 * Live mode shows today's records only. These drive trimToToday with output
 * from the real parser, so a parser change that alters timestampMs or
 * lineNumber breaks these rather than silently changing what users see.
 */

import { describe, it, expect } from 'vitest';
import { trimToToday } from '../utils/useLiveLogs';
import { parseLogContent } from '../LogParser';

// Windows bracket-hex format: [DD/MM/YY HH:MM:SS.mmm] [level] [module] ...
const line = (d, m, t, msg) =>
  `[${d}/${m}/26 ${t}] [I] [Mod] [0x1:0x2] [f:1] ${msg}`;

const startOfDay = (day, month) => new Date(2026, month - 1, day, 0, 0, 0, 0).getTime();

const parse = (raw) => parseLogContent(raw, [], 'DD/MM/YY');

describe('trimToToday', () => {
  it('drops records from previous days and keeps today onward', () => {
    const raw = [
      line('11', '08', '09:00:00.000', 'two days ago'),
      line('12', '08', '09:00:00.000', 'yesterday'),
      line('13', '08', '08:00:00.000', 'today first'),
      line('13', '08', '09:00:00.000', 'today second'),
    ].join('\n');

    const trimmed = trimToToday(raw, parse(raw), startOfDay(13, 8));

    expect(trimmed).not.toBeNull();
    expect(trimmed).not.toContain('two days ago');
    expect(trimmed).not.toContain('yesterday');
    expect(trimmed).toContain('today first');
    expect(trimmed).toContain('today second');
    expect(parse(trimmed)).toHaveLength(2);
  });

  it('returns null when the buffer already starts today, leaving it untouched', () => {
    const raw = [
      line('13', '08', '08:00:00.000', 'today first'),
      line('13', '08', '09:00:00.000', 'today second'),
    ].join('\n');

    expect(trimToToday(raw, parse(raw), startOfDay(13, 8))).toBeNull();
  });

  it('empties the buffer when every record predates today', () => {
    const raw = [
      line('11', '08', '09:00:00.000', 'old one'),
      line('12', '08', '09:00:00.000', 'old two'),
    ].join('\n');

    expect(trimToToday(raw, parse(raw), startOfDay(13, 8))).toBe('');
  });

  it('keeps everything when no record carries a timestamp', () => {
    // A format we cannot date must never be silently emptied.
    const raw = 'some free-form text\nanother line with no date\n';
    const logs = parse(raw);

    expect(logs.every(l => l.timestampMs == null)).toBe(true);
    expect(trimToToday(raw, logs, startOfDay(13, 8))).toBeNull();
  });

  it('keeps a multi-line record whole, including its indented continuation', () => {
    const raw = [
      line('12', '08', '09:00:00.000', 'yesterday'),
      line('13', '08', '08:00:00.000', 'today with payload'),
      '    { "key": "value" }',
      '    more indented detail',
    ].join('\n');

    const trimmed = trimToToday(raw, parse(raw), startOfDay(13, 8));

    expect(trimmed).not.toContain('yesterday');
    expect(trimmed).toContain('today with payload');
    expect(trimmed).toContain('"key": "value"');
    // The continuation stays attached to its parent rather than becoming a row.
    expect(parse(trimmed)).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(trimToToday('', [], startOfDay(13, 8))).toBeNull();
    expect(trimToToday('anything', [], startOfDay(13, 8))).toBeNull();
  });
});
