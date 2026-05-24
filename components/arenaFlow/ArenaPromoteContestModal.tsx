import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Layers,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { formatEther } from 'viem';
import { CURRENCY_SYMBOL, EXPLORER_URL, CURVE_OFFSET } from '../../constants';
import { playArenaUiClick, playArenaUiHover } from '../../services/audio';
import {
  connectWallet,
  getMinClaimDeposit,
  getWalletBalance,
  markProxyApproved,
  parseProtocolError,
} from '../../services/web3';
import {
  ARENA_PROMOTE_MAX_MEMBERS,
  estimateArenaPromoteCost,
  promoteArenaListOnChain,
  type ArenaPromoteListItem,
  type ArenaPromoteListResult,
} from '../../services/arenaPromoteList';
import {
  ARENA_CARD_SURFACE,
  ARENA_SHADOWS,
  deckPalette,
  type DeckPaletteEntry,
} from '../../services/arenaCardDesign';

type TxStatus =
  | 'IDLE'
  | 'CALCULATING'
  | 'SIGNING'
  | 'BROADCASTING'
  | 'CONFIRMING'
  | 'SUCCESS'
  | 'ERROR';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Drives deck color theming. */
  listCategory?: string;
  /** Contest title saved on the list identity. */
  contestTitle: string;
  /** Optional description copied onto the list identity metadata. */
  contestDescription?: string;
  /** Members to anchor on-chain. Trimmed to ARENA_PROMOTE_MAX_MEMBERS by the service. */
  items: ArenaPromoteListItem[];
  walletAddress?: string | null;
  isWalletConnected?: boolean;
  /** Called once the promote tx succeeds. Caller registers the new portal list. */
  onPromoted: (result: ArenaPromoteListResult) => void;
  /**
   * When set (Rank → Publish and compare), runs promote + rank vault deposits in one
   * click so the wallet always prompts even if list/atoms/triples already exist.
   */
  onMintContest?: (input: {
    wallet: string;
    depositPerLeg: string;
    onProgress: (msg: string) => void;
  }) => Promise<ArenaPromoteListResult>;
};

const SUCCESS_COUNTDOWN_SEC = 10;
const DEFAULT_DEPOSIT_FALLBACK = formatEther(CURVE_OFFSET);

/**
 * "Mint contest on-chain" modal — promotes the current static list to a real
 * Intuition portal list. Mirrors `ArenaCreateCardModal` in shape so the on-chain
 * UX language stays consistent across the Arena flow.
 */
export const ArenaPromoteContestModal: React.FC<Props> = ({
  isOpen,
  onClose,
  listCategory,
  contestTitle,
  contestDescription,
  items,
  walletAddress,
  isWalletConnected,
  onPromoted,
  onMintContest,
}) => {
  const palette = useMemo(() => deckPalette(listCategory), [listCategory]);
  const [minDeposit, setMinDeposit] = useState<string>(DEFAULT_DEPOSIT_FALLBACK);
  const [walletBalance, setWalletBalance] = useState<string>('—');
  const [txStatus, setTxStatus] = useState<TxStatus>('IDLE');
  const [txError, setTxError] = useState<string | null>(null);
  const [txProgress, setTxProgress] = useState<string>('');
  const [txLastHash, setTxLastHash] = useState<`0x${string}` | null>(null);
  const [promoteResult, setPromoteResult] = useState<ArenaPromoteListResult | null>(null);
  const continuedRef = useRef(false);

  const handleContinueAfterSuccess = useCallback(() => {
    if (continuedRef.current || !promoteResult) return;
    continuedRef.current = true;
    playArenaUiClick();
    onPromoted(promoteResult);
  }, [onPromoted, promoteResult]);

  /** Members the service will actually anchor — capped + filtered. */
  const effectiveItems = useMemo(
    () => items.filter((it) => (it.label || '').trim()).slice(0, ARENA_PROMOTE_MAX_MEMBERS),
    [items],
  );

  const estCost = useMemo(
    () =>
      estimateArenaPromoteCost({
        memberCount: effectiveItems.length,
        depositPerLeg: minDeposit,
      }),
    [effectiveItems.length, minDeposit],
  );

  /* ──────────────── Lifecycle ──────────────── */

  useEffect(() => {
    if (!isOpen) return;
    setTxStatus('IDLE');
    setTxError(null);
    setTxProgress('');
    setTxLastHash(null);
    setPromoteResult(null);
    continuedRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    getMinClaimDeposit()
      .then(setMinDeposit)
      .catch(() => setMinDeposit(DEFAULT_DEPOSIT_FALLBACK));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !walletAddress) return;
    getWalletBalance(walletAddress)
      .then(setWalletBalance)
      .catch(() => setWalletBalance('—'));
  }, [isOpen, walletAddress]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || txInFlight(txStatus)) return;
      if (txStatus === 'SUCCESS') {
        handleContinueAfterSuccess();
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, txStatus, handleContinueAfterSuccess]);

  const balanceNum = parseFloat(walletBalance);
  const insufficientFunds = Number.isFinite(balanceNum) && balanceNum < estCost;
  const inFlight = txInFlight(txStatus);

  /* ──────────────── Promote ──────────────── */

  const handlePromote = async () => {
    if (!walletAddress || !isWalletConnected) {
      await connectWallet();
      return;
    }
    if (insufficientFunds) return;
    if (effectiveItems.length === 0) return;

    setTxStatus('CALCULATING');
    setTxError(null);
    setTxProgress('Preparing list identity…');

    try {
      setTxStatus('SIGNING');
      const progress = (m: string) => {
        setTxProgress(m);
        const lower = m.toLowerCase();
        if (lower.includes('signature') || lower.includes('signing') || lower.includes('awaiting')) {
          setTxStatus('SIGNING');
        } else if (lower.includes('broadcast') || lower.includes('total send') || lower.includes('preparing')) {
          setTxStatus('BROADCASTING');
        } else if (lower.includes('anchored') || lower.includes('confirmation') || lower.includes('confirming')) {
          setTxStatus('CONFIRMING');
        }
      };
      const result = onMintContest
        ? await onMintContest({ wallet: walletAddress, depositPerLeg: minDeposit, onProgress: progress })
        : await promoteArenaListOnChain({
            title: contestTitle,
            description: contestDescription,
            items: effectiveItems,
            wallet: walletAddress,
            depositPerLeg: minDeposit,
            onProgress: progress,
          });
      markProxyApproved(walletAddress);
      setTxLastHash(result.triplesTxHash);
      setPromoteResult(result);
      setTxStatus('SUCCESS');
      setTxProgress('Batch confirmed on-chain.');
    } catch (e: any) {
      console.error('promoteArenaListOnChain failed:', e);
      setTxError(parseProtocolError(e));
      setTxStatus('ERROR');
    }
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          aria-modal
          role="dialog"
          aria-labelledby="arena-promote-title"
        >
          <button
            type="button"
            aria-label="Close"
            disabled={inFlight}
            onClick={onClose}
            className="absolute inset-0 bg-black/72 backdrop-blur-[2px] disabled:cursor-not-allowed"
          />

          <motion.div
            initial={{ scale: 0.96, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border"
            style={{
              background: ARENA_CARD_SURFACE.bodyBg,
              borderColor: palette.line,
              boxShadow: ARENA_SHADOWS.cardLifted,
            }}
          >
            <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: palette.hex }} aria-hidden />

            <header
              className="flex items-center justify-between px-5 py-3.5"
              style={{ background: palette.hex, color: palette.contrastText }}
            >
              <div className="min-w-0">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] opacity-85">
                  {palette.label} · Promote contest
                </p>
                <h2
                  id="arena-promote-title"
                  className="truncate font-display text-base font-black uppercase tracking-tight"
                >
                  Mint “{contestTitle}” on-chain
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={inFlight}
                onClick={() => {
                  playArenaUiClick();
                  if (txStatus === 'SUCCESS') {
                    handleContinueAfterSuccess();
                  } else {
                    onClose();
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-md transition-[background] disabled:opacity-40"
                style={{ background: 'rgba(0,0,0,0.18)', color: palette.contrastText }}
              >
                <X className="h-4 w-4" strokeWidth={2.6} aria-hidden />
              </button>
            </header>

            {txStatus === 'IDLE' || txStatus === 'ERROR' ? (
              <FormView
                palette={palette}
                contestTitle={contestTitle}
                contestDescription={contestDescription}
                effectiveItems={effectiveItems}
                rawItemCount={items.length}
                minDeposit={minDeposit}
                estCost={estCost}
                walletAddress={walletAddress ?? null}
                walletBalance={walletBalance}
                isWalletConnected={Boolean(isWalletConnected)}
                insufficientFunds={insufficientFunds}
                txError={txStatus === 'ERROR' ? txError : null}
                onCancel={() => {
                  playArenaUiClick();
                  onClose();
                }}
                onPromote={() => {
                  playArenaUiHover();
                  handlePromote();
                }}
              />
            ) : (
              <TxView
                palette={palette}
                status={txStatus}
                progress={txProgress}
                hash={txLastHash}
                countdownSeconds={SUCCESS_COUNTDOWN_SEC}
                onContinue={txStatus === 'SUCCESS' ? handleContinueAfterSuccess : undefined}
                onClose={() => {
                  if (txStatus === 'SUCCESS') {
                    handleContinueAfterSuccess();
                  } else if (!inFlight) {
                    onClose();
                  }
                }}
              />
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

/* ============================== Form View ============================== */

const FormView: React.FC<{
  palette: DeckPaletteEntry;
  contestTitle: string;
  contestDescription?: string;
  effectiveItems: ArenaPromoteListItem[];
  rawItemCount: number;
  minDeposit: string;
  estCost: number;
  walletAddress: string | null;
  walletBalance: string;
  isWalletConnected: boolean;
  insufficientFunds: boolean;
  txError: string | null;
  onCancel: () => void;
  onPromote: () => void;
}> = ({
  palette,
  contestTitle,
  contestDescription,
  effectiveItems,
  rawItemCount,
  minDeposit,
  estCost,
  walletAddress,
  walletBalance,
  isWalletConnected,
  insufficientFunds,
  txError,
  onCancel,
  onPromote,
}) => {
  const trimmed = rawItemCount > effectiveItems.length;
  const balanceNum = parseFloat(walletBalance);
  const submitLabel = !isWalletConnected
    ? 'Connect wallet'
    : `Mint contest, ~${estCost} ${CURRENCY_SYMBOL}`;
  const canSubmit = isWalletConnected && !insufficientFunds && effectiveItems.length > 0;

  return (
    <div className="px-5 py-5">
      <p className="text-[12px] leading-relaxed text-slate-400">
        Promoting writes the <span className="font-semibold text-slate-200">list identity</span> plus one membership
        triple per row. When it is live, everyone ranks the same on-chain leaderboard so similarity is real.
      </p>

      {/* Plan summary */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <PlanStat icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2.4} />} label="List identity" value="1" palette={palette} />
        <PlanStat icon={<Layers className="h-3.5 w-3.5" strokeWidth={2.4} />} label="Members" value={String(effectiveItems.length)} palette={palette} />
        <PlanStat icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.4} />} label="Triples" value={String(effectiveItems.length)} palette={palette} />
      </div>

      {trimmed ? (
        <p className="mt-3 text-[11px] leading-snug text-amber-300/85">
          Trimmed to first {effectiveItems.length} of {rawItemCount} rows (per-call cap). Re-promote later to attach the
          remainder to the same list identity.
        </p>
      ) : null}

      {/* Wallet status */}
      <div
        className="mt-4 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
        style={{
          borderColor: insufficientFunds ? 'rgba(255,77,122,0.4)' : ARENA_CARD_SURFACE.edgeMuted,
          background: insufficientFunds ? 'rgba(255,77,122,0.06)' : 'rgba(255,255,255,0.02)',
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ background: palette.soft, color: palette.hex }}
          >
            <Wallet className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Wallet</p>
            <p className="truncate font-mono text-[11px] font-bold text-slate-200">
              {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'not connected'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Need / have</p>
          <p
            className="font-mono text-[11px] font-bold tabular-nums"
            style={{ color: insufficientFunds ? '#fb7185' : '#e2e8f0' }}
          >
            ~{estCost} / {Number.isFinite(balanceNum) ? balanceNum.toFixed(3) : '—'} {CURRENCY_SYMBOL}
          </p>
        </div>
      </div>

      {/* Preview members */}
      <div className="mt-4">
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Going on-chain</p>
        <ul className="mt-2 max-h-[140px] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/30 p-2">
          {effectiveItems.slice(0, 8).map((it) => (
            <li key={it.id} className="flex items-center gap-2 px-2 py-1.5">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm font-mono text-[9px] font-black"
                style={{ background: palette.soft, color: palette.hex }}
              >
                ◆
              </span>
              <span className="truncate text-[11px] text-slate-200">{it.label}</span>
            </li>
          ))}
          {effectiveItems.length > 8 ? (
            <li className="px-2 pt-1 text-center font-mono text-[10px] text-slate-600">
              + {effectiveItems.length - 8} more
            </li>
          ) : null}
        </ul>
        {contestDescription ? (
          <p className="mt-2 text-[11px] text-slate-500">{contestDescription}</p>
        ) : null}
      </div>

      {txError ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5"
          style={{ borderColor: 'rgba(255,77,122,0.4)', background: 'rgba(255,77,122,0.06)' }}
        >
          <AlertCircle className="mt-[1px] h-4 w-4 shrink-0 text-rose-400" strokeWidth={2.4} />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-black uppercase tracking-wider text-rose-300">Tx failed</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-300">{txError}</p>
          </div>
        </div>
      ) : null}

      <footer className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-white/12 bg-black/30 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isWalletConnected && !canSubmit}
          onClick={onPromote}
          className="group inline-flex flex-[1.4] items-center justify-center gap-2 rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] shadow-[0_12px_28px_rgba(0,0,0,0.45)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
          style={{ background: palette.hex, color: palette.contrastText }}
        >
          {!isWalletConnected ? (
            <Wallet className="h-4 w-4" strokeWidth={2.6} />
          ) : (
            <Sparkles className="h-4 w-4" strokeWidth={2.6} />
          )}
          {submitLabel}
        </button>
      </footer>

      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-wider text-slate-600">
        Min deposit / leg · {minDeposit} {CURRENCY_SYMBOL}
      </p>
    </div>
  );
};

/* ============================== Tx View ============================== */

const TxView: React.FC<{
  palette: DeckPaletteEntry;
  status: TxStatus;
  progress: string;
  hash: `0x${string}` | null;
  countdownSeconds?: number;
  onContinue?: () => void;
  onClose: () => void;
}> = ({ palette, status, progress, hash, countdownSeconds = 10, onContinue, onClose }) => {
  const isSuccess = status === 'SUCCESS';
  const isError = status === 'ERROR';
  const Icon = isSuccess ? CheckCircle2 : isError ? AlertCircle : Loader2;
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);

  useEffect(() => {
    if (!isSuccess || !onContinue) return;
    setSecondsLeft(countdownSeconds);
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          onContinue();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isSuccess, onContinue, countdownSeconds]);

  return (
    <motion.div className="px-5 py-7">
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: isError ? 'rgba(255,77,122,0.14)' : palette.soft }}
        >
          <Icon
            className={`h-7 w-7 ${isError ? 'text-rose-400' : isSuccess ? 'text-emerald-300' : 'animate-spin'}`}
            strokeWidth={2.2}
            style={!isError && !isSuccess ? { color: palette.hex } : undefined}
            aria-hidden
          />
        </span>
        <div>
          <p
            className="font-mono text-[10px] font-black uppercase tracking-[0.22em]"
            style={{ color: isError ? '#fb7185' : isSuccess ? '#34d399' : palette.hex }}
          >
            {statusLabel(status)}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{progress || defaultProgress(status)}</p>
        </div>
        {hash ? (
          <a
            href={`${EXPLORER_URL}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            View tx <ExternalLink className="h-3 w-3" strokeWidth={2.4} />
          </a>
        ) : null}
        {isSuccess ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Continuing to compare in {secondsLeft}s
          </p>
        ) : null}
        {isSuccess || isError ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-2 rounded-xl border border-white/12 bg-black/30 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            {isSuccess ? 'Continue to compare' : 'Close'}
          </button>
        ) : null}
      </div>
    </motion.div>
  );
};

/* ============================== Atoms ============================== */

const PlanStat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  palette: DeckPaletteEntry;
}> = ({ icon, label, value, palette }) => (
  <div
    className="flex flex-col gap-1 rounded-xl border px-3 py-3"
    style={{ borderColor: ARENA_CARD_SURFACE.edgeMuted, background: 'rgba(255,255,255,0.02)' }}
  >
    <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
      <span style={{ color: palette.hex }}>{icon}</span>
      {label}
    </span>
    <span className="font-display text-xl font-black tabular-nums text-white">{value}</span>
  </div>
);

/* ============================== Helpers ============================== */

function txInFlight(s: TxStatus): boolean {
  return s === 'CALCULATING' || s === 'SIGNING' || s === 'BROADCASTING' || s === 'CONFIRMING';
}

function statusLabel(s: TxStatus): string {
  switch (s) {
    case 'CALCULATING':
      return 'Preparing';
    case 'SIGNING':
      return 'Awaiting signature';
    case 'BROADCASTING':
      return 'Broadcasting';
    case 'CONFIRMING':
      return 'Confirming on-chain';
    case 'SUCCESS':
      return 'Contest is live';
    case 'ERROR':
      return 'Failed';
    default:
      return '';
  }
}

function defaultProgress(s: TxStatus): string {
  switch (s) {
    case 'CALCULATING':
      return 'Working out cost and gas…';
    case 'SIGNING':
      return 'Confirm in your wallet.';
    case 'BROADCASTING':
      return 'Sending identities and triples…';
    case 'CONFIRMING':
      return 'Waiting for the indexer to surface the new list…';
    case 'SUCCESS':
      return 'Batch confirmed on-chain.';
    case 'ERROR':
      return 'See the error and try again.';
    default:
      return '';
  }
}
