import { describe, it, expect } from 'vitest';
import { trimLiveBuffer, filterLiveRecords } from '../utils/useLiveLogs';
import { parseLogContent } from '../LogParser';

const line = (time, message) => `[13/08/26 ${time}] [I] [Mod] [0x1:0x2] [f:1] ${message}`;
const cutoff = new Date(2026, 7, 13, 9, 0, 0, 500).getTime();
const parse = raw => parseLogContent(raw, [], 'DD/MM/YY');
const visible = raw => filterLiveRecords(parse(raw), cutoff);

describe('live session cutoff', () => {
  it('excludes records even one millisecond before the click and includes the exact boundary', () => {
    const logs = visible([
      line('09:00:00.499', 'before'),
      line('09:00:00.500', 'at click'),
      line('09:00:00.501', 'after'),
    ].join('\n'));
    expect(logs).toHaveLength(2);
    expect(logs.map(log => log.timestampMs)).toEqual([cutoff, cutoff + 1]);
  });

  it('keeps quiet sources empty without a historical fallback', () => {
    const raw = line('08:00:00.000', 'old');
    expect(visible(raw)).toEqual([]);
    expect(trimLiveBuffer(raw, parse(raw), cutoff)).toBe('');
  });

  it('excludes old records that arrive out of timestamp order', () => {
    const raw = [line('09:00:01.000', 'new'), line('08:00:00.000', 'delayed old')].join('\n');
    expect(visible(raw)).toHaveLength(1);
    expect(visible(raw)[0].timestampMs).toBeGreaterThan(cutoff);
  });

  it('hides missing or invalid timestamps', () => {
    expect(filterLiveRecords([{}, { timestampMs: null }, { timestampMs: NaN },
      { timestampMs: Infinity }, { timestampMs: '9999999999999' }], cutoff)).toEqual([]);
    expect(visible('unrecognised record')).toEqual([]);
  });

  it('retains multi-line details belonging to a new record', () => {
    const raw = [line('08:00:00.000', 'old'), line('09:00:01.000', 'new'),
      '    { "key": "value" }', '    more detail'].join('\n');
    const trimmed = trimLiveBuffer(raw, parse(raw), cutoff);
    expect(trimmed).not.toContain('old');
    expect(trimmed).toContain('"key": "value"');
    expect(visible(trimmed)).toHaveLength(1);
  });

  it('handles empty input and leaves already-current buffers unchanged', () => {
    expect(trimLiveBuffer('', [], cutoff)).toBeNull();
    const raw = line('09:00:01.000', 'new');
    expect(trimLiveBuffer(raw, parse(raw), cutoff)).toBeNull();
  });

  it('keeps the session boundary across midnight', () => {
    const timestampMs = new Date(2026, 7, 14, 0, 0, 1).getTime();
    expect(filterLiveRecords([{ timestampMs }], cutoff)).toEqual([{ timestampMs }]);
  });
});
