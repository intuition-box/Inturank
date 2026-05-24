import React, { useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Crown,
  Layers,
  Loader2,
  Medal,
  PenLine,
  Radio,
  ShieldCheck,
  Copy,
  Shuffle,
  Sparkles,
  Trophy,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import type { ArenaComparePeer, RankItem } from '../../pages/RankedList';
import { parseStakeBaseLabel } from '../../services/arenaRankStake';
import type { PortalListRankRow } from '../../services/arenaSimilarity';
import { playArenaUiClick, playArenaUiHover } from '../../services/audio';
import { CURRENCY_SYMBOL } from '../../constants';
import {
  ARENA_CARD_SURFACE,
  ARENA_SHADOWS,
  deckPalette,
  type DeckPaletteEntry,
} from '../../services/arenaCardDesign';
import { ArenaContestStepShell } from './ArenaContestStepShell';
import { ArenaPortraitImg } from './ArenaPortraitImg';

type Props = {
  deck: RankItem[];
  /** Per-item stake units from Rank (× session stake base). */
  rankTrustUnits?: Record<string, number>;
  /** Session stake preset label, e.g. "0.1". */
  stakeBaseLabel?: string;
  /** Drives the contest's solid color theme. */
  listCategory?: string;
  /** Real-data peers (sorted DESC by similarity). Empty when no on-chain overlap. */
  peers: ArenaComparePeer[];
  /** True while the peer fetch is in flight. */
  peersLoading: boolean;
  /** Whether this list lives on-chain (only then is comparison meaningful). */
  listIsOnChain: boolean;
  /** Aggregated similarity versus peers, or null when unavailable. */
  similarityPct: number | null;
  /** Player's position in the global leaderboard, if known. */
  progressionPct: number | null;
  /** Games-to-top-10 (0 if already inside top-10, `null` when place unknown). */
  gamesToTop10Hint: number | null;
  /** Pending promote ties on-chain mint (list identity + memberships). */
  pendingPromote: boolean;
  /** Rows from Create Card (pending-card-…) are placeholders until Compare. */
  pendingCardCount: number;
  /** Number of rank-stake rows queued in the batch cart. */
  pendingStakeCount: number;
  /** Batch / conviction-cart flow (vs legacy per-pick sends). */
  batchMode?: boolean;
  /** Whether a wallet is connected. Affects CTA copy. */
  isWalletConnected?: boolean;
  /** Primary commit action that picks the next game afterward. */
  onSubmitAndContinue: () => void;
  onRandomGame: () => void;
  onPickNextGame: () => void;
  /** Remix a peer's published ranking into your rank deck. */
  onAdoptPeer?: (peer: ArenaComparePeer) => void;
  /** Opens batch review so the user can sign queued rows (this list or others). */
  onOpenConvictionCart?: () => void;
  onOpenSignal?: () => void;
  /** Compare step: only “Play random game” + “Choose new game” (stakes signed on Rank/mint). */
  gameActionsOnly?: boolean;
  contestTitle?: string;
  poolParticipantCount?: number;
  listStakersCount?: number | null;
  listStakersLoading?: boolean;
};

function shortAddr(a: string): string {
  const t = a.trim();
  if (t.length < 12) return t || '…';
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

function peerDisplayName(label: string, address: string): string {
  const raw = (label || '').trim();
  if (raw && !/^0x[a-fA-F0-9]{40}$/i.test(raw)) {
    return raw.length > 22 ? `${raw.slice(0, 20)}…` : raw;
  }
  return shortAddr(address);
}

/**
 * Step 3 · Similarity. Two-column composition (deck preview | similarity rail)
 * with an honest peer list below. All numbers come from on-chain claims; if
 * the contest is off-chain or no overlap exists, the section is hidden or
 * clearly labelled when missing so nothing is fabricated.
 */
function formatDeckTrust(stakeBase: number, units: number): string {
  if (stakeBase <= 0 || units < 1) return '—';
  const t = stakeBase * units;
  if (t >= 100) return `${Math.round(t)}`;
  const rounded = Math.round(t * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

export const ArenaCompareView: React.FC<Props> = ({
  deck,
  rankTrustUnits = {},
  stakeBaseLabel = '0.1',
  listCategory,
  peers,
  peersLoading,
  listIsOnChain,
  similarityPct,
  progressionPct,
  gamesToTop10Hint,
  pendingPromote,
  pendingCardCount,
  pendingStakeCount,
  batchMode = false,
  isWalletConnected = false,
  onSubmitAndContinue,
  onRandomGame,
  onPickNextGame,
  onAdoptPeer,
  onOpenConvictionCart,
  onOpenSignal,
  gameActionsOnly = false,
  contestTitle,
  poolParticipantCount,
  listStakersCount,
  listStakersLoading,
}) => {
  const palette = useMemo(() => deckPalette(listCategory), [listCategory]);
  const stakeBase = useMemo(() => parseStakeBaseLabel(stakeBaseLabel), [stakeBaseLabel]);
  const myDeckRows = useMemo(
    () =>
      deck.map((item, i) => {
        const units = Math.max(1, rankTrustUnits[item.id] ?? 1);
        return {
          rank: i + 1,
          item,
          units,
          trustLabel: formatDeckTrust(stakeBase, units),
        };
      }),
    [deck, rankTrustUnits, stakeBase],
  );
  const totalPeers = peers.length;
  const topPeer = peers[0] ?? null;

  /** Submit path includes promote + queued stakes only (session Create Card rows are not targets yet). */
  const hasPendingWrites = pendingPromote || pendingStakeCount > 0;
  /** Lines included in the wallet-sign batch (promote modal + rank batch only). */
  const queuedChainItems: string[] = [];
  if (pendingPromote) queuedChainItems.push('Anchor this contest on-chain (promote)');
  if (pendingStakeCount > 0)
    queuedChainItems.push(
      `Stake ${pendingStakeCount} rank deposit${pendingStakeCount === 1 ? '' : 's'} on-chain`,
    );
  /** Create Card placeholders sit in-session until Compare submits. */
  const sessionDeckNote =
    pendingCardCount > 0
      ? `${pendingCardCount} card${pendingCardCount === 1 ? '' : 's'} from Create Card (session deck only until you submit)`
      : null;

  return (
    <ArenaContestStepShell
      chromeTitle={`Compare · ${palette.label}`}
      maxWidthClass="max-w-none"
      innerPaddingClassName="px-3 py-5 sm:px-4 sm:py-6 md:px-5 md:py-7 lg:px-6 xl:px-8"
    >
      {/* ── Page hero ─────────────────────────────────────── */}
      <header
        className="rounded-2xl border border-white/[0.08] px-4 py-5 sm:px-6 sm:py-6"
        style={{
          background: `linear-gradient(135deg, ${palette.hex}0a 0%, #05070c 55%, #05070c 100%)`,
          boxShadow: ARENA_SHADOWS.cardResting,
        }}
      >
        <p
          className="font-mono text-[10px] font-black uppercase tracking-[0.32em]"
          style={{ color: palette.hex }}
        >
          Step 3 · Compare · {palette.label}
        </p>
        <h1 className="mt-2 font-display text-2xl font-black leading-[1.05] tracking-tight text-white sm:text-3xl">
          Your deck vs the board
        </h1>
        {contestTitle ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">
                Contest
              </p>
              <p className="mt-0.5 truncate font-display text-lg font-black text-white sm:text-xl">
                {contestTitle}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {typeof poolParticipantCount === 'number' ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-300 tabular-nums"
                >
                  <Users className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  {poolParticipantCount} pick{poolParticipantCount === 1 ? '' : 's'}
                </span>
              ) : null}
              {(listStakersLoading || listStakersCount != null) && (
                <span className="inline-flex items-center rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500 tabular-nums">
                  {listStakersLoading
                    ? 'Rankers …'
                    : listStakersCount != null &&
                      `${listStakersCount} wallet${listStakersCount === 1 ? '' : 's'}`}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </header>

      {/* ── Main: your deck once + closest rankings + stats rail ─ */}
      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_min(100%,300px)] xl:gap-8">
        <section
          aria-labelledby="compare-closest-rankings"
          className="min-w-0 overflow-hidden rounded-2xl border-2"
          style={{
            background: `linear-gradient(168deg, ${palette.hex}14 0%, ${ARENA_CARD_SURFACE.bodyBg} 36%, #030508 100%)`,
            borderColor: palette.line,
            boxShadow: `${ARENA_SHADOWS.cardLifted}, 0 0 64px ${palette.hex}20`,
          }}
        >
          <div
            className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-5 sm:px-6"
            style={{ borderColor: `${palette.hex}40`, background: `${palette.hex}0c` }}
          >
            <div className="min-w-0">
              <h2
                id="compare-closest-rankings"
                className="font-display text-[1.65rem] font-black uppercase leading-[0.95] tracking-tight sm:text-4xl"
                style={{ color: palette.hex, textShadow: `0 0 40px ${palette.hex}55` }}
              >
                Closest Rankings
              </h2>
              <p className="mt-1.5 text-[12px] text-slate-400">
                Compare peers to <span className="font-semibold text-slate-200">your ranked deck</span> below.
              </p>
            </div>
            <span
              className="inline-flex shrink-0 items-center rounded-xl border-2 px-3.5 py-2 font-display text-sm font-black uppercase tabular-nums"
              style={{ borderColor: palette.hex, background: palette.hex, color: '#fff' }}
            >
              {peersLoading ? '…' : totalPeers} {peersLoading ? '' : totalPeers === 1 ? 'match' : 'matches'}
            </span>
          </div>

          {/* Your deck — shown once, with TRUST per pick */}
          <div
            className="border-b px-4 py-4 sm:px-6"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            aria-labelledby="compare-your-deck"
          >
            <h3
              id="compare-your-deck"
              className="font-mono text-xs font-black uppercase tracking-[0.2em] text-white"
            >
              Your ranked deck
            </h3>
            {myDeckRows.length === 0 ? (
              <p className="mt-2 text-[13px] font-medium text-slate-400">No picks yet — go back to Rank.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {myDeckRows.map((row) => (
                  <li
                    key={row.item.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.12] bg-black/40 px-3 py-3 sm:px-4"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] font-display text-lg font-black tabular-nums text-white"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      {row.rank}
                    </span>
                    <ArenaPortraitImg
                      src={row.item.image}
                      className="h-10 w-10 shrink-0 rounded-md object-cover"
                      loading="lazy"
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-white">
                      {row.item.label}
                    </span>
                    <span
                      className="shrink-0 text-right font-mono text-base font-black tabular-nums leading-none text-white sm:text-lg"
                      title="TRUST staked on this pick"
                    >
                      {row.trustLabel}
                      <span className="ml-1 text-sm font-black text-white/90">{CURRENCY_SYMBOL}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <PeerList
            myDeckRows={myDeckRows}
            listIsOnChain={listIsOnChain}
            peersLoading={peersLoading}
            peers={peers}
            palette={palette}
            pendingStakeCount={pendingStakeCount}
            batchMode={batchMode}
            isWalletConnected={isWalletConnected}
            onAdoptPeer={onAdoptPeer}
          />
        </section>

        {/* Stats rail */}
        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4">
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 px-0.5">
            At a glance
          </p>
          {/* 1) SIMILARITY HEADLINE */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: palette.line,
              boxShadow: ARENA_SHADOWS.cardResting,
            }}
          >
            <div className="flex items-baseline justify-between">
              <p
                className="font-mono text-[10px] font-black uppercase tracking-[0.22em]"
                style={{ color: palette.hex }}
              >
                Similarity
              </p>
              <Trophy className="h-4 w-4" style={{ color: palette.hex }} strokeWidth={2.2} aria-hidden />
            </div>
            {similarityPct === null ? (
              <div className="mt-4">
                <p className="font-display text-2xl font-black tracking-tight text-slate-400">No data yet</p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {listIsOnChain
                    ? 'Shows when another wallet overlaps your deck on this list.'
                    : 'Mint on-chain to unlock peer similarity.'}
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <p
                  className="font-display text-5xl font-black tabular-nums leading-none"
                  style={{ color: palette.hex }}
                >
                  {similarityPct}
                  <span className="ml-1 align-top text-2xl text-slate-400">%</span>
                </p>
                <p className="mt-2 text-[12px] leading-snug text-slate-300">
                  Weighted agreement with{' '}
                  <span className="font-semibold text-slate-100">
                    {totalPeers} peer{totalPeers === 1 ? '' : 's'}
                  </span>{' '}
                  who staked on this list.
                </p>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ background: palette.hex, width: `${similarityPct}%` }}
                  />
                </div>
                {topPeer ? (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <Crown className="h-3.5 w-3.5 shrink-0" style={{ color: palette.hex }} strokeWidth={2.4} />
                    <span className="truncate font-mono text-[11px] text-slate-300">
                      Top match{' '}
                      <span className="font-semibold text-slate-100">
                        {peerDisplayName(topPeer.player.label, topPeer.player.address)}
                      </span>{' '}
                      <span className="tabular-nums" style={{ color: palette.hex }}>
                        {topPeer.similarity.similarityPct}%
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* 2) LADDER PROGRESSION */}
          <div
            className="rounded-2xl border p-5"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: ARENA_CARD_SURFACE.edgeMuted,
            }}
          >
            <div className="flex items-baseline justify-between">
              <p
                className="font-mono text-[10px] font-black uppercase tracking-[0.22em]"
                style={{ color: palette.hex }}
              >
                Ladder
              </p>
              <Medal className="h-4 w-4 text-slate-500" strokeWidth={2.2} aria-hidden />
            </div>
            {progressionPct === null ? (
              <p className="mt-3 text-[11px] italic leading-relaxed text-slate-500">
                Rank a few lists on-chain to show on the leaderboard. Progression fills in once you land there.
              </p>
            ) : (
              <>
                <p className="mt-3 font-display text-4xl font-black tabular-nums leading-none text-white">
                  {progressionPct}%
                </p>
                <p className="mt-1 text-[11px] text-slate-500">of the way up the global ladder</p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full"
                    style={{ background: palette.hex, width: `${progressionPct}%` }}
                  />
                </div>
                {gamesToTop10Hint !== null ? (
                  <p className="mt-3 text-[11px] leading-snug text-slate-400">
                    {gamesToTop10Hint === 0 ? (
                      <span className="font-semibold text-slate-200">You’re in the top 10. Stay there.</span>
                    ) : (
                      <>
                        <span className="font-semibold text-slate-200 tabular-nums">{gamesToTop10Hint}</span>{' '}
                        more places to reach the top 10
                      </>
                    )}
                  </p>
                ) : null}
              </>
            )}
          </div>

          {/* 3) ACTION PANEL */}
          <div
            className="flex flex-col gap-2.5 rounded-2xl border p-4"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: gameActionsOnly ? ARENA_CARD_SURFACE.edgeMuted : hasPendingWrites ? palette.line : ARENA_CARD_SURFACE.edgeMuted,
            }}
          >
            {gameActionsOnly ? (
              <>
                <p className="text-[11px] leading-snug text-slate-400">
                  Contest is live on-chain. Pick your next game when you are ready.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playArenaUiClick();
                      onRandomGame();
                    }}
                    onMouseEnter={() => playArenaUiHover()}
                    className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 bg-black/30 px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-200 transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    <Shuffle className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.2} aria-hidden />
                    Play random game
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playArenaUiClick();
                      onPickNextGame();
                    }}
                    onMouseEnter={() => playArenaUiHover()}
                    className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-900 transition-colors hover:brightness-110 active:scale-[0.99]"
                    style={{ background: palette.hex }}
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.2} aria-hidden />
                    Choose new game
                  </button>
                </div>
              </>
            ) : null}

            {!gameActionsOnly && queuedChainItems.length > 0 ? (
              <div
                className="mb-1 rounded-xl border px-3 py-2.5"
                style={{ borderColor: palette.line, background: palette.soft }}
              >
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" style={{ color: palette.hex }} strokeWidth={2.4} aria-hidden />
                  <p
                    className="font-mono text-[9px] font-black uppercase tracking-[0.22em]"
                    style={{ color: palette.hex }}
                  >
                    On submit, one wallet sign
                  </p>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {queuedChainItems.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-200"
                    >
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: palette.hex }}
                        aria-hidden
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!gameActionsOnly && sessionDeckNote ? (
              <div className="mb-1 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Session deck
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{sessionDeckNote}</p>
              </div>
            ) : null}

            {!gameActionsOnly && listIsOnChain && batchMode && !hasPendingWrites && !pendingPromote ? (
              <div className="mb-1 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5">
                <p className="text-[11px] leading-snug text-slate-400">
                  <span className="font-semibold text-slate-200">Signing</span> runs from{' '}
                  <span className="text-slate-200">queued rank deposits</span> (Curate + wallet + Agree). None are queued
                  for this list yet, so you only see Pick next, or open the conviction cart below to review other contests.
                </p>
              </div>
            ) : null}

            {!gameActionsOnly ? (
            <button
              type="button"
              onClick={() => {
                playArenaUiClick();
                if (hasPendingWrites) onSubmitAndContinue();
                else onPickNextGame();
              }}
              onMouseEnter={() => playArenaUiHover()}
              className="group inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[11px] font-black uppercase tracking-[0.14em] shadow-[0_12px_28px_rgba(0,0,0,0.45)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99]"
              style={{ background: palette.hex, color: palette.contrastText }}
            >
              {hasPendingWrites ? (
                <>
                  {isWalletConnected ? (
                    <ShieldCheck className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                  ) : (
                    <Zap className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                  )}
                  {isWalletConnected ? 'Sign + pick next game' : 'Connect & submit'}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                  Choose new game
                </>
              )}
              <ArrowRight size={14} strokeWidth={2.6} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            ) : null}

            {!gameActionsOnly ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  playArenaUiClick();
                  onRandomGame();
                }}
                onMouseEnter={() => playArenaUiHover()}
                className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-200 transition-colors hover:bg-white/[0.04] hover:text-white`}
              >
                <Shuffle className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.2} aria-hidden />
                Play random game
              </button>
              <button
                type="button"
                onClick={() => {
                  playArenaUiClick();
                  onPickNextGame();
                }}
                onMouseEnter={() => playArenaUiHover()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                style={{ background: palette.soft }}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.2} aria-hidden />
                Choose new game
              </button>
            </div>
            ) : null}

            {!gameActionsOnly && batchMode && onOpenConvictionCart && !hasPendingWrites ? (
              <button
                type="button"
                onClick={() => {
                  playArenaUiClick();
                  onOpenConvictionCart();
                }}
                onMouseEnter={() => playArenaUiHover()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors hover:brightness-110 active:scale-[0.99]"
                style={{
                  borderColor: palette.line,
                  background: palette.soft,
                  color: palette.hex,
                }}
              >
                <PenLine className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.3} aria-hidden />
                Review conviction cart
              </button>
            ) : null}

            {!gameActionsOnly && onOpenSignal ? (
              <button
                type="button"
                onClick={() => {
                  playArenaUiClick();
                  onOpenSignal();
                }}
                onMouseEnter={() => playArenaUiHover()}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white"
                style={{ background: palette.soft }}
              >
                <Radio className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.2} aria-hidden />
                Open Signal
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </ArenaContestStepShell>
  );
};

/* ============================== Compare helpers ============================== */

type MyDeckRow = {
  rank: number;
  item: RankItem;
  units: number;
  trustLabel: string;
};

type DeckCompareRow = {
  id: string;
  label: string;
  image?: string;
  myRank: number | null;
  myTrust: string;
  theirRank: number | null;
  theirTrust: string;
  theirSupport: boolean | null;
  verdict: 'same-rank' | 'agree' | 'pass' | 'you-only' | 'them-only';
};

function buildDeckCompareRows(
  myDeckRows: MyDeckRow[],
  peer: ArenaComparePeer,
): DeckCompareRow[] {
  const myById = new Map<string, { rank: number; label: string; image?: string; trust: string }>();
  for (const row of myDeckRows) {
    myById.set(row.item.id.toLowerCase(), {
      rank: row.rank,
      label: row.item.label,
      image: row.item.image,
      trust: row.trustLabel,
    });
  }

  const theirById = new Map<string, PortalListRankRow>();
  for (const r of peer.listRanking) {
    theirById.set(r.subjectId.toLowerCase(), r);
  }

  const supportById = new Map<string, boolean>();
  for (const s of peer.similarity.sharedSubjects) {
    supportById.set(s.id.toLowerCase(), s.theirSupport);
  }
  for (const c of peer.claims) {
    const k = c.subjectId.toLowerCase();
    if (!supportById.has(k)) supportById.set(k, c.support);
  }

  const rows: DeckCompareRow[] = [];
  const ids = new Set([...myById.keys(), ...theirById.keys()]);

  for (const id of ids) {
    const mine = myById.get(id);
    const theirs = theirById.get(id);
    const theirSupport = supportById.get(id) ?? theirs?.support ?? null;

    let verdict: DeckCompareRow['verdict'];
    if (mine && theirs) {
      if (theirSupport === false) verdict = 'pass';
      else if (mine.rank === theirs.rank) verdict = 'same-rank';
      else verdict = 'agree';
    } else if (mine) verdict = 'you-only';
    else verdict = 'them-only';

    rows.push({
      id,
      label: mine?.label ?? theirs?.label ?? 'Pick',
      image: mine?.image ?? theirs?.image,
      myRank: mine?.rank ?? null,
      myTrust: mine?.trust ?? '—',
      theirRank: theirs?.rank ?? null,
      theirTrust: theirs?.trustLabel ?? '—',
      theirSupport,
      verdict,
    });
  }

  return rows.sort((a, b) => {
    const order = (r: DeckCompareRow) => {
      if (r.myRank != null && r.theirRank != null) return r.myRank;
      if (r.myRank != null) return r.myRank + 50;
      return (r.theirRank ?? 99) + 100;
    };
    return order(a) - order(b);
  });
}

function verdictChip(
  verdict: DeckCompareRow['verdict'],
  palette: DeckPaletteEntry,
): { label: string; color: string; bg: string; border: string } {
  switch (verdict) {
    case 'same-rank':
      return {
        label: 'Same #',
        color: palette.hex,
        bg: palette.soft,
        border: palette.line,
      };
    case 'agree':
      return {
        label: 'Agree',
        color: '#34d399',
        bg: 'rgba(16,185,129,0.1)',
        border: 'rgba(16,185,129,0.35)',
      };
    case 'pass':
      return {
        label: 'They passed',
        color: '#fb7185',
        bg: 'rgba(255,77,122,0.08)',
        border: 'rgba(255,77,122,0.35)',
      };
    case 'you-only':
      return {
        label: 'You only',
        color: '#94a3b8',
        bg: 'rgba(148,163,184,0.08)',
        border: 'rgba(148,163,184,0.25)',
      };
    default:
      return {
        label: 'Them only',
        color: '#94a3b8',
        bg: 'rgba(148,163,184,0.08)',
        border: 'rgba(148,163,184,0.25)',
      };
  }
}

const RankStakeCell: React.FC<{
  rank: number;
  trust: string;
  variant: 'you' | 'them';
  palette: DeckPaletteEntry;
}> = ({ rank, trust, variant, palette }) => {
  const isYou = variant === 'you';
  return (
    <div
      className="flex min-w-[6rem] flex-col items-center justify-center rounded-xl border-2 px-2.5 py-2.5 tabular-nums sm:min-w-[6.75rem]"
      style={
        isYou
          ? {
              borderColor: 'rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
            }
          : {
              borderColor: palette.line,
              background: palette.soft,
              color: palette.hex,
              boxShadow: `0 0 16px ${palette.hex}22`,
            }
      }
    >
      <span className="font-display text-2xl font-black leading-none sm:text-3xl">#{rank}</span>
      <span
        className="mt-1 font-mono text-sm font-black leading-none sm:text-base"
        style={{ color: isYou ? '#ffffff' : palette.hex }}
      >
        {trust !== '—' ? (
          <>
            {trust} <span className="opacity-90">{CURRENCY_SYMBOL}</span>
          </>
        ) : (
          '—'
        )}
      </span>
    </div>
  );
};

/* ============================== Peer List ============================== */

const PeerList: React.FC<{
  myDeckRows: MyDeckRow[];
  listIsOnChain: boolean;
  peersLoading: boolean;
  peers: ArenaComparePeer[];
  palette: DeckPaletteEntry;
  pendingStakeCount: number;
  batchMode: boolean;
  isWalletConnected: boolean;
  onAdoptPeer?: (peer: ArenaComparePeer) => void;
}> = ({
  myDeckRows,
  listIsOnChain,
  peersLoading,
  peers,
  palette,
  pendingStakeCount,
  batchMode,
  isWalletConnected,
  onAdoptPeer,
}) => {
  if (!listIsOnChain) {
    return (
      <EmptyState
        icon={<Users className="h-7 w-7 text-slate-600" strokeWidth={1.6} aria-hidden />}
        title="No on-chain peers yet"
        copy="Lists that live in the protocol surface real rankers here. Mint this contest on-chain to start matching."
      />
    );
  }
  if (peersLoading && peers.length === 0) {
    return (
      <EmptyState
        icon={<Loader2 className="h-7 w-7 animate-spin" style={{ color: palette.hex }} strokeWidth={1.8} aria-hidden />}
        title="Reading the graph"
        copy="Pulling other wallets’ indexed claims for this list…"
      />
    );
  }
  if (peers.length === 0) {
    const copyQueued =
      'Sign your rank stakes first — overlaps appear once other wallets stake on the same picks.';
    const copyNobodyElseOverlap =
      'No overlapping rankers yet. Someone else needs to stake on this list with picks that match yours.';
    const copyDisconnected =
      'Connect your wallet and finish Rank to see peers here.';
    const copyLegacy =
      'Waiting for another wallet with overlapping stakes on this list.';

    let title = 'No overlaps yet';
    let copyPeer = copyLegacy;

    if (batchMode && pendingStakeCount > 0) {
      title = 'Submit queued stakes';
      copyPeer = copyQueued;
    } else if (batchMode) {
      copyPeer = isWalletConnected ? copyNobodyElseOverlap : copyDisconnected;
    }

    const footer =
      listIsOnChain && batchMode ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
          <Link
            to="/climb?view=explorer"
            className="font-semibold text-cyan-300/90 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200"
          >
            Arena Explorer
          </Link>
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
          <Link
            to="/portfolio#arena-rankings"
            className="font-semibold text-cyan-300/90 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200"
          >
            My ranked lists
          </Link>
        </div>
      ) : undefined;

    return (
      <EmptyState
        icon={<Sparkles className="h-7 w-7 text-slate-600" strokeWidth={1.6} aria-hidden />}
        title={title}
        copy={copyPeer}
        footer={footer}
      />
    );
  }

  return (
    <ul className="divide-y divide-white/[0.05]">
      {peers.map((p, idx) => (
        <PeerRow
          key={p.player.address}
          peer={p}
          idx={idx}
          palette={palette}
          myDeckRows={myDeckRows}
          onAdopt={onAdoptPeer ? () => onAdoptPeer(p) : undefined}
        />
      ))}
    </ul>
  );
};

const PeerRow: React.FC<{
  peer: ArenaComparePeer;
  idx: number;
  palette: DeckPaletteEntry;
  myDeckRows: MyDeckRow[];
  onAdopt?: () => void;
}> = ({ peer, idx, palette, myDeckRows, onAdopt }) => {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const { player, similarity, listRanking } = peer;
  const name = peerDisplayName(player.label, player.address);
  const initial = name.replace(/^0x/, '').slice(0, 1).toUpperCase() || '?';
  const sharedTop = similarity.sharedSubjects.slice(0, 3);
  const canExpand = listRanking.length > 0 || myDeckRows.length > 0;
  const compareRows = useMemo(() => buildDeckCompareRows(myDeckRows, peer), [myDeckRows, peer]);
  const overlapRows = useMemo(
    () => compareRows.filter((r) => r.myRank != null && r.theirRank != null),
    [compareRows],
  );
  const theirOnlyRows = useMemo(
    () => compareRows.filter((r) => r.myRank == null && r.theirRank != null),
    [compareRows],
  );

  return (
    <li className="border-b border-white/[0.06] last:border-b-0">
      <div className="flex items-stretch gap-3 px-5 py-4 sm:px-6">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 font-display text-lg font-black tabular-nums"
          style={{
            borderColor: palette.line,
            background: palette.soft,
            color: palette.hex,
            boxShadow: `0 0 20px ${palette.hex}28`,
          }}
        >
          {idx + 1}
        </span>

        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 bg-[#070a10]"
          style={{ borderColor: palette.line }}
        >
          <ArenaPortraitImg src={player.image} className="h-full w-full object-cover" loading="lazy">
            <span className="font-display text-base font-black text-slate-400">{initial}</span>
          </ArenaPortraitImg>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[16px] font-black text-white">{name}</p>
            <span
              className="shrink-0 font-display text-2xl font-black tabular-nums leading-none sm:text-3xl"
              style={{ color: palette.hex, textShadow: `0 0 24px ${palette.hex}44` }}
            >
              {similarity.similarityPct}%
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs font-black uppercase tracking-wide text-slate-100 sm:text-sm">
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2.8} aria-hidden />
              <span className="tabular-nums text-white">{similarity.agreeCount}</span> agree
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-300">
              <XCircle className="h-4 w-4" strokeWidth={2.8} aria-hidden />
              <span className="tabular-nums text-white">{similarity.disagreeCount}</span> pass
            </span>
            <span className="tabular-nums text-white">
              {similarity.sharedCount} shared
            </span>
          </div>
          {sharedTop.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {sharedTop.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-md border-2 px-2.5 py-1.5 font-mono text-xs font-black tabular-nums sm:text-sm"
                  style={{
                    borderColor: s.theirSupport ? 'rgba(16,185,129,0.45)' : 'rgba(255,77,122,0.45)',
                    background: s.theirSupport ? 'rgba(16,185,129,0.12)' : 'rgba(255,77,122,0.1)',
                    color: s.theirSupport ? '#34d399' : '#fb7185',
                  }}
                >
                  <span className="text-white">#{s.myRank}</span>
                  <span className="max-w-[140px] truncate text-white">{s.label}</span>
                  {s.theirSupport ? '✓' : '✕'}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-1 flex shrink-0 flex-col gap-2">
          {onAdopt && peer.listRanking.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                playArenaUiClick();
                onAdopt();
              }}
              onMouseEnter={() => playArenaUiHover()}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border-2 px-3.5 font-mono text-xs font-black uppercase tracking-[0.12em] transition-colors hover:brightness-110"
              style={{
                borderColor: palette.hex,
                color: '#fff',
                background: `${palette.hex}33`,
              }}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              Adopt
            </button>
          ) : null}
          {canExpand ? (
            <button
              type="button"
              onClick={() => {
                playArenaUiClick();
                setExpanded((v) => !v);
              }}
              onMouseEnter={() => playArenaUiHover()}
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide comparison' : 'Compare your rank to theirs'}
              className="flex h-11 items-center gap-2 rounded-xl border-2 px-3.5 font-mono text-xs font-black uppercase tracking-[0.12em] transition-colors hover:bg-white/[0.06]"
              style={{
                borderColor: expanded ? palette.hex : palette.line,
                color: palette.hex,
                background: expanded ? `${palette.hex}18` : palette.soft,
              }}
            >
              {expanded ? 'Close' : 'Compare'}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out ${
                  expanded ? 'rotate-180' : ''
                }`}
                strokeWidth={2.6}
                aria-hidden
              />
            </button>
          ) : null}
        </div>
      </div>

      {/**
       * CSS grid collapse (not Framer `height: auto`) — avoids layout measurement every frame.
       * Panel content mounts only while open so closed peers stay light on the DOM.
       */}
      <div
        className={
          reduceMotion
            ? expanded
              ? 'block'
              : 'hidden'
            : 'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none'
        }
        style={reduceMotion ? undefined : { gridTemplateRows: expanded ? '1fr' : '0fr' }}
        aria-hidden={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          {expanded && canExpand ? (
            <div className="border-t border-white/[0.06] px-4 pb-5 pt-4 sm:px-6">
              <p className="font-mono text-xs font-black uppercase tracking-[0.18em] text-white sm:text-sm">
                Side-by-side · you vs {name}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-200">
                Your deck is above — this table only lines up shared picks.
              </p>

              {overlapRows.length > 0 ? (
                <div
                  className="mt-4 overflow-hidden rounded-xl border-2"
                  style={{ borderColor: `${palette.hex}44`, background: 'rgba(0,0,0,0.5)' }}
                >
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_5.75rem_5.75rem_5.25rem] gap-x-2 gap-y-0 border-b-2 px-3 py-3 font-mono text-xs font-black uppercase tracking-[0.12em] text-white sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_5.5rem] sm:px-4 sm:py-3.5 sm:text-sm"
                    style={{ borderColor: `${palette.hex}33`, background: `${palette.hex}10` }}
                  >
                    <span>Pick</span>
                    <span className="text-center">You · {CURRENCY_SYMBOL}</span>
                    <span className="text-center" style={{ color: palette.hex }}>
                      Them · {CURRENCY_SYMBOL}
                    </span>
                    <span className="text-right">Match</span>
                  </div>
                  <ul className="divide-y divide-white/[0.08]">
                    {overlapRows.map((row) => {
                      const chip = verdictChip(row.verdict, palette);
                      return (
                        <li
                          key={row.id}
                          className="grid grid-cols-[minmax(0,1fr)_5.75rem_5.75rem_5.25rem] items-center gap-x-2 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_5.5rem] sm:gap-x-3 sm:px-4 sm:py-3.5"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <ArenaPortraitImg
                              src={row.image}
                              className="h-9 w-9 shrink-0 rounded-md object-cover"
                              loading="lazy"
                            />
                            <span className="truncate text-base font-bold text-white sm:text-lg">{row.label}</span>
                          </div>
                          <RankStakeCell
                            rank={row.myRank!}
                            trust={row.myTrust}
                            variant="you"
                            palette={palette}
                          />
                          <RankStakeCell
                            rank={row.theirRank!}
                            trust={row.theirTrust}
                            variant="them"
                            palette={palette}
                          />
                          <span
                            className="justify-self-end rounded-lg border-2 px-2.5 py-1.5 font-mono text-xs font-black uppercase tracking-wide sm:text-sm"
                            style={{
                              color: chip.color,
                              background: chip.bg,
                              borderColor: chip.border,
                            }}
                          >
                            {chip.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-slate-500">No shared picks with this wallet yet.</p>
              )}

              {listRanking.length > 0 ? (
                <div
                  className="mt-4 rounded-xl border-2 p-3 sm:p-4"
                  style={{ borderColor: `${palette.hex}35`, background: `${palette.hex}08` }}
                >
                  <p
                    className="font-mono text-xs font-black uppercase tracking-[0.16em] sm:text-sm"
                    style={{ color: palette.hex }}
                  >
                    {name}&apos;s full ranking on this list
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-100">
                    Ordered by total {CURRENCY_SYMBOL} per pick (deposits add up if they rank again).
                  </p>
                  <ol className="mt-3 space-y-2">
                    {listRanking.map((row) => (
                      <li
                        key={row.subjectId}
                        className="flex items-center gap-3 rounded-lg border border-white/[0.1] bg-black/35 px-3 py-2.5"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 font-display text-base font-black tabular-nums sm:text-lg"
                          style={{
                            borderColor: palette.line,
                            background: palette.soft,
                            color: palette.hex,
                          }}
                        >
                          {row.rank}
                        </span>
                        <ArenaPortraitImg
                          src={row.image}
                          className="h-9 w-9 shrink-0 rounded-md object-cover"
                          loading="lazy"
                        />
                        <span className="min-w-0 flex-1 truncate text-base font-bold text-white sm:text-lg">
                          {row.label}
                        </span>
                        <span className="shrink-0 font-mono text-base font-black tabular-nums text-white sm:text-lg">
                          {row.trustLabel !== '—' ? (
                            <>
                              {row.trustLabel}{' '}
                              <span className="text-white/90">{CURRENCY_SYMBOL}</span>
                            </>
                          ) : (
                            <span className={`text-sm font-black ${row.support ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {row.support ? 'Yes' : 'Pass'}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {theirOnlyRows.length > 0 ? (
                    <p className="mt-3 text-[12px] font-medium text-slate-400">
                      + {theirOnlyRows.length} pick{theirOnlyRows.length === 1 ? '' : 's'} they ranked that
                      aren&apos;t in your deck.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  copy: string;
  footer?: React.ReactNode;
}> = ({ icon, title, copy, footer }) => (
  <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.03]">{icon}</span>
    <div>
      <p className="font-display text-base font-black text-white">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-slate-500">{copy}</p>
      {footer ? <div className="mx-auto mt-4 max-w-sm">{footer}</div> : null}
    </div>
  </div>
);
