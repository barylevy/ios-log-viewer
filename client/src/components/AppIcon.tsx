import Box from '@mui/material/Box';

interface Props {
  size?: number;
  alt?: string;
}

/**
 * Cato Client Log Viewer app icon. Renders the light or dark variant based on the
 * `dark` class the theme toggle sets on <html>.
 */
const AppIcon = ({ size = 36, alt = 'Cato Client Log Viewer' }: Props) => (
  <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0, width: size, height: size }}>
    <Box
      component="img"
      src="/app-icon-light.svg"
      alt={alt}
      sx={{ width: size, height: size, 'html.dark &': { display: 'none' } }}
    />
    <Box
      component="img"
      src="/app-icon-dark.svg"
      alt={alt}
      sx={{ width: size, height: size, display: 'none', 'html.dark &': { display: 'block' } }}
    />
  </Box>
);

export default AppIcon;
