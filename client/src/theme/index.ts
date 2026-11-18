import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary:   { main: '#1a56a8' },
    secondary: { main: '#64748b' },
    success:   { main: '#16a34a' },
    warning:   { main: '#d97706' },
    error:     { main: '#dc2626' },
    background: { default: '#f4f6fa', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", sans-serif',
    fontSize: 13,
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: 'none', borderRadius: 6 } },
    },
    MuiCard: {
      styleOverrides: { root: { borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } },
    },
    MuiTableCell: {
      styleOverrides: { head: { fontWeight: 600, backgroundColor: '#f8fafc' } },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 500 } },
    },
  },
  shape: { borderRadius: 6 },
});
