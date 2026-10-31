import Dialog from '@mui/material/Dialog';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  wide?: boolean;
}

/** MUI owns focus trapping, focus restoration, Escape, and backdrop handling. */
export default function ViewerDialog({ open, onClose, label, children, wide = false }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={undefined}
      fullWidth
      maxWidth={wide ? 'lg' : 'sm'}
      slotProps={{
        paper: {
          'aria-label': label,
          sx: { backgroundImage: 'none', margin: 2, maxHeight: '90vh' },
        },
      }}
    >
      {children}
    </Dialog>
  );
}
