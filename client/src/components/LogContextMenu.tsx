import { useEffect, useLayoutEffect, useRef } from 'react';
import type { LogRecord } from '../domain/logRecord';
import type { RangeBoundary } from '../domain/logQuery';
import { cleanMessage } from '../utils/logLevelColors';

export interface LogMenuTarget {
  x: number;
  y: number;
  log: LogRecord;
}

interface Props {
  target: LogMenuTarget;
  hasPivot: boolean;
  onRangeChange: (boundary: RangeBoundary, log: LogRecord) => void;
  onSetPivot: (log: LogRecord) => void;
  onClearPivot: () => void;
  onAddStickyLog: (log: LogRecord & { cleanedMessage?: string }) => void;
  onClose: () => void;
}

interface MenuAction {
  label: string;
  select: () => void;
  disabled?: boolean;
}

export default function LogContextMenu({
  target,
  hasPivot,
  onRangeChange,
  onSetPivot,
  onClearPivot,
  onAddStickyLog,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(10, Math.min(target.x, window.innerWidth - width - 10))}px`;
    menu.style.top = `${Math.max(10, target.y + height > window.innerHeight ? target.y - height : target.y)}px`;
  }, [target]);

  useEffect(() => {
    const dismissOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || menuRef.current?.contains(event.target)) return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    };
    document.addEventListener('click', dismissOutside, true);
    return () => document.removeEventListener('click', dismissOutside, true);
  }, [onClose]);

  const groups: MenuAction[][] = [
    [
      {
        label: 'Sticky Log Line',
        select: () =>
          onAddStickyLog({ ...target.log, cleanedMessage: cleanMessage(target.log.message) }),
      },
    ],
    [
      { label: 'Set as "From" log line index', select: () => onRangeChange('rowFrom', target.log) },
      { label: 'Set as "To" log line index', select: () => onRangeChange('rowTo', target.log) },
    ],
    [
      { label: 'Set "From" date', select: () => onRangeChange('dateFrom', target.log) },
      { label: 'Set "To" date', select: () => onRangeChange('dateTo', target.log) },
    ],
    [
      { label: 'Set Pivot Time', select: () => onSetPivot(target.log) },
      { label: 'Clear Pivot Time', select: onClearPivot, disabled: !hasPivot },
    ],
  ];

  return (
    <div
      ref={menuRef}
      aria-label="Log actions"
      className="context-menu fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-36"
      style={{ left: target.x, top: target.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {groups.map((items, index) => (
        <div key={index}>
          {index > 0 && <div className="border-t border-gray-200 dark:border-gray-600 my-1" />}
          {items.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                item.select();
                onClose();
              }}
              className="w-full px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:text-gray-400 dark:disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
