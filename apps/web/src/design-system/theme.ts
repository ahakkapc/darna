'use client';

import { createTheme } from '@mui/material/styles';
import { colors, typography, radius, shadows } from './tokens';

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: colors.bg[0],
      paper: colors.bg[1],
    },
    text: {
      primary: colors.text[0],
      secondary: colors.text[1],
    },
    divider: colors.border[0],
    primary: {
      main: colors.brand.primary,
      dark: colors.brand.primaryDark,
    },
    secondary: {
      main: colors.brand.secondary,
    },
    info: {
      main: colors.state.info,
    },
    success: {
      main: colors.state.success,
    },
    warning: {
      main: colors.state.warn,
    },
    error: {
      main: colors.state.error,
    },
  },
  typography: {
    fontFamily: typography.fontFamily,
    h1: {
      fontSize: typography.scale['2xl'].fontSize,
      lineHeight: typography.scale['2xl'].lineHeight,
      fontWeight: typography.weight.bold,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: typography.scale.lg.fontSize,
      lineHeight: typography.scale.lg.lineHeight,
      fontWeight: typography.weight.bold,
    },
    h3: {
      fontSize: typography.scale.md.fontSize,
      lineHeight: typography.scale.md.lineHeight,
      fontWeight: typography.weight.semibold,
    },
    body1: {
      fontSize: typography.scale.md.fontSize,
      lineHeight: typography.scale.md.lineHeight,
      fontWeight: typography.weight.regular,
    },
    body2: {
      fontSize: typography.scale.sm.fontSize,
      lineHeight: typography.scale.sm.lineHeight,
      fontWeight: typography.weight.medium,
    },
    caption: {
      fontSize: typography.scale.xs.fontSize,
      lineHeight: typography.scale.xs.lineHeight,
      fontWeight: typography.weight.regular,
      color: colors.text[2],
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.bg[0],
          color: colors.text[0],
        },
        '*:focus-visible': {
          outline: 'none',
          boxShadow: colors.focus.ring,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          borderRadius: radius.md,
          fontWeight: typography.weight.semibold,
          fontSize: typography.scale.md.fontSize,
          transition: 'all 0.15s ease',
        },
        sizeLarge: { height: 48, fontSize: typography.scale.lg.fontSize, padding: '0 24px' },
        sizeMedium: { height: 40, padding: '0 20px' },
        sizeSmall: { height: 32, fontSize: typography.scale.sm.fontSize, padding: '0 12px' },
        containedPrimary: {
          background: colors.gradients.brand,
          color: colors.bg[0],
          '&:hover': { background: colors.gradients.brand, opacity: 0.9 },
        },
        outlined: {
          borderColor: colors.border[0],
          backgroundColor: 'transparent',
          '&:hover': { borderColor: `${colors.brand.primary}73`, backgroundColor: 'transparent' },
        },
        text: {
          '&:hover': { backgroundColor: `${colors.brand.primary}0F` },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          transition: 'all 0.15s ease',
          '&:hover': { backgroundColor: `${colors.brand.primary}0F` },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: colors.bg[2],
            borderRadius: radius.md,
            fontSize: typography.scale.md.fontSize,
            '& fieldset': { borderColor: colors.border[0] },
            '&:hover fieldset': { borderColor: `${colors.brand.primary}59` },
            '&.Mui-focused fieldset': {
              borderColor: `${colors.brand.primary}59`,
              boxShadow: colors.focus.ring,
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: colors.bg[2],
          borderRadius: radius.md,
          '& fieldset': { borderColor: colors.border[0] },
          '&:hover fieldset': { borderColor: `${colors.brand.primary}59` },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: `${colors.gradients.surface}, ${colors.bg[1]}`,
          border: `1px solid ${colors.border[0]}`,
          borderRadius: radius.lg,
          backgroundClip: 'padding-box',
          boxShadow: shadows.sm,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: radius.pill,
          backgroundColor: `${colors.brand.primary}1A`,
          border: `1px solid ${colors.brand.primary}40`,
          color: colors.text[0],
          fontWeight: typography.weight.semibold,
          fontSize: typography.scale.sm.fontSize,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.1s ease',
          '&:hover': { backgroundColor: `${colors.brand.primary}0F` },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: typography.weight.semibold,
          fontSize: typography.scale.sm.fontSize,
          color: colors.text[2],
          borderBottom: `1px solid ${colors.border[0]}`,
        },
        body: {
          fontSize: typography.scale.md.fontSize,
          borderBottom: `1px solid ${colors.border[0]}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.bg[1],
          borderRadius: `${radius.xl} 0 0 ${radius.xl}`,
          borderLeft: `1px solid ${colors.border[0]}`,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.bg[1],
          border: `1px solid ${colors.border[0]}`,
          borderRadius: radius.lg,
          boxShadow: shadows.lg,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: colors.border[0] },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          fontWeight: typography.weight.semibold,
          fontSize: typography.scale.md.fontSize,
          minHeight: 40,
          padding: '8px 16px',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          borderRadius: 1,
          backgroundColor: colors.brand.primary,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: colors.bg[2],
          border: `1px solid ${colors.border[1]}`,
          borderRadius: radius.sm,
          fontSize: typography.scale.sm.fontSize,
          boxShadow: shadows.md,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.bg[2],
          border: `1px solid ${colors.border[0]}`,
          borderRadius: radius.md,
          boxShadow: shadows.md,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: typography.scale.md.fontSize,
          '&:hover': { backgroundColor: `${colors.brand.primary}0F` },
          '&.Mui-selected': { backgroundColor: `${colors.brand.primary}1A` },
        },
      },
    },
  },
});

export default theme;
