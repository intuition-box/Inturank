import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { playClick, playHover } from '../services/audio';
import { MIN_SIGNAL_STANCE_TRUST } from '../services/signalPendingBatch';

/** Inline editor for queued TRUST on one triple (± step + type-to-set). */
export const SignalStanceTrustControls: React.FC<{
  tripleTermId: string;
  unitsTrust: string;
  onBump: (tripleTermId: string, delta: number) => void;
  onSet: (tripleTermId: string, raw: string) => boolean;
}> = ({ tripleTermId, unitsTrust, onBump, onSet }) => {
  const [draft, setDraft] = useState(unitsTrust);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(unitsTrust);
  }, [unitsTrust, focused]);

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-cyan-500/25 bg-black/50 px-0.5 py-0.5"
      title={`TRUST to stake on submit (min ${MIN_SIGNAL_STANCE_TRUST})`}
    >
      <button
        type="button"
        onClick={() => {
          playClick();
          onBump(tripleTermId, -MIN_SIGNAL_STANCE_TRUST);
        }}
        onMouseEnter={playHover}
        className="inline-flex items-center justify-center rounded-md p-1 text-cyan-200/90 hover:bg-cyan-500/15 border border-transparent hover:border-cyan-500/30"
        aria-label="Decrease TRUST"
      >
        <Minus size={13} strokeWidth={2.4} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (!onSet(tripleTermId, draft)) setDraft(unitsTrust);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-[3.25rem] shrink-0 bg-transparent text-center text-[11px] font-mono font-semibold text-cyan-100 tabular-nums outline-none border-0"
        aria-label="TRUST amount"
      />
      <button
        type="button"
        onClick={() => {
          playClick();
          onBump(tripleTermId, MIN_SIGNAL_STANCE_TRUST);
        }}
        onMouseEnter={playHover}
        className="inline-flex items-center justify-center rounded-md p-1 text-cyan-200/90 hover:bg-cyan-500/15 border border-transparent hover:border-cyan-500/30"
        aria-label="Increase TRUST"
      >
        <Plus size={13} strokeWidth={2.4} />
      </button>
      <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 pr-1 hidden sm:inline">T</span>
    </div>
  );
};
