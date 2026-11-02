import Button from '@mui/material/Button';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import ViewerDialog from './ViewerDialog';

interface Props {
  maximumLine: number;
  onSelect: (lineNumber: number) => void;
  onClose: () => void;
}

export default function GoToLineDialog({ maximumLine, onSelect, onClose }: Props) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const lineNumber = Number(value.trim());
  const inRange = Number.isInteger(lineNumber) && lineNumber >= 1 && lineNumber <= maximumLine;
  const invalid = (value !== '' || submitted) && !inRange;
  const submit = () => {
    setSubmitted(true);
    if (inRange) onSelect(lineNumber);
  };
  return (
    <ViewerDialog open onClose={onClose} label="Go to Line">
      <DialogTitle>Go to Line</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          autoFocus
          type="number"
          label="Line number"
          placeholder="Enter line number"
          sx={{ mt: 1 }}
          value={value}
          error={invalid}
          helperText={`Enter a line from 1 to ${maximumLine.toLocaleString()}.`}
          slotProps={{ htmlInput: { min: 1, max: maximumLine } }}
          onChange={(event) => {
            setValue(event.target.value);
            setSubmitted(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit}>
          OK
        </Button>
      </DialogActions>
    </ViewerDialog>
  );
}
