/**
 * Cmd/Ctrl + / − / 0 resize only the log records' text.
 *
 * Browser zoom scales the whole page (headers, buttons, filters). Intercepting
 * the shortcut lets the viewer scale just the record rows; the scale is applied
 * through the `--record-scale` CSS variable (see `.log-records` in index.css)
 * and remembered across sessions.
 */

import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'recordTextScale';
export const MIN_SCALE = 0.7;
export const MAX_SCALE = 3;
const STEP = 0.1;

const clamp = (n) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n * 10) / 10));

/**
 * The scale a zoom shortcut should produce, or null when the key isn't one.
 * @param {string} key  KeyboardEvent.key
 * @param {number} current
 */
export function nextScale(key, current, code = '') {
  // `code` is the physical key, which stays the same under any keyboard layout
  // (e.g. Hebrew), where `key` may not be '=' / '-' / '0' at all.
  if (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd') return clamp(current + STEP);
  if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') return clamp(current - STEP);
  if (key === '0' || code === 'Digit0' || code === 'Numpad0') return 1;
  return null;
}

function loadScale() {
  try {
    const saved = parseFloat(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(saved) ? clamp(saved) : 1;
  } catch {
    return 1;
  }
}

/** @returns {number} the current scale; style a container with `--record-scale`. */
export default function useRecordTextScale() {
  const [scale, setScale] = useState(loadScale);
  // The listener reads the latest value from a ref, so held-down keys (which can
  // fire faster than React re-renders) keep stepping instead of repeating one step.
  const scaleRef = useRef(scale);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const next = nextScale(e.key, scaleRef.current, e.code);
      if (next === null) return;
      e.preventDefault(); // keep the browser from zooming the whole page
      e.stopPropagation();
      scaleRef.current = next;
      setScale(next);
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
    };
    // Capture phase: run before any other handler can swallow the event.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return scale;
}
