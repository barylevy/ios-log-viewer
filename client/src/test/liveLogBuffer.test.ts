import { describe, expect, it } from 'vitest';
import { LiveLogBuffer, MAX_LIVE_CHARACTERS, MAX_LIVE_RECORDS } from '../domain/liveLogBuffer';

function line(second: number, message = 'message'): string {
  return `2026-10-31 12:00:${String(second % 60).padStart(2, '0')}.000 [Main:1] [D] [t:1] [p:2] ${message}`;
}

describe('incremental live buffer', () => {
  it('stitches partial lines without reparsing older records', () => {
    const buffer = new LiveLogBuffer(0);
    const initial = buffer.reset(line(0) + '\n' + line(1, 'part'));
    const first = initial[0];
    const updated = buffer.append('ial\n' + line(2) + '\n');
    expect(updated).toHaveLength(3);
    expect(updated[0]).toBe(first);
    expect(updated[1].message).toBe('partial');
    expect(updated.map((record) => record.lineNumber)).toEqual([1, 2, 3]);
  });
  it('attaches multiline continuations to the previous record', () => {
    const buffer = new LiveLogBuffer(0);
    const initial = buffer.reset(line(0) + '\n');
    const updated = buffer.append('  {"value": 1}\n' + line(1));
    expect(updated[0].message).toContain('{"value": 1}');
    expect(updated[0].id).toBe(initial[0].id);
    expect(updated[1].lineNumber).toBe(3);
  });
  it('uses new identities on rotation even when the record count stays the same', () => {
    const buffer = new LiveLogBuffer(0);
    const initial = buffer.reset(line(0));
    const rotated = buffer.reset(line(1));
    expect(rotated).toHaveLength(initial.length);
    expect(rotated[0].id).not.toBe(initial[0].id);
  });
  it('bounds retained records during a long append session', () => {
    const buffer = new LiveLogBuffer(0);
    buffer.reset(line(0) + '\n');
    const updated = buffer.append(
      Array.from({ length: MAX_LIVE_RECORDS + 5 }, (_, index) => line(index)).join('\n'),
    );
    expect(updated.length).toBeLessThanOrEqual(MAX_LIVE_RECORDS);
    expect(updated.reduce((count, record) => count + record.raw.length, 0)).toBeLessThanOrEqual(
      MAX_LIVE_CHARACTERS,
    );
  });
  it('caps an undated single record', () => {
    const buffer = new LiveLogBuffer(0);
    const records = buffer.reset('x'.repeat(MAX_LIVE_CHARACTERS + 100));
    expect(records.reduce((count, record) => count + record.raw.length, 0)).toBeLessThanOrEqual(
      MAX_LIVE_CHARACTERS,
    );
  });
});
