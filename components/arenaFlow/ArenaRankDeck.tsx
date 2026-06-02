import React, { useCallback, useMemo } from 'react';
import { normalizeWebMediaUrl } from '../../services/mediaUrl';
import { Reorder, motion, useDragControls } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Crown,
  GripVertical,
  Layers,
  Medal,
  Minus,
  PenLine,
  Plus,
  Trash2,
  Sparkles,
  Trophy,
  User as UserIcon,
  Zap,
  Users,
} from 'lucide-react';
import type { RankItem } from '../../pages/RankedList';
import { playArenaRankSlide, playArenaUiClick, playArenaUiHover } from '../../services/audio';
import {
  ARENA_CARD_SURFACE,
  ARENA_SHADOWS,
  deckPalette,
  SWIPE_COLORS,
  type DeckPaletteEntry,
} from '../../services/arenaCardDesign';
import { ArenaContestStepShell } from './ArenaContestStepShell';
import { ArenaPortraitImg } from './ArenaPortraitImg';

type Props = {
  items: RankItem[];
  /** Drives the contest's solid color theme. */
  listCategory?: string;
  stakeBaseLabel: string;
  rankTrustUnits: Record<string, number>;
  onTrustUnitsChange: (itemId: string, units: number) => void;
  reduceMotion?: boolean;
  onReorder: (next: RankItem[]) => void;
  onCompare: () => void;
  /** Primary sidebar CTA label (e.g. off-chain → Publish and compare). */
  compareCtaLabel?: string;
  onCreateCard?: () => void;
  onSignSubmit?: () => void;
  signDisabled?: boolean;
  queuedStanceCount?: number;
  /** Remove a pick from this deck during ranking (drops batch row + resets curate stance for that card). */
  onRemoveItem?: (itemId: string) => void;
  /** Prominent contest name for shared-link / orientation context. */
  listTitle?: string;
  /** Cards in the loaded pool (possible picks on this list). */
  poolParticipantCount?: number;
  /** Approx. distinct wallets with rank activity on portal lists — optional. */
  listStakersCount?: number | null;
  listStakersLoading?: boolean;
  /** Count of reorder / stake refinements this session (XP accrues on submit). */
  deckEngagementTuneCount?: number;
};

const UNITS_MIN = 1;
const UNITS_MAX = 12;

function parseBase(label: string): number {
  const n = parseFloat(String(label).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatTrust(base: number, units: number): string {
  if (base <= 0 || units < UNITS_MIN) return '—';
  const t = base * units;
  if (t >= 100) return `${Math.round(t)}`;
  const rounded = Math.round(t * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

function rawTrustAmt(base: number, units: number): number {
  if (base <= 0 || units < UNITS_MIN) return 0;
  return base * units;
}

/* ---------------- Podium tier (top 3) coloring ---------------- */

type RankTier = {
  bg: string;
  text: string;
  glow: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  label: string;
};

function rankTier(idx: number): RankTier {
  if (idx === 0) {
    return {
      bg: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
      text: '#1a120a',
      glow: '0 12px 28px rgba(245,158,11,0.35)',
      Icon: Crown,
      label: 'Top pick',
    };
  }
  if (idx === 1) {
    return {
      bg: 'linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)',
      text: '#0a0c12',
      glow: '0 10px 24px rgba(203,213,225,0.22)',
      Icon: Medal,
      label: 'Silver',
    };
  }
  if (idx === 2) {
    return {
      bg: 'linear-gradient(180deg, #fb923c 0%, #ea580c 100%)',
      text: '#1a0f0a',
      glow: '0 10px 24px rgba(234,88,12,0.25)',
      Icon: Medal,
      label: 'Bronze',
    };
  }
  return {
    bg: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
    text: '#e2e8f0',
    glow: 'none',
    Icon: Layers,
    label: '',
  };
}

/* ============================== Row Card ============================== */

type RowProps = {
  it: RankItem;
  idx: number;
  total: number;
  base: number;
  u: number;
  deck: DeckPaletteEntry;
  reduceMotion: boolean;
  onMove: (dir: -1 | 1) => void;
  onTrustUnitsChange: (units: number) => void;
  onRemove?: () => void;
};

const RankRow: React.FC<RowProps> = ({
  it,
  idx,
  total,
  base,
  u,
  deck,
  reduceMotion,
  onMove,
  onTrustUnitsChange,
  onRemove,
}) => {
  const dragControls = useDragControls();
  const trustAmt = formatTrust(base, u);
  const tier = rankTier(idx);
  const isPodium = idx <= 2;

  return (
    <Reorder.Item
      value={it}
      drag={reduceMotion ? false : 'y'}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      className="group relative overflow-hidden rounded-2xl border select-none"
      style={{
        background: ARENA_CARD_SURFACE.bodyBg,
        borderColor: ARENA_CARD_SURFACE.edgeMuted,
        boxShadow: ARENA_SHADOWS.cardResting,
        /**
         * Explicit `pan-x` lets users still horizontally scroll the page on
         * touch devices while reserving Y gestures for our drag controls.
         * Framer-motion sets this by default but stating it defensively
         * prevents nested touch handlers from overriding.
         */
        touchAction: 'pan-x',
      }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileDrag={
        reduceMotion ? undefined : { scale: 1.015, zIndex: 25, cursor: 'grabbing', boxShadow: ARENA_SHADOWS.cardLifted }
      }
      transition={{ type: 'spring', stiffness: 480, damping: 30 }}
      layout
    >
      {/* deck-color top hairline */}
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: deck.hex }} aria-hidden />

      <div className="flex items-stretch">
        {/* ── Rank column (podium-tier filled) ────────────────────── */}
        <div
          className="relative flex w-[64px] shrink-0 flex-col items-center justify-center gap-1.5 px-2 py-5 sm:w-[100px] sm:px-3 md:w-[112px]"
          style={{ background: tier.bg, color: tier.text, boxShadow: tier.glow }}
        >
          {isPodium ? <tier.Icon className="h-4 w-4 opacity-90" strokeWidth={2.5} aria-hidden /> : null}
          <span className="font-display text-[2.6rem] font-black tabular-nums leading-none tracking-tight">
            {idx + 1}
          </span>
          {tier.label ? (
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.18em] opacity-85">
              {tier.label}
            </span>
          ) : null}
        </div>

        {/* ── Avatar + name body ──────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-4 sm:gap-4 sm:px-5">
          <div
            className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-[#070a10] sm:h-[96px] sm:w-[96px]"
            style={{ borderColor: deck.line }}
          >
            <CornerTicks color={deck.hex} />
            <ArenaPortraitImg
              src={normalizeWebMediaUrl(it.image)}
              className="h-full w-full object-cover"
              loading="lazy"
              draggable={false}
            >
              <UserIcon className="h-10 w-10 text-slate-700" strokeWidth={1.3} aria-hidden />
            </ArenaPortraitImg>
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-black uppercase tracking-tight text-white line-clamp-1 sm:text-lg">
              {it.label}
            </p>
            {it.subtitle ? (
              <p className="mt-0.5 text-[12px] text-slate-500 line-clamp-1">{it.subtitle}</p>
            ) : null}
            {/* mobile inline stake summary */}
            <p
              className="mt-1.5 font-mono text-[11px] font-bold tabular-nums sm:hidden"
              style={{ color: deck.hex }}
            >
              {trustAmt} TRUST <span className="text-slate-500">· ×{u}</span>
            </p>
          </div>
        </div>

        {/* ── Stake column ────────────────────────────────────────── */}
        <div className="hidden w-[200px] shrink-0 flex-col justify-center gap-1.5 border-l border-white/[0.05] px-4 py-4 sm:flex">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Stake</span>
            <span className="font-mono text-[10px] tabular-nums text-slate-500">×{u}</span>
          </div>
          <p className="font-mono text-[18px] font-black tabular-nums leading-none" style={{ color: deck.hex }}>
            {trustAmt}
            <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">TRUST</span>
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Less stake"
              disabled={u <= UNITS_MIN}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onTrustUnitsChange(u - 1);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/12 bg-black/30 text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            >
              <Minus size={13} strokeWidth={2.6} />
            </button>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: deck.hex }}
                initial={false}
                animate={{ width: `${(u / UNITS_MAX) * 100}%` }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              />
            </div>
            <button
              type="button"
              aria-label="More stake"
              disabled={u >= UNITS_MAX}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onTrustUnitsChange(u + 1);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-black transition-[filter] hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none"
              style={{ background: deck.hex, color: deck.contrastText }}
            >
              <Plus size={13} strokeWidth={2.6} />
            </button>
          </div>
        </div>

        {/* ── Move chevrons + drag grip ──────────────────────────── */}
        <div className="hidden items-center gap-2 border-l border-white/[0.05] px-3 sm:flex">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              aria-label="Move up"
              disabled={idx <= 0}
              onClick={() => onMove(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-25 disabled:pointer-events-none"
            >
              <ChevronUp size={14} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={idx >= total - 1}
              onClick={() => onMove(1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-25 disabled:pointer-events-none"
            >
              <ChevronDown size={14} strokeWidth={2.6} />
            </button>
          </div>
          {onRemove ? (
            <button
              type="button"
              aria-label="Remove from deck"
              title="Remove from deck"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-intuition-secondary/35 bg-intuition-secondary/[0.08] text-intuition-secondary/95 transition-colors hover:border-intuition-secondary/55 hover:bg-intuition-secondary/15 hover:text-intuition-secondary"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.3} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Drag to reorder"
            title="Drag to reorder"
            onPointerDown={(e) => {
              if (reduceMotion) return;
              /**
               * `preventDefault` stops native browser gestures (text selection,
               * touch scroll) from racing the drag. `touchAction: 'none'` on
               * this handle alone keeps the rest of the card touch-scrollable.
               */
              e.preventDefault();
              dragControls.start(e);
            }}
            style={{ touchAction: 'none' }}
            className="flex h-14 w-9 cursor-grab items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02] text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5" strokeWidth={2.2} aria-hidden />
          </button>
        </div>

        {/* ── Mobile-only grip ───────────────────────────────────── */}
        <div className="flex shrink-0 flex-col items-stretch gap-2 border-l border-white/[0.05] sm:hidden">
          {onRemove ? (
            <button
              type="button"
              aria-label="Remove from deck"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="flex h-10 flex-1 items-center justify-center text-intuition-secondary/95 transition-colors hover:bg-intuition-secondary/10 hover:text-intuition-secondary active:bg-intuition-secondary/15"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.3} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Drag to reorder"
            onPointerDown={(e) => {
              if (reduceMotion) return;
              e.preventDefault();
              dragControls.start(e);
            }}
            style={{ touchAction: 'none' }}
            className="flex min-h-[3rem] flex-1 cursor-grab items-center justify-center text-slate-500 active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5" strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      </div>

      {/* Mobile stake strip */}
      <div className="flex items-center gap-2 border-t border-white/[0.05] bg-black/20 px-3 py-2 sm:hidden">
        <button
          type="button"
          aria-label="Less stake"
          disabled={u <= UNITS_MIN}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onTrustUnitsChange(u - 1);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/12 bg-black/30 text-slate-300 disabled:opacity-30"
        >
          <Minus size={13} strokeWidth={2.6} />
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full"
            style={{ background: deck.hex }}
            initial={false}
            animate={{ width: `${(u / UNITS_MAX) * 100}%` }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          />
        </div>
        <button
          type="button"
          aria-label="More stake"
          disabled={u >= UNITS_MAX}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onTrustUnitsChange(u + 1);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-black disabled:opacity-30"
          style={{ background: deck.hex, color: deck.contrastText }}
        >
          <Plus size={13} strokeWidth={2.6} />
        </button>
      </div>
    </Reorder.Item>
  );
};

/* ============================== Page ============================== */

/**
 * Step 2 · Rank — 2-column composition: vertical leaderboard list on the left,
 * a rich rail (podium summary + stake distribution + action buttons) on the right
 * that fills vertical space regardless of how many cards are in the deck. Drag
 * works on the dedicated grip handle (single Y axis, no grid).
 */
export const ArenaRankDeck: React.FC<Props> = ({
  items,
  listCategory,
  stakeBaseLabel,
  rankTrustUnits,
  onTrustUnitsChange,
  reduceMotion,
  onReorder,
  onCompare,
  compareCtaLabel = 'Compare with others',
  onCreateCard,
  onSignSubmit,
  signDisabled,
  queuedStanceCount = 0,
  onRemoveItem,
  listTitle,
  poolParticipantCount,
  listStakersCount,
  listStakersLoading,
  deckEngagementTuneCount = 0,
}) => {
  const deck = useMemo(() => deckPalette(listCategory), [listCategory]);
  const rm = Boolean(reduceMotion);
  const base = useMemo(() => parseBase(stakeBaseLabel), [stakeBaseLabel]);

  const stakePerItemDeck = useMemo(
    () => items.map((it) => ({ id: it.id, label: it.label, units: rankTrustUnits[it.id] ?? 1 })),
    [items, rankTrustUnits],
  );
  /** Breakdown mirrors stake-weight order (matches main deck after manual edits; drag uses top-heavy presets). */
  const stakePerItemSorted = useMemo(() => {
    const copy = [...stakePerItemDeck];
    copy.sort((a, b) => {
      const ta = rawTrustAmt(base, a.units);
      const tb = rawTrustAmt(base, b.units);
      if (tb !== ta) return tb - ta;
      return String(a.label).localeCompare(String(b.label));
    });
    return copy;
  }, [stakePerItemDeck, base]);
  const totalUnits = useMemo(() => stakePerItemDeck.reduce((s, r) => s + r.units, 0), [stakePerItemDeck]);
  const totalTrustLabel = useMemo(() => formatTrust(base, totalUnits), [base, totalUnits]);

  const notifyReorder = useCallback(
    (next: RankItem[]) => {
      const a = items.map((i) => i.id).join();
      const b = next.map((i) => i.id).join();
      if (a !== b) playArenaRankSlide();
      onReorder(next);
    },
    [items, onReorder],
  );

  const handleMove = useCallback(
    (idx: number, dir: -1 | 1) => {
      const j = idx + dir;
      if (j < 0 || j >= items.length) return;
      const next = [...items];
      const [row] = next.splice(idx, 1);
      next.splice(j, 0, row!);
      notifyReorder(next);
    },
    [items, notifyReorder],
  );

  return (
    <ArenaContestStepShell
      chromeTitle={`Ranking · ${deck.label}`}
      maxWidthClass="max-w-none"
      innerPaddingClassName="px-3 py-5 sm:px-4 sm:py-6 md:px-5 md:py-7 lg:px-6 xl:px-8"
    >
      {/* HEADER */}
      <div className="flex flex-col gap-3">
        <p
          className="font-mono text-[10px] font-black uppercase tracking-[0.32em]"
          style={{ color: deck.hex }}
        >
          Step 2 · Rank · {deck.label}
        </p>
        <h2 className="font-display text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl md:text-[2rem]">
          Order & weight your deck
        </h2>

        {listTitle ? (
          <div
            className="rounded-2xl border px-4 py-3 sm:px-5 sm:py-4"
            style={{
              borderColor: deck.line,
              background: ARENA_CARD_SURFACE.bodyBg,
              boxShadow: ARENA_SHADOWS.cardResting,
            }}
          >
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.28em] text-slate-500">Contest</p>
            <p className="mt-1 font-display text-lg font-black leading-snug tracking-tight text-white sm:text-xl">
              {listTitle}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
              {typeof poolParticipantCount === 'number' ? (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Users className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  Pool · {poolParticipantCount} pick{poolParticipantCount === 1 ? '' : 's'}
                </span>
              ) : null}
              {(listStakersLoading || listStakersCount != null) && (
                <span className="tabular-nums text-slate-500">
                  {listStakersLoading
                    ? 'On-chain rankers …'
                    : listStakersCount != null &&
                        `${listStakersCount.toLocaleString()} wallet${listStakersCount === 1 ? '' : 's'} ranked this portal list (approx.)`}
                </span>
              )}
              {deckEngagementTuneCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-intuition-success/85">
                  <Zap className="h-3.5 w-3.5" aria-hidden />+{deckEngagementTuneCount} deck refinement
                  {deckEngagementTuneCount === 1 ? '' : 's'}
                </span>
              ) : null}
              <span className="text-slate-600">Arena / protocol XP accrues when you submit convictions.</span>
            </div>
          </div>
        ) : null}

        <p className="max-w-2xl text-[13px] leading-relaxed text-slate-400">
          Drag rows to set preference. Stakes{' '}
          <span className="text-slate-200 font-semibold">scale from top down</span>{' '}
          so your #1 line carries more weight. Use <span className="text-slate-200 font-semibold">− / +</span> as an
          advanced override: totals re-sort instantly so the strongest TRUST line crowns #1 and the breakdown chart stays in sync.
        </p>
      </div>

      {/* 2-COLUMN COMPOSITION */}
      <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-7">
        {/* ============================ LEFT COLUMN: CARD LIST ============================ */}
        <div className="min-w-0">
          {items.length < 1 ? (
            <div className="rounded-2xl border-2 border-dashed border-white/12 bg-black/30 px-6 py-16 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-slate-600" strokeWidth={2} aria-hidden />
              <p className="mt-3 font-display text-lg font-bold text-white">Your deck is empty</p>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
                Go back to Curate, agree with a few picks, and they appear here sorted.
              </p>
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={items}
              onReorder={notifyReorder}
              className="flex flex-col gap-3"
              as="ul"
            >
              {items.map((it, idx) => {
                const u = rankTrustUnits[it.id] ?? 1;
                return (
                  <RankRow
                    key={it.id}
                    it={it}
                    idx={idx}
                    total={items.length}
                    base={base}
                    u={u}
                    deck={deck}
                    reduceMotion={rm}
                    onMove={(dir) => handleMove(idx, dir)}
                    onTrustUnitsChange={(units) => onTrustUnitsChange(it.id, units)}
                    onRemove={onRemoveItem ? () => onRemoveItem(it.id) : undefined}
                  />
                );
              })}
            </Reorder.Group>
          )}

          {onCreateCard ? (
            <button
              type="button"
              onClick={() => {
                playArenaUiClick();
                onCreateCard();
              }}
              onMouseEnter={() => playArenaUiHover()}
              className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed py-5 text-slate-400 transition-colors hover:text-white"
              style={{ borderColor: deck.line, background: deck.soft }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full font-black"
                style={{ background: deck.hex, color: deck.contrastText }}
              >
                <Plus className="h-5 w-5" strokeWidth={2.6} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider">Create a new card</span>
              <span className="text-[10px] text-slate-500">· add an item to the list</span>
            </button>
          ) : null}
        </div>

        {/* ============================ RIGHT — RICH RAIL ============================ */}
        <aside className="flex min-w-0 flex-col gap-4">
          {/* 1) DECK SUMMARY */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: deck.line,
              boxShadow: ARENA_SHADOWS.cardResting,
            }}
          >
            <div className="flex items-baseline justify-between">
              <p
                className="font-mono text-[10px] font-black uppercase tracking-[0.22em]"
                style={{ color: deck.hex }}
              >
                Deck summary
              </p>
              <Trophy className="h-4 w-4" style={{ color: deck.hex }} strokeWidth={2.2} aria-hidden />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <SummaryStat label="Cards" value={String(items.length)} accent="#e2e8f0" />
              <SummaryStat label="Total stake" value={`${totalTrustLabel}`} sub="TRUST" accent={deck.hex} />
              <SummaryStat
                label="Top pick"
                value={items[0]?.label ? truncate(items[0].label, 12) : '—'}
                accent="#fbbf24"
              />
              <SummaryStat
                label="Queued"
                value={queuedStanceCount > 0 ? String(queuedStanceCount) : '—'}
                accent={queuedStanceCount > 0 ? '#fb7185' : '#475569'}
              />
            </div>
          </div>

          {/* 2) STAKE DISTRIBUTION */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: ARENA_CARD_SURFACE.edgeMuted,
            }}
          >
            <div className="flex items-baseline justify-between">
              <p
                className="font-mono text-[10px] font-black uppercase tracking-[0.22em]"
                style={{ color: deck.hex }}
              >
                Stake distribution
              </p>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-600">
                {totalUnits} units · strongest first
              </span>
            </div>
            {stakePerItemSorted.length === 0 ? (
              <p className="mt-3 text-[11px] italic text-slate-500">
                Stake breakdown appears as you weight cards.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {stakePerItemSorted.slice(0, 6).map((r) => {
                  const pct = totalUnits === 0 ? 0 : Math.round((r.units / totalUnits) * 100);
                  return (
                    <li key={r.id} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[11px] font-semibold text-slate-200">{r.label}</span>
                        <span className="font-mono text-[10px] font-bold tabular-nums text-slate-500">
                          {formatTrust(base, r.units)}{' '}
                          <span className="text-slate-600">· ×{r.units}</span>{' '}
                          <span className="text-slate-700">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: deck.hex }}
                          initial={false}
                          animate={{ width: `${pct}%` }}
                          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                        />
                      </div>
                    </li>
                  );
                })}
                {stakePerItemSorted.length > 6 ? (
                  <li className="pt-1 text-center font-mono text-[10px] text-slate-600">
                    + {stakePerItemSorted.length - 6} more cards
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          {/* 3) ACTION BUTTONS — primary location, sticky-feeling */}
          <div
            className="flex flex-col gap-2.5 rounded-2xl border p-4"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: ARENA_CARD_SURFACE.edgeMuted,
            }}
          >
            {onSignSubmit ? (
              <button
                type="button"
                disabled={Boolean(signDisabled) || items.length < 1 || queuedStanceCount < 1}
                onClick={() => {
                  playArenaUiClick();
                  onSignSubmit();
                }}
                onMouseEnter={() => playArenaUiHover()}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[0_12px_28px_rgba(0,0,0,0.45)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
                style={{ background: SWIPE_COLORS.no }}
              >
                <PenLine size={14} strokeWidth={2.4} className="opacity-90 shrink-0" />
                Sign rankings
                {queuedStanceCount > 0 ? <span className="tabular-nums opacity-90">({queuedStanceCount})</span> : null}
              </button>
            ) : null}
            <button
              type="button"
              disabled={items.length < 1}
              onClick={() => {
                playArenaUiClick();
                onCompare();
              }}
              onMouseEnter={() => playArenaUiHover()}
              className="group inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[11px] font-black uppercase tracking-[0.14em] shadow-[0_12px_28px_rgba(0,0,0,0.45)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
              style={{ background: deck.hex, color: deck.contrastText }}
            >
              {compareCtaLabel}
              <ArrowRight size={14} strokeWidth={2.6} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-wider text-slate-600">
              Preset · {stakeBaseLabel} TRUST per unit
            </p>
          </div>
        </aside>
      </div>
    </ArenaContestStepShell>
  );
};

/* ============================== Atoms ============================== */

const SummaryStat: React.FC<{ label: string; value: string; sub?: string; accent: string }> = ({
  label,
  value,
  sub,
  accent,
}) => (
  <div
    className="rounded-lg border border-white/[0.06] px-3 py-2.5"
    style={{ background: ARENA_CARD_SURFACE.inset, boxShadow: ARENA_SHADOWS.inset }}
  >
    <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
    <p
      className="mt-1 font-display text-lg font-black tabular-nums leading-none"
      style={{ color: accent }}
    >
      {value}
    </p>
    {sub ? <p className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500">{sub}</p> : null}
  </div>
);

const CornerTicks: React.FC<{ color: string }> = ({ color }) => (
  <>
    <span
      className="absolute left-1 top-1 h-2 w-2"
      style={{ borderLeft: `2px solid ${color}`, borderTop: `2px solid ${color}` }}
      aria-hidden
    />
    <span
      className="absolute right-1 top-1 h-2 w-2"
      style={{ borderRight: `2px solid ${color}`, borderTop: `2px solid ${color}` }}
      aria-hidden
    />
    <span
      className="absolute left-1 bottom-1 h-2 w-2"
      style={{ borderLeft: `2px solid ${color}`, borderBottom: `2px solid ${color}` }}
      aria-hidden
    />
    <span
      className="absolute right-1 bottom-1 h-2 w-2"
      style={{ borderRight: `2px solid ${color}`, borderBottom: `2px solid ${color}` }}
      aria-hidden
    />
  </>
);

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}
