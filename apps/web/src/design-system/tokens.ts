/**
 * SPEC-UI-40 — Design System Tokens (Source of Truth)
 * ALL colors, spacing, typography, radius, shadows, icons referenced here.
 * No hardcoded values allowed in pages.
 */

/* ─── Colors ──────────────────────────────────────────── */

export const colors = {
  bg: {
    0: '#070A0F',
    1: '#0B1220',
    2: '#0F1A2B',
  },
  text: {
    0: '#EAF0F6',
    1: 'rgba(234,240,246,0.70)',
    2: 'rgba(234,240,246,0.52)',
  },
  brand: {
    primary: '#D8A24A',
    secondary: '#4DA3FF',
    primaryDark: '#B9822A',
    ink: '#1A2A45',
  },
  state: {
    success: '#2ECC71',
    warn: '#F5A524',
    error: '#FF4D4F',
    info: '#7C5CFF',
  },
  border: {
    0: 'rgba(255,255,255,0.08)',
    1: 'rgba(255,255,255,0.14)',
  },
  focus: {
    ring: '0 0 0 2px rgba(77,163,255,0.35)',
  },
  gradients: {
    brand: 'linear-gradient(135deg, #D8A24A 0%, #B9822A 55%, #4DA3FF 100%)',
    surface: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.00))',
  },
} as const;

/* ─── Typography ──────────────────────────────────────── */

export const typography = {
  fontFamily: '"Inter", sans-serif',
  fontMono: '"JetBrains Mono", "Fira Code", monospace',
  scale: {
    xs: { fontSize: '11px', lineHeight: '14px' },
    sm: { fontSize: '12px', lineHeight: '16px' },
    md: { fontSize: '14px', lineHeight: '20px' },
    lg: { fontSize: '16px', lineHeight: '24px' },
    xl: { fontSize: '20px', lineHeight: '28px' },
    '2xl': { fontSize: '24px', lineHeight: '32px' },
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

/* ─── Spacing ─────────────────────────────────────────── */

export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const;

export const sp = (n: keyof typeof spacing) => spacing[n];

/* ─── Radius ──────────────────────────────────────────── */

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  pill: '999px',
} as const;

/* ─── Shadows ─────────────────────────────────────────── */

export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.25)',
  md: '0 4px 16px rgba(0,0,0,0.35)',
  lg: '0 18px 60px rgba(0,0,0,0.55)',
} as const;

/* ─── Icon sizes ──────────────────────────────────────── */

export const iconSize = {
  action: 16,
  nav: 20,
  hero: 24,
  xl: 32,
  xxl: 48,
} as const;

/* ─── Z-index ─────────────────────────────────────────── */

export const zIndex = {
  dropdown: 100,
  sticky: 200,
  drawer: 300,
  modal: 400,
  toast: 500,
} as const;

/* ─── Transitions ─────────────────────────────────────── */

export const transition = {
  fast: '0.1s ease',
  normal: '0.15s ease',
  slow: '0.25s ease',
} as const;

/* ─── Breakpoints ─────────────────────────────────────── */

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;
