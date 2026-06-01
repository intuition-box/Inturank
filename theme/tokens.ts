// IntuRank design tokens — single source of truth for both Tailwind and MUI.
//
// Motion grammar: only `transform`, `opacity`, and `box-shadow` are used for
// animation. No `filter`, no layout animations. See project rules.

// Inturank Cinnabar — warm cream + black canvas + cinnabar tomato brand.
// Same shape as before so 932 component sites using `intuition.*` flip
// automatically via the CSS-var bridge in tailwind.config.ts.
export const palette = {
  // Brand-token aliases kept under their old names so existing components
  // referencing `palette.cyan` etc. still compile — the VALUES are new.
  cyan:    '#ff5039',  // CINNABAR — THE signature brand (was violet)
  pink:    '#dc2626',  // crimson — danger only
  lime:    '#3b5afe',  // COBALT — accent/secondary signal (was pale violet)
  green:   '#22c55e',  // lime — success
  gold:    '#fbbf24',  // marigold — rare/top-rank rewards
  purple:  '#3b5afe',  // collapses into cobalt accent
  red:     '#dc2626',  // crimson
} as const;

export const darkPalette = {
  bg:        '#0a0a0a',           // pure black canvas
  surface:   '#141414',           // raised card
  surface2:  '#1c1c1c',           // hover / elevated
  border:    '#262626',           // hairline
  hairline:  'rgba(255,255,255,0.06)',
  text:      '#ffffff',
  textMuted: '#8c8780',           // warm gray secondary
  textDim:   '#5a554a',
  primary:   palette.cyan,        // cinnabar #ff5039
  accent:    palette.lime,        // cobalt #3b5afe
  cta:       palette.cyan,
  success:   palette.green,
  warning:   palette.gold,
  rare:      palette.gold,        // top-rank uses marigold yellow
  danger:    palette.red,
} as const;

// Type scale.
export const type = {
  fontFamily: {
    sans:    '"Inter", system-ui, -apple-system, sans-serif',
    mono:    '"Fira Code", ui-monospace, monospace',
    /** Unbounded — geometric, slightly weird, distinctively gamy. Used for
     *  display headings, hero text, stat numerals. Orbitron kept as a fallback
     *  so anywhere it was hardcoded still renders. */
    display: '"Unbounded", "Orbitron", "Inter", sans-serif',
  },
  size: {
    micro: '11px',
    xs:    '12px',
    sm:    '13px',
    base:  '15px',
    md:    '17px',
    lg:    '20px',
    xl:    '24px',
    h3:    '28px',
    h2:    '32px',
    h1:    '40px',
    stat:  '64px',
  },
  tracking: {
    tight:    '-0.02em',
    normal:   '0',
    wide:     '0.04em',
    micro:    '0.12em',
    display:  '0.08em',
  },
} as const;

// Motion grammar — every component imports from here. transform + opacity only.
export const motion = {
  duration: {
    tap:    120,
    fast:   180,
    flow:   240,
    slow:   320,
    epic:   600,
  },
  easing: {
    snap:    'cubic-bezier(0.2, 0.9, 0.1, 1.2)',
    glide:   'cubic-bezier(0.22, 1, 0.36, 1)',
    inOut:   'cubic-bezier(0.45, 0, 0.25, 1)',
    stinger: 'cubic-bezier(0.6, 0.05, 0.1, 1)',
  },
  spring: {
    xp:   { stiffness: 320, damping: 18 },
    card: { stiffness: 220, damping: 26 },
    pop:  { stiffness: 380, damping: 22 },
  },
} as const;

// Surface treatments — composed via box-shadow only (no filter blur).
export const surface = {
  radius: {
    sm:  '8px',
    md:  '12px',
    lg:  '16px',
    xl:  '20px',
    pill: '9999px',
  },
  glow: {
    cyan:    '0 0 24px rgba(0,243,255,0.35), 0 0 1px rgba(0,243,255,0.55)',
    cyanSoft:'0 0 16px rgba(0,243,255,0.18)',
    lime:    '0 0 32px rgba(182,255,60,0.45), 0 0 1px rgba(182,255,60,0.65)',
    pink:    '0 0 28px rgba(255,30,109,0.40), 0 0 1px rgba(255,30,109,0.55)',
    gold:    '0 0 20px rgba(250,204,21,0.35)',
    purple:  '0 0 24px rgba(168,85,247,0.35)',
    none:    'none',
  },
  shadow: {
    flat:  '0 1px 0 rgba(0,0,0,0.2)',
    raised:'0 4px 24px rgba(0,0,0,0.25)',
    floating:'0 12px 36px rgba(0,0,0,0.5)',
  },
} as const;

// Mobile-first breakpoints. min-width queries everywhere.
export const breakpoints = {
  sm:  '480px',
  md:  '768px',
  lg:  '1024px',
  xl:  '1280px',
  '2xl':'1536px',
} as const;

// Z-index ladder.
export const z = {
  base:     1,
  raised:   10,
  sticky:   20,
  overlay:  100,
  modal:    200,
  toast:    300,
  tooltip:  400,
  scanlines:9999,
} as const;
