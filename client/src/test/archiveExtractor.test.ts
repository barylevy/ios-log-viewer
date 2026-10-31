import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_LIMITS,
  expandArchivesInList,
  extractArchive,
  parseTar,
} from '../utils/archiveExtractor';

function fileWithBytes(bytes: Uint8Array<ArrayBuffer>, name: string): File {
  const file = new File([bytes], name);
  // jsdom's File predates Blob.arrayBuffer; real browsers provide it natively.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });
  return file;
}

function tarEntry(name: string, contents: string): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const bytes = new Uint8Array(1536);
  const write = (offset: number, text: string) => bytes.set(encoder.encode(text), offset);
  write(0, name);
  write(124, contents.length.toString(8).padStart(11, '0') + '\0');
  bytes[156] = 48;
  bytes.fill(32, 148, 156);
  const checksum = bytes.subarray(0, 512).reduce((sum, value) => sum + value, 0);
  write(148, checksum.toString(8).padStart(6, '0') + '\0 ');
  write(512, contents);
  return bytes;
}

describe('bounded archive extraction', () => {
  it('streams a zip and preserves folder paths', async () => {
    const zip = new JSZip();
    zip.file('AppLogs/app.log', 'hello');
    zip.file('__MACOSX/._app.log', 'ignored');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const result = await extractArchive(fileWithBytes(new Uint8Array(bytes), 'bundle.zip'));
    expect(result).toHaveLength(1);
    expect(result[0].webkitRelativePath).toBe('bundle/AppLogs/app.log');
    expect(result[0].size).toBe(5);
  });
  it('rejects too many entries before decompressing them', async () => {
    const zip = new JSZip();
    for (let index = 0; index <= ARCHIVE_LIMITS.entries; index++) zip.file(`${index}.log`, '');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(extractArchive(fileWithBytes(new Uint8Array(bytes), 'many.zip'))).rejects.toThrow(
      'too many',
    );
  });
  it('validates tar checksums and rejects unsafe paths', () => {
    expect(parseTar(tarEntry('app.log', 'hello'), 'bundle')[0].size).toBe(5);
    expect(() => parseTar(tarEntry('../outside.log', 'hello'), 'bundle')).toThrow('unsafe path');
    const invalid = tarEntry('app.log', 'hello');
    invalid[0] = 65;
    expect(() => parseTar(invalid, 'bundle')).toThrow('checksum');
  });
  it('rejects a tar whose contents are truncated', () => {
    expect(() => parseTar(tarEntry('app.log', 'hello').slice(0, 514), 'bundle')).toThrow(
      'Truncated',
    );
  });
  it('rejects oversized compressed files before reading them', async () => {
    const file = new File([], 'large.zip');
    Object.defineProperty(file, 'size', { value: ARCHIVE_LIMITS.compressedBytes + 1 });
    await expect(extractArchive(file)).rejects.toThrow('compressed limit');
  });
  it('passes ordinary files through unchanged', async () => {
    const file = new File(['hello'], 'app.log');
    expect(await expandArchivesInList([file])).toEqual([file]);
  });
});
