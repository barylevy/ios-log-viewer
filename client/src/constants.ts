// Shared constants for log processing

export const LOG_LEVEL_MATRIX = [
  ['error', '[Error]', ' E ', '[E]', '[err]', 'ERROR:', 'Error:'],
  ['warning', '[Warning]', ' W ', '[W]', '[warn]', 'WARNING:', 'Warning:'],
  ['info', '[Info]', ' I ', '[I]', 'INFO:', 'Info:'],
  ['debug', '[Debug]', ' D ', '[D]', 'DEBUG:', 'Debug:'],
  ['verbose', '[Verbose]', ' V ', '[V]', '[T]', '[Trace]', 'VERBOSE:', 'Verbose:'],
];

// Cato Networks Brand Colors
export const CATO_COLORS = {
  // Primary brand color
  PRIMARY: '#008C73',
  // Dark mode variant
  PRIMARY_DARK: '#006356',
  // Light backgrounds
  LIGHT_BG: '#B3DDD5',
  LIGHT_HIGHLIGHT_BG: '#d1fae5',
  // Dark backgrounds
  DARK_BG: '#006356',
  DARK_HIGHLIGHT_BG: '#004d42',
};

interface ColumnOption {
  id: string;
  label: string;
  defaultVisible: boolean;
  disabled?: boolean;
}

export const AVAILABLE_COLUMNS: ColumnOption[] = [
  { id: 'timestamp', label: 'Timestamp', defaultVisible: true },
  { id: 'lineNumber', label: 'Line Number', defaultVisible: true },
  { id: 'logLevel', label: 'Log Level', defaultVisible: true },
  { id: 'message', label: 'Message', defaultVisible: true, disabled: true }, // Message is always visible
  { id: 'module', label: 'Module', defaultVisible: false },
  { id: 'sourceFile', label: 'Source File', defaultVisible: false },
  { id: 'processThread', label: 'Process:Thread', defaultVisible: true },
  { id: 'timeGap', label: 'Time Gap', defaultVisible: false },
];

export const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = Object.fromEntries(
  AVAILABLE_COLUMNS.map((column) => [column.id, column.defaultVisible]),
);

// Row order is independent of the order of checkboxes in Column Settings.
export const DEFAULT_COLUMN_ORDER = [
  'timestamp',
  'lineNumber',
  'logLevel',
  'message',
  'module',
  'sourceFile',
  'timeGap',
  'processThread',
];

export const DEFAULT_LOG_GROUP_PREFIXES = ['applogs', 'appextensionlogs'];
