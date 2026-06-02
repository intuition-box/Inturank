import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeWebMediaUrl } from '../services/mediaUrl';
import { Link } from 'react-router-dom';
import { Activity, ChevronDown, ChevronRight, Layers, Loader2, RefreshCw } from 'lucide-react';
import { playArenaUiClick, playArenaUiHover } from '../services/audio';
import {
  clearArenaPortalListIndexingExtras,
  fetchPortfolioArenaRankingClaims,
  type UserArenaRankingClaim,
} from '../services/graphql';
import { ARENA_ATTRIBUTION_MIN_BLOCK } from '../constants';
import { portalListIdFromTermId } from '../services/arenaListsRegistry';

function climbQueryForListTermId(listTermId: string): string {
  const id = /^0x[0-9a-fA-F]{64}$/.test(listTermId) ? portalListIdFromTermId(listTermId) : listTermId;
  return `/climb?list=${encodeURIComponent(id)}`;
}

type AggregatedRow = Pick<
  UserArenaRankingClaim,
  'subjectId' | 'subjectLabel' | 'subjectImage' | 'support' | 'blockNumber' | 'claimTermId'
>;

type AggregatedList = {
  listTermId: string;
  listLabel: string;
  maxBlock: number;
  yesCount: number;
  noCount: number;
  rows: AggregatedRow[];
};

function aggregateClaims(claims: UserArenaRankingClaim[]): AggregatedList[] {
  const byList = new Map<string, AggregatedList>();

  for (const c of claims) {
    if (!c.listTermId) continue;
    let g = byList.get(c.listTermId);
    if (!g) {
      g = {
        listTermId: c.listTermId,
        listLabel: c.listLabel,
        maxBlock: 0,
        yesCount: 0,
        noCount: 0,
        rows: [],
      };
      byList.set(c.listTermId, g);
    }
    g.listLabel = c.listLabel || g.listLabel;
    g.maxBlock = Math.max(g.maxBlock, c.blockNumber);
    if (c.support) g.yesCount += 1;
    else g.noCount += 1;
    g.rows.push({
      subjectId: c.subjectId,
      subjectLabel: c.subjectLabel,
      subjectImage: c.subjectImage,
      support: c.support,
      blockNumber: c.blockNumber,
      claimTermId: c.claimTermId,
    });
  }

  for (const g of byList.values()) {
    g.rows.sort((a, b) => {
      if (a.support !== b.support) return a.support ? -1 : 1;
      return b.blockNumber - a.blockNumber;
    });
  }

  return Array.from(byList.values()).sort((a, b) => b.maxBlock - a.maxBlock);
}

const ArenaMyRankingsPanel: React.FC<{ wallet: string | null }> = ({ wallet }) => {
  const [claims, setClaims] = useState<UserArenaRankingClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet?.trim()) {
      setClaims([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPortfolioArenaRankingClaims(wallet);
      setClaims(rows);
    } catch (e: any) {
      setError(e?.message || 'Could not load on-chain Arena data');
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => {
      void load();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('inturank-arena-onchain-updated', onRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('inturank-arena-onchain-updated', onRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const grouped = useMemo(() => aggregateClaims(claims), [claims]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (grouped.length === 0) {
      setOpenId(null);
      return;
    }
    setOpenId((prev) => (prev && grouped.some((g) => g.listTermId === prev) ? prev : grouped[0].listTermId));
  }, [grouped]);

  return (
    <section
      id="arena-rankings"
      className="w-full max-w-full mx-auto mb-8 sm:mb-10 scroll-mt-24 font-sans min-w-0"
    >
      <div className="group relative overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] bg-gradient-to-br from-slate-950 via-[#020818] to-black shadow-[0_20px_60px_rgba(0,0,0,0.9)] border border-slate-900/60 px-4 sm:px-6 md:px-8 xl:px-10 py-6 sm:py-8 md:py-10 min-w-0">
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_left,rgba(255,80,57,0.12),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(236,72,153,0.1),transparent_55%)]" />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5 mb-5">
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl border border-slate-700/90 bg-black/70 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5 text-intuition-primary" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] xl:text-xs font-black text-slate-500 uppercase tracking-[0.28em] mb-1">Arena · Portfolio</p>
              <h2 className="text-xl sm:text-2xl font-black font-display text-white tracking-tight">My ranked lists</h2>
              <p className="text-[13px] text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
                FeeProxy/MultiVault deposits only — your wallet is the{' '}
                <strong className="text-slate-300 font-semibold">receiver</strong>. Portfolio intentionally lists ranks on portal lists
                you&apos;ve opened in Arena on this browser (not every indexer portal list), so you can start clean and grow from real
                sessions.
              </p>
              {ARENA_ATTRIBUTION_MIN_BLOCK != null ? (
                <p className="text-[11px] text-slate-500 mt-2">
                  Showing activity from block{' '}
                  <span className="font-mono text-slate-400">{ARENA_ATTRIBUTION_MIN_BLOCK}</span> onward.
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 mt-2 max-w-2xl leading-relaxed">
                  If you see old list activity that isn’t from IntuRank Arena, your deployment can narrow results to a launch
                  window (operator configuration — not something you set in the app).
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!wallet || loading}
              onClick={() => {
                playArenaUiClick();
                clearArenaPortalListIndexingExtras();
                void load();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/90 bg-black/60 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-intuition-danger hover:border-intuition-danger/35 disabled:opacity-40 transition-colors"
              title="Forget portal lists Arena registered on this browser — Portfolio empties until you open lists again."
            >
              Clear lists
            </button>
            <button
              type="button"
              disabled={!wallet || loading}
              onClick={() => {
                playArenaUiClick();
                void load();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/90 bg-black/60 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-intuition-primary/40 disabled:opacity-40 transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            <Link
              to="/climb"
              onClick={() => playArenaUiClick()}
              onMouseEnter={playArenaUiHover}
              className="inline-flex items-center gap-2 rounded-xl border border-intuition-primary/35 bg-black/70 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-intuition-primary hover:border-intuition-primary/60 hover:bg-intuition-primary/10 transition-colors"
            >
              <Activity className="w-4 h-4 shrink-0" />
              Arena
            </Link>
          </div>
        </div>

        <div className="relative z-10">
          {!wallet ? (
            <div className="rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/50 px-5 py-8 text-center">
              <p className="text-slate-300 text-sm font-semibold mb-2">Wallet not linked</p>
              <p className="text-slate-500 text-xs leading-relaxed max-w-md mx-auto">
                Connect at the top of Portfolio to pull your Arena claims from Intuition across devices.
              </p>
            </div>
          ) : loading && claims.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-black/40 py-14 flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 text-intuition-primary animate-spin" />
              <p className="text-xs font-semibold uppercase tracking-widest">Loading on-chain Arena data…</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-intuition-danger/35 bg-black/45 px-5 py-6 text-center">
              <p className="text-slate-200 text-sm mb-3">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="text-[11px] font-bold uppercase tracking-widest text-intuition-primary hover:text-white"
              >
                Try again
              </button>
            </div>
          ) : grouped.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/50 px-5 py-10 text-center">
              <p className="text-slate-300 text-sm font-semibold mb-2">No Arena claims recorded for this wallet</p>
              <p className="text-slate-500 text-xs leading-relaxed max-w-md mx-auto mb-5">
                Open a portal list in Arena on this device (we remember its id here), confirm a ranked batch through FeeProxy, then
                refresh — or tap Clear lists if you wiped the remembered registry.
              </p>
              <Link
                to="/climb"
                onClick={() => playArenaUiClick()}
                className="inline-flex items-center gap-2 text-[11px] font-bold text-intuition-primary hover:text-white transition-colors"
              >
                Go to Arena
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map((g) => (
                <ArenaListOnchainCard
                  key={g.listTermId}
                  group={g}
                  expanded={openId === g.listTermId}
                  onToggle={() => {
                    playArenaUiClick();
                    setOpenId((id) => (id === g.listTermId ? null : g.listTermId));
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

function ArenaListOnchainCard({
  group,
  expanded,
  onToggle,
}: {
  group: AggregatedList;
  expanded: boolean;
  onToggle: () => void;
}) {
  const preview = group.rows.slice(0, 4);

  return (
    <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900/90 via-black to-black border border-slate-800/80 shadow-[0_14px_40px_rgba(0,0,0,0.65)]">
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 bg-[radial-gradient(circle_at_top_left,rgba(255,80,57,0.14),transparent_55%)]" />
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={playArenaUiHover}
        className="relative z-10 w-full px-4 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-start gap-3">
          <span className="shrink-0 text-slate-500 mt-0.5">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-white truncate text-[15px]" title={group.listLabel}>
              {group.listLabel}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
              <span>
                <span className="text-intuition-success font-semibold tabular-nums">{group.yesCount}</span>
                {' yes · '}
                <span className="text-intuition-danger font-semibold tabular-nums">{group.noCount}</span>
                {' no'}
              </span>
              <span className="text-slate-600">·</span>
              <span className="tabular-nums uppercase tracking-wider">Latest block {group.maxBlock || '—'}</span>
            </p>
            {!expanded && preview.length > 0 ? (
              <ul className="mt-3 space-y-1.5 border-t border-slate-800/80 pt-3">
                {preview.map((r) => (
                  <li
                    key={`${r.subjectId}-${r.claimTermId}-preview`}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-black/35 px-2 py-1.5"
                  >
                    <span
                      className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md text-[9px] font-black uppercase shrink-0 ${
                        r.support
                          ? 'border border-intuition-success/40 bg-intuition-success/[0.12] text-intuition-success'
                          : 'border border-intuition-secondary/40 bg-intuition-secondary/[0.12] text-intuition-secondary'
                      }`}
                    >
                      {r.support ? 'Y' : 'N'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">{r.subjectLabel}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {!expanded && group.rows.length > preview.length ? (
              <p className="mt-2 text-[10px] font-medium text-slate-600">
                +{group.rows.length - preview.length} more · expand for full table
              </p>
            ) : null}
          </div>
          <Link
            to={climbQueryForListTermId(group.listTermId)}
            onClick={(e) => {
              e.stopPropagation();
              playArenaUiClick();
            }}
            className="relative z-10 shrink-0 rounded-xl border border-slate-600/85 bg-black/55 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:border-intuition-primary/45 hover:text-intuition-primary"
          >
            Open
          </Link>
        </div>
      </button>

      {expanded ? (
        <div className="relative z-10 px-4 pb-4 pt-0 border-t border-slate-800/80 overflow-x-auto">
          <table className="w-full text-left text-[12px] min-w-[300px]">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3 font-semibold w-10">#</th>
                <th className="py-2 pr-3 font-semibold">Entry</th>
                <th className="py-2 pr-2 font-semibold text-right">Stance</th>
                <th className="py-2 font-semibold text-right tabular-nums">Block</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r, i) => (
                <tr key={`${r.subjectId}-${r.claimTermId}`} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-2.5 pr-3 text-slate-500 tabular-nums align-middle">{i + 1}</td>
                  <td className="py-2.5 pr-3 align-middle">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 border border-slate-700/90 bg-black/70">
                        {r.subjectImage ? (
                          <img src={normalizeWebMediaUrl(r.subjectImage)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-slate-600">
                            {(r.subjectLabel || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-100 truncate">{r.subjectLabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 align-middle text-right">
                    <span
                      className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${
                        r.support
                          ? 'bg-intuition-success/10 text-intuition-success border-intuition-success/35'
                          : 'bg-intuition-danger/10 text-intuition-danger border-intuition-danger/35'
                      }`}
                    >
                      {r.support ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="py-2.5 align-middle text-right tabular-nums text-slate-400 font-mono">{r.blockNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default ArenaMyRankingsPanel;
