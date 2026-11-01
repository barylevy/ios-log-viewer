import { naturalSort } from './fileGrouping';
import { errorName, type LiveCallbacks, type LiveFolderError } from '../domain/viewerTypes';
import type { FileSize } from './liveLogsFsCore';
interface Options extends LiveCallbacks {
  onError?: (reason: LiveFolderError) => void;
}
interface LogFileHandle {
  name: string;
  handle: FileSystemFileHandle;
}
interface Run {
  timer: ReturnType<typeof setInterval> | null;
  stopped: boolean;
}

/**
 * useLiveLogsFs — live logs read straight from a folder, with no local server.
 *
 * scripts/sync-cato-logs.sh (run with sudo) mirrors every Cato log source into
 * ~/.cato_live_logs/<sourceKey>/, including the root-owned ones a browser can't
 * reach. This hook polls that folder through the File System Access API and
 * feeds the viewer exactly like useLiveLogs does, so the tabs don't care which
 * transport produced the update.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { LiveLogBuffer } from '../domain/liveLogBuffer';
import {
  FS_SOURCES,
  LOG_FILE_PATTERN,
  INITIAL_TAIL_LINES,
  MAX_INITIAL_BYTES,
  planRead,
  tailLines,
} from './liveLogsFsCore';
import { ensureMirrorPermission } from './liveLogsFsHandle';
import { resetMirrorSession } from './liveLogsMirrorSession';

const POLL_MS = 1000;

/** Matching files in a source folder as [{name, handle}], naturally sorted. */
async function listLogFiles(dirHandle: FileSystemDirectoryHandle) {
  const out: LogFileHandle[] = [];
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === 'file' && LOG_FILE_PATTERN.test(name))
      out.push({ name, handle: entry as FileSystemFileHandle });
  }
  return out.sort((a, b) => naturalSort(a.name, b.name));
}

/** Join file texts, making sure each ends on a newline so records don't fuse. */
function joinTexts(parts: string[]) {
  let text = '';
  for (const part of parts) {
    text += part;
    if (part.length && !part.endsWith('\n')) text += '\n';
  }
  return text;
}

/**
 * Read a source from scratch: walk files newest-first until MAX_INITIAL_BYTES,
 * so a folder with months of rotated logs doesn't get loaded whole.
 * @returns {{text:string, sizes:{name:string,size:number}[], decoder:TextDecoder}}
 */
async function readFresh(files: LogFileHandle[]) {
  const decoder = new TextDecoder('utf-8');
  const sizes: FileSize[] = [];
  const chunks: string[] = [];
  let budget = MAX_INITIAL_BYTES;

  // Sizes must describe every file (not only those read) so planRead can tell
  // later whether the folder changed.
  const withFiles = [];
  for (const f of files) {
    const file = await f.handle.getFile();
    withFiles.push({ name: f.name, file });
    sizes.push({ name: f.name, size: file.size });
  }

  for (let i = withFiles.length - 1; i >= 0 && budget > 0; i--) {
    const { file } = withFiles[i];
    const start = Math.max(0, file.size - budget);
    budget -= file.size - start;
    const buf = await file.slice(start).arrayBuffer();
    // The last file's decoder carries on into appends, so a character split
    // across two polls is held back instead of turning into U+FFFD.
    const isLast = i === withFiles.length - 1;
    let text = isLast
      ? decoder.decode(buf, { stream: true })
      : new TextDecoder('utf-8').decode(buf);
    if (start > 0) text = text.slice(text.indexOf('\n') + 1); // drop the cut-off first line
    chunks.unshift(text);
  }

  return { text: joinTexts(chunks), sizes, decoder };
}

export default function useLiveLogsFs({
  onSourceUpdate,
  onConnected,
  onDisconnected,
  onError,
}: Options = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const runRef = useRef<Run | null>(null); // { timer, stopped } for the active session

  const cbRef = useRef({ onSourceUpdate, onConnected, onDisconnected, onError });
  cbRef.current = { onSourceUpdate, onConnected, onDisconnected, onError };

  const disconnect = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    run.stopped = true;
    if (run.timer !== null) clearInterval(run.timer);
    runRef.current = null;
    setIsConnected(false);
  }, []);

  /** @param {FileSystemDirectoryHandle} root  call from a click (may prompt) */
  const connect = useCallback(
    async (root: FileSystemDirectoryHandle) => {
      if (runRef.current || !root) return false;

      if (!(await ensureMirrorPermission(root))) {
        cbRef.current.onError?.('denied');
        return false;
      }

      try {
        await resetMirrorSession(root);
      } catch (error) {
        cbRef.current.onError?.(errorName(error) === 'NotAllowedError' ? 'denied' : 'sync');
        return false;
      }

      // Fixed when the session opens so records don't vanish if it runs past midnight.
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const cutoff = startOfToday.getTime();

      const run: Run = { timer: null, stopped: false };
      const acc: Record<string, LiveLogBuffer> = {}; // { [key]: LiveLogBuffer }
      const seen: Record<string, { sizes: FileSize[]; decoder: TextDecoder }> = {}; // { [key]: { sizes, decoder } }

      const emit = (
        src: { key: string; label: string },
        type: 'append' | 'reset',
        text: string,
      ) => {
        const buffer = acc[src.key] || new LiveLogBuffer(cutoff);
        acc[src.key] = buffer;
        const logs = type === 'append' ? buffer.append(text) : buffer.reset(text);
        cbRef.current.onSourceUpdate?.({
          sourceKey: src.key,
          label: src.label,
          logs,
          isInitial: type !== 'append',
        });
      };

      const pollSource = async (src: { key: string; label: string }) => {
        let dir;
        try {
          dir = await root.getDirectoryHandle(src.key);
        } catch (e) {
          if (errorName(e) === 'NotFoundError') return false; // not mirrored (yet)
          throw e;
        }

        const files = await listLogFiles(dir);
        const stat = await Promise.all(
          files.map(async (f) => ({ name: f.name, size: (await f.handle.getFile()).size })),
        );
        const plan = planRead(seen[src.key]?.sizes ?? null, stat);
        if (plan.kind === 'none') return true;

        if (plan.kind === 'append') {
          const state = seen[src.key];
          const file = await files[files.length - 1].handle.getFile();
          const buf = await file.slice(plan.offset, file.size).arrayBuffer();
          const text = state.decoder.decode(buf, { stream: true });
          state.sizes = stat.map((s, i) =>
            i === stat.length - 1 ? { name: s.name, size: plan.offset + buf.byteLength } : s,
          );
          if (run.stopped) return false;
          if (text) emit(src, 'append', text);
          return true;
        }

        const fresh = await readFresh(files);
        seen[src.key] = { sizes: fresh.sizes, decoder: fresh.decoder };
        if (run.stopped) return false;
        emit(src, 'reset', tailLines(fresh.text, INITIAL_TAIL_LINES));
        return true;
      };

      let busy = false;
      const tick = async () => {
        if (busy || run.stopped) return;
        busy = true;
        try {
          for (const src of FS_SOURCES) {
            if (run.stopped) return;
            await pollSource(src);
          }
        } catch (e) {
          // NotReadableError / NotFoundError = a file changed or rotated away
          // mid-read; the next tick retries. Only lost permission ends the session.
          if (errorName(e) === 'NotAllowedError') {
            disconnect();
            cbRef.current.onError?.('lost');
          }
        } finally {
          busy = false;
        }
      };

      // Check whether the fresh mirror contains any source folders.
      let hasSource = false;
      try {
        for await (const [, entry] of root.entries()) {
          if (entry.kind === 'directory') {
            hasSource = true;
            break;
          }
        }
      } catch {
        cbRef.current.onError?.('denied');
        return false;
      }
      if (!hasSource) {
        cbRef.current.onError?.('empty');
        return false;
      }

      runRef.current = run;
      setIsConnected(true);
      cbRef.current.onConnected?.();
      await tick();
      if (!run.stopped) run.timer = setInterval(tick, POLL_MS);
      return true;
    },
    [disconnect],
  );

  const stop = useCallback(() => {
    const wasRunning = !!runRef.current;
    disconnect();
    if (wasRunning) cbRef.current.onDisconnected?.();
  }, [disconnect]);

  useEffect(() => disconnect, [disconnect]);

  return { isConnected, connect, disconnect: stop };
}
