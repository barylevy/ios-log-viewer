import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ToolbarIcon from './components/ToolbarIcon';
import type { LogRecord } from './domain/logRecord';
import ViewerDialog from './components/ViewerDialog';
import { useEffect, useState } from 'react';
import { getLevelTextColor, cleanMessage } from './utils/logLevelColors';
import JsonTreeViewer from './components/JsonTreeViewer';

interface Props {
  log: LogRecord | null;
  onClose: () => void;
  onAddStickyLog?: (log: LogRecord & { cleanedMessage: string }) => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

const LogModal = ({ log, onClose, onAddStickyLog, onNext, onPrev, hasNext, hasPrev }: Props) => {
  const [viewMode, setViewMode] = useState<'text' | 'json'>('json'); // 'text' or 'json' - default to json

  // Close modal when Escape key is pressed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      }
      if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev, hasNext, hasPrev]);

  if (!log) return null;

  const handleAddStickyLog = () => {
    if (onAddStickyLog) {
      // Create sticky log object with cleaned message for tooltip
      const stickyLogData = {
        ...log,
        cleanedMessage: cleanMessage(log.message || log.raw),
      };

      onAddStickyLog(stickyLogData);
    }
    onClose();
  };

  const handleCopy = () => {
    // Copy JSON data if in JSON view mode, otherwise copy full raw content
    const contentToCopy = viewMode === 'json' && hasJsonContent && jsonData ? jsonData : log.raw;
    navigator.clipboard.writeText(contentToCopy);
  };

  // Check if log content contains JSON and extract it
  const getJsonData = () => {
    if (!log.raw) return null;

    let jsonStartIndex = -1;
    let jsonEndIndex = -1;
    let extractedJson: string | null = null;

    // Enhanced JSON detection: Try to extract JSON by finding braces/brackets
    // Strategy: Look for JSON patterns that start with [ or { followed by typical JSON content

    // Try to find array: Look for [{ or [whitespace{ pattern (array of objects)
    const arrayOfObjectsMatch = log.raw.match(/\[\s*\{/);
    if (arrayOfObjectsMatch && arrayOfObjectsMatch.index !== undefined) {
      const startIdx = arrayOfObjectsMatch.index;
      const lastBracket = log.raw.lastIndexOf(']');

      if (lastBracket > startIdx) {
        const potentialJson = log.raw.substring(startIdx, lastBracket + 1);
        try {
          JSON.parse(potentialJson);
          return {
            json: potentialJson,
            startIndex: startIdx,
            endIndex: lastBracket + 1,
            prefix: log.raw.substring(0, startIdx),
            suffix: log.raw.substring(lastBracket + 1),
          };
        } catch {
          // Not valid JSON
        }
      }
    }

    // Try to find object: first '{' to last '}'
    const firstBrace = log.raw.indexOf('{');
    const lastBrace = log.raw.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const potentialJson = log.raw.substring(firstBrace, lastBrace + 1);
      try {
        // Try to parse it to verify it's valid JSON
        JSON.parse(potentialJson);
        jsonStartIndex = firstBrace;
        jsonEndIndex = lastBrace + 1;
        extractedJson = potentialJson;
      } catch {
        // Not valid JSON, continue to next method
      }
    }

    if (extractedJson) {
      return {
        json: extractedJson,
        startIndex: jsonStartIndex,
        endIndex: jsonEndIndex,
        prefix: log.raw.substring(0, jsonStartIndex),
        suffix: log.raw.substring(jsonEndIndex),
      };
    }

    return null;
  };

  const jsonDataResult = getJsonData();
  const hasJsonContent = jsonDataResult !== null;
  const jsonData = jsonDataResult?.json;

  const metadata = [
    [
      'Timestamp',
      log.displayDate && log.displayTime ? `${log.displayDate} ${log.displayTime}` : log.timestamp,
    ],
    [
      log.processName && log.processName !== log.process ? 'Process' : 'ProcessId',
      log.processName || log.process,
    ],
    ['Log Line', log.lineNumber],
    ['Module', log.module],
    ['ThreadId', log.thread],
    ['Source', log.sourceFile],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');
  return (
    <ViewerDialog open onClose={onClose} label="Log details" wide>
      <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography component="h2" sx={{ fontWeight: 600, fontSize: 18, flex: 1 }}>
          Log Details
        </Typography>
        {log.level && (
          <span className={`px-2 py-1 rounded text-xs font-medium ${getLevelTextColor(log.level)}`}>
            {log.level.toUpperCase()}
          </span>
        )}
        <IconButton
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Previous log (←)"
          title="Previous log (←)"
        >
          <ToolbarIcon name="previous" />
        </IconButton>
        <IconButton
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next log (→)"
          title="Next log (→)"
        >
          <ToolbarIcon name="next" />
        </IconButton>
        <IconButton onClick={onClose} aria-label="Close dialog">
          <ToolbarIcon name="clear" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box
          component="dl"
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 1.5,
            mb: 2,
          }}
        >
          {metadata.map(([label, value]) => (
            <Box key={label} sx={{ minWidth: 0 }}>
              <Typography component="dt" variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography
                component="dd"
                variant="body2"
                sx={{ m: 0, fontFamily: 'monospace', overflowWrap: 'anywhere' }}
              >
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
        {hasJsonContent && (
          <ToggleButtonGroup
            exclusive
            value={viewMode}
            onChange={(_, mode: 'text' | 'json' | null) => {
              if (mode) setViewMode(mode);
            }}
            size="small"
            aria-label="Log detail format"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="text">Text</ToggleButton>
            <ToggleButton value="json">JSON</ToggleButton>
          </ToggleButtonGroup>
        )}
        {viewMode === 'json' && hasJsonContent ? (
          <Stack spacing={2}>
            {jsonDataResult?.prefix && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Message prefix:
                </Typography>
                <pre className="log-detail-text">{jsonDataResult.prefix}</pre>
              </Box>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary">
                JSON content:
              </Typography>
              <JsonTreeViewer data={jsonData} />
            </Box>
            {jsonDataResult?.suffix?.trim() && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Message suffix:
                </Typography>
                <pre className="log-detail-text">{jsonDataResult.suffix}</pre>
              </Box>
            )}
          </Stack>
        ) : (
          <pre className="log-detail-text">{log.raw}</pre>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button
          onClick={handleCopy}
          variant="outlined"
          title={
            viewMode === 'json' && hasJsonContent ? 'Copy JSON data only' : 'Copy full log content'
          }
        >
          {viewMode === 'json' && hasJsonContent ? 'Copy JSON' : 'Copy'}
        </Button>
        <Button onClick={handleAddStickyLog} variant="contained">
          Sticky Log Line
        </Button>
        <Button
          onClick={onClose}
          aria-label="Close dialog"
          color="inherit"
          sx={{ ml: 'auto !important' }}
        >
          Close
        </Button>
      </DialogActions>
    </ViewerDialog>
  );
};

export default LogModal;
