import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, Loader2, Minus, Plus, FileText, Coins, Flame, Layers, Trash2 } from 'lucide-react';
import { playArenaUiClick } from '../services/audio';
import type { ArenaPendingRow } from '../services/arenaPendingBatch';

export type ArenaBatchModalRow = ArenaPendingRow & {
  sourceListId: string;
  /** List title from registry — shown when batch spans multiple lists. */
  sourceListTitle?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  themeShort: string;
  contextSuffix: string;
  stakeLabel: string;
  rows: ArenaBatchModalRow[];
  onUpdateUnits: (sourceListId: string, key: string, units: number) => void;
  onToggleSupport: (sourceListId: string, key: string) => void;
  onRemove: (sourceListId: string, key: string) => void;
  /** Drops every queued row (after confirm); optional so older call sites stay valid. */
  onClearAll?: () => void;
  onSubmit: () => void;
  submitting: boolean;
  /** Live status text shown under the spinner (e.g. "Resolving 3 vaults…"). */
  submitProgress?: string | null;
  /** True when stake × units is below curve minimum on any row — submit would revert. */
  depositBlocked?: boolean;
  /** Protocol minimum TRUST label from `CURVE_OFFSET` (e.g. `"0.1"`). */
  minDepositLabel?: string;
};

function kindIcon(kind: ArenaPendingRow['item']['kind']) {
  switch (kind) {
    case 'token':
      return <Coins size={14} className="text-intuition-warning/95" strokeWidth={2.2} />;
    case 'atom':
      return <Flame size={14} className="text-intuition-primary/95" strokeWidth={2.2} />;
    default:
      return <FileText size={14} className="text-slate-300/95" strokeWidth={2.2} />;
  }
}

const ArenaBatchReviewModal: React.FC<Props> = ({
  open,
  onClose,
  themeShort,
  contextSuffix,
  stakeLabel,
  rows,
  onUpdateUnits,
  onToggleSupport,
  onRemove,
  onClearAll,
  onSubmit,
  submitting,
  submitProgress,
  depositBlocked = false,
  minDepositLabel,
}) => {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const requestClose = useCallback(() => {
    setConfirmClearAll(false);
    onClose();
  }, [onClose]);

  const stakeN = useMemo(() => {
    const t = parseFloat(stakeLabel);
    return Number.isFinite(t) ? t : 0;
  }, [stakeLabel]);

  const minClaim = useMemo(() => {
    const t = parseFloat(minDepositLabel || '');
    return Number.isFinite(t) ? t : 0;
  }, [minDepositLabel]);

  const rowBelowMinimum = useCallback(
    (units: number) => minClaim > 0 && stakeN * units < minClaim - 1e-12,
    [minClaim, stakeN],
  );

  const rowsNeedAttention = depositBlocked || rows.some((r) => rowBelowMinimum(r.units));

  useEffect(() => {
    if (!open) setConfirmClearAll(false);
  }, [open]);

  useEffect(() => {
    if (rows.length === 0) setConfirmClearAll(false);
  }, [rows.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playArenaUiClick();
        if (confirmClearAll) setConfirmClearAll(false);
        else requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirmClearAll, requestClose]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const target = e.target as Node | null;
      if (target && !panelRef.current.contains(target)) {
        requestClose();
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open, requestClose]);

  const trustTotal = useMemo(() => {
    if (stakeN <= 0) return 0;
    let t = 0;
    for (const r of rows) t += stakeN * r.units;
    return t;
  }, [rows, stakeN]);

  const springPop = { type: 'spring' as const, stiffness: 420, damping: 32, mass: 0.85 };

  return createPortal(
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div
          key="arena-batch-popup"
          className="fixed inset-0 z-[600] pointer-events-none"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="arena-batch-title"
            aria-describedby="arena-batch-desc"
            className="pointer-events-auto fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(max(1rem,env(safe-area-inset-bottom,0px))+5rem)] md:bottom-[calc(max(1rem,env(safe-area-inset-bottom,0px))+4.5rem)] z-10 w-[min(92vw,440px)] max-h-[min(74dvh,640px)] flex flex-col overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-950/96 shadow-[0_28px_72px_rgba(0,0,0,0.78)] md:backdrop-blur-xl"
            initial={reduceMotion ? { opacity: 0, scale: 0.98 } : { opacity: 0, scale: 0.88, y: 34, x: 8 }}
            animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 26, x: 8 }}
            transition={reduceMotion ? { duration: 0.2 } : springPop}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,80,57,0.03)_1px,transparent_1px)] bg-[size:18px_18px] opacity-40 rounded-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-intuition-primary/35 to-transparent rounded-t-3xl"
              aria-hidden
            />

            <p id="arena-batch-desc" className="sr-only">
              {themeShort}. Base stake {stakeN.toFixed(2)} TRUST per line times weight multiplier.
              {minDepositLabel
                ? ` Each on-chain claim needs at least ${minDepositLabel} TRUST deposit (base times weight).`
                : ''}
            </p>

            <div className="relative flex items-start justify-between gap-2 px-4 pt-3.5 pb-3 border-b border-white/[0.07] shrink-0 z-10">
              <div className="min-w-0 flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl border-2 border-slate-700 bg-black/70 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <Layers className="w-[18px] h-[18px] text-intuition-primary" strokeWidth={2.2} aria-hidden />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h2
                    id="arena-batch-title"
                    className="text-sm font-black font-display text-white uppercase tracking-tight leading-tight"
                  >
                    Conviction cart
                  </h2>
                  <p className="text-[10px] text-slate-500 font-mono mt-1 truncate">
                    Review batch · <span className="text-intuition-primary/90">{contextSuffix}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  playArenaUiClick();
                  requestClose();
                }}
                className="shrink-0 p-2 rounded-xl border border-slate-700 bg-black/40 text-slate-400 hover:text-white hover:border-intuition-primary/35 hover:bg-white/[0.04] transition-colors z-20"
                aria-label="Close"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>

            {rows.length > 0 && onClearAll ? (
              <div className="relative px-4 pb-2 shrink-0 z-10">
                {confirmClearAll ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-intuition-secondary/40 bg-intuition-secondary/35 px-3 py-2.5">
                    <span className="text-[11px] text-slate-300 pr-2">
                      Remove all {rows.length} queued stance{rows.length === 1 ? '' : 's'}?
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={(e) => {
                          e.stopPropagation();
                          playArenaUiClick();
                          setConfirmClearAll(false);
                        }}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-300 border border-white/15 hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playArenaUiClick();
                          setConfirmClearAll(false);
                          onClearAll();
                        }}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-intuition-secondary/90 text-white border border-intuition-secondary/45 hover:bg-intuition-secondary disabled:opacity-40"
                        title="Clears the queue even if a submit is in progress (wallet may still complete a pending tx)."
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={(e) => {
                        e.stopPropagation();
                        playArenaUiClick();
                        setConfirmClearAll(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-intuition-secondary border border-transparent hover:border-intuition-secondary/35 hover:bg-intuition-secondary/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      aria-label={`Clear all ${rows.length} queued stances`}
                    >
                      <Trash2 size={13} strokeWidth={2.2} aria-hidden />
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5 z-10 custom-scrollbar">
              {rows.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-10">Nothing queued.</p>
              ) : (
                rows.map((row) => {
                  const lineTrust = stakeN * row.units;
                  const belowMin = rowBelowMinimum(row.units);
                  const rowKey = `${row.sourceListId}:${row.key}`;
                  return (
                    <div
                      key={rowKey}
                      className={`rounded-2xl border px-3 py-2.5 flex flex-col gap-2 ${
                        belowMin
                          ? 'border-intuition-warning/45 bg-intuition-warning/20'
                          : 'border-white/10 bg-black/65'
                      }`}
                      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 p-1.5 rounded-xl bg-black/50 border border-white/10 shrink-0">
                          {kindIcon(row.item.kind)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-white leading-snug line-clamp-2">{row.item.label}</p>
                          <p className="text-[9px] text-slate-500 mt-0.5 font-mono uppercase tracking-wide truncate">
                            {row.item.pairKind}
                            {row.sourceListTitle ? (
                              <span className="text-slate-600 normal-case"> · {row.sourceListTitle}</span>
                            ) : null}
                          </p>
                          <p className="text-[10px] font-mono font-bold mt-1.5 text-intuition-primary tabular-nums">
                            {lineTrust.toFixed(2)} TRUST
                            {belowMin ? (
                              <span className="ml-2 text-intuition-warning/95 normal-case tracking-normal font-semibold">
                                (need ≥ {minDepositLabel ?? '…'} TRUST)
                              </span>
                            ) : null}
                            {row.units > 1 ? (
                              <span className="text-slate-500 font-normal"> · {stakeN.toFixed(2)} × {row.units}</span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              playArenaUiClick();
                              onToggleSupport(row.sourceListId, row.key);
                            }}
                            className={`rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border ${
                              row.support
                                ? 'border-intuition-primary/45 bg-intuition-primary/15 text-intuition-primary'
                                : 'border-intuition-purple/45 bg-intuition-purple/12 text-intuition-primary'
                            }`}
                          >
                            {row.support ? 'Yes' : 'No'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              playArenaUiClick();
                              onRemove(row.sourceListId, row.key);
                            }}
                            className="p-1 rounded-lg text-slate-500 hover:text-intuition-secondary hover:bg-intuition-secondary/10 border border-transparent hover:border-intuition-secondary/25"
                            aria-label="Remove from batch"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2 pl-0.5 pt-1.5 border-t border-white/[0.06]">
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider mr-1">Weight</span>
                        <button
                          type="button"
                          disabled={row.units <= 1}
                          onClick={() => {
                            playArenaUiClick();
                            onUpdateUnits(row.sourceListId, row.key, Math.max(1, row.units - 1));
                          }}
                          className="h-8 w-8 rounded-lg border border-slate-600 bg-black/55 text-slate-200 disabled:opacity-35 hover:border-intuition-primary/30 flex items-center justify-center transition-colors"
                        >
                          <Minus size={15} />
                        </button>
                        <span className="text-sm font-bold tabular-nums min-w-[2.5rem] text-center text-white">
                          {row.units}×
                        </span>
                        <button
                          type="button"
                          disabled={row.units >= 99}
                          onClick={() => {
                            playArenaUiClick();
                            onUpdateUnits(row.sourceListId, row.key, Math.min(99, row.units + 1));
                          }}
                          className="h-8 w-8 rounded-lg border border-slate-600 bg-black/55 text-slate-200 disabled:opacity-35 hover:border-intuition-primary/30 flex items-center justify-center transition-colors"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {rowsNeedAttention && minDepositLabel ? (
              <div className="mx-3 mb-2 shrink-0 z-10 rounded-xl border border-intuition-warning/40 bg-intuition-warning/25 px-3 py-2">
                <p className="text-[11px] text-intuition-warning/95 leading-snug">
                  Each row needs <span className="font-bold text-white">≥ {minDepositLabel} TRUST</span> (raise stake or
                  weight).
                </p>
              </div>
            ) : null}

            <div className="p-3 border-t border-white/[0.08] shrink-0 z-10 bg-black/45">
              <button
                type="button"
                disabled={rows.length === 0 || submitting || rowsNeedAttention}
                onClick={() => {
                  playArenaUiClick();
                  onSubmit();
                }}
                className="w-full rounded-2xl py-3.5 px-3 text-center text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.99] flex items-center justify-center gap-2 border-2 border-intuition-primary/50 bg-gradient-to-b from-intuition-primary/32 to-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_24px_rgba(34,211,238,0.12)] hover:border-intuition-primary/65 hover:from-intuition-primary/40 disabled:hover:from-intuition-primary/32"
              >
                {submitting ? (
                  <div className="flex flex-col items-center gap-1 py-0.5 w-full">
                    <span className="flex items-center justify-center gap-2 text-sm font-black">
                      <Loader2 className="animate-spin shrink-0" size={18} />
                      {submitProgress ?? 'Submitting…'}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 leading-snug text-center px-1">
                      {submitProgress
                        ? 'Hold tight — wallet opens when a signature is needed.'
                        : 'Vault lookup runs first; your wallet opens when a signature is needed.'}
                    </span>
                  </div>
                ) : (
                  <>Confirm · {trustTotal.toFixed(2)} TRUST</>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};

export default ArenaBatchReviewModal;
