import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToolbarIcon from './components/ToolbarIcon';
import type { ChangeEvent } from 'react';
import type { LogHeaders } from './domain/logRecord';
import { errorMessage, type ViewerFile, type ColumnVisibility } from './domain/viewerTypes';
import Switch from '@mui/material/Switch';
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import AboutModal from './AboutModal';
import ColumnSettings from './ColumnSettings';
import SelectionFilesDialog from './SelectionFilesDialog';
import { DEFAULT_LOG_GROUP_PREFIXES } from './constants';
import {
  clearSession,
  isSessionPersistenceEnabled,
  setSessionPersistenceEnabled,
} from './utils/sessionStorage';
import {
  groupFilesByPrefix,
  groupFilesByDirectoryAndFormat,
  naturalSort,
} from './utils/fileGrouping';
import { isArchiveFile, expandArchivesInList } from './utils/archiveExtractor';

// localStorage key for persisting which group names the user selected last time
const FOLDER_SELECTION_KEY = 'logViewer_folderGroupNames';

interface Props {
  onFileLoad: (files: File | File[], clearFirst?: boolean, groupId?: string | null) => void;
  hasLogs: boolean;
  currentFileHeaders: LogHeaders | null;
  onClearTabs: () => void;
  visibleColumns: ColumnVisibility;
  onColumnsChange: (columns: ColumnVisibility) => void;
  onResetColumnDefaults: () => void;
  logDuration: string | null;
  folderName: string | null;
  onPrepareFilesStart: () => void;
  onPrepareFilesEnd: () => void;
  onDownloadMerged: () => void;
  isDownloadingMerged: boolean;
  onClearFilters: () => void;
  isLiveConnected?: boolean;
  isLiveChecking?: boolean;
  onLiveToggle: () => void;
  onOpenLiveSettings: () => void;
}

const LogViewerHeader = ({
  onFileLoad,
  hasLogs,
  currentFileHeaders,
  onClearTabs,
  visibleColumns,
  onColumnsChange,
  onResetColumnDefaults,
  logDuration,
  folderName,
  onPrepareFilesStart,
  onPrepareFilesEnd,
  onDownloadMerged,
  isDownloadingMerged,
  onClearFilters,
  isLiveConnected = false,
  isLiveChecking = false,
  onLiveToggle,
  onOpenLiveSettings,
}: Props) => {
  const [rememberSessions, setRememberSessions] = useState(isSessionPersistenceEnabled);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const [fileMenuAnchor, setFileMenuAnchor] = useState<HTMLElement | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [pendingFolderItems, setPendingFolderItems] = useState<ViewerFile[] | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(
    () =>
      localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches),
  );

  // Apply theme on mount and when theme changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleChooseFiles = () => {
    fileInputRef.current?.click();
    setFileMenuAnchor(null);
  };

  const handleChooseDirectory = () => {
    directoryInputRef.current?.click();
    setFileMenuAnchor(null);
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = '';
    if (!picked.length) return;

    onPrepareFilesStart();
    try {
      const hasArchive = picked.some(isArchiveFile);

      let files;
      try {
        files = hasArchive ? await expandArchivesInList(picked) : picked;
      } catch (err) {
        alert(`Failed to extract archive: ${errorMessage(err)}`);
        return;
      }

      // Archives replace the open folder; individual files are grouped by prefix.
      if (hasArchive) onClearTabs();
      const groups = hasArchive
        ? await groupFilesByDirectoryAndFormat(files)
        : groupFilesByPrefix(files.sort((left, right) => naturalSort(left.name, right.name)));
      for (const [key, group] of groups) onFileLoad(group, false, key);
    } finally {
      onPrepareFilesEnd();
    }
  };

  const handleDirectorySelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const allFiles = Array.from(event.target.files || []);
    event.target.value = '';

    // Filter out files that should not be loaded
    const EXCLUDED_FILES = [
      'systemextensionsctl_list.txt',
      'sudo_launchctl_list.txt',
      'digResults.txt',
      'networkServiceOrder.txt',
      'scutilDNS.txt',
      'scutilProxy.txt',
      'ifconfig.txt',
      'launchctl_list.txt',
    ];

    const files = allFiles.filter((file) => !EXCLUDED_FILES.includes(file.name));
    if (!files.length) return;

    // Group files first, then show the selection dialog instead of loading everything
    onPrepareFilesStart();
    let fileGroups;
    try {
      fileGroups = await groupFilesByDirectoryAndFormat(files);
    } finally {
      onPrepareFilesEnd();
    }

    if (!fileGroups.size) return;

    // Build dialog items from the grouped map
    const items = Array.from(fileGroups.entries()).map(([groupKey, groupFiles]) => ({
      id: groupKey,
      name:
        (groupKey.split('/').pop() || groupKey).replace(/\s*\[.*?\]\s*$/, '').trim() || groupKey,
      fileObj: groupFiles,
    }));

    setPendingFolderItems(items);
  };

  // Capture defaults once for each folder selection; parent renders must not reset checkboxes.
  const getFolderDefaultChecked = useMemo(() => {
    let savedNames: Set<string> | null = null;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(FOLDER_SELECTION_KEY) || 'null');
      if (Array.isArray(saved)) {
        savedNames = new Set(saved.filter((name): name is string => typeof name === 'string'));
      }
    } catch {
      // Use the standard groups if the saved preference is unreadable.
    }
    return (file: ViewerFile): boolean => {
      const name = file.name.toLowerCase();
      return savedNames
        ? savedNames.has(name)
        : DEFAULT_LOG_GROUP_PREFIXES.some((prefix) => name.startsWith(prefix));
    };
  }, [pendingFolderItems]);

  // Called when user confirms the folder-file-selection dialog
  const handleFolderSelectionConfirm = useCallback(
    (selectedIds: string[]) => {
      if (!pendingFolderItems) return;
      const itemsById = new Map(pendingFolderItems.map((file) => [file.id, file]));

      const chosenNames = selectedIds.map((id) => itemsById.get(id)?.name.toLowerCase() || '');
      try {
        localStorage.setItem(FOLDER_SELECTION_KEY, JSON.stringify(chosenNames));
      } catch {
        /* ignore */
      }

      // Clear previous tabs, then load only selected groups
      if (onClearTabs) onClearTabs();
      onPrepareFilesStart();
      try {
        selectedIds.forEach((id) => {
          const group = itemsById.get(id);
          if (group?.fileObj) onFileLoad(group.fileObj, false, id);
        });
      } finally {
        onPrepareFilesEnd();
      }

      setPendingFolderItems(null);
    },
    [pendingFolderItems, onFileLoad, onClearTabs, onPrepareFilesStart, onPrepareFilesEnd],
  );

  const handleFolderSelectionClose = () => {
    setPendingFolderItems(null);
  };

  const handleAboutClick = () => {
    setShowAbout(true);
    setSettingsAnchor(null);
  };

  const handleColumnSettingsClick = () => {
    setShowColumnSettings(true);
    setSettingsAnchor(null);
  };

  const handleThemeToggle = () => {
    setIsDarkMode(!isDarkMode);
    setSettingsAnchor(null);
  };

  const handleClearCache = () => {
    // Clear all localStorage
    localStorage.clear();

    // Clear session storage (IndexedDB)
    clearSession(true);

    // Restore theme preference
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');

    setSettingsAnchor(null);

    // Show confirmation
    alert('Cache cleared successfully! The page will reload.');

    // Reload the page to reset all state
    window.location.reload();
  };

  return (
    <Box
      component="header"
      sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', px: 2, py: 1.5 }}
    >
      {/* Folder-file selection dialog — shown after the user picks a directory */}
      {pendingFolderItems && (
        <SelectionFilesDialog
          isOpen={true}
          onClose={handleFolderSelectionClose}
          files={pendingFolderItems}
          onConfirm={handleFolderSelectionConfirm}
          title="Select Files to Load"
          description="Choose which log groups from this folder to open:"
          confirmLabel="Open"
          getDefaultChecked={getFolderDefaultChecked}
        />
      )}
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          rowGap: 1.5,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box component="img" src="/cato-logo.svg" alt="Cato Networks" sx={{ height: 30 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" variant="h6" sx={{ fontSize: 18, fontWeight: 650 }}>
              Cato Client Log Viewer
            </Typography>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ flexWrap: 'wrap', color: 'text.secondary', fontSize: 12 }}
            >
              {currentFileHeaders &&
                [
                  ['User', currentFileHeaders.user],
                  ['Account', currentFileHeaders.account],
                  ['Client', currentFileHeaders.clientVersion],
                  ['OS', currentFileHeaders.osVersion],
                ].map(
                  ([label, value]) =>
                    value && (
                      <Box key={label} sx={{ overflowWrap: 'anywhere' }}>
                        {label}: <span>{value}</span>
                      </Box>
                    ),
                )}
              {logDuration && <span>{logDuration}</span>}
              {folderName && <Box sx={{ overflowWrap: 'anywhere' }}>Folder: {folderName}</Box>}
            </Stack>
          </Box>
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
        >
          <Button
            variant={isLiveConnected ? 'contained' : 'outlined'}
            color="primary"
            onClick={onLiveToggle}
            disabled={isLiveChecking}
            title={isLiveConnected ? 'Disconnect live logs' : 'Connect to live logs'}
            startIcon={
              isLiveChecking ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <Box
                  component="span"
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: isLiveConnected ? 'currentColor' : 'text.disabled',
                  }}
                />
              )
            }
          >
            {isLiveChecking ? 'Connecting…' : isLiveConnected ? 'Stop Live' : 'Live Logs'}
          </Button>
          <Button
            variant="outlined"
            onClick={onDownloadMerged}
            disabled={!hasLogs || isDownloadingMerged}
            startIcon={
              isDownloadingMerged ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <ToolbarIcon name="download" />
              )
            }
          >
            {isDownloadingMerged ? 'Merging…' : 'Download Merged'}
          </Button>
          <ButtonGroup variant="contained" disableElevation>
            <Button onClick={handleChooseFiles}>Open Files</Button>
            <Button
              aria-label="Open options"
              aria-haspopup="menu"
              aria-expanded={!!fileMenuAnchor}
              onClick={(event) => setFileMenuAnchor(event.currentTarget)}
              sx={{ minWidth: '32px !important', px: 0.5 }}
            >
              <ToolbarIcon name="expand" />
            </Button>
          </ButtonGroup>
          <Menu
            anchorEl={fileMenuAnchor}
            open={!!fileMenuAnchor}
            onClose={() => setFileMenuAnchor(null)}
          >
            <MenuItem onClick={handleChooseFiles}>Choose Files</MenuItem>
            <MenuItem onClick={handleChooseDirectory}>Choose Folder</MenuItem>
          </Menu>
          <IconButton
            aria-label="Settings menu"
            title="Settings"
            aria-haspopup="menu"
            aria-expanded={!!settingsAnchor}
            onClick={(event) => setSettingsAnchor(event.currentTarget)}
          >
            <ToolbarIcon name="settings" />
          </IconButton>
          <Menu
            anchorEl={settingsAnchor}
            open={!!settingsAnchor}
            onClose={() => setSettingsAnchor(null)}
          >
            <MenuItem onClick={handleThemeToggle}>
              {isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </MenuItem>
            <MenuItem onClick={handleColumnSettingsClick}>Column Settings</MenuItem>
            <MenuItem
              onClick={() => {
                onOpenLiveSettings();
                setSettingsAnchor(null);
              }}
            >
              Live Logs Settings
            </MenuItem>
            <Divider />
            <Box sx={{ px: 2 }}>
              <FormControlLabel
                label="Remember logs for 24 hours"
                labelPlacement="start"
                sx={{ ml: 0, gap: 1 }}
                control={
                  <Switch
                    size="small"
                    checked={rememberSessions}
                    onChange={async (_, enabled) => {
                      await setSessionPersistenceEnabled(enabled);
                      setRememberSessions(enabled);
                    }}
                    slotProps={{ input: { 'aria-label': 'Remember logs for 24 hours' } }}
                  />
                }
              />
            </Box>
            <MenuItem
              onClick={() => {
                onClearFilters();
                setSettingsAnchor(null);
              }}
            >
              Clear Filters
            </MenuItem>
            <MenuItem onClick={handleClearCache} sx={{ color: 'error.main' }}>
              Clear Cache
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleAboutClick}>About</MenuItem>
          </Menu>
        </Stack>
      </Stack>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.log,.ips,.zip,.xz,.txz"
        onChange={handleFilesSelected}
        style={{ display: 'none' }}
      />
      <input
        ref={directoryInputRef}
        type="file"
        {...{ webkitdirectory: '' }}
        onChange={handleDirectorySelected}
        style={{ display: 'none' }}
      />

      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />

      {/* Column Settings Modal */}
      <ColumnSettings
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        visibleColumns={visibleColumns}
        onColumnsChange={onColumnsChange}
        onResetDefaults={onResetColumnDefaults}
      />
    </Box>
  );
};

export default LogViewerHeader;
