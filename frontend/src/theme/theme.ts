'use client';

import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: '#3b6fd0' },
    error: { main: '#d32f2f' },
    background: { default: '#f3f4f6', paper: '#ffffff' },
    text: { primary: '#1f2933', secondary: '#6b7280' },
  },
  typography: {
    fontFamily: 'var(--font-lato), Lato, Arial, sans-serif',
    fontSize: 13,
    button: { fontWeight: 600, fontSize: 12, letterSpacing: 0.4 },
  },
  shape: { borderRadius: 3 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true, size: 'small' },
      styleOverrides: { root: { height: 32, paddingInline: 14 } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { fontSize: 12.5, paddingBlock: 6, borderColor: '#e5e7eb' },
        head: { fontWeight: 700, backgroundColor: '#f3f4f6' },
      },
    },
  },
});

export default theme;
