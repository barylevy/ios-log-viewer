/**
 * useLiveLogs — React hook for the "Online" live-log streaming feature.
 *
 * Connects to the local WebSocket server (scripts/live-logs-server.js) and
 * delivers parsed log entries to the viewer as they arrive.
 *
 * Protocol (server → client):
 *   { type:'initial', sourceKey, label, content }  — full snapshot on connect
 *   { type:'append',  sourceKey, label, content }  — new bytes since last send
 *   { type:'reset',   sourceKey, label, content }  — full resend after rotation
 */

import { useState, useRef, useCallback } from 'react';
import { parseLogContent } from '../LogParser';

const WS_URL = 'ws://localhost:4000';

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

  // Keep callback ref stable so connect/disconnect don't change identity
  const cbRef = useRef({ onSourceUpdate, onConnected, onDisconnected, onError });
  cbRef.current = { onSourceUpdate, onConnected, onDisconnected, onError };

  const connect = useCallback(() => {
    if (wsRef.current) return; // Already open
    accRef.current = {};

    const ws = new WebSocket(WS_URL);
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

        const logs = parseLogContent(accRef.current[sourceKey]);
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
