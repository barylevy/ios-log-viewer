import Button from '@mui/material/Button';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import ViewerDialog from './components/ViewerDialog';
import { AVAILABLE_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from './constants';
import { useState, useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  visibleColumns: Record<string, boolean>;
  onColumnsChange: (columns: Record<string, boolean>) => void;
  onResetDefaults?: () => void;
}

export default function ColumnSettings({
  isOpen,
  onClose,
  visibleColumns,
  onColumnsChange,
  onResetDefaults,
}: Props) {
  const [tempColumns, setTempColumns] = useState(visibleColumns);
  useEffect(() => {
    if (isOpen) setTempColumns(visibleColumns);
  }, [isOpen, visibleColumns]);
  if (!isOpen) return null;
  const handleSave = () => {
    onColumnsChange(tempColumns);
    localStorage.setItem('logViewerColumns', JSON.stringify(tempColumns));
    onClose();
  };
  return (
    <ViewerDialog open onClose={onClose} label="Column settings">
      <DialogTitle>Column Settings</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Toggle column visibility. To reorder or resize columns, drag the column headers in the log
          view.
        </Typography>
        <Stack>
          {AVAILABLE_COLUMNS.map((column) => (
            <FormControlLabel
              key={column.id}
              disabled={column.disabled}
              label={`${column.label}${column.disabled ? ' (Required)' : ''}`}
              control={
                <Checkbox
                  checked={!!tempColumns[column.id]}
                  onChange={(_, checked) =>
                    setTempColumns((previous) => ({ ...previous, [column.id]: checked }))
                  }
                />
              }
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button
          onClick={() => {
            setTempColumns({ ...DEFAULT_VISIBLE_COLUMNS });
            onResetDefaults?.();
          }}
          sx={{ mr: 'auto' }}
        >
          Reset to Default
        </Button>
        <Button onClick={onClose} aria-label="Close dialog" color="inherit">
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained">
          Apply
        </Button>
      </DialogActions>
    </ViewerDialog>
  );
}
