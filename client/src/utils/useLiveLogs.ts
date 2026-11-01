import type { LiveCallbacks } from '../domain/viewerTypes';
interface Options extends LiveCallbacks {
  onError?: () => void;
}
/**
 * useLiveLogs — React hook for the "Online" live-log streaming feature.
 *
 * Connects to the local WebSocket server (scripts/live-logs-server.js) and
 * delivers parsed log entries to the viewer as they arrive.
 *
 * Protocol (server → client):
 *   { type:'initial', sourceKey, label, content }  — recent tail, so the tab
 *                                                     isn't blank on connect
 *   { type:'append',  sourceKey, label, content }  — new bytes since last send
 *   { type:'reset',   sourceKey, label, content }  — full resend after rotation
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { LiveLogBuffer } from '../domain/liveLogBuffer';
import { LIVE_SERVER_WS, liveWebSocketProtocols } from './liveLogsServer';

export default function useLiveLogs({
  onSourceUpdate,
  onConnected,
  onDisconnected,
  onError,
}: Options = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Each source owns an incremental parser and a bounded record buffer.
  const buffers = useRef(new Map<string, LiveLogBuffer>());
  // Live mode shows today's activity only. Fixed when the connection opens so
  // records don't disappear mid-session if it runs past midnight.
  const cutoffRef = useRef(0);

  // Keep callback ref stable so connect/disconnect don't change identity
  const cbRef = useRef({ onSourceUpdate, onConnected, onDisconnected, onError });
  cbRef.current = { onSourceUpdate, onConnected, onDisconnected, onError };

  const connect = useCallback(() => {
    if (wsRef.current) return; // Already open
    buffers.current.clear();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    cutoffRef.current = startOfToday.getTime();

    const ws = new WebSocket(LIVE_SERVER_WS, liveWebSocketProtocols());
    wsRef.current = ws;
    let didOpen = false;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      didOpen = true;
      setIsConnected(true);
      cbRef.current.onConnected?.();
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      try {
        const message: unknown = JSON.parse(event.data);
        if (!message || typeof message !== 'object' || Array.isArray(message)) return;
        const { type, sourceKey, label, content = '' } = message as Record<string, unknown>;

        if (
          (type !== 'initial' && type !== 'reset' && type !== 'append') ||
          typeof sourceKey !== 'string' ||
          !/^[a-z]+$/.test(sourceKey) ||
          typeof content !== 'string' ||
          typeof label !== 'string'
        )
          return;
        const buffer = buffers.current.get(sourceKey) ?? new LiveLogBuffer(cutoffRef.current);
        buffers.current.set(sourceKey, buffer);
        const logs = type === 'append' ? buffer.append(content) : buffer.reset(content);

        cbRef.current.onSourceUpdate?.({
          sourceKey,
          label,
          logs,
          isInitial: type !== 'append',
        });
      } catch (e) {
        console.error('[useLiveLogs] message error:', e);
      }
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      console.error('[useLiveLogs] Cannot connect — is live-logs-server.js running?');
      cbRef.current.onError?.();
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setIsConnected(false);
      if (!didOpen) {
        // Connection was refused — onerror may not have fired (browser-dependent)
        cbRef.current.onError?.();
      } else {
        cbRef.current.onDisconnected?.();
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    buffers.current.clear();
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return { isConnected, connect, disconnect };
}
