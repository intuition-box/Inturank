import React from 'react';
import { Layers } from 'lucide-react';
import { playArenaUiClick } from '../services/audio';
import { ARENA_THEME } from '../services/arenaUiTheme';

export type ArenaClimbTerraceProps = {
  queuedBatchCount: number;
  onReviewBatch?: () => void;
  /** Light strip for blueprint contest shell */
  surface?: 'dark' | 'light';
};

/**
 * Batch-review strip only when the conviction cart has rows — no generic nav chips
 * (Markets / Stats / Ranked picks live elsewhere).
 */
const ArenaClimbTerrace: React.FC<ArenaClimbTerraceProps> = ({
  queuedBatchCount,
  onReviewBatch,
  surface = 'dark',
}) => {
  if (queuedBatchCount < 1 || !onReviewBatch) return null;
  const light = surface === 'light';

  return (
    <div
      className={`mt-4 rounded-2xl border px-3 py-2.5 ${
        light
          ? 'border-slate-200 bg-white shadow-sm'
          : 'border-white/10 bg-black/50 backdrop-blur-sm ring-1 ring-intuition-warning/15'
      }`}
      style={
        light
          ? undefined
          : { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 24px ${ARENA_THEME.redDim}` }
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={`text-[9px] font-mono font-black uppercase tracking-[0.22em] ${
            light ? 'text-slate-500' : 'text-intuition-warning/50'
          }`}
        >
          Queued stances
        </p>
        <button
          type="button"
          onClick={() => {
            playArenaUiClick();
            onReviewBatch();
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${
            light
              ? 'border-intuition-primary bg-intuition-primary text-intuition-primary hover:border-intuition-primary hover:bg-intuition-primary'
              : 'border-intuition-primary/40 bg-gradient-to-b from-intuition-primary/18 to-black/80 text-intuition-primary hover:border-intuition-warning/45 hover:shadow-[0_0_18px_rgba(248,113,113,0.15)]'
          }`}
        >
          <Layers size={13} strokeWidth={2.2} className={`shrink-0 ${light ? 'text-intuition-primary' : 'text-intuition-primary'}`} aria-hidden />
          Review cart · {queuedBatchCount}
        </button>
      </div>
    </div>
  );
};

export default ArenaClimbTerrace;
