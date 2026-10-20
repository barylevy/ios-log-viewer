import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import useLiveLogs from '../utils/useLiveLogs';
import useLiveLogsFs from '../utils/useLiveLogsFs';
import { resetMirrorSession } from '../utils/liveLogsMirrorSession';

vi.mock('../utils/liveLogsFsHandle', () => ({ ensureMirrorPermission: async () => true }));
vi.mock('../utils/liveLogsMirrorSession', () => ({ resetMirrorSession: vi.fn(async () => {}) }));

const cutoff = new Date(2026, 7, 13, 9, 0, 0, 500).getTime();
const line = (time, msg) => `2026-08-13 ${time} [Mod:1] [Info] [t:1] [p:1] ${msg}\n`;
const snapshot = line('09:00:00.499', 'before') + line('09:00:00.500', 'at click') + line('09:00:00.501', 'after');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('live hooks use the click cutoff', () => {
  it('filters WebSocket initial, append, and rotation snapshots with the same cutoff', () => {
    let socket;
    vi.stubGlobal('WebSocket', class {
      constructor() { socket = this; }
      close() {}
    });
    const onSourceUpdate = vi.fn();
    const { result } = renderHook(() => useLiveLogs({ onSourceUpdate }));
    act(() => result.current.connect(cutoff));
    for (const type of ['initial', 'append', 'reset']) {
      act(() => socket.onmessage({ data: JSON.stringify({
        type, sourceKey: 'app', label: 'App', content: snapshot,
      }) }));
      const { logs } = onSourceUpdate.mock.lastCall[0];
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every(log => log.timestampMs >= cutoff)).toBe(true);
      expect(logs.some(log => log.timestampMs === cutoff)).toBe(true);
    }
    act(() => result.current.disconnect());
  });

  it('captures folder cutoff before slow setup and filters later appends and rotations', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(cutoff);
    resetMirrorSession.mockImplementationOnce(async () => { vi.setSystemTime(cutoff + 5000); });
    let text = snapshot;
    const fileHandle = { getFile: async () => {
      const bytes = new TextEncoder().encode(text);
      return { size: bytes.length, slice: (start, end) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer }) };
    } };
    const source = { async *entries() { yield ['app.log', { kind: 'file', ...fileHandle }]; } };
    const root = {
      async *entries() { yield ['app', { kind: 'directory' }]; },
      getDirectoryHandle: async key => {
        if (key === 'app') return source;
        throw new DOMException('Missing', 'NotFoundError');
      },
    };
    const onSourceUpdate = vi.fn();
    const { result } = renderHook(() => useLiveLogsFs({ onSourceUpdate }));
    await act(async () => { await result.current.connect(root); });
    expect(onSourceUpdate.mock.lastCall[0].logs.map(log => log.timestampMs)).toEqual([cutoff, cutoff + 1]);
    text += line('08:00:00.000', 'late old') + line('09:00:06.000', 'new append');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onSourceUpdate.mock.lastCall[0].logs).toHaveLength(3);
    text = line('08:00:00.000', 'rotated old') + line('09:00:07.000', 'rotated new');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onSourceUpdate.mock.lastCall[0].logs.map(log => log.timestampMs)).toEqual([cutoff + 6500]);
    act(() => result.current.disconnect());
  });
});
