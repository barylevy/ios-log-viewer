import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Link from '@mui/material/Link';
import ViewerDialog from './components/ViewerDialog';
import { useState } from 'react';

function ProfilePhoto() {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <ButtonBase
        onClick={() => setExpanded(true)}
        aria-label="View larger photo of Bari Levi"
        title="View larger photo"
        sx={{
          borderRadius: '50%',
          '&.Mui-focusVisible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 3,
          },
        }}
      >
        <Avatar src="/bari-levi.png" alt="Bari Levi" sx={{ width: 40, height: 40 }} />
      </ButtonBase>
      <ViewerDialog open={expanded} onClose={() => setExpanded(false)} label="Bari Levi photo">
        <DialogTitle>Bari Levi</DialogTitle>
        <DialogContent>
          <Box
            component="img"
            src="/bari-levi.png"
            alt="Bari Levi"
            sx={{ display: 'block', width: '100%', maxWidth: 512, mx: 'auto', borderRadius: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpanded(false)}>Close photo</Button>
        </DialogActions>
      </ViewerDialog>
    </>
  );
}

const AboutModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <ViewerDialog open onClose={onClose} label="About the log viewer">
      <DialogTitle>About — Cato Client Log Viewer</DialogTitle>
      <DialogContent dividers>
        <b>Cato Client Log Viewer</b> is a modern web application for viewing, searching, and
        analyzing log files from all Cato client types: <b>Windows, Apple, Linux, and Android</b>.
        <br />
        <br />
        <b>Features:</b>
        <ul className="list-disc ml-6 my-2">
          <li>Load multiple log files or entire folders</li>
          <li>Advanced filtering (by text, log level, date, and more)</li>
          <li>Multi-line log grouping and context display</li>
          <li>Search with highlighting and navigation</li>
          <li>Tabbed view for multiple files</li>
          <li>Archive import and merged log export</li>
          <li>Modern, responsive UI with dark mode</li>
        </ul>
        <br />
        If you have ideas, feedback, or encounter any issues, please contact:
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 2 }}>
          <ProfilePhoto />
          <Link href="mailto:bari.levi@catonetworks.com" sx={{ overflowWrap: 'anywhere' }}>
            bari.levi@catonetworks.com
          </Link>
        </Stack>
        <Link
          href="https://slack.com/app_redirect?channel=@bari.levi"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ display: 'inline-block', mt: 2 }}
        >
          Send message on Slack
        </Link>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} aria-label="Close">
          Close
        </Button>
      </DialogActions>
    </ViewerDialog>
  );
};
export default AboutModal;
