import { describe, expect, it } from 'vitest';
import { LiveLogBuffer, MIN_LIVE_RECORDS } from '../domain/liveLogBuffer';

const cutoff = new Date(2026, 7, 13).getTime();
const line = (day: string, time: string, message: string) =>
  `[${day}/08/26 ${time}] [I] [Mod] [0x1:0x2] [f:1] ${message}`;
const build = (count: number, day: string) =>
  Array.from({ length: count }, (_, index) => {
    const hour = String(Math.floor(index / 60) % 24).padStart(2, '0');
    const minute = String(index % 60).padStart(2, '0');
    return line(day, `${hour}:${minute}:00.000`, `d${day}-record-${index}`);
  }).join('\n');
const retain = (text: string) => new LiveLogBuffer(cutoff).reset(text);

describe('live buffer retention on the real parsing path', () => {
  it('drops previous days when today has enough records', () => {
    const kept = retain([build(2, '11'), build(2, '12'), build(201, '13')].join('\n'));
    expect(kept).toHaveLength(201);
    expect(kept.every((log) => log.message.includes('d13-'))).toBe(true);
  });

  it('leaves records that already start today unchanged', () => {
    const raw = build(2, '13');
    expect(
      retain(raw)
        .map((log) => log.raw)
        .join('\n'),
    ).toBe(raw);
  });

  it('keeps a quiet source visible even when nothing is from today', () => {
    const raw = [line('11', '09:00:00.000', 'old one'), line('12', '09:00:00.000', 'old two')].join(
      '\n',
    );
    expect(
      retain(raw)
        .map((log) => log.raw)
        .join('\n'),
    ).toBe(raw);
  });

  it('preserves text when no record has a timestamp', () => {
    const raw = 'some free-form text\nanother line with no date';
    const logs = retain(raw);
    expect(logs.every((log) => log.timestampMs === null)).toBe(true);
    expect(logs.map((log) => log.raw).join('\n')).toBe(raw);
  });

  it('keeps multiline payloads attached when removing older records', () => {
    const raw = [
      line('12', '09:00:00.000', 'yesterday'),
      line('13', '00:00:00.000', 'today with payload'),
      '    { "key": "value" }',
      '    more indented detail',
      build(200, '13'),
    ].join('\n');
    const kept = retain(raw);
    expect(kept).toHaveLength(201);
    expect(kept[0].raw).toContain('"key": "value"');
    expect(kept[0].message).toContain('more indented detail');
    expect(kept.some((log) => log.message.includes('yesterday'))).toBe(false);
  });

  it('handles empty input', () => {
    expect(retain('')).toEqual([]);
  });

  it('keeps the newest records when every record predates today', () => {
    const kept = retain(build(500, '12'));
    expect(kept).toHaveLength(200);
    expect(kept[0].message).toContain('d12-record-300');
    expect(kept.at(-1)?.message).toContain('d12-record-499');
  });

  it('leaves a short buffer completely alone', () => {
    const raw = build(24, '12');
    expect(
      retain(raw)
        .map((log) => log.raw)
        .join('\n'),
    ).toBe(raw);
  });

  it('keeps all of today when it exceeds the recent-record floor', () => {
    const kept = retain([build(100, '12'), build(300, '13')].join('\n'));
    expect(kept).toHaveLength(300);
    expect(kept.every((log) => log.message.includes('d13-'))).toBe(true);
  });

  it('reaches past midnight when today has fewer records than the floor', () => {
    const kept = retain([build(300, '12'), build(50, '13')].join('\n'));
    expect(kept).toHaveLength(200);
    expect(kept.filter((log) => log.message.includes('d13-'))).toHaveLength(50);
    expect(kept.filter((log) => log.message.includes('d12-'))).toHaveLength(150);
  });

  it('applies the floor at its exact boundary', () => {
    const kept = retain(build(MIN_LIVE_RECORDS + 1, '12'));
    expect(kept).toHaveLength(MIN_LIVE_RECORDS);
    expect(kept[0].message).toContain('d12-record-1');
  });
});
