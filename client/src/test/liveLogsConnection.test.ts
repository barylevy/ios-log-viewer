import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useLiveLogs from '../utils/useLiveLogs';
import type { LiveSourceUpdate } from '../domain/viewerTypes';

const originalWebSocket = globalThis.WebSocket;
const sockets: TestSocket[] = [];
class TestSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    sockets.push(this);
  }
  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
const line = (message: string) => `2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] ${message}`;
const initial = (sourceKey = 'app', content = line('message')) => ({
  type: 'initial',
  sourceKey,
  label: sourceKey,
  content,
});

beforeEach(() => {
  sockets.length = 0;
  localStorage.clear();
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: TestSocket,
  });
});
afterEach(() => {
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: originalWebSocket,
  });
});

it('maintains separate source buffers and accepts keys that are also object property names', () => {
  const onSourceUpdate = vi.fn<(update: LiveSourceUpdate) => void>();
  const { result } = renderHook(() => useLiveLogs({ onSourceUpdate }));
  act(() => result.current.connect());
  act(() => sockets[0].onopen?.());
  act(() => {
    sockets[0].message(initial('app', line('part')));
    sockets[0].message(initial('constructor', line('other source')));
    sockets[0].message({ type: 'append', sourceKey: 'app', label: 'app', content: 'ial' });
  });
  expect(onSourceUpdate).toHaveBeenCalledTimes(3);
  expect(onSourceUpdate.mock.calls[1][0].logs[0].message).toBe('other source');
  expect(onSourceUpdate.mock.lastCall?.[0]).toMatchObject({ sourceKey: 'app', isInitial: false });
  expect(onSourceUpdate.mock.lastCall?.[0].logs[0].message).toBe('partial');
});

it('ignores every event from an abandoned connection after reconnect or disconnect', () => {
  const onConnected = vi.fn();
  const onError = vi.fn();
  const onSourceUpdate = vi.fn();
  const { result } = renderHook(() => useLiveLogs({ onConnected, onError, onSourceUpdate }));
  act(() => result.current.connect());
  const abandoned = sockets[0];
  act(() => result.current.disconnect());
  act(() => result.current.connect());
  act(() => {
    abandoned.onopen?.();
    abandoned.message(initial());
    abandoned.onerror?.();
    abandoned.onclose?.();
  });
  expect(result.current.isConnected).toBe(false);
  expect(onConnected).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(onSourceUpdate).not.toHaveBeenCalled();
  act(() => sockets[1].onopen?.());
  expect(result.current.isConnected).toBe(true);
  expect(onConnected).toHaveBeenCalledOnce();
  act(() => result.current.disconnect());
  act(() => {
    sockets[1].onopen?.();
    sockets[1].message(initial());
  });
  expect(result.current.isConnected).toBe(false);
  expect(onConnected).toHaveBeenCalledOnce();
  expect(onSourceUpdate).not.toHaveBeenCalled();
});

it('uses current callbacks, reports remote closure, and closes the socket on unmount', () => {
  const first = vi.fn();
  const second = vi.fn();
  const onDisconnected = vi.fn();
  const { result, rerender, unmount } = renderHook(
    ({ onSourceUpdate }) => useLiveLogs({ onSourceUpdate, onDisconnected }),
    { initialProps: { onSourceUpdate: first } },
  );
  act(() => result.current.connect());
  act(() => sockets[0].onopen?.());
  rerender({ onSourceUpdate: second });
  act(() => sockets[0].message(initial()));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  act(() => sockets[0].onclose?.());
  expect(onDisconnected).toHaveBeenCalledOnce();
  expect(result.current.isConnected).toBe(false);
  act(() => result.current.connect());
  unmount();
  expect(sockets[1].close).toHaveBeenCalledOnce();
  sockets[1].message(initial());
  expect(second).toHaveBeenCalledOnce();
});
