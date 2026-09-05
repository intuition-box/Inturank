/**
 * The four games that are not Call it. Artboards 3d–3k.
 *
 * One palette; they are told apart by shape and pattern, per the handoff:
 *   guess the split — diagonal hatch
 *   over / under    — dotted, cut corner
 *   get in early    — rings, small
 *   sort it         — grid, square
 *
 * Patterns are static CSS gradients, so they cost nothing to paint and never animate.
 * Every moving property here is a transform or opacity.
 */
import React, { useState } from 'react';
import { motion, Reorder } from 'framer-motion';
import type { PlayCard } from '../../services/playDeck';
import { judgeSplit, judgeOverUnder, judgeSort } from '../../services/playDeck';
import { press, spring, fillX } from '../../services/motion';

const M = motion;

/** Result handed back to Play: points earned, and whether the money agreed (null = no verdict). */
export interface GameResult {
  points: number;
  agreed: boolean | null;
  headline: string;
  detail: string;
}

const PATTERNS: Record<string, React.CSSProperties> = {
  hatch: {
    backgroundImage:
      'repeating-linear-gradient(45deg, rgba(11,14,18,.07) 0 6px, transparent 6px 14px)',
  },
  dots: {
    backgroundImage: 'radial-gradient(rgba(11,14,18,.14) 1.5px, transparent 1.6px)',
    backgroundSize: '12px 12px',
  },
  rings: {
    backgroundImage:
      'repeating-radial-gradient(circle at 50% 42%, rgba(11,14,18,.09) 0 1.5px, transparent 1.5px 16px)',
  },
  grid: {
    backgroundImage:
      'linear-gradient(rgba(11,14,18,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(11,14,18,.08) 1px, transparent 1px)',
    backgroundSize: '18px 18px',
  },
};

const Shell: React.FC<{
  pattern: keyof typeof PATTERNS;
  eyebrow: string;
  hint: string;
  cut?: boolean;
  children: React.ReactNode;
}> = ({ pattern, eyebrow, hint, cut, children }) => (
  <M.div
    initial={{ opacity: 0, y: 14, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={spring.card}
    style={PATTERNS[pattern]}
    className={`mx-auto w-full max-w-[420px] border-2 border-card-edge bg-card p-5 ${
      cut ? 'rounded-3xl [clip-path:polygon(0_22px,22px_0,100%_0,100%_100%,0_100%)]' : 'rounded-3xl'
    }`}
  >
    <div className="mb-4 flex items-center justify-between">
      <span className="rounded-full border border-ink/25 px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-wider text-ink">
        {eyebrow}
      </span>
      <span className="font-display text-[10px] font-black uppercase tracking-wider text-ink/50">{hint}</span>
    </div>
    {children}
  </M.div>
);

const Claim: React.FC<{ card: PlayCard }> = ({ card }) => (
  <p className="font-display text-[19px] font-black leading-[1.15] tracking-tight text-ink">{card.label}</p>
);

/* ── Guess the split ─────────────────────────────────────────────────────── */

export const SplitGame: React.FC<{ card: PlayCard; onDone: (r: GameResult) => void }> = ({ card, onDone }) => {
  const [guess, setGuess] = useState(50);
  const [done, setDone] = useState<ReturnType<typeof judgeSplit> | null>(null);

  const lock = () => {
    const r = judgeSplit(card, guess);
    setDone(r);
    onDone({
      points: r.points,
      agreed: r.off <= 15,
      headline: r.off <= 5 ? 'Close enough to pay' : r.off <= 15 ? 'Near enough' : 'Wide of it',
      detail: `You said ${guess}. The money says ${Math.round(r.actual)}.`,
    });
  };

  return (
    <Shell pattern="hatch" eyebrow="Guess the split" hint="How much says true?">
      <Claim card={card} />
      <div className="mt-6">
        <div className="flex items-end gap-2">
          <span className="font-display text-4xl font-black leading-none tabular-nums text-ink">
            {done ? Math.round(done.actual) : guess}%
          </span>
          <span className="pb-1 text-[11px] font-semibold text-ink/60">
            {done ? 'actual' : 'your guess'}
          </span>
        </div>
        <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-ink/10">
          <M.div
            initial="hidden"
            animate="show"
            variants={fillX(done ? done.actual : guess)}
            className="absolute inset-0 origin-left bg-ink/70"
          />
        </div>
        {!done ? (
          <>
            <input
              type="range"
              min={0}
              max={100}
              value={guess}
              onChange={(e) => setGuess(Number(e.target.value))}
              aria-label="Your guess"
              className="mt-3 w-full accent-ink"
            />
            <M.button
              whileTap={press}
              onClick={lock}
              className="mt-4 w-full rounded-xl bg-ink py-3 font-display text-sm font-extrabold text-card"
            >
              Lock in {guess}%
            </M.button>
          </>
        ) : (
          <p className="mt-3 text-[13px] font-semibold text-ink/80">
            You were {Math.round(done.off)} points off. Closer pays more.
          </p>
        )}
      </div>
    </Shell>
  );
};

/* ── Over / under ────────────────────────────────────────────────────────── */

export const OverUnderGame: React.FC<{
  card: PlayCard;
  threshold: number;
  onDone: (r: GameResult) => void;
}> = ({ card, threshold, onDone }) => {
  const [done, setDone] = useState<{ actual: number; agreed: boolean } | null>(null);

  const answer = (said: 'over' | 'under') => {
    const r = judgeOverUnder(card, said, threshold);
    setDone({ actual: r.actual, agreed: r.agreed });
    onDone({
      points: r.points,
      agreed: r.agreed,
      headline: r.agreed ? `And it is well ${said}` : `It is not ${said}`,
      detail: `${Math.round(r.actual).toLocaleString('en-US')} TRUST staked.`,
    });
  };

  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toString());

  return (
    <Shell pattern="dots" eyebrow="Over or under" hint="How big is it?" cut>
      <Claim card={card} />
      <div className="mt-5 rounded-2xl bg-ink/[0.06] p-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink/60">
          Is there more or less than
        </p>
        <p className="font-display text-3xl font-black tabular-nums text-ink">
          {fmt(threshold)} <span className="text-base">TRUST staked on it</span>
        </p>
      </div>
      {!done ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(['under', 'over'] as const).map((s) => (
            <M.button
              key={s}
              whileTap={press}
              onClick={() => answer(s)}
              className={`rounded-xl py-3.5 font-display text-sm font-black uppercase tracking-wide ${
                s === 'over' ? 'bg-ink text-card' : 'border-2 border-ink text-ink'
              }`}
            >
              {s}
            </M.button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-center font-display text-2xl font-black tabular-nums text-ink">
          {Math.round(done.actual).toLocaleString('en-US')} TRUST
        </p>
      )}
    </Shell>
  );
};

/* ── Get in early ────────────────────────────────────────────────────────── */

export const EarlyGame: React.FC<{
  card: PlayCard;
  stake: number;
  onDone: (r: GameResult, backed: boolean) => void;
}> = ({ card, stake, onDone }) => {
  const staked = card.forTrust + card.againstTrust;
  const wouldBe = staked > 0 && stake > staked / Math.max(1, card.holders) ? 'largest' : 'a top';

  const finish = (backed: boolean) =>
    onDone(
      {
        points: backed ? 20 : 8,
        agreed: null,
        headline: backed ? 'You are in early' : 'Passed',
        detail: backed
          ? `${stake} TRUST makes you ${wouldBe} holder of ${card.holders + 1}.`
          : 'No crowd to be right about yet.',
      },
      backed,
    );

  return (
    <Shell pattern="rings" eyebrow="Get in early" hint={`${card.holders} holders`}>
      <div className="py-2 text-center">
        <Claim card={card} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { v: Math.round(staked).toLocaleString('en-US'), l: 'Staked' },
          { v: String(card.holders), l: 'Holders' },
          { v: `${stake}`, l: 'Your stake' },
        ].map((s) => (
          <div key={s.l}>
            <div className="font-display text-lg font-extrabold tabular-nums text-ink">{s.v}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-ink/55">{s.l}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[12px] leading-snug text-ink/75">
        {stake} TRUST makes you {wouldBe} holder here. There is no crowd to be right about yet.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <M.button
          whileTap={press}
          onClick={() => finish(false)}
          className="rounded-xl border-2 border-ink py-3 font-display text-sm font-black uppercase text-ink"
        >
          Pass
        </M.button>
        <M.button
          whileTap={press}
          onClick={() => finish(true)}
          className="rounded-xl bg-ink py-3 font-display text-sm font-black uppercase text-card"
        >
          Back it · {stake}
        </M.button>
      </div>
    </Shell>
  );
};

/* ── Sort it ─────────────────────────────────────────────────────────────── */

export const SortGame: React.FC<{
  items: PlayCard[];
  prompt: string;
  onDone: (r: GameResult) => void;
}> = ({ items, prompt, onDone }) => {
  const [order, setOrder] = useState(items);
  const [done, setDone] = useState<ReturnType<typeof judgeSort> | null>(null);

  const lock = () => {
    const r = judgeSort(items, order.map((c) => c.id));
    setDone(r);
    onDone({
      points: r.points,
      agreed: r.inPlace >= 2,
      headline: r.inPlace === 4 ? 'Perfect order' : r.inPlace >= 2 ? 'You had the top and tail' : 'Not this time',
      detail: `${r.inPlace} of ${items.length} in place.`,
    });
  };

  return (
    <Shell pattern="grid" eyebrow="Sort it" hint="Most staked first">
      <p className="font-display text-[17px] font-black leading-tight tracking-tight text-ink">{prompt}</p>
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className="mt-4 flex flex-col gap-2">
        {order.map((c, i) => {
          const rightPlace = done && done.truth[i] === c.id;
          return (
            <Reorder.Item
              key={c.id}
              value={c}
              dragListener={!done}
              whileDrag={{ scale: 1.03 }}
              className={`flex cursor-grab items-center gap-3 rounded-xl border-2 px-3 py-2.5 active:cursor-grabbing ${
                done
                  ? rightPlace
                    ? 'border-primary-ink bg-primary-fill/25'
                    : 'border-danger bg-danger-flood/15'
                  : 'border-ink/20 bg-card'
              }`}
            >
              <span className="font-display text-xs font-black tabular-nums text-ink/50">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{c.label}</span>
              {done && (
                <span className="font-display text-[11px] font-extrabold tabular-nums text-ink/70">
                  {Math.round(c.forTrust + c.againstTrust).toLocaleString('en-US')}
                </span>
              )}
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
      {!done && (
        <M.button
          whileTap={press}
          onClick={lock}
          className="mt-4 w-full rounded-xl bg-ink py-3 font-display text-sm font-extrabold text-card"
        >
          Lock in this order
        </M.button>
      )}
    </Shell>
  );
};
