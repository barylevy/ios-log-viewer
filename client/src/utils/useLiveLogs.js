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

import { useState, useRef, useCallback } from 'react';
import { parseLogContent } from '../LogParser';
import { LIVE_SERVER_WS } from './liveLogsServer';

/** Only records verifiably created at or after the Live Logs click are visible. */
export function filterLiveRecords(logs, cutoff) {
  return logs.filter(log => Number.isFinite(log.timestampMs) && log.timestampMs >= cutoff);
}

/** Trim the historical prefix while preserving complete multi-line records. */
export function trimLiveBuffer(raw, logs, cutoff) {
  if (!raw || !logs.length) return null;
  // Keep incomplete input available for the parser when more bytes arrive.
  if (!logs.some(log => Number.isFinite(log.timestampMs))) return null;
  const startIndex = logs.findIndex(log => Number.isFinite(log.timestampMs) && log.timestampMs >= cutoff);
  if (startIndex === -1) return '';
  if (startIndex === 0) return null;
  return raw.split('\n').slice(logs[startIndex].lineNumber - 1).join('\n');
}

/**
 * @param {object} opts
 * @param {(update: {sourceKey:string, label:string, logs:any[], isInitial:boolean}) => void} opts.onSourceUpdate
 *   Called each time a source's log list changes.
 * @param {() => void} [opts.onConnected]
 * @param {() => void} [opts.onDisconnected]
 * @param {() => void} [opts.onError]  Called when the WebSocket fails to connect.
 */
export default function useLiveLogs({ onSourceUpdate, onConnected, onDisconnected, onError } = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  // Accumulated raw text per source — re-parsing the whole text on each update
  // keeps multi-line log-entry stitching correct without needing a streaming parser.
  const accRef = useRef({}); // { [sourceKey]: string }
  // Fixed at the user's click, before setup or connection delays.
  const cutoffRef = useRef(0);

  // Keep callback ref stable so connect/disconnect don't change identity
  const cbRef = useRef({ onSourceUpdate, onConnected, onDisconnected, onError });
  cbRef.current = { onSourceUpdate, onConnected, onDisconnected, onError };

  const connect = useCallback((cutoff = Date.now()) => {
    if (wsRef.current) return; // Already open
    accRef.current = {};

    cutoffRef.current = cutoff;

    const ws = new WebSocket(LIVE_SERVER_WS);
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

        if (type === 'initial' || type === 'reset') {
          accRef.current[sourceKey] = content;
        } else if (type === 'append') {
          accRef.current[sourceKey] = (accRef.current[sourceKey] || '') + content;
        } else {
          return;
        }

        let logs = parseLogContent(accRef.current[sourceKey]);

        // 'initial'/'reset' carry a full snapshot, which for a rotated or
        // re-read file is the entire history. Cut it back to what live mode
        // shows and trim the raw buffer to match, so later appends re-parse
        // only the remaining text instead of the whole file every second.
        if (type !== 'append') {
          const trimmed = trimLiveBuffer(accRef.current[sourceKey], logs, cutoffRef.current);
          if (trimmed !== null) {
            accRef.current[sourceKey] = trimmed;
            logs = parseLogContent(trimmed);
          }
        }

        cbRef.current.onSourceUpdate?.({
          sourceKey,
          label,
          logs: filterLiveRecords(logs, cutoffRef.current),
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
  }, []);

  return { isConnected, connect, disconnect };
}
