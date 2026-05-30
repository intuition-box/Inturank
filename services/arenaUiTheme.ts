/**
 * Arena + Climb — aligned with the rest of the app: warm-charcoal canvas,
 * cinnabar (#ff5039) as the hero accent, crimson (#dc2626) sparingly for
 * danger / sharp CTAs. Legacy `gold` and `violet` slots collapse onto the
 * brand palette so old call sites keep compiling without reintroducing
 * out-of-palette tones.
 *
 * Cinnabar gives the Arena a warm ember signature that ties to Home's hero
 * gradient and the cinnabar accent strip — visually consistent across pages.
 */
export const ARENA_THEME = {
  bgPage: '#1c1620',           // matches global --bg (warm charcoal)
  bgDeep: '#0e0807',           // deep ember shadow for inset wells
  /** Tailwind intuition.primary — cinnabar */
  cyan: '#ff5039',
  cyanMuted: '#ff8775',
  /** Tailwind intuition.secondary — crimson, for danger / sharp CTAs */
  accentPink: '#dc2626',
  roseNo: '#dc2626',
  red: '#dc2626',
  redHot: '#ef4444',
  redDim: 'rgba(220,38,38,0.14)',
  /**
   * Legacy names kept for call sites: tertiary UI tints stay in the
   * cinnabar/slate family so older references compile without yellow/purple.
   */
  gold: '#ff8775',
  goldBright: '#f7f5ee',
  goldDim: 'rgba(255,80,57,0.1)',
  violet: '#64748b',
  violetDeep: '#475569',
  pulseHotCardShadow:
    '0 0 28px rgba(255,80,57,0.20), 0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
  rimBar: 'linear-gradient(90deg, transparent 0%, rgba(255,80,57,0.95) 50%, transparent 100%)',
  heroTitle: 'linear-gradient(180deg, #ffffff 0%, #f7f5ee 38%, #ff5039 100%)',
  topAccentBar: 'linear-gradient(90deg, transparent 8%, #ff5039 50%, transparent 92%)',
  heroGlow:
    'radial-gradient(ellipse 110% 80% at 50% 0%, rgba(255,80,57,0.34) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 10% 50%, rgba(255,80,57,0.16) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 92% 70%, rgba(220,38,38,0.10) 0%, transparent 50%)',
  shellGlass:
    'linear-gradient(155deg, rgba(28,22,32,0.96) 0%, rgba(20,16,24,0.94) 42%, rgba(28,22,32,0.92) 100%)',
  shellShadow:
    '0 28px 100px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(255,80,57,0.10), 0 0 40px rgba(255,80,57,0.06)',
  runPanelBg:
    'linear-gradient(178deg, rgba(28,22,32,0.992) 0%, rgba(20,16,24,0.998) 48%, rgba(28,22,32,0.99) 100%)',
  runPanelShadow: '-16px 0 52px rgba(0,0,0,0.55), inset 1px 0 0 rgba(255,80,57,0.10)',
  currentRunCard:
    'linear-gradient(145deg, rgba(255,80,57,0.08) 0%, rgba(20,16,24,0.95) 42%, rgba(28,22,32,0.96) 100%)',
  signalIntroStrip:
    'linear-gradient(150deg, rgba(255,80,57,0.10) 0%, rgba(20,16,24,0.92) 48%, rgba(220,38,38,0.06) 100%)',
  signalBrowseWell:
    'linear-gradient(158deg, rgba(255,80,57,0.05) 0%, rgba(20,16,24,0.94) 50%, rgba(28,22,32,0.95) 100%)',
  signalBrowseWellShadow:
    'inset 0 0 100px rgba(255,80,57,0.04), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(255,255,255,0.06)',
  signalRunColumnBg:
    'linear-gradient(178deg, rgba(28,22,32,0.99) 0%, rgba(20,16,24,0.995) 100%)',
  signalRunColumnShadow:
    '-12px 0 48px rgba(0,0,0,0.5), inset 1px 0 0 rgba(255,80,57,0.12)',
} as const;
