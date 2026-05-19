/**
 * Arena + Climb — aligned with PublicProfile glass: near-black base, cyan (#00f3ff)
 * as the hero accent, magenta (#ff1e6d) sparingly for oppose / high-signal CTAs.
 * Avoids rainbow (amber/violet/gold) rims from the older Pulse spectrum.
 */
export const ARENA_THEME = {
  bgPage: '#05070c',
  bgDeep: '#020308',
  /** Tailwind intuition.primary */
  cyan: '#00f3ff',
  cyanMuted: '#67e8f9',
  /** Tailwind intuition.secondary — distrust, sharp CTAs */
  accentPink: '#ff1e6d',
  roseNo: '#ff1e6d',
  red: '#ff1e6d',
  redHot: '#ff4081',
  redDim: 'rgba(255,30,109,0.14)',
  /**
   * Legacy names kept for call sites: tertiary UI tints stay in the cyan/slate family
   * so older `ARENA_THEME.gold` / `.violet` references don’t reintroduce yellow/purple.
   */
  gold: '#22d3ee',
  goldBright: '#f1f5f9',
  goldDim: 'rgba(0,243,255,0.1)',
  violet: '#64748b',
  violetDeep: '#475569',
  pulseHotCardShadow:
    '0 0 28px rgba(0,243,255,0.14), 0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
  rimBar: 'linear-gradient(90deg, transparent 0%, rgba(0,243,255,0.95) 50%, transparent 100%)',
  heroTitle: 'linear-gradient(180deg, #ffffff 0%, #f1f5f9 38%, #00f3ff 100%)',
  topAccentBar: 'linear-gradient(90deg, transparent 8%, #00f3ff 50%, transparent 92%)',
  heroGlow:
    'radial-gradient(ellipse 100% 75% at 10% 0%, rgba(0,243,255,0.14) 0%, transparent 55%), radial-gradient(ellipse 65% 50% at 92% 8%, rgba(255,30,109,0.09) 0%, transparent 50%)',
  shellGlass:
    'linear-gradient(155deg, rgba(8,10,14,0.96) 0%, rgba(5,6,9,0.94) 42%, rgba(10,11,16,0.92) 100%)',
  shellShadow:
    '0 28px 100px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(0,243,255,0.08), 0 0 40px rgba(0,243,255,0.05)',
  runPanelBg:
    'linear-gradient(178deg, rgba(9,10,12,0.992) 0%, rgba(5,6,8,0.998) 48%, rgba(8,9,12,0.99) 100%)',
  runPanelShadow: '-16px 0 52px rgba(0,0,0,0.55), inset 1px 0 0 rgba(0,243,255,0.07)',
  currentRunCard:
    'linear-gradient(145deg, rgba(0,243,255,0.07) 0%, rgba(6,8,12,0.95) 42%, rgba(8,9,14,0.96) 100%)',
  signalIntroStrip:
    'linear-gradient(150deg, rgba(0,243,255,0.09) 0%, rgba(7,8,12,0.92) 48%, rgba(255,30,109,0.06) 100%)',
  signalBrowseWell:
    'linear-gradient(158deg, rgba(0,243,255,0.045) 0%, rgba(5,6,10,0.94) 50%, rgba(8,9,14,0.95) 100%)',
  signalBrowseWellShadow:
    'inset 0 0 100px rgba(0,243,255,0.035), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(255,255,255,0.06)',
  signalRunColumnBg:
    'linear-gradient(178deg, rgba(10,10,12,0.99) 0%, rgba(4,5,8,0.995) 100%)',
  signalRunColumnShadow:
    '-12px 0 48px rgba(0,0,0,0.5), inset 1px 0 0 rgba(0,243,255,0.1)',
} as const;
