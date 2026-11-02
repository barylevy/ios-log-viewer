import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListSubheader from '@mui/material/ListSubheader';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import type { ViewerFile } from './domain/viewerTypes';
import { DEFAULT_LOG_GROUP_PREFIXES } from './constants';
interface Props {
  isOpen: boolean;
  onClose: () => void;
  files: ViewerFile[];
  onConfirm: (ids: string[]) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  getDefaultChecked?: ((file: ViewerFile) => boolean) | null;
}

import ViewerDialog from './components/ViewerDialog';
import React, { useEffect, useState } from 'react';

const hasFileObj = (f: ViewerFile) => {
  const obj = Array.isArray(f.fileObj) ? f.fileObj[0] : f.fileObj;
  return !!obj;
};

const getRootFolder = (f: ViewerFile) => {
  const obj = f.fileObj;
  const first = Array.isArray(obj) ? obj[0] : obj;
  if (!first) return null;
  const relPath = first.webkitRelativePath || '';
  if (!relPath.includes('/')) return null;
  return relPath.split('/')[0];
};

const SelectionFilesDialog = ({
  isOpen,
  onClose,
  files,
  onConfirm,
  title = 'Download Merged Logs',
  description = 'Select which tabs to include in the merged output:',
  confirmLabel = 'Merge',
  getDefaultChecked = null, // optional: (fileItem) => boolean
}: Props) => {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // (Re)initialise checkboxes whenever the dialog opens or the file list changes
  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, boolean> = {};
    files.forEach((f) => {
      if (!hasFileObj(f)) {
        initial[f.id] = false;
        return;
      }
      if (getDefaultChecked) {
        initial[f.id] = getDefaultChecked(f);
      } else {
        const fullName = (f.name || '').replace(/\s*\(\d+\)\s*$/, '').trim();
        const lastSegment = (fullName.split('/').pop() || '').toLowerCase();
        initial[f.id] = DEFAULT_LOG_GROUP_PREFIXES.some((prefix) => lastSegment.startsWith(prefix));
      }
    });
    setSelected(initial);
  }, [isOpen, files, getDefaultChecked]);

  const toggle = (id: string) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const selectedCount = selectedIds.length;
  const handleMerge = () => {
    if (selectedCount) onConfirm(selectedIds);
  };
  const selectAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const file of files) next[file.id] = checked && hasFileObj(file);
    setSelected(next);
  };

  // Sort: by root folder, then by type (name without count suffix), then by full name
  const sortedFiles = [...files].sort((a, b) => {
    const folderA = getRootFolder(a) || '';
    const folderB = getRootFolder(b) || '';
    if (folderA !== folderB) return folderA.localeCompare(folderB);
    const typeA = (a.name || '')
      .replace(/\s*\(\d+\)\s*$/, '')
      .trim()
      .toLowerCase();
    const typeB = (b.name || '')
      .replace(/\s*\(\d+\)\s*$/, '')
      .trim()
      .toLowerCase();
    if (typeA !== typeB) return typeA.localeCompare(typeB);
    return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
  });

  // Group by root folder for section headers
  const groupedByFolder: { folder: string | null; items: ViewerFile[] }[] = [];
  sortedFiles.forEach((f) => {
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
    <ViewerDialog open onClose={onClose} label="Select files" wide>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ my: 1 }}>
          <Button onClick={() => selectAll(true)}>Select All</Button>
          <Button color="inherit" onClick={() => selectAll(false)}>
            Deselect All
          </Button>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ ml: 'auto !important', alignSelf: 'center' }}
          >
            {selectedCount} selected
          </Typography>
        </Stack>
        <List disablePadding>
          {groupedByFolder.map(({ folder, items }) => (
            <React.Fragment key={folder || '__no_folder__'}>
              {folder && (
                <ListSubheader sx={{ bgcolor: 'background.paper', overflowWrap: 'anywhere' }}>
                  {folder}
                </ListSubheader>
              )}
              {items.map((file) => {
                const available = hasFileObj(file);
                return (
                  <Box
                    component="li"
                    key={file.id}
                    sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}
                  >
                    <FormControlLabel
                      sx={{ width: '100%', py: 0.5 }}
                      disabled={!available}
                      control={
                        <Checkbox checked={!!selected[file.id]} onChange={() => toggle(file.id)} />
                      }
                      label={
                        <Box sx={{ overflowWrap: 'anywhere' }}>
                          {file.name}
                          {!available && (
                            <Typography variant="caption" component="div">
                              File not available — re-open the folder to enable merging
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </Box>
                );
              })}
            </React.Fragment>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button onClick={handleMerge} disabled={selectedCount === 0} variant="contained">
          {confirmLabel}
          {selectedCount > 0 ? ` (${selectedCount})` : ''}
        </Button>
      </DialogActions>
    </ViewerDialog>
  );
};

export default SelectionFilesDialog;
