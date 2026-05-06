/**
 * Export visible log records to a text file.
 *
 * Strategy: write each log's original raw line (preserving the source format)
 * in the exact order they appear in the LogViewer (i.e. the order of the
 * passed-in `logs` array — already sorted/filtered by the viewer).
 *
 * For the combined "All Files" view, prepend a single header section listing
 * every source file that contributed to the export. No inline banners are
 * inserted, so the displayed order is preserved verbatim.
 */

function buildExportText(logs, { tagSourceFile = false, header = null } = {}) {
  const out = [];

  if (header && typeof header === 'object') {
    // Match the import format used by parseHeaderInfo() in fileLoader.js so
    // an exported file can be re-imported and have its header detected.
    // Prefer the original raw header lines (captures every "Key: Value" line
    // present in the source file, including ones not promoted to dedicated
    // structured fields). Fall back to the well-known structured fields.
    let headerLines = [];
    if (Array.isArray(header.rawLines) && header.rawLines.length) {
      headerLines = header.rawLines.slice();
    } else {
      if (header.user) headerLines.push(`User: ${header.user}`);
      if (header.account) headerLines.push(`Account: ${header.account}`);
      if (header.clientVersion) headerLines.push(`Client version: ${header.clientVersion}`);
      if (header.osVersion) headerLines.push(`OS version: ${header.osVersion}`);
    }
    if (headerLines.length) {
      out.push(...headerLines);
      out.push('');
    }
  }

  if (tagSourceFile) {
    const sources = [];
    const seen = new Set();
    for (const log of logs) {
      const src = log.sourceFile || '(unknown source)';
      if (!seen.has(src)) {
        seen.add(src);
        sources.push(src);
      }
    }
    if (sources.length) {
      out.push('===== Combined export — source files =====');
      sources.forEach((src, i) => out.push(`  ${i + 1}. ${src}`));
      out.push('==========================================');
      out.push('');
    }
  }

  for (const log of logs) {
    out.push(log.raw ?? log.message ?? '');
  }
  return out.join('\n') + '\n';
}

function sanitizeFilename(name) {
  return (name || 'logs').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
}

/**
 * Save the given logs to a file. Uses the File System Access API when
 * available (Chrome/Edge) so the user can pick the location, otherwise falls
 * back to a download.
 *
 * @param {Array} logs              The visible logs to export.
 * @param {string} suggestedName    Filename suggestion (without extension).
 * @param {object} [opts]
 * @param {boolean} [opts.tagSourceFile]  Prepend `[sourceFile] ` to each line.
 */
export async function exportLogsToFile(logs, suggestedName, opts = {}) {
  if (!logs || !logs.length) {
    alert('No visible records to export.');
    return;
  }

  const text = buildExportText(logs, opts);
  const filename = `${sanitizeFilename(suggestedName)}.log`;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'Log file',
          accept: { 'text/plain': ['.log', '.txt'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled
      console.error('Save picker failed, falling back to download:', err);
    }
  }

  // Fallback: trigger a download
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
