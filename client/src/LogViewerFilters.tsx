import ButtonBase from '@mui/material/ButtonBase';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import QueryField from './components/QueryField';
import ToolbarIcon from './components/ToolbarIcon';
import ViewerDialog from './components/ViewerDialog';
import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import type { LogFilters, LogId, StickyLog } from './domain/logRecord';
import {
  parsePresetFile,
  readFilterData,
  readStringHistory,
  type FilterPreset,
} from './domain/filterPresets';
import { errorName } from './domain/viewerTypes';
import { compileQuery } from './domain/logQuery';
import { memo, useState, useRef, useEffect } from 'react';
import { getLevelBackgroundColor } from './utils/logLevelColors';
import { readFileText } from './utils/readFileText';

// Extract tooltip text to avoid inline strings
const FILTER_TOOLTIP = `Advanced Filtering Guide:

• OR logic: Use '||': error || warning
• AND logic: Use '&&': bary && moshe
• Combine both: (bary && moshe) || david
• Grouping: Use parentheses to control precedence
• Exclude terms: Use '!' prefix: !heartbeat
• Exact phrases: Use quotes: "connection lost"
• Regex mode: Switch dropdown to 'Regex' for pattern matching: \\berror\\b || warn.*

• Filter by row numbers:
  #415 :: — from row 415 onwards
  #415 :: #600 — rows 415 to 600
  :: #600 — from start to row 600

• Filter by dates (supports multiple formats):
  #2025-07-04 :: — from July 4th, 2025 onwards
  #2025-07-04 14:19:44 :: — from specific time onwards
  #2025-07-04 13:28:20.540 :: — with milliseconds
  #2025-07-04 :: #2025-07-05 — date range
  :: #2025-07-05 14:30:00 — until specific time

• Filter by time gaps:
  #gap=5 — show only records with 5+ second gaps from previous record

• Combine filters:
  error || #2025-07-04 :: #2025-07-05 — errors between dates
  !debug || #100 :: #500 — exclude debug in rows 100-500
  #gap=3 || error — records with 3+ second gaps OR containing 'error'

• Works with log level and context line filters`;

interface Props {
  filters: LogFilters;
  onFiltersChange: (changes: Partial<LogFilters>) => void;
  moduleOptions?: string[];
  logsCount: number;
  filteredLogsCount: number;
  searchMatchCount: number;
  searchMatchPos: number;
  pivotGap: string | null;
  pivotLineNumber?: number;
  stickyLogs: StickyLog[];
  onRemoveStickyLog: (id: LogId) => void;
  onClearAllStickyLogs: () => void;
  onScrollToLog: (line: number, source?: string | null) => void;
  onUpdateStickyLogTitle: (id: LogId, title: string) => void;
  activeFileId?: string;
}

const LogViewerFilters = ({
  filters,
  onFiltersChange,
  moduleOptions = [],
  logsCount,
  filteredLogsCount,
  searchMatchCount,
  searchMatchPos,
  pivotGap,
  pivotLineNumber,
  stickyLogs,
  onRemoveStickyLog,
  onClearAllStickyLogs,
  onScrollToLog,
  onUpdateStickyLogTitle,
  activeFileId = 'default',
}: Props) => {
  const [levelMenuAnchor, setLevelMenuAnchor] = useState<HTMLElement | null>(null);
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const [editingStickyId, setEditingStickyId] = useState<LogId | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const [filterHistory, setFilterHistory] = useState<string[]>(() =>
    readStringHistory('logViewer_filterHistory'),
  );
  const [searchHistory, setSearchHistory] = useState<string[]>(() =>
    readStringHistory('logViewer_searchHistory'),
  );
  const { filterMode, searchMode, filterCaseSensitive, searchCaseSensitive } = filters;

  // === Saved filters ===
  const SAVED_FILTERS_KEY = 'logViewer_savedFilters';
  const [savedFilters, setSavedFilters] = useState<FilterPreset[]>(() => {
    try {
      return parsePresetFile({
        filters: JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) || '[]'),
      });
    } catch {
      return [];
    }
  });
  const [presetDialog, setPresetDialog] = useState<'save' | 'load' | null>(null);
  const [saveInputName, setSaveInputName] = useState('');
  const [presetNamesByFile, setPresetNamesByFile] = useState<Record<string, string | null>>({});
  const activeFilterName = presetNamesByFile[activeFileId] ?? null;
  const setActiveFilterName = (name: string | null) =>
    setPresetNamesByFile((previous) => ({ ...previous, [activeFileId]: name }));
  const [fileFilters, setFileFilters] = useState<FilterPreset[]>([]); // array of presets from the open .json file
  const saveInputRef = useRef<HTMLInputElement | null>(null);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const loadFileInputRef = useRef<HTMLInputElement | null>(null);

  const filterInputRef = useRef<HTMLInputElement | null>(null);

  // The model owns preferences; this view only persists them for the next visit.
  useEffect(() => {
    localStorage.setItem('logViewer_filterMode', filterMode);
    localStorage.setItem('logViewer_searchMode', searchMode);
    localStorage.setItem('logViewer_filterCaseSensitive', String(filterCaseSensitive));
    localStorage.setItem('logViewer_searchCaseSensitive', String(searchCaseSensitive));
  }, [filterMode, searchMode, filterCaseSensitive, searchCaseSensitive]);

  const rememberQuery = (field: 'searchText' | 'searchQuery') => {
    const phrases = filters[field]
      .split(/\|\||&&/)
      .map((phrase) => phrase.trim().replace(/^\(|\)$/g, ''))
      .filter(Boolean);
    const setHistory = field === 'searchText' ? setFilterHistory : setSearchHistory;
    setHistory((previous) => {
      let history = previous;
      for (const phrase of phrases) {
        history = [phrase, ...history.filter((item) => item !== phrase)].slice(0, 50);
      }
      return history;
    });
  };

  useEffect(() => {
    if (filterHistory.length)
      localStorage.setItem('logViewer_filterHistory', JSON.stringify(filterHistory));
    else localStorage.removeItem('logViewer_filterHistory');
  }, [filterHistory]);

  useEffect(() => {
    if (searchHistory.length)
      localStorage.setItem('logViewer_searchHistory', JSON.stringify(searchHistory));
    else localStorage.removeItem('logViewer_searchHistory');
  }, [searchHistory]);

  const addHistoryPhrase = (field: 'searchText' | 'searchQuery', phrase: string) => {
    const current = filters[field];
    onFiltersChange({ [field]: current ? `${current} || ${phrase}` : phrase });
  };

  // Handle Cmd+F to focus filter input
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+F (Mac)
      if (event.metaKey && event.key === 'f') {
        event.preventDefault();
        if (filterInputRef.current) {
          filterInputRef.current.focus();
          filterInputRef.current.select();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingStickyId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingStickyId]);

  // Handle double-click to start editing sticky title
  const handleStickyDoubleClick = (sticky: StickyLog) => {
    setEditingStickyId(sticky.id);
    setEditingTitle(sticky.title || `#${sticky.lineNumber}`);
  };

  // Save edited title
  const handleSaveStickyTitle = () => {
    if (editingStickyId !== null && onUpdateStickyLogTitle) {
      onUpdateStickyLogTitle(editingStickyId, editingTitle.trim() || `#${editingStickyId}`);
    }
    setEditingStickyId(null);
    setEditingTitle('');
  };

  // Cancel editing
  const handleCancelStickyEdit = () => {
    setEditingStickyId(null);
    setEditingTitle('');
  };

  // Handle key down in edit input
  const handleStickyEditKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveStickyTitle();
    } else if (e.key === 'Escape') {
      handleCancelStickyEdit();
    }
  };

  const handleLogLevelToggle = (level: string) => {
    const currentLevels = filters.logLevel;
    let newLevels;

    if (level === 'all') {
      // If 'all' is clicked, toggle between all levels and just 'all'
      newLevels = currentLevels.includes('all')
        ? ['error', 'warning', 'info', 'debug', 'verbose']
        : ['all'];
    } else {
      // Remove 'all' if it exists and we're selecting specific levels
      newLevels = currentLevels.filter((l) => l !== 'all');

      if (newLevels.includes(level)) {
        // Remove the level
        newLevels = newLevels.filter((l) => l !== level);
        // If no levels selected, default to 'all'
        if (newLevels.length === 0) {
          newLevels = ['all'];
        }
      } else {
        // Add the level
        newLevels.push(level);
      }
    }

    // Context lines pad the rows around level matches, so they only mean
    // something while a level filter is narrowing the view. Back on "All
    // Levels" nothing is filtered out — clear the count instead of leaving a
    // stale number sitting in the box. Covers both routes back to 'all':
    // clicking it directly, and deselecting the last specific level.
    onFiltersChange(
      newLevels.includes('all')
        ? { logLevel: newLevels, contextLines: 0 }
        : { logLevel: newLevels },
    );
  };

  // Get display text for selected levels
  const getSelectedLevelsText = () => {
    if (filters.logLevel.includes('all')) {
      return 'All Levels';
    }
    if (filters.logLevel.length === 1) {
      return filters.logLevel[0].charAt(0).toUpperCase() + filters.logLevel[0].slice(1);
    }
    if (filters.logLevel.length <= 2) {
      return filters.logLevel.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join(', ');
    }
    return `${filters.logLevel.length} levels selected`;
  };

  // === Saved filter helpers ===
  const persistSavedFilters = (list: FilterPreset[]) => {
    try {
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(list));
    } catch {
      /* Keep the in-memory preset if storage or a file is unavailable. */
    }
  };

  const getFilterSnapshot = () => ({
    searchText: filters.searchText || '',
    logLevel: filters.logLevel || ['all'],
    contextLines: filters.contextLines || 0,
    selectedModule: filters.selectedModule || 'all',
    filterMode,
    searchMode,
    filterCaseSensitive,
    searchCaseSensitive,
  });

  const saveFilterWithName = (name: string) => {
    const entry = {
      id: Date.now().toString(),
      name,
      timestamp: new Date().toISOString(),
      data: getFilterSnapshot(),
    };
    const updated = [entry, ...savedFilters.filter((f) => f.name !== name)];
    setSavedFilters(updated);
    persistSavedFilters(updated);
    setActiveFilterName(name);
  };

  const applyFilterData = (input: unknown, name: string, handle: FileSystemFileHandle | null) => {
    const filterData = readFilterData(input);
    onFiltersChange(filterData);
    fileHandleRef.current = handle;
    setActiveFilterName(name);
  };

  const buildFileJson = (filtersArray: FilterPreset[]) =>
    JSON.stringify({ version: 2, filters: filtersArray }, null, 2);

  const writeFiltersArray = async (handle: FileSystemFileHandle, filtersArray: FilterPreset[]) => {
    const writable = await handle.createWritable();
    await writable.write(buildFileJson(filtersArray));
    await writable.close();
  };

  const downloadFiltersArray = (filtersArray: FilterPreset[]) => {
    const blob = new Blob([buildFileJson(filtersArray)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'filters.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateFilePreset = (name: string): FilterPreset[] => {
    const existing = fileFilters.find((entry) => entry.name === name);
    const entry: FilterPreset = {
      id: existing?.id || Date.now().toString(),
      name,
      savedAt: new Date().toISOString(),
      data: getFilterSnapshot(),
    };
    const updated = existing
      ? fileFilters.map((preset) => (preset.name === name ? entry : preset))
      : [...fileFilters, entry];
    setFileFilters(updated);
    return updated;
  };

  const handleSave = async () => {
    if (!activeFilterName) return;
    const updated = updateFilePreset(activeFilterName);
    if (fileHandleRef.current) {
      try {
        await writeFiltersArray(fileHandleRef.current, updated);
        return;
      } catch {
        /* Keep the in-memory preset if storage or a file is unavailable. */
      }
    }
    saveFilterWithName(activeFilterName);
  };

  // Save As — always shows name dialog; adds entry to existing file (or creates new)
  const handleSaveAs = () => {
    setSaveInputName('');
    setPresetDialog('save');
  };

  const loadPresetFile = async (file: File, handle: FileSystemFileHandle | null) => {
    const name = (handle?.name ?? file.name).replace(/\.json$/i, '');
    const presets = parsePresetFile(JSON.parse(await readFileText(file)), name);
    fileHandleRef.current = handle;
    setFileFilters(presets);
    if (presets.length) applyFilterData(presets[0].data, presets[0].name, handle);
  };

  // Load — file picker; reads array from file
  const handleLoad = async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Filter JSON', accept: { 'application/json': ['.json'] } }],
        });
        await loadPresetFile(await handle.getFile(), handle);
      } catch (e) {
        if (errorName(e) !== 'AbortError') console.error(e);
      }
    } else {
      setPresetDialog('load');
    }
  };

  const handleLoadFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await loadPresetFile(file, null);
    } catch {
      /* Keep the in-memory preset if storage or a file is unavailable. */
    }
    e.target.value = '';
  };

  // Dialog OK — add new entry to array; write to open file or open save picker
  const handleSaveCurrentFilter = async () => {
    const name = saveInputName.trim();
    if (!name) return;
    const updated = updateFilePreset(name);
    setActiveFilterName(name);
    saveFilterWithName(name);
    if (fileHandleRef.current) {
      try {
        await writeFiltersArray(fileHandleRef.current, updated);
      } catch {
        downloadFiltersArray(updated);
      }
    } else if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'filters.json',
          types: [{ description: 'Filter JSON', accept: { 'application/json': ['.json'] } }],
        });
        await writeFiltersArray(handle, updated);
        fileHandleRef.current = handle;
      } catch (e) {
        if (errorName(e) !== 'AbortError') downloadFiltersArray(updated);
      }
    } else {
      downloadFiltersArray(updated);
    }
    setSaveInputName('');
    setPresetDialog(null);
  };

  const handleApplySavedFilter = (entry: FilterPreset) => {
    applyFilterData(entry.data, entry.name, null);
    setPresetDialog(null);
  };

  const handleDeleteSavedFilter = (id: string, e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const updated = savedFilters.filter((f) => f.id !== id);
    setSavedFilters(updated);
    persistSavedFilters(updated);
  };

  const formatSavedDate = (iso: string | undefined) => {
    if (!iso) return '';
    try {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const clearFilterValues = () => {
    onFiltersChange({
      searchText: '',
      searchQuery: '',
      logLevel: ['all'],
      selectedModule: 'all',
      contextLines: 0,
    });
    setActiveFilterName(null);
  };

  const renderPresetRow = () => (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <TextField
        select
        label="Preset"
        size="small"
        value={fileFilters.length ? activeFilterName || '' : ''}
        disabled={!fileFilters.length}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        sx={{ flex: 1, minWidth: 95, '& .MuiInputBase-input': { fontSize: 12, py: 1 } }}
        onChange={(event) => {
          if (!event.target.value) {
            clearFilterValues();
            return;
          }
          const preset = fileFilters.find((entry) => entry.name === event.target.value);
          if (preset) applyFilterData(preset.data, preset.name, fileHandleRef.current);
        }}
      >
        <option value="">{fileFilters.length ? 'None' : activeFilterName || 'Unsaved'}</option>
        {fileFilters.map((preset) => (
          <option key={preset.id} value={preset.name}>
            {preset.name}
          </option>
        ))}
      </TextField>
      <Tooltip
        describeChild
        title={
          activeFilterName
            ? `Update "${activeFilterName}" with the current filter settings. Log records are not saved.`
            : 'Update the selected preset with the current filter settings. Load or name a preset first.'
        }
      >
        <span>
          <Button
            variant="outlined"
            disabled={!(fileHandleRef.current || activeFilterName)}
            aria-label={activeFilterName ? `Save "${activeFilterName}"` : 'Save preset'}
            onClick={handleSave}
            sx={{ minWidth: 42, px: 0.75 }}
          >
            Save
          </Button>
        </span>
      </Tooltip>
      <Tooltip
        describeChild
        title="Save the current filter settings under a name. Add a preset to the open JSON file or create a new file. Log records are not saved."
      >
        <Button
          variant="outlined"
          onClick={handleSaveAs}
          aria-label={fileFilters.length ? 'Add to file…' : 'Save As…'}
          sx={{ minWidth: 54, px: 0.75 }}
        >
          Save as
        </Button>
      </Tooltip>
      <Tooltip
        describeChild
        title="Open a saved filter preset JSON file and apply its filter settings. Use the Preset dropdown to switch between presets."
      >
        <Button
          variant="outlined"
          onClick={handleLoad}
          aria-label="Load file"
          sx={{ minWidth: 42, px: 0.75 }}
        >
          Load
        </Button>
      </Tooltip>
      <Tooltip title="Clear filters">
        <IconButton
          size="small"
          aria-label="Clear filters"
          onClick={() => {
            clearFilterValues();
            fileHandleRef.current = null;
            setFileFilters([]);
          }}
        >
          <ToolbarIcon name="clear" />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  const renderExtraControls = () => (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Button
        variant="outlined"
        color="inherit"
        aria-label="Log levels"
        aria-haspopup="menu"
        aria-expanded={Boolean(levelMenuAnchor)}
        endIcon={<ToolbarIcon name="expand" />}
        onClick={(event) => setLevelMenuAnchor(event.currentTarget)}
        sx={{ flex: 1, whiteSpace: 'nowrap', height: 36, borderColor: 'divider', fontSize: 12 }}
      >
        {getSelectedLevelsText()}
      </Button>
      <TextField
        select
        label="Module"
        size="small"
        value={filters.selectedModule}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        onChange={(event) => onFiltersChange({ selectedModule: event.target.value })}
        sx={{ flex: 1, minWidth: 100, '& .MuiInputBase-input': { fontSize: 12, py: 1 } }}
      >
        <option value="all">All modules</option>
        {moduleOptions.map((module) => (
          <option key={module} value={module}>
            {module}
          </option>
        ))}
      </TextField>
      <TextField
        label="Context"
        type="number"
        size="small"
        value={filters.contextLines || 0}
        onChange={(event) => onFiltersChange({ contextLines: parseInt(event.target.value) || 0 })}
        slotProps={{ htmlInput: { min: 0, max: 50 }, inputLabel: { shrink: true } }}
        sx={{ width: 76, '& .MuiInputBase-input': { fontSize: 12, py: 1 } }}
      />
    </Stack>
  );

  const renderStats = () => (
    <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span>
        Showing {filteredLogsCount.toLocaleString()} of {logsCount.toLocaleString()} logs
        {filteredLogsCount !== logsCount && (
          <span className="ml-2 text-blue-600 dark:text-blue-400">
            ({((filteredLogsCount / logsCount) * 100).toFixed(1)}% visible)
          </span>
        )}
      </span>
      {filters.searchText &&
        (filters.searchText.includes('||') || filters.searchText.includes('&&')) && (
          <span className="text-gray-400 dark:text-gray-500 opacity-75">
            Filtering for:{' '}
            {
              filters.searchText
                .split('||')
                .flatMap((p) => {
                  let s = p.trim();
                  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1).trim();
                  return s.split('&&');
                })
                .map((t) => t.trim())
                .filter((t) => t && !t.startsWith('!')).length
            }{' '}
            terms
          </span>
        )}
      {/* Pivot Gap Display */}
      {pivotGap && (
        <span className="text-gray-400 dark:text-gray-500 opacity-75">
          Pivot Log Line: #{pivotLineNumber} - {pivotGap}
        </span>
      )}

      {stickyLogs.length > 0 && (
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75 }}
        >
          <Typography variant="caption" color="text.secondary">
            Sticky:
          </Typography>
          {stickyLogs
            .slice()
            .sort((a, b) =>
              a.timestamp && b.timestamp
                ? new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                : a.lineNumber - b.lineNumber,
            )
            .map((sticky) => (
              <Box
                key={sticky.id}
                className={getLevelBackgroundColor(sticky.level)}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  border: '1px solid',
                  borderRadius: 1,
                  px: 0.5,
                }}
              >
                {editingStickyId === sticky.id ? (
                  <TextField
                    inputRef={editInputRef}
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onBlur={handleSaveStickyTitle}
                    onKeyDown={handleStickyEditKeyDown}
                    slotProps={{ htmlInput: { 'aria-label': 'Sticky log title' } }}
                    sx={{ width: 120, '& input': { py: 0.5, px: 1, fontSize: 12 } }}
                  />
                ) : (
                  <ButtonBase
                    onClick={() => onScrollToLog(sticky.lineNumber, sticky.sourceFile)}
                    onDoubleClick={() => handleStickyDoubleClick(sticky)}
                    title={`${sticky.sourceFile ? `[${sticky.sourceFile}] ` : ''}Line ${sticky.lineNumber}${sticky.title ? ` - ${sticky.title}` : ''}\nDouble-click to edit title`}
                    sx={{
                      px: 0.75,
                      py: 0.5,
                      fontSize: 12,
                      borderRadius: 0.5,
                      '&.Mui-focusVisible': { outline: '2px solid currentColor' },
                    }}
                  >
                    {sticky.title || `#${sticky.lineNumber}`}
                  </ButtonBase>
                )}
                <IconButton
                  onClick={() => onRemoveStickyLog(sticky.id)}
                  aria-label={`Remove sticky log ${sticky.lineNumber}`}
                  title={`Remove sticky log${sticky.sourceFile ? ` from ${sticky.sourceFile}` : ''}`}
                  sx={{ color: 'inherit', p: 0.25, '& svg': { fontSize: 14 } }}
                >
                  <ToolbarIcon name="clear" />
                </IconButton>
              </Box>
            ))}
          <IconButton
            onClick={onClearAllStickyLogs}
            aria-label="Clear all sticky logs"
            title="Clear all sticky logs"
          >
            <ToolbarIcon name="clear" />
          </IconButton>
        </Stack>
      )}
    </div>
  );

  const isOverwrite = savedFilters.some((preset) => preset.name === saveInputName.trim());

  return (
    <Box
      component="section"
      aria-label="Log filters"
      sx={{
        px: 1.5,
        py: 1.25,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {[
        compileQuery(filters.searchText, filters.filterMode, filters.filterCaseSensitive).error,
        compileQuery(filters.searchQuery, filters.searchMode, filters.searchCaseSensitive).error,
      ]
        .filter(Boolean)
        .map((error, index) => (
          <Alert key={index} severity="error" sx={{ mb: 1, py: 0 }}>
            {error}
          </Alert>
        ))}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 350px' },
          gap: 1.25,
        }}
      >
        <Stack spacing={1} sx={{ minWidth: 0 }}>
          <QueryField
            label="Filter"
            value={filters.searchText}
            placeholder="Filter logs: error || warning, #gap=5, #row :: #date"
            inputRef={filterInputRef}
            mode={filterMode}
            caseSensitive={filterCaseSensitive}
            onChange={(searchText) => onFiltersChange({ searchText })}
            onModeChange={(mode) => onFiltersChange({ filterMode: mode })}
            onCaseChange={() => onFiltersChange({ filterCaseSensitive: !filterCaseSensitive })}
            onRemember={() => rememberQuery('searchText')}
            history={filterHistory}
            onHistorySelect={(phrase) => addHistoryPhrase('searchText', phrase)}
            onHistoryClear={() => setFilterHistory([])}
          />
          <QueryField
            label="Search"
            value={filters.searchQuery}
            placeholder="Search in record logs…"
            mode={searchMode}
            caseSensitive={searchCaseSensitive}
            onChange={(searchQuery) => onFiltersChange({ searchQuery })}
            onModeChange={(mode) => onFiltersChange({ searchMode: mode })}
            onCaseChange={() => onFiltersChange({ searchCaseSensitive: !searchCaseSensitive })}
            onRemember={() => rememberQuery('searchQuery')}
            history={searchHistory}
            onHistorySelect={(phrase) => addHistoryPhrase('searchQuery', phrase)}
            onHistoryClear={() => setSearchHistory([])}
            matchPosition={searchMatchPos}
            matchCount={searchMatchCount}
            onPreviousMatch={() => window.dispatchEvent(new Event('prevSearchMatch'))}
            onNextMatch={() => window.dispatchEvent(new Event('nextSearchMatch'))}
          />
        </Stack>
        <Stack spacing={1} sx={{ minWidth: 0 }}>
          {renderPresetRow()}
          {renderExtraControls()}
        </Stack>
      </Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 1, minHeight: 20, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box sx={{ minWidth: 0, '& > div': { flexWrap: 'wrap', rowGap: 0.5 } }}>
          {renderStats()}
        </Box>
        <Button
          size="small"
          onClick={(event) => setHelpAnchor(event.currentTarget)}
          startIcon={<ToolbarIcon name="help" />}
          sx={{ flexShrink: 0, fontSize: 11, py: 0, minWidth: 0 }}
        >
          Filter syntax
        </Button>
      </Stack>
      <Menu
        anchorEl={levelMenuAnchor}
        open={Boolean(levelMenuAnchor)}
        onClose={() => setLevelMenuAnchor(null)}
        slotProps={{ list: { 'aria-label': 'Log levels' } }}
      >
        {['all', 'error', 'warning', 'info', 'debug', 'verbose'].map((level) => (
          <MenuItem
            key={level}
            onClick={() => handleLogLevelToggle(level)}
            sx={{ fontSize: 13, pr: 3 }}
          >
            <Checkbox
              size="small"
              checked={filters.logLevel.includes(level)}
              tabIndex={-1}
              readOnly
            />
            {level === 'all' ? 'All Levels' : level[0].toUpperCase() + level.slice(1)}
          </MenuItem>
        ))}
      </Menu>
      <Popover
        open={Boolean(helpAnchor)}
        anchorEl={helpAnchor}
        onClose={() => setHelpAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Typography
          component="div"
          sx={{
            p: 2,
            whiteSpace: 'pre-line',
            fontSize: 12,
            width: 420,
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '65vh',
            overflow: 'auto',
          }}
        >
          {FILTER_TOOLTIP}
        </Typography>
      </Popover>
      {/* Hidden file input — fallback for browsers without File System Access API */}
      <input
        ref={loadFileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleLoadFileChange}
      />

      <ViewerDialog
        open={presetDialog === 'save'}
        onClose={() => setPresetDialog(null)}
        label="Save filter preset"
      >
        <DialogTitle>Add Filter to File</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {fileFilters.length
              ? 'Enter a name for this filter. It will be added to the open file.'
              : "Enter a name. You'll be asked where to save the file."}
          </Typography>
          <TextField
            inputRef={saveInputRef}
            autoFocus
            fullWidth
            label="Preset name"
            placeholder="Filter preset name…"
            value={saveInputName}
            onChange={(event) => setSaveInputName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSaveCurrentFilter();
            }}
          />
          {isOverwrite && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              This will overwrite the existing "{saveInputName.trim()}" preset.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setPresetDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!saveInputName.trim()}
            onClick={handleSaveCurrentFilter}
          >
            {isOverwrite ? 'Update' : 'Save'}
          </Button>
        </DialogActions>
      </ViewerDialog>
      <ViewerDialog
        open={presetDialog === 'load'}
        onClose={() => setPresetDialog(null)}
        label="Load filters"
      >
        <DialogTitle>Load Filters</DialogTitle>
        <DialogContent sx={{ px: 1 }}>
          {savedFilters.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              No saved filters yet
            </Typography>
          ) : (
            <List disablePadding>
              {savedFilters.map((entry) => (
                <ListItem
                  key={entry.id}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={`Delete ${entry.name}`}
                      title="Delete this saved filter"
                      onClick={(event) => handleDeleteSavedFilter(entry.id, event)}
                    >
                      <ToolbarIcon name="clear" />
                    </IconButton>
                  }
                >
                  <ListItemButton onClick={() => handleApplySavedFilter(entry)}>
                    <ListItemText
                      primary={entry.name}
                      secondary={[formatSavedDate(entry.timestamp), entry.data.searchText]
                        .filter(Boolean)
                        .join(' · ')}
                      slotProps={{ secondary: { noWrap: true } }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setPresetDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setPresetDialog(null);
              loadFileInputRef.current?.click();
            }}
          >
            Browse file…
          </Button>
        </DialogActions>
      </ViewerDialog>
    </Box>
  );
};

export default memo(LogViewerFilters);
