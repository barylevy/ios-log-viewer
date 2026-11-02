import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
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
    <Menu
      open
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={{ left: target.x, top: target.y }}
      slotProps={{ list: { 'aria-label': 'Log actions' } }}
    >
      {groups.flatMap((items, index) => [
        ...(index > 0 ? [<Divider key={`divider-${index}`} />] : []),
        ...items.map((item) => (
          <MenuItem
            key={item.label}
            disabled={item.disabled}
            onClick={() => {
              item.select();
              onClose();
            }}
          >
            {item.label}
          </MenuItem>
        )),
      ])}
    </Menu>
  );
}
