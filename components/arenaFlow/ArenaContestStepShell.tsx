import React, { memo } from 'react';
import { ARENA_THEME } from '../../services/arenaUiTheme';

/** Dark IntuRank / Arena shell for Curate → Rank → Compare (not white blueprint). */
export const ArenaContestStepShell = memo(function ArenaContestStepShell({
  chromeTitle,
  maxWidthClass = 'max-w-3xl',
  innerPaddingClassName = 'p-4 sm:p-6 md:p-8',
  children,
}: {
  chromeTitle: string;
  /** Tailwind max-width / width utilities (`max-w-none w-full` uses parent width). */
  maxWidthClass?: string;
  /** Inner padding around step content — tighten horizontally when using full width. */
  innerPaddingClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative mx-auto w-full ${maxWidthClass} overflow-hidden rounded-2xl border border-white/[0.09]`}
      style={{
        background: ARENA_THEME.runPanelBg,
        boxShadow: ARENA_THEME.shellShadow,
      }}
    >
      <div className="pointer-events-none absolute inset-x-px top-px z-10 h-px rounded-t-[1rem] opacity-95" aria-hidden style={{ background: ARENA_THEME.rimBar }} />
      <div className="relative flex h-9 items-center gap-1.5 border-b border-white/[0.08] bg-black/55 px-3 backdrop-blur-sm">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#ff4070]/85" aria-hidden />
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#00e5ff]/70" aria-hidden />
        <span className="h-2 w-2 shrink-0 rounded-full bg-slate-500/65" aria-hidden />
        <span className="ml-2 truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">{chromeTitle}</span>
      </div>
      <div
        className={`relative ${innerPaddingClassName}`}
        style={{
          background: ARENA_THEME.signalBrowseWell,
          boxShadow: ARENA_THEME.signalBrowseWellShadow,
        }}
      >
        {children}
      </div>
    </div>
  );
});
