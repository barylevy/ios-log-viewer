import type { LogRecord } from '../domain/logRecord';
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

/** Quiet sources keep at least this many records, even if older than today. */
export const MIN_LIVE_RECORDS = 200;

/**
 * Cut a raw log buffer down to what live mode should show: records from today,
 * but never fewer than `minRecords`.
 *
 * The floor matters for sources that are written rarely — AntiTamper may log a
 * handful of lines a week, and a strict day filter would leave its tab blank.
 * Busy sources are unaffected: when today already has more than the floor, the
 * day boundary is what applies.
 *
 * Returns the trimmed text, or null to leave the buffer untouched — which is
 * what happens when nothing can be dated. A source whose format we can't parse
 * timestamps for must not be silently emptied.
 *
 * @param {string} raw    accumulated text
 * @param {any[]} logs    that text already parsed
 * @param {number} cutoff epoch ms for the start of today
 * @param {number} [minRecords]
 */
export function trimLiveBuffer(
  raw: string,
  logs: LogRecord[],
  cutoff: number,
  minRecords = MIN_LIVE_RECORDS,
) {
  if (!raw || !logs.length) return null;

  // Nothing datable — can't tell old from new, so keep everything.
  if (!logs.some((l) => l.timestampMs != null)) return null;

  let firstToday = logs.findIndex((l) => l.timestampMs != null && l.timestampMs >= cutoff);
  if (firstToday === -1) firstToday = logs.length; // nothing from today at all

  // Whichever keeps more: today's records, or the last `minRecords`.
  const floorIndex = Math.max(0, logs.length - minRecords);
  const startIndex = Math.min(firstToday, floorIndex);

  if (startIndex <= 0) return null; // already starts where we want it to

  const startLine = logs[startIndex].lineNumber; // 1-based
  return raw
    .split('\n')
    .slice(startLine - 1)
    .join('\n');
}

/**
 * @param {object} opts
 * @param {(update: {sourceKey:string, label:string, logs:any[], isInitial:boolean}) => void} opts.onSourceUpdate
 *   Called each time a source's log list changes.
 * @param {() => void} [opts.onConnected]
 * @param {() => void} [opts.onDisconnected]
 * @param {() => void} [opts.onError]  Called when the WebSocket fails to connect.
 */
export default function useLiveLogs({
  onSourceUpdate,
  onConnected,
  onDisconnected,
  onError,
}: Options = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Each source owns an incremental parser and a bounded record buffer.
  const accRef = useRef<Record<string, LiveLogBuffer>>({}); // { [sourceKey]: LiveLogBuffer }
  // Live mode shows today's activity only. Fixed when the connection opens so
  // records don't disappear mid-session if it runs past midnight.
  const cutoffRef = useRef(0);

  // Keep callback ref stable so connect/disconnect don't change identity
  const cbRef = useRef({ onSourceUpdate, onConnected, onDisconnected, onError });
  cbRef.current = { onSourceUpdate, onConnected, onDisconnected, onError };

  const connect = useCallback(() => {
    if (wsRef.current) return; // Already open
    accRef.current = {};

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    cutoffRef.current = startOfToday.getTime();

    const ws = new WebSocket(LIVE_SERVER_WS, liveWebSocketProtocols());
    wsRef.current = ws;
    let didOpen = false;

    ws.onopen = () => {
      didOpen = true;
      setIsConnected(true);
      cbRef.current.onConnected?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, sourceKey, label, content = '' } = msg;

        if (
          !['initial', 'reset', 'append'].includes(type) ||
          typeof sourceKey !== 'string' ||
          !/^[a-z]+$/.test(sourceKey) ||
          typeof content !== 'string' ||
          typeof label !== 'string'
        )
          return;
        const buffer = accRef.current[sourceKey] || new LiveLogBuffer(cutoffRef.current);
        accRef.current[sourceKey] = buffer;
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
    accRef.current = {};
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return { isConnected, connect, disconnect };
}
