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
    hex: '#ff5039',                       // cinnabar (brand primary)
    soft: 'rgba(255,80,57,0.12)',
    line: 'rgba(255,80,57,0.45)',
    contrastText: '#1a0a08',
    label: 'Daily',
    textClass: 'text-intuition-primary',
  },
  ecosystem: {
    hex: '#3b5afe',                       // cobalt (brand accent)
    soft: 'rgba(59,90,254,0.14)',
    line: 'rgba(59,90,254,0.48)',
    contrastText: '#0a0e1a',
    label: 'Ecosystem',
    textClass: 'text-intuition-purple',
  },
  identities: {
    hex: '#ff8775',                       // cinnabar light
    soft: 'rgba(255,135,117,0.14)',
    line: 'rgba(255,135,117,0.48)',
    contrastText: '#1a0a08',
    label: 'Identities',
    textClass: 'text-intuition-primary',
  },
  graph: {
    hex: '#2a44d8',                       // cobalt deep
    soft: 'rgba(42,68,216,0.14)',
    line: 'rgba(42,68,216,0.48)',
    contrastText: '#08081a',
    label: 'Graph',
    textClass: 'text-intuition-purple',
  },
  macro: {
    hex: '#fbbf24',                       // marigold (brand warning/rare)
    soft: 'rgba(251,191,36,0.14)',
    line: 'rgba(251,191,36,0.48)',
    contrastText: '#1a120a',
    label: 'Macro',
    textClass: 'text-intuition-warning',
  },
  network: {
    hex: '#dc2626',                       // crimson (brand secondary/danger)
    soft: 'rgba(220,38,38,0.14)',
    line: 'rgba(220,38,38,0.48)',
    contrastText: '#1a050a',
    label: 'Network',
    textClass: 'text-intuition-secondary',
  },
  default: {
    hex: '#ff5039',                       // cinnabar fallback
    soft: 'rgba(255,80,57,0.12)',
    line: 'rgba(255,80,57,0.45)',
    contrastText: '#1a0a08',
    label: 'Community',
    textClass: 'text-intuition-primary',
  },
};

/** Resolve a deck palette entry from a category id (falls back to `default`). */
export function deckPalette(category?: string | null): DeckPaletteEntry {
  if (!category) return DECK_PALETTE.default;
  const key = category as ArenaCategoryId;
  return DECK_PALETTE[key] ?? DECK_PALETTE.default;
}

/** Surface tokens for cards (same across decks). Warm dark, sits slightly
 *  deeper than the global --bg (#1c1620) so cards feel inset, not raised. */
export const ARENA_CARD_SURFACE = {
  /** Active card body — single solid panel, no gradients. */
  bodyBg: '#14101a',
  /** Back-of-deck cards (deepest). */
  deckBg: '#0e0a14',
  /** Nameplate / stat-row inset. */
  inset: 'rgba(255,255,255,0.025)',
  /** Generic muted border. */
  edgeMuted: 'rgba(255,255,255,0.06)',
} as const;

/** Universal swipe semantic colors — agree green, pass crimson. Aligned to
 *  brand palette (intuition.success / intuition.secondary). */
export const SWIPE_COLORS = {
  yes: '#22c55e',
  yesSoft: 'rgba(34,197,94,0.14)',
  yesLine: 'rgba(34,197,94,0.5)',
  no: '#dc2626',
  noSoft: 'rgba(220,38,38,0.14)',
  noLine: 'rgba(220,38,38,0.5)',
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
