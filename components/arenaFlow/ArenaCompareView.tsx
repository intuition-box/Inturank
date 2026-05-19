import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Layers,
  Loader2,
  Medal,
  PenLine,
  Radio,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Trophy,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import type { ArenaComparePeer, RankItem } from '../../pages/RankedList';
import { playArenaUiClick, playArenaUiHover } from '../../services/audio';
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
  /** Drives the contest's solid color theme. */
  listCategory?: string;
  /** Real-data peers (sorted DESC by similarity). Empty when no on-chain overlap. */
  peers: ArenaComparePeer[];
  /** True while the peer fetch is in flight. */
  peersLoading: boolean;
  /** Whether this list lives on-chain (only then is comparison meaningful). */
  listIsOnChain: boolean;
  /** Aggregated similarity vs the comparable peer set — `null` when no data. */
  similarityPct: number | null;
  /** Player's position in the global leaderboard, if known. */
  progressionPct: number | null;
  /** Games-to-top-10 (0 if already inside top-10, `null` when place unknown). */
  gamesToTop10Hint: number | null;
  /** Contest is off-chain — submitting will promote the list (mint atom + member triples). */
  pendingPromote: boolean;
  /** Locally created deck rows (`pending-card-…`) — session placeholders, not signing targets yet. */
  pendingCardCount: number;
  /** Number of rank-stake rows queued in the batch cart. */
  pendingStakeCount: number;
  /** Batch / conviction-cart flow (vs legacy per-pick sends). */
  batchMode?: boolean;
  /** Whether a wallet is connected. Affects CTA copy. */
  isWalletConnected?: boolean;
  /** Primary CTA — runs the commit chain then advances to the next game. */
  onSubmitAndContinue: () => void;
  onRandomGame: () => void;
  onPickNextGame: () => void;
  /** Opens batch review so the user can sign queued rows (this list or others). */
  onOpenConvictionCart?: () => void;
  onOpenSignal?: () => void;
  contestTitle?: string;
  poolParticipantCount?: number;
  listStakersCount?: number | null;
  listStakersLoading?: boolean;
};

function shortAddr(a: string): string {
  const t = a.trim();
  if (t.length < 12) return t || '—';
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
 * clearly labelled as such — never fabricated.
 */
export const ArenaCompareView: React.FC<Props> = ({
  deck,
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
  onOpenConvictionCart,
  onOpenSignal,
  contestTitle,
  poolParticipantCount,
  listStakersCount,
  listStakersLoading,
}) => {
  const palette = useMemo(() => deckPalette(listCategory), [listCategory]);
  const topFive = deck.slice(0, 5);
  const totalPeers = peers.length;
  const topPeer = peers[0] ?? null;

  /** Wallet-sign targets only: contest promotion + queued rank stakes — not Create Card rows alone. */
  const hasPendingWrites = pendingPromote || pendingStakeCount > 0;
  /** Lines included in the wallet-sign batch (promote modal + rank batch only). */
  const queuedChainItems: string[] = [];
  if (pendingPromote) queuedChainItems.push('Anchor this contest on-chain (promote)');
  if (pendingStakeCount > 0)
    queuedChainItems.push(
      `Stake ${pendingStakeCount} rank deposit${pendingStakeCount === 1 ? '' : 's'} on-chain`,
    );
  /** Deck rows from Create Card — session-local placeholders; not yet submitted as atoms in Compare. */
  const sessionDeckNote =
    pendingCardCount > 0
      ? `${pendingCardCount} card${pendingCardCount === 1 ? '' : 's'} from Create Card — in your deck for this session only (not part of signing yet)`
      : null;

  return (
    <ArenaContestStepShell
      chromeTitle={`Compare · ${palette.label}`}
      maxWidthClass="max-w-none"
      innerPaddingClassName="px-3 py-5 sm:px-4 sm:py-6 md:px-5 md:py-7 lg:px-6 xl:px-8"
    >
      {/* HEADER */}
      <div className="flex flex-col gap-3">
        <p
          className="font-mono text-[10px] font-black uppercase tracking-[0.32em]"
          style={{ color: palette.hex }}
        >
          Step 3 · Compare · {palette.label}
        </p>
        <h2 className="font-display text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl md:text-[2rem]">
          Your deck vs the board
        </h2>
        {contestTitle ? (
          <div
            className="rounded-2xl border border-white/[0.08] bg-[#05070c]/80 px-4 py-3 sm:px-5"
            style={{ boxShadow: ARENA_SHADOWS.cardResting }}
          >
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.28em] text-slate-500">Contest</p>
            <p className="mt-1 font-display text-lg font-black text-white">{contestTitle}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
              {typeof poolParticipantCount === 'number' ? (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Users className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  Pool · {poolParticipantCount} pick{poolParticipantCount === 1 ? '' : 's'}
                </span>
              ) : null}
              {(listStakersLoading || listStakersCount != null) && (
                <span className="tabular-nums text-slate-500">
                  {listStakersLoading
                    ? 'On-chain rankers …'
                    : listStakersCount != null &&
                      `${listStakersCount.toLocaleString()} wallet${listStakersCount === 1 ? '' : 's'} ranked (approx.)`}
                </span>
              )}
            </div>
          </div>
        ) : null}
        <p className="max-w-2xl text-[13px] leading-relaxed text-slate-400">
          {listIsOnChain
            ? 'Every peer here actually staked on this list on-chain. Similarity is computed against their real picks — not a guess.'
            : 'This contest isn’t on-chain yet, so we can’t pair you with verified rankers. Numbers shown below are scoped to your own deck only.'}
        </p>
        <p className="max-w-2xl text-[12px] leading-relaxed text-slate-500 border-l-2 border-white/[0.08] pl-3">
          <span className="font-semibold text-slate-400">Your own ranks</span> land in the success receipt after you sign. See every signed list (ordered, yes/no) under{' '}
          <Link
            to="/portfolio#arena-rankings"
            className="font-semibold text-cyan-300/90 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200"
          >
            Portfolio → My ranked lists
          </Link>
          , or skim the live feed in{' '}
          <Link to="/climb?view=explorer" className="font-semibold text-cyan-300/90 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200">
            Climb → Explorer
          </Link>
          .{' '}
          <span className="text-slate-500">
            Closest rankers compares your deck to others who have indexed stakes on this list (not only global leaderboard).
            Similarity stays empty until someone else overlaps your picks — after you sign, wait for the indexer or refresh Compare.
          </span>
        </p>
      </div>

      {/* 2-COLUMN COMPOSITION */}
      <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-7">
        {/* ============================ LEFT — DECK + PEERS ============================ */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* ── Your top-5 mini deck preview ─────────────────── */}
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
                Your top {Math.min(5, topFive.length)}
              </p>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-600">
                {deck.length} total
              </span>
            </div>
            {topFive.length === 0 ? (
              <p className="mt-3 text-[12px] italic text-slate-500">
                You haven’t ranked any cards yet — go back to Rank to build a deck.
              </p>
            ) : (
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {topFive.map((c, i) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-display text-base font-black tabular-nums"
                      style={{ background: palette.soft, color: palette.hex }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-slate-100">{c.label}</p>
                      {c.subtitle ? (
                        <p className="truncate text-[10px] text-slate-500">{c.subtitle}</p>
                      ) : null}
                    </div>
                    <ArenaPortraitImg
                      src={c.image}
                      loading="lazy"
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Peer comparison list ─────────────────────────── */}
          <div
            className="rounded-2xl border"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: ARENA_CARD_SURFACE.edgeMuted,
              boxShadow: ARENA_SHADOWS.cardResting,
            }}
          >
            <div className="flex items-baseline justify-between border-b border-white/[0.05] px-5 py-4">
              <div>
                <p
                  className="font-mono text-[10px] font-black uppercase tracking-[0.22em]"
                  style={{ color: palette.hex }}
                >
                  Closest rankers
                </p>
                <p className="mt-1 text-[12px] text-slate-400">
                  {listIsOnChain
                    ? 'Players on the live leaderboard, sorted by real overlap with your deck.'
                    : 'Available once this contest mints on-chain.'}
                </p>
              </div>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-600">
                {peersLoading ? 'syncing' : `${totalPeers} match${totalPeers === 1 ? '' : 'es'}`}
              </span>
            </div>

            <PeerList
              listIsOnChain={listIsOnChain}
              peersLoading={peersLoading}
              peers={peers}
              palette={palette}
              pendingStakeCount={pendingStakeCount}
              batchMode={batchMode}
              isWalletConnected={isWalletConnected}
            />
          </div>
        </div>

        {/* ============================ RIGHT — RICH RAIL ============================ */}
        <aside className="flex min-w-0 flex-col gap-4">
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
                    ? batchMode && pendingStakeCount < 1
                      ? 'We only score overlap when another wallet has indexed YES/NO stakes on this list that match subjects in your deck. Empty right after you sign is normal until the subgraph catches up — and until someone else ranks overlapping entries.'
                      : batchMode && pendingStakeCount > 0
                        ? 'After you sign your queued deposits, similarities can populate as peers appear on-chain.'
                        : 'No overlapping rankers loaded yet — keep playing or check back after indexer sync.'
                    : 'Mint this contest on-chain to unlock real comparison vs other players.'}
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
                Rank a few lists on-chain to appear on the leaderboard — your progression will track from there.
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
                      <span className="font-semibold text-slate-200">You’re inside the top 10 — defend it.</span>
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
              borderColor: hasPendingWrites ? palette.line : ARENA_CARD_SURFACE.edgeMuted,
            }}
          >
            {/* Queued writes preview — only when there is something to commit */}
            {queuedChainItems.length > 0 ? (
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

            {sessionDeckNote ? (
              <div className="mb-1 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Session deck
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{sessionDeckNote}</p>
              </div>
            ) : null}

            {/* Honest explanation when Compare would otherwise imply a Sign that isn’t surfaced */}
            {listIsOnChain && batchMode && !hasPendingWrites && !pendingPromote ? (
              <div className="mb-1 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5">
                <p className="text-[11px] leading-snug text-slate-400">
                  <span className="font-semibold text-slate-200">Signing</span> runs from{' '}
                  <span className="text-slate-200">queued rank deposits</span> (Curate + wallet + Agree). None are queued
                  for this list yet, so you only see Pick next — or open the cart below to review / submit anything queued
                  for other contests.
                </p>
              </div>
            ) : null}

            {/* PRIMARY — adapts to whether there are pending writes */}
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
                  Pick my next game
                </>
              )}
              <ArrowRight size={14} strokeWidth={2.6} className="transition-transform group-hover:translate-x-0.5" />
            </button>

            {/* Skip signing — quieter so the rail matches “one job” */}
            {hasPendingWrites ? (
              <button
                type="button"
                onClick={() => {
                  playArenaUiClick();
                  onPickNextGame();
                }}
                className="w-full py-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
              >
                Skip without signing · next game
              </button>
            ) : null}

            {batchMode && onOpenConvictionCart && !hasPendingWrites ? (
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

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  playArenaUiClick();
                  onRandomGame();
                }}
                onMouseEnter={() => playArenaUiHover()}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-200 transition-colors hover:bg-white/[0.04] hover:text-white ${onOpenSignal ? 'flex-1' : 'w-full'}`}
              >
                <Shuffle className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.2} aria-hidden />
                Random
              </button>
              {onOpenSignal ? (
                <button
                  type="button"
                  onClick={() => {
                    playArenaUiClick();
                    onOpenSignal();
                  }}
                  onMouseEnter={() => playArenaUiHover()}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white"
                  style={{ background: palette.soft }}
                >
                  <Radio className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.2} aria-hidden />
                  Signal
                </button>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </ArenaContestStepShell>
  );
};

/* ============================== Peer List ============================== */

const PeerList: React.FC<{
  listIsOnChain: boolean;
  peersLoading: boolean;
  peers: ArenaComparePeer[];
  palette: DeckPaletteEntry;
  pendingStakeCount: number;
  batchMode: boolean;
  isWalletConnected: boolean;
}> = ({ listIsOnChain, peersLoading, peers, palette, pendingStakeCount, batchMode, isWalletConnected }) => {
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
      'Queued deposits are not live until you tap Sign + pick next game. Overlap scores need indexed YES/NO stakes on this list from other wallets — we scan leaderboard rankers and recent list rankers; give the subgraph a minute after signing.';
    const copyNobodyElseOverlap =
      'We compare your deck to other wallets that have stakes on this list (leaderboard + recent list rankers). You never appear beside yourself — stays empty until someone else overlaps your entries or the indexer catches up.';
    const copyDisconnected =
      'Connect your wallet, then Curate → Agree to queue rank stakes. After you sign from Compare, overlaps can populate here.';
    const copyLegacy =
      'Closest rankers needs overlapping indexed stakes on this list — not guesses.';

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
        <PeerRow key={p.player.address} peer={p} idx={idx} palette={palette} />
      ))}
    </ul>
  );
};

const PeerRow: React.FC<{ peer: ArenaComparePeer; idx: number; palette: DeckPaletteEntry }> = ({
  peer,
  idx,
  palette,
}) => {
  const { player, similarity } = peer;
  const name = peerDisplayName(player.label, player.address);
  const initial = name.replace(/^0x/, '').slice(0, 1).toUpperCase() || '–';
  const sharedTop = similarity.sharedSubjects.slice(0, 3);

  return (
    <li className="flex items-stretch gap-3 px-5 py-4">
      {/* Rank pill */}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-display text-sm font-black tabular-nums"
        style={{ background: palette.soft, color: palette.hex }}
      >
        {idx + 1}
      </span>

      {/* Avatar */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-[#070a10]"
        style={{ borderColor: palette.line }}
      >
        <ArenaPortraitImg src={player.image} className="h-full w-full object-cover" loading="lazy">
          <span className="font-display text-base font-black text-slate-400">{initial}</span>
        </ArenaPortraitImg>
      </div>

      {/* Identity + shared chips */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-slate-100">{name}</p>
          <span
            className="shrink-0 font-mono text-[12px] font-black tabular-nums"
            style={{ color: palette.hex }}
          >
            {similarity.similarityPct}%
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <CheckCircle2 className="h-3 w-3" strokeWidth={2.6} aria-hidden />
            {similarity.agreeCount} agree
          </span>
          <span className="inline-flex items-center gap-1 text-rose-300/85">
            <XCircle className="h-3 w-3" strokeWidth={2.6} aria-hidden />
            {similarity.disagreeCount} pass
          </span>
          <span className="text-slate-600">
            {similarity.sharedCount} shared · {player.listsPlayed || 0} lists played
          </span>
        </div>
        {sharedTop.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {sharedTop.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] font-bold tabular-nums"
                style={{
                  borderColor: s.theirSupport ? 'rgba(16,185,129,0.35)' : 'rgba(255,77,122,0.35)',
                  background: s.theirSupport ? 'rgba(16,185,129,0.08)' : 'rgba(255,77,122,0.06)',
                  color: s.theirSupport ? '#34d399' : '#fb7185',
                }}
              >
                <span className="text-slate-500">#{s.myRank}</span>
                <span className="max-w-[140px] truncate text-slate-100">{s.label}</span>
                {s.theirSupport ? '✓' : '✕'}
              </span>
            ))}
            {similarity.sharedCount > sharedTop.length ? (
              <span className="font-mono text-[10px] text-slate-600">
                +{similarity.sharedCount - sharedTop.length} more
              </span>
            ) : null}
          </div>
        ) : null}
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
