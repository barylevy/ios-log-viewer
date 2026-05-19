import React, { useEffect, useRef, useState } from 'react';

const DEFAULT_CHECKED_PREFIXES = ['applogs', 'appextensionlogs'];

const hasFileObj = (f) => {
  const obj = Array.isArray(f.fileObj) ? f.fileObj[0] : f.fileObj;
  return !!obj;
};

const getRootFolder = (f) => {
  const obj = f.fileObj;
  const first = Array.isArray(obj) ? obj[0] : obj;
  if (!first) return null;
  const relPath = first.webkitRelativePath || first.path || '';
  if (!relPath.includes('/')) return null;
  return relPath.split('/')[0];
};

const MergeTabsDialog = ({ isOpen, onClose, files, onConfirm }) => {
  const modalRef = useRef(null);
  const [selected, setSelected] = useState({});

  // (Re)initialise checkboxes whenever the dialog opens or the file list changes
  useEffect(() => {
    if (!isOpen) return;
    const initial = {};
    files.forEach(f => {
      if (!hasFileObj(f)) { initial[f.id] = false; return; }
      const fullName = (f.name || '').replace(/\s*\(\d+\)\s*$/, '').trim();
      const lastSegment = fullName.split('/').pop().toLowerCase();
      initial[f.id] = DEFAULT_CHECKED_PREFIXES.some(p => lastSegment === p || lastSegment.startsWith(p));
    });
    setSelected(initial);
  }, [isOpen, files]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
  };

  const toggle = (id) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));

  const handleMerge = () => {
    const selectedIds = Object.keys(selected).filter(id => selected[id]);
    if (!selectedIds.length) return;
    onConfirm(selectedIds);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  // Sort: by root folder, then by type (name without count suffix), then by full name
  const sortedFiles = [...files].sort((a, b) => {
    const folderA = getRootFolder(a) || '';
    const folderB = getRootFolder(b) || '';
    if (folderA !== folderB) return folderA.localeCompare(folderB);
    const typeA = (a.name || '').replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase();
    const typeB = (b.name || '').replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase();
    if (typeA !== typeB) return typeA.localeCompare(typeB);
    return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
  });

  // Group by root folder for section headers
  const groupedByFolder = [];
  sortedFiles.forEach(f => {
    const folder = getRootFolder(f);
    const last = groupedByFolder[groupedByFolder.length - 1];
    if (last && last.folder === folder) {
      last.items.push(f);
    } else {
      groupedByFolder.push({ folder, items: [f] });
    }
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
      onMouseDown={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 relative flex flex-col overflow-hidden"
        style={{ resize: 'both', width: 'auto', minWidth: '24rem', maxWidth: '80vw', minHeight: '20rem', maxHeight: '90vh' }}
      >
        {/* Close button */}
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1 shrink-0">
          Download Merged Logs
        </h2>
        <div className="flex items-center justify-between mb-4 shrink-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select which tabs to include in the merged output:
          </p>
          <div className="flex gap-2 ml-4">
            <button
              onClick={() => {
                const next = {};
                files.forEach(f => { if (hasFileObj(f)) next[f.id] = true; });
                setSelected(prev => ({ ...prev, ...next }));
              }}
              className="text-xs px-2 py-1 rounded border border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={() => {
                const next = {};
                files.forEach(f => { next[f.id] = false; });
                setSelected(prev => ({ ...prev, ...next }));
              }}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Tab list — grows to fill available space */}
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-md mb-5 overflow-y-auto flex-1">
          {groupedByFolder.map(({ folder, items }) => (
            <React.Fragment key={folder || '__no_folder__'}>
              {folder && (
                <li className="px-4 py-2 bg-gray-100 dark:bg-gray-700 flex items-center gap-2 sticky top-0 z-10">
                  <svg className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 break-all">{folder}</span>
                </li>
              )}
              {items.map(f => {
                const available = hasFileObj(f);
                return (
                  <li key={f.id}>
                    <label
                      className={`flex items-center gap-3 px-4 py-3 select-none ${available ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : 'cursor-not-allowed opacity-50'}`}
                      title={available ? '' : 'File not available — re-open the folder to enable merging'}
                    >
                      <input
                        type="checkbox"
                        checked={!!selected[f.id]}
                        onChange={() => available && toggle(f.id)}
                        disabled={!available}
                        className="w-4 h-4 accent-emerald-600 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-200 break-all flex-1">
                        {f.name}
                      </span>
                      {!available && (
                        <span className="text-xs text-amber-500 dark:text-amber-400 shrink-0">re-open required</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ul>

        {/* Actions */}
        <div className="flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={selectedCount === 0}
            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
            </svg>
            Merge{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MergeTabsDialog;

