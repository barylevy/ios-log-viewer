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
        palette: {
          mode: dark ? 'dark' : 'light',
          primary: { main: dark ? '#5ED6BE' : '#007D66' },
          background: {
            default: dark ? '#111827' : '#F8FAFC',
            paper: dark ? '#1F2937' : '#FFFFFF',
          },
          divider: dark ? '#374151' : '#E2E8F0',
        },
        shape: { borderRadius: 8 },
        typography: { fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 13 },
        components: {
          MuiTextField: { defaultProps: { size: 'small' } },
          MuiIconButton: { defaultProps: { size: 'small' } },
          MuiMenuItem: { defaultProps: { dense: true } },
          MuiDialogTitle: { styleOverrides: { root: { fontSize: '1.1rem', fontWeight: 600 } } },
          MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px', gap: 8 } } },
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
