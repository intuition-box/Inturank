
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartTooltip, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

const EquityChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const ts = p.payload?.timestamp;
  const val = p.value;
  const date = ts ? new Date(ts) : new Date();
  return (
    <div className="bg-black/95 border border-intuition-primary/60 px-3 py-2.5 rounded-lg shadow-[0_0_24px_rgba(0,243,255,0.25)] backdrop-blur-sm font-mono">
      <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">{date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}</div>
      <div className="text-sm font-black text-intuition-primary tracking-tight">
        Equity : {Number(val).toFixed(4)}
      </div>
    </div>
  );
};
import { formatEther, getAddress } from 'viem';
import { connectWallet, getConnectedAccount, getWalletBalance, getShareBalancesBatch, getLocalTransactions } from '../services/web3';
import { getUserPositions, getPortfolioPositionsWithValue, getUserHistory, getVaultsByIds, getAccountPnlCurrent, getCurveLabel, getMyCreated, resolveMetadata } from '../services/graphql';
import { Wallet, RefreshCw, Zap, User, Loader2, TrendingUp, Coins, Lock, Activity as PulseIcon, Clock, Terminal, Globe, Layers, LogOut, Sparkles, ChevronDown } from 'lucide-react';
import { Transaction } from '../types';
import { toast } from '../components/Toast';
import { playHover, playClick } from '../services/audio';
import { calculateCategoryExposure, calculateSentimentBias, formatDisplayedShares, calculatePositionPnL, formatMarketValue, safeParseUnits, normalizeTermId, calculateAgentPrice } from '../services/analytics';
import {
  CURRENCY_SYMBOL,
  OFFSET_PROGRESSIVE_CURVE_ID,
  DISTRUST_ATOM_ID,
  PAGE_HERO_EYEBROW,
  PAGE_HERO_TITLE,
  PAGE_HERO_BODY,
} from '../constants';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { PageLoadingSpinner } from '../components/PageLoading';
import { Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import logo from '../logo.png';
import ArenaMyRankingsPanel from '../components/ArenaMyRankingsPanel';

const COLORS = ['#00f3ff', '#00ff9d', '#a855f7', '#facc15', '#ff1e6d', '#ff8c00', '#00ced1'];

const StatCard: React.FC<{ label: string; value: string; unit: string | React.ReactNode; icon: any; trendColor?: string; isLoading?: boolean }> = ({ label, value, unit, icon: Icon, trendColor, isLoading }) => (
  <div className="relative group overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900/90 via-black to-black border border-slate-800/80 p-3 sm:p-5 md:p-6 xl:p-6 shadow-[0_18px_45px_rgba(0,0,0,0.7)] hover:border-intuition-primary/40 transition-all flex flex-col justify-between min-h-[92px] sm:min-h-[128px] xl:min-h-[140px] 2xl:min-h-[152px] min-w-0">
    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_top_left,rgba(0,243,255,0.18),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(236,72,153,0.18),transparent_55%)]" />
    <div className="absolute top-3 right-3 sm:top-4 sm:right-4 xl:top-5 xl:right-5 text-slate-700 group-hover:text-slate-300 transition-colors z-10 shrink-0">
      <Icon className="w-4 h-4 sm:w-6 sm:h-6 xl:w-7 xl:h-7 2xl:w-8 2xl:h-8" strokeWidth={1.5} />
    </div>
    <div className="space-y-1 relative z-10 pr-8 sm:pr-10 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 mb-1 sm:mb-2 min-w-0">
        <div className="w-1.5 h-1.5 bg-current rounded-full opacity-60 shrink-0"></div>
        <span className="text-[9px] xl:text-xs 2xl:text-sm font-black text-slate-500 uppercase tracking-[0.2em] truncate block min-w-0">{label}</span>
      </div>
      <div className={`text-lg sm:text-3xl md:text-4xl xl:text-4xl 2xl:text-5xl font-black font-display tracking-tight group-hover:text-intuition-primary transition-colors leading-none flex items-baseline gap-1 min-w-0 overflow-hidden ${trendColor || 'text-white'}`}>
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="h-8 sm:h-9 md:h-10 w-24 sm:w-28 bg-slate-800/80 rounded-lg animate-pulse" />
            <Loader2 className="w-5 h-5 text-intuition-primary/60 animate-spin shrink-0" />
          </div>
        ) : (
          <>
            {typeof unit === 'string' ? <span className="text-lg sm:text-3xl md:text-4xl xl:text-4xl 2xl:text-5xl font-bold text-intuition-primary/90 mr-1 sm:mr-2 align-baseline shrink-0">{unit}</span> : unit}
            <span className="tabular-nums truncate block min-w-0" title={value}>{value}</span>
          </>
        )}
      </div>
    </div>
  </div>
);

const Portfolio: React.FC = () => {
  const { address: wagmiAddress } = useAccount();
  const [account, setAccount] = useState<string | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState('0.00');
  const [portfolioValue, setPortfolioValue] = useState('0.00');
  const [netPnL, setNetPnL] = useState(0);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [equityLoaded, setEquityLoaded] = useState(false);
  const [pnlLoaded, setPnLLoaded] = useState(false);
  const [sentimentBias, setSentimentBias] = useState({ trust: 50, distrust: 50 }); 
  const [exposureData, setExposureData] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<'value_desc' | 'value_asc' | 'magnitude_desc' | 'magnitude_asc' | 'oldest' | 'newest'>('value_desc');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const [myCreated, setMyCreated] = useState<{ identities: any[]; claims: any[] }>({ identities: [], claims: [] });
  const [myCreatedTab, setMyCreatedTab] = useState<'identities' | 'claims'>('identities');
  const [myCreatedLoading, setMyCreatedLoading] = useState(false);
  const [holdingsPage, setHoldingsPage] = useState(1);
  const isRefreshingRef = useRef(false);
  /** Last successful positions — never replace with [] when GraphQL errors (rate limit / indexer lag). */
  const lastPositionsRef = useRef<any[]>([]);
  const portfolioAddressRef = useRef<string | null>(null);
  const [sharePosition, setSharePosition] = useState<any | null>(null);
  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const [sharing, setSharing] = useState(false);

  const HOLDINGS_PER_PAGE = 10;

  const sortedPositions = useMemo(() => {
    const list = [...positions];
    const num = (v: any) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
    const ts = (v: any) => (typeof v === 'number' && !Number.isNaN(v) && v > 0 ? v : 0);
    const cmp = (a: any, b: any, primary: number) => (primary !== 0 ? primary : (a.id || '').localeCompare(b.id || ''));
    if (sortBy === 'value_desc') return list.sort((a, b) => cmp(a, b, num(b.value) - num(a.value)));
    if (sortBy === 'value_asc') return list.sort((a, b) => cmp(a, b, num(a.value) - num(b.value)));
    if (sortBy === 'magnitude_desc') return list.sort((a, b) => cmp(a, b, num(b.shares) - num(a.shares)));
    if (sortBy === 'magnitude_asc') return list.sort((a, b) => cmp(a, b, num(a.shares) - num(b.shares)));
    if (sortBy === 'oldest' || sortBy === 'newest') {
      return list.sort((a, b) => {
        const ta = ts(a.firstDepositTimestamp);
        const tb = ts(b.firstDepositTimestamp);
        if (ta === 0 && tb === 0) return cmp(a, b, 0);
        if (ta === 0) return 1;
        if (tb === 0) return -1;
        return sortBy === 'oldest' ? cmp(a, b, ta - tb) : cmp(a, b, tb - ta);
      });
    }
    return list;
  }, [positions, sortBy]);

  const paginatedPositions = useMemo(() => {
    const start = (holdingsPage - 1) * HOLDINGS_PER_PAGE;
    return sortedPositions.slice(start, start + HOLDINGS_PER_PAGE);
  }, [sortedPositions, holdingsPage]);

  const totalHoldingsPages = Math.max(1, Math.ceil(sortedPositions.length / HOLDINGS_PER_PAGE));

  const fetchUserData = useCallback(async (address: string) => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    if (portfolioAddressRef.current !== address) {
      portfolioAddressRef.current = address;
      lastPositionsRef.current = [];
    }
    setLoading(true);
    setBalanceLoaded(false);
    setEquityLoaded(false);
    setPnLLoaded(false);

    // Fire balance immediately (fast RPC) so it shows first
    getWalletBalance(address).then((bal) => {
      setBalance(Number(bal).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
      setBalanceLoaded(true);
    }).catch(() => setBalanceLoaded(true));

    try {
      // 2. Fetch main data in parallel (skip balance - already fired above)
      const [chainHistory, positionsWithValueResult, graphPositionsRawResult, pnlSnapshot] = await Promise.all([
          getUserHistory(address),
          getPortfolioPositionsWithValue(address).catch(() => null as any),
          getUserPositions(address).catch(() => null as any),
          getAccountPnlCurrent(address)
      ]);
      const positionsWithValue = positionsWithValueResult === null ? [] : positionsWithValueResult;
      const graphPositionsRaw = graphPositionsRawResult === null ? [] : graphPositionsRawResult;
      const positionGraphFetchFailed =
        positionsWithValueResult === null && graphPositionsRawResult === null;

      let equitySetFromPnl = false;
      let pnlSetFromPnl = false;
      // Set equity and PnL from getAccountPnlCurrent immediately (don't wait for slow position loop)
      if (pnlSnapshot?.equity_value) {
        try {
          const eq = Number(formatEther(BigInt(pnlSnapshot.equity_value)));
          setPortfolioValue(eq.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
          setEquityLoaded(true);
          equitySetFromPnl = true;
        } catch { /* fallback to aggregated later */ }
      }
      if (pnlSnapshot?.total_pnl != null) {
        try {
          const totalPnl = Number(formatEther(BigInt(pnlSnapshot.total_pnl)));
          setNetPnL(totalPnl);
          setPnLLoaded(true);
          pnlSetFromPnl = true;
        } catch { /* fallback to aggregated later */ }
      }

      // Fast totals from positions_with_value when snapshot is empty/slow — avoids stat spinners until the full label loop finishes
      if (!equitySetFromPnl && positionsWithValue.length > 0) {
        let quickEq = 0;
        for (const p of positionsWithValue) {
          try {
            if (p.theoretical_value != null) quickEq += Number(formatEther(BigInt(p.theoretical_value)));
          } catch {
            /* skip row */
          }
        }
        setPortfolioValue(quickEq.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
        setEquityLoaded(true);
        equitySetFromPnl = true;
      }
      if (!pnlSetFromPnl && positionsWithValue.length > 0) {
        let quickPnl = 0;
        for (const p of positionsWithValue) {
          try {
            if (p.pnl != null) quickPnl += Number(formatEther(BigInt(p.pnl)));
          } catch {
            /* skip row */
          }
        }
        setNetPnL(quickPnl);
        setPnLLoaded(true);
        pnlSetFromPnl = true;
      }
      if (!equitySetFromPnl && positionsWithValue.length === 0 && graphPositionsRaw.length === 0) {
        setPortfolioValue('0.00');
        setEquityLoaded(true);
        equitySetFromPnl = true;
      }
      if (!pnlSetFromPnl && positionsWithValue.length === 0 && graphPositionsRaw.length === 0) {
        setNetPnL(0);
        setPnLLoaded(true);
        pnlSetFromPnl = true;
      }

      // 2. Transmission history
      // - Prefer on-network history from Graph
      // - Fall back to local (pending) history when Graph has no records yet
      const networkHistory = [...chainHistory].sort((a, b) => b.timestamp - a.timestamp);
      const localHistory = getLocalTransactions(address);

      let displayHistory: Transaction[] = [];
      if (networkHistory.length > 0) {
        const chainHashes = new Set(networkHistory.map(tx => tx.id.toLowerCase()));
        const pending = localHistory.filter(tx => !chainHashes.has(tx.id.toLowerCase()));
        displayHistory = [...pending, ...networkHistory].sort((a, b) => b.timestamp - a.timestamp);
      } else {
        displayHistory = [...localHistory].sort((a, b) => b.timestamp - a.timestamp);
      }
      setHistory(displayHistory);

      const historyVaultIds = networkHistory.map(tx => tx.vaultId?.toLowerCase()).filter(Boolean);
      const graphVaultIds = (positionsWithValue.length > 0 ? positionsWithValue : graphPositionsRaw).map((p: any) => p.vault?.term_id?.toLowerCase()).filter(Boolean);
      const candidateVaultIds = Array.from(new Set([...graphVaultIds, ...historyVaultIds])) as string[];
      
      // Skip getVaultsByIds when positions_with_value has vault.term (atom/triple) — saves a full GraphQL round-trip
      const metadata = positionsWithValue.length > 0 ? [] : await getVaultsByIds(candidateVaultIds).catch(() => []);

      // 3. PRECISION INVENTORY RECONCILIATION
      const activePositions: any[] = [];
      let aggregatedValue = 0;
      let aggregatedPnL = 0;
      const DUST = 1e-8;

      // Use positions_with_value when available (server-sorted by theoretical_value desc, no per-position RPC calls)
      // Derive label/image/type from vault.term (atom/triple) — no extra getVaultsByIds needed
      if (positionsWithValue.length > 0) {
        for (const p of positionsWithValue) {
          try {
            const rawId = p.vault?.term_id;
            if (!rawId || typeof rawId !== 'string') continue;
            const id = rawId.toLowerCase();
            const rawCurve = p.vault?.curve_id;
            const curveId = rawCurve != null ? Number(rawCurve) || 1 : 1;
            const sharesNum = safeParseUnits(p.shares);
            if (!Number.isFinite(sharesNum) || sharesNum <= DUST) continue;
            const value = p.theoretical_value != null ? Number(formatEther(BigInt(p.theoretical_value))) : 0;
            const triple = p.vault?.term?.triple;
            const atom = p.vault?.term?.atom;
            let label: string;
            let image: string | undefined;
            let type: string;
            const isCounter = triple?.counter_term_id?.toLowerCase() === id;
            const pointsToDistrust = triple?.object?.term_id?.toLowerCase().includes(DISTRUST_ATOM_ID.toLowerCase().slice(26));
            if (isCounter || pointsToDistrust) {
              const subjectLabel = triple?.subject ? resolveMetadata(triple.subject).label : triple?.subject?.id?.slice(0, 8) || 'NODE';
              label = `OPPOSING_${subjectLabel}`.toUpperCase();
              image = triple?.subject?.image;
              type = 'CLAIM';
            } else if (triple) {
              const sMeta = resolveMetadata(triple.subject);
              const oMeta = resolveMetadata(triple.object);
              label = `${sMeta.label} ${triple.predicate?.label || 'LINK'} ${oMeta.label}`;
              image = triple.subject?.image || triple.object?.image;
              type = 'CLAIM';
            } else if (atom) {
              const meta = resolveMetadata(atom);
              label = meta.label || `Node_${id.slice(0, 8)}`;
              image = atom.image || meta.image;
              type = (meta.type || 'ATOM').toUpperCase();
            } else {
              label = `Node_${id.slice(0, 8)}`;
              image = undefined;
              type = 'ATOM';
            }
            const pnlPercent = p.pnl_pct != null ? Number(p.pnl_pct) : 0;
            const profit = p.pnl != null ? Number(formatEther(BigInt(p.pnl))) : 0;
            const depositsForVault = displayHistory.filter((t: Transaction) => normalizeTermId(t.vaultId) === normalizeTermId(id) && t.type === 'DEPOSIT' && (curveId == null || t.curveId == null || t.curveId === curveId));
            const firstDepositTimestamp = depositsForVault.length ? Math.min(...depositsForVault.map((t: Transaction) => t.timestamp)) : Date.now();
            aggregatedValue += value;
            aggregatedPnL += profit;
            const duplicate = activePositions.some((x: any) => x.id === id && (x.curveId ?? 1) === (curveId ?? 1));
            if (!duplicate) {
              activePositions.push({
                id,
                curveId,
                shares: sharesNum,
                value,
                pnl: pnlPercent,
                profit,
                atom: { label, id, image, type },
                firstDepositTimestamp,
              });
            }
          } catch (e) { continue; }
        }
      } else {
      // Fallback: positions table with batched on-chain verification (1–2 multicall RPCs instead of 2N)
      const graphWithShares = graphPositionsRaw.filter((p: any) => {
        const s = p.shares;
        if (s === undefined || s === null) return false;
        const n = typeof s === 'string' ? parseFloat(s) : Number(s);
        return n > DUST;
      });

      const batchItems = graphWithShares
        .map((p: any) => {
          const rawId = p.vault?.term_id;
          if (!rawId || typeof rawId !== 'string') return null;
          const id = rawId.toLowerCase();
          const rawCurve = p.vault?.curve_id ?? metadata.find((m: any) => m.id.toLowerCase() === id)?.curveId;
          const curveId = rawCurve != null ? Number(rawCurve) || 1 : 1;
          return { termId: id, curveId };
        })
        .filter(Boolean) as { termId: string; curveId: number }[];

      const sharesMap = batchItems.length > 0 ? await getShareBalancesBatch(address, batchItems) : new Map<string, string>();

      for (const p of graphWithShares) {
          try {
              const rawId = p.vault?.term_id;
              if (!rawId || typeof rawId !== 'string') continue;
              const id = rawId.toLowerCase();
              const meta = metadata.find((m: any) => m.id.toLowerCase() === id);
              const rawCurve = p.vault?.curve_id ?? meta?.curveId;
              const curveId = rawCurve != null ? Number(rawCurve) || 1 : 1;

              const sharesRaw = sharesMap.get(`${id}:${curveId}`) ?? '0';
              const sharesNum = typeof sharesRaw === 'string' ? parseFloat(sharesRaw) : Number(sharesRaw);
              const hasBalance = Number.isFinite(sharesNum) && sharesNum > DUST;
              if (!hasBalance) continue;

              const vault = p.vault;
              const price = vault ? calculateAgentPrice(vault.total_assets || '0', vault.total_shares || '1', vault.current_share_price) : 0.1;
              const value = sharesNum * price;
              const spotPrice = price;

              let label = meta?.label || `Node_${id.slice(0, 8)}`;
              let image = meta?.image;
              let type = meta?.type || 'ATOM';

              const triple = p.vault?.term?.triple;
              const isCounter = triple?.counter_term_id?.toLowerCase() === id.toLowerCase();
              const pointsToDistrust = triple?.object?.term_id?.toLowerCase().includes(DISTRUST_ATOM_ID.toLowerCase().slice(26));

              if (isCounter || pointsToDistrust) {
                  const subjectLabel = triple?.subject?.label || triple?.subject?.id?.slice(0, 8) || 'NODE';
                  label = `OPPOSING_${subjectLabel}`.toUpperCase();
                  image = triple?.subject?.image;
                  type = 'CLAIM';
              }

              const { pnlPercent, profit } = calculatePositionPnL(sharesNum, spotPrice, networkHistory, id, curveId);
              const depositsForVault = displayHistory.filter((t: Transaction) => normalizeTermId(t.vaultId) === normalizeTermId(id) && t.type === 'DEPOSIT' && (curveId == null || t.curveId == null || t.curveId === curveId));
              const firstDepositTimestamp = depositsForVault.length ? Math.min(...depositsForVault.map((t: Transaction) => t.timestamp)) : Date.now();

              aggregatedValue += value;
              aggregatedPnL += profit;

              const duplicate = activePositions.some((x: any) => x.id === id && (x.curveId ?? 1) === (curveId ?? 1));
              if (!duplicate) {
                activePositions.push({
                  id,
                  curveId,
                  shares: sharesNum,
                  value,
                  pnl: pnlPercent,
                  profit,
                  atom: { label, id, image, type },
                  firstDepositTimestamp,
                });
              }
          } catch (e) { continue; }
      }
      }

      if (positionGraphFetchFailed) {
        if (lastPositionsRef.current.length > 0) {
          setPositions(lastPositionsRef.current);
          setExposureData(calculateCategoryExposure(lastPositionsRef.current));
        } else {
          setPositions(activePositions);
          setExposureData(calculateCategoryExposure(activePositions));
        }
      } else {
        setPositions(activePositions);
        lastPositionsRef.current = activePositions;
        setExposureData(calculateCategoryExposure(activePositions));
      }

      // When holdings come from positions_with_value, hero totals must match the table (sum of row
      // net valuation / PnL). getAccountPnlCurrent uses a separate aggregate and can disagree.
      const equityFromPositionsTable =
        positionsWithValue.length > 0 && activePositions.length > 0;
      if (equityFromPositionsTable) {
        const sumVal = activePositions.reduce((s, x) => s + (Number(x.value) || 0), 0);
        const sumProfit = activePositions.reduce((s, x) => s + (Number(x.profit) || 0), 0);
        setPortfolioValue(
          sumVal.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
        );
        setNetPnL(sumProfit);
        setEquityLoaded(true);
        setPnLLoaded(true);
      }

      // Only set equity/PNL from aggregated if not already set from pnlSnapshot
      if (!equitySetFromPnl && !equityFromPositionsTable) {
        if (pnlSnapshot?.equity_value) {
          try {
            const eq = Number(formatEther(BigInt(pnlSnapshot.equity_value)));
            setPortfolioValue(eq.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
          } catch {
            setPortfolioValue(aggregatedValue.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
          }
        } else {
          setPortfolioValue(aggregatedValue.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
        }
        setEquityLoaded(true);
      }
      if (!pnlSetFromPnl && !equityFromPositionsTable) {
        if (pnlSnapshot?.total_pnl != null) {
          try {
            const totalPnl = Number(formatEther(BigInt(pnlSnapshot.total_pnl)));
            setNetPnL(totalPnl);
          } catch {
            setNetPnL(aggregatedPnL);
          }
        } else {
          setNetPnL(aggregatedPnL);
        }
        setPnLLoaded(true);
      }
      setSentimentBias(calculateSentimentBias(displayHistory));

      // Main holdings are ready — stop blocking table/spinner on chart prep
      setLoading(false);

      // 4. Defer chart build so positions render first (UX: stats + table appear faster)
      const buildChart = () => {
        const depositRedeemHistory = displayHistory.filter(tx => tx.type === 'DEPOSIT' || tx.type === 'REDEEM');
        const points: { timestamp: number; val: number }[] = [{ timestamp: Date.now(), val: aggregatedValue }];
        let runner = aggregatedValue;
        const historyForChart = depositRedeemHistory.slice(0, 100);
        for (let i = 0; i < historyForChart.length; i++) {
            const tx = historyForChart[i];
            const val = safeParseUnits(tx.assets);
            if (tx.type === 'DEPOSIT') runner -= val;
            else runner += val;
            points.push({ timestamp: tx.timestamp, val: Math.max(0, runner) });
        }
        const sorted = points.reverse();
        if (sorted.length === 1) {
            const v = sorted[0].val;
            sorted.unshift({
                timestamp: sorted[0].timestamp - 30 * 24 * 60 * 60 * 1000,
                val: Math.max(0, v * 0.1),
            });
        }
        const vals = sorted.map(p => p.val);
        const minVal = Math.min(...vals);
        const maxVal = Math.max(...vals);
        if (minVal === maxVal && maxVal > 0) {
            sorted.unshift({ ...sorted[0], timestamp: sorted[0].timestamp - 7 * 24 * 60 * 60 * 1000, val: maxVal * 0.5 });
        }
        setChartData(sorted.sort((a, b) => a.timestamp - b.timestamp));
      };
      requestAnimationFrame(() => requestAnimationFrame(buildChart));

    } catch (e) {
      console.error("PORTFOLIO_SYNC_FAILURE", e);
    } finally {
      setLoading(false);
      isRefreshingRef.current = false;
    }
  }, []);

  // Sync connected address from wagmi so we react when user connects (header already shows connected)
  useEffect(() => {
    if (wagmiAddress) {
      setAccount(wagmiAddress);
      fetchUserData(wagmiAddress);
    } else {
      setAccount(null);
      setLoading(false);
      setBalanceLoaded(false);
      setEquityLoaded(false);
      setPnLLoaded(false);
    }
  }, [wagmiAddress]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchUserData is stable enough

  useEffect(() => {
    setHoldingsPage(1);
  }, [positions.length]);

  useEffect(() => {
    let mounted = true;
    const handleUpdate = () => {
      if (mounted && account) fetchUserData(account);
    };
    window.addEventListener('local-tx-updated', handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('local-tx-updated', handleUpdate);
    };
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  // Defer myCreated load so main portfolio (balance, equity, positions) renders first
  useEffect(() => {
    if (!account) {
      setMyCreated({ identities: [], claims: [] });
      return;
    }
    let mounted = true;
    const timer = setTimeout(() => {
      setMyCreatedLoading(true);
      getMyCreated(account)
        .then((data) => { if (mounted) setMyCreated(data); })
        .catch(() => { if (mounted) setMyCreated({ identities: [], claims: [] }); })
        .finally(() => { if (mounted) setMyCreatedLoading(false); });
    }, 300);
    return () => { mounted = false; clearTimeout(timer); };
  }, [account]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSortLabel = (opt: typeof sortBy) => {
    const labels: Record<typeof sortBy, string> = {
      value_desc: 'Value: Largest → Lowest',
      value_asc: 'Value: Lowest → Largest',
      magnitude_desc: 'Magnitude: Largest → Lowest',
      magnitude_asc: 'Magnitude: Lowest → Largest',
      newest: 'Newest first',
      oldest: 'Oldest first',
    };
    return labels[opt];
  };

  const toggleSort = (opt: typeof sortBy) => {
    setSortBy(opt);
    setSortOpen(false);
    playClick();
  };

  const closeShareModal = () => {
    setSharePosition(null);
  };

  const handleDownloadShareCard = async () => {
    if (!shareCardRef.current || !sharePosition) return;
    try {
      setSharing(true);
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#020308',
        scale: window.devicePixelRatio || 2,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `intuition-pnl-${sharePosition.id.slice(0, 8)}.png`;
      a.click();
    } catch (e) {
      console.error('SHARE_CARD_DOWNLOAD_FAILED', e);
      toast.error('Failed to export image');
    } finally {
      setSharing(false);
    }
  };

  const handleCopyXText = async () => {
    if (!sharePosition) return;
    const pct = (sharePosition.pnl ?? 0).toFixed(2);
    const profit = typeof sharePosition.profit === 'number' ? sharePosition.profit.toFixed(4) : '0.0000';
    const text = [
      `My PnL on Intuition: ${pct}% (${profit} ${CURRENCY_SYMBOL})`,
      ``,
      `Asset: ${sharePosition.atom?.label || 'Unknown'}`,
      `Curve: ${getCurveLabel(sharePosition.curveId ?? 1)}`,
      `Magnitude: ${formatDisplayedShares(sharePosition.shares)} PORTAL_UNITS`,
      ``,
      `Shared via IntuRank on the Intuition Network.`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied X post text');
    } catch {
      toast.error('Failed to copy text');
    }
  };

  if (!account) return (
    <div className="min-h-[90vh] flex flex-col items-center justify-center bg-transparent relative overflow-hidden font-mono px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,243,255,0.03)_0%,transparent_70%)] pointer-events-none"></div>
      <div className="relative z-10 w-full max-w-[500px] animate-in fade-in zoom-in-95 duration-700">
        <div className="bg-[#020308] border-2 border-intuition-primary/30 p-10 sm:p-12 flex flex-col items-center text-center rounded-3xl shadow-[0_0_120px_rgba(0,0,0,1)] relative overflow-hidden group">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-intuition-secondary px-8 py-1.5 text-[10px] font-semibold text-white tracking-wide rounded-b-2xl shadow-glow-red">
              Not connected
            </div>
            <div className="mt-12 mb-10 relative">
                <div className="absolute -inset-10 bg-intuition-primary/10 blur-[40px] rounded-full animate-pulse"></div>
                <div className="relative w-20 h-20 bg-black border-2 border-intuition-primary flex items-center justify-center text-intuition-primary rounded-3xl shadow-glow-blue transition-all duration-700 group-hover:scale-110">
                    <Lock size={32} className="animate-pulse" />
                </div>
            </div>
            <div className="mb-10 space-y-3">
                <h1 className={`${PAGE_HERO_TITLE} text-center`}>Portfolio</h1>
                <p className="text-slate-400 text-sm font-sans px-4 leading-relaxed">
                  Connect your wallet to see positions, PnL, and history.
                </p>
            </div>
            <button 
                onClick={connectWallet}
                className="w-full py-5 bg-intuition-primary text-black font-semibold font-sans tracking-wide rounded-full shadow-glow-blue hover:bg-white transition-all active:scale-95"
            >
                Connect wallet
            </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full min-w-0 max-w-full px-3 pt-6 pb-28 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 sm:pt-10 sm:pb-20 font-mono overflow-x-hidden">
      <div className="w-full max-w-full mx-auto mb-6 sm:mb-8 space-y-2 font-sans">
        <p className={PAGE_HERO_EYEBROW}>Your positions</p>
        <h1 className={`${PAGE_HERO_TITLE} max-md:text-2xl max-md:leading-tight`}>Portfolio</h1>
        <p className={`${PAGE_HERO_BODY} max-w-2xl`}>
          Balances, PnL, and activity across the markets you trade.
        </p>
      </div>
      <div className="w-full max-w-full mx-auto mb-8 sm:mb-10 rounded-[2rem] sm:rounded-[2.5rem] bg-gradient-to-br from-slate-950 via-[#020818] to-black shadow-[0_20px_60px_rgba(0,0,0,0.9)] border border-slate-900/60 px-4 sm:px-6 md:px-8 xl:px-10 py-6 sm:py-8 md:py-10 min-w-0">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 lg:gap-6 xl:gap-8">
        <StatCard label="Wallet Balance" value={balance} unit={<CurrencySymbol size="2xl" leading />} icon={Wallet} isLoading={loading && !balanceLoaded} />
        <StatCard label="Total Equity" value={portfolioValue} unit={<CurrencySymbol size="2xl" leading />} icon={Coins} isLoading={loading && !equityLoaded} />
        <StatCard label="Net PnL" value={`${netPnL > 0 ? '+' : ''}${netPnL.toFixed(4)}`} unit={<CurrencySymbol size="2xl" leading />} icon={TrendingUp} trendColor={netPnL >= 0 ? 'text-intuition-success' : 'text-intuition-danger'} isLoading={loading && !pnlLoaded} />
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900/90 via-black to-black border border-slate-800/80 p-3 sm:p-5 md:p-6 flex flex-col justify-between min-h-[92px] sm:min-h-[128px] xl:min-h-[140px] group hover:border-intuition-primary/40 transition-all min-w-0">
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(248,113,113,0.18),transparent_55%)]" />
          <div className="flex items-center justify-between relative z-10 min-w-0 gap-2">
            <span className="text-[9px] xl:text-xs font-semibold text-slate-400 truncate min-w-0 font-sans tracking-tight md:font-black md:text-slate-500 md:uppercase md:tracking-[0.2em]" title="Sentiment bias">Sentiment bias</span>
            <PulseIcon className="w-5 h-5 sm:w-6 sm:h-6 xl:w-7 xl:h-7 text-slate-700 group-hover:text-intuition-primary transition-colors animate-pulse" />
          </div>
          <div className="flex items-center gap-1.5 h-2 w-full px-1 relative z-10">
            <div className="flex-1 flex justify-end h-full relative overflow-visible">
                <div style={{ width: `${sentimentBias.trust}%` }} className="h-full bg-intuition-success shadow-[0_0_30px_#00ff9d] transition-all duration-1000 origin-right"></div>
                <div style={{ width: `${sentimentBias.trust}%` }} className="absolute inset-0 bg-intuition-success/40 blur-[8px] animate-pulse pointer-events-none"></div>
            </div>
            <div className="w-px h-3 bg-white/40 shrink-0 z-10"></div>
            <div className="flex-1 flex justify-start h-full relative overflow-visible">
                <div style={{ width: `${sentimentBias.distrust}%` }} className="h-full bg-intuition-danger shadow-[0_0_30px_#ff1e6d] transition-all duration-1000 origin-left"></div>
                <div style={{ width: `${sentimentBias.distrust}%` }} className="absolute inset-0 bg-intuition-danger/40 blur-[8px] animate-pulse pointer-events-none"></div>
            </div>
          </div>
          <div className="flex justify-between items-end text-[9px] font-bold font-sans relative z-10 md:font-black md:font-mono">
            <div className="flex flex-col">
                <span className="text-intuition-success leading-none text-glow-success md:uppercase md:tracking-widest">Bullish</span>
                <span className="text-white text-xs mt-0.5">{sentimentBias.trust.toFixed(0)}%</span>
            </div>
            <div className="flex flex-col items-end">
                <span className="text-intuition-danger leading-none text-glow-red md:uppercase md:tracking-widest">Bearish</span>
                <span className="text-white text-xs mt-0.5">{sentimentBias.distrust.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>
      </div>

      {sharePosition && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/80 backdrop-blur-md px-4 pt-20 sm:pt-28">
          <div className="w-full max-w-xl bg-[#020308] border border-white/10 rounded-[32px] shadow-[0_0_120px_rgba(0,0,0,1)] p-6 sm:p-8 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top_left,rgba(0,243,255,0.16),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(250,204,21,0.18),transparent_55%)]" />
            <button
              type="button"
              onClick={() => { playClick(); closeShareModal(); }}
              className="absolute top-3 right-3 text-slate-500 hover:text-white text-xs font-mono z-20"
            >
              ✕
            </button>

            <div className="relative z-20 mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-black/80 border border-white/10 flex items-center justify-center overflow-hidden">
                  <img src={logo} alt="IntuRank" className="w-7 h-7 object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.35em] mb-0.5">
                    Position_PnL_Sharecard
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-400 font-mono uppercase tracking-[0.24em]">
                    Verified on Intuition Mainnet
                  </div>
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-end text-[9px] text-slate-500 font-mono uppercase tracking-[0.24em]">
                <span>IntuRank Protocol</span>
                <span className="text-[10px] text-intuition-primary mt-0.5">INTUITION.NETWORK</span>
              </div>
            </div>

            <div
              ref={shareCardRef}
              className="bg-[#05070d]/95 border border-white/10 rounded-3xl p-6 sm:p-8 mb-6 shadow-[0_0_70px_rgba(0,0,0,1)] max-w-full"
              style={{ width: 560, maxWidth: '100%' }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-black/80 border border-white/15 flex items-center justify-center overflow-hidden shrink-0">
                    {sharePosition.atom?.image ? (
                      <img src={sharePosition.atom.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex flex-col gap-1">
                    <div className="text-[9px] text-slate-500 uppercase tracking-[0.24em]">
                      Intuition Network · IntuRank
                    </div>
                    <div className="text-base sm:text-lg font-black text-white uppercase tracking-tight leading-tight truncate" title={sharePosition.atom?.label}>
                      {sharePosition.atom?.label}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      UID: {sharePosition.id.slice(0, 12)}… · Curve: {getCurveLabel(sharePosition.curveId ?? 1)}
                    </div>
                  </div>
                </div>
                <div className="text-right min-w-[120px]">
                  <div className="text-[9px] text-slate-500 uppercase tracking-[0.24em] mb-1">
                    PnL
                  </div>
                  <div
                    className={`text-2xl sm:text-3xl font-black tabular-nums tracking-tight ${
                      (sharePosition.pnl ?? 0) >= 0 ? 'text-intuition-success' : 'text-intuition-danger'
                    }`}
                  >
                    {(sharePosition.pnl ?? 0) >= 0 ? '+' : ''}
                    {(sharePosition.pnl ?? 0).toFixed(2)}%
                  </div>
                  {typeof sharePosition.profit === 'number' && (
                    <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-baseline justify-end gap-1">
                      <span className="uppercase tracking-[0.18em] text-slate-500 mr-1">Realized</span>
                      <span>{sharePosition.profit >= 0 ? '+' : ''}{sharePosition.profit.toFixed(4)}</span>
                      <CurrencySymbol size="sm" />
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-4 text-[10px] sm:text-xs font-mono text-slate-300">
                <div>
                  <div className="uppercase tracking-[0.25em] text-slate-500 mb-1">
                    Magnitude
                  </div>
                  <div className="text-white font-black tabular-nums">
                    {formatDisplayedShares(sharePosition.shares)}
                  </div>
                  <div className="text-[9px] text-slate-500 uppercase mt-0.5">
                    PORTAL_UNITS
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.25em] text-slate-500 mb-1">
                    Net_Valuation
                  </div>
                  <div className="text-white font-black tabular-nums inline-flex items-baseline gap-1">
                    <CurrencySymbol size="sm" leading className="text-intuition-primary/90" />
                    <span>{formatMarketValue(sharePosition.value)}</span>
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.25em] text-slate-500 mb-1">
                    Identity_Type
                  </div>
                  <div className="text-white font-black">
                    {sharePosition.atom?.type || 'ATOM'}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[9px] text-slate-500 font-mono uppercase tracking-[0.24em]">
                <span>Verified on Intuition Mainnet</span>
                <span>inturank.intuition.box</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => { playClick(); handleDownloadShareCard(); }}
                disabled={sharing}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-intuition-primary text-black font-black text-[10px] sm:text-xs uppercase tracking-[0.25em] hover:bg-white disabled:opacity-60 transition-colors"
              >
                {sharing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Download image
              </button>
              <button
                type="button"
                onClick={() => { playClick(); handleCopyXText(); }}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-600 text-slate-200 font-black text-[10px] sm:text-xs uppercase tracking-[0.25em] hover:border-intuition-primary hover:text-intuition-primary transition-colors"
              >
                Copy X post text
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-full mx-auto grid grid-cols-1 gap-6 sm:gap-8 lg:gap-10 min-w-0">
        {/* Row 1: Ledger + Transmission History (left) beside Equity Vol + Asset Exposure (right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-10 min-w-0">
        {/* Left column: Active Holdings + Transmission History stacked */}
        <div className="md:col-span-1 lg:col-span-7 xl:col-span-8 w-full min-w-0 space-y-6 sm:space-y-8 flex flex-col">
        {/* Active Holdings Ledger */}
        <div className="w-full min-w-0 overflow-hidden">
          <div className="bg-black border border-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-4 sm:px-5 md:px-6 xl:px-8 py-4 sm:py-5 md:py-6 border-b border-slate-900 bg-white/[0.03] flex flex-row flex-nowrap items-center justify-between gap-2 sm:gap-4 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink flex-1">
                <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-intuition-primary/10 border border-intuition-primary/20 shrink-0">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-intuition-primary" strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-sans text-sm font-semibold text-white sm:text-base md:font-display md:uppercase md:tracking-[0.2em] truncate pr-2">
                    Active holdings
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-medium tracking-wider mt-0.5 hidden sm:block">Verified on Intuition Mainnet</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                <div className="flex items-center gap-1 sm:gap-2 min-w-0" ref={sortRef}>
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0 hidden sm:inline">Sort</span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setSortOpen(!sortOpen); playClick(); }}
                      onMouseEnter={playHover}
                      className="flex items-center justify-between gap-2 bg-slate-900/80 border border-slate-700/80 text-slate-200 font-mono text-[10px] sm:text-xs font-semibold uppercase tracking-wider pl-2 sm:pl-3 pr-7 sm:pr-8 py-2 rounded-lg hover:border-slate-600 focus:border-intuition-primary/50 focus:ring-1 focus:ring-intuition-primary/30 outline-none cursor-pointer transition-colors min-w-[7.5rem] max-w-[42vw] sm:min-w-[200px] sm:max-w-none text-left"
                    >
                      <span className="truncate">{getSortLabel(sortBy)}</span>
                      <ChevronDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {sortOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 py-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-[100] max-h-[280px] overflow-y-auto">
                        {(['value_desc', 'value_asc', 'magnitude_desc', 'magnitude_asc', 'newest', 'oldest'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => toggleSort(opt)}
                            onMouseEnter={playHover}
                            className={`w-full px-4 py-2.5 text-left text-[11px] font-mono font-semibold uppercase tracking-wider transition-colors ${sortBy === opt ? 'bg-intuition-primary/20 text-intuition-primary' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                          >
                            {getSortLabel(opt)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => account && fetchUserData(account)}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-700/80 bg-slate-900/50 text-slate-400 hover:text-white hover:border-slate-600 hover:bg-slate-800/50 transition-all shrink-0"
                  title="Refresh"
                >
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 px-3 py-3 md:hidden sm:gap-3">
              {sortedPositions.length > 0
                ? paginatedPositions.map((pos) => {
                    const isOpposition = (pos.atom?.label || '').includes('OPPOSING');
                    return (
                      <div
                        key={`m-${pos.id}-${pos.curveId ?? 1}`}
                        className="rounded-2xl border border-slate-800 bg-white/[0.03] p-3 shadow-lg min-w-0"
                        onMouseEnter={() => setSelectedPosition(pos)}
                      >
                        <Link to={`/markets/${pos.id}`} className="flex gap-3 min-w-0">
                          <div className="h-11 w-11 shrink-0 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                            {pos.atom?.image ? (
                              <img src={pos.atom.image} className="h-full w-full object-cover" alt="" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <User className="h-5 w-5 text-slate-600" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`font-semibold text-sm leading-snug line-clamp-2 ${isOpposition ? 'text-intuition-danger' : 'text-white'}`}
                              title={pos.atom?.label}
                            >
                              {pos.atom?.label || 'Unknown'}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] text-slate-500 truncate">UID · {pos.id.slice(0, 10)}…</p>
                          </div>
                          <div className={`shrink-0 text-right text-sm font-bold tabular-nums ${pos.pnl >= 0 ? 'text-intuition-success' : 'text-intuition-danger'}`}>
                            {pos.pnl >= 0 ? '+' : ''}
                            {pos.pnl.toFixed(1)}%
                          </div>
                        </Link>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-xl border border-white/10 bg-black/40 px-2.5 py-2">
                            <p className="text-slate-500 font-medium">Value</p>
                            <p className="mt-0.5 font-mono font-bold text-white inline-flex items-baseline gap-1 truncate">
                              <CurrencySymbol size="sm" leading className="text-intuition-primary/90 shrink-0" />
                              <span className="truncate">{formatMarketValue(pos.value)}</span>
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/40 px-2.5 py-2">
                            <p className="text-slate-500 font-medium">Size</p>
                            <p className="mt-0.5 font-mono font-bold text-white tabular-nums truncate">{formatDisplayedShares(pos.shares)}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-500 truncate" title={getCurveLabel(pos.curveId ?? 1)}>
                          Curve · {getCurveLabel(pos.curveId ?? 1)}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <Link
                            to={`/markets/${pos.id}`}
                            onClick={() => { playClick(); }}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-intuition-danger/50 py-2 text-intuition-danger font-semibold text-[11px] hover:bg-intuition-danger/10 transition-all"
                          >
                            <LogOut size={12} /> Exit
                          </Link>
                          <button
                            type="button"
                            onClick={() => { playClick(); setSharePosition(pos); }}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-intuition-primary/50 py-2 text-intuition-primary font-semibold text-[11px] hover:bg-intuition-primary/10 transition-all"
                          >
                            <Sparkles size={12} /> Share
                          </button>
                        </div>
                      </div>
                    );
                  })
                : !loading ? (
                    <div className="py-16 text-center font-sans text-sm text-slate-500 col-span-2">No open positions yet.</div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-16 col-span-2">
                      <PageLoadingSpinner size="md" />
                      <span className="text-xs text-slate-500 font-sans">Loading positions…</span>
                    </div>
                  )}
            </div>
            <div className="hidden md:block overflow-x-auto overflow-y-hidden min-h-[280px] sm:min-h-[320px] -mx-px">
              <table className="w-full text-left font-mono text-xs sm:text-sm xl:text-base table-fixed min-w-[600px]" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '24%', minWidth: 0 }} />
                  <col style={{ width: '10%', minWidth: 0 }} />
                  <col style={{ width: '12%', minWidth: 0 }} />
                  <col style={{ width: '14%', minWidth: 0 }} />
                  <col style={{ width: '14%', minWidth: 0 }} />
                  <col style={{ width: '12%', minWidth: 0 }} />
                  <col style={{ width: '14%', minWidth: 0 }} />
                </colgroup>
                <thead className="text-slate-600 uppercase font-black tracking-widest border-b border-slate-900 bg-[#080808] text-[10px] sm:text-xs xl:text-sm">
                  <tr>
                    <th className="px-2 sm:px-3 md:px-4 xl:px-5 py-3 sm:py-4 md:py-5 overflow-hidden">Identity_Node</th>
                    <th className="px-2 sm:px-3 md:px-4 xl:px-5 py-3 sm:py-4 md:py-5 hidden lg:table-cell overflow-hidden">Sector</th>
                    <th className="px-2 sm:px-3 md:px-4 xl:px-5 py-3 sm:py-4 md:py-5 overflow-hidden">Curve</th>
                    <th className="px-2 sm:px-3 md:px-4 xl:px-5 py-3 sm:py-4 md:py-5 overflow-hidden">Magnitude</th>
                    <th className="px-2 sm:px-3 md:px-4 xl:px-5 py-3 sm:py-4 md:py-5 overflow-hidden">Net_Valuation</th>
                    <th className="px-2 sm:px-3 md:px-4 xl:px-5 py-3 sm:py-4 md:py-5 text-right overflow-hidden">PnL</th>
                    <th className="px-2 sm:px-3 md:px-4 xl:px-5 py-3 sm:py-4 md:py-5 text-right overflow-hidden">Exit / Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sortedPositions.length > 0 ? paginatedPositions.map((pos) => {
                    const isOpposition = (pos.atom?.label || '').includes('OPPOSING');
                    return (
                      <tr
                        key={`${pos.id}-${pos.curveId ?? 1}`}
                        className="hover:bg-white/5 transition-all group cursor-pointer"
                        onMouseEnter={() => setSelectedPosition(pos)}
                      >
                        <td className="px-2 sm:px-3 md:px-4 xl:px-5 py-4 sm:py-5 md:py-6 min-w-0 overflow-hidden align-top">
                          <Link to={`/markets/${pos.id}`} className="flex items-center gap-2 sm:gap-4 min-w-0">
                            <div className="w-8 h-8 sm:w-9 sm:h-9 xl:w-11 xl:h-11 bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl flex items-center justify-center overflow-hidden group-hover:border-intuition-primary transition-all shrink-0">
                              {pos.atom.image ? <img src={pos.atom.image} className="w-full h-full object-cover" alt="" /> : <User className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-slate-700" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className={`font-black uppercase text-xs sm:text-sm xl:text-base group-hover:text-intuition-primary transition-colors truncate ${isOpposition ? 'text-intuition-danger' : 'text-white'}`} title={pos.atom.label}>{pos.atom.label}</div>
                              <div className="text-[10px] sm:text-xs text-slate-600 font-bold truncate">UID: {pos.id.slice(0, 14)}...</div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 xl:px-5 py-4 sm:py-5 md:py-6 hidden lg:table-cell overflow-hidden align-top">
                          <span className="inline-block px-2 py-0.5 sm:px-2.5 sm:py-1 bg-white/5 border border-white/10 text-slate-500 font-black uppercase text-[10px] sm:text-xs tracking-widest rounded-full group-hover:text-white transition-colors whitespace-nowrap max-w-full truncate">{pos.atom?.type || 'ATOM'}</span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 xl:px-5 py-4 sm:py-5 md:py-6 overflow-hidden align-top">
                          <span className="text-[10px] sm:text-xs xl:text-sm font-black text-slate-400 uppercase block truncate" title={getCurveLabel(pos.curveId ?? 1)}>{getCurveLabel(pos.curveId ?? 1)}</span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 xl:px-5 py-4 sm:py-5 md:py-6 overflow-hidden align-top">
                          <div className="text-white font-black text-xs sm:text-sm tabular-nums truncate">{formatDisplayedShares(pos.shares)}</div>
                          <div className="text-[10px] sm:text-xs text-slate-600 uppercase font-bold tracking-widest truncate">PORTAL_UNITS</div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 xl:px-5 py-4 sm:py-5 md:py-6 overflow-hidden align-top">
                          <div className="inline-flex items-baseline gap-1.5 text-white font-black text-xs sm:text-sm min-w-0 truncate">
                            <CurrencySymbol size="sm" leading className="text-intuition-primary/90 shrink-0" />
                            <span className="truncate">{formatMarketValue(pos.value)}</span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 xl:px-5 py-4 sm:py-5 md:py-6 text-right overflow-hidden align-top">
                          <div className={`font-black text-xs sm:text-sm xl:text-base whitespace-nowrap ${pos.pnl >= 0 ? 'text-intuition-success' : 'text-intuition-danger'}`}>
                            {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}%
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 xl:px-5 py-4 sm:py-5 md:py-6 text-right overflow-hidden align-top">
                          <div className="flex flex-col sm:flex-row gap-2 justify-end">
                            <Link
                              to={`/markets/${pos.id}`}
                              onClick={() => { playClick(); }}
                              onMouseEnter={playHover}
                              className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 border border-intuition-danger/50 text-intuition-danger hover:bg-intuition-danger/10 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-full transition-all whitespace-nowrap shrink-0"
                            >
                              <LogOut size={12} className="sm:w-3.5 sm:h-3.5 shrink-0" /> Exit
                            </Link>
                            <button
                              type="button"
                              onClick={() => { playClick(); setSharePosition(pos); }}
                              onMouseEnter={playHover}
                              className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 border border-intuition-primary/50 text-intuition-primary hover:bg-intuition-primary/10 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-full transition-all whitespace-nowrap shrink-0"
                            >
                              <Sparkles size={12} className="sm:w-3.5 sm:h-3.5 shrink-0" /> Share
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={7} className="px-8 py-20 text-center text-slate-600 uppercase font-black tracking-widest text-xs sm:text-sm">
                        {loading ? (
                          <div className="flex flex-col items-center gap-4">
                            <PageLoadingSpinner size="md" />
                            <span className="text-xs text-slate-500 font-sans">Loading positions…</span>
                          </div>
                        ) : 'NULL_POSITIONS_DETECTED'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {sortedPositions.length > HOLDINGS_PER_PAGE && (
              <div className="px-4 sm:px-5 md:px-6 xl:px-8 py-4 border-t border-slate-900 flex flex-wrap items-center justify-between gap-4">
                <div className="text-[10px] sm:text-xs font-mono text-slate-500 uppercase tracking-widest">
                  Page {holdingsPage} of {totalHoldingsPages} · {sortedPositions.length} total
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setHoldingsPage((p) => Math.max(1, p - 1)); playClick(); }}
                    disabled={holdingsPage <= 1}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 border border-slate-700 text-slate-400 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-lg hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-all"
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => { setHoldingsPage((p) => Math.min(totalHoldingsPages, p + 1)); playClick(); }}
                    disabled={holdingsPage >= totalHoldingsPages}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 border border-slate-700 text-slate-400 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-lg hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-all"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Transmission History (directly under Active Holdings) */}
        <div className="w-full min-w-0 space-y-3 sm:space-y-4">
          <h3 className="text-sm font-semibold text-white font-sans mb-3 flex items-center gap-2 sm:mb-6 sm:text-base md:font-black md:uppercase md:tracking-[0.35em]">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-intuition-secondary shrink-0" /> Transmission history
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-1 max-h-[480px] sm:max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
            {history.map((tx, idx) => (
              <div key={tx.id + idx} className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between sm:gap-3 sm:p-5 bg-white/5 border border-white/5 rounded-xl sm:rounded-2xl group hover:border-white/10 transition-all min-w-0">
                <div className="flex items-center gap-2 min-w-0 sm:gap-5 sm:flex-1">
                  <div className={`w-1 sm:w-1.5 h-8 sm:h-10 shrink-0 ${tx.type === 'DEPOSIT' ? 'bg-intuition-success shadow-glow-success' : 'bg-intuition-danger shadow-glow-red'} rounded-full`}></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] sm:text-xs font-black uppercase shrink-0 ${tx.type === 'DEPOSIT' ? 'text-intuition-success' : 'text-intuition-danger'}`}>{tx.type === 'DEPOSIT' ? 'ACQUIRE' : 'LIQUIDATE'}</span>
                      <span className="text-white font-black text-xs sm:text-sm uppercase truncate min-w-0" title={tx.assetLabel}>{tx.assetLabel || 'UNIDENTIFIED_NODE'}</span>
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-600 font-mono mt-0.5 truncate">TX: {tx.id.slice(0, 20)}...</div>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 text-right sm:ml-auto sm:w-auto sm:shrink-0">
                  <div className="text-white font-black text-sm sm:text-base">{(() => {
                    try {
                      return safeParseUnits(tx.assets).toFixed(4);
                    } catch { return '0.0000'; }
                  })()} <CurrencySymbol size="md" /></div>
                  <div className="text-[10px] sm:text-xs text-slate-600 font-mono uppercase mt-0.5">{new Date(tx.timestamp).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <div className="col-span-2 py-12 text-center text-slate-600 uppercase font-black tracking-widest text-[10px] sm:text-sm">
                AWAITING_INGRESS_SIGNALS...
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Sidebar: Equity Vol + Asset Exposure (beside ledger) */}
        <div className="md:col-span-1 lg:col-span-5 xl:col-span-4 min-w-0 grid grid-cols-2 md:grid-cols-1 gap-3 sm:gap-4 lg:gap-8">
            <div className="bg-[#02040a] border border-slate-900 p-3 sm:p-6 xl:p-8 rounded-2xl sm:rounded-3xl shadow-2xl relative overflow-hidden group hover:border-intuition-primary/20 transition-all min-h-[280px] sm:min-h-[400px] xl:min-h-[440px] 2xl:min-h-[480px] flex flex-col min-w-0">
                <div className="flex justify-between items-start mb-4 sm:mb-6 relative z-10 gap-4 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 shrink">
                        <div className="flex flex-col items-center mr-1 shrink-0">
                            <span className="text-[10px] font-black text-intuition-primary leading-none">01</span>
                            <span className="text-[10px] font-black text-intuition-primary leading-none">10</span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-semibold font-sans text-white tracking-tight flex items-center gap-2 truncate md:font-display md:font-black md:uppercase md:tracking-[0.35em]">
                            Equity over time
                        </h4>
                    </div>
                    <div className="text-right shrink-0 pr-1 min-w-0">
                        <div className="text-xl sm:text-2xl xl:text-3xl 2xl:text-4xl font-black text-intuition-primary font-mono text-glow-blue leading-none inline-flex items-baseline gap-2 min-w-0">
                            <CurrencySymbol size="xl" leading className="text-intuition-primary/90 shrink-0" />
                            <span className="tabular-nums truncate max-w-[min(36vw,100px)] max-md:text-lg sm:max-w-[140px] xl:max-w-[180px]" title={portfolioValue}>{portfolioValue}</span>
                        </div>
                        <div className="text-[10px] sm:text-xs text-slate-500 font-semibold font-sans mt-1 sm:mt-1.5 md:font-black md:uppercase md:tracking-widest">Current estimate</div>
                    </div>
                </div>

                <div className="relative z-10 h-[200px] min-h-[180px] w-full rounded-xl overflow-hidden bg-black/60 border border-slate-800/80 sm:h-[260px] sm:min-h-[220px]" style={{ boxShadow: 'inset 0 0 80px rgba(0,243,255,0.04), 0 0 40px rgba(0,0,0,0.4)' }}>
                    <ResponsiveContainer width="100%" height="100%" debounce={50}>
                        <ComposedChart
                            data={(() => {
                                const raw = chartData.length >= 2 ? chartData : [
                                    { timestamp: Date.now() - 86400000, val: 0 },
                                    { timestamp: Date.now(), val: parseFloat(String(portfolioValue).replace(/,/g, '')) || 0 }
                                ];
                                return raw.map(p => ({ ...p, val: Number(p.val) }));
                            })()}
                            margin={{ top: 12, right: 52, left: 12, bottom: 12 }}
                        >
                            <defs>
                                <linearGradient id="equity-temporal-grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#00f3ff" stopOpacity={0.5}/>
                                    <stop offset="40%" stopColor="#00f3ff" stopOpacity={0.12}/>
                                    <stop offset="100%" stopColor="#00f3ff" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,243,255,0.06)" vertical={false} horizontal={true} />
                            <XAxis dataKey="timestamp" hide />
                            <YAxis 
                                orientation="right" 
                                stroke="transparent" 
                                width={48}
                                tick={{ fill: 'rgba(0,243,255,0.7)', fontSize: 11, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}
                                tickLine={false} 
                                axisLine={false} 
                                domain={[0, 'dataMax + 1']}
                                tickFormatter={(v) => Number(v).toFixed(1)}
                            />
                            <RechartTooltip content={<EquityChartTooltip />} cursor={{ stroke: 'rgba(0,243,255,0.6)', strokeWidth: 1 }} />
                            <Area 
                                type="monotone" 
                                dataKey="val" 
                                fill="url(#equity-temporal-grad)" 
                                stroke="none"
                                isAnimationActive={true} 
                                animationDuration={1000}
                                baseValue={0}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="val" 
                                stroke="#00f3ff" 
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 6, fill: '#00f3ff', stroke: 'rgba(0,243,255,0.5)', strokeWidth: 2 }}
                                isAnimationActive={true}
                                animationDuration={1000}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-4 pt-6 border-t border-white/5 flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="text-xs font-medium font-sans text-slate-600 tracking-wide">Live mainnet data</div>
                    </div>
                </div>
            </div>

            <div className="bg-black border border-slate-900 p-3 sm:p-6 xl:p-8 rounded-2xl sm:rounded-3xl min-h-[260px] sm:min-h-[360px] xl:min-h-[400px] 2xl:min-h-[420px] flex flex-col relative overflow-hidden group hover:border-white/10 transition-all shadow-2xl min-w-0">
                <div className="absolute top-0 right-0 p-4 sm:p-6 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000 text-intuition-primary">
                    <PulseIcon className="w-40 h-40 sm:w-48 sm:h-48 xl:w-56 xl:h-56" />
                </div>
                
                <h4 className="text-[10px] sm:text-xs xl:text-sm font-semibold text-slate-500 tracking-wide mb-4 sm:mb-6 relative z-10">Asset exposure</h4>
                
                <div className="flex-1 flex flex-col items-center justify-center relative z-10 min-h-0">
                    <div className="w-full h-[120px] sm:h-[200px] xl:h-[240px] 2xl:h-[260px] mb-4 sm:mb-8">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={exposureData.length > 0 ? exposureData : [{ name: 'AWAITING_SIGNAL', value: 1 }]} 
                                    innerRadius="42%"
                                    outerRadius="72%"
                                    paddingAngle={8} 
                                    dataKey="value"
                                    nameKey="name"
                                    stroke="none"
                                >
                                    {exposureData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="outline-none" />
                                    ))}
                                    {exposureData.length === 0 && <Cell fill="#111111" />}
                                </Pie>
                                <RechartTooltip 
                                    contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '0', fontSize: '10px' }}
                                    itemStyle={{ color: '#fff', fontFamily: 'monospace' }}
                                    formatter={(v: number) => `${v.toFixed(1)}%`}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="w-full grid grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto max-h-[200px] custom-scrollbar pr-2">
                        {exposureData.length > 0 ? exposureData.map((entry, index) => (
                            <div key={index} className="flex items-center justify-between group/item py-1">
                                <div className="flex items-center gap-3">
                                    <div className="w-3.5 h-3.5 rounded-full shadow-sm shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                    <span className="text-xs font-black text-slate-400 group-hover/item:text-white transition-colors uppercase tracking-wider">{entry.name}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-black font-mono text-white text-glow-white">{entry.value.toFixed(1)}%</span>
                                    <div className="w-1 h-3 bg-intuition-danger/40 opacity-0 group-hover/item:opacity-100 transition-opacity"></div>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-8 opacity-20 text-xs font-black font-mono uppercase tracking-[0.4em]">Awaiting_Neural_Sync...</div>
                        )}
                    </div>
                </div>
            </div>

            {/* My Created: identities and claims created by the user (sidebar) */}
            <div className="col-span-2 md:col-span-1 bg-black border border-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl flex flex-col relative overflow-hidden group hover:border-intuition-primary/20 transition-all shadow-2xl min-h-0">
              <div className="flex flex-nowrap items-center justify-between gap-2 mb-3 sm:mb-4 min-w-0">
                <h4 className="text-xs font-semibold text-white font-sans tracking-tight flex items-center gap-2 min-w-0 shrink md:font-black md:uppercase md:tracking-[0.35em]">
                  <Sparkles className="w-4 h-4 text-intuition-primary shrink-0" /> <span className="truncate">My created</span>
                </h4>
                <div className="flex gap-1 sm:gap-1.5 shrink-0">
                  <button
                    onClick={() => { playClick(); setMyCreatedTab('identities'); }}
                    onMouseEnter={playHover}
                    className={`px-2 sm:px-3 py-1.5 rounded-full font-black text-[9px] sm:text-[10px] uppercase tracking-wider transition-all whitespace-nowrap ${myCreatedTab === 'identities' ? 'bg-intuition-primary text-black' : 'bg-white/5 border border-white/10 text-slate-500 hover:text-white hover:border-intuition-primary/40'}`}
                  >
                    Identities
                  </button>
                  <button
                    onClick={() => { playClick(); setMyCreatedTab('claims'); }}
                    onMouseEnter={playHover}
                    className={`px-2 sm:px-3 py-1.5 rounded-full font-black text-[9px] sm:text-[10px] uppercase tracking-wider transition-all whitespace-nowrap ${myCreatedTab === 'claims' ? 'bg-intuition-primary text-black' : 'bg-white/5 border border-white/10 text-slate-500 hover:text-white hover:border-intuition-primary/40'}`}
                  >
                    Claims
                  </button>
                </div>
              </div>
              {myCreatedLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 flex-1 min-h-[180px]">
                  <Loader2 size={22} className="animate-spin text-intuition-primary" />
                  <span className="text-slate-500 font-black uppercase tracking-widest text-[10px]">SYNC...</span>
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-[240px] sm:max-h-[280px] custom-scrollbar pr-1 flex-1 min-h-0">
                  {myCreatedTab === 'identities' ? (
                    myCreated.identities.length > 0 ? (
                      myCreated.identities.map((item) => (
                        <Link
                          key={item.id}
                          to={`/markets/${item.id}`}
                          onClick={() => playClick()}
                          onMouseEnter={playHover}
                          className="flex items-center justify-between gap-2 p-3 bg-white/5 border border-white/5 rounded-xl hover:border-intuition-primary/40 transition-all group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center overflow-hidden shrink-0 group-hover:border-intuition-primary transition-all">
                              {item.image ? <img src={item.image} className="w-full h-full object-cover" alt="" /> : <User className="w-4 h-4 text-slate-700" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-black text-white text-xs truncate group-hover:text-intuition-primary transition-colors">{item.label}</div>
                              <div className="text-[9px] text-slate-600 font-bold uppercase">{item.type}</div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-intuition-primary font-black text-xs">{item.marketCap?.toFixed(2) ?? '0.00'} <CurrencySymbol size="sm" /></div>
                            <div className="text-[9px] text-slate-600 font-bold">{item.positionCount ?? 0} pos</div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="text-center py-12 text-slate-600 uppercase font-black tracking-widest text-[10px]">NO_IDENTITIES_YET</div>
                    )
                  ) : (
                    myCreated.claims.length > 0 ? (
                      myCreated.claims.map((item) => (
                        <Link
                          key={item.id}
                          to={`/markets/${item.id}`}
                          onClick={() => playClick()}
                          onMouseEnter={playHover}
                          className="flex items-center justify-between gap-2 p-3 bg-white/5 border border-white/5 rounded-xl hover:border-intuition-primary/40 transition-all group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center overflow-hidden shrink-0 group-hover:border-intuition-primary transition-all">
                              {item.image ? <img src={item.image} className="w-full h-full object-cover" alt="" /> : <Globe className="w-4 h-4 text-slate-700" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-black text-white text-xs truncate group-hover:text-intuition-primary transition-colors">{item.label}</div>
                              <div className="text-[9px] text-slate-600 font-bold uppercase">CLAIM</div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-intuition-primary font-black text-xs">{item.marketCap?.toFixed(2) ?? '0.00'} <CurrencySymbol size="sm" /></div>
                            <div className="text-[9px] text-slate-600 font-bold">{item.positionCount ?? 0} pos</div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="text-center py-12 text-slate-600 uppercase font-black tracking-widest text-[10px]">NO_CLAIMS_YET</div>
                    )
                  )}
                </div>
              )}
            </div>
        </div>
        </div>
        {/* Single Portfolio surface for Arena: indexed portal-list stakes from your wallet (subgraph). */}
        <ArenaMyRankingsPanel wallet={account ?? null} />
      </div>
    </div>
  );
};

export default Portfolio;
