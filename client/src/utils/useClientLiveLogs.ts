import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveLogBuffer } from '../domain/liveLogBuffer';
import type { LiveCallbacks } from '../domain/viewerTypes';

interface Bridge {
  postMessage(message: { action: 'start' | 'read' | 'stop' }): Promise<unknown>;
}

type NativeWindow = Window & { webkit?: { messageHandlers?: { clientLiveLogs?: Bridge } } };
const bridge = () => (window as NativeWindow).webkit?.messageHandlers?.clientLiveLogs;
export const hasClientLiveLogs = () => typeof bridge()?.postMessage === 'function';
const sources = new Set(['app', 'agent', 'ext', 'dns', 'antitamper', 'daemon', 'install']);

interface Options extends LiveCallbacks {
  onError?: () => void;
}
interface Run {
  timer?: ReturnType<typeof setTimeout>;
  transport: Bridge;
  buffers: Map<string, LiveLogBuffer>;
  cutoff: number;
}

/** Native Cato transport; standalone browsers continue using their existing transports. */
export default function useClientLiveLogs(callbacks: Options = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const current = useRef<Run | null>(null);
  const cb = useRef(callbacks);
  cb.current = callbacks;

  const disconnect = useCallback(() => {
    const run = current.current;
    if (!run) return;
    current.current = null;
    clearTimeout(run.timer);
    void run.transport.postMessage({ action: 'stop' }).catch(() => {});
    setIsConnected(false);
    cb.current.onDisconnected?.();
  }, []);

  const connect = useCallback(async () => {
    if (current.current) return;
    const transport = bridge();
    if (!transport) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const run: Run = { transport, buffers: new Map(), cutoff: today.getTime() };
    current.current = run;
    try {
      await transport.postMessage({ action: 'start' });
      if (current.current !== run) return;
      const tick = async () => {
        try {
          const result = await transport.postMessage({ action: 'read' });
          if (current.current !== run) return;
          if (!Array.isArray(result) || result.length > sources.size)
            throw new Error('Invalid native response');
          if (!isStarted) {
            isStarted = true;
            setIsConnected(true);
            cb.current.onConnected?.();
          }
          for (const update of result) {
            if (!update || typeof update !== 'object') throw new Error('Invalid native update');
            const { sourceKey, label, type, content } = update as Record<string, unknown>;
            if (
              typeof sourceKey !== 'string' ||
              !sources.has(sourceKey) ||
              typeof label !== 'string' ||
              typeof content !== 'string' ||
              content.length > 512 * 1024 ||
              (type !== 'reset' && type !== 'append')
            )
              throw new Error('Invalid native update');
            const buffer = run.buffers.get(sourceKey) ?? new LiveLogBuffer(run.cutoff);
            run.buffers.set(sourceKey, buffer);
            cb.current.onSourceUpdate?.({
              sourceKey,
              label,
              logs: type === 'append' ? buffer.append(content) : buffer.reset(content),
              isInitial: type === 'reset',
            });
          }
          run.timer = setTimeout(tick, 1000);
        } catch {
          if (current.current !== run) return;
          disconnect();
          cb.current.onError?.();
        }
      };
      let isStarted = false;
      await tick();
    } catch {
      if (current.current !== run) return;
      disconnect();
      cb.current.onError?.();
    }
  }, [disconnect]);

  useEffect(() => disconnect, [disconnect]);
  return { isConnected, connect, disconnect };
}
