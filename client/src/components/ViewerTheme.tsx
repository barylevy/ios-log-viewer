import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';

export default function ViewerTheme({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark')),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode: dark ? 'dark' : 'light', primary: { main: '#008C73' } },
        typography: { fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 13 },
        components: {
          MuiButton: {
            defaultProps: { size: 'small' },
            styleOverrides: { root: { textTransform: 'none' } },
          },
        },
      }),
    [dark],
  );
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
