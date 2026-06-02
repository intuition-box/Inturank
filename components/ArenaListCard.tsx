import React, { useMemo } from 'react';
import { normalizeWebMediaUrl } from '../services/mediaUrl';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight, Star } from 'lucide-react';
import { playArenaUiHover } from '../services/audio';
import { pulseArenaTapOptic } from '../services/arenaTapOptic';
import type { RankItem } from '../pages/RankedList';
import { ARENA_THEME } from '../services/arenaUiTheme';

type Props = {
  title: string;
  description: string;
  tag: string;
  categoryLabel: string;
  constituentCount: number;
  previewItems: RankItem[];
  onSelect: () => void;
  reduceMotion: boolean | null;
  listGlyph?: string;
  /** When set, renders a corner star toggle (Arena favorites). */
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
};

/** Trust-terminal lane row ,  matches Pulse “Hot” cards: amber rim, heat top bar, teal chips, red depth accents. */
const ArenaListCard: React.FC<Props> = ({
  title,
  description,
  tag: _tag,
  categoryLabel,
  constituentCount,
  previewItems,
  onSelect,
  reduceMotion,
  listGlyph,
  isFavorite,
  onFavoriteToggle,
}) => {
  const showStar = Boolean(onFavoriteToggle);

  const tier = useMemo(() => {
    if (constituentCount >= 24)
      return {
        letter: 'S' as const,
        color: ARENA_THEME.goldBright,
        border: `${ARENA_THEME.gold}55`,
        bg: `${ARENA_THEME.gold}14`,
      };
    if (constituentCount >= 12)
      return {
        letter: 'A' as const,
        color: ARENA_THEME.cyanMuted,
        border: `${ARENA_THEME.cyan}44`,
        bg: `${ARENA_THEME.cyan}12`,
      };
    return {
      letter: 'B' as const,
      color: '#94a3b8',
      border: 'rgba(148,163,184,0.38)',
      bg: 'rgba(148,163,184,0.08)',
    };
  }, [constituentCount]);

  const depthPct = useMemo(
    () => 48 + ((title.length * 5 + constituentCount * 11) % 48),
    [title, constituentCount],
  );

  return (
    <article className="group/card relative min-w-0 w-full rounded-2xl border border-intuition-warning/55 bg-zinc-950/95 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[border-color,box-shadow] duration-300 hover:border-intuition-warning/70 hover:shadow-[0_0_30px_rgba(232,197,71,0.2),0_0_42px_rgba(248,113,113,0.12)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] opacity-95 group-hover/card:opacity-100 transition-opacity rounded-t-2xl bg-gradient-to-r from-intuition-warning/85 via-intuition-primary/55 via-intuition-primary/45 to-intuition-secondary/55"
        aria-hidden
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"
        style={{
          background: `linear-gradient(180deg, ${ARENA_THEME.gold}, ${ARENA_THEME.redHot}, ${ARENA_THEME.violet}, ${ARENA_THEME.cyan})`,
        }}
      />
      {showStar ? (
        <button
          type="button"
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Remove from starred lists' : 'Star this list'}
          title={isFavorite ? 'Unstar list' : 'Star list'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFavoriteToggle?.();
          }}
          onMouseEnter={playArenaUiHover}
          className={`absolute top-2 right-2 z-30 flex h-8 w-8 items-center justify-center rounded-lg border backdrop-blur-sm transition-colors ${
            isFavorite
              ? 'border-intuition-secondary/55 bg-black/75 text-intuition-secondary hover:bg-intuition-secondary/15'
              : 'border-white/[0.08] bg-black/55 text-slate-500 hover:text-intuition-secondary/95 hover:border-intuition-secondary/35 hover:bg-black/75'
          }`}
        >
          <Star className="h-4 w-4" strokeWidth={2.25} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      ) : null}

      <div className="pointer-events-none absolute top-10 right-3 z-20 flex flex-col items-end gap-0 text-right" aria-hidden>
        <span className="text-[6px] font-mono font-black uppercase tracking-[0.22em] text-slate-600">Trust class</span>
        <span
          className="text-[17px] font-black leading-none tabular-nums drop-shadow-sm"
          style={{
            color: tier.color,
            filter: tier.letter === 'S' ? `drop-shadow(0 0 10px ${ARENA_THEME.gold}66)` : undefined,
          }}
        >
          {tier.letter}
        </span>
      </div>

      <motion.button
        type="button"
        onClick={() => {
          pulseArenaTapOptic();
          onSelect();
        }}
        onMouseEnter={playArenaUiHover}
        whileHover={reduceMotion ? undefined : { x: 2 }}
        whileTap={reduceMotion ? undefined : { scale: 0.992 }}
        transition={{ type: 'spring', stiffness: 460, damping: 36 }}
        className="group relative flex flex-row items-stretch gap-3 sm:gap-3.5 text-left w-full min-w-0 py-3 pl-3.5 pr-[3.25rem] sm:pr-14 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38e8ff]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060607]"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-500"
          style={{
            background: `radial-gradient(ellipse 90% 70% at 0% 40%, ${ARENA_THEME.gold}16, transparent 58%), radial-gradient(ellipse 70% 50% at 100% 80%, ${ARENA_THEME.cyan}10, transparent 55%), radial-gradient(ellipse 55% 45% at 80% 20%, ${ARENA_THEME.redDim}, transparent 50%)`,
          }}
        />

        <div
          className="relative z-10 shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl shadow-inner border transition-all duration-300 group-hover/card:shadow-[0_0_22px_rgba(251,191,36,0.25)]"
          style={{
            background: `linear-gradient(145deg, rgba(10,10,12,0.95), rgba(6,7,10,0.98))`,
            borderColor: `${ARENA_THEME.gold}44`,
            color: ARENA_THEME.goldBright,
          }}
        >
          {listGlyph ? (
            <span className="font-black leading-none select-none drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]" aria-hidden>
              {listGlyph}
            </span>
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-[#7af0ff] transition-colors" />
          )}
        </div>

        <div className="relative z-10 min-w-0 flex-1 flex flex-col justify-center gap-1 py-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              className="inline-flex items-center text-[8px] font-mono font-black uppercase tracking-[0.14em] px-2 py-0.5 rounded-md border"
              style={{
                color: ARENA_THEME.cyanMuted,
                borderColor: `${ARENA_THEME.cyan}40`,
                background: `${ARENA_THEME.cyan}10`,
              }}
            >
              {categoryLabel}
            </span>
          </div>
          <h3 className="text-[13px] sm:text-sm font-bold text-white leading-snug line-clamp-2 group-hover/card:text-[#fefce8] transition-colors tracking-tight">
            {title}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-slate-500 leading-snug line-clamp-2">{description}</p>
          <div className="grid grid-cols-2 gap-2 mt-1.5 w-full max-w-[min(100%,240px)]">
            <div className="rounded-lg border-2 border-slate-900 bg-[#0a0a0a] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[7px] font-mono font-black uppercase tracking-[0.16em] text-slate-600">Items</p>
              <p className="text-[13px] font-black tabular-nums text-white leading-tight mt-0.5">{constituentCount}</p>
            </div>
            <div className="rounded-lg border-2 border-slate-900 bg-[#0a0a0a] px-2 py-1.5 min-w-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[7px] font-mono font-black uppercase tracking-[0.16em] text-slate-600">Lane</p>
              <p className="text-[11px] font-bold text-[#7af0ff]/95 truncate leading-tight mt-0.5">{categoryLabel}</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 shrink-0 flex flex-col items-end justify-center gap-2 pl-1">
          <div className="flex flex-row-reverse items-center gap-0">
            {previewItems.slice(0, 4).map((it, i) => (
              <div
                key={`${it.id}-${i}`}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-md border-2 flex items-center justify-center overflow-hidden text-[8px] font-bold text-slate-400 -mr-1.5 first:mr-0 shadow-sm"
                style={{ borderColor: '#0c0e12', background: 'rgba(30,32,38,0.95)', zIndex: 5 - i }}
              >
                {it.image ? (
                  <img src={normalizeWebMediaUrl(it.image)} className="w-full h-full object-cover" alt="" />
                ) : (
                  (it.label || '?').charAt(0).toUpperCase()
                )}
              </div>
            ))}
            {constituentCount > 4 ? (
              <div
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-md border-2 flex items-center justify-center text-[8px] font-black -mr-1.5 shadow-sm z-[6]"
                style={{
                  borderColor: `${ARENA_THEME.gold}44`,
                  background: 'rgba(8,10,14,0.96)',
                  color: ARENA_THEME.goldBright,
                }}
              >
                +{Math.min(constituentCount - 4, 99)}
              </div>
            ) : null}
          </div>
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors group-hover/card:border-intuition-secondary/40"
            style={{
              borderColor: `${ARENA_THEME.gold}35`,
              background: 'rgba(255,255,255,0.04)',
              color: ARENA_THEME.cyan,
            }}
          >
            <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
          </span>
        </div>
      </motion.button>

      <div className="px-3.5 pb-2.5 pt-2 border-t border-slate-900/80 bg-black/35">
        <div className="flex justify-between items-center gap-2 mb-1">
          <span className="text-[7px] font-mono font-black uppercase tracking-[0.14em]" style={{ color: ARENA_THEME.cyanMuted }}>
            Depth signal
          </span>
          <span className="text-[7px] font-mono text-slate-600 tabular-nums">{depthPct}% pool</span>
        </div>
        <div className="h-1 rounded-full bg-slate-900 overflow-hidden ring-1 ring-white/[0.04]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${depthPct}%`,
              background: `linear-gradient(90deg, ${ARENA_THEME.cyan}, ${ARENA_THEME.gold}, ${ARENA_THEME.red})`,
            }}
          />
        </div>
      </div>
    </article>
  );
};

export default ArenaListCard;
