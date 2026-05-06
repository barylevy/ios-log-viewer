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

export function isArchiveFile(file) {
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
export async function extractArchive(file) {
  const name = file.name;
  if (ZIP_RE.test(name)) return extractZip(file);
  if (TAR_XZ_RE.test(name)) return extractTarXz(file);
  throw new Error(`Unsupported archive: ${name}`);
}

function attachRelPath(file, relPath) {
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relPath,
      writable: false,
      configurable: true,
    });
  } catch {
    // Some browsers refuse to override the property — fall back to a
    // mirrored property the rest of the code already prefers.
    file.webkitRelativePath = relPath;
  }
  return file;
}

/**
 * macOS bundles AppleDouble resource forks (`._filename`) and a top-level
 * `__MACOSX/` directory inside zip/tar archives. They duplicate every entry
 * and contain only Finder metadata — always skip them.
 */
function isMacResourceForkPath(p) {
  if (!p) return false;
  if (p.startsWith('__MACOSX/') || p.includes('/__MACOSX/')) return true;
  const leaf = p.split('/').pop() || '';
  if (leaf.startsWith('._')) return true;
  if (leaf === '.DS_Store') return true;
  return false;
}

async function extractZip(file) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const baseName = file.name.replace(ZIP_RE, '');
  const out = [];

  const entries = Object.values(zip.files).filter(
    e => !e.dir && !isMacResourceForkPath(e.name)
  );
  for (const entry of entries) {
    const blob = await entry.async('blob');
    const leaf = entry.name.split('/').pop() || entry.name;
    const f = new File([blob], leaf, { type: blob.type || 'text/plain' });
    out.push(attachRelPath(f, `${baseName}/${entry.name}`));
  }
  return out;
}

async function extractTarXz(file) {
  // Decompress .xz streaming, then parse the resulting tar.
  const { XzReadableStream } = await import('xz-decompress');
  const decompressed = new Response(new XzReadableStream(file.stream()));
  const buf = new Uint8Array(await decompressed.arrayBuffer());
  const baseName = file.name.replace(TAR_XZ_RE, '');
  return parseTar(buf, baseName);
}

/**
 * Minimal POSIX/ustar tar parser: yields regular files only.
 * Handles 100-char names + optional 155-char ustar prefix and the GNU
 * "longlink" (`L`) extension that some bundles use for paths > 100 chars.
 */
function parseTar(buf, baseName) {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const readCStr = (start, len) => {
    const slice = buf.subarray(start, start + len);
    const nul = slice.indexOf(0);
    return decoder.decode(slice.subarray(0, nul === -1 ? len : nul));
  };

  const out = [];
  let offset = 0;
  let pendingLongName = null;

  while (offset + 512 <= buf.length) {
    // End of archive: two consecutive zero blocks.
    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (buf[offset + i] !== 0) { allZero = false; break; }
    }
    if (allZero) break;

    const name = readCStr(offset, 100);
    const sizeStr = readCStr(offset + 124, 12).trim();
    const size = parseInt(sizeStr, 8) || 0;
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
    out.push(attachRelPath(f, `${baseName}/${fullName}`));
  }

  return out;
}

/**
 * Given a list of files (some of which may be archives), return a flat list
 * with archives expanded. Non-archive files are passed through unchanged.
 */
export async function expandArchivesInList(files) {
  const result = [];
  for (const f of files) {
    if (isArchiveFile(f)) {
      try {
        const extracted = await extractArchive(f);
        result.push(...extracted);
      } catch (err) {
        console.error(`Failed to extract ${f.name}:`, err);
        throw err;
      }
    } else {
      result.push(f);
    }
  }
  return result;
}
