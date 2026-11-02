import SvgIcon from '@mui/material/SvgIcon';

const paths = {
  download: 'M4 16v4h16v-4M12 3v12m-5-5 5 5 5-5',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  folder: 'M3 7V5h6l2 2h10v13H3V7Z',
  history: 'M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2',
  clear: 'M6 6l12 12M6 18 18 6',
  previous: 'm14 6-6 6 6 6',
  next: 'm10 6 6 6-6 6',
  expand: 'm6 9 6 6 6-6',
  help: 'M9.1 9a3 3 0 1 1 5.8 1c-.8 1-2.9 1.5-2.9 3M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
};

export default function ToolbarIcon({ name }: { name: keyof typeof paths }) {
  return (
    <SvgIcon
      fontSize="small"
      sx={{ fill: 'none' }}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </SvgIcon>
  );
}
