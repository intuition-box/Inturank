import React from 'react';
import { Link } from 'react-router-dom';
import { Hexagon, ListTree, Trophy, Zap, LayoutGrid } from 'lucide-react';
import { AnimatedXpFigure } from './AnimatedXpFigure';
import { playArenaUiClick, playArenaUiHover } from '../services/audio';
import { ARENA_THEME } from '../services/arenaUiTheme';

/** Lane summary when browsing — rounded shell only (no slants). */
export const ArenaBrowseLaneHud: React.FC<{ laneLabel: string; listCount: number }> = ({
  laneLabel,
  listCount,
}) => (
  <div className="rounded-3xl border border-white/[0.08] bg-black/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
    <p className="text-[8px] font-mono font-black uppercase tracking-[0.28em] text-[#38e8ff]/85 mb-1">
      Lane �/ browse
    </p>
    <p className="text-[13px] font-bold text-white truncate leading-tight">{laneLabel}</p>
    <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-2">
      {listCount} list{listCount === 1 ? '' : 's'} indexed
    </p>
  </div>
);

type SessionStripProps = {
  duels: number;
  streak: number;
  xpTotal: number;
  /** False until Arena graph XP has been fetched once for this session (matches header badge). */
  xpTotalReady: boolean;
  connected: boolean;
};

/** Lifetime IntuRank ranks for the connected wallet — header HUD handles per-run counters during an active list. */
export const ArenaSidebarSessionStrip: React.FC<SessionStripProps> = ({
  duels,
  streak,
  xpTotal,
  xpTotalReady,
  connected,
}) => {
  const progressToMilestone = duels % 5;
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-black/45 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="px-4 pt-3 pb-2.5 border-b border-white/[0.06]">
        <p className="text-[8px] font-mono font-black uppercase tracking-[0.26em] text-slate-500">
          Through IntuRank
        </p>
        <p className="text-[12px] font-bold text-slate-100 mt-0.5">Your wallet</p>
      </div>
      <div className="grid grid-cols-3 gap-px bg-white/[0.05]">
        {[
          { k: 'Ranks', v: String(duels), accent: 'text-white', kind: 'plain' as const },
          { k: 'Streak', v: String(streak), accent: 'text-[#fcd34d]', kind: 'plain' as const },
          { k: 'XP', v: '', accent: 'text-[#fde68a]', kind: 'xp' as const },
        ].map((cell) => (
          <div key={cell.k} className="bg-[#070708] px-2 py-3 text-center">
            <p className="text-[8px] font-mono uppercase tracking-wider text-slate-600">{cell.k}</p>
            <p className={`text-[15px] font-black mt-1 ${cell.accent} tabular-nums`}>
              {cell.kind === 'xp' ? (
                <AnimatedXpFigure
                  ready={connected && xpTotalReady}
                  value={xpTotal}
                  className="justify-center w-full font-black"
                />
              ) : (
                cell.v
              )}
            </p>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 bg-black/30 border-t border-white/[0.05]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[8px] font-mono uppercase tracking-wider text-slate-600">
            Next milestone
          </span>
          <span className="text-[9px] font-mono tabular-nums text-slate-500">{progressToMilestone}/5</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden ring-1 ring-white/[0.05]">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${(progressToMilestone / 5) * 100}%`,
              background: `linear-gradient(90deg, ${ARENA_THEME.cyan}, ${ARENA_THEME.gold})`,
            }}
          />
        </div>
        <Link
          to="/documentation#activity-xp"
          onClick={playArenaUiClick}
          onMouseEnter={playArenaUiHover}
          className="mt-2 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-intuition-primary transition-colors"
        >
          How XP works →
        </Link>
      </div>
    </div>
  );
};

type DeckProps = {
  flagshipListId: string;
};

const deckInner =
  'group flex items-center gap-3 min-w-0 rounded-2xl bg-black/55 border border-white/[0.07] px-3.5 py-3 text-left transition-colors hover:border-[#38e8ff]/35 hover:bg-white/[0.04]';

/** Quick navigation — full rounded tiles; shown while browsing only (terrace covers shortcuts in-run). */
export const ArenaSidebarDeck: React.FC<DeckProps> = ({ flagshipListId }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-2 px-1">
      <p className="text-[8px] font-mono font-black uppercase tracking-[0.26em] text-slate-500">
        Trade floor
      </p>
      <LayoutGrid className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Link
        to="/markets/atoms"
        onClick={playArenaUiClick}
        onMouseEnter={playArenaUiHover}
        className={deckInner}
      >
        <Hexagon className="w-4 h-4 text-[#38e8ff]/90 shrink-0" strokeWidth={2.2} aria-hidden />
        <span className="min-w-0">
          <span className="block text-[9px] font-mono font-black uppercase tracking-wider text-slate-500">
            Markets
          </span>
          <span className="block text-[12px] font-bold text-slate-100 truncate">Identities</span>
        </span>
      </Link>
      <Link
        to="/markets/lists"
        onClick={playArenaUiClick}
        onMouseEnter={playArenaUiHover}
        className={deckInner}
      >
        <ListTree className="w-4 h-4 text-[#38e8ff]/90 shrink-0" strokeWidth={2.2} aria-hidden />
        <span className="min-w-0">
          <span className="block text-[9px] font-mono font-black uppercase tracking-wider text-slate-500">
            Markets
          </span>
          <span className="block text-[12px] font-bold text-slate-100 truncate">Lists</span>
        </span>
      </Link>
      <Link
        to="/stats?tab=rankers"
        onClick={playArenaUiClick}
        onMouseEnter={playArenaUiHover}
        className={deckInner}
      >
        <Trophy className="w-4 h-4 text-intuition-warning/90 shrink-0" strokeWidth={2.2} aria-hidden />
        <span className="min-w-0">
          <span className="block text-[9px] font-mono font-black uppercase tracking-wider text-slate-500">
            Ladder
          </span>
          <span className="block text-[12px] font-bold text-slate-100 truncate">Full stats</span>
        </span>
      </Link>
      <Link
        to={`/climb?list=${flagshipListId}`}
        onClick={playArenaUiClick}
        onMouseEnter={playArenaUiHover}
        className={`${deckInner} ring-1 ring-intuition-warning/20`}
      >
        <Zap className="w-4 h-4 text-intuition-warning shrink-0" strokeWidth={2.2} aria-hidden />
        <span className="min-w-0">
          <span className="block text-[9px] font-mono font-black uppercase tracking-wider text-intuition-warning/85">
            Flagship
          </span>
          <span className="block text-[12px] font-bold text-white truncate">Jump in list</span>
        </span>
      </Link>
    </div>
  </div>
);

export const ArenaSidebarBrowseFoot: React.FC = () => (
  <div className="rounded-3xl border border-dashed border-white/[0.07] bg-black/25 px-4 py-3.5 mt-auto">
    <p className="text-[11px] text-slate-600 leading-relaxed text-center">
      Star lists to pin them here while you filter lanes.
    </p>
  </div>
);
