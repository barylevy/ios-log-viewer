import { useState, type RefObject } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import NativeSelect from '@mui/material/NativeSelect';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { MatchMode } from '../domain/logRecord';
import ToolbarIcon from './ToolbarIcon';

interface Props {
  label: 'Filter' | 'Search';
  value: string;
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  mode: MatchMode;
  caseSensitive: boolean;
  onChange: (value: string) => void;
  onModeChange: (mode: MatchMode) => void;
  onCaseChange: () => void;
  onRemember: () => void;
  history: string[];
  onHistorySelect: (phrase: string) => void;
  onHistoryClear: () => void;
  matchPosition?: number;
  matchCount?: number;
  onPreviousMatch?: () => void;
  onNextMatch?: () => void;
}

export default function QueryField({
  label,
  value,
  placeholder,
  inputRef,
  mode,
  caseSensitive,
  onChange,
  onModeChange,
  onCaseChange,
  onRemember,
  history,
  onHistorySelect,
  onHistoryClear,
  matchPosition = 0,
  matchCount = 0,
  onPreviousMatch,
  onNextMatch,
}: Props) {
  const [historyAnchor, setHistoryAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <TextField
        label={label}
        value={value}
        placeholder={placeholder}
        inputRef={inputRef}
        size="small"
        fullWidth
        onChange={(event) => onChange(event.target.value)}
        onBlur={onRemember}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onRemember();
        }}
        sx={{
          '& .MuiInputBase-root': { pr: 0.5 },
          '& .MuiInputBase-input': { fontSize: 12.5, py: 1 },
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 1 }}>
                <NativeSelect
                  value={mode}
                  disableUnderline
                  inputProps={{ 'aria-label': `${label} matching mode` }}
                  onChange={(event) => onModeChange(event.target.value as MatchMode)}
                  sx={{
                    fontSize: 11,
                    color: 'text.secondary',
                    '& select': { pr: '22px !important' },
                  }}
                >
                  <option value="text">Text</option>
                  <option value="regex">Regex</option>
                </NativeSelect>
                <Divider orientation="vertical" flexItem sx={{ ml: 0.75 }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end" sx={{ ml: 0.5 }}>
                <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
                  {onPreviousMatch && onNextMatch && (
                    <>
                      <IconButton
                        size="small"
                        aria-label="Previous match"
                        disabled={!value || matchPosition <= 1}
                        onClick={onPreviousMatch}
                      >
                        <ToolbarIcon name="previous" />
                      </IconButton>
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{
                          minWidth: 28,
                          textAlign: 'center',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {matchPosition}/{matchCount}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="Next match"
                        disabled={!value || matchPosition >= matchCount}
                        onClick={onNextMatch}
                      >
                        <ToolbarIcon name="next" />
                      </IconButton>
                      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                    </>
                  )}
                  <Tooltip title={caseSensitive ? 'Case sensitive' : 'Case insensitive'}>
                    <IconButton
                      size="small"
                      aria-label={`${label} case sensitive`}
                      aria-pressed={caseSensitive}
                      color={caseSensitive ? 'primary' : 'default'}
                      onClick={onCaseChange}
                      sx={{
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: 1,
                        bgcolor: caseSensitive ? 'action.selected' : undefined,
                      }}
                    >
                      Aa
                    </IconButton>
                  </Tooltip>
                  {value && (
                    <IconButton
                      size="small"
                      aria-label={`Clear ${label.toLowerCase()}`}
                      onClick={() => onChange('')}
                    >
                      <ToolbarIcon name="clear" />
                    </IconButton>
                  )}
                  <IconButton
                    size="small"
                    aria-label={`${label} history`}
                    title={`${label} history`}
                    onClick={(event) => setHistoryAnchor(event.currentTarget)}
                  >
                    <ToolbarIcon name="history" />
                  </IconButton>
                </Stack>
              </InputAdornment>
            ),
          },
        }}
      />
      <Menu
        anchorEl={historyAnchor}
        open={Boolean(historyAnchor)}
        onClose={() => setHistoryAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { sx: { width: 300, maxWidth: 'calc(100vw - 32px)' } },
          list: { 'aria-label': `${label} history` },
        }}
      >
        {history.length === 0 && <MenuItem disabled>No history yet</MenuItem>}
        {history.slice(0, 10).map((phrase) => (
          <MenuItem
            key={phrase}
            onClick={() => {
              onHistorySelect(phrase);
              setHistoryAnchor(null);
            }}
            sx={{ fontSize: 12 }}
          >
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {phrase}
            </Box>
          </MenuItem>
        ))}
        {history.length > 0 && <Divider />}
        {history.length > 0 && (
          <MenuItem
            onClick={() => {
              onHistoryClear();
              setHistoryAnchor(null);
            }}
            sx={{ color: 'error.main', fontSize: 12 }}
          >
            Clear History
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
