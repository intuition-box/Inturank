import React, { useMemo } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ARENA_CARD_SURFACE, deckPalette } from '../../services/arenaCardDesign';

type Props = {
  /** Drives deck color theming. */
  listCategory?: string;
  /** Count of pool members that will be anchored at submit time. */
  memberCount: number;
};

/**
 * Informational banner shown above Curate / Rank / Compare when the active
 * contest is off-chain. It tells the player the contest will mint on-chain
 * at the END of the flow (Compare → Submit) — no upfront cost, no separate
 * tx prompt. The actual mint is orchestrated by the commit coordinator at
 * Compare in one wallet sign.
 */
export const ArenaPromoteBanner: React.FC<Props> = ({ listCategory, memberCount }) => {
  const palette = useMemo(() => deckPalette(listCategory), [listCategory]);
  return (
    <div
      className="relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"
      style={{
        background: ARENA_CARD_SURFACE.bodyBg,
        borderColor: palette.line,
      }}
      role="region"
      aria-label="Contest mints on submit"
    >
      <span
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: palette.hex }}
        aria-hidden
      />

      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: palette.soft, color: palette.hex }}
        aria-hidden
      >
        <Sparkles className="h-5 w-5" strokeWidth={2.2} />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className="font-mono text-[9px] font-black uppercase tracking-[0.22em]"
          style={{ color: palette.hex }}
        >
          Off-chain contest
        </p>
        <p className="mt-1 text-[13px] leading-snug text-slate-200">
          This list isn’t anchored on Intuition yet — we’ll mint it at the end of the flow when you submit.
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Plays write {memberCount} membership triple{memberCount === 1 ? '' : 's'} + the list atom in one
          wallet sign — no upfront cost for browsing.
        </p>
      </div>

      <span
        className="hidden items-center gap-1.5 self-center rounded-md border px-2.5 py-1.5 font-mono text-[9px] font-black uppercase tracking-[0.18em] sm:inline-flex"
        style={{ borderColor: palette.line, background: palette.soft, color: palette.hex }}
      >
        Queued for submit
        <ArrowRight size={11} strokeWidth={2.6} aria-hidden />
      </span>
    </div>
  );
};
