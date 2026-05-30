import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, Loader2, BarChart3, Activity, Shield, TrendingUp, Users, Swords, Sparkles, Layers } from 'lucide-react';
import { formatEther } from 'viem';
import { getAccountsByTermIds, getRedemptionCountForVault } from '../services/graphql';
import { calculateTrustScore, calculateVolatility, calculateMarketCap } from '../services/analytics';
import { playArenaUiClick } from '../services/audio';
import { ComparisonRow, RivalryAnalysis } from '../pages/Compare';
import { CurrencySymbol } from './CurrencySymbol';
import type { Account } from '../types';

export type ArenaCompareSide = {
  id: string;
  label: string;
  subtitle?: string;
  image?: string;
  kind: 'claim' | 'atom' | 'token';
};

type Props = {
  open: boolean;
  onClose: () => void;
  left: ArenaCompareSide;
  right: ArenaCompareSide;
};

const ArenaCompareModal: React.FC<Props> = ({ open, onClose, left, right }) => {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<[Account | null, Account | null]>([null, null]);
  const [leftExits, setLeftExits] = useState(0);
  const [rightExits, setRightExits] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setAccounts([null, null]);
    getAccountsByTermIds([left.id, right.id])
      .then((rows) => {
        if (!cancelled) setAccounts([rows[0] ?? null, rows[1] ?? null]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, left.id, right.id]);

  const [la, ra] = accounts;

  useEffect(() => {
    if (!open || !la?.id || !ra?.id) {
      setLeftExits(0);
      setRightExits(0);
      return;
    }
    let cancelled = false;
    Promise.all([getRedemptionCountForVault(la.id), getRedemptionCountForVault(ra.id)]).then(([l, r]) => {
      if (!cancelled) {
        setLeftExits(l);
        setRightExits(r);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, la?.id, ra?.id]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const lScore = useMemo(
    () => (la ? calculateTrustScore(la.totalAssets || '0', la.totalShares || '0') : 0),
    [la]
  );
  const rScore = useMemo(
    () => (ra ? calculateTrustScore(ra.totalAssets || '0', ra.totalShares || '0') : 0),
    [ra]
  );

  const hasMarkets = la && ra;

  if (!open) return null;

  /** Portal to document.body so position:fixed is viewport-relative (Framer Motion ancestors use transform and break fixed). */
  return createPortal(
    <div
      className="fixed inset-0 z-[260] overflow-y-auto overscroll-contain bg-black/88 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="arena-compare-title"
      onClick={() => {
        playArenaUiClick();
        onClose();
      }}
    >
      <div className="flex min-h-[100dvh] w-full items-center justify-center px-3 py-8 sm:px-6 sm:py-10">
        <div
          className="relative w-full max-w-3xl min-h-0 max-h-[min(88dvh,calc(100svh-2.5rem))] overflow-hidden rounded-2xl p-[1px] bg-gradient-to-br from-intuition-primary/35 via-slate-600/25 to-intuition-primary/35 shadow-[0_24px_80px_rgba(0,0,0,0.65)] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex flex-col min-h-0 flex-1 rounded-2xl bg-[#050a10] border border-white/[0.06] overflow-hidden">
        <div className="relative flex items-start justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-intuition-primary/10 shrink-0 bg-gradient-to-r from-[#060d14] via-[#070b12] to-[#0d0614]">
          <div className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[url('/grid.svg')] bg-top" aria-hidden />
          <div className="min-w-0 flex items-start gap-3 relative z-10">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-intuition-primary/20 to-intuition-primary/15 border border-intuition-primary/35 shadow-[0_0_28px_rgba(34,211,238,0.12)] shrink-0">
              <BarChart3 size={20} className="text-intuition-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={12} className="text-intuition-primary/80 shrink-0" />
                <h2
                  id="arena-compare-title"
                  className="text-sm sm:text-base font-black uppercase tracking-[0.14em] text-transparent bg-clip-text bg-gradient-to-r from-intuition-primary via-white to-intuition-primary font-display"
                >
                  Compare before you pick
                </h2>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed max-w-md">
                Same IntuRank signals as the app — lane A vs B, then pick which you rank higher.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playArenaUiClick();
              onClose();
            }}
            className="relative z-10 p-2 rounded-xl border border-slate-600/90 bg-slate-950/80 text-slate-400 hover:text-white hover:border-intuition-primary/40 transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 sm:px-6 sm:py-5 custom-scrollbar min-h-0 bg-[#030a0e]/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <Loader2 className="w-9 h-9 text-intuition-primary animate-spin" />
              <span className="text-xs font-mono uppercase tracking-widest">Loading market data…</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <div className="rounded-xl border border-intuition-primary/30 bg-gradient-to-b from-slate-950/90 to-[#060d14] p-4 shadow-[inset_0_1px_0_rgba(34,211,238,0.08)] border-l-[3px] border-l-intuition-primary/90">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-intuition-primary/95">Lane A</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-intuition-primary/25 text-intuition-primary/80 font-mono font-black">A</span>
                  </div>
                  <p className="text-sm sm:text-[15px] text-white leading-relaxed font-medium break-words">{left.label}</p>
                  {left.subtitle && <p className="text-[10px] text-intuition-primary/65 mt-2 font-mono uppercase tracking-wider">{left.subtitle}</p>}
                  {left.kind !== 'token' && (
                    <Link
                      to={`/markets/${left.id}`}
                      onClick={playArenaUiClick}
                      className="inline-flex items-center gap-1 mt-3 text-[10px] font-black uppercase tracking-wider text-intuition-primary hover:text-intuition-primary"
                    >
                      Open market <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
                <div className="rounded-xl border border-intuition-primary/30 bg-gradient-to-b from-slate-950/90 to-[#0d0614] p-4 shadow-[inset_0_1px_0_rgba(217,70,239,0.08)] border-l-[3px] border-l-intuition-primary/90">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-intuition-primary/95">Lane B</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-intuition-primary/25 text-intuition-primary/80 font-mono font-black">B</span>
                  </div>
                  <p className="text-sm sm:text-[15px] text-white leading-relaxed font-medium break-words">{right.label}</p>
                  {right.subtitle && <p className="text-[10px] text-intuition-primary/65 mt-2 font-mono uppercase tracking-wider">{right.subtitle}</p>}
                  {right.kind !== 'token' && (
                    <Link
                      to={`/markets/${right.id}`}
                      onClick={playArenaUiClick}
                      className="inline-flex items-center gap-1 mt-3 text-[10px] font-black uppercase tracking-wider text-intuition-primary hover:text-intuition-primary"
                    >
                      Open market <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
              </div>

              {!hasMarkets && (
                <p className="text-xs text-slate-500 text-center py-6 px-3 border border-dashed border-slate-700/80 rounded-xl mb-4 bg-slate-950/40">
                  No on-chain market stats for this pair (e.g. synthetic tokens or missing vaults). You can still pick using the full text above.
                </p>
              )}

              {hasMarkets && (
                <>
                  <RivalryAnalysis variant="arena" left={la!} right={ra!} lScore={lScore} rScore={rScore} />

                  <div className="rounded-2xl border border-slate-700/80 bg-[#04080d] overflow-hidden mt-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800/90 bg-gradient-to-r from-intuition-primary/10 via-slate-900/80 to-intuition-primary/10">
                      <Swords size={16} className="text-intuition-primary/90 shrink-0" />
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white font-display">Signal breakdown</span>
                      <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider hidden sm:inline">Lane A �/ Lane B</span>
                    </div>
                    <div className="bg-[#03060a]/90">
                      <ComparisonRow
                        variant="arena"
                        label="Trading volume"
                        leftVal={parseFloat(formatEther(BigInt(la!.totalAssets || '0')))}
                        rightVal={parseFloat(formatEther(BigInt(ra!.totalAssets || '0')))}
                        unit={<CurrencySymbol size="sm" className="text-slate-400" />}
                        icon={<Shield />}
                      />
                      <ComparisonRow
                        variant="arena"
                        label="Market cap"
                        leftVal={calculateMarketCap(la!.marketCap || la!.totalAssets || '0', la!.totalShares || '0', la!.currentSharePrice)}
                        rightVal={calculateMarketCap(ra!.marketCap || ra!.totalAssets || '0', ra!.totalShares || '0', ra!.currentSharePrice)}
                        unit={<CurrencySymbol size="sm" className="text-slate-400" />}
                        icon={<Layers />}
                      />
                      <ComparisonRow
                        variant="arena"
                        label="Volatility"
                        leftVal={calculateVolatility(la!.totalAssets || '0')}
                        rightVal={calculateVolatility(ra!.totalAssets || '0')}
                        unit="index"
                        icon={<Activity />}
                      />
                      <ComparisonRow
                        variant="arena"
                        label="Holders"
                        leftVal={la!.positionCount ?? 0}
                        rightVal={ra!.positionCount ?? 0}
                        unit="count"
                        icon={<Users />}
                      />
                      <ComparisonRow
                        variant="arena"
                        label="Exits (sells)"
                        leftVal={leftExits}
                        rightVal={rightExits}
                        unit="count"
                        icon={<Activity />}
                      />
                      <ComparisonRow
                        variant="arena"
                        label="Signal strength"
                        leftVal={(lScore * 1.2).toFixed(0)}
                        rightVal={(rScore * 1.2).toFixed(0)}
                        unit="score"
                        icon={<TrendingUp />}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 sm:px-6 border-t border-intuition-primary/10 bg-gradient-to-r from-slate-950/95 via-[#070d14] to-slate-950/95 shrink-0 flex justify-end">
          <button
            type="button"
            onClick={() => {
              playArenaUiClick();
              onClose();
            }}
            className="rounded-xl border border-intuition-primary/45 bg-gradient-to-r from-intuition-primary/15 to-intuition-primary/5 px-6 py-2.5 text-[11px] font-black uppercase tracking-[0.2em] text-intuition-primary shadow-[0_0_20px_rgba(34,211,238,0.12)] hover:from-intuition-primary/25 hover:to-intuition-primary/10 hover:border-intuition-primary/60 transition-all"
          >
            Back to Arena
          </button>
        </div>
        </div>
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15,23,42,0.5); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(34,211,238,0.25); border-radius: 4px; }
      `}</style>
    </div>,
    document.body
  );
};

export default ArenaCompareModal;
