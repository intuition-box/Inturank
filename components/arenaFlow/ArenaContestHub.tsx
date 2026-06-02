import React, { memo, useEffect, useState } from 'react';
import { normalizeWebMediaUrl } from '../../services/mediaUrl';
import { Link } from 'react-router-dom';
import { Dices, Plus, Play, Sparkles, Flame, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Reveal } from '../Reveal';
import {
  getArenaDataSourceFootprint,
  getArenaListConstituents,
  getArenaPreviewItems,
} from '../../services/arenaListsRegistry';
import type { ArenaDataSourceFootprintKind } from '../../services/arenaListsRegistry';
import type { RankItem } from '../../pages/RankedList';
import { playArenaUiClick, playArenaUiHover } from '../../services/audio';
import type { ContestHubSection as ArenaContestHubSection } from '../../services/arenaHubGroups';
import { pluralizeArenaListCount } from '../../services/arenaHubGroups';
import { ARENA_HUB_LANE_PAGE_SIZE } from '../../services/arenaHubPagination';
import { ArenaPortraitImg } from './ArenaPortraitImg';

export type { ArenaContestHubSection };

type Props = {
  sections: ArenaContestHubSection[];
  onSelectList: (id: string) => void;
  reduceMotion?: boolean;
  previewPoolByListId?: Record<string, RankItem[]>;
  /** Live member counts for portal lists (e.g. from `countListMembersForObject`). */
  listConstituentOverrides?: Record<string, number>;
  onRandomContest?: () => void;
  onResumeLast?: () => void;
  /** When set, shows resume control (last played list title). */
  resumeListTitle?: string | null;
  /** Gift box + adoption inbox (Arena homepage chrome). */
  headerExtras?: React.ReactNode;
};

function firstPreviewImage(previews: RankItem[]): string | undefined {
  for (const p of previews) {
    if (p.image) return p.image;
  }
  return undefined;
}

/**
 * Tag → color identity. Static (no animation, no blur). Drives tag pill + Play
 * arrow accent so categories read instantly.
 */
type TagPalette = {
  text: string;
  border: string;
  bg: string;
  /** Hex used for inline Play arrow accent. */
  accent: string;
};

const TAG_PALETTE: Record<string, TagPalette> = {
  heat:        { text: 'text-intuition-warning',   border: 'border-intuition-warning/50',   bg: 'bg-intuition-warning/10',   accent: '#fbbf24' },
  ecosystem:   { text: 'text-intuition-primary',    border: 'border-intuition-primary/45',    bg: 'bg-intuition-primary/10',    accent: '#ff5039' },
  community:   { text: 'text-intuition-success', border: 'border-intuition-success/45', bg: 'bg-intuition-success/10', accent: '#34d399' },
  claims:      { text: 'text-intuition-primary', border: 'border-intuition-primary/45', bg: 'bg-intuition-primary/10', accent: '#e879f9' },
  narratives:  { text: 'text-intuition-primary',  border: 'border-intuition-primary/45',  bg: 'bg-intuition-primary/10',  accent: '#a78bfa' },
  themes:      { text: 'text-intuition-primary',     border: 'border-intuition-primary/45',     bg: 'bg-intuition-primary/10',     accent: '#38bdf8' },
  daily:       { text: 'text-intuition-secondary',    border: 'border-intuition-secondary/45',    bg: 'bg-intuition-secondary/10',    accent: '#fb7185' },
  ict:         { text: 'text-intuition-primary',    border: 'border-intuition-primary/45',    bg: 'bg-intuition-primary/10',    accent: '#ff7038' },
  'signal city': { text: 'text-intuition-primary', border: 'border-intuition-primary/45', bg: 'bg-intuition-primary/10',  accent: '#818cf8' },
};

const FALLBACK_PALETTE: TagPalette = {
  text: 'text-slate-200',
  border: 'border-white/15',
  bg: 'bg-white/[0.04]',
  accent: '#94a3b8',
};

function paletteFor(tag: string): TagPalette {
  return TAG_PALETTE[tag.toLowerCase()] || FALLBACK_PALETTE;
}

function footprintTopRightClasses(kind: ArenaDataSourceFootprintKind): string {
  switch (kind) {
    case 'live_indexer':
      return 'border-intuition-success/45 bg-intuition-success/10 text-intuition-success';
    case 'portal_chain':
      return 'border-intuition-primary/45 bg-intuition-primary/10 text-intuition-primary';
    default:
      return 'border-intuition-warning/45 bg-intuition-warning/10 text-intuition-warning';
  }
}

/** GPU-friendly card hover: translate + shadow (no backdrop-filter). Honors `motion-safe`. */
function contestCardInteractClasses(reducedMotion: boolean, isHot: boolean): string {
  if (reducedMotion) return 'transition-colors duration-150 active:opacity-[0.92]';
  const glow = isHot
    ? 'motion-safe:hover:shadow-[0_14px_38px_-12px_rgba(251,191,36,0.22)]'
    : 'motion-safe:hover:shadow-[0_14px_38px_-12px_rgba(255,80,57,0.14)]';
  return [
    'transition-colors duration-150',
    'motion-safe:transition-[transform,box-shadow] motion-safe:duration-[200ms] motion-safe:ease-out',
    'motion-safe:hover:-translate-y-1 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.985]',
    glow,
  ].join(' ');
}

function heroCtaInteractClasses(reducedMotion: boolean): string {
  if (reducedMotion) return 'transition-colors duration-150';
  return [
    'transition-colors duration-150',
    'motion-safe:transition-[transform,box-shadow,border-color,background-color]',
    'motion-safe:duration-200 motion-safe:ease-out',
    'motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]',
  ].join(' ');
}

function pagerBtnInteractClasses(reducedMotion: boolean): string {
  if (reducedMotion) return 'transition-colors duration-150';
  return [
    'transition-colors duration-150',
    'motion-safe:transition-[transform,border-color,background-color] motion-safe:duration-150',
    'motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0',
  ].join(' ');
}

type LaneProps = {
  sec: ArenaContestHubSection;
  previewPoolByListId?: Record<string, RankItem[]>;
  listConstituentOverrides?: Record<string, number>;
  onSelectList: (id: string) => void;
  /** When true (or user OS pref), skip transform / springy motion. */
  reduceMotion?: boolean;
};

/** Paginated thematic lane row. */
const PaginatedContestLane = memo(function PaginatedContestLane({
  sec,
  previewPoolByListId,
  listConstituentOverrides,
  onSelectList,
  reduceMotion,
}: LaneProps) {
  const [page, setPage] = useState(0);
  const lists = sec.lists;
  const total = lists.length;
  const pageCount = Math.max(1, Math.ceil(total / ARENA_HUB_LANE_PAGE_SIZE));
  const needPaging = total > ARENA_HUB_LANE_PAGE_SIZE;

  useEffect(() => setPage(0), [sec.id]);
  useEffect(() => setPage((p) => Math.min(Math.max(p, 0), pageCount - 1)), [pageCount]);

  const start = page * ARENA_HUB_LANE_PAGE_SIZE;
  const visible = needPaging ? lists.slice(start, start + ARENA_HUB_LANE_PAGE_SIZE) : lists;
  const endIdx = Math.min(start + visible.length, total);
  const rm = !!(reduceMotion ?? false);
  const pagerInteract = pagerBtnInteractClasses(rm);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-3.5 md:gap-4">
        {visible.map((L) => {
          const previews = getArenaPreviewItems(L, previewPoolByListId?.[L.id] ?? []);
          const cover = L.coverImage || firstPreviewImage(previews);
          const glyph = L.listGlyph?.trim() || '◇';
          const palette = paletteFor(L.tag);
          const isHot = L.tag.toLowerCase() === 'heat';
          const footprint = getArenaDataSourceFootprint(L);
          const picks =
            typeof listConstituentOverrides?.[L.id] === 'number'
              ? listConstituentOverrides[L.id]!
              : getArenaListConstituents(L);
          const cardInteract = contestCardInteractClasses(rm, isHot);

          return (
            <button
              key={L.id}
              type="button"
              onClick={() => {
                playArenaUiClick();
                onSelectList(L.id);
              }}
              onMouseEnter={() => playArenaUiHover()}
              className={`group relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-[#0a0d15] text-left shadow-[0_8px_24px_-14px_rgba(0,0,0,0.65)] ${cardInteract} ${
                isHot
                  ? 'border-intuition-warning/35 hover:border-intuition-warning/70'
                  : 'border-white/[0.07] hover:border-white/20'
              }`}
            >
              <div className="relative h-32 w-full overflow-hidden bg-[#0a1620]">
                {cover ? (
                  <ArenaPortraitImg
                    src={cover}
                    loading="lazy"
                    decoding="async"
                    className={`h-full w-full object-cover ${
                      rm
                        ? ''
                        : 'motion-safe:origin-center motion-safe:transition-[transform] motion-safe:duration-[280ms] motion-safe:ease-out motion-safe:group-hover:scale-[1.045]'
                    }`}
                  >
                    <div
                      className={`absolute inset-0 ${
                        rm
                          ? ''
                          : 'motion-safe:origin-center motion-safe:transition-[transform] motion-safe:duration-[280ms] motion-safe:ease-out motion-safe:group-hover:scale-[1.04]'
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${palette.accent}26 0%, rgba(5,10,18,0.95) 55%, rgba(239,68,68,0.08) 100%)`,
                      }}
                    />
                  </ArenaPortraitImg>
                ) : (
                  <div
                    className={`absolute inset-0 ${
                      rm
                        ? ''
                        : 'motion-safe:origin-center motion-safe:transition-[transform] motion-safe:duration-[280ms] motion-safe:ease-out motion-safe:group-hover:scale-[1.04]'
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${palette.accent}26 0%, rgba(5,10,18,0.95) 55%, rgba(239,68,68,0.08) 100%)`,
                    }}
                  />
                )}
                <div
                  className="absolute inset-x-0 bottom-0 h-1/2"
                  style={{
                    background: 'linear-gradient(180deg, transparent 0%, #0a0d15 95%)',
                  }}
                  aria-hidden
                />
                <span
                  className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono font-black uppercase tracking-[0.16em] ${palette.text} ${palette.border} ${palette.bg}`}
                >
                  {isHot ? <Flame className="h-2.5 w-2.5" strokeWidth={2.6} aria-hidden /> : null}
                  {L.tag}
                </span>
                <span
                  className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono font-black uppercase tracking-[0.16em] ${footprintTopRightClasses(
                    footprint.kind
                  )}`}
                  title={footprint.detailLine}
                >
                  {footprint.kind === 'live_indexer' || footprint.kind === 'portal_chain' ? (
                    <span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-90 shadow-[0_0_10px_currentColor]" />
                  ) : null}
                  {footprint.badgeShort}
                </span>
                <span
                  className={`absolute right-2.5 bottom-2.5 flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-lg shadow-sm ${
                    rm
                      ? ''
                      : 'motion-safe:transition-[transform,border-color,background-color] motion-safe:duration-200 motion-safe:group-hover:-rotate-6 motion-safe:group-hover:border-white/30 motion-safe:group-hover:bg-black/72'
                  }`}
                  aria-hidden
                >
                  {glyph}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-3.5 pt-3">
                <p className="font-display text-[14px] sm:text-[15px] font-bold text-white leading-snug line-clamp-2 transition-colors group-hover:text-intuition-primary">
                  {L.title}
                </p>
                <p className="mt-1 flex-1 text-[12px] leading-relaxed text-slate-500 line-clamp-2">{L.description}</p>
                <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {previews.length > 0 ? (
                      <div className="flex -space-x-1.5">
                        {previews.slice(0, 4).map((p, i) => (
                          <span
                            key={p.id || i}
                            className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-[#0a0d15] bg-slate-800 text-[9px] font-bold text-slate-400"
                          >
                            <ArenaPortraitImg
                              src={normalizeWebMediaUrl(p.image)}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            >
                              {(p.label || '?').slice(0, 1).toUpperCase()}
                            </ArenaPortraitImg>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      <span className="tabular-nums text-slate-300">{picks}</span> picks
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] ${
                      rm
                        ? ''
                        : 'motion-safe:transition-[box-shadow] motion-safe:duration-200 motion-safe:group-hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]'
                    }`}
                    style={{
                      color: palette.accent,
                      borderColor: `${palette.accent}40`,
                      background: `${palette.accent}10`,
                    }}
                  >
                    Play
                    <ArrowUpRight
                      className={`h-3 w-3 ${
                        rm
                          ? ''
                          : 'motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-[2px] motion-safe:group-hover:-translate-y-px'
                      }`}
                      strokeWidth={2.6}
                      aria-hidden
                    />
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {needPaging ? (
        <nav
          className="mt-5 flex flex-col items-stretch gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between"
          aria-label={`${sec.title}, pagination`}
        >
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500 sm:text-left">
            Showing{' '}
            <span className="tabular-nums text-slate-300">
              {total === 0 ? 0 : start + 1} to {endIdx}
            </span>{' '}
            of <span className="tabular-nums text-slate-300">{total}</span>
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => {
                playArenaUiClick();
                setPage((p) => Math.max(0, p - 1));
              }}
              onMouseEnter={() => page > 0 && playArenaUiHover()}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${
                page <= 0
                  ? 'cursor-not-allowed border-white/[0.05] bg-transparent text-slate-600 transition-colors duration-150'
                  : `${pagerInteract} border-white/[0.12] bg-white/[0.04] text-slate-200 hover:border-white/25 hover:bg-white/[0.07]`
              }`}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
              Prev
            </button>
            <span className="min-w-[3.75rem] text-center font-mono text-[10px] tabular-nums text-slate-400">
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() => {
                playArenaUiClick();
                setPage((p) => Math.min(pageCount - 1, p + 1));
              }}
              onMouseEnter={() => page < pageCount - 1 && playArenaUiHover()}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${
                page >= pageCount - 1
                  ? 'cursor-not-allowed border-white/[0.05] bg-transparent text-slate-600 transition-colors duration-150'
                  : `${pagerInteract} border-white/[0.12] bg-white/[0.04] text-slate-200 hover:border-white/25 hover:bg-white/[0.07]`
              }`}
            >
              Next
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
            </button>
          </div>
        </nav>
      ) : null}
    </>
  );
});

/**
 * `/climb` browse view. Hero + category sections + poster cards.
 *
 * Hover motion uses short `transform` + `box-shadow` only (GPU-composited). No
 * `backdrop-blur-*`, no always-on animations. `motion-safe:*` respects OS reduce
 * motion; `reduceMotion` prop skips lifts when the app disables effects.
 */
export const ArenaContestHub: React.FC<Props> = ({
  sections,
  onSelectList,
  previewPoolByListId,
  listConstituentOverrides,
  reduceMotion,
  onRandomContest,
  onResumeLast,
  resumeListTitle,
  headerExtras,
}) => {
  const totalGames = sections.reduce((sum, s) => sum + s.lists.length, 0);
  const rm = !!(reduceMotion ?? false);
  const heroInteract = heroCtaInteractClasses(rm);

  return (
    <div className="flex flex-col gap-5 sm:gap-6 min-w-0 pb-2">
      {/* ===== Compact toolbar (was a big duplicate hero — RankedList already
           shows the THE ARENA title above, so this is just the action row + a
           single-line label so users know they're at the contest floor) ===== */}
      <header
        className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#070a12] px-4 py-3 sm:px-5 sm:py-4 ${
          rm
            ? ''
            : 'motion-safe:transition-[box-shadow,border-color] motion-safe:duration-300 motion-safe:hover:border-white/15'
        }`}
        style={{
          backgroundImage:
            'linear-gradient(120deg, rgba(255,80,57,0.05) 0%, rgba(7,8,12,0) 60%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,80,57,0.5) 50%, transparent 100%)' }}
          aria-hidden
        />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-intuition-primary/40 bg-intuition-primary/[0.08] px-2 py-0.5 text-[10px] font-mono font-black uppercase tracking-[0.22em] text-intuition-primary">
              <span className="block h-1.5 w-1.5 rounded-full bg-intuition-primary" />
              Contest floor
            </span>
            <span className="text-slate-600">�/</span>
            <span className="font-mono text-[10px] tabular-nums uppercase tracking-[0.2em] text-slate-500">
              <span className="text-slate-200">{totalGames}</span> games live
            </span>
            <span className="hidden sm:inline text-slate-700">�/</span>
            <span className="hidden sm:inline text-[12px] text-slate-400 truncate">
              Pick a list. Stance, rank, then compare.
            </span>
          </div>

          {/* Action stack — supports optional headerExtras for spotlight CTAs */}
          <div className="flex flex-col items-stretch gap-3 shrink-0 sm:items-end">
            {headerExtras ? (
              <div className="flex flex-wrap items-center justify-end gap-2">{headerExtras}</div>
            ) : null}
            <div className="flex flex-wrap gap-2">
            <Link
              to="/"
              state={{ scrollArenaContests: true, showArenaCreateGameToast: true }}
              onClick={() => playArenaUiClick()}
              onMouseEnter={() => playArenaUiHover()}
              className={`group inline-flex items-center gap-2 rounded-lg border border-intuition-danger/55 bg-gradient-to-br from-intuition-danger/20 to-intuition-danger/8 px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-white hover:from-intuition-danger/30 hover:to-intuition-danger/12 ${heroInteract} ${
                rm ? '' : 'motion-safe:hover:shadow-[0_0_26px_-4px_rgba(239,68,68,0.35)]'
              }`}
            >
              <Plus
                className={`h-4 w-4 shrink-0 ${rm ? '' : 'motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:scale-110'}`}
                strokeWidth={2.6}
                aria-hidden
              />
              Create list
            </Link>

            {typeof onRandomContest === 'function' ? (
              <button
                type="button"
                onClick={() => {
                  playArenaUiClick();
                  onRandomContest();
                }}
                onMouseEnter={() => playArenaUiHover()}
                className={`group inline-flex items-center gap-2 rounded-lg border border-intuition-primary/40 bg-intuition-primary/10 px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-intuition-primary hover:bg-intuition-primary/18 ${heroInteract} ${
                  rm ? '' : 'motion-safe:hover:shadow-[0_0_22px_-6px_rgba(255,80,57,0.28)]'
                }`}
              >
                <Dices
                  className={`h-4 w-4 shrink-0 ${rm ? '' : 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:rotate-[-14deg]'}`}
                  strokeWidth={2.3}
                  aria-hidden
                />
                Random
              </button>
            ) : null}

            {resumeListTitle && typeof onResumeLast === 'function' ? (
              <button
                type="button"
                onClick={() => {
                  playArenaUiClick();
                  onResumeLast();
                }}
                onMouseEnter={() => playArenaUiHover()}
                title={`Resume “${resumeListTitle}”`}
                className={`group inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-200 hover:border-intuition-primary/35 hover:bg-white/[0.08] ${heroInteract}`}
              >
                <Play
                  className={`h-3.5 w-3.5 shrink-0 text-intuition-primary ${rm ? '' : 'motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:scale-110'}`}
                  strokeWidth={2.5}
                  aria-hidden
                />
                Resume
                <span className="hidden md:inline max-w-[10rem] truncate text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                  {resumeListTitle}
                </span>
              </button>
            ) : null}

            <Link
              to="/climb?view=explorer"
              onClick={() => playArenaUiClick()}
              onMouseEnter={() => playArenaUiHover()}
              className={`group inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3.5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400 hover:border-slate-500/40 hover:text-slate-200 ${heroInteract}`}
            >
              <Sparkles
                className={`h-3.5 w-3.5 shrink-0 ${rm ? '' : 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:rotate-12 motion-safe:ease-out'}`}
                strokeWidth={2.2}
                aria-hidden
              />
              Explorer
            </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ===== Sections ===== Wide screens (xl:+) get 2-up; smaller stays
           single column. Reduces vertical scroll by half on wide monitors. */}
      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-2 xl:gap-6 items-start">
      {sections.map((sec, i) => (
        <Reveal
          key={sec.id}
          as="section"
          delay={i * 80}
          aria-label={sec.title}
          className={`min-w-0 rounded-[1.25rem] border border-white/[0.07] bg-[#060912]/80 px-4 py-5 sm:px-5 sm:py-6 ${
            rm
              ? ''
              : 'motion-safe:transition-[box-shadow,border-color] motion-safe:duration-300 motion-safe:hover:border-white/11 motion-safe:hover:shadow-[0_22px_50px_-32px_rgba(255,80,57,0.13)]'
          }`}
          style={{
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), inset 3px 0 0 ${sec.accent}55`,
          }}
        >
          {/* Section header */}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-white/[0.06]">
            <div className="flex gap-3 min-w-0">
              <span
                className="mt-1.5 hidden h-[2.75rem] w-[3px] shrink-0 rounded-full sm:block"
                style={{ background: sec.accent }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: sec.accent }}>
                  {sec.lane} lane
                </p>
                <h2 className="mt-0.5 font-display text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
                  {sec.title}
                </h2>
                <p className="mt-1 max-w-prose text-[12px] sm:text-[13px] leading-relaxed text-slate-500">{sec.subtitle}</p>
                <span className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <span className="tabular-nums text-slate-300">{sec.lists.length}</span>{' '}
                  {pluralizeArenaListCount(sec.lists.length)} in this lane
                </span>
              </div>
            </div>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
              pick �/ curate �/ rank
            </span>
          </div>

          {/* Card grid (paginated when lane is long) */}
          <PaginatedContestLane
            sec={sec}
            previewPoolByListId={previewPoolByListId}
            listConstituentOverrides={listConstituentOverrides}
            onSelectList={onSelectList}
            reduceMotion={reduceMotion}
          />
        </Reveal>
      ))}
      </div>
    </div>
  );
};
