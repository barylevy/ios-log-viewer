import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import LinearProgress from '@mui/material/LinearProgress';
import type { LiveServerConfig } from '../domain/viewerTypes';
import ViewerDialog from './ViewerDialog';
import { useState, useEffect, useCallback } from 'react';
import {
  fetchLiveConfig,
  checkLiveHealth,
  saveLogDir,
  getSavedLogDir,
  setSavedLogDir,
  buildSetupCommand,
  isWindows,
  getPairingToken,
  setPairingToken,
} from '../utils/liveLogsServer';

/**
 * Live Logs Settings — lets the user point the local live-logs server at the
 * folder its build writes cato_vpn_*.log into.
 *
 * The full directory path is used exactly as entered — nothing is appended. The
 * saved folder is persisted server-side, so this dialog is normally used once
 * per machine.
 */
const LiveLogsSettings = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [config, setConfig] = useState<LiveServerConfig | null>(null);
  const [logDir, setLogDir] = useState('');
  const [pairingToken, setToken] = useState(getPairingToken);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // Starts true: the first render happens before the config fetch resolves.
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const [serverOutdated, setServerOutdated] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    setSaved(false);

    const [cfg, healthy] = await Promise.all([fetchLiveConfig(), checkLiveHealth()]);
    setConfig(cfg);
    setServerDown(!healthy);
    // Answers /health but not /config — an older build of the sidecar.
    setServerOutdated(healthy && !cfg);

    // Prefer what the server is actually using; otherwise fall back to whatever
    // was configured from this browser, so the folder can be set up-front.
    setLogDir(cfg?.logDir || getSavedLogDir());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const trimmed = logDir.trim();
    setError('');
    setSaved(false);

    // No server to ask (down, or too old to have /config): remember it locally.
    // It gets applied automatically once a server that needs configuring comes
    // up, and it's baked into the start command below.
    if (!config) {
      setSavedLogDir(trimmed);
      setSaved(true);
      return;
    }

    setIsSaving(true);
    const result = await saveLogDir(trimmed);
    if (result.ok) {
      setConfig(result.config);
      setLogDir(result.config.logDir || '');
      setSaved(true);
    } else {
      setError(result.error);
    }
    setIsSaving(false);
  };

  // The server is Windows-only. When it can't tell us (down, or too old for
  // /config), fall back to the platform this viewer is running on.
  const showFolderConfig = config ? !!config.configurable : isWindows();
  const startCommand = buildSetupCommand(window.location.origin, logDir.trim());

  return (
    <ViewerDialog open={true} onClose={onClose} label="Live log settings">
      <DialogTitle>Live Logs Settings</DialogTitle>
      <DialogContent dividers className="space-y-4">
        {isWindows() && (
          <div className="space-y-2">
            <TextField
              fullWidth
              id="pairing-token"
              label="Live server pairing token"
              type="password"
              autoComplete="off"
              value={pairingToken}
              onChange={(event) => setToken(event.target.value)}
              helperText="For a manually started server, paste the token printed in its terminal."
            />
            <Button
              type="button"
              onClick={() => {
                setPairingToken(pairingToken);
                load();
              }}
            >
              Pair and refresh
            </Button>
          </div>
        )}

        {isLoading && <LinearProgress aria-label="Loading live configuration" />}

        {!isLoading && serverDown && (
          <Alert severity="warning">
            {showFolderConfig
              ? "The live-logs server isn't running — you can still set the folder now. It's applied automatically once the server starts."
              : "The live-logs server isn't running. Click Live Logs in the header for the command to start it."}
          </Alert>
        )}

        {!isLoading && serverOutdated && (
          <Alert severity="warning">
            The live-logs server is running an older build that can't report its configuration.
            Restart it to pick up the current one.
          </Alert>
        )}

        {!isLoading && config && !showFolderConfig && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              The server is running on <span className="font-medium">{config.platform}</span> and
              reads the standard Cato log directories, which are fixed. There's nothing to configure
              here.
            </p>

            {config.antiTamper && (
              <dl className="rounded-md bg-gray-50 dark:bg-gray-900 p-3 space-y-2 text-xs">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">
                    AntiTamper folder{config.antiTamper.exists ? '' : ' — not found'}
                  </dt>
                  <dd className="font-mono text-gray-800 dark:text-gray-200 break-all">
                    {config.antiTamper.dir || '—'}
                  </dd>
                </div>
                {config.antiTamper.exists && (
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">
                      Files ({config.antiTamper.matchCount})
                    </dt>
                    <dd className="font-mono text-gray-800 dark:text-gray-200 break-all">
                      {config.antiTamper.currentFile || 'none'}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </>
        )}

        {!isLoading && showFolderConfig && (
          <>
            <div>
              <TextField
                fullWidth
                id="live-logs-dir"
                label="Log folder"
                value={logDir}
                onChange={(event) => {
                  setLogDir(event.target.value);
                  setSaved(false);
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !isSaving && logDir.trim()) handleSave();
                }}
                placeholder="C:\Program Files (x86)\Cato Networks\Cato Client"
                slotProps={{ htmlInput: { spellCheck: false } }}
              />
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                The full path to the directory holding the logs — used exactly as entered. The
                server tails the most recently modified{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded font-mono">
                  cato_vpn_*.log
                </code>{' '}
                inside it, plus the newest log in its{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded font-mono">
                  AntiTamper
                </code>{' '}
                subfolder.
              </p>
            </div>

            {error && <Alert severity="error">{error}</Alert>}

            {saved && (
              <Alert severity="success">
                {config
                  ? 'Saved. Live tabs now follow the new folder.'
                  : 'Saved. It will be applied when the server starts.'}
              </Alert>
            )}

            {!config && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  Start the server with this folder (PowerShell):
                </p>
                <div className="bg-gray-900 dark:bg-gray-950 rounded-lg px-3 py-2.5">
                  <div className="font-mono text-xs text-green-400 break-all mb-2 select-all leading-relaxed">
                    {startCommand}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => navigator.clipboard.writeText(startCommand)}
                      variant="outlined"
                    >
                      Copy command
                    </Button>
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
                  <dd className="font-mono text-gray-800 dark:text-gray-200">
                    {config.matchCount}
                  </dd>
                </div>
                {config.antiTamper && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">
                      AntiTamper ({config.antiTamper.matchCount} file
                      {config.antiTamper.matchCount === 1 ? '' : 's'})
                    </dt>
                    <dd className="font-mono text-gray-800 dark:text-gray-200 break-all">
                      {config.antiTamper.currentFile ||
                        'subfolder not found \u2014 tab will stay empty'}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} aria-label="Close dialog" color="inherit">
          Close
        </Button>
        {showFolderConfig && (
          <Button
            onClick={handleSave}
            disabled={isLoading || isSaving || !logDir.trim()}
            variant="contained"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        )}
      </DialogActions>
    </ViewerDialog>
  );
};
export default LiveLogsSettings;
