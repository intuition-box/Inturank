import React, { type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArenaXpToken } from './ArenaXpToken';
import { AnimatedXpFigure } from './AnimatedXpFigure';

/**
 * Single source of truth for the "IntuRank XP" stat across the app.
 *
 * Total = Arena XP (from ranks) + Activity XP (from protocol actions).
 * Three sizes so Profile, Arena and Explorer can share the same numbers without drift.
 */
export type IntuRankXpBadgeSize = 'sm' | 'md' | 'lg';

const SIZE_PRESETS: Record<
  IntuRankXpBadgeSize,
  {
    container: string;
    label: string;
    total: string;
    breakdown: string;
    token: number;
  }
> = {
  sm: {
    container: 'gap-3 rounded-2xl px-3 py-2.5',
    label: 'text-[9px] tracking-[0.2em]',
    total: 'text-xl',
    breakdown: 'text-[9px]',
    token: 28,
  },
  md: {
    container: 'gap-4 rounded-2xl px-4 py-3',
    label: 'text-[10px] tracking-[0.2em]',
    total: 'text-3xl',
    breakdown: 'text-[10px]',
    token: 40,
  },
  lg: {
    container: 'gap-5 rounded-3xl px-5 py-4 sm:px-6 sm:py-5',
    label: 'text-[11px] tracking-[0.22em]',
    total: 'text-4xl sm:text-5xl',
    breakdown: 'text-[11px]',
    token: 56,
  },
};

export interface IntuRankXpBadgeProps {
  /** Arena XP (from ranks). */
  arenaXp: number;
  /** Activity XP (from protocol actions: market buys, sends, claim creation, etc.). */
  activityXp: number;
  size?: IntuRankXpBadgeSize;
  /** Optional rank number from the leaderboard — rendered as a small chip. */
  rank?: number | null;
  /** When true, hides the breakdown line (Arena · Activity). Useful in tight spaces. */
  compact?: boolean;
  className?: string;
  /** Shown when the connected wallet hasn't loaded yet — keeps layout stable. */
  loading?: boolean;
  /** Light card for blueprint / Climb contest shell. */
  surface?: 'dark' | 'light';
  /** Arcade HUD frame for Climb header — bolder glass, glow, larger token. */
  presentation?: 'default' | 'arenaHud';
  style?: CSSProperties;
}

export const IntuRankXpBadge: React.FC<IntuRankXpBadgeProps> = ({
  arenaXp,
  activityXp,
  size = 'md',
  rank,
  compact = false,
  className = '',
  loading = false,
  surface = 'dark',
  presentation = 'default',
  style,
}) => {
  const preset = SIZE_PRESETS[size];
  const reduceMotion = useReducedMotion();
  const total = Math.max(0, Math.round((arenaXp || 0) + (activityXp || 0)));
  const showBreakdown =
    !compact && !loading && (arenaXp > 0 || activityXp > 0);
  const light = surface === 'light';
  const hud = !light && presentation === 'arenaHud';
  const tokenPx = hud ? Math.round(preset.token * 1.14) : preset.token;

  const borderTone = light
    ? 'border-slate-200/90'
    : hud
      ? 'border border-cyan-400/40 ring-1 ring-fuchsia-500/25'
      : 'border border-intuition-primary/40';

  const baseDarkStyle: CSSProperties = hud
    ? {
        background:
          'linear-gradient(128deg, rgba(255,80,57,0.13) 0%, rgba(10,14,26,0.9) 45%, rgba(4,7,13,0.96) 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(236,72,153,0.09), 0 0 44px rgba(34,211,238,0.22)',
      }
    : {
        background:
          'linear-gradient(135deg, rgba(255,80,57,0.08) 0%, rgba(8,15,28,0.85) 55%, rgba(2,6,12,0.95) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 28px rgba(255,80,57,0.12)',
      };

  const mergedSurfaceStyle: CSSProperties = light
    ? {
        background:
          'linear-gradient(135deg, #ffffff 0%, rgb(248 250 252) 50%, rgb(240 249 255 / 0.85) 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.95), 0 8px 28px rgba(15,23,42,0.08)',
      }
    : { ...baseDarkStyle, ...(style ?? {}) };

  const overlayStyle =
    light
      ? {
          background:
            'radial-gradient(circle at 18% 30%, rgba(14,165,233,0.08), transparent 55%), radial-gradient(circle at 80% 80%, rgba(232,197,71,0.06), transparent 65%)',
        }
      : {
          background: hud
            ? 'radial-gradient(circle at 15% 25%, rgba(34,211,238,0.22), transparent 52%), radial-gradient(circle at 88% 70%, rgba(236,72,153,0.12), transparent 58%)'
            : 'radial-gradient(circle at 18% 30%, rgba(34,211,238,0.16), transparent 55%), radial-gradient(circle at 80% 80%, rgba(232,197,71,0.06), transparent 65%)',
        };

  return (
    <motion.div
      className={`relative flex items-center overflow-hidden ${borderTone} ${preset.container} ${className}`}
      initial={reduceMotion ? false : { opacity: 0.88, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }
      }
      style={{
        ...(light ? { ...mergedSurfaceStyle, ...(style ?? {}) } : mergedSurfaceStyle),
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={overlayStyle}
        aria-hidden
      />
      <ArenaXpToken size={tokenPx} className="relative z-10 shrink-0" />
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`font-mono font-black uppercase ${light ? 'text-sky-800/90' : hud ? 'text-cyan-100/95' : 'text-intuition-primary/90'} ${preset.label}`}
            style={{ letterSpacing: '0.18em' }}
          >
            IntuRank XP
          </p>
          {typeof rank === 'number' && rank > 0 ? (
            <span
              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[8px] font-mono font-black uppercase tracking-widest ${
                light
                  ? 'border-amber-200 bg-amber-100 text-amber-900'
                  : 'border-amber-400/45 bg-amber-500/[0.12] text-amber-200'
              }`}
            >
              Rank #{rank}
            </span>
          ) : null}
        </div>
        <p
          className={`font-display font-black tabular-nums tracking-tight leading-none mt-1 ${light ? 'text-slate-900' : hud ? 'text-white drop-shadow-[0_0_20px_rgba(34,211,238,0.45)]' : 'text-white'} ${preset.total}`}
        >
          <AnimatedXpFigure ready={!loading} value={total} />
        </p>
        {showBreakdown ? (
          <motion.p
            className={`font-mono font-semibold mt-1.5 ${light ? 'text-slate-600' : 'text-slate-400'} ${preset.breakdown}`}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.32, delay: 0.04, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <span className={light ? 'text-sky-700' : 'text-intuition-primary/85'}>
              Arena {arenaXp.toLocaleString()}
            </span>
            <span className="text-slate-600 mx-1.5">·</span>
            <span className={light ? 'text-amber-700' : 'text-amber-300/85'}>
              Activity {activityXp.toLocaleString()}
            </span>
          </motion.p>
        ) : null}
      </div>
    </motion.div>
  );
};

export default IntuRankXpBadge;
