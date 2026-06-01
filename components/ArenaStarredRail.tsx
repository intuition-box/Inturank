import React from 'react';
import { ChevronDown, Star, ChevronRight, X } from 'lucide-react';
import { playArenaUiClick, playArenaUiHover } from '../services/audio';

export type ArenaStarredRow = {
  id: string;
  title: string;
  tag?: string;
  listGlyph?: string;
};

type Props = {
  items: ArenaStarredRow[];
  /** When true, rail shows only the header row. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpen: (id: string) => void;
  onUnstar: (id: string) => void;
  laneLabel: string;
  /** Tighter layout when ranking — keeps stars reachable without eating the main column. */
  compact?: boolean;
};

/**
 * Compact starred lists for the Arena browse sidebar — avoids a full-width card grid in the main column.
 */
const ArenaStarredRail: React.FC<Props> = ({
  items,
  collapsed,
  onToggleCollapsed,
  onOpen,
  onUnstar,
  laneLabel,
  compact,
}) => {
  const listMaxH = compact ? 'min(28vh,220px)' : 'min(52vh,460px)';
  return (
    <div className="rounded-2xl border border-intuition-warning/22 bg-gradient-to-b from-intuition-warning/[0.06] to-[#05080f]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden">
      <button
        type="button"
        onClick={() => {
          playArenaUiClick();
          onToggleCollapsed();
        }}
        onMouseEnter={playArenaUiHover}
        className={`w-full flex items-center gap-2 px-3 text-left hover:bg-white/[0.03] transition-colors border-b border-white/[0.05] ${compact ? 'py-2' : 'py-2.5'}`}
        aria-expanded={!collapsed}
      >
        <Star className="w-3.5 h-3.5 text-intuition-warning shrink-0 fill-intuition-warning/25" strokeWidth={2.2} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-intuition-warning/95 leading-tight">Starred</p>
          <p className="text-[9px] text-slate-500 truncate mt-0.5">{laneLabel}</p>
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-400 tabular-nums shrink-0">{items.length}</span>
        <ChevronDown
          size={16}
          className={`text-slate-500 shrink-0 transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}
          aria-hidden
        />
      </button>

      {!collapsed ? (
        <div
          className="overflow-y-auto overscroll-contain [scrollbar-width:thin]"
          style={{ maxHeight: listMaxH }}
        >
          {items.length === 0 ? (
            <p className="px-3 py-3 text-[10px] text-slate-500 leading-relaxed">
              Tap the star on any list card to pin it here.
            </p>
          ) : (
            <ul className="py-1">
              {items.map((row) => (
                <li key={row.id} className="group flex items-stretch border-b border-white/[0.04] last:border-0">
                  <button
                    type="button"
                    onClick={() => {
                      playArenaUiClick();
                      onOpen(row.id);
                    }}
                    onMouseEnter={playArenaUiHover}
                    className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left hover:bg-intuition-primary/[0.06] transition-colors"
                  >
                    <span className="w-7 h-7 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-[11px] font-black text-intuition-primary/90 shrink-0">
                      {row.listGlyph?.slice(0, 2) ?? '�/'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold text-slate-100 truncate leading-tight">{row.title}</span>
                      {row.tag ? (
                        <span className="text-[9px] text-slate-500 uppercase tracking-wider truncate block">{row.tag}</span>
                      ) : null}
                    </span>
                    <ChevronRight size={14} className="text-slate-600 group-hover:text-intuition-primary/90 shrink-0" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Unstar ${row.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      playArenaUiClick();
                      onUnstar(row.id);
                    }}
                    className="shrink-0 px-2.5 text-slate-600 hover:text-intuition-secondary hover:bg-intuition-secondary/10 transition-colors border-l border-white/[0.04]"
                  >
                    <X size={13} strokeWidth={2.2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default ArenaStarredRail;
