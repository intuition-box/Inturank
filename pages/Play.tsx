/**
 * Play — the daily run. Artboards 1d, 2a-2g, and the run-end state.
 *
 * Eight claims, about ninety seconds, free to play. Calls queue locally and commit in ONE
 * signature at the end; there is never a wallet popup per card. That is the conviction cart,
 * and it is the most protected behaviour in the product.
 *
 * Celebration is tiered on purpose, because confetti on every card stops meaning anything:
 *   every call   — points pop once
 *   every fifth  — an amber combo band over the dimmed deck
 *   commit only  — the full reward moment
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, ChevronLeft, X } from 'lucide-react';
import DeckCard from '../components/play/DeckCard';
import { SplitGame, OverUnderGame, EarlyGame, SortGame, type GameResult } from '../components/play/GameCards';
import {
  loadRun,
  buildRounds,
  judge,
  stakeTermId,
  queueTotals,
  RUN_SIZE,
  DEFAULT_STAKE,
  COMBO_EVERY,
  type PlayCard,
  type Call,
  type Judged,
  type QueuedStake,
  type Round,
} from '../services/playDeck';
import { depositBatchToVaults, getConnectedAccount, parseProtocolError } from '../services/web3';
import { LINEAR_CURVE_ID } from '../constants';
import { parseEther } from 'viem';
import { recordPlayDay } from '../services/dayStreak';
import { notifyProtocolXpEarned } from '../services/protocolXp';
import { recordArenaRankingPicks, recordArenaStreakPicks } from '../services/arenaPickCredit';
import { stack, riser, land, press, spring, ease } from '../services/motion';
import { toast } from '../components/Toast';

const M = motion;

/** Progress: one segment per card, filled as the run advances. Scale, never width. */
const RunBar: React.FC<{ total: number; done: number }> = ({ total, done }) => (
  <div className="flex flex-1 gap-1">
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
        <M.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: i < done ? 1 : 0 }}
          transition={{ duration: 0.32, ease: ease.glide }}
          className="h-full origin-left bg-primary"
        />
      </div>
    ))}
  </div>
);

const Play: React.FC = () => {
  const [cards, setCards] = useState<PlayCard[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Judged | null>(null);
  const [points, setPoints] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [queue, setQueue] = useState<QueuedStake[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const [combo, setCombo] = useState(false);

  const advanceTimer = useRef<number | null>(null);

  useEffect(() => {
    void getConnectedAccount().then(setWallet).catch(() => setWallet(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const run = await loadRun(RUN_SIZE);
      if (!cancelled) {
        setCards(run);
        setRounds(buildRounds(run));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  const round = rounds[index];
  const card = round && round.kind !== 'sort' ? round.card : undefined;
  const finished = !loading && rounds.length > 0 && index >= rounds.length;

  /** Games other than Call it report their own score; fold it into the run the same way. */
  const onGameDone = useCallback(
    (r: GameResult) => {
      setGameResult(r);
      setPoints((p) => p + r.points);
      if (r.agreed) setCorrect((c) => c + 1);
      recordPlayDay(wallet);
      recordArenaRankingPicks(wallet, 1);
      recordArenaStreakPicks(wallet, 1);
    },
    [wallet],
  );
  const totals = useMemo(() => queueTotals(queue), [queue]);

  const onCall = useCallback(
    (call: Call) => {
      if (!card || result) return;
      const judged = judge(card, call, correct);
      setResult(judged);
      setPoints((p) => p + judged.points);
      if (judged.agreed) setCorrect((c) => c + 1);
      if (judged.combo) {
        setCombo(true);
        window.setTimeout(() => setCombo(false), 1600);
      }
      // Local + instant, exactly like the rest of the economy; the mirror confirms later.
      // A free call earns ARENA xp — protocol XP is reserved for actions that move real TRUST,
      // and is awarded on commit below instead.
      recordPlayDay(wallet);
      recordArenaRankingPicks(wallet, 1);
      recordArenaStreakPicks(wallet, 1);
    },
    [card, result, correct, wallet],
  );

  /** Queue the call for the one-signature batch, then move on. */
  const stakeIt = useCallback(() => {
    if (!result) return;
    setQueue((q) => [
      ...q,
      {
        cardId: result.card.id,
        label: result.card.label,
        call: result.call,
        termId: stakeTermId(result.card, result.call),
        trust: DEFAULT_STAKE,
      },
    ]);
    next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const next = useCallback(() => {
    setResult(null);
    setGameResult(null);
    setIndex((i) => i + 1);
  }, []);

  /** THE protected path: one transaction carrying every queued stake. */
  const commit = useCallback(async () => {
    if (queue.length === 0) return;
    if (!wallet) {
      toast.info('Connect a wallet to put money behind these calls.');
      return;
    }
    setCommitting(true);
    try {
      const { hash } = await depositBatchToVaults(
        queue.map((q) => ({
          termId: q.termId,
          assetsWei: parseEther(String(q.trust)),
          curveId: LINEAR_CURVE_ID,
        })),
        wallet,
      );
      // Real TRUST moved, so this is a protocol-XP moment. Deduped by tx hash.
      notifyProtocolXpEarned({
        address: wallet,
        reasonKey: 'market_acquire',
        txHash: hash,
        depositTrustWei: parseEther(String(totals.stakes)),
      });
      toast.success(`${queue.length} ${queue.length === 1 ? 'position' : 'positions'} are live.`);
      setQueue([]);
      setShowCart(false);
    } catch (e) {
      toast.error(parseProtocolError(e));
    } finally {
      setCommitting(false);
    }
  }, [queue, wallet]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Loading today's run" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-2xl font-extrabold text-ink">The graph is quiet</h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Nothing has enough money on it to be worth calling yet. A quiet graph is where positions
          are cheapest to take.
        </p>
        <Link to="/create" className="rounded-xl bg-primary-fill px-5 py-3 font-display text-sm font-extrabold text-bg">
          Put something up
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-6xl flex-col px-4 pb-28 pt-4 sm:px-6">
      {/* Run header */}
      <div className="mb-4 flex items-center gap-3">
        <Link to="/me" aria-label="Leave the run" className="text-ink-muted hover:text-ink">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="font-display text-[11px] font-black uppercase tracking-wider text-ink-muted">
          Today&rsquo;s run
        </span>
        <M.span
          key={points}
          initial={{ scale: 1.25, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.pop}
          className="ml-auto font-display text-sm font-black tabular-nums text-primary"
        >
          +{points}
        </M.span>
      </div>
      <div className="mb-6 flex">
        <RunBar total={rounds.length} done={index} />
      </div>

      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
        {/* ── The deck ───────────────────────────────────────────────── */}
        <div className="relative mx-auto w-full max-w-[420px]">
          <div className="relative min-h-[480px]">
            <AnimatePresence mode="popLayout">
              {!finished && round && round.kind === 'call' && (
                /* Call it keeps the physical stack — the other games are single cards. */
                rounds
                  .slice(index, index + 3)
                  .map((r, i) => (r.kind === 'sort' ? null : (
                    <DeckCard
                      key={r.card.id}
                      card={r.card}
                      depth={i}
                      interactive={i === 0}
                      result={i === 0 ? result : null}
                      onCall={onCall}
                    />
                  )))
                  .reverse()
              )}
            </AnimatePresence>

            {!finished && round && round.kind !== 'call' && (
              <div key={index} className="relative">
                {round.kind === 'split' && <SplitGame card={round.card} onDone={onGameDone} />}
                {round.kind === 'overunder' && (
                  <OverUnderGame card={round.card} threshold={round.threshold ?? 1000} onDone={onGameDone} />
                )}
                {round.kind === 'early' && (
                  <EarlyGame
                    card={round.card}
                    stake={DEFAULT_STAKE}
                    onDone={(r, backed) => {
                      onGameDone(r);
                      if (backed) {
                        setQueue((q) => [
                          ...q,
                          {
                            cardId: round.card.id,
                            label: round.card.label,
                            call: 'true',
                            termId: stakeTermId(round.card, 'true'),
                            trust: DEFAULT_STAKE,
                          },
                        ]);
                      }
                    }}
                  />
                )}
                {round.kind === 'sort' && (
                  <SortGame items={round.items} prompt={round.prompt} onDone={onGameDone} />
                )}
              </div>
            )}

            {finished && (
              <M.div
                variants={stack()}
                initial="hidden"
                animate="show"
                className="flex flex-col items-center gap-4 pt-10 text-center"
              >
                <M.h2 variants={land} className="font-display text-3xl font-black leading-tight tracking-tight text-ink">
                  That&rsquo;s the whole run.
                  <br />
                  {correct} for {rounds.length}.
                </M.h2>
                <M.p variants={riser()} className="max-w-sm text-sm leading-relaxed text-ink-muted">
                  A fresh {RUN_SIZE} arrives tomorrow. Until then the fastest way to earn is to put
                  something up, or to put money behind a call you already made.
                </M.p>
                <M.div variants={riser()} className="grid w-full grid-cols-3 rounded-2xl border border-border bg-surface">
                  {[
                    { v: `+${points}`, l: 'Points' },
                    { v: `${correct}/${rounds.length}`, l: 'Called right' },
                    { v: String(queue.length), l: 'Queued' },
                  ].map((s, i) => (
                    <div key={s.l} className={`px-3 py-3.5 ${i < 2 ? 'border-r border-border' : ''}`}>
                      <div className="font-display text-lg font-extrabold tabular-nums text-ink">{s.v}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{s.l}</div>
                    </div>
                  ))}
                </M.div>
                {queue.length > 0 && (
                  <M.button
                    variants={riser()}
                    whileTap={press}
                    onClick={() => setShowCart(true)}
                    className="w-full rounded-xl bg-primary-fill py-3.5 font-display text-sm font-extrabold text-bg"
                  >
                    Review {queue.length} {queue.length === 1 ? 'call' : 'calls'} &middot; {totals.stakes} TRUST
                  </M.button>
                )}
              </M.div>
            )}

            {/* Combo band — tier two, over the dimmed deck, amber and only here. */}
            <AnimatePresence>
              {combo && (
                <M.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={spring.pop}
                  className="pointer-events-none absolute inset-x-0 top-1/2 z-20 mx-auto w-[86%] -translate-y-1/2 rounded-2xl border-2 border-warning bg-bg/95 p-5 text-center"
                >
                  <p className="font-display text-[11px] font-black uppercase tracking-wider text-warning">
                    {COMBO_EVERY} in a row
                  </p>
                  <p className="mt-1 font-display text-2xl font-black leading-tight text-ink">
                    {COMBO_EVERY} calls, {COMBO_EVERY} stakes read right.
                  </p>
                </M.div>
              )}
            </AnimatePresence>
          </div>

          {/* Actions */}
          {!finished && round && round.kind !== 'call' && (
            <div className="mt-5">
              {gameResult ? (
                <M.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring.card}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-3">
                    <M.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={spring.pop}
                      className="rounded-lg bg-primary-fill px-2.5 py-1 font-display text-xs font-black tabular-nums text-bg"
                    >
                      +{gameResult.points}
                    </M.span>
                    <span className="min-w-0 flex-1 text-[11px] text-ink-muted">
                      <span className="font-semibold text-ink">{gameResult.headline}.</span>{' '}
                      {gameResult.detail}
                    </span>
                  </div>
                  <M.button
                    whileTap={press}
                    onClick={next}
                    className="rounded-xl bg-primary-fill py-3 font-display text-sm font-extrabold text-bg"
                  >
                    Next card
                  </M.button>
                </M.div>
              ) : null}
            </div>
          )}

          {!finished && round && round.kind === 'call' && (
            <div className="mt-5">
              {!result ? (
                <div className="grid grid-cols-2 gap-3">
                  <M.button
                    whileTap={press}
                    onClick={() => onCall('nope')}
                    className="rounded-2xl border-2 border-danger py-4 font-display text-base font-black uppercase tracking-wide text-danger"
                  >
                    Nope
                    <span className="mt-0.5 block text-[9px] font-bold tracking-wider text-ink-muted">
                      swipe left
                    </span>
                  </M.button>
                  <M.button
                    whileTap={press}
                    onClick={() => onCall('true')}
                    className="rounded-2xl border-2 border-primary-ink py-4 font-display text-base font-black uppercase tracking-wide text-primary"
                  >
                    True
                    <span className="mt-0.5 block text-[9px] font-bold tracking-wider text-ink-muted">
                      swipe right
                    </span>
                  </M.button>
                </div>
              ) : (
                <M.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring.card}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-3">
                    <M.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={spring.pop}
                      className="rounded-lg bg-primary-fill px-2.5 py-1 font-display text-xs font-black text-bg tabular-nums"
                    >
                      +{result.points}
                    </M.span>
                    <span className="text-[11px] text-ink-muted">
                      points pending &middot; {correct} of {index + 1} today
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <M.button
                      whileTap={press}
                      onClick={next}
                      className="rounded-xl border border-border py-3 font-display text-sm font-extrabold text-ink"
                    >
                      Next card
                    </M.button>
                    <M.button
                      whileTap={press}
                      onClick={stakeIt}
                      className="rounded-xl bg-primary-fill py-3 font-display text-sm font-extrabold text-bg"
                    >
                      Put {DEFAULT_STAKE} on it
                    </M.button>
                  </div>
                </M.div>
              )}
            </div>
          )}
        </div>

        {/* ── The conviction cart, beside the deck on desktop ──────────── */}
        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-display text-[10px] font-black uppercase tracking-wider text-ink-muted">
              Queued on this device &middot; not signed
            </p>
            {queue.length === 0 ? (
              <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                Nothing queued yet. Put money on a call and it waits here — one signature commits
                them all at the end.
              </p>
            ) : (
              <>
                <M.ul variants={stack(0.04)} initial="hidden" animate="show" className="mt-3 flex flex-col gap-1.5">
                  {queue.map((q) => (
                    <M.li
                      key={q.cardId}
                      variants={riser(6)}
                      className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">{q.label}</span>
                      <span
                        className={`font-display text-[10px] font-black uppercase ${
                          q.call === 'true' ? 'text-primary' : 'text-danger'
                        }`}
                      >
                        {q.call}
                      </span>
                      <span className="font-display text-xs font-extrabold tabular-nums text-ink">{q.trust}</span>
                    </M.li>
                  ))}
                </M.ul>
                <M.button
                  whileTap={press}
                  onClick={() => setShowCart(true)}
                  className="mt-3 w-full rounded-xl bg-primary-fill py-3 font-display text-sm font-extrabold text-bg"
                >
                  Review {queue.length} &middot; {totals.stakes} TRUST
                </M.button>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile cart chip */}
      {queue.length > 0 && !showCart && (
        <M.button
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={spring.card}
          whileTap={press}
          onClick={() => setShowCart(true)}
          className="fixed inset-x-4 bottom-20 z-30 flex items-center gap-3 rounded-2xl border border-primary-ink bg-surface px-4 py-3 lg:hidden"
        >
          <span className="font-display text-sm font-extrabold text-ink">
            Review {queue.length} {queue.length === 1 ? 'call' : 'calls'}
          </span>
          <span className="ml-auto font-display text-sm font-extrabold tabular-nums text-primary">
            {totals.stakes} TRUST
          </span>
        </M.button>
      )}

      {/* ── Review sheet: one signature, everything visible first ─────── */}
      <AnimatePresence>
        {showCart && (
          <M.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-0 sm:items-center sm:p-6"
            onClick={() => !committing && setShowCart(false)}
          >
            <M.div
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={spring.card}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 sm:rounded-3xl"
            >
              <div className="mb-3 flex items-center">
                <h2 className="font-display text-xl font-black tracking-tight text-ink">
                  {queue.length} {queue.length === 1 ? 'call' : 'calls'}, one signature.
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCart(false)}
                  aria-label="Close"
                  className="ml-auto text-ink-muted hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-3 text-[12px] text-ink-muted">
                Edit or drop anything here. Nothing has left your wallet yet.
              </p>

              <ul className="flex flex-col gap-1.5">
                {queue.map((q) => (
                  <li key={q.cardId} className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">{q.label}</span>
                    <span className="font-display text-xs font-extrabold tabular-nums text-ink">{q.trust}</span>
                    <button
                      type="button"
                      onClick={() => setQueue((v) => v.filter((r) => r.cardId !== q.cardId))}
                      aria-label={`Drop ${q.label}`}
                      className="text-ink-dim hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>

              <dl className="mt-4 flex flex-col gap-1 text-[12px] text-ink-muted">
                <div className="flex justify-between">
                  <dt>Stakes</dt>
                  <dd className="tabular-nums text-ink">{totals.stakes} TRUST</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Protocol fee &middot; 0.5%</dt>
                  <dd className="tabular-nums text-ink">{totals.fee.toFixed(2)} TRUST</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5">
                  <dt className="font-display font-extrabold text-ink">Total</dt>
                  <dd className="font-display font-extrabold tabular-nums text-ink">
                    {totals.total.toFixed(2)} TRUST
                  </dd>
                </div>
              </dl>

              <M.button
                whileTap={press}
                onClick={commit}
                disabled={committing}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-fill py-3.5 font-display text-sm font-extrabold text-bg disabled:opacity-50"
              >
                {committing && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign once &middot; commit all {queue.length}
              </M.button>
              <p className="mt-2 text-center text-[11px] text-ink-muted">
                One signature moves {totals.total.toFixed(2)} TRUST. There is no second popup.
              </p>
            </M.div>
          </M.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Play;
