import { describe, it, expect, vi, afterEach } from 'vitest';
import { resetMirrorSession } from '../utils/liveLogsMirrorSession';

function mirror({ responding = true, removalError } = {}) {
  const events = [];
  let status = '';
  const root = {
    name: '.cato_live_logs',
    getFileHandle: vi.fn(async name => {
      if (name === '.sync-status') return { getFile: async () => ({ text: async () => status }) };
      return { createWritable: async () => ({
        write: async request => {
          events.push(request.split(':')[0]);
          if (responding) status = request.startsWith('pause:') ? request : `ready:${request}`;
        },
        close: async () => {},
      }) };
    }),
    removeEntry: vi.fn(async key => {
      events.push(`remove:${key}`);
      if (removalError) throw removalError;
    }),
  };
  return { root, events };
}

afterEach(() => vi.useRealTimers());

describe('fresh mirror session', () => {
  it('pauses, clears only known mirror sources, then resumes copying', async () => {
    const { root, events } = mirror();
    await resetMirrorSession(root);
    expect(events).toEqual(['pause', 'remove:app', 'remove:ext', 'remove:dns',
      'remove:antitamper', 'remove:agent', 'remove:daemon', 'remove:install', 'sync']);
    expect(root.removeEntry).toHaveBeenCalledWith('app', { recursive: true });
  });

  it('leaves previous logs intact when the script does not respond', async () => {
    vi.useFakeTimers();
    const { root, events } = mirror({ responding: false });
    const rejected = expect(resetMirrorSession(root, 500)).rejects.toThrow('did not respond');
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(root.removeEntry).not.toHaveBeenCalled();
    expect(events).toEqual(['pause', 'sync']);
  });

  it('resumes the script even when deletion fails', async () => {
    const error = new DOMException('Denied', 'NotAllowedError');
    const { root, events } = mirror({ removalError: error });
    await expect(resetMirrorSession(root)).rejects.toBe(error);
    expect(events).toEqual(['pause', 'remove:app', 'sync']);
  });

  it('refuses to delete from a different folder', async () => {
    const { root } = mirror();
    root.name = 'Documents';
    await expect(resetMirrorSession(root)).rejects.toThrow('Choose .cato_live_logs');
    expect(root.getFileHandle).not.toHaveBeenCalled();
    expect(root.removeEntry).not.toHaveBeenCalled();
  });

  it('waits for a fresh copy before completing', async () => {
    vi.useFakeTimers();
    const { root } = mirror();
    const getHandle = root.getFileHandle.getMockImplementation();
    root.getFileHandle.mockImplementation(async name => {
      const handle = await getHandle(name);
      if (name !== '.sync-status') return handle;
      return { getFile: async () => ({ text: async () => {
        const value = await (await handle.getFile()).text();
        return value.startsWith('ready:') ? 'old copy' : value;
      } }) };
    });
    const rejected = expect(resetMirrorSession(root, 500)).rejects.toThrow('did not respond');
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(root.removeEntry).toHaveBeenCalledTimes(7);
  });
});
