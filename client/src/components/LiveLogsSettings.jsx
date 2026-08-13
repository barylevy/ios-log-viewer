import React, { useState, useEffect, useCallback } from 'react';
import { fetchLiveConfig, saveLiveRoot, getSavedRoot, setSavedRoot, buildSetupCommand } from '../utils/liveLogsServer';

/**
 * Live Logs Settings — lets the user point the local live-logs server at the
 * folder its build writes cato_vpn_*.log into.
 *
 * Only the root varies between developers; the server appends the fixed
 * sub-path (endpoint\endpoint\sdp\win\Product\Debug\x64) itself. The saved root
 * is persisted server-side, so this dialog is normally used once per machine.
 */
const LiveLogsSettings = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState(null);
  const [root, setRoot] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // Starts true: the first render happens before the config fetch resolves.
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serverDown, setServerDown] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    setSaved(false);

    const cfg = await fetchLiveConfig();
    setConfig(cfg);
    setServerDown(!cfg);

    // Prefer what the server is actually using; otherwise fall back to whatever
    // was configured from this browser, so the folder can be set up-front.
    setRoot(cfg?.root || getSavedRoot());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const trimmed = root.trim();
    setError('');
    setSaved(false);

    // No server yet: remember it locally. It gets applied automatically the
    // moment a server that needs configuring comes up, and it's baked into the
    // start command below.
    if (serverDown) {
      setSavedRoot(trimmed);
      setSaved(true);
      return;
    }

    setIsSaving(true);
    const result = await saveLiveRoot(trimmed);
    if (result.ok) {
      setConfig(result.config);
      setRoot(result.config.root || '');
      setSaved(true);
    } else {
      setError(result.error);
    }
    setIsSaving(false);
  };

  // The folder field only applies to the Windows server. A macOS server reads
  // fixed system paths, so there is nothing to configure. With no server
  // running we can't know the platform, so we always allow configuring.
  const showFolderConfig = serverDown || !!config?.configurable;
  const startCommand = buildSetupCommand(window.location.origin, true, root.trim());

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Live Logs Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {isLoading && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          )}

          {!isLoading && serverDown && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                The live-logs server isn't running — you can still set the folder now. It's applied
                automatically once the server starts.
              </p>
            </div>
          )}

          {!isLoading && !serverDown && config && !showFolderConfig && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              The server is running on <span className="font-medium">{config.platform}</span> and reads the
              standard Cato log directories. There's nothing to configure here.
            </p>
          )}

          {!isLoading && showFolderConfig && (
            <>
              <div>
                <label
                  htmlFor="live-logs-root"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Root folder
                </label>
                <input
                  id="live-logs-root"
                  type="text"
                  value={root}
                  onChange={(e) => { setRoot(e.target.value); setSaved(false); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isSaving) handleSave(); }}
                  placeholder="C:\Users\you\ws"
                  spellCheck={false}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  The server appends{' '}
                  <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded font-mono">
                    {config?.subPath || 'endpoint\\endpoint\\sdp\\win\\Product\\Debug\\x64'}
                  </code>{' '}
                  and tails the most recently modified{' '}
                  <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded font-mono">cato_vpn_*.log</code>{' '}
                  inside it. Pasting the full folder works too.
                </p>
              </div>

              {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-sm text-red-700 dark:text-red-300 break-all">{error}</p>
                </div>
              )}

              {saved && (
                <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {serverDown
                      ? 'Saved. It will be applied when the server starts.'
                      : 'Saved. Live tabs now follow the new folder.'}
                  </p>
                </div>
              )}

              {serverDown && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                    Start the server with this folder (PowerShell):
                  </p>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg px-3 py-2.5">
                    <div className="font-mono text-xs text-green-400 break-all mb-2 select-all leading-relaxed">
                      {startCommand}
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => navigator.clipboard.writeText(startCommand)}
                        className="px-2.5 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors font-medium"
                      >
                        Copy command
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {config && (
                <dl className="rounded-md bg-gray-50 dark:bg-gray-900 p-3 space-y-2 text-xs">
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Watching</dt>
                    <dd className="font-mono text-gray-800 dark:text-gray-200 break-all">
                      {config.resolvedDir || '— not configured —'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Current file</dt>
                    <dd className="font-mono text-gray-800 dark:text-gray-200 break-all">
                      {config.currentFile || (config.dirExists ? 'no cato_vpn_*.log found' : '—')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Matching files</dt>
                    <dd className="font-mono text-gray-800 dark:text-gray-200">{config.matchCount}</dd>
                  </div>
                </dl>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            Close
          </button>
          {showFolderConfig && (
            <button
              onClick={handleSave}
              disabled={isSaving || !root.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed rounded-md transition-colors"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveLogsSettings;
