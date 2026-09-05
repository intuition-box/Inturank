// IntuRank design tokens — single source of truth for both Tailwind and MUI.
//
// Motion grammar: only `transform`, `opacity`, and `box-shadow` are used for
// animation. No `filter`, no layout animations. See project rules.

// IntuRank Signal — near-black ground, cyan brand, cinnabar for the other side.
// Values come from the Claude Design handoff (inturank-design/handoff/HANDOFF.md).
// The alias KEYS below are legacy (932 component sites reference `intuition.*` through the
// CSS-var bridge in tailwind.config.ts) so only the VALUES change; nothing else has to move.
export const palette = {
  cyan:    '#00fafa',  // CYAN — the brand, from the logo. Agreement, gains, primary action.
  pink:    '#ff5039',  // CINNABAR — the other side: disagreement, fades, losses, danger.
  lime:    '#00fafa',  // collapses into cyan — the palette has no third hue
  green:   '#00fafa',  // gains read cyan in the designs, never green
  gold:    '#ffb300',  // AMBER — streak and reward only, rare enough to stay special
  purple:  '#00fafa',  // collapses into cyan
  red:     '#ff5039',  // cinnabar
} as const;

export const darkPalette = {
  bg:        '#07090C',           // ground — near-black, the logo's own field
  surface:   '#12161C',           // raised card
  surface2:  '#1A1F26',           // hover / elevated / in-card hairline
  border:    '#1E242C',           // hairline
  hairline:  'rgba(242,237,228,0.06)',
  text:      '#F2EDE4',           // bone — never pure white
  textMuted: '#97A1AD',
  textDim:   '#6C7684',           // floor
  primary:   palette.cyan,
  accent:    palette.cyan,
  cta:       palette.cyan,
  success:   palette.cyan,        // "the money agrees" floods cyan, not green
  warning:   palette.gold,
  rare:      palette.gold,
  danger:    palette.red,
} as const;

// Type scale.
export const type = {
  fontFamily: {
    sans:    '"Hanken Grotesk", system-ui, -apple-system, sans-serif',
    /** The design has NO monospace. `font-mono` is used at 570 sites, mostly for numbers and
     *  addresses, so the token points at the display face with tabular figures (see index.css)
     *  rather than requiring every call site to change. */
    mono:    '"Archivo", system-ui, sans-serif',
    /** Archivo 800/900 with negative tracking — display headings, stat numerals, buttons. */
    display: '"Archivo", "Hanken Grotesk", system-ui, sans-serif',
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
