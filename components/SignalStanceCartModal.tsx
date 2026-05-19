import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Layers, Loader2, Shield, Trash2, X } from 'lucide-react';
import { playClick } from '../services/audio';
import type { SignalPendingPick } from '../services/signalPendingBatch';
import { SignalStanceTrustControls } from './SignalStanceTrustControls';

type Props = {
  open: boolean;
  onClose: () => void;
  picks: SignalPendingPick[];
  trustTotalLabel: string;
  onBumpStanceTrust: (tripleTermId: string, delta: number) => void;
  onSetStanceTrust: (tripleTermId: string, raw: string) => boolean;
  onRemove: (tripleTermId: string) => void;
  onClearAll: () => void;
  onSubmit: () => void;
  submitting: boolean;
};

/**
 * Arena-style “conviction cart” for Pulse stance queue — same shell as {@link ArenaBatchReviewModal}
 * (bottom-right sheet, motion, layered border).
 */
const SignalStanceCartModal: React.FC<Props> = ({
  open,
  onClose,
  picks,
  trustTotalLabel,
  onBumpStanceTrust,
  onSetStanceTrust,
  onRemove,
  onClearAll,
  onSubmit,
  submitting,
}) => {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const requestClose = useCallback(() => {
    setConfirmClearAll(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) setConfirmClearAll(false);
  }, [open]);

  useEffect(() => {
    if (picks.length === 0) setConfirmClearAll(false);
  }, [picks.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playClick();
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
      if (target && !panelRef.current.contains(target)) requestClose();
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open, requestClose]);

  const springPop = { type: 'spring' as const, stiffness: 420, damping: 32, mass: 0.85 };
  const batchTxCount = picks.length > 0 ? 1 : 0;

  return createPortal(
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div
          key="signal-stance-cart"
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
            aria-labelledby="signal-cart-title"
            className="pointer-events-auto fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(max(1rem,env(safe-area-inset-bottom,0px))+4.5rem)] z-10 w-[min(92vw,440px)] max-h-[min(74dvh,640px)] flex flex-col overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-950/92 backdrop-blur-xl shadow-[0_28px_72px_rgba(0,0,0,0.78)]"
            initial={reduceMotion ? { opacity: 0, scale: 0.98 } : { opacity: 0, scale: 0.88, y: 34, x: 8 }}
            animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 26, x: 8 }}
            transition={reduceMotion ? { duration: 0.2 } : springPop}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(0,243,255,0.03)_1px,transparent_1px)] bg-[size:18px_18px] opacity-40 rounded-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-intuition-primary/35 to-transparent rounded-t-3xl"
              aria-hidden
            />

            <div className="relative flex items-start justify-between gap-2 px-4 pt-3.5 pb-3 border-b border-white/[0.07] shrink-0 z-10">
              <div className="min-w-0 flex items-start gap-3">
                <motion.div
                  className="shrink-0 w-10 h-10 rounded-xl border-2 border-slate-700 bg-black/70 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  initial={reduceMotion ? false : { scale: 0.85 }}
                  animate={{ scale: 1 }}
                  transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 24 }}
                >
                  <Layers className="w-[18px] h-[18px] text-intuition-primary" strokeWidth={2.2} aria-hidden />
                </motion.div>
                <div className="min-w-0 pt-0.5">
                  <h2
                    id="signal-cart-title"
                    className="text-sm font-black font-display text-white uppercase tracking-tight leading-tight"
                  >
                    Conviction cart
                  </h2>
                  <p className="text-[10px] text-slate-500 font-mono mt-1 truncate">
                    Pulse · <span className="text-intuition-primary/90">{txCount} claim{txCount === 1 ? '' : 's'}</span>
                    <span className="text-slate-600"> · </span>
                    <span className="text-amber-200/90 tabular-nums">{trustTotalLabel} TRUST</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  playClick();
                  requestClose();
                }}
                className="shrink-0 p-2 rounded-xl border border-slate-700 bg-black/40 text-slate-400 hover:text-white hover:border-intuition-primary/35 hover:bg-white/[0.04] transition-colors z-20"
                aria-label="Close"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>

            {picks.length > 0 ? (
              <div className="relative px-4 pb-2 shrink-0 z-10">
                {confirmClearAll ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-500/40 bg-rose-950/35 px-3 py-2.5">
                    <span className="text-[11px] text-slate-300 pr-2">
                      Remove all {picks.length} queued claim{picks.length === 1 ? '' : 's'}?
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={(e) => {
                          e.stopPropagation();
                          playClick();
                          setConfirmClearAll(false);
                        }}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-300 border border-white/15 hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={(e) => {
                          e.stopPropagation();
                          playClick();
                          setConfirmClearAll(false);
                          onClearAll();
                        }}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-rose-600/90 text-white border border-rose-400/45 hover:bg-rose-600 disabled:opacity-40"
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
                        playClick();
                        setConfirmClearAll(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-rose-300 border border-transparent hover:border-rose-500/35 hover:bg-rose-500/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      aria-label={`Clear all ${picks.length} queued claims`}
                    >
                      <Trash2 size={13} strokeWidth={2.2} aria-hidden />
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5 z-10 custom-scrollbar">
              {picks.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-10">Nothing queued.</p>
              ) : (
                picks.map((p, i) => (
                  <motion.div
                    key={p.key}
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : Math.min(0.04 * i, 0.24), ...springPop }}
                    className="rounded-2xl border border-white/10 bg-black/65 px-3 py-2.5 flex flex-col gap-2"
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`mt-0.5 shrink-0 rounded-xl border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                          p.stance === 'stand'
                            ? 'border-intuition-primary/45 bg-intuition-primary/15 text-cyan-100'
                            : 'border-fuchsia-500/45 bg-fuchsia-500/12 text-fuchsia-200'
                        }`}
                      >
                        {p.stance === 'stand' ? 'Support' : 'Oppose'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-white leading-snug line-clamp-2">{p.objectLabel}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5 font-mono truncate">{p.subjectLabel}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          onRemove(p.tripleTermId);
                        }}
                        className="p-1 rounded-lg text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/25 shrink-0"
                        aria-label="Remove from cart"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/[0.06]">
                      <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider">Stake (TRUST)</span>
                      <SignalStanceTrustControls
                        tripleTermId={p.tripleTermId}
                        unitsTrust={p.unitsTrust}
                        onBump={onBumpStanceTrust}
                        onSet={onSetStanceTrust}
                      />
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            <p className="px-4 pb-2 text-[10px] text-slate-500 leading-snug shrink-0 z-10">
              One wallet signature sends the whole cart in a single batch deposit · counts are{' '}
              <span className="text-slate-400">triples</span>, not atoms.
            </p>

            <div className="p-3 border-t border-white/[0.08] shrink-0 z-10 bg-black/45">
              <motion.button
                type="button"
                disabled={picks.length === 0 || submitting}
                onClick={() => {
                  playClick();
                  onSubmit();
                }}
                className="w-full rounded-2xl py-3.5 px-3 text-center text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-500/28 to-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_24px_rgba(16,185,129,0.14)] hover:border-emerald-400/65 hover:from-emerald-500/36 disabled:hover:from-emerald-500/28"
                whileTap={reduceMotion ? undefined : { scale: 0.99 }}
              >
                {submitting ? (
                  <div className="flex flex-col items-center gap-1 py-0.5 w-full">
                    <span className="flex items-center justify-center gap-2 text-sm font-black">
                      <Loader2 className="animate-spin shrink-0" size={18} />
                      Submitting…
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 leading-snug text-center px-1">
                      Confirm the batch deposit in your wallet when prompted.
                    </span>
                  </div>
                ) : (
                  <>
                    <Shield size={18} strokeWidth={2.2} className="shrink-0 opacity-90" />
                    Confirm · {trustTotalLabel} TRUST
                    {picks.length > 1 ? ` · ${picks.length} stakes` : ''} · {batchTxCount}&nbsp;tx
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};

export default SignalStanceCartModal;
