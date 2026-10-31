interface ZipEntryStream {
  on(event: 'data', callback: (chunk: Uint8Array) => void): ZipEntryStream;
  on(event: 'error', callback: (error: Error) => void): ZipEntryStream;
  on(event: 'end', callback: () => void): ZipEntryStream;
  pause(): ZipEntryStream;
  resume(): ZipEntryStream;
}

export const ARCHIVE_LIMITS = {
  compressedBytes: 256 * 1024 * 1024,
  expandedBytes: 512 * 1024 * 1024,
  fileBytes: 128 * 1024 * 1024,
  entries: 10000,
} as const;

class ExtractionBudget {
  bytes = 0;
  consume(count: number): void {
    this.bytes += count;
    if (this.bytes > ARCHIVE_LIMITS.expandedBytes)
      throw new Error('Archive exceeds the 512 MB extraction limit.');
  }
}

/**
 * Extract .zip and .tar.xz archives into in-memory File objects with a
 * synthetic `webkitRelativePath`, so the rest of the app can treat the
 * contents exactly like files chosen via a folder picker.
 *
 * Heavy decompressors (`jszip`, `xz-decompress`) are dynamically imported so
 * users who never open an archive don't pay for them.
 */

const ZIP_RE = /\.zip$/i;
const TAR_XZ_RE = /\.(?:tar\.xz|txz|xz)$/i;

export function isArchiveFile(file: { name: string }) {
  const name = file?.name || '';
  return ZIP_RE.test(name) || TAR_XZ_RE.test(name);
}

/**
 * Extract the given archive `File` into a flat array of `File` objects.
 * Each returned file has `webkitRelativePath` set to `<archiveBase>/<entry>`.
 *
 * @param {File} file
 * @returns {Promise<File[]>}
 */
export async function extractArchive(file: File): Promise<File[]> {
  if (file.size > ARCHIVE_LIMITS.compressedBytes)
    throw new Error('Archive exceeds the 256 MB compressed limit.');
  const name = file.name;
  if (ZIP_RE.test(name)) return extractZip(file);
  if (TAR_XZ_RE.test(name)) return extractTarXz(file);
  throw new Error(`Unsupported archive: ${name}`);
}

function attachRelPath(file: File, relPath: string): File {
  const normalized = relPath.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((part) => part === '..')
  ) {
    throw new Error('Archive contains an unsafe path.');
  }
  Object.defineProperty(file, 'webkitRelativePath', { value: normalized, configurable: true });
  return file;
}

/**
 * macOS bundles AppleDouble resource forks (`._filename`) and a top-level
 * `__MACOSX/` directory inside zip/tar archives. They duplicate every entry
 * and contain only Finder metadata — always skip them.
 */
function isMacResourceForkPath(p: string) {
  if (!p) return false;
  if (p.startsWith('__MACOSX/') || p.includes('/__MACOSX/')) return true;
  const leaf = p.split('/').pop() || '';
  if (leaf.startsWith('._')) return true;
  if (leaf === '.DS_Store') return true;
  return false;
}

async function extractZip(file: File): Promise<File[]> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const baseName = file.name.replace(ZIP_RE, '');
  const out: File[] = [];

  const entries = Object.values(zip.files).filter((e) => !e.dir && !isMacResourceForkPath(e.name));
  if (entries.length > ARCHIVE_LIMITS.entries) throw new Error('Archive contains too many files.');
  const budget = new ExtractionBudget();
  for (const entry of entries) {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let fileBytes = 0;
      const stream = (
        entry as typeof entry & { internalStream(type: 'uint8array'): ZipEntryStream }
      ).internalStream('uint8array');
      stream.on('data', (chunk) => {
        try {
          fileBytes += chunk.byteLength;
          budget.consume(chunk.byteLength);
          if (fileBytes > ARCHIVE_LIMITS.fileBytes)
            throw new Error('An extracted file exceeds the 128 MB limit.');
          chunks.push(new Uint8Array(chunk));
        } catch (error) {
          stream.pause();
          reject(error);
        }
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(new Blob(chunks)));
      stream.resume();
    });
    const leaf = entry.name.split('/').pop() || entry.name;
    const f = new File([blob], leaf, { type: blob.type || 'text/plain' });
    out.push(attachRelPath(f, `${baseName}/${entry.name}`));
  }
  return out;
}

async function extractTarXz(file: File): Promise<File[]> {
  // Decompress .xz streaming, then parse the resulting tar.
  const { XzReadableStream } = await import('xz-decompress');
  const stream = new XzReadableStream(file.stream());
  const reader = stream.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const budget = new ExtractionBudget();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      budget.consume(value.byteLength);
      chunks.push(new Uint8Array(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const buf = new Uint8Array(budget.bytes);
  let position = 0;
  for (const chunk of chunks) {
    buf.set(chunk, position);
    position += chunk.byteLength;
  }
  const baseName = file.name.replace(TAR_XZ_RE, '');
  return parseTar(buf, baseName);
}

/**
 * Minimal POSIX/ustar tar parser: yields regular files only.
 * Handles 100-char names + optional 155-char ustar prefix and the GNU
 * "longlink" (`L`) extension that some bundles use for paths > 100 chars.
 */
export function parseTar(buf: Uint8Array<ArrayBuffer>, baseName: string): File[] {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const readCStr = (start: number, len: number) => {
    const slice = buf.subarray(start, start + len);
    const nul = slice.indexOf(0);
    return decoder.decode(slice.subarray(0, nul === -1 ? len : nul));
  };

  const out: File[] = [];
  let offset = 0;
  let pendingLongName = null;

  while (offset + 512 <= buf.length) {
    // End of archive: two consecutive zero blocks.
    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (buf[offset + i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) break;

    const name = readCStr(offset, 100);
    const sizeStr = readCStr(offset + 124, 12).trim();
    if (!/^[0-7]+$/.test(sizeStr)) throw new Error('Invalid tar entry size.');
    const size = parseInt(sizeStr, 8);
    if (!Number.isSafeInteger(size) || size > ARCHIVE_LIMITS.fileBytes)
      throw new Error('Tar entry exceeds the 128 MB limit.');
    if (offset + 512 + size > buf.length) throw new Error('Truncated tar entry.');
    const expectedChecksum = parseInt(readCStr(offset + 148, 8).trim(), 8);
    let checksum = 0;
    for (let index = 0; index < 512; index++)
      checksum += index >= 148 && index < 156 ? 32 : buf[offset + index];
    if (checksum !== expectedChecksum) throw new Error('Invalid tar header checksum.');
    const typeFlag = String.fromCharCode(buf[offset + 156] || 0);
    const prefix = readCStr(offset + 345, 155);

    offset += 512;
    const data = buf.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (typeFlag === 'L') {
      // GNU long filename: next entry's name is the contents of this block.
      pendingLongName = decoder.decode(data).replace(/\0+$/, '');
      continue;
    }
    if (typeFlag !== '0' && typeFlag !== '\u0000') {
      // Skip directories, symlinks, pax headers, etc.
      pendingLongName = null;
      continue;
    }

    const fullName = pendingLongName || (prefix ? `${prefix}/${name}` : name);
    pendingLongName = null;
    if (!fullName) continue;
    if (isMacResourceForkPath(fullName)) continue;

    const leaf = fullName.split('/').pop() || fullName;
    const f = new File([data], leaf, { type: 'application/octet-stream' });
    if (out.length >= ARCHIVE_LIMITS.entries) throw new Error('Archive contains too many files.');
    out.push(attachRelPath(f, `${baseName}/${fullName}`));
  }

  return out;
}

/**
 * Given a list of files (some of which may be archives), return a flat list
 * with archives expanded. Non-archive files are passed through unchanged.
 */
export async function expandArchivesInList(files: File[]): Promise<File[]> {
  const result: File[] = [];
  const budget = new ExtractionBudget();
  for (const f of files) {
    if (isArchiveFile(f)) {
      try {
        const extracted = await extractArchive(f);
        for (const entry of extracted) {
          budget.consume(entry.size);
          result.push(entry);
        }
        if (result.length > ARCHIVE_LIMITS.entries) throw new Error('Too many extracted files.');
      } catch (err) {
        console.error(`Failed to extract ${f.name}:`, err);
        throw err;
      }
    } else {
      budget.consume(f.size);
      result.push(f);
    }
  }
  return result;
}
