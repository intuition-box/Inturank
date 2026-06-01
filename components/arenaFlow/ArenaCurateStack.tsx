import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type { RankItem } from '../../pages/RankedList';
import {
  playArenaCelebrateMini,
  playArenaSwipeAgree,
  playArenaSwipePass,
  playArenaUiClick,
  playArenaUiHover,
} from '../../services/audio';
import {
  ARENA_CARD_SURFACE,
  ARENA_SHADOWS,
  deckPalette,
  SWIPE_COLORS,
  type DeckPaletteEntry,
} from '../../services/arenaCardDesign';
import { ArenaContestStepShell } from './ArenaContestStepShell';
import { ArenaPortraitImg } from './ArenaPortraitImg';

type Props = {
  listTitle: string;
  listGlyph?: string;
  /** Drives the contest's solid color theme (one of the arenaCategory values). */
  listCategory?: string;
  queue: RankItem[];
  pool: RankItem[];
  playerCount: number;
  /** When true, Curate header shows an indeterminate label while graph count loads. */
  playerCountLoading?: boolean;
  agreedYesCount: number;
  topLeaderAddress?: string | null;
  stakingTx: boolean;
  reduceMotion?: boolean;
  onDecide: (item: RankItem, agree: boolean) => void;
  onSkip: () => void;
  onNextToRank: () => void;
};

function communityPlace(pool: RankItem[], item: RankItem): number {
  const i = pool.findIndex((p) => p.id === item.id);
  return i < 0 ? 0 : i + 1;
}

const SWIPE_COMMIT = 72;
const FLY_X = 520;
const RANK_READY_MIN = 3;

/**
 * Step 1 �/ Curate — focused swipe lane: headline + stacked card + deck rail.
 *
 * Architecture notes:
 *  - Each visible card is rendered by `<SwipeCard>` which owns its OWN motion
 *    values (`x`, rotate, stamp opacities). Sharing motion values across mounts
 *    caused the previous "stuck card" bug (new card inherited the outgoing
 *    card's swipe position + AGREE stamp). Scoped values fix this cleanly.
 *  - Decisions fire synchronously via `onDecide`; the outgoing card flies off
 *    via `AnimatePresence` `exit` in parallel — no awaiting the animation.
 *  - Back-deck cards are static absolute-positioned divs (no layout motion).
 */
export const ArenaCurateStack: React.FC<Props> = ({
  listTitle,
  listGlyph,
  listCategory,
  queue,
  pool,
  playerCount,
  playerCountLoading = false,
  agreedYesCount,
  topLeaderAddress: _topLeaderAddress,
  stakingTx,
  reduceMotion,
  onDecide,
  onSkip,
  onNextToRank,
}) => {
  const deck = useMemo(() => deckPalette(listCategory), [listCategory]);
  const top = queue[0];
  const peek = queue.slice(1, 5);

  /** Direction the outgoing card should fly when it exits (1 = right / agree). */
  const [exitDir, setExitDir] = useState<1 | -1>(1);
  const commitLock = useRef(false);

  const place = top ? communityPlace(pool, top) : 0;
  const readyPct = Math.min(100, Math.round((agreedYesCount / RANK_READY_MIN) * 100));
  const seenCount = useMemo(() => pool.length - queue.length, [pool.length, queue.length]);

  /** One-shot celebration when the deck first becomes rank-ready (crosses the minimum). */
  const prevReadyRef = useRef(false);
  const [justReady, setJustReady] = useState(false);
  useEffect(() => {
    const isReady = agreedYesCount >= RANK_READY_MIN;
    const wasReady = prevReadyRef.current;
    prevReadyRef.current = isReady;
    if (isReady && !wasReady) {
      if (!reduceMotion) playArenaCelebrateMini();
      setJustReady(true);
      const t = window.setTimeout(() => setJustReady(false), 900);
      return () => window.clearTimeout(t);
    }
  }, [agreedYesCount, reduceMotion]);

  /** Commit a decision. Resets the lock when the next card mounts. */
  const commit = useCallback(
    (dir: 'left' | 'right') => {
      if (commitLock.current || stakingTx || !top) return;
      commitLock.current = true;
      if (dir === 'right') playArenaSwipeAgree();
      else playArenaSwipePass();
      setExitDir(dir === 'right' ? 1 : -1);
      onDecide(top, dir === 'right');
      // Release lock on next tick — long enough for AnimatePresence to swap.
      setTimeout(() => {
        commitLock.current = false;
      }, 60);
    },
    [stakingTx, top, onDecide],
  );

  const skipLocally = () => {
    if (!top) return;
    onSkip();
  };

  /* ------------------------------ Header ------------------------------ */
  const headerShell = (
    <header className="flex flex-col gap-4 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.26em]" style={{ color: deck.hex }}>
          Curate �/ {deck.label}
        </p>
        <h1 className="mt-2 font-display text-[1.6rem] font-black leading-[1.1] tracking-tight text-white sm:text-[clamp(1.5rem,4vw,2rem)]">
          {listTitle}
        </h1>
        <p className="mt-2 max-w-xl font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
          Pass ← swipe / tap �/ agree → swipe / tap
        </p>
      </div>
      <p className="shrink-0 text-right font-mono text-[11px] leading-relaxed text-slate-500 sm:max-w-[200px] sm:leading-snug">
        <span className="tabular-nums text-slate-300">
          {seenCount + 1}/{pool.length}
        </span>
        <span className="mx-2 text-slate-700">�/</span>
        {playerCountLoading ? '…' : playerCount} playing
        <br className="hidden sm:inline" />
        <span className="sm:ml-0">
          <span className="mx-2 hidden text-slate-700 sm:inline">�/</span>
          <span className="text-intuition-success/85">{agreedYesCount}</span> in deck
        </span>
      </p>
    </header>
  );

  /* ------------------------------ Empty state ------------------------------ */
  if (!top) {
    return (
      <ArenaContestStepShell
        chromeTitle={`Curate �/ ${deck.label}`}
        maxWidthClass="max-w-none"
        innerPaddingClassName="px-3 py-5 sm:px-4 sm:py-6 md:px-5 md:py-7 lg:px-6 xl:px-8"
      >
        {headerShell}

        <div
          className="mx-auto mt-12 max-w-md rounded-2xl border px-7 py-10 text-center"
          style={{
            background: ARENA_CARD_SURFACE.bodyBg,
            borderColor: deck.line,
            boxShadow: '0 24px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: deck.hex }}
          >
            <Sparkles className="h-7 w-7" strokeWidth={2.4} style={{ color: deck.contrastText }} />
          </div>
          <p className="font-display text-2xl font-black tracking-tight text-white">
            You agreed with <span style={{ color: deck.hex }}>{agreedYesCount}</span> cards
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-400">
            {agreedYesCount > 0
              ? 'Drop them in your own order next, then we’ll show who ranks like you.'
              : 'Go back and try more picks. You need at least one card to rank.'}
          </p>
          <SolidButton
            disabled={agreedYesCount < 1}
            onClick={() => {
              playArenaUiClick();
              onNextToRank();
            }}
            deck={deck}
            className="mt-8 w-full"
          >
            Next �/ rank your deck
            <ArrowRight size={16} strokeWidth={2.6} className="transition-transform group-hover:translate-x-0.5" />
          </SolidButton>
        </div>
      </ArenaContestStepShell>
    );
  }

  return (
    <ArenaContestStepShell
      chromeTitle={`Curate �/ ${deck.label}`}
      maxWidthClass="max-w-none"
      innerPaddingClassName="px-3 py-5 sm:px-4 sm:py-6 md:px-5 md:py-7 lg:px-6 xl:px-8"
    >
      {headerShell}

      <div className="mt-8 flex w-full flex-col items-stretch gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-12 xl:gap-16">
        {/* Card + actions — grows with viewport */}
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <div className="relative w-full max-w-[min(500px,94vw)] sm:max-w-[520px] pb-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-[2rem] border border-white/[0.07] bg-gradient-to-b from-intuition-primary/[0.07] via-slate-950/40 to-intuition-primary/[0.06] shadow-[inset_0_0_120px_rgba(0,0,0,0.55)] sm:rounded-[2.1rem]"
            />
            {/* touch-action: pan-y lets the page scroll vertically even when a
                finger starts inside the swipe surface. dragDirectionLock on the
                <motion.article> below ensures horizontal intent is required
                before the X-drag captures the gesture. */}
            <div className="relative h-[540px] w-full sm:h-[560px]" style={{ touchAction: 'pan-y' }}>
            {/* Back-deck cards */}
            {peek.slice(0, 3).map((p, i) => {
              const drift = (i + 1) * 1.05 * (i % 2 === 0 ? -1 : 1);
              const s = 1 - i * 0.028;
              return (
                <div
                  key={p.id}
                  className="pointer-events-none absolute inset-x-0 top-0 mx-auto w-[94%] max-w-[min(480px,92vw)] rounded-[1.35rem] sm:max-w-[500px]"
                  style={{
                    height: 500,
                    background: ARENA_CARD_SURFACE.deckBg,
                    border: `1px solid ${ARENA_CARD_SURFACE.edgeMuted}`,
                    transform: `translate(${i * 4}px, ${(i + 1) * 12}px) rotate(${drift}deg) scale(${s})`,
                    zIndex: 10 - i,
                    boxShadow: ARENA_SHADOWS.cardResting,
                    opacity: 0.55 - i * 0.14,
                  }}
                  aria-hidden
                />
              );
            })}

            <AnimatePresence initial={false} custom={exitDir} mode="popLayout">
              <SwipeCard
                key={top.id}
                item={top}
                deck={deck}
                listGlyph={listGlyph}
                place={place}
                exitDir={exitDir}
                reduceMotion={Boolean(reduceMotion) || stakingTx}
                onCommit={commit}
              />
            </AnimatePresence>
            <div className="pointer-events-none absolute inset-x-1 bottom-0 z-[4] flex justify-between px-2 pb-0.5 sm:inset-x-2">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-intuition-secondary/80 drop-shadow-[0_0_12px_rgba(251,113,133,0.35)]">
                ← Pass
              </span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-intuition-success/80 drop-shadow-[0_0_12px_rgba(52,211,153,0.35)]">
                Agree →
              </span>
            </div>
          </div>
          </div>

          <div className="mt-10 flex w-full max-w-md flex-col items-center gap-6">
            <div className="flex items-center justify-center gap-6 sm:gap-8">
              <CircleAction
                tone="no"
                label="Pass"
                disabled={stakingTx}
                onClick={() => {
                  playArenaUiClick();
                  commit('left');
                }}
              >
                <X className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.6} />
              </CircleAction>

              <button
                type="button"
                disabled={stakingTx}
                onClick={() => {
                  playArenaUiClick();
                  skipLocally();
                }}
                className="rounded-full border border-white/10 bg-black/25 px-8 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 transition-colors hover:border-white/18 hover:text-slate-200 disabled:opacity-40"
              >
                Skip
              </button>

              <CircleAction
                tone="yes"
                label="Agree"
                disabled={stakingTx}
                onClick={() => {
                  playArenaUiClick();
                  commit('right');
                }}
              >
                <Check className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.6} />
              </CircleAction>
            </div>
            <p className="text-center font-mono text-[9px] uppercase tracking-[0.14em] text-slate-700">
              Drag card �/ ← pass �/ agree →
            </p>
          </div>
        </div>

        {/* Deck + queue — slim secondary column */}
        <aside className="mx-auto flex w-full max-w-sm shrink-0 flex-col gap-6 lg:mx-0 lg:w-[300px] xl:w-[320px]">
          <div
            className="rounded-2xl border p-6"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: deck.line,
              boxShadow: ARENA_SHADOWS.cardResting,
            }}
          >
            <p
              className="font-mono text-[10px] font-black uppercase tracking-[0.22em]"
              style={{ color: deck.hex }}
            >
              Your deck
            </p>
            <p className="mt-4 text-[11px] leading-snug text-slate-500">Cards you agreed with</p>
            <p className="mt-1 font-display text-4xl font-black tabular-nums leading-none text-white">{agreedYesCount}</p>
            <div className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-4 text-[11px] text-slate-500">
              <p className="flex justify-between gap-2 tabular-nums">
                <span className="text-slate-600">Still in this list</span>
                <span className="text-slate-400">{queue.length}</span>
              </p>
              <p className="flex justify-between gap-2 tabular-nums">
                <span className="text-slate-600">Players live</span>
                <span className="text-slate-400">{playerCountLoading ? '…' : playerCount}</span>
              </p>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
              {agreedYesCount >= RANK_READY_MIN
                ? 'Ready: keep curating or jump to rank whenever you want.'
                : `Minimum to rank is 1 saved card. For a fuller rank step, aim for ${RANK_READY_MIN}+ (${Math.max(0, RANK_READY_MIN - agreedYesCount)} more).`}
            </p>
            <div className="mt-5">
              <div className="mb-2 flex justify-between font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">
                <span>Ranking readiness</span>
                <span className="tabular-nums text-slate-400">{readyPct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: deck.hex }}
                  initial={false}
                  animate={{ width: `${readyPct}%` }}
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                />
              </div>
            </div>
            <motion.div
              className="mt-8"
              animate={justReady && !reduceMotion ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <SolidButton
                disabled={agreedYesCount < 1}
                onClick={() => {
                  playArenaUiClick();
                  onNextToRank();
                }}
                deck={deck}
                className="w-full"
              >
              Next �/ rank deck
              <ArrowRight size={15} strokeWidth={2.6} className="transition-transform group-hover:translate-x-0.5" />
            </SolidButton>
            </motion.div>
          </div>

          {peek.length > 0 ? (
            <div
              className="rounded-2xl border border-white/[0.06] px-6 py-5"
              style={{ background: ARENA_CARD_SURFACE.bodyBg }}
            >
              <p
                className="font-mono text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: deck.hex }}
              >
                Up next
              </p>
              <ol className="mt-4 space-y-3 text-sm text-slate-300">
                {peek.map((p, i) => (
                  <li key={p.id} className="flex gap-3 leading-snug">
                    <span className="font-mono text-[11px] tabular-nums text-slate-600">{i + 2}.</span>
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-200">{p.label}</span>
                      {p.subtitle ? <span className="block text-[12px] text-slate-500">{p.subtitle}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="px-1 text-center text-[12px] text-slate-500 lg:text-left">Last card in this list.</p>
          )}
        </aside>
      </div>
    </ArenaContestStepShell>
  );
};

/* ============================== SwipeCard ============================== */

type SwipeCardProps = {
  item: RankItem;
  deck: DeckPaletteEntry;
  listGlyph?: string;
  place: number;
  exitDir: 1 | -1;
  reduceMotion: boolean;
  onCommit: (dir: 'left' | 'right') => void;
};

/**
 * The active swipeable card. Owns its own motion values so that every mount
 * starts at x=0 — prevents the "stuck mid-swipe" inheritance bug when the
 * parent's queue advances. Rotation + stamps are driven purely from x for a
 * Tinder-class drag read (heavy ink, pivot near the thumb line).
 */
const SwipeCard = React.memo<SwipeCardProps>(function SwipeCard({
  item,
  deck,
  listGlyph,
  place,
  exitDir,
  reduceMotion,
  onCommit,
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-280, 280], [-21, 21]);
  const yesStampOpacity = useTransform(x, [28, 96], [0, 1]);
  const yesStampScale = useTransform(x, [28, 120], [0.72, 1.14]);
  const noStampOpacity = useTransform(x, [-96, -28], [1, 0]);
  const noStampScale = useTransform(x, [-120, -28], [1.14, 0.72]);
  const leftGlowOpacity = useTransform(x, [-160, -48, 0], [0.78, 0.14, 0]);
  const rightGlowOpacity = useTransform(x, [0, 48, 160], [0, 0.14, 0.78]);

  const endSwipe = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x + info.velocity.x * 0.22;
    if (dx > SWIPE_COMMIT) onCommit('right');
    else if (dx < -SWIPE_COMMIT) onCommit('left');
    // Elastic snap handled by drag — `dragMomentum` off keeps frames cheap.
  };

  const flySpring = { type: 'spring' as const, stiffness: 330, damping: 28, mass: 0.72 };

  return (
    <motion.article
      drag={reduceMotion ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.34}
      dragMomentum={false}
      dragDirectionLock
      dragTransition={{ bounceStiffness: 280, bounceDamping: 26 }}
      onDragEnd={endSwipe}
      initial={reduceMotion ? false : { scale: 0.96, y: 8, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: 0.14, ease: 'easeOut' } }
          : {
              x: exitDir * FLY_X,
              opacity: 0,
              rotate: exitDir * 14,
              transition: flySpring,
            }
      }
      transition={
        reduceMotion
          ? { duration: 0.12, ease: 'easeOut' }
          : { type: 'spring', stiffness: 420, damping: 32, mass: 0.82 }
      }
      style={{
        x,
        rotate,
        zIndex: 25,
        transformOrigin: '50% 92%',
        background: ARENA_CARD_SURFACE.bodyBg,
        border: `1px solid ${deck.line}`,
        boxShadow: ARENA_SHADOWS.cardLifted,
      }}
      className={`absolute inset-x-0 top-0 mx-auto w-full max-w-[min(480px,92vw)] cursor-grab select-none overflow-hidden rounded-[1.35rem] ring-1 ring-white/[0.04] transition-shadow duration-150 active:cursor-grabbing sm:max-w-[500px] ${
        reduceMotion ? 'touch-manipulation' : 'touch-pan-y'
      }`}
    >
      {!reduceMotion ? (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
            style={{
              opacity: leftGlowOpacity,
              background:
                'radial-gradient(ellipse 95% 85% at 6% 50%, rgba(251,113,133,0.55), transparent 64%)',
            }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
            style={{
              opacity: rightGlowOpacity,
              background:
                'radial-gradient(ellipse 95% 85% at 94% 50%, rgba(52,211,153,0.52), transparent 64%)',
            }}
          />
        </>
      ) : null}
      {/* Stamps — compact outlined badges (subtle vs hero art) */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-5 top-[18%] z-[3] -rotate-[11deg] sm:left-6 sm:top-[20%]"
        style={{ opacity: yesStampOpacity, scale: yesStampScale }}
      >
        <span className="inline-block rounded-md border-2 border-intuition-success/85 bg-black/40 px-2.5 py-1 font-display text-[11px] font-black uppercase tracking-[0.2em] text-intuition-success shadow-sm ring-1 ring-intuition-success/25 sm:text-xs sm:px-3 sm:py-1.5">
          Agree
        </span>
      </motion.div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-5 top-[18%] z-[3] rotate-[11deg] sm:right-6 sm:top-[20%]"
        style={{ opacity: noStampOpacity, scale: noStampScale }}
      >
        <span className="inline-block rounded-md border-2 border-intuition-secondary/85 bg-black/40 px-2.5 py-1 font-display text-[11px] font-black uppercase tracking-[0.2em] text-intuition-secondary shadow-sm ring-1 ring-intuition-secondary/25 sm:text-xs sm:px-3 sm:py-1.5">
          Pass
        </span>
      </motion.div>

      <div className="relative z-[1] flex h-[500px] flex-col sm:h-[520px]">
        {/* RANK RIBBON — solid filled */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ background: deck.hex, color: deck.contrastText }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 min-w-[2.35rem] items-center justify-center rounded-md border px-1.5 font-display text-[15px] font-black tabular-nums tracking-tight"
              style={{
                background: 'rgba(255,255,255,0.18)',
                borderColor: 'rgba(255,255,255,0.32)',
                color: deck.contrastText,
              }}
            >
              #{place}
            </span>
            <span className="font-mono text-[10px] font-black uppercase tracking-[0.22em]">
              {deck.label}
            </span>
          </div>
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-md font-display text-base font-black"
            style={{ background: 'rgba(0,0,0,0.18)', color: deck.contrastText }}
          >
            {listGlyph?.trim() || '◆'}
          </span>
        </div>

        {/* PORTRAIT — taller, bigger image. Stage gets the lion's share of the card. */}
        <div className="flex flex-1 items-center justify-center px-6 py-8">
          <div
            className="relative flex aspect-square w-full max-w-[272px] items-center justify-center overflow-hidden rounded-2xl border bg-[#070a10]"
            style={{ borderColor: deck.line }}
          >
            <CornerTicks color={deck.hex} />
            <ArenaPortraitImg
              src={item.image}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
              fetchPriority="high"
              draggable={false}
            >
              <User className="h-24 w-24 text-slate-700" strokeWidth={1.2} aria-hidden />
            </ArenaPortraitImg>
          </div>
        </div>

        {/* NAMEPLATE */}
        <div
          className="border-t border-white/[0.06] px-6 py-4 text-center"
          style={{ background: ARENA_CARD_SURFACE.inset }}
        >
          <h2 className="font-display text-lg font-black uppercase tracking-tight text-white sm:text-xl">
            {item.label}
          </h2>
          {item.subtitle ? (
            <p className="mt-1 text-[12px] text-slate-500 line-clamp-2">
              {item.subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </motion.article>
  );
});

/* ============================== Atom components ============================== */

const CircleAction: React.FC<{
  tone: 'yes' | 'no';
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ tone, label, disabled, onClick, children }) => {
  const isYes = tone === 'yes';
  const bg = isYes ? SWIPE_COLORS.yes : SWIPE_COLORS.no;
  return (
    <motion.button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => playArenaUiHover()}
      whileTap={{ scale: 0.9 }}
      whileHover={disabled ? undefined : { scale: 1.06 }}
      transition={{ type: 'spring', stiffness: 520, damping: 24 }}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-[0_12px_28px_rgba(0,0,0,0.45)] transition-colors disabled:opacity-40 sm:h-16 sm:w-16"
      style={{ background: bg }}
    >
      {children}
    </motion.button>
  );
};

const SolidButton: React.FC<{
  deck: DeckPaletteEntry;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  size?: 'sm' | 'md';
  children: React.ReactNode;
}> = ({ deck, disabled, onClick, className, size = 'md', children }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    onMouseEnter={() => playArenaUiHover()}
    className={`group inline-flex items-center justify-center gap-2 rounded-xl font-black uppercase tracking-[0.14em] shadow-[0_12px_28px_rgba(0,0,0,0.45)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99] disabled:opacity-40 ${
      size === 'sm' ? 'px-4 py-3 text-[10px]' : 'px-6 py-3.5 text-xs'
    } ${className ?? ''}`}
    style={{ background: deck.hex, color: deck.contrastText }}
  >
    {children}
  </button>
);

const CornerTicks: React.FC<{ color: string }> = ({ color }) => (
  <>
    <span
      className="absolute left-1.5 top-1.5 h-2.5 w-2.5"
      style={{ borderLeft: `2px solid ${color}`, borderTop: `2px solid ${color}` }}
      aria-hidden
    />
    <span
      className="absolute right-1.5 top-1.5 h-2.5 w-2.5"
      style={{ borderRight: `2px solid ${color}`, borderTop: `2px solid ${color}` }}
      aria-hidden
    />
    <span
      className="absolute left-1.5 bottom-1.5 h-2.5 w-2.5"
      style={{ borderLeft: `2px solid ${color}`, borderBottom: `2px solid ${color}` }}
      aria-hidden
    />
    <span
      className="absolute right-1.5 bottom-1.5 h-2.5 w-2.5"
      style={{ borderRight: `2px solid ${color}`, borderBottom: `2px solid ${color}` }}
      aria-hidden
    />
  </>
);
