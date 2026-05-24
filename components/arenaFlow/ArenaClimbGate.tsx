import React from 'react';
import { Link } from 'react-router-dom';
import { Dices, Home, Play, Plus, Sparkles } from 'lucide-react';
import { getArenaListById } from '../../services/arenaListsRegistry';
import { ARENA_THEME } from '../../services/arenaUiTheme';
import { playArenaUiClick, playArenaUiHover } from '../../services/audio';

type Props = {
  onRandomContest: () => void;
  onResumeLast: () => void;
};

function readLastListId(): string | null {
  try {
    const id = sessionStorage.getItem('inturank-arena-last-list')?.trim();
    return id && getArenaListById(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Shown on /climb with no ?list= — Arena is play-only; contest catalog lives on Home.
 */
export const ArenaClimbGate: React.FC<Props> = ({ onRandomContest, onResumeLast }) => {
  const lastId = readLastListId();
  const lastList = lastId ? getArenaListById(lastId) : null;

  return (
    <div className="flex flex-col gap-6 sm:gap-8 min-w-0 max-w-lg mx-auto">
      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.1] px-5 py-6 sm:px-7 sm:py-7"
        style={{
          background: ARENA_THEME.signalIntroStrip,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 40px rgba(56,232,255,0.08)',
        }}
      >
        <p className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-cyan-200/90">Arena</p>
        <h2 className="mt-2 text-lg sm:text-xl font-display font-black text-white leading-tight tracking-tight">
          Pick a contest on Home, then play here
        </h2>
        <p className="mt-3 text-[12px] sm:text-[13px] text-slate-400 leading-relaxed">
          The full contest floor is on the homepage. This page stays focused on curate → rank → compare (and your next
          run).
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <Link
          to="/"
          state={{ scrollArenaContests: true }}
          onClick={() => playArenaUiClick()}
          onMouseEnter={() => playArenaUiHover()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/12 py-3 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/18"
        >
          <Home className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.3} aria-hidden />
          Browse contests on Home
        </Link>

        <button
          type="button"
          onClick={() => {
            playArenaUiClick();
            onRandomContest();
          }}
          onMouseEnter={() => playArenaUiHover()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-intuition-primary/35 bg-intuition-primary/[0.08] py-3 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-intuition-primary transition-colors hover:border-intuition-primary/50 hover:bg-intuition-primary/12"
        >
          <Dices className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.3} aria-hidden />
          Random contest
        </button>

        {lastList ? (
          <button
            type="button"
            onClick={() => {
              playArenaUiClick();
              onResumeLast();
            }}
            onMouseEnter={() => playArenaUiHover()}
            className="inline-flex w-full flex-col items-stretch gap-1 rounded-xl border border-white/[0.12] bg-white/[0.04] py-3 px-4 text-left transition-colors hover:border-cyan-400/35 hover:bg-white/[0.06]"
          >
            <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-200">
              <Play className="h-4 w-4 shrink-0 text-cyan-300" strokeWidth={2.3} aria-hidden />
              Resume last
            </span>
            <span className="text-[12px] font-semibold text-white truncate pl-6">{lastList.title}</span>
          </button>
        ) : null}

        <Link
          to="/"
          state={{ scrollArenaContests: true, showArenaCreateGameToast: true }}
          onClick={() => playArenaUiClick()}
          onMouseEnter={() => playArenaUiHover()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] py-3 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-300 transition-colors hover:border-intuition-primary/35 hover:text-white"
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2.3} aria-hidden />
          Create list
        </Link>

        <Link
          to="/climb?view=explorer"
          onClick={() => playArenaUiClick()}
          onMouseEnter={() => playArenaUiHover()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] py-2.5 px-4 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:border-slate-500/40 hover:text-slate-300"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
          Explorer & rankings
        </Link>
      </div>
    </div>
  );
};
