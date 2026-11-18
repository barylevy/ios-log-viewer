import type { LogRecord } from './logRecord';

export interface ViewerFile {
  id: string;
  name: string;
  fileObj?: File | File[];
  isGroup?: boolean;
  groupPrefix?: string | null;
  isLive?: boolean;
}

export type ColumnVisibility = Record<string, boolean>;

export interface LiveSourceUpdate {
  sourceKey: string;
  label: string;
  logs: LogRecord[];
  isInitial: boolean;
}

export interface LiveCallbacks {
  onSourceUpdate?: (update: LiveSourceUpdate) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export interface DirectoryStatus {
  dir: string | null;
  exists: boolean;
  currentFile: string | null;
  matchCount: number;
}

export interface LiveServerConfig {
  platform: string;
  configurable: boolean;
  needsConfig: boolean;
  logDir: string | null;
  resolvedDir: string | null;
  dirExists: boolean;
  currentFile: string | null;
  matchCount: number;
  antiTamper: DirectoryStatus;
  port: number;
}

export function errorName(error: unknown): string {
  return error instanceof Error || error instanceof DOMException ? error.name : '';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
