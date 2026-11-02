import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import type { KeyboardEvent } from 'react';
import type { ViewerFile } from './domain/viewerTypes';
import { useMemo } from 'react';
import { getFileDisplayName, getFileFullName } from './utils/fileLoader';
import ToolbarIcon from './components/ToolbarIcon';

interface Props {
  files: ViewerFile[];
  activeFileIndex: number;
  onFileSelect: (index: number) => void;
  onFileClose: (index: number) => void;
  showingCombinedView: boolean;
  onCombinedViewSelect: () => void;
  isFileLoading?: (id: string) => boolean;
  onCloseAll: () => void;
  onExportActive?: () => void;
  onExportFile?: (id: string, label: string) => void;
  isLiveMode?: boolean;
  onFromNow?: () => void;
}

export default function LogTabs({
  files,
  activeFileIndex,
  onFileSelect,
  onFileClose,
  showingCombinedView,
  onCombinedViewSelect,
  isFileLoading,
  onCloseAll,
  onExportActive,
  onExportFile,
  isLiveMode = false,
  onFromNow,
}: Props) {
  const sortedTabs = useMemo(
    () =>
      files
        .map((file, index) => ({
          file,
          index,
          label: file.isLive && file.name ? file.name : getFileDisplayName(file.id),
        }))
        .sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }),
        ),
    [files],
  );
  const navigateTabs = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'tab')
      return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (index + tabs.length - 1) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  };
  const tabStyle = (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    borderBottom: 2,
    borderColor: active ? 'primary.main' : 'transparent',
    bgcolor: active ? 'action.selected' : 'transparent',
    borderRadius: '6px 6px 0 0',
    '&:hover': { bgcolor: 'action.hover' },
  });
  return (
    <Stack
      direction="row"
      sx={{
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        alignItems: 'center',
        px: 1,
        gap: 1,
      }}
    >
      <Box
        role="tablist"
        aria-label="Log files"
        onKeyDown={navigateTabs}
        sx={{ display: 'flex', overflowX: 'auto', flex: 1, minWidth: 0, gap: 0.5, pt: 0.5 }}
      >
        {sortedTabs.map(({ file, index, label }) => {
          const active = activeFileIndex === index && !showingCombinedView;
          const loading = isFileLoading?.(file.id) ?? false;
          const canExport = !loading && (file.isLive ? !!onExportFile : active && !!onExportActive);
          return (
            <Box
              key={file.id}
              title={getFileFullName(file.id)}
              role="presentation"
              sx={tabStyle(active)}
            >
              <ButtonBase
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onFileSelect(index)}
                sx={{
                  py: 1.25,
                  px: 1.5,
                  gap: 1,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  color: active || file.isLive ? 'primary.main' : 'text.secondary',
                  fontWeight: active ? 600 : 400,
                  '&.Mui-focusVisible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: -2,
                  },
                }}
              >
                {file.isLive && (
                  <Box
                    component="span"
                    aria-label="Live"
                    sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main' }}
                  />
                )}
                {label}
                {loading && <CircularProgress size={12} />}
              </ButtonBase>
              {canExport && (
                <IconButton
                  aria-label={
                    file.isLive
                      ? `Download "${label}" logs`
                      : `Export visible records of "${label}" to file`
                  }
                  title={
                    file.isLive
                      ? `Download "${label}" logs`
                      : `Export visible records of "${label}" to file`
                  }
                  onClick={() =>
                    file.isLive ? onExportFile?.(file.id, label) : onExportActive?.()
                  }
                >
                  <ToolbarIcon name="download" />
                </IconButton>
              )}
              <IconButton
                title="Close file"
                aria-label={`Close ${label}`}
                onClick={() => onFileClose(index)}
                sx={{ mr: 0.5 }}
              >
                <ToolbarIcon name="clear" />
              </IconButton>
            </Box>
          );
        })}
        {files.length > 1 && (
          <Box role="presentation" sx={tabStyle(showingCombinedView)}>
            <ButtonBase
              role="tab"
              aria-selected={showingCombinedView}
              tabIndex={showingCombinedView ? 0 : -1}
              onClick={onCombinedViewSelect}
              sx={{
                py: 1.25,
                px: 1.5,
                fontSize: 12,
                whiteSpace: 'nowrap',
                fontWeight: 600,
                color: showingCombinedView ? 'primary.main' : 'text.secondary',
                '&.Mui-focusVisible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: -2,
                },
              }}
            >
              All Files
            </ButtonBase>
            {showingCombinedView && onExportActive && (
              <IconButton
                title='Export visible records of "All Files" to file'
                aria-label="Export all files"
                onClick={onExportActive}
              >
                <ToolbarIcon name="download" />
              </IconButton>
            )}
          </Box>
        )}
      </Box>
      {isLiveMode && onFromNow && (
        <Button
          onClick={onFromNow}
          title="Filter all tabs to show only log records from now onwards"
          sx={{ whiteSpace: 'nowrap' }}
        >
          From Now
        </Button>
      )}
      {files.length > 0 && (
        <IconButton onClick={onCloseAll} title="Close all files" aria-label="Close all files">
          <ToolbarIcon name="clear" />
        </IconButton>
      )}
    </Stack>
  );
}
