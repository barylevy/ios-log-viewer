/**
 * Live mode shows today's records only. These drive trimToToday with output
 * from the real parser, so a parser change that alters timestampMs or
 * lineNumber breaks these rather than silently changing what users see.
 */

import { describe, it, expect } from 'vitest';
import { trimLiveBuffer, MIN_LIVE_RECORDS } from '../utils/useLiveLogs';
import { parseLogContent } from '../LogParser';

// Windows bracket-hex format: [DD/MM/YY HH:MM:SS.mmm] [level] [module] ...
const line = (d, m, t, msg) =>
  `[${d}/${m}/26 ${t}] [I] [Mod] [0x1:0x2] [f:1] ${msg}`;

const startOfDay = (day, month) => new Date(2026, month - 1, day, 0, 0, 0, 0).getTime();

const parse = (raw) => parseLogContent(raw, [], 'DD/MM/YY');

describe('trimLiveBuffer', () => {
  it('drops records from previous days and keeps today onward', () => {
    const raw = [
      line('11', '08', '09:00:00.000', 'two days ago'),
      line('12', '08', '09:00:00.000', 'yesterday'),
      line('13', '08', '08:00:00.000', 'today first'),
      line('13', '08', '09:00:00.000', 'today second'),
    ].join('\n');

    // floor of 1 so this isolates the day boundary; the floor has its own suite
    const trimmed = trimLiveBuffer(raw, parse(raw), startOfDay(13, 8), 1);

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

    expect(trimLiveBuffer(raw, parse(raw), startOfDay(13, 8), 1)).toBeNull();
  });

  it('keeps a quiet source visible even when nothing is from today', () => {
    // AntiTamper can go days without writing; a strict day filter blanked it.
    const raw = [
      line('11', '08', '09:00:00.000', 'old one'),
      line('12', '08', '09:00:00.000', 'old two'),
    ].join('\n');

    expect(trimLiveBuffer(raw, parse(raw), startOfDay(13, 8))).toBeNull();
  });

  it('keeps everything when no record carries a timestamp', () => {
    // A format we cannot date must never be silently emptied.
    const raw = 'some free-form text\nanother line with no date\n';
    const logs = parse(raw);

    expect(logs.every(l => l.timestampMs == null)).toBe(true);
    expect(trimLiveBuffer(raw, logs, startOfDay(13, 8))).toBeNull();
  });

  it('keeps a multi-line record whole, including its indented continuation', () => {
    const raw = [
      line('12', '08', '09:00:00.000', 'yesterday'),
      line('13', '08', '08:00:00.000', 'today with payload'),
      '    { "key": "value" }',
      '    more indented detail',
    ].join('\n');

    const trimmed = trimLiveBuffer(raw, parse(raw), startOfDay(13, 8), 1);

    expect(trimmed).not.toContain('yesterday');
    expect(trimmed).toContain('today with payload');
    expect(trimmed).toContain('"key": "value"');
    // The continuation stays attached to its parent rather than becoming a row.
    expect(parse(trimmed)).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(trimLiveBuffer('', [], startOfDay(13, 8))).toBeNull();
    expect(trimLiveBuffer('anything', [], startOfDay(13, 8))).toBeNull();
  });
});


describe('trimLiveBuffer — recent-records floor', () => {
  // One record per minute on a given day, tagged with the day so assertions
  // can't accidentally match a same-clock-time record from another day.
  const build = (count, day) => Array.from({ length: count }, (_, i) => {
    const hh = String(Math.floor(i / 60) % 24).padStart(2, '0');
    const mm = String(i % 60).padStart(2, '0');
    return line(day, '08', `${hh}:${mm}:00.000`, `d${day}-record-${i}`);
  }).join('\n');

  const messages = (text) => parse(text).map(l => (l.message || '').trim());

  it('keeps the last N when every record predates today', () => {
    const raw = build(500, '12');                       // all yesterday
    const kept = messages(trimLiveBuffer(raw, parse(raw), startOfDay(13, 8), 200));

    expect(kept).toHaveLength(200);
    expect(kept.at(-1)).toContain('d12-record-499');    // newest kept
    expect(kept[0]).toContain('d12-record-300');        // exactly 200 back
  });

  it('leaves a short buffer completely alone', () => {
    const raw = build(24, '12');                        // fewer than the floor
    expect(trimLiveBuffer(raw, parse(raw), startOfDay(13, 8), 200)).toBeNull();
  });

  it('lets the day filter win when today has more than the floor', () => {
    const raw = [build(100, '12'), build(300, '13')].join('\n');
    const kept = messages(trimLiveBuffer(raw, parse(raw), startOfDay(13, 8), 200));

    // 300 from today beats the 200 floor — yesterday is dropped entirely.
    expect(kept).toHaveLength(300);
    expect(kept.some(m => m.includes('d12-'))).toBe(false);
    expect(kept[0]).toContain('d13-record-0');
  });

  it('reaches past midnight when today has fewer than the floor', () => {
    const raw = [build(300, '12'), build(50, '13')].join('\n');
    const kept = messages(trimLiveBuffer(raw, parse(raw), startOfDay(13, 8), 200));

    // Only 50 today, so it reaches back into yesterday to make up 200.
    expect(kept).toHaveLength(200);
    expect(kept.filter(m => m.includes('d13-'))).toHaveLength(50);
    expect(kept.filter(m => m.includes('d12-'))).toHaveLength(150);
  });

  it('defaults to a sensible floor', () => {
    expect(MIN_LIVE_RECORDS).toBe(200);
  });
});
