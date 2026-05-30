import type { Config } from 'tailwindcss';
import { palette, darkPalette, type, breakpoints } from './theme/tokens';

// Mobile-first Tailwind config for IntuRank.
// Class-based dark mode: `.dark` toggles on <html>. Light mode reads CSS vars.
const config: Config = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './theme/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    screens: {
      sm: breakpoints.sm,
      md: breakpoints.md,
      lg: breakpoints.lg,
      xl: breakpoints.xl,
      '2xl': breakpoints['2xl'],
    },
    extend: {
      colors: {
        // Theme-aware semantic tokens — values pulled from CSS variables so
        // light/dark switches without re-tailwinding.
        bg:        'rgb(var(--bg) / <alpha-value>)',
        surface:   'rgb(var(--surface) / <alpha-value>)',
        surface2:  'rgb(var(--surface-2) / <alpha-value>)',
        border:    'rgb(var(--border) / <alpha-value>)',
        ink:       'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        'ink-dim':   'rgb(var(--ink-dim) / <alpha-value>)',
        primary:   'rgb(var(--primary) / <alpha-value>)',
        accent:    'rgb(var(--accent) / <alpha-value>)',
        cta:       'rgb(var(--cta) / <alpha-value>)',
        success:   'rgb(var(--success) / <alpha-value>)',
        warning:   'rgb(var(--warning) / <alpha-value>)',
        rare:      'rgb(var(--rare) / <alpha-value>)',
        danger:    'rgb(var(--danger) / <alpha-value>)',
        // Legacy alias — 932 components reference `intuition.*`. Wired to CSS
        // variables so dark/light flips without re-tailwinding. Brand accents
        // (primary, secondary, success, warning, purple) stay vibrant in both
        // modes — only the chrome (dark/card/border) flips with theme.
        intuition: {
          dark:    'rgb(var(--bg) / <alpha-value>)',
          card:    'rgb(var(--surface) / <alpha-value>)',
          border:  'rgb(var(--border) / <alpha-value>)',
          primary: palette.cyan,
          secondary: palette.pink,
          success: palette.green,
          danger:  palette.pink,
          warning: palette.gold,
          purple:  palette.purple,
        },
      },
      fontFamily: {
        sans:    [type.fontFamily.sans],
        mono:    [type.fontFamily.mono],
        display: [type.fontFamily.display],
      },
      animation: {
        'pulse-fast':         'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glitch':             'glitch 0.3s cubic-bezier(.25, .46, .45, .94) both infinite',
        'spin-slow':          'spin 15s linear infinite',
        'spin-reverse-slow':  'reverse-spin 20s linear infinite',
        'spin-fast':          'spin 3s linear infinite',
        'spin-reverse-fast':  'reverse-spin 2s linear infinite',
        'marquee':            'marquee 40s linear infinite',
        'scanline':           'scanline 10s linear infinite',
        'buffer-fill':        'buffer-fill 2.5s cubic-bezier(0.33, 1, 0.68, 1) infinite',
      },
      keyframes: {
        'buffer-fill': {
          '0%, 100%': { width: '50%' },
          '50%':      { width: '100%' },
        },
        glitch: {
          '0%':   { transform: 'translate(0)' },
          '20%':  { transform: 'translate(-3px, 3px)' },
          '40%':  { transform: 'translate(-3px, -3px)' },
          '60%':  { transform: 'translate(3px, 3px)' },
          '80%':  { transform: 'translate(3px, -3px)' },
          '100%': { transform: 'translate(0)' },
        },
        marquee: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        scanline: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'reverse-spin': {
          from: { transform: 'rotate(360deg)' },
          to:   { transform: 'rotate(0deg)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
