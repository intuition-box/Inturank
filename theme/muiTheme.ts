import { createTheme, alpha } from '@mui/material/styles';
import { darkPalette, type, surface } from './tokens';

const p = darkPalette;

export const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: p.primary,
      light: alpha(p.primary, 0.8),
      dark: alpha(p.primary, 0.9),
      contrastText: '#000',
    },
    secondary: {
      main: p.accent,
      light: alpha(p.accent, 0.8),
      dark: alpha(p.accent, 0.9),
      contrastText: '#fff',
    },
    success: { main: p.success },
    warning: { main: p.warning },
    error:   { main: p.danger },
    background: {
      default: p.bg,
      paper:   p.surface2,
    },
    text: {
      primary:   p.text,
      secondary: p.textMuted,
    },
    divider: p.hairline,
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: type.fontFamily.sans,
    h1: { fontWeight: 700, letterSpacing: type.tracking.tight },
    h2: { fontWeight: 700, letterSpacing: type.tracking.normal },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: 'none' },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 600,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
          transition: 'transform var(--anim-duration-fast) var(--anim-ease-out), box-shadow var(--anim-duration-fast) var(--anim-ease-out)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: surface.radius.xl,
          backgroundImage: 'none',
          border: `1px solid ${p.hairline}`,
          boxShadow: surface.shadow.raised,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 500,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${p.hairline}`,
          borderRadius: surface.radius.lg,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: alpha(p.primary, 0.08),
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'medium',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(p.primary, 0.4),
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: p.primary,
              borderWidth: 1,
            },
          },
        },
      },
    },
  },
});
