import Dialog from '@mui/material/Dialog';
import { useId, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  wide?: boolean;
}

/** MUI owns focus trapping, focus restoration, Escape, and backdrop handling. */
export default function ViewerDialog({ open, onClose, label, children, wide = false }: Props) {
  const labelId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={labelId}
      fullWidth
      maxWidth={wide ? 'lg' : 'sm'}
      slotProps={{
        paper: {
          'aria-label': label,
          sx: { backgroundImage: 'none', margin: 2, maxHeight: '90vh' },
        },
      }}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      {children}
    </Dialog>
  );
}
