/**
 * Tests for the Windows path helpers in scripts/live-logs-server.js.
 *
 * The server file guards its startup behind `require.main === module`, so
 * importing it here exposes the pure helpers without opening a port.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  WIN_LOG_SUBPATH,
  WIN_LOG_PATTERN,
  resolveWinLogDir,
  listMatchingFiles,
  pickLatestFile,
  rootFromArgv,
} = require('../../../scripts/live-logs-server.js');

describe('resolveWinLogDir', () => {
  it('appends the fixed sub-path to a plain root', () => {
    expect(resolveWinLogDir('C:\\Users\\LiorZats\\ws'))
      .toBe(path.join('C:\\Users\\LiorZats\\ws', WIN_LOG_SUBPATH));
  });

  it('returns a full folder unchanged when it already ends with the sub-path', () => {
    const full = 'C:\\Users\\LiorZats\\ws\\endpoint\\endpoint\\sdp\\win\\Product\\Debug\\x64';
    expect(resolveWinLogDir(full)).toBe(full);
  });

  it('recognises the sub-path regardless of separator style or case', () => {
    const forward = 'C:/Users/LiorZats/ws/endpoint/endpoint/sdp/WIN/Product/debug/X64';
    expect(resolveWinLogDir(forward)).toBe(forward);
  });

  it('strips trailing separators before resolving', () => {
    expect(resolveWinLogDir('C:\\Users\\LiorZats\\ws\\'))
      .toBe(path.join('C:\\Users\\LiorZats\\ws', WIN_LOG_SUBPATH));
  });

  it('returns null for an empty or whitespace root', () => {
    expect(resolveWinLogDir('')).toBeNull();
    expect(resolveWinLogDir('   ')).toBeNull();
    expect(resolveWinLogDir(null)).toBeNull();
    expect(resolveWinLogDir(undefined)).toBeNull();
  });
});

describe('pickLatestFile / listMatchingFiles', () => {
  let dir;

  const write = (name, mtimeMs) => {
    const full = path.join(dir, name);
    fs.writeFileSync(full, `content of ${name}\n`);
    fs.utimesSync(full, mtimeMs / 1000, mtimeMs / 1000);
    return full;
  };

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cato-live-logs-test-'));
    write('cato_vpn_6.13.0.0_20260803110029.log', Date.UTC(2026, 7, 3));
    write('cato_vpn_6.13.0.0_20260813120000.log', Date.UTC(2026, 7, 13));
    write('cato_vpn_6.13.0.0_20260810090000.log', Date.UTC(2026, 7, 10));
    write('cato_dem_6.13.0.0_20260814000000.log', Date.UTC(2026, 7, 14)); // newer, wrong prefix
    write('cato_vpn_notes.txt', Date.UTC(2026, 7, 15));                   // newer, wrong extension
    fs.mkdirSync(path.join(dir, 'cato_vpn_subdir.log'));                  // a directory, not a file
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists only regular files matching the cato_vpn pattern', () => {
    const names = listMatchingFiles(dir, WIN_LOG_PATTERN).map(f => f.name).sort();
    expect(names).toEqual([
      'cato_vpn_6.13.0.0_20260803110029.log',
      'cato_vpn_6.13.0.0_20260810090000.log',
      'cato_vpn_6.13.0.0_20260813120000.log',
    ]);
  });

  it('picks the most recently modified match', () => {
    expect(pickLatestFile(dir, WIN_LOG_PATTERN).name).toBe('cato_vpn_6.13.0.0_20260813120000.log');
  });

  it('picks by mtime, not by the timestamp in the filename', () => {
    const oldest = path.join(dir, 'cato_vpn_6.13.0.0_20260803110029.log');
    const future = Date.UTC(2026, 8, 1);
    fs.utimesSync(oldest, future / 1000, future / 1000);

    expect(pickLatestFile(dir, WIN_LOG_PATTERN).name).toBe('cato_vpn_6.13.0.0_20260803110029.log');
  });

  it('returns null for a missing directory', () => {
    expect(pickLatestFile(path.join(dir, 'nope'), WIN_LOG_PATTERN)).toBeNull();
    expect(pickLatestFile(null, WIN_LOG_PATTERN)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cato-live-logs-empty-'));
    try {
      expect(pickLatestFile(empty, WIN_LOG_PATTERN)).toBeNull();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('rootFromArgv', () => {
  it('reads --root=<path>', () => {
    expect(rootFromArgv(['node', 'srv.js', '--root=C:\\Users\\you\\ws'])).toBe('C:\\Users\\you\\ws');
  });

  it('reads --root <path>', () => {
    expect(rootFromArgv(['node', 'srv.js', '--root', 'C:\\Users\\you\\ws'])).toBe('C:\\Users\\you\\ws');
  });

  it('returns null when absent', () => {
    expect(rootFromArgv(['node', 'srv.js'])).toBeNull();
    expect(rootFromArgv(['node', 'srv.js', '--root'])).toBeNull();
  });
});
