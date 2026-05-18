import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Radio, RefreshCw, Users, Layers } from 'lucide-react';
import { getAddress, isAddress } from 'viem';
import { playArenaUiClick, playArenaUiHover } from '../services/audio';
import { fetchRecentArenaPortalRankingFeed, type ArenaPortalRankingFeedItem } from '../services/graphql';
import { ARENA_XP_PER_RANK_PICK, EXPLORER_URL } from '../constants';
import { subscribeVisibilityAwareInterval } from '../services/visibility';
import { portalListIdFromTermId } from '../services/arenaListsRegistry';
import { bestWalletDisplayLabel } from '../services/tns';
import { getArenaLocalXpByTxHash } from '../services/arenaCurations';

function climbHrefForListTerm(listTermId: string): string {
  const id = /^0x[0-9a-fA-F]{64}$/.test(listTermId) ? portalListIdFromTermId(listTermId) : listTermId;
  return `/climb?list=${encodeURIComponent(id)}`;
}

function formatFeedWhen(blockNumber: number): string {
  if (!blockNumber) return '—';
  return `#${blockNumber.toLocaleString()}`;
}

const SHORT_ADDR = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

function walletsMatch(a: string, b: string): boolean {
  try {
    return getAddress(a as `0x${string}`).toLowerCase() === getAddress(b as `0x${string}`).toLowerCase();
  } catch {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
}

/** A creator label is "raw" (needs TNS/ENS lookup) when it's just a hex address or our own short hex placeholder. */
function isRawAddressLabel(label: string, creatorId: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return true;
  if (/^0x[0-9a-fA-F]{4,6}…[0-9a-fA-F]{2,6}$/.test(trimmed)) return true;
  if (creatorId && trimmed.toLowerCase() === creatorId.toLowerCase()) return true;
  return false;
}

export type ArenaRankingPulseVariant = 'compact' | 'explorer';

type Props = {
  className?: string;
  /** `explorer` = full-width Climb view; `compact` = slim card (sidebar). */
  variant?: ArenaRankingPulseVariant;
  /** When set, explorer defaults to this wallet’s rows only (toggle expands to everyone on-chain). */
  viewerAddress?: string | null;
};

/**
 * Wispear-style sentence feed for Arena: who ranked what YES/NO on which list (portal triple index).
 * Separate from global Activity — only Arena-shaped portal claims.
 */
const ArenaRankingPulse: React.FC<Props> = ({ className, variant = 'compact', viewerAddress }) => {
  const [items, setItems] = useState<ArenaPortalRankingFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Default = chain-wide IntuRank activity ("All rankers") so the explorer never opens onto an
   *  empty splash; toggle narrows to the connected wallet's own rows. */
  const [showAllRankers, setShowAllRankers] = useState(true);
  /** TNS / ENS overrides keyed by lowercased wallet — `bestWalletDisplayLabel` returns `name.trust` / `name.eth` / shortened hex. */
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  /** Set briefly after a successful Arena batch so the user gets a visible "syncing" hint while the subgraph catches up. */
  const [syncingRecent, setSyncingRecent] = useState(false);
  const [curationTick, setCurationTick] = useState(0);

  const fetchLimit = variant === 'explorer' ? 48 : 26;

  const localXpByTx = useMemo(() => {
    if (!viewerAddress?.trim()) return new Map<string, { arenaXp: number; xpdn?: number }>();
    return getArenaLocalXpByTxHash(viewerAddress);
  }, [viewerAddress, curationTick]);

  useEffect(() => {
    const on = () => setCurationTick((n) => n + 1);
    window.addEventListener('inturank-arena-curations-updated', on);
    window.addEventListener('inturank-arena-onchain-updated', on);
    return () => {
      window.removeEventListener('inturank-arena-curations-updated', on);
      window.removeEventListener('inturank-arena-onchain-updated', on);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (variant === 'explorer' && !viewerAddress?.trim() && !showAllRankers) {
        setItems([]);
        return;
      }
      const onlyCreators =
        variant === 'explorer' && viewerAddress?.trim() && !showAllRankers
          ? [viewerAddress.trim()]
          : undefined;
      const rows = await fetchRecentArenaPortalRankingFeed(fetchLimit, { onlyCreators });
      setItems(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load Arena pulse');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchLimit, variant, viewerAddress, showAllRankers]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const stopInterval = subscribeVisibilityAwareInterval(() => void load(), 50_000);
    /**
     * After a successful Arena batch the subgraph needs a few seconds to index the FeeProxy deposit
     * before the viewer's row shows up. Burst-poll for ~45s instead of waiting on the 50s interval
     * so the just-completed rank appears in the explorer without a manual refresh.
     */
    let burstTimers: number[] = [];
    let syncOff: number | null = null;
    const onChainUp = () => {
      setSyncingRecent(true);
      if (syncOff != null) window.clearTimeout(syncOff);
      syncOff = window.setTimeout(() => setSyncingRecent(false), 50_000);
      void load();
      burstTimers.forEach((t) => window.clearTimeout(t));
      burstTimers = [2_500, 6_000, 12_000, 22_000, 38_000].map((ms) =>
        window.setTimeout(() => void load(), ms),
      );
    };
    window.addEventListener('inturank-arena-onchain-updated', onChainUp);
    return () => {
      stopInterval();
      burstTimers.forEach((t) => window.clearTimeout(t));
      if (syncOff != null) window.clearTimeout(syncOff);
      window.removeEventListener('inturank-arena-onchain-updated', onChainUp);
    };
  }, [load]);

  /** Backfill `name.trust` / `name.eth` for rows whose subgraph label is just a hex address — Wispear-style names matter for Arena. */
  useEffect(() => {
    let cancelled = false;
    const targets = Array.from(
      new Set(
        items
          .filter((row) => isAddress(row.creatorId as `0x${string}`) && isRawAddressLabel(row.creatorLabel, row.creatorId))
          .map((row) => {
            try {
              return getAddress(row.creatorId as `0x${string}`);
            } catch {
              return row.creatorId;
            }
          })
          .filter((addr) => !resolvedNames[addr.toLowerCase()]),
      ),
    );
    if (targets.length === 0) return;
    const CONCURRENCY = 4;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
      while (!cancelled) {
        const i = cursor++;
        if (i >= targets.length) return;
        const addr = targets[i]!;
        try {
          const label = await bestWalletDisplayLabel(addr);
          if (cancelled || !label) continue;
          if (isRawAddressLabel(label, addr)) continue;
          setResolvedNames((prev) =>
            prev[addr.toLowerCase()] ? prev : { ...prev, [addr.toLowerCase()]: label },
          );
        } catch {
          /* leave label as-is — falls back to short hex */
        }
      }
    });
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
  }, [items, resolvedNames]);

  /** Items rendered with TNS/ENS replacements when available; preserves on-chain creatorId for routing. */
  const renderedItems = useMemo(() => {
    if (Object.keys(resolvedNames).length === 0) return items;
    return items.map((row) => {
      if (!isAddress(row.creatorId as `0x${string}`)) return row;
      const key = row.creatorId.toLowerCase();
      const better = resolvedNames[key];
      if (!better) {
        if (isRawAddressLabel(row.creatorLabel, row.creatorId)) {
          try {
            return { ...row, creatorLabel: SHORT_ADDR(getAddress(row.creatorId as `0x${string}`)) };
          } catch {
            return row;
          }
        }
        return row;
      }
      return { ...row, creatorLabel: better };
    });
  }, [items, resolvedNames]);

  const shell =
    variant === 'explorer'
      ? `rounded-[1.75rem] border border-white/[0.09] bg-gradient-to-b from-[#0a1018]/95 to-black/90 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.55)]`
      : `rounded-2xl border border-white/[0.08] bg-black/35 backdrop-blur-sm`;

  const explorerSubtitle =
    variant === 'explorer' && showAllRankers ? (
      <>
        Live ranks <span className="text-slate-400 font-medium">through IntuRank</span>.
      </>
    ) : variant === 'explorer' ? (
      <>
        Your ranks <span className="text-slate-400 font-medium">through IntuRank</span>. Toggle <em>All rankers</em> for everyone.
      </>
    ) : (
      <>
        Recent ranks <span className="text-slate-400 font-medium">through IntuRank</span>.
      </>
    );

  return (
    <section
      className={`${shell} overflow-hidden ${className ?? ''}`}
      aria-label={variant === 'explorer' ? 'Arena explorer' : 'Arena ranking pulse'}
    >
      <div className="flex items-start justify-between gap-2 px-3.5 sm:px-5 pt-3 sm:pt-4 pb-2 border-b border-white/[0.06]">
        <div className="min-w-0 flex items-start gap-2 sm:gap-3">
          <div
            className={`shrink-0 rounded-lg border border-emerald-500/35 bg-emerald-950/40 flex items-center justify-center ${
              variant === 'explorer' ? 'w-10 h-10 sm:w-11 sm:h-11' : 'w-8 h-8'
            }`}
          >
            <Radio
              className={`text-emerald-400/95 stroke-[2.2] ${variant === 'explorer' ? 'w-5 h-5' : 'w-4 h-4'}`}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.22em] text-emerald-400/90 inline-flex items-center gap-1.5">
              {variant === 'explorer' ? 'Arena explorer' : 'Arena pulse'}
              {syncingRecent ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-emerald-200 normal-case">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden />
                  Syncing your latest rank…
                </span>
              ) : null}
            </p>
            <p className="text-[11px] sm:text-sm text-slate-400 leading-snug mt-0.5 max-w-2xl">{explorerSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {variant === 'explorer' ? (
            <button
              type="button"
              onClick={() => {
                playArenaUiClick();
                setShowAllRankers((v) => !v);
              }}
              aria-pressed={showAllRankers}
              title={showAllRankers ? 'Show only your wallet' : 'Show all wallets on these lists'}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] transition-colors ${
                showAllRankers
                  ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-200'
                  : 'border-slate-700/90 bg-black/50 text-slate-400 hover:text-emerald-200 hover:border-emerald-500/35'
              }`}
            >
              <Users className="w-3.5 h-3.5 opacity-90" aria-hidden />
              {showAllRankers ? 'All rankers' : 'My rankings'}
            </button>
          ) : null}
          {variant === 'explorer' && viewerAddress?.trim() ? (
            <Link
              to="/portfolio#arena-rankings"
              onClick={() => playArenaUiClick()}
              onMouseEnter={playArenaUiHover}
              title="Signed rankings grouped by list"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700/90 bg-black/50 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 hover:text-emerald-200 hover:border-emerald-500/35 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 opacity-90" aria-hidden />
              My lists
            </Link>
          ) : null}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              playArenaUiClick();
              void load();
            }}
            className="shrink-0 p-1.5 rounded-lg border border-slate-700/90 bg-black/50 text-slate-500 hover:text-emerald-300 hover:border-emerald-500/35 disabled:opacity-40 transition-colors"
            aria-label="Refresh Arena pulse"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div
        className={`overflow-y-auto overscroll-contain px-3 sm:px-5 py-3 [scrollbar-width:thin] ${
          variant === 'explorer' ? 'max-h-[min(72vh,820px)] min-h-[280px]' : 'max-h-[min(420px,52vh)] py-2'
        }`}
      >
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-slate-500">
            <Loader2 className="w-7 h-7 text-emerald-400/80 animate-spin" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">Pulling rankings…</span>
          </div>
        ) : error ? (
          <p className="text-[11px] text-rose-300/95 px-1 py-4 text-center">{error}</p>
        ) : variant === 'explorer' && !viewerAddress?.trim() && !showAllRankers ? (
          <p className="text-[11px] text-slate-500 px-1 py-6 text-center leading-relaxed">
            Connect your wallet to see your Arena rankings here — or switch to <strong className="text-slate-400">All rankers</strong> to browse chain-wide activity on IntuRank&apos;s portal lists.
          </p>
        ) : items.length === 0 ? (
          <p className="text-[11px] text-slate-500 px-1 py-6 text-center leading-relaxed">
            {variant === 'explorer' && !showAllRankers && viewerAddress?.trim() ? (
              <>
                Indexing your latest batch — your rows appear here within a minute of the wallet
                signature. Use <span className="text-slate-300 font-semibold">All rankers</span> to
                see chain-wide Arena activity in the meantime, or hit the refresh icon above.
              </>
            ) : (
              'No indexed Arena rankings yet. Submit a batch on a portal list — lines appear after the subgraph syncs.'
            )}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {renderedItems.map((row) => {
              const isViewerRow =
                !!viewerAddress?.trim() &&
                isAddress(viewerAddress as `0x${string}`) &&
                isAddress(row.creatorId as `0x${string}`) &&
                walletsMatch(viewerAddress, row.creatorId);
              const txLc = row.transactionHash?.trim().toLowerCase();
              const rowXp =
                variant === 'explorer' && isViewerRow && txLc?.startsWith('0x')
                  ? localXpByTx.get(txLc)
                  : undefined;

              return (
                <li
                  key={`${row.claimTermId}-${row.blockNumber}-${row.transactionHash ?? 'x'}`}
                  className={`rounded-xl border bg-slate-950/55 px-3 py-2.5 hover:border-emerald-500/25 transition-colors ${
                    variant === 'explorer'
                      ? 'border-white/[0.1]'
                      : 'border-white/[0.06] hover:border-emerald-500/20'
                  }`}
                >
                  <p className="text-[11px] leading-snug text-slate-100">
                    {isAddress(row.creatorId as `0x${string}`) ? (
                      <Link
                        to={`/profile/${encodeURIComponent(row.creatorId)}`}
                        onClick={playArenaUiClick}
                        onMouseEnter={playArenaUiHover}
                        className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-cyan-300 hover:from-white hover:to-emerald-200 underline-offset-2 hover:underline"
                      >
                        {row.creatorLabel}
                      </Link>
                    ) : (
                      <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-cyan-300">
                        {row.creatorLabel}
                      </span>
                    )}{' '}
                    <span
                      className={
                        variant === 'explorer'
                          ? 'text-slate-400 font-medium'
                          : 'text-slate-500 font-medium'
                      }
                    >
                      ranked
                    </span>{' '}
                    <span
                      className={`font-black uppercase text-[10px] px-1.5 py-0.5 rounded-md ${
                        row.support
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/18 text-rose-300'
                      }`}
                    >
                      {row.support ? 'for' : 'against'}
                    </span>{' '}
                    <span className="font-semibold text-white">{row.subjectLabel}</span>{' '}
                    <span
                      className={
                        variant === 'explorer' ? 'text-slate-400 font-medium' : 'text-slate-500 font-medium'
                      }
                    >
                      ·
                    </span>{' '}
                    <Link
                      to={climbHrefForListTerm(row.listTermId)}
                      onClick={playArenaUiClick}
                      onMouseEnter={playArenaUiHover}
                      className="text-intuition-primary font-bold hover:text-white underline-offset-2 hover:underline"
                    >
                      {row.listLabel}
                    </Link>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <span
                      className={
                        variant === 'explorer'
                          ? 'text-[10px] font-mono font-semibold text-slate-400 tabular-nums shrink-0'
                          : 'text-[9px] font-mono text-slate-500 tabular-nums shrink-0'
                      }
                    >
                      {formatFeedWhen(row.blockNumber)}
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 min-w-0 ml-auto">
                      {variant === 'explorer' && isViewerRow ? (
                        rowXp ? (
                          <>
                            <span className="inline-flex items-center rounded-md border border-cyan-400/45 bg-cyan-950/45 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-cyan-100 shadow-sm shadow-cyan-950/40">
                              +{rowXp.arenaXp} Arena
                            </span>
                            {rowXp.xpdn != null ? (
                              <span className="inline-flex items-center rounded-md border border-violet-400/40 bg-violet-950/45 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-violet-100 shadow-sm shadow-violet-950/40">
                                +{rowXp.xpdn} XPDN
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-md border border-slate-500/40 bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-200 text-right max-w-[13rem] sm:max-w-none leading-tight"
                            title="Arena pick credit applies once the indexer attributes the rank. Submit ranks from this browser to store XPDN per tx locally."
                          >
                            +{ARENA_XP_PER_RANK_PICK} Arena · XPDN
                          </span>
                        )
                      ) : null}
                      <a
                        href={
                          row.transactionHash
                            ? `${EXPLORER_URL.replace(/\/$/, '')}/tx/${row.transactionHash}`
                            : EXPLORER_URL
                        }
                        target="_blank"
                        rel="noreferrer"
                        onClick={playArenaUiClick}
                        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide transition-colors shrink-0 ${
                          variant === 'explorer'
                            ? 'text-cyan-400 hover:text-cyan-200'
                            : 'text-slate-400 hover:text-cyan-300'
                        }`}
                      >
                        Explorer
                        <ExternalLink
                          className={`w-3 h-3 ${variant === 'explorer' ? 'opacity-95' : 'opacity-80'}`}
                          aria-hidden
                        />
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ArenaRankingPulse;
