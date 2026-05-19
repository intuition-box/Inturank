/**
 * Arena card design tokens — solid color theming per contest.
 *
 * Each contest category gets ONE bold solid accent ("deck color") that's used
 * confidently across the whole card anatomy (rank ribbon, corner ticks, primary
 * CTA, progress bar). This mirrors how ShadowBid commits to a single bold purple,
 * but with a non-purple gaming palette so different contests feel distinct.
 *
 * Universal semantics (yes/no swipe colors) stay constant across decks — agree
 * is always emerald, pass is always rose — so the swipe language is unambiguous.
 */

/**
 * Mirrors the `arenaCategory` union from `arenaListsRegistry`. Inlined here
 * (not re-exported) to keep this module dependency-free and tree-shakeable.
 */
export type ArenaCategoryId = 'daily' | 'ecosystem' | 'identities' | 'graph' | 'macro' | 'network';

export type DeckPaletteEntry = {
  /** Solid hex used on ribbons, fills, accents. */
  hex: string;
  /** Same hue at low alpha — soft-fill backgrounds. */
  soft: string;
  /** Same hue at mid alpha — borders / underlines. */
  line: string;
  /** Text color to use on top of the solid `hex` fill for contrast. */
  contrastText: string;
  /** Human-readable label for the category chip. */
  label: string;
  /** Tailwind text class for inline accents (closest match to `hex`). */
  textClass: string;
};

/**
 * Solid non-purple palette — each contest category gets a committed color.
 * Picked for high contrast on near-black, distinct from yes/no semantics
 * (emerald / rose), and shippable across light/dark surfaces.
 */
export const DECK_PALETTE: Record<ArenaCategoryId | 'default', DeckPaletteEntry> = {
  daily: {
    hex: '#00f3ff',
    soft: 'rgba(0,243,255,0.12)',
    line: 'rgba(0,243,255,0.45)',
    contrastText: '#04070d',
    label: 'Daily',
    textClass: 'text-cyan-300',
  },
  ecosystem: {
    hex: '#2dd4bf',
    soft: 'rgba(45,212,191,0.14)',
    line: 'rgba(45,212,191,0.48)',
    contrastText: '#04140f',
    label: 'Ecosystem',
    textClass: 'text-teal-300',
  },
  identities: {
    hex: '#ec4899',
    soft: 'rgba(236,72,153,0.14)',
    line: 'rgba(236,72,153,0.48)',
    contrastText: '#1a040d',
    label: 'Identities',
    textClass: 'text-pink-300',
  },
  graph: {
    hex: '#38bdf8',
    soft: 'rgba(56,189,248,0.12)',
    line: 'rgba(56,189,248,0.45)',
    contrastText: '#04101a',
    label: 'Graph',
    textClass: 'text-sky-300',
  },
  macro: {
    hex: '#f59e0b',
    soft: 'rgba(245,158,11,0.14)',
    line: 'rgba(245,158,11,0.48)',
    contrastText: '#1a120a',
    label: 'Macro',
    textClass: 'text-amber-300',
  },
  network: {
    hex: '#fb7185',
    soft: 'rgba(251,113,133,0.14)',
    line: 'rgba(251,113,133,0.48)',
    contrastText: '#1a050a',
    label: 'Network',
    textClass: 'text-rose-300',
  },
  default: {
    hex: '#00f3ff',
    soft: 'rgba(0,243,255,0.12)',
    line: 'rgba(0,243,255,0.45)',
    contrastText: '#04070d',
    label: 'Community',
    textClass: 'text-cyan-300',
  },
};

/** Resolve a deck palette entry from a category id (falls back to `default`). */
export function deckPalette(category?: string | null): DeckPaletteEntry {
  if (!category) return DECK_PALETTE.default;
  const key = category as ArenaCategoryId;
  return DECK_PALETTE[key] ?? DECK_PALETTE.default;
}

/** Surface tokens for cards (same across decks). */
export const ARENA_CARD_SURFACE = {
  /** Active card body — single solid panel, no gradients. */
  bodyBg: '#0b0f17',
  /** Back-of-deck cards. */
  deckBg: '#0a0e15',
  /** Nameplate / stat-row inset. */
  inset: 'rgba(255,255,255,0.025)',
  /** Generic muted border. */
  edgeMuted: 'rgba(255,255,255,0.06)',
} as const;

/** Universal swipe semantic colors — same across all decks. */
export const SWIPE_COLORS = {
  yes: '#10b981',
  yesSoft: 'rgba(16,185,129,0.14)',
  yesLine: 'rgba(16,185,129,0.5)',
  no: '#ff4d7a',
  noSoft: 'rgba(255,77,122,0.14)',
  noLine: 'rgba(255,77,122,0.5)',
} as const;

/** Refined springs — short, snappy, predictable. */
export const ARENA_SPRINGS = {
  /** Card position settle / progress bar tweens. */
  settle: { type: 'spring' as const, stiffness: 500, damping: 32, mass: 0.7 },
  /** Snap-back when a swipe is cancelled below threshold. */
  snap: { type: 'spring' as const, stiffness: 520, damping: 30 },
} as const;

/** Restrained shadows for cards (no neon halos). */
export const ARENA_SHADOWS = {
  cardLifted:
    '0 28px 56px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.05)',
  cardResting:
    '0 14px 36px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.04)',
  inset: 'inset 0 1px 0 rgba(255,255,255,0.04)',
} as const;
