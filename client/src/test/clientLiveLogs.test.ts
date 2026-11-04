import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import useClientLiveLogs, { hasClientLiveLogs } from '../utils/useClientLiveLogs';

const install = (postMessage: ReturnType<typeof vi.fn>) => {
  Object.defineProperty(window, 'webkit', {
    configurable: true,
    value: { messageHandlers: { clientLiveLogs: { postMessage } } },
  });
};
afterEach(() => {
  Reflect.deleteProperty(window, 'webkit');
  vi.useRealTimers();
});

it('does not enable native mode in an ordinary browser', () => {
  expect(hasClientLiveLogs()).toBe(false);
});

it('opens without a folder picker and delivers native logs through the existing parser', async () => {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const update = {
    sourceKey: 'app',
    label: 'Client',
    type: 'reset',
    content: `${date} 12:00:00:000 [Main:1] [D] [t:1] [p:2] native message\n`,
  };
  const post = vi.fn(async ({ action }) => (action === 'read' ? [update] : true));
  install(post);
  const onConnected = vi.fn();
  const onSourceUpdate = vi.fn();
  const { result, unmount } = renderHook(() => useClientLiveLogs({ onConnected, onSourceUpdate }));
  await act(async () => {
    await result.current.connect();
  });
  expect(result.current.isConnected).toBe(true);
  expect(onConnected).toHaveBeenCalledOnce();
  expect(onSourceUpdate.mock.calls[0][0].logs[0].message).toBe('native message');
  unmount();
  expect(post).toHaveBeenLastCalledWith({ action: 'stop' });
});

it('discards a reply arriving after disconnect', async () => {
  let finish!: (value: unknown) => void;
  const post = vi.fn(({ action }) =>
    action === 'read'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(true),
  );
  install(post);
  const onSourceUpdate = vi.fn();
  const onConnected = vi.fn();
  const { result } = renderHook(() => useClientLiveLogs({ onSourceUpdate, onConnected }));
  let opening!: Promise<void>;
  act(() => {
    opening = result.current.connect();
  });
  await waitFor(() => expect(finish).toBeDefined());
  act(() => result.current.disconnect());
  await act(async () => {
    finish([]);
    await opening;
  });
  expect(onConnected).not.toHaveBeenCalled();
  expect(onSourceUpdate).not.toHaveBeenCalled();
  expect(result.current.isConnected).toBe(false);
});

it('reports native failure without entering browser folder setup', async () => {
  install(
    vi.fn(async () => {
      throw new Error('helper unavailable');
    }),
  );
  const onError = vi.fn();
  const { result } = renderHook(() => useClientLiveLogs({ onError }));
  await act(async () => {
    await result.current.connect();
  });
  expect(onError).toHaveBeenCalledOnce();
  expect(result.current.isConnected).toBe(false);
});

it('polls incrementally, resets rotated sources, and stops polling on disconnect', async () => {
  vi.useFakeTimers();
  let read = 0;
  const post = vi.fn(async ({ action }) =>
    action === 'read'
      ? [
          {
            sourceKey: 'app',
            label: 'Client',
            type: ++read === 2 ? 'append' : 'reset',
            content: '',
          },
        ]
      : true,
  );
  install(post);
  const onSourceUpdate = vi.fn();
  const { result } = renderHook(() => useClientLiveLogs({ onSourceUpdate }));
  await act(async () => {
    await result.current.connect();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(onSourceUpdate.mock.calls.map(([update]) => update.isInitial)).toEqual([
    true,
    false,
    true,
  ]);
  act(() => result.current.disconnect());
  const calls = post.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(post).toHaveBeenCalledTimes(calls);
});

it('rejects unexpected sources instead of displaying a native payload', async () => {
  install(
    vi.fn(async ({ action }) =>
      action === 'read'
        ? [{ sourceKey: 'arbitrary', label: 'Bad', type: 'reset', content: 'data' }]
        : true,
    ),
  );
  const onError = vi.fn();
  const onSourceUpdate = vi.fn();
  const { result } = renderHook(() => useClientLiveLogs({ onError, onSourceUpdate }));
  await act(async () => {
    await result.current.connect();
  });
  expect(onError).toHaveBeenCalledOnce();
  expect(onSourceUpdate).not.toHaveBeenCalled();
  expect(result.current.isConnected).toBe(false);
});
