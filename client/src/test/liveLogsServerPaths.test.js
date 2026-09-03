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
  WIN_LOG_PATTERN,
  WIN_ANTITAMPER_SUBDIRS,
  WIN_ANTITAMPER_PATTERN,
  firstExistingDir,
  firstDirWithMatch,
  MAC_ANTITAMPER_PATTERN,
  resolveAntiTamperDir,
  winSourcesFor,
  normalizeLogDir,
  listMatchingFiles,
  pickLatestFile,
  dirFromArgv,
} = require('../../../scripts/live-logs-server.js');

// The installed client's log folder — note the spaces and parentheses.
const FULL_DIR = 'C:\\Program Files (x86)\\Cato Networks\\Cato Client';
const DEV_DIR = 'C:\\Users\\LiorZats\\ws\\endpoint\\endpoint\\sdp\\win\\Product\\Debug\\x64';

describe('normalizeLogDir', () => {
  it('uses the given directory exactly, appending nothing', () => {
    expect(normalizeLogDir(FULL_DIR)).toBe(FULL_DIR);
    expect(normalizeLogDir(DEV_DIR)).toBe(DEV_DIR);
  });

  it('keeps spaces and parentheses intact', () => {
    expect(normalizeLogDir(FULL_DIR)).toContain(' (x86)');
    expect(normalizeLogDir(FULL_DIR)).toContain('Cato Client');
  });

  it('leaves a short path alone rather than assuming a sub-path', () => {
    expect(normalizeLogDir('C:\\logs')).toBe('C:\\logs');
  });

  it('preserves forward slashes as typed', () => {
    expect(normalizeLogDir('C:/Users/LiorZats/logs')).toBe('C:/Users/LiorZats/logs');
  });

  it('strips surrounding whitespace and trailing separators', () => {
    expect(normalizeLogDir(`  ${FULL_DIR}\\  `)).toBe(FULL_DIR);
    expect(normalizeLogDir('C:/logs//')).toBe('C:/logs');
  });

  it('returns null for an empty or whitespace path', () => {
    expect(normalizeLogDir('')).toBeNull();
    expect(normalizeLogDir('   ')).toBeNull();
    expect(normalizeLogDir(null)).toBeNull();
    expect(normalizeLogDir(undefined)).toBeNull();
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

describe('dirFromArgv', () => {
  it('reads --dir=<path>', () => {
    expect(dirFromArgv(['node', 'srv.js', `--dir=${FULL_DIR}`])).toBe(FULL_DIR);
  });

  it('reads --dir <path>', () => {
    expect(dirFromArgv(['node', 'srv.js', '--dir', FULL_DIR])).toBe(FULL_DIR);
  });

  it('keeps a path with spaces and parentheses in one piece', () => {
    // How PowerShell hands `--dir="C:\Program Files (x86)\..."` to argv.
    expect(dirFromArgv(['node', 'srv.js', `--dir=${FULL_DIR}`])).toBe(FULL_DIR);
    expect(dirFromArgv(['node', 'srv.js', '--dir', FULL_DIR])).toBe(FULL_DIR);
  });

  it('still accepts the legacy --root spelling', () => {
    expect(dirFromArgv(['node', 'srv.js', `--root=${FULL_DIR}`])).toBe(FULL_DIR);
    expect(dirFromArgv(['node', 'srv.js', '--root', FULL_DIR])).toBe(FULL_DIR);
  });

  it('returns null when absent', () => {
    expect(dirFromArgv(['node', 'srv.js'])).toBeNull();
    expect(dirFromArgv(['node', 'srv.js', '--dir'])).toBeNull();
  });
});


describe('winSourcesFor', () => {
  it('builds a vpn source at the given folder and an antitamper source below it', () => {
    const [vpn, antiTamper] = winSourcesFor(FULL_DIR);

    expect(vpn.key).toBe('vpn');
    expect(vpn.path).toBe(FULL_DIR);
    expect(vpn.type).toBe('latest');

    expect(antiTamper.key).toBe('antitamper');
    expect(antiTamper.path).toBe(path.join(FULL_DIR, 'AntiTamperLogs'));
    expect(antiTamper.type).toBe('latest');
  });

  it('keeps the two sources on distinct tab keys', () => {
    const keys = winSourcesFor(FULL_DIR).map(s => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns nothing when no folder is configured', () => {
    expect(winSourcesFor(null)).toEqual([]);
    expect(winSourcesFor('')).toEqual([]);
  });

  it('matches any log/txt for antitamper, without assuming a filename', () => {
    expect(WIN_ANTITAMPER_PATTERN.test('cato_anti_tamper_6.13.0.0_20260901.log')).toBe(true);
    expect(WIN_ANTITAMPER_PATTERN.test('AntiTamper.txt')).toBe(true);
    expect(WIN_ANTITAMPER_PATTERN.test('whatever.LOG')).toBe(true);
    expect(WIN_ANTITAMPER_PATTERN.test('notes.json')).toBe(false);
  });
});


describe('resolveAntiTamperDir', () => {
  let base;

  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'cato-at-'));
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('falls back to the confirmed name when nothing exists, so /config can report it', () => {
    expect(resolveAntiTamperDir(base)).toBe(path.join(base, 'AntiTamperLogs'));
  });

  it('picks the bare AntiTamper spelling when that is the folder on disk', () => {
    const fallback = path.join(base, 'AntiTamper');
    fs.mkdirSync(fallback);
    expect(resolveAntiTamperDir(base)).toBe(fallback);
  });

  it('prefers AntiTamperLogs when both spellings exist', () => {
    // A support bundle confirmed this is the real folder name.
    const preferred = path.join(base, 'AntiTamperLogs');
    fs.mkdirSync(preferred);
    expect(resolveAntiTamperDir(base)).toBe(preferred);
  });

  it('ignores a plain file with the folder name', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'cato-at2-'));
    try {
      fs.writeFileSync(path.join(other, 'AntiTamperLogs'), 'not a directory');
      const real = path.join(other, 'AntiTamper');
      fs.mkdirSync(real);
      expect(resolveAntiTamperDir(other)).toBe(real);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it('returns null with no directory', () => {
    expect(resolveAntiTamperDir(null)).toBeNull();
    expect(resolveAntiTamperDir('')).toBeNull();
  });

  it('lists both accepted spellings, preferred first', () => {
    expect(WIN_ANTITAMPER_SUBDIRS[0]).toBe('AntiTamperLogs');
    expect(WIN_ANTITAMPER_SUBDIRS).toContain('AntiTamper');
  });
});


describe('firstExistingDir', () => {
  let base;

  beforeAll(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'cato-fed-')); });
  afterAll(() => { fs.rmSync(base, { recursive: true, force: true }); });

  it('falls back to the first candidate when none exist, so it stays reportable', () => {
    const a = path.join(base, 'AntiTamperLogs');
    const b = path.join(base, 'AntiTamper');
    expect(firstExistingDir([a, b])).toBe(a);
  });

  it('skips missing candidates and returns the one that exists', () => {
    const real = path.join(base, 'AntiTamper');
    fs.mkdirSync(real);
    expect(firstExistingDir([path.join(base, 'AntiTamperLogs'), real])).toBe(real);
  });

  it('prefers the earlier candidate when several exist', () => {
    const preferred = path.join(base, 'AntiTamperLogs');
    fs.mkdirSync(preferred);
    expect(firstExistingDir([preferred, path.join(base, 'AntiTamper')])).toBe(preferred);
  });

  it('ignores a plain file sharing the name', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'cato-fed2-'));
    try {
      fs.writeFileSync(path.join(other, 'AntiTamperLogs'), 'not a directory');
      const dir = path.join(other, 'AntiTamper');
      fs.mkdirSync(dir);
      expect(firstExistingDir([path.join(other, 'AntiTamperLogs'), dir])).toBe(dir);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});


describe('macOS AntiTamper selection', () => {
  let base;

  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'cato-mac-at-'));
    fs.mkdirSync(path.join(base, 'AppLogs'));
    fs.mkdirSync(path.join(base, 'Empty'));
    // The real layout: anti-tamper logs sit among ordinary app logs.
    fs.writeFileSync(path.join(base, 'AppLogs', 'AntiTamperLogs.log'), 'tamper\n');
    fs.writeFileSync(path.join(base, 'AppLogs', 'AntiTamperLogs.1.log'), 'rotated\n');
    fs.writeFileSync(path.join(base, 'AppLogs', 'com.catonetworks.mac.CatoClient 2026-09-03.log'), 'app\n');
  });

  afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

  it('matches anti-tamper files, including rotated ones', () => {
    expect(MAC_ANTITAMPER_PATTERN.test('AntiTamperLogs.log')).toBe(true);
    expect(MAC_ANTITAMPER_PATTERN.test('AntiTamperLogs.1.log')).toBe(true);
    expect(MAC_ANTITAMPER_PATTERN.test('AntiTamperLogs.txt')).toBe(true);
  });

  it('does not match the app logs sharing that folder', () => {
    // Without this the AntiTamper tab would duplicate AppLogs.
    expect(MAC_ANTITAMPER_PATTERN.test('com.catonetworks.mac.CatoClient 2026-09-03.log')).toBe(false);
    expect(MAC_ANTITAMPER_PATTERN.test('daemon_log.txt')).toBe(false);
  });

  it('selects only the anti-tamper files from a shared folder', () => {
    const names = listMatchingFiles(path.join(base, 'AppLogs'), MAC_ANTITAMPER_PATTERN)
      .map(f => f.name).sort();
    expect(names).toEqual(['AntiTamperLogs.1.log', 'AntiTamperLogs.log']);
  });

  it('skips a candidate that exists but holds no anti-tamper file', () => {
    const chosen = firstDirWithMatch(
      [path.join(base, 'Empty'), path.join(base, 'AppLogs')],
      MAC_ANTITAMPER_PATTERN,
    );
    expect(chosen).toBe(path.join(base, 'AppLogs'));
  });

  it('falls back to the first existing candidate when none hold a match', () => {
    const chosen = firstDirWithMatch(
      [path.join(base, 'Nope'), path.join(base, 'Empty')],
      MAC_ANTITAMPER_PATTERN,
    );
    expect(chosen).toBe(path.join(base, 'Empty'));
  });

  it('falls back to the first candidate when none exist at all', () => {
    const first = path.join(base, 'Nope');
    expect(firstDirWithMatch([first, path.join(base, 'AlsoNope')], MAC_ANTITAMPER_PATTERN)).toBe(first);
  });
});
