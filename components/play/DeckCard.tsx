/**
 * DeckCard — the draggable claim card. Artboard 1d before the call, 2a/2b after it.
 *
 * The physics is the product, so it follows the handoff spec exactly:
 *   1:1 tracking out to 125px, rubber-band beyond it, commit at 118px OR a flick.
 *
 * Everything is transform and opacity — drag, rotation, the badge fades, the flood. The
 * reveal is deliberately a COLOUR SWAP OVER IDENTICAL GEOMETRY: the card does not resize or
 * move when it flips to the answer, so the eye stays locked on the number instead of
 * re-finding the card.
 */
import React from 'react';
import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'framer-motion';
import type { PlayCard, Call } from '../../services/playDeck';
import { spring, ease } from '../../services/motion';

/** 1:1 tracking stops here; past it the drag rubber-bands. */
const TRACK = 125;
/** Past this on release the call commits. */
const COMMIT = 118;
/** A fast flick commits regardless of distance — the gesture people actually use. */
const FLICK_VELOCITY = 480;

interface Props {
  card: PlayCard;
  /** Set once the call is made; drives the flood. */
  result?: { call: Call; agreed: boolean | null } | null;
  onCall: (call: Call) => void;
  /** Depth in the stack: 0 is live, 1 and 2 sit behind it. */
  depth?: number;
  interactive?: boolean;
}

export const DeckCard: React.FC<Props> = ({ card, result, onCall, depth = 0, interactive = true }) => {
  const x = useMotionValue(0);

  // Rotation and badge opacity are pure functions of x — no state, no re-render per frame.
  const rotate = useTransform(x, [-TRACK, 0, TRACK], [-7, 0, 7]);
  const trueOpacity = useTransform(x, [30, COMMIT], [0, 1]);
  const nopeOpacity = useTransform(x, [-COMMIT, -30], [1, 0]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const past = Math.abs(info.offset.x) >= COMMIT;
    const flicked = Math.abs(info.velocity.x) >= FLICK_VELOCITY;
    if (!past && !flicked) {
      // Snap home with weight, not a linear slide.
      void animate(x, 0, spring.card);
      return;
    }
    const call: Call = info.offset.x > 0 ? 'true' : 'nope';
    // Carry the card off in the direction it was thrown before the reveal takes over.
    void animate(x, info.offset.x > 0 ? 520 : -520, { duration: 0.22, ease: ease.snap });
    onCall(call);
  };

  const revealed = !!result;
  const agreed = result?.agreed;

  return (
    <motion.div
      drag={interactive && !revealed ? 'x' : false}
      dragConstraints={{ left: -TRACK, right: TRACK }}
      /** Elastic past the constraint is what produces the rubber-band. */
      dragElastic={0.35}
      dragMomentum={false}
      style={{ x, rotate, zIndex: 10 - depth }}
      onDragEnd={handleDragEnd}
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{
        opacity: 1,
        scale: 1 - depth * 0.04,
        y: depth * 10,
        transition: spring.card,
      }}
      className={`absolute inset-x-0 top-0 mx-auto w-full max-w-[420px] select-none overflow-hidden rounded-3xl border-2 ${
        revealed
          ? agreed === false
            ? 'border-danger bg-danger-flood'
            : 'border-primary-ink bg-primary-flood'
          : 'border-card-edge bg-card'
      }`}
      /* The flood is a background change over identical geometry — no layout shift. */
      transition={{ duration: 0.28, ease: ease.glide }}
    >
      {!revealed ? (
        <>
          <div className="flex items-center justify-between px-4 pt-4">
            <span className="rounded-full border border-ink/25 px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-wider text-ink">
              Call it
            </span>
            <span className="font-display text-[10px] font-black uppercase tracking-wider text-ink/50">
              True or not?
            </span>
          </div>

          <div className="mx-4 mt-3 flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-ink/90">
            {card.image ? (
              <img src={card.image} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <span className="font-display text-5xl font-black text-card">{card.monogram}</span>
            )}
          </div>

          <p className="px-4 pb-5 pt-4 font-display text-[22px] font-black leading-[1.15] tracking-tight text-ink">
            {card.label}
          </p>

          {/* Verdict badges, revealed by the drag itself rather than by a state change. */}
          <motion.span
            style={{ opacity: nopeOpacity }}
            className="pointer-events-none absolute right-5 top-5 -rotate-12 rounded-lg border-2 border-danger px-3 py-1 font-display text-lg font-black uppercase text-danger"
            aria-hidden
          >
            Nope
          </motion.span>
          <motion.span
            style={{ opacity: trueOpacity }}
            className="pointer-events-none absolute left-5 top-5 rotate-12 rounded-lg border-2 border-primary-ink px-3 py-1 font-display text-lg font-black uppercase text-primary-ink"
            aria-hidden
          >
            True
          </motion.span>
        </>
      ) : (
        <div className="flex min-h-[340px] flex-col justify-between p-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-ink/30 px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-wider text-ink">
              You said {result!.call === 'true' ? 'true' : 'nope'}
            </span>
          </div>

          <div>
            <h2 className="font-display text-[34px] font-black uppercase leading-[0.95] tracking-tight text-ink">
              {agreed === null
                ? 'Too few to say'
                : agreed
                  ? 'The money agrees'
                  : 'The money says otherwise'}
            </h2>

            {card.pctYes !== null ? (
              <div className="mt-4 flex items-end gap-2">
                <span className="font-display text-5xl font-black leading-none tracking-tighter text-ink tabular-nums">
                  {Math.round(card.pctYes)}%
                </span>
                <span className="pb-1 text-xs font-semibold leading-tight text-ink/70">
                  of {(card.forTrust + card.againstTrust).toFixed(0)} TRUST
                  <br />
                  says true
                </span>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-snug text-ink/75">
                Only {card.holders} {card.holders === 1 ? 'person has' : 'people have'} staked here, so a
                percentage would be theatre.
              </p>
            )}
          </div>

          <p className="text-[13px] font-semibold leading-snug text-ink/80">{card.label}</p>
        </div>
      )}
    </motion.div>
  );
};

export default DeckCard;
