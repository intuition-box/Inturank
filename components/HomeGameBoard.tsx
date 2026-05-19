import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Swords, UserPlus } from 'lucide-react';
import { ARENA_LISTS, getArenaListConstituents, type ArenaListEntry } from '../services/arenaListsRegistry';
import {
  buildContestHubSections,
  pluralizeArenaListCount,
  type ContestHubSection,
} from '../services/arenaHubGroups';
import { ARENA_HUB_LANE_PAGE_SIZE } from '../services/arenaHubPagination';
import { playClick, playHover } from '../services/audio';

/** Short GPU-friendly pager hover — no always-on animations. */
const HOME_PAGER_MOTION =
  'transition-colors duration-150 motion-safe:transition-[transform,border-color,background-color] motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0';

type HomeGameBoardProps = {
  /** Tighter spacing and typography for mobile shell */
  compact?: boolean;
};

function dedupeEntries(entries: ArenaListEntry[]): ArenaListEntry[] {
  const m = new Map<string, ArenaListEntry>();
  for (const e of entries) m.set(e.id, e);
  return [...m.values()];
}

/**
 * One-time reveal: CSS transform + opacity via IntersectionObserver (no animation libraries).
 */
function useRevealOnce(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setOn(true);
          obs.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [on, threshold]);
  return [ref, on] as const;
}

/**
 * Homepage contest rows: tap a card → Arena curate (Step 1).
 */
export const HomeGameBoard: React.FC<HomeGameBoardProps> = ({ compact }) => {
  const sections = React.useMemo(() => buildContestHubSections(dedupeEntries([...ARENA_LISTS])), []);
  const [headRef, headOn] = useRevealOnce(0.15);

  if (sections.length === 0) return null;

  return (
    <section
      id="arena-home-contests"
      aria-label="Ranking games"
      className={`scroll-mt-20 relative mx-auto w-full max-w-[1600px] min-w-0 ${compact ? 'px-3 pb-8' : 'px-4 sm:px-6 lg:px-10 py-16 sm:py-20'}`}
    >
      <div
        ref={headRef}
        className={`mb-8 sm:mb-10 flex flex-col gap-3 transition-[opacity,transform] duration-500 ease-out sm:flex-row sm:items-end sm:justify-between ${
          headOn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
      >
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-[#05070c]/80 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.22em] text-intuition-primary/90">
            <Swords className="h-3.5 w-3.5 text-intuition-primary" strokeWidth={2.5} aria-hidden />
            Contest floor
          </div>
          <h2 className="mt-3 font-display text-2xl font-black tracking-tight text-white sm:text-3xl md:text-4xl">
            Pick a game<span className="text-intuition-primary">.</span>{' '}
            <span className="text-slate-400 font-bold text-lg sm:text-xl md:text-2xl">Curate next.</span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500 leading-relaxed">
            Each card opens the Arena on that list — stack, rank, and (when you want) put conviction on-chain with TRUST.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            playClick();
            document.getElementById('arena-contest-floor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onMouseEnter={() => playHover()}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-intuition-primary/35 bg-intuition-primary/[0.06] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-intuition-primary transition-colors hover:border-intuition-primary/50 hover:bg-intuition-primary/10 sm:self-auto"
        >
          Jump to contests
          <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex flex-col gap-8 sm:gap-9" id="arena-contest-floor">
        {sections.map((sec, si) => (
          <GameRow key={sec.id} section={sec} rowIndex={si} compact={compact} />
        ))}
      </div>
    </section>
  );
};

const GameRow: React.FC<{
  section: ContestHubSection;
  rowIndex: number;
  compact?: boolean;
}> = ({ section, rowIndex, compact }) => {
  const [ref, on] = useRevealOnce(0.08);
  const [page, setPage] = useState(0);
  const lists = section.lists;
  const total = lists.length;
  const pageCount = Math.max(1, Math.ceil(total / ARENA_HUB_LANE_PAGE_SIZE));
  const needPaging = total > ARENA_HUB_LANE_PAGE_SIZE;

  useEffect(() => setPage(0), [section.id]);
  useEffect(() => setPage((p) => Math.min(Math.max(p, 0), pageCount - 1)), [pageCount]);

  const start = page * ARENA_HUB_LANE_PAGE_SIZE;
  const visible = needPaging ? lists.slice(start, start + ARENA_HUB_LANE_PAGE_SIZE) : lists;
  const endIdx = Math.min(start + visible.length, total);

  return (
    <div
      ref={ref}
      className={`rounded-[1.25rem] border border-white/[0.07] bg-[#05070c]/95 p-4 transition-[opacity,transform] duration-500 ease-out sm:p-5 md:p-6 ${
        on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      style={{
        transitionDelay: `${rowIndex * 70}ms`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), inset 3px 0 0 ${section.accent}55`,
      }}
    >
      <div className="mb-4 flex flex-col gap-2 border-b border-white/[0.06] pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 text-center sm:text-left">
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: section.accent }}>
            {section.lane} lane
          </p>
          <h3 className="mt-1 font-display text-lg font-black tracking-tight text-white sm:text-xl">{section.title}</h3>
          <p className="mt-1 max-w-xl text-[12px] text-slate-500 leading-relaxed">{section.subtitle}</p>
        </div>
        <span className="mx-auto shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-slate-300 sm:mx-0">
          ~{section.lists.reduce((s, L) => s + getArenaListConstituents(L), 0).toLocaleString()} pick slots ·{' '}
          <span className="text-slate-500">{section.lists.length}</span> contest{section.lists.length === 1 ? '' : 's'}
        </span>
      </div>
      <div
        className={`grid min-w-0 gap-3 sm:gap-4 ${
          compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
        }`}
      >
        {visible.map((L) => (
          <ContestCard key={L.id} entry={L} compact={compact} />
        ))}
      </div>
      {needPaging ? (
        <nav
          className="mt-5 flex flex-col items-stretch gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between"
          aria-label={`${section.title} — pagination`}
        >
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500 sm:text-left">
            Showing{' '}
            <span className="tabular-nums text-slate-300">
              {total === 0 ? 0 : start + 1}–{endIdx}
            </span>{' '}
            of <span className="tabular-nums text-slate-300">{total}</span>
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 0}
              onClick={() => {
                playClick();
                setPage((p) => Math.max(0, p - 1));
              }}
              onMouseEnter={() => page > 0 && playHover()}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${
                page <= 0
                  ? 'cursor-not-allowed border-white/[0.05] bg-transparent text-slate-600 transition-colors duration-150'
                  : `${HOME_PAGER_MOTION} border-white/[0.12] bg-white/[0.04] text-slate-200 hover:border-intuition-primary/35 hover:bg-white/[0.07]`
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
                playClick();
                setPage((p) => Math.min(pageCount - 1, p + 1));
              }}
              onMouseEnter={() => page < pageCount - 1 && playHover()}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${
                page >= pageCount - 1
                  ? 'cursor-not-allowed border-white/[0.05] bg-transparent text-slate-600 transition-colors duration-150'
                  : `${HOME_PAGER_MOTION} border-white/[0.12] bg-white/[0.04] text-slate-200 hover:border-intuition-primary/35 hover:bg-white/[0.07]`
              }`}
            >
              Next
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
};

const ContestCard: React.FC<{ entry: ArenaListEntry; compact?: boolean }> = ({ entry, compact }) => {
  return (
    <Link
      to={`/climb?list=${encodeURIComponent(entry.id)}`}
      onClick={() => {
        playClick();
        try {
          sessionStorage.setItem('inturank-arena-last-list', entry.id);
        } catch {
          /* ignore */
        }
      }}
      onMouseEnter={() => playHover()}
      className="group relative flex min-h-[5.5rem] flex-col justify-center overflow-hidden rounded-2xl border border-white/[0.1] bg-[#080a10]/95 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_36px_rgba(0,0,0,0.45),0_0_0_1px_rgba(0,243,255,0.06)] transition-colors duration-150 motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-1 motion-safe:hover:border-intuition-primary/35 motion-safe:hover:shadow-[0_16px_44px_-10px_rgba(0,243,255,0.14)] motion-safe:active:translate-y-0 motion-safe:active:scale-[0.985] sm:min-h-[6.25rem] sm:p-5"
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-50 bg-[radial-gradient(120%_90%_at_92%_-8%,rgba(0,243,255,0.11),transparent_52%)] motion-safe:transition-[opacity] motion-safe:duration-300 motion-safe:group-hover:opacity-95"
        aria-hidden
      />
      <p className="relative z-[1] font-mono text-[10px] font-bold uppercase tracking-wider text-intuition-primary/80">
        {entry.tag}
      </p>
      <p
        className={`relative z-[1] mt-1.5 font-display font-bold leading-snug text-white ${
          compact ? 'text-[15px]' : 'text-[15px] sm:text-[17px]'
        }`}
      >
        {entry.title}
      </p>
      <p className="relative z-[1] mt-2 line-clamp-2 text-[11px] text-slate-500">{entry.description}</p>
      <div className="relative z-[1] mt-3 flex items-center justify-between border-t border-white/[0.08] pt-2.5">
        <span className="font-mono text-[10px] font-bold tabular-nums text-slate-500">
          <span className="text-emerald-200/95">{getArenaListConstituents(entry)}</span> pick
          {getArenaListConstituents(entry) === 1 ? '' : 's'}
        </span>
        <span className="inline-flex flex-wrap items-center justify-end gap-1">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.05] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-200">
            <UserPlus className="h-3 w-3 shrink-0 text-intuition-success" strokeWidth={2.6} aria-hidden />
            Join
          </span>
          <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wider text-white/95">
            Play
            <ChevronRight className="h-3.5 w-3.5 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5" strokeWidth={2.5} />
          </span>
        </span>
      </div>
    </Link>
  );
};
