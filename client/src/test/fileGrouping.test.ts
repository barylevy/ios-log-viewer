import { describe, expect, it, vi } from 'vitest';
import {
  groupFilesByDirectory,
  groupFilesByDirectoryAndFormat,
  groupFilesByPrefix,
} from '../utils/fileGrouping';

const apple = '2026-10-31 12:00:00:000 [Main:1] [D] [t:1] [p:2] message';
const chrome = '[123:456:1031/120000.000:INFO:main.cc(1)] message';

function file(path: string, content = apple): File {
  const result = new File([content], path.split('/').pop()!);
  if (path.includes('/')) Object.defineProperty(result, 'webkitRelativePath', { value: path });
  return result;
}

function names(groups: Map<string, File[]>): Record<string, string[]> {
  return Object.fromEntries(
    [...groups].map(([key, files]) => [key, files.map((file) => file.name)]),
  );
}

describe('file grouping rules', () => {
  it('groups numbered files by prefix and sorts naturally without changing input order', () => {
    const files = [file('cato.10.log'), file('cato.2.log'), file('cato.1.log'), file('other.log')];
    expect(names(groupFilesByPrefix(files))).toEqual({
      cato: ['cato.1.log', 'cato.2.log', 'cato.10.log'],
      other: ['other.log'],
    });
    expect(files.map((file) => file.name)).toEqual([
      'cato.10.log',
      'cato.2.log',
      'cato.1.log',
      'other.log',
    ]);
  });

  it('uses prefixes for a single directory and ignores non-log files', () => {
    expect(
      names(
        groupFilesByDirectory([
          file('root/AppLogs/app.2.log'),
          file('root/AppLogs/app.1.log'),
          file('root/AppLogs/dem.1.txt'),
          file('root/Packets/capture.pcap'),
        ]),
      ),
    ).toEqual({ app: ['app.1.log', 'app.2.log'], dem: ['dem.1.txt'] });
  });

  it('keeps subdirectories together and groups the picked folder’s root files by prefix', () => {
    expect(
      names(
        groupFilesByDirectory([
          file('root/system.log'),
          file('root/AppLogs/app.2.log'),
          file('root/AppLogs/app.1.log'),
          file('root/DemLogs/dem.1.log'),
          file('root/Packets/capture.pcap'),
        ]),
      ),
    ).toEqual({
      system: ['system.log'],
      'root/AppLogs': ['app.1.log', 'app.2.log'],
      'root/DemLogs': ['dem.1.log'],
    });
  });

  it('retains a single group when every file has the same known format', async () => {
    expect(
      names(await groupFilesByDirectoryAndFormat([file('app.2.log'), file('app.1.log')])),
    ).toEqual({
      app: ['app.1.log', 'app.2.log'],
    });
  });

  it('separates known formats and gives each unknown file its own tab', async () => {
    expect(
      names(
        await groupFilesByDirectoryAndFormat([
          file('app.1.log'),
          file('app.2.log', chrome),
          file('app.3.log', 'plain text'),
          file('app.4.log', 'other text'),
        ]),
      ),
    ).toEqual({
      'app [ios-macos-explicit]': ['app.1.log'],
      'app [chrome-windows]': ['app.2.log'],
      'app/app.3.log': ['app.3.log'],
      'app/app.4.log': ['app.4.log'],
    });
  });

  it('does not merge unrelated files just because both formats are unknown', async () => {
    expect(
      names(
        await groupFilesByDirectoryAndFormat([file('app.1.log', 'one'), file('app.2.log', 'two')]),
      ),
    ).toEqual({
      'app/app.1.log': ['app.1.log'],
      'app/app.2.log': ['app.2.log'],
    });
  });

  it('does not read singleton groups and isolates unreadable files', async () => {
    const broken = file('app.1.log');
    const slice = vi.spyOn(broken, 'slice').mockImplementation(() => {
      throw new Error('Unreadable');
    });
    expect(names(await groupFilesByDirectoryAndFormat([broken]))).toEqual({ app: ['app.1.log'] });
    expect(slice).not.toHaveBeenCalled();
    expect(names(await groupFilesByDirectoryAndFormat([broken, file('app.2.log')]))).toEqual({
      'app/app.1.log': ['app.1.log'],
      'app [ios-macos-explicit]': ['app.2.log'],
    });
  });
});
