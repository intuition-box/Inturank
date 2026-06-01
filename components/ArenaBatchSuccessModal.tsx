import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Layers, Sparkles, Terminal, X, Zap } from 'lucide-react';
import { playArenaUiClick, playArenaVictory } from '../services/audio';

export type ArenaBatchSuccessPayload = {
  itemCount: number;
  /** Already formatted TRUST total (e.g. from formatEther). */
  trustLabel: string;
  themeShort: string;
  contextSuffix: string;
  /** e.g. `Wallet — YES for "Owl" in "Animal Archetype"` */
  humanLine?: string;
  /** Shown when optional attestation failed but stakes succeeded. */
  footnote?: string;
  /**
   * Protocol activity points (XPDN) from this batch — local ledger via `notifyProtocolXpEarned` / add_to_list.
   */
  activityXpEarned?: number;
  /** Arena pick-credit XP (`itemCount * ARENA_XP_PER_RANK_PICK`); mirrors indexer-facing Arena XP. */
  arenaXpEarned?: number;
  /** XPDN granted per vault tx (same sum as `activityXpEarned` when all txs qualify). */
  xpdnByTx?: number[];
  /** Optional replacement for the default “Arena stances” footer line (e.g. Signal / Pulse). */
  outro?: string;
};

type Props = {
  open: boolean;
  payload: ArenaBatchSuccessPayload | null;
  onClose: () => void;
};

const ArenaBatchSuccessModal: React.FC<Props> = ({ open, payload, onClose }) => {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playArenaUiClick();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

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

  // Victory fanfare on the mint-success payoff (gated by the user's arena sound pref inside the SFX).
  useEffect(() => {
    if (open && payload) playArenaVictory();
  }, [open, payload]);

  const springPop = { type: 'spring' as const, stiffness: 400, damping: 34, mass: 0.82 };
  const burstSpring = { type: 'spring' as const, stiffness: 520, damping: 28, mass: 0.65 };

  const p = payload;
  const arena = p?.arenaXpEarned ?? 0;
  const xpdn = p?.activityXpEarned ?? 0;
  const totalXp = arena + xpdn;
  const xpdnLine =
    p?.xpdnByTx && p.xpdnByTx.length > 0 ? p.xpdnByTx.map((n) => `+${n}`).join(' �/ ') : null;
  const xpSubtitle = (() => {
    if (totalXp <= 0) {
      return 'No XP credited — try a larger deposit or check daily cap / duplicate tx.';
    }
    const parts: string[] = [];
    if (arena > 0) parts.push(`${arena} Arena`);
    if (xpdn > 0) parts.push(xpdnLine ? `activity ${xpdnLine}` : `${xpdn} activity`);
    return parts.join(' �/ ');
  })();

  return createPortal(
    <AnimatePresence mode="wait">
      {open && p ? (
        <motion.div
          key="arena-batch-success"
          className="fixed inset-0 z-[610] flex items-center justify-center p-4 sm:p-6 pointer-events-none"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-black/75 backdrop-blur-md pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              playArenaUiClick();
              requestClose();
            }}
          />

          {/* Celebration burst */}
          {!reduceMotion ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[42%] h-[min(120vw,520px)] w-[min(120vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.35)_0%,rgba(16,185,129,0.12)_35%,transparent_62%)] blur-[2px]"
              initial={{ scale: 0.65, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            />
          ) : null}

          {/* Confetti burst — fires once as the modal mounts. */}
          {!reduceMotion ? (
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
              {Array.from({ length: 18 }).map((_, i) => {
                const ang = (i / 18) * Math.PI * 2;
                const dist = 120 + (i % 4) * 34;
                const colors = ['#34d399', '#10b981', '#ff5039', '#fbbf24', '#ffffff'];
                return (
                  <motion.span
                    key={i}
                    className="absolute h-1.5 w-1.5 rounded-[1px]"
                    style={{ background: colors[i % colors.length] }}
                    initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                    animate={{ opacity: 0, scale: 0.3, x: Math.cos(ang) * dist, y: Math.sin(ang) * dist - 40 }}
                    transition={{ duration: 0.9 + (i % 4) * 0.1, ease: [0.2, 0.7, 0.3, 1], delay: (i % 6) * 0.02 }}
                  />
                );
              })}
            </div>
          ) : null}

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="arena-success-title"
            aria-describedby="arena-success-desc"
            className="pointer-events-auto relative w-[min(92vw,440px)] overflow-hidden rounded-3xl border-2 border-intuition-success/40 bg-slate-950/94 backdrop-blur-xl shadow-[0_28px_88px_rgba(0,0,0,0.82),0_0_60px_rgba(16,185,129,0.18),0_0_0_1px_rgba(16,185,129,0.12)]"
            initial={reduceMotion ? { opacity: 0, scale: 0.98 } : { opacity: 0, scale: 0.82, y: 22, rotate: -1.2 }}
            animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: 0, rotate: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 14, transition: { duration: 0.22 } }}
            transition={reduceMotion ? { duration: 0.2 } : burstSpring}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-intuition-success via-intuition-success to-intuition-primary rounded-l-[inherit]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(16,185,129,0.045)_1px,transparent_1px)] bg-[size:18px_18px] opacity-50"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-intuition-success/45 to-transparent"
              aria-hidden
            />

            <div className="relative flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/[0.07]">
              <div className="flex items-start gap-3 min-w-0">
                <motion.div
                  className="shrink-0 w-11 h-11 rounded-xl border-2 border-intuition-success/45 bg-intuition-success/50 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  initial={reduceMotion ? false : { scale: 0.5, rotate: -12 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 22 }}
                >
                  <CheckCircle2 className="w-[22px] h-[22px] text-intuition-success" strokeWidth={2.4} aria-hidden />
                </motion.div>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[10px] font-mono font-bold tracking-[0.22em] text-intuition-success/95 uppercase mb-1">
                    System_confirmed
                  </p>
                  <h2
                    id="arena-success-title"
                    className="text-base font-black font-display text-white uppercase tracking-tight leading-tight flex flex-wrap items-center gap-2"
                  >
                    Claims on-chain
                    {!reduceMotion ? (
                      <motion.span
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.12, ...springPop }}
                        className="inline-flex"
                      >
                        <Sparkles className="w-4 h-4 text-intuition-warning" strokeWidth={2.4} aria-hidden />
                      </motion.span>
                    ) : null}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-1.5 truncate">
                    <Layers className="w-3 h-3 text-intuition-primary shrink-0" strokeWidth={2.2} aria-hidden />
                    <span className="text-intuition-primary/90">{p.themeShort}</span>
                    <span className="text-slate-600">�/</span>
                    <span>{p.contextSuffix}</span>
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
                className="shrink-0 p-2 rounded-xl border border-slate-700 bg-black/45 text-slate-400 hover:text-white hover:border-intuition-success/40 hover:bg-white/[0.05] transition-colors"
                aria-label="Close"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>

            <div id="arena-success-desc" className="relative px-5 py-4 space-y-3">
              <div className="grid gap-2.5 grid-cols-3">
                <motion.div
                  className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5"
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.05, ...springPop }}
                >
                  <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-1">Items</p>
                  <p className="text-xl font-black font-mono tabular-nums text-white">{p.itemCount}</p>
                </motion.div>
                <motion.div
                  className="rounded-xl border border-intuition-warning/25 bg-intuition-warning/20 px-3 py-2.5"
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.09, ...springPop }}
                >
                  <p className="text-[9px] font-mono uppercase tracking-widest text-intuition-warning/80 mb-1">
                    Trust locked
                  </p>
                  <p className="text-xl font-black font-mono tabular-nums text-transparent bg-clip-text bg-gradient-to-b from-intuition-warning to-intuition-warning">
                    {p.trustLabel}
                  </p>
                  <p className="text-[9px] font-mono text-intuition-warning/90 mt-0.5 uppercase tracking-wide">TRUST</p>
                </motion.div>
                <motion.div
                  className="rounded-xl border border-intuition-primary/35 bg-intuition-primary/30 px-3 py-2.5 min-w-0"
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.13, ...springPop }}
                >
                  <p className="text-[9px] font-mono uppercase tracking-widest text-intuition-primary/95 mb-1 flex items-center gap-1">
                    <Zap className="w-3 h-3 shrink-0" strokeWidth={2.4} aria-hidden />
                    XP
                  </p>
                  <p
                    className={`text-xl font-black font-mono tabular-nums leading-none ${
                      totalXp > 0
                        ? 'text-transparent bg-clip-text bg-gradient-to-b from-intuition-primary to-intuition-primary'
                        : 'text-slate-500'
                    }`}
                  >
                    +{totalXp}
                  </p>
                  <p className="text-[8px] font-mono text-slate-500 mt-1.5 leading-snug line-clamp-3">
                    {xpSubtitle}
                  </p>
                </motion.div>
              </div>

              {p.humanLine ? (
                <p className="text-[12px] text-slate-100 leading-snug font-sans border-l-2 border-intuition-success/50 pl-3 py-1.5 rounded-r-md bg-intuition-success/15">
                  {p.humanLine}
                </p>
              ) : null}

              <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                {p.outro ??
                  'Your Arena stances are written to Intuition. Leaderboard XP catches up after indexer sync.'}
              </p>

              {p.footnote ? (
                <div className="rounded-2xl border border-intuition-primary/30 bg-intuition-primary/25 px-3 py-2.5 flex gap-2.5">
                  <Terminal className="w-4 h-4 text-intuition-primary shrink-0 mt-0.5" strokeWidth={2.2} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[9px] font-mono font-bold tracking-[0.18em] text-intuition-primary/95 uppercase mb-1">
                      Personal tags �/ FYI
                    </p>
                    <p className="text-[11px] text-slate-300 font-mono leading-snug">{p.footnote}</p>
                  </div>
                </div>
              ) : null}

              <motion.button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  playArenaUiClick();
                  requestClose();
                }}
                className="arena-batch-ack-btn relative w-full overflow-hidden rounded-2xl py-3.5 text-sm font-black uppercase tracking-wide bg-gradient-to-r from-intuition-success to-intuition-primary text-white border border-intuition-success/35 shadow-[0_0_28px_rgba(16,185,129,0.35)] hover:from-intuition-success hover:to-intuition-primary transition-colors"
                whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              >
                {!reduceMotion ? (
                  <span
                    className="arena-batch-ack-shimmer pointer-events-none absolute inset-0 opacity-35"
                    aria-hidden
                  />
                ) : null}
                <span className="relative">Acknowledge</span>
              </motion.button>
            </div>
            {!reduceMotion ? (
              <style>{`
                @keyframes arena-batch-ack-shimmer {
                  0% { transform: translateX(-120%); }
                  100% { transform: translateX(120%); }
                }
                .arena-batch-ack-shimmer {
                  background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.45) 45%, transparent 70%);
                  animation: arena-batch-ack-shimmer 1.85s ease-in-out infinite;
                }
              `}</style>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default ArenaBatchSuccessModal;
