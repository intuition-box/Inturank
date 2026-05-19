
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getWalletBalance, getShareBalancesBatch, resolveENS, toAddress } from '../services/web3';
import { resolveProfileSearchInput, walletDisplayMeta, rememberTrustNameForProfile, TRUST_DISPLAY_UPDATED_EVENT, canonicalTrustFullName } from '../services/tns';
import {
  getUserPositions,
  getPortfolioPositionsWithValue,
  getUserHistory,
  getVaultsByIds,
  getUserActivityStats,
  getUserIdTransactionCount,
  getCurveLabel,
  resolveMetadata,
} from '../services/graphql';
import { User, PieChart as PieIcon, Activity, Zap, Shield, TrendingUp, Layers, RefreshCw, Search, ArrowRight, AlertTriangle, Database, Wallet, Loader2, Fingerprint, Activity as PulseIcon, UserPlus, UserMinus, Mail, Copy, ChevronRight, Trash2, Share2, X } from 'lucide-react';
import { formatEther, isAddress, getAddress } from 'viem';
import { Transaction } from '../types';
import {
  calculateCategoryExposure,
  calculateSentimentBias,
  formatMarketValue,
  formatDisplayedShares,
  safeParseUnits,
  calculateAgentPrice,
  formatMaskedWalletAddress,
  formatWalletHeadlineForUi,
} from '../services/analytics';
import {
  CURRENCY_SYMBOL,
  DEFAULT_PROFILE_AVATAR_URL,
  DISTRUST_ATOM_ID,
  LINEAR_CURVE_ID,
  PAGE_HERO_EYEBROW,
  PAGE_HERO_TITLE,
  PAGE_HERO_BODY,
} from '../constants';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { PageLoadingSpinner } from '../components/PageLoading';
import { playClick, playHover } from '../services/audio';
import { toast } from '../components/Toast';
import { isFollowing, addFollow, removeFollow, setFollowEmailAlerts, type FollowEntry } from '../services/follows';
// import BadgesSection from '../components/BadgesSection';
import { getEmailSubscription, removeEmailSubscription, setEmailAlertFrequency, type EmailAlertFrequency } from '../services/emailNotifications';
import { useEmailNotify } from '../contexts/EmailNotifyContext';
import ProfileShareCard from '../components/ProfileShareCard';
import IntuRankXpBadge from '../components/IntuRankXpBadge';
import { getProtocolXpTotal, PROTOCOL_XP_UPDATED_EVENT } from '../services/protocolXp';
import { fetchArenaXpRecordForWallet } from '../services/arenaXp';
import { arenaPickCreditXp } from '../services/arenaPickCredit';

const COLORS = ['#00f3ff', '#00ff9d', '#ff0055', '#facc15', '#94a3b8'];

/** Rounded “product” glass — matches Home / Skill Playground energy */
const GLASS_SHEET =
  'relative overflow-hidden rounded-[1.5rem] border border-white/[0.1] bg-[#05070c]/[0.88] ' +
  'shadow-[0_20px_50px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.07)] ' +
  'ring-1 ring-inset ring-white/[0.04] backdrop-blur-2xl backdrop-saturate-150 ' +
  'transition-[border-color,box-shadow,transform] duration-300';

const MESH_ACCENT = {
  background:
    'radial-gradient(ellipse 80% 55% at 0% 0%, rgba(0,243,255,0.14), transparent 52%), ' +
    'radial-gradient(ellipse 60% 45% at 100% 100%, rgba(255,30,109,0.1), transparent 48%)',
} as const;

/** Card / table labels: crisp sans, no faux-wide tracking */
const labelSm =
  'font-sans text-xs font-semibold text-slate-100 antialiased tracking-tight [text-rendering:geometricPrecision]';
const labelMuted =
  'font-sans text-[10px] font-medium text-slate-400 antialiased tracking-tight [text-rendering:geometricPrecision]';
const statDisplay =
  'font-display text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white antialiased [text-rendering:geometricPrecision] [text-shadow:none]';

const POSITIONS_PER_PAGE = 10;
/** Hard cap so a wedged RPC cannot leave "Loading positions…" forever. */
const PROFILE_FETCH_BUDGET_MS = 52_000;

const PublicProfile: React.FC = () => {
  const { address: addressParam = '' } = useParams<{ address: string }>();
  const navigate = useNavigate();
  /** Checksummed; avoids search/navigation race with mixed-case 0x in the path. */
  const address = useMemo(() => {
    const t = addressParam?.trim();
    if (!t) return undefined;
    if (!isAddress(t as `0x${string}`)) return undefined;
    try {
      return getAddress(t as `0x${string}`);
    } catch {
      return undefined;
    }
  }, [addressParam]);

  const activeProfileFetchFor = useRef<string | null>(null);
  /** Bumps on each profile load so abandoned requests never skip `setLoading(false)` for the active fetch. */
  const profileFetchGenerationRef = useRef(0);
  const { address: connectedAddress } = useAccount();
  const { openEmailNotify, isEmailNotifyOpen } = useEmailNotify();
  const [profileAlias, setProfileAlias] = useState<{ primaryLabel: string; isNamed: boolean } | null>(null);
  const [followEntry, setFollowEntry] = useState<FollowEntry | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [volumeData, setVolumeData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [portfolioValue, setPortfolioValue] = useState('0.00');
  const [ethBalance, setEthBalance] = useState('0.00');
  const [sentimentBias, setSentimentBias] = useState({ trust: 50, distrust: 50 });
  const [exposureData, setExposureData] = useState<any[]>([]);
  const [semanticFootprint, setSemanticFootprint] = useState(0);
  const [activeHoldingsCount, setActiveHoldingsCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [subscription, setSubscription] = useState<{ email: string; nickname?: string; subscribedAt?: number; alertFrequency?: EmailAlertFrequency } | null>(null);
  const [positionsPage, setPositionsPage] = useState(1);
  const [showProfileShareModal, setShowProfileShareModal] = useState(false);

  const isOwnProfile = !!address && !!connectedAddress && address.toLowerCase() === connectedAddress.toLowerCase();
  /** Param present in URL but not a valid 0x address (e.g. typos, truncated paste). */
  const isInvalidAddressParam = Boolean(addressParam?.trim()) && !address;

  const totalPositionPages = Math.max(1, Math.ceil(positions.length / POSITIONS_PER_PAGE));
  const positionsPageSlice = useMemo(() => {
    const start = (positionsPage - 1) * POSITIONS_PER_PAGE;
    return positions.slice(start, start + POSITIONS_PER_PAGE);
  }, [positions, positionsPage]);

  const displayHeadline = useMemo(
    () => (address ? formatWalletHeadlineForUi(profileAlias, address) : ''),
    [profileAlias, address],
  );
  const maskedWalletDisplay = useMemo(() => (address ? formatMaskedWalletAddress(address) : ''), [address]);
  const profileShareUrl = useMemo(() => {
    if (!address || typeof window === 'undefined') return '';
    return `${window.location.origin}/profile/${address}`;
  }, [address]);

  /** Mirrors hero badges — share card trader tier. */
  const traderStatusLabel = useMemo(() => {
    if (activeHoldingsCount > 50) return 'Elite trader';
    if (activeHoldingsCount > 10) return 'Pro trader';
    return 'Explorer';
  }, [activeHoldingsCount]);

  const [protocolXpTotal, setProtocolXpTotal] = useState(0);
  /** Arena XP for the address being viewed — pulled from indexer (`fetchArenaXpRecordForWallet`),
   * with an optional floor from the connected wallet's local pick credit if it's the same address. */
  const [arenaXpTotal, setArenaXpTotal] = useState(0);
  /** False until the first indexer fetch for this profile finishes (matches Arena / RankedList XP badge). */
  const [arenaGraphReady, setArenaGraphReady] = useState(false);

  const refreshSubscription = useCallback((addr: string | null) => {
    if (!addr) {
      setSubscription(null);
      return;
    }
    const sub = getEmailSubscription(addr);
    setSubscription(sub ? { email: sub.email, nickname: sub.nickname, subscribedAt: sub.subscribedAt, alertFrequency: sub.alertFrequency } : null);
  }, []);

  useEffect(() => {
    if (isOwnProfile && address) refreshSubscription(address);
    else setSubscription(null);
  }, [isOwnProfile, address, refreshSubscription]);

  useEffect(() => {
    if (isEmailNotifyOpen === false && isOwnProfile && address) refreshSubscription(address);
  }, [isEmailNotifyOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (address) {
      setProfileAlias(null);
      setPositions([]);
      setHistory([]);
      setVolumeData([]);
      setPortfolioValue('0.00');
      setEthBalance('0.00');
      setSentimentBias({ trust: 50, distrust: 50 });
      setExposureData([]);
      setSemanticFootprint(0);
      setActiveHoldingsCount(0);
      fetchUserData(address);
    } else if (addressParam?.trim()) {
      setLoading(false);
      setPositions([]);
      setHistory([]);
      setVolumeData([]);
      setSemanticFootprint(0);
      setActiveHoldingsCount(0);
    }
  }, [address, addressParam]);

  useEffect(() => {
    setPositionsPage(1);
  }, [address]);

  useEffect(() => {
    setShowProfileShareModal(false);
  }, [address]);

  useEffect(() => {
    if (!address || typeof window === 'undefined') {
      setProtocolXpTotal(0);
      return;
    }
    const refresh = () => setProtocolXpTotal(getProtocolXpTotal(address));
    refresh();
    window.addEventListener(PROTOCOL_XP_UPDATED_EVENT, refresh as EventListener);
    return () => window.removeEventListener(PROTOCOL_XP_UPDATED_EVENT, refresh as EventListener);
  }, [address]);

  /**
   * Resolve Arena XP for this profile. Indexer is the source of truth; for the connected wallet
   * we floor at local pick credit so freshly confirmed picks aren't invisible while the indexer syncs.
   */
  useEffect(() => {
    if (!address) {
      setArenaGraphReady(false);
      setArenaXpTotal(0);
      return;
    }
    setArenaGraphReady(false);
    let cancelled = false;
    const sync = async () => {
      try {
        const rec = await fetchArenaXpRecordForWallet(address);
        if (cancelled) return;
        const local = isOwnProfile ? arenaPickCreditXp(address) : 0;
        setArenaXpTotal(Math.max(rec.xp ?? 0, local));
      } catch {
        if (cancelled) return;
        const local = isOwnProfile ? arenaPickCreditXp(address) : 0;
        setArenaXpTotal(local);
      } finally {
        if (!cancelled) setArenaGraphReady(true);
      }
    };
    void sync();
    const onChain = () => void sync();
    window.addEventListener('inturank-arena-onchain-updated', onChain);
    return () => {
      cancelled = true;
      window.removeEventListener('inturank-arena-onchain-updated', onChain);
    };
  }, [address, isOwnProfile]);

  useEffect(() => {
    if (positionsPage > totalPositionPages) setPositionsPage(totalPositionPages);
  }, [positionsPage, totalPositionPages]);

  useEffect(() => {
    if (connectedAddress && address) setFollowEntry(isFollowing(connectedAddress, address) ?? null);
    else setFollowEntry(null);
  }, [connectedAddress, address]);

  // If follow has emailAlerts on but user never added email, turn alerts off so UI and backend stay in sync
  useEffect(() => {
    if (!connectedAddress || !address || !followEntry?.emailAlerts) return;
    if (!getEmailSubscription(connectedAddress)) {
      setFollowEmailAlerts(connectedAddress, address, false);
      setFollowEntry((prev) => (prev ? { ...prev, emailAlerts: false } : null));
    }
  }, [connectedAddress, address, followEntry?.emailAlerts]);

  useEffect(() => {
    if (!address) {
      setProfileAlias(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      walletDisplayMeta(address)
        .then((meta) => {
          if (!cancelled) setProfileAlias(meta);
        })
        .catch(() => {
          if (!cancelled) {
            try {
              setProfileAlias({ primaryLabel: getAddress(address as `0x${string}`), isNamed: false });
            } catch {
              setProfileAlias(null);
            }
          }
        });
    };
    load();
    const onTrust = (ev: Event) => {
      const d = (ev as CustomEvent<{ address?: string }>).detail;
      if (d?.address && address && d.address.toLowerCase() === address.toLowerCase()) load();
    };
    window.addEventListener(TRUST_DISPLAY_UPDATED_EVENT, onTrust);
    return () => {
      cancelled = true;
      window.removeEventListener(TRUST_DISPLAY_UPDATED_EVENT, onTrust);
    };
  }, [address]);

  const fetchUserData = async (addr: string) => {
    const gen = ++profileFetchGenerationRef.current;
    activeProfileFetchFor.current = addr;
    setLoading(true);

    const stale = () =>
      gen !== profileFetchGenerationRef.current || activeProfileFetchFor.current !== addr;

    try {

      await Promise.race([
        (async () => {
          const bal = await getWalletBalance(addr);
          if (stale()) return;
          setEthBalance(Number(bal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

          // Prefer positions_with_value (Hasura: theoretical_value, sorted) — same fast path as Portfolio;
          // skips hundreds of getShares/previewRedeem RPCs per profile load.
          const [positionsWithValueRaw, chainHistory, activityStats, graphTxCount] = await Promise.all([
            getPortfolioPositionsWithValue(addr).catch(() => []),
            getUserHistory(addr).catch(() => []),
            getUserActivityStats(addr).catch(() => ({ txCount: 0, holdingsCount: 0 })),
            getUserIdTransactionCount(addr).catch(() => 0),
          ]);
          if (stale()) return;

          const positionsWithValue = Array.isArray(positionsWithValueRaw) ? positionsWithValueRaw : [];

          let graphPositions: any[] = [];
          if (positionsWithValue.length === 0) {
            graphPositions = await getUserPositions(addr).catch(() => []);
            if (stale()) return;
          }

          const historyVaultIds = chainHistory.map((tx) => tx.vaultId?.toLowerCase()).filter(Boolean);
          const graphVaultIds = (positionsWithValue.length > 0 ? positionsWithValue : graphPositions)
            .map((p: any) => p.vault?.term_id?.toLowerCase())
            .filter(Boolean);
          const uniqueVaultIds = Array.from(new Set([...graphVaultIds, ...historyVaultIds])) as string[];

          const metadata =
            positionsWithValue.length > 0 ? [] : await getVaultsByIds(uniqueVaultIds).catch(() => []);
          if (stale()) return;

          const DUST = 1e-8;
          const finalPositionsBuf: any[] = [];

          if (positionsWithValue.length > 0) {
            for (const p of positionsWithValue) {
              try {
                const rawId = p.vault?.term_id;
                if (!rawId || typeof rawId !== 'string') continue;
                const id = rawId.toLowerCase();
                const rawCurve = p.vault?.curve_id;
                const curveId = rawCurve != null ? Number(rawCurve) || LINEAR_CURVE_ID : LINEAR_CURVE_ID;
                const sharesNum = safeParseUnits(p.shares);
                if (!Number.isFinite(sharesNum) || sharesNum <= DUST) continue;
                const value =
                  p.theoretical_value != null ? Number(formatEther(BigInt(p.theoretical_value))) : 0;

                const triple = p.vault?.term?.triple;
                const atom = p.vault?.term?.atom;
                let label: string;
                let image: string | undefined;
                let type: string;
                const isCounter = triple?.counter_term_id?.toLowerCase() === id;
                const pointsToDistrust = triple?.object?.term_id
                  ?.toLowerCase()
                  .includes(DISTRUST_ATOM_ID.toLowerCase().slice(26));

                if (isCounter || pointsToDistrust) {
                  const subjectLabel = triple?.subject
                    ? resolveMetadata(triple.subject).label
                    : triple?.subject?.term_id?.slice(0, 8) || 'NODE';
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

                const dup = finalPositionsBuf.some(
                  (x: any) => x.id === id && (x.curveId ?? LINEAR_CURVE_ID) === (curveId ?? LINEAR_CURVE_ID),
                );
                if (!dup) {
                  finalPositionsBuf.push({
                    id,
                    curveId,
                    shares: sharesNum,
                    value,
                    atom: { label, id, image, type },
                  });
                }
              } catch {
                /* skip row */
              }
            }
          } else {
            const graphWithShares = graphPositions.filter((p: any) => {
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
                const rawCurve =
                  p.vault?.curve_id ?? metadata.find((m: any) => m.id.toLowerCase() === id)?.curveId;
                const curveId = rawCurve != null ? Number(rawCurve) || LINEAR_CURVE_ID : LINEAR_CURVE_ID;
                return { termId: id, curveId };
              })
              .filter(Boolean) as { termId: string; curveId: number }[];

            const sharesMap =
              batchItems.length > 0 ? await getShareBalancesBatch(addr, batchItems) : new Map<string, string>();
            if (stale()) return;

            for (const p of graphWithShares) {
              try {
                const rawId = p.vault?.term_id;
                if (!rawId || typeof rawId !== 'string') continue;
                const id = rawId.toLowerCase();
                const meta = metadata.find((m: any) => m.id.toLowerCase() === id);
                const rawCurve = p.vault?.curve_id ?? meta?.curveId;
                const curveId = rawCurve != null ? Number(rawCurve) || LINEAR_CURVE_ID : LINEAR_CURVE_ID;

                const sharesRaw = sharesMap.get(`${id}:${curveId}`) ?? '0';
                const sharesNum = typeof sharesRaw === 'string' ? parseFloat(sharesRaw) : Number(sharesRaw);
                if (!Number.isFinite(sharesNum) || sharesNum <= DUST) continue;

                const vault = p.vault;
                const price = vault
                  ? calculateAgentPrice(
                      vault.total_assets || '0',
                      vault.total_shares || '1',
                      vault.current_share_price,
                    )
                  : 0.1;
                const value = sharesNum * price;

                let label = meta?.label || `Agent ${id.slice(0, 6)}...`;
                let image = meta?.image;
                let type = meta?.type || 'ATOM';

                const triple = p.vault?.term?.triple;
                const isCounter = triple?.counter_term_id?.toLowerCase() === id.toLowerCase();
                const pointsToDistrust = triple?.object?.term_id
                  ?.toLowerCase()
                  .includes(DISTRUST_ATOM_ID.toLowerCase().slice(26));

                if (isCounter || pointsToDistrust) {
                  const subjectLabel =
                    triple?.subject?.label || triple?.subject?.term_id?.slice(0, 8) || 'NODE';
                  label = `OPPOSING_${subjectLabel}`.toUpperCase();
                  image = triple?.subject?.image;
                  type = 'CLAIM';
                }

                const dup = finalPositionsBuf.some(
                  (x: any) => x.id === id && (x.curveId ?? LINEAR_CURVE_ID) === (curveId ?? LINEAR_CURVE_ID),
                );
                if (!dup) {
                  finalPositionsBuf.push({
                    id,
                    curveId,
                    shares: sharesNum,
                    value,
                    atom: { label, id, image, type },
                  });
                }
              } catch {
                /* skip row */
              }
            }
          }

          const finalPositions = finalPositionsBuf.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
          const totalAssetsSum = finalPositions.reduce((s, p) => s + (p.value || 0), 0);
          setPositions(finalPositions);
          setActiveHoldingsCount(activityStats.holdingsCount || finalPositions.length);
          setExposureData(calculateCategoryExposure(finalPositions));
          setPortfolioValue(
            totalAssetsSum.toLocaleString(undefined, {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4,
            }),
          );

          const mergedHistory = chainHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          setHistory(mergedHistory);

          // SEMANTIC FOOTPRINT: total transactions from Intuition graph (same definition as getUserHistory)
          const footprintCount =
            graphTxCount > 0
              ? graphTxCount
              : mergedHistory.length > 0
                ? mergedHistory.length
                : activityStats.txCount > 0
                  ? activityStats.txCount
                  : finalPositions.length;
          setSemanticFootprint(footprintCount);

          // SENTIMENT BIAS: use history when available, otherwise infer from holdings
          if (mergedHistory.length > 0) {
            setSentimentBias(calculateSentimentBias(mergedHistory));
          } else if (finalPositions.length > 0) {
            setSentimentBias({ trust: 95, distrust: 5 });
          } else {
            setSentimentBias({ trust: 50, distrust: 50 });
          }

          let currentRunningVol = 0;
          let chartPoints = mergedHistory
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .map((tx, idx) => {
              try {
                const assetVal = parseFloat(formatEther(BigInt(tx.assets || '0')));
                currentRunningVol += assetVal > 0 ? assetVal : 0;
              } catch {
                /* ignore */
              }
              return { idx, val: currentRunningVol };
            });

          if (chartPoints.length === 0 && finalPositions.length > 0) {
            chartPoints = [
              { idx: 0, val: 0 },
              { idx: 1, val: totalAssetsSum },
            ];
          }
          setVolumeData(chartPoints);
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(Object.assign(new Error('profile fetch timed out'), { name: 'ProfileFetchTimeout' })),
            PROFILE_FETCH_BUDGET_MS,
          ),
        ),
      ]);
    } catch (e: unknown) {
      const name = e && typeof e === 'object' && 'name' in e ? (e as { name?: string }).name : '';
      if (name === 'ProfileFetchTimeout') {
        console.warn('PublicProfile: fetch timed out', addr);
        if (gen === profileFetchGenerationRef.current && activeProfileFetchFor.current === addr) {
          setPositions([]);
          setPortfolioValue('0.0000');
          setSemanticFootprint(0);
          setActiveHoldingsCount(0);
          setExposureData([]);
          setVolumeData([]);
          setSentimentBias({ trust: 50, distrust: 50 });
        }
      } else {
        console.error('PROFILE_RECON_FAILURE:', e);
      }
    } finally {
      if (gen === profileFetchGenerationRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSearch = async () => {
      const cleanQuery = searchQuery.trim();
      if (!cleanQuery) return;
      playClick();
      setIsResolving(true);
      try {
        const { address: resolved, error } = await resolveProfileSearchInput(cleanQuery);
        if (resolved) {
          if (canonicalTrustFullName(cleanQuery) || cleanQuery.toLowerCase().endsWith('.trust')) {
            rememberTrustNameForProfile(resolved, cleanQuery);
          }
          navigate(`/profile/${resolved}`);
          void walletDisplayMeta(resolved).then((m) => {
            if (m.isNamed && m.primaryLabel?.toLowerCase().endsWith('.trust')) {
              rememberTrustNameForProfile(resolved, m.primaryLabel);
            }
          });
          setSearchQuery('');
          return;
        }
        toast.error(error || 'Profile not found');
      } catch {
        toast.error('Search failed');
      } finally {
        setIsResolving(false);
      }
  };

  /** Non-zero slices + stable color index (matches legend). Pie `data` is only { name, value }. */
  const exposurePieSlices = useMemo(
    () =>
      exposureData
        .map((entry, colorIndex) => ({ name: entry.name, value: entry.value, colorIndex }))
        .filter((row) => row.value > 0),
    [exposureData]
  );

  const sharePortfolioMix = useMemo(
    () =>
      exposurePieSlices.slice(0, 6).map((row) => ({
        name: row.name,
        value: row.value,
        color: COLORS[row.colorIndex % COLORS.length],
      })),
    [exposurePieSlices],
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#020308] font-mono selection:bg-intuition-primary selection:text-black">
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.035]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.04] retro-grid" aria-hidden />
      <div className="pointer-events-none absolute top-0 right-0 z-0 h-[min(70vw,560px)] w-[min(70vw,560px)] rounded-full bg-intuition-primary/6 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-1/4 left-0 z-0 h-[min(55vw,480px)] w-[min(55vw,480px)] rounded-full bg-[#ff1e6d]/5 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-3 pb-28 pt-5 sm:px-5 sm:pb-20 sm:pt-8 lg:px-8">
      <header className="mb-5 space-y-1.5 font-sans sm:mb-8 sm:space-y-2">
        <p className={PAGE_HERO_EYEBROW}>{isOwnProfile ? 'Your account' : 'Trader profile'}</p>
        <h1 className={`${PAGE_HERO_TITLE} max-md:text-2xl max-md:leading-tight`}>Profile</h1>
        <p className={`${PAGE_HERO_BODY} max-w-2xl`}>
          {isOwnProfile
            ? 'Balances, positions, and activity for your connected wallet.'
            : 'Public view of positions and on-chain activity for this address.'}
        </p>
      </header>

      <div className="relative z-20 mb-6 flex w-full justify-stretch sm:mb-8 sm:justify-end">
          <div className="flex w-full min-w-0 items-center gap-0 rounded-2xl border border-white/[0.1] bg-[#0a0c14]/80 py-1.5 pl-3 pr-1 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-all focus-within:border-intuition-primary/45 focus-within:shadow-[0_0_0_1px_rgba(0,243,255,0.12),0_12px_40px_rgba(0,0,0,0.45)] sm:w-auto sm:pl-4 sm:pr-1.5">
              <input
                  type="text"
                  placeholder="Address, name.trust, or name.eth"
                  className="min-w-0 flex-1 bg-transparent font-sans text-sm text-slate-100 outline-none placeholder:text-slate-500 sm:w-72 sm:flex-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  disabled={isResolving}
              />
              <button
                  onClick={handleSearch}
                  disabled={
                    isResolving ||
                    !(
                      searchQuery.trim().length >= 2 ||
                      isAddress(searchQuery.trim()) ||
                      searchQuery.trim().includes('.')
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-500 transition-all hover:bg-intuition-primary hover:text-black"
              >
                  {isResolving ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              </button>
          </div>
      </div>

      {isInvalidAddressParam && (
        <div
          role="alert"
          className="relative z-20 mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 font-sans text-sm text-amber-100 [text-rendering:geometricPrecision] sm:items-center"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
          <p>
            <span className="font-semibold text-amber-50">Invalid address in URL. </span>
            The path must be a full 42-character <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">0x</code> address. Try pasting the address again or search by TNS / ENS.
          </p>
        </div>
      )}

      <div className="mb-8 rounded-[1.5rem] bg-gradient-to-r from-intuition-primary/45 via-cyan-200/15 to-intuition-primary/40 p-[1px] shadow-[0_0_50px_rgba(0,243,255,0.14)] sm:mb-12 sm:rounded-[2rem]">
        <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-[1.45rem] bg-gradient-to-b from-[#0c101c]/[0.97] to-[#05070d]/[0.98] px-5 pt-6 pb-5 sm:gap-8 sm:rounded-[1.95rem] sm:px-10 sm:pt-9 sm:pb-7 md:flex-row md:items-start md:gap-8 lg:gap-10 md:pb-6">
          <div className="pointer-events-none absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04]" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            style={{ background: MESH_ACCENT.background }}
          />
          <div className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/10 bg-black/40 shadow-[0_0_40px_rgba(0,243,255,0.12),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-inset ring-white/5 sm:h-28 sm:w-28 sm:rounded-3xl">
            <div className="absolute inset-0 rounded-3xl bg-intuition-primary/5 transition-colors group-hover:bg-intuition-primary/10" />
            <img
              src={DEFAULT_PROFILE_AVATAR_URL}
              alt=""
              className="relative z-10 h-full w-full object-cover"
            />
          </div>
          <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-4 md:flex-row md:items-start md:gap-6 md:gap-0 md:pl-1">
            <div className="min-w-0 flex-1 text-center md:pt-1 md:text-left md:pr-8 lg:pr-10">
              <p className="mb-1.5 font-sans text-xs text-slate-500 sm:mb-2 sm:text-sm">{isOwnProfile ? 'Your wallet' : 'Address'}</p>
              <h2 className="mb-1 break-words font-display text-xl font-bold tracking-tight text-white sm:text-2xl md:text-3xl">
                {address ? displayHeadline || maskedWalletDisplay : 'Unknown address'}
              </h2>
              {profileAlias?.isNamed && address && maskedWalletDisplay && (
                  <div className="mx-auto mb-5 w-fit rounded-xl border border-intuition-primary/35 bg-black/50 px-3 py-1.5 font-mono text-xs font-black tracking-widest text-intuition-primary/90 antialiased backdrop-blur-sm md:mx-0">
                      {maskedWalletDisplay}
                  </div>
              )}
              {!profileAlias?.isNamed && <div className="mb-4"></div>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start sm:gap-3">
                  {/* {address && <BadgesSection address={address} compact />} */}
                  <span className="rounded-full border border-intuition-primary/40 bg-gradient-to-r from-intuition-primary/25 to-intuition-primary/10 px-3.5 py-2 font-sans text-xs font-semibold text-intuition-primary shadow-[0_0_24px_rgba(0,243,255,0.12)] [text-rendering:geometricPrecision]">
                    {activeHoldingsCount > 50 ? 'Level · Elite' : activeHoldingsCount > 10 ? 'Level · Pro' : 'Level · Explorer'}
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-2 font-sans text-xs font-medium text-slate-200 backdrop-blur-sm [text-rendering:geometricPrecision]">
                    {activeHoldingsCount >= 100 ? `${activeHoldingsCount}+` : activeHoldingsCount} open positions
                  </span>
                  <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3.5 py-2 font-sans text-xs font-medium text-slate-200 ring-1 ring-inset ring-white/5 [text-rendering:geometricPrecision]">
                      <Wallet size={12} className="text-intuition-primary" /> {ethBalance} {CURRENCY_SYMBOL}
                  </span>
                </div>
                {connectedAddress && address && (address.toLowerCase() !== connectedAddress.toLowerCase()) && (
                  <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 shrink-0">
                    {followEntry ? (
                      <>
                        <span className="flex items-center gap-1.5 rounded-full border border-intuition-success/40 bg-intuition-success/15 px-3 py-2 font-sans text-xs font-semibold text-intuition-success [text-rendering:geometricPrecision]">
                          <UserMinus size={12} /> Following
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            playClick();
                            removeFollow(connectedAddress, address);
                            setFollowEntry(null);
                            toast.success('Unfollowed');
                          }}
                          className="rounded-xl border-2 border-slate-500 px-3 py-2 font-sans text-xs font-semibold text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
                        >
                          Unfollow
                        </button>
                        <label
                          className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-600 px-3 py-2 transition-all duration-200 hover:border-amber-500/50 hover:text-amber-400/90"
                          title="Email when they buy or sell"
                        >
                          <input
                            type="checkbox"
                            checked={followEntry.emailAlerts && !!getEmailSubscription(connectedAddress)}
                            onChange={(e) => {
                              playClick();
                              const wantOn = e.target.checked;
                              const hasEmail = !!getEmailSubscription(connectedAddress);
                              if (wantOn && !hasEmail) {
                                openEmailNotify();
                                toast.info('Add your email to receive alerts when they buy or sell');
                                return; // don't persist emailAlerts until they have an email
                              }
                              setFollowEmailAlerts(connectedAddress, address, wantOn);
                              setFollowEntry((prev) => (prev ? { ...prev, emailAlerts: wantOn } : null));
                            }}
                            className="sr-only"
                          />
                          <span className={`flex items-center justify-center w-5 h-5 border-2 rounded-sm shrink-0 ${(followEntry.emailAlerts && getEmailSubscription(connectedAddress)) ? 'bg-amber-500 border-amber-400 text-black' : 'bg-black border-slate-500 text-transparent'}`}>
                            {(followEntry.emailAlerts && getEmailSubscription(connectedAddress)) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </span>
                          <Mail size={14} className={followEntry.emailAlerts ? 'text-amber-400' : 'text-slate-400'} />
                          <span className="text-xs font-semibold tracking-normal text-slate-200 antialiased" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                            Email alerts
                          </span>
                        </label>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          playClick();
                          const addr = toAddress(address || '');
                          const idToStore = addr || (await resolveENS(address || '').then((r) => toAddress(r) || r)) || address;
                          const label = displayHeadline || maskedWalletDisplay;
                          const hasEmail = !!getEmailSubscription(connectedAddress);
                          addFollow(connectedAddress, idToStore, { label, emailAlerts: hasEmail });
                          setFollowEntry(isFollowing(connectedAddress, idToStore) ?? null);
                          if (hasEmail) {
                            toast.success('Following — you’ll get alerts when they buy');
                          } else {
                            openEmailNotify();
                            toast.info('Add your email to get alerts when they buy or sell');
                          }
                        }}
                        className="flex items-center gap-2.5 rounded-2xl border-2 border-amber-400 bg-black/60 px-4 py-2.5 text-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.35)] backdrop-blur-sm transition-all duration-200 hover:border-amber-300 hover:text-amber-300 hover:shadow-[0_0_28px_rgba(251,191,36,0.45)]"
                        title="Get email when they buy or sell"
                      >
                        <UserPlus size={16} strokeWidth={2} className="shrink-0" />
                        <span className="text-sm font-semibold tracking-normal antialiased" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                          Follow · Email when they buy
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {address ? (
              <div className="relative z-10 flex w-full shrink-0 flex-col justify-start border-t border-white/[0.08] pt-5 md:mt-0 md:w-[min(100%,340px)] md:border-l md:border-t-0 md:pl-8 md:pt-1 lg:w-[min(100%,360px)] lg:pl-10">
                {profileShareUrl ? (
                  <div className="mb-2 flex w-full shrink-0 justify-center md:justify-end">
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/55 px-3 py-2 font-sans text-xs font-semibold text-slate-200 shadow-[0_0_20px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-colors hover:border-intuition-primary hover:text-intuition-primary"
                      onClick={() => {
                        playClick();
                        setShowProfileShareModal(true);
                      }}
                      onMouseEnter={playHover}
                    >
                      <Share2 size={14} strokeWidth={2} /> Share profile
                    </button>
                  </div>
                ) : null}
                <IntuRankXpBadge
                  arenaXp={arenaXpTotal}
                  activityXp={protocolXpTotal}
                  size="lg"
                  loading={!arenaGraphReady}
                  className="w-full shadow-[0_0_32px_rgba(0,243,255,0.08)] max-md:scale-[0.92] max-md:origin-top"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:mb-10 sm:gap-4 lg:grid-cols-3 lg:gap-5">
          {/* {address && (
            <BadgesSection address={address} />
          )} */}
          <div
            className={`${GLASS_SHEET} group motion-hover-lift min-w-0 p-4 sm:p-6 lg:p-8 hover:border-intuition-primary/35 hover:shadow-[0_24px_60px_rgba(0,0,0,0.5),0_0_40px_rgba(0,243,255,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]`}
          >
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  background:
                    'radial-gradient(ellipse 100% 80% at 100% 0%, rgba(0,243,255,0.1), transparent 55%)',
                }}
              />
              <div className="pointer-events-none absolute right-0 top-0 p-4 opacity-[0.07] transition-transform group-hover:scale-110">
                <Shield size={80} />
              </div>
              <div className="relative mb-1 flex min-w-0 items-start gap-2 sm:items-center sm:gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-intuition-primary/25 bg-intuition-primary/10 sm:h-8 sm:w-8">
                    <Activity size={14} className="text-intuition-primary" />
                  </span>
                  <div className="min-w-0">
                    <p className={labelSm}>Total in vaults</p>
                    <p className={`${labelMuted} mt-0.5 line-clamp-2`}>TRUST value of your open positions</p>
                  </div>
              </div>
              <div className={`relative mt-3 inline-flex items-baseline gap-2 ${statDisplay} tabular-nums`}>
                <CurrencySymbol size="2xl" leading />
                {portfolioValue}
              </div>
          </div>
          <div
            className={`${GLASS_SHEET} group motion-hover-lift min-w-0 p-4 sm:p-6 lg:p-8 hover:border-intuition-secondary/40 hover:shadow-[0_24px_60px_rgba(0,0,0,0.5),0_0_36px_rgba(255,0,85,0.1),inset_0_1px_0_rgba(255,255,255,0.08)]`}
          >
              <div
                className="pointer-events-none absolute inset-0 opacity-35"
                style={{
                  background:
                    'radial-gradient(ellipse 90% 70% at 0% 100%, rgba(255,0,85,0.08), transparent 50%)',
                }}
              />
              <div className="pointer-events-none absolute right-0 top-0 p-4 opacity-[0.07] transition-transform group-hover:scale-110">
                <Layers size={80} />
              </div>
              <div className="relative mb-1 flex min-w-0 items-start gap-2 sm:items-center sm:gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-intuition-secondary/30 bg-intuition-secondary/10 sm:h-8 sm:w-8">
                    <Database size={14} className="text-intuition-secondary" />
                  </span>
                  <div className="min-w-0">
                    <p className={labelSm}>On-chain transactions</p>
                    <p className={`${labelMuted} mt-0.5 line-clamp-2`}>Recorded on the Intuition index</p>
                  </div>
              </div>
              <div className={`relative mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 ${statDisplay}`}>
                  <span className="tabular-nums">{semanticFootprint >= 100 ? `${semanticFootprint}+` : semanticFootprint}</span>
                  <span className={labelMuted}>all-time</span>
              </div>
          </div>
          <div
            className={`${GLASS_SHEET} group motion-hover-lift col-span-2 min-w-0 p-4 sm:p-6 lg:col-span-1 lg:p-8 hover:border-intuition-primary/30 hover:shadow-[0_24px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]`}
          >
              <div className="relative mb-1 flex min-w-0 items-start gap-2 sm:items-center sm:gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-intuition-primary/25 bg-intuition-primary/10 sm:h-8 sm:w-8">
                    <PulseIcon size={14} className="animate-pulse text-intuition-primary" />
                  </span>
                  <div className="min-w-0">
                    <p className={labelSm}>Trust vs. distrust</p>
                    <p className={`${labelMuted} mt-0.5 line-clamp-2`}>From your recent activity</p>
                  </div>
              </div>
              {/*
                One full-width track: each segment is a % of the *whole* bar.
                (The old 50/50 split halves made each % only fill half the bar — wrong vs labels.)
              */}
              <div className="relative mt-5 flex h-2 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/10">
                <div
                  style={{ width: `${sentimentBias.trust}%` }}
                  className="h-full shrink-0 bg-intuition-success transition-all duration-1000"
                />
                <div
                  style={{ width: `${sentimentBias.distrust}%` }}
                  className="h-full shrink-0 bg-intuition-danger transition-all duration-1000"
                />
              </div>
              <div className="mt-4 flex items-end justify-between font-sans">
                  <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold text-intuition-success [text-rendering:geometricPrecision]">Trust</span>
                      <span className="text-sm font-semibold tabular-nums text-white [text-rendering:geometricPrecision]">{sentimentBias.trust.toFixed(0)}%</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[11px] font-semibold text-intuition-danger [text-rendering:geometricPrecision]">Distrust</span>
                      <span className="text-sm font-semibold tabular-nums text-white [text-rendering:geometricPrecision]">{sentimentBias.distrust.toFixed(0)}%</span>
                  </div>
              </div>
          </div>
      </div>

      {/* Account settings — only when viewing own profile */}
      {isOwnProfile && address && (
        <div className="mb-10 space-y-6">
          <div className="mb-4 flex items-center gap-2 font-sans text-sm font-semibold text-slate-200 [text-rendering:geometricPrecision]">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
              <Shield size={14} className="text-intuition-primary" />
            </span>
            Account settings
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-6">
            <div className={`${GLASS_SHEET} min-w-0 p-4 hover:border-white/15 sm:p-6`}>
              <div className="mb-2 flex min-w-0 items-center gap-2 sm:mb-3">
                <Wallet size={14} className="shrink-0 text-intuition-primary" />
                <span className="min-w-0 truncate font-sans text-[10px] font-semibold text-slate-300 sm:text-xs [text-rendering:geometricPrecision]">
                  Wallet · TNS / ENS / address
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  {profileAlias?.isNamed ? (
                    <>
                      <p className="break-all font-sans text-sm font-semibold text-white">{profileAlias.primaryLabel}</p>
                      <p className="break-all font-mono text-xs text-slate-500">{maskedWalletDisplay}</p>
                    </>
                  ) : (
                    <p className="break-all font-mono text-sm text-slate-300">{displayHeadline}</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    playClick();
                    navigator.clipboard.writeText(address);
                    toast.success('Address copied');
                  }}
                  onMouseEnter={playHover}
                  className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-white/10 px-3 py-2 font-mono text-[10px] font-black tracking-widest text-slate-400 transition-colors hover:border-intuition-primary hover:text-intuition-primary sm:w-auto sm:px-4"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
            </div>
            <div className={`${GLASS_SHEET} min-w-0 p-4 hover:border-white/15 sm:p-6`}>
              <div className="mb-2 flex items-center gap-2 sm:mb-3">
                <Mail size={14} className="shrink-0 text-intuition-primary" />
                <span className="min-w-0 truncate font-sans text-xs font-semibold text-slate-300 [text-rendering:geometricPrecision]">Email alerts</span>
              </div>
              {subscription?.email ? (
                <div className="space-y-3">
                  <p className="text-slate-300 font-mono text-sm">Linked: <span className="text-white">{subscription.email}</span></p>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="alertFrequency"
                        checked={(subscription.alertFrequency ?? 'per_tx') === 'per_tx'}
                        onChange={() => {
                          playClick();
                          setEmailAlertFrequency(address, 'per_tx');
                          setSubscription(prev => prev ? { ...prev, alertFrequency: 'per_tx' } : null);
                          toast.success('Alerts: after every buy/sell');
                        }}
                        className="sr-only"
                      />
                      <span className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center ${(subscription.alertFrequency ?? 'per_tx') === 'per_tx' ? 'border-intuition-primary bg-intuition-primary' : 'border-slate-600'}`} />
                      <span className="font-sans text-xs text-slate-300">Every trade</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="alertFrequency"
                        checked={subscription.alertFrequency === 'daily'}
                        onChange={() => {
                          playClick();
                          setEmailAlertFrequency(address, 'daily');
                          setSubscription(prev => prev ? { ...prev, alertFrequency: 'daily' } : null);
                          toast.success('Alerts: daily summary');
                        }}
                        className="sr-only"
                      />
                      <span className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center ${subscription.alertFrequency === 'daily' ? 'border-intuition-primary bg-intuition-primary' : 'border-slate-600'}`} />
                      <span className="font-sans text-xs text-slate-300">Daily summary</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { playClick(); openEmailNotify(); }} onMouseEnter={playHover} className="rounded-lg border border-intuition-primary/50 px-3 py-1.5 text-[10px] font-black uppercase text-intuition-primary transition-colors hover:bg-intuition-primary hover:text-black">Change</button>
                    <button onClick={() => { playClick(); removeEmailSubscription(address); setSubscription(null); toast.success('Email unlinked'); }} onMouseEnter={playHover} className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-[10px] font-black uppercase text-slate-400 transition-colors hover:border-intuition-danger hover:text-intuition-danger"><Trash2 size={10} /> Delete</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  <p className="text-[10px] text-slate-500 font-mono sm:text-xs">No email linked</p>
                    <button onClick={() => { playClick(); openEmailNotify(); }} onMouseEnter={playHover} className="flex w-full items-center justify-center gap-2 rounded-xl border border-intuition-primary bg-intuition-primary px-3 py-2 font-mono text-[9px] font-black uppercase text-black shadow-[0_0_24px_rgba(0,243,255,0.25)] transition-colors hover:bg-white sm:w-auto sm:px-4 sm:py-2.5 sm:text-[10px]"><Mail size={12} /> Add email</button>
                </div>
              )}
            </div>
          </div>
          <Link to="/portfolio" onClick={playClick} onMouseEnter={playHover} className={`${GLASS_SHEET} flex w-full items-center justify-between rounded-2xl px-5 py-4 font-sans text-sm font-semibold text-slate-300 transition-colors hover:border-intuition-primary/40 hover:text-intuition-primary`}>
            <span>View full portfolio</span>
            <ChevronRight size={16} />
          </Link>
        </div>
      )}
      
      {/*
        5-column row at lg: mix 40% · activity 60%. From sm: two columns so charts sit side-by-side on phones/tablets.
      */}
      <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5 lg:gap-6">
          <div className={`${GLASS_SHEET} group flex min-h-[300px] flex-col p-4 sm:min-h-[320px] sm:p-6 lg:col-span-2 lg:min-h-[360px] lg:p-8 motion-hover-lift`}>
              <div
                className="pointer-events-none absolute bottom-0 left-0 z-0 p-5 opacity-[0.04] transition-transform group-hover:scale-105"
                aria-hidden
              >
                <PieIcon className="text-slate-500" size={96} />
              </div>
              <h3 className="relative z-10 mb-4 flex items-center gap-3 font-sans text-sm font-semibold text-slate-100 [text-rendering:geometricPrecision]">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-intuition-primary/20 bg-intuition-primary/10">
                  <Zap size={16} className="text-intuition-primary" />
                </span>
                <span>
                  <span className="block">Portfolio mix</span>
                  <span className={`${labelMuted} mt-0.5 block font-normal`}>Share of TRUST by category</span>
                </span>
              </h3>
              {exposureData.length > 0 ? (
                  <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-row items-start gap-3 sm:gap-4 lg:gap-6">
                      <div className="aspect-square w-[min(38vw,132px)] shrink-0 sm:w-[min(40vw,150px)] md:w-[min(42vw,168px)] lg:w-[200px]">
                          <div className="h-full min-h-[110px] w-full min-w-0">
                              <ResponsiveContainer width="100%" height="100%">
                                  <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                                      <Pie
                                          data={exposurePieSlices.map(({ name, value }) => ({ name, value }))}
                                          dataKey="value"
                                          nameKey="name"
                                          cx="50%"
                                          cy="50%"
                                          innerRadius="48%"
                                          outerRadius="78%"
                                          paddingAngle={1}
                                          startAngle={90}
                                          endAngle={-270}
                                          stroke="#05070c"
                                          strokeWidth={2}
                                          isAnimationActive
                                      >
                                          {exposurePieSlices.map((row) => (
                                              <Cell
                                                  key={`cell-${row.name}-${row.colorIndex}`}
                                                  fill={COLORS[row.colorIndex % COLORS.length]}
                                              />
                                          ))}
                                      </Pie>
                                      <Tooltip
                                          formatter={(value: number) => [`${Number(value).toFixed(1)}%`, 'Share']}
                                          contentStyle={{
                                              backgroundColor: 'rgba(5,7,12,0.95)',
                                              border: '1px solid rgba(255,255,255,0.1)',
                                              fontSize: '11px',
                                              borderRadius: '12px',
                                          }}
                                      />
                                  </PieChart>
                              </ResponsiveContainer>
                          </div>
                      </div>
                      <ul className="font-sans min-h-0 min-w-0 flex-1 list-none space-y-2 [text-rendering:optimizeLegibility] sm:space-y-2.5 max-h-[min(52vh,300px)] overflow-y-auto pr-0.5 custom-scrollbar sm:max-h-[320px] lg:pr-1">
                          {exposureData.map((entry, index) => (
                              <li
                                  key={`${entry.name}-${index}`}
                                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-white/[0.06] pb-2.5 last:border-0 last:pb-0"
                              >
                                  <div className="flex min-w-0 items-start gap-2.5 sm:items-center sm:gap-3">
                                      <div
                                          className="mt-0.5 h-2.5 w-2.5 shrink-0 self-start rounded-sm shadow-sm ring-1 ring-white/20 sm:mt-0"
                                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                      />
                                      <span className="min-w-0 break-words text-left text-[11px] font-medium leading-snug text-slate-200 sm:text-xs">
                                          {entry.name}
                                      </span>
                                  </div>
                                  <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-white sm:text-sm">
                                      {entry.value.toFixed(0)}%
                                  </span>
                              </li>
                          ))}
                      </ul>
                  </div>
              ) : (
                  <div className="font-sans flex h-full min-h-[200px] flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center text-sm text-slate-500 [text-rendering:geometricPrecision]">No category breakdown yet — open a position to see a split.</div>
              )}
          </div>
          <div className={`${GLASS_SHEET} group relative flex h-[300px] min-h-[260px] flex-col overflow-hidden p-4 sm:h-[340px] sm:min-h-[300px] sm:p-6 lg:col-span-3 lg:h-[360px] lg:p-10 motion-hover-lift`}>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-intuition-primary/8 via-transparent to-[#ff1e6d]/5 opacity-60" />
              <h3 className="relative z-10 mb-4 flex items-center gap-3 font-sans text-sm font-semibold text-slate-100 [text-rendering:geometricPrecision]">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-intuition-primary/20 bg-intuition-primary/10">
                  <Activity size={16} className="animate-pulse text-intuition-primary" />
                </span>
                <span>
                  <span className="block">Activity over time</span>
                  <span className={`${labelMuted} mt-0.5 block font-normal`}>Cumulative TRUST from your on-chain events</span>
                </span>
              </h3>
              <div className="relative z-10 min-h-0 flex-1">
                {volumeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={volumeData}>
                            <defs>
                                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#00f3ff" stopOpacity={0.15}/>
                                    <stop offset="95%" stopColor="#00f3ff" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 6" stroke="#ffffff08" vertical={false} />
                            <XAxis dataKey="idx" hide />
                            <YAxis hide />
                            <Tooltip contentStyle={{ backgroundColor: 'rgba(5,7,12,0.95)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px', borderRadius: '12px' }} />
                            <Area type="stepAfter" dataKey="val" stroke="#00f3ff" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" isAnimationActive={true} animationDuration={1000} />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex h-full min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center font-sans text-sm text-slate-500 [text-rendering:geometricPrecision]">Not enough history to chart yet.</div>
                )}
              </div>
          </div>
      </div>

      <div className={`${GLASS_SHEET} overflow-hidden`}>
          <div className="flex flex-col items-start justify-between gap-4 border-b border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:p-6 md:p-8">
              <h3 className="flex items-center gap-3 font-sans text-sm font-semibold text-slate-100 [text-rendering:geometricPrecision] sm:text-base">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  <Fingerprint size={20} className="shrink-0 text-slate-400" />
                </span>
                Your positions
              </h3>
              <div className="max-w-xs text-right font-sans text-xs text-slate-500 [text-rendering:geometricPrecision]">Sourced from Intuition mainnet</div>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-[10px] sm:text-xs">
                  <thead className="border-b border-white/[0.06] bg-[#080a10]/90 font-sans">
                      <tr>
                          <th className="px-3 py-3 font-semibold text-slate-200 sm:px-6 md:px-10 md:py-4">Name</th>
                          <th className="px-3 py-3 font-semibold text-slate-200 sm:px-6 md:px-10 md:py-4">Type</th>
                          <th className="px-3 py-3 font-semibold text-slate-200 sm:px-6 md:px-10 md:py-4">Curve</th>
                          <th className="px-3 py-3 text-right font-semibold text-slate-200 sm:px-6 md:px-10 md:py-4">Shares</th>
                          <th className="px-3 py-3 text-right font-semibold text-slate-200 sm:px-6 md:px-10 md:py-4">Value (TRUST)</th>
                          <th className="px-3 py-3 text-right font-semibold text-slate-200 sm:px-6 md:px-10 md:py-4">Market</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                      {positions.length > 0 ? positionsPageSlice.map((p, i) => (
                          <tr key={`${p.id}-${p.curveId ?? 1}-${(positionsPage - 1) * POSITIONS_PER_PAGE + i}`} className="hover:bg-white/5 transition-all group relative">
                              <td className="px-3 sm:px-6 md:px-10 py-4 md:py-6">
                                  <Link to={`/markets/${p.id}`} className="flex items-center gap-3 sm:gap-6 group-hover:text-intuition-primary transition-colors">
                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-900/80 shadow-lg transition-all group-hover:border-intuition-primary sm:h-12 sm:w-12">
                                          {p.atom?.image ? <img src={p.atom.image} className="w-full h-full object-cover" /> : <User size={20} className="text-slate-700" />}
                                      </div>
                                      <div>
                                          <div className={`font-black text-sm group-hover:text-intuition-primary transition-colors uppercase leading-none mb-1.5 tracking-tight ${p.atom?.type === 'CLAIM' ? 'text-intuition-danger' : 'text-white'}`}>{p.atom?.label || p.id.slice(0,8)}</div>
                                          <div className="text-[10px] font-mono text-slate-500">ID {p.id.slice(0, 10)}…</div>
                                      </div>
                                  </Link>
                              </td>
                              <td className="px-3 sm:px-6 md:px-10 py-4 md:py-6">
                                  <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 font-sans text-[9px] font-medium text-slate-300 transition-colors group-hover:text-white sm:px-3 sm:py-1">
                                    {p.atom?.type === 'CLAIM' ? 'Claim' : p.atom?.type === 'ATOM' ? 'Atom' : p.atom?.type || '—'}
                                  </span>
                              </td>
                              <td className="px-3 sm:px-6 md:px-10 py-4 md:py-6 whitespace-nowrap">
                                  <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase">{getCurveLabel(p.curveId ?? 1)}</span>
                              </td>
                              <td className="px-3 sm:px-6 md:px-10 py-4 md:py-6 text-right font-black text-xs sm:text-sm text-white">{formatDisplayedShares(p.shares)}</td>
                              <td className="px-3 sm:px-6 md:px-10 py-4 md:py-6 text-right">
                                  <div className="inline-flex items-baseline gap-1.5 justify-end font-black text-xs sm:text-sm text-intuition-success tracking-tight">
                                      <CurrencySymbol size="sm" leading className="text-intuition-primary/90" />
                                      {formatMarketValue(p.value)}
                                  </div>
                              </td>
                              <td className="px-3 sm:px-6 md:px-10 py-4 md:py-6 text-right">
                                  <Link to={`/markets/${p.id}`} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-sans text-xs font-semibold text-slate-200 transition-all hover:border-intuition-primary sm:px-6">Open</Link>
                              </td>
                          </tr>
                      )) : (
                          <tr><td colSpan={6} className="p-20 text-center font-sans text-sm text-slate-500 [text-rendering:geometricPrecision]">
                              {isInvalidAddressParam ? (
                                <p className="text-slate-300">This profile link is not a valid address. Use search above or a full checksummed <span className="font-mono text-slate-400">0x…</span> path.</p>
                              ) : loading ? (
                                  <div className="flex flex-col items-center gap-4">
                                      <PageLoadingSpinner size="sm" />
                                      <span className="text-slate-400">Loading positions…</span>
                                  </div>
                              ) : (
                                  <div className="mx-auto max-w-md space-y-2">
                                    <p className="text-slate-300">No open vault positions for this address.</p>
                                    {history.length > 0 && (
                                      <p className="text-xs leading-relaxed text-slate-500">
                                        Past buys, sells, and creates can still appear above — if you closed or redeemed
                                        everything, total in vaults can read as zero while activity stays visible.
                                      </p>
                                    )}
                                  </div>
                              )}
                          </td></tr>
                      )}
                  </tbody>
              </table>
          </div>
          {positions.length > POSITIONS_PER_PAGE && (
            <div className="flex flex-col items-stretch justify-between gap-3 border-t border-white/[0.08] bg-white/[0.02] px-4 py-3 font-sans sm:flex-row sm:items-center sm:px-6">
              <p className="text-center text-xs text-slate-500 sm:text-left">
                Showing{' '}
                <span className="tabular-nums text-slate-300">
                  {(positionsPage - 1) * POSITIONS_PER_PAGE + 1}–{Math.min(positionsPage * POSITIONS_PER_PAGE, positions.length)}
                </span>
                <span> of {positions.length}</span>
              </p>
              <div className="flex items-center justify-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setPositionsPage((p) => Math.max(1, p - 1));
                  }}
                  onMouseEnter={playHover}
                  disabled={positionsPage <= 1}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-intuition-primary/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="min-w-[5rem] text-center text-xs text-slate-500 tabular-nums">
                  {positionsPage} / {totalPositionPages}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setPositionsPage((p) => Math.min(totalPositionPages, p + 1));
                  }}
                  onMouseEnter={playHover}
                  disabled={positionsPage >= totalPositionPages}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-intuition-primary/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
      </div>

      {typeof document !== 'undefined' &&
        showProfileShareModal &&
        address &&
        profileShareUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/98 p-4 py-10 backdrop-blur-3xl animate-in zoom-in duration-300"
            role="dialog"
            aria-modal="true"
            aria-label="Share profile card"
            onClick={() => setShowProfileShareModal(false)}
          >
            <div className="relative w-full max-w-3xl shrink-0 py-4" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setShowProfileShareModal(false);
                }}
                className="absolute -top-1 right-0 z-10 text-slate-500 hover:text-white transition-colors p-2 group sm:-top-2"
                aria-label="Close share modal"
              >
                <X size={28} strokeWidth={2} className="sm:w-8 sm:h-8 group-hover:rotate-90 transition-transform" />
              </button>
              <ProfileShareCard
                displayHeadline={displayHeadline || maskedWalletDisplay}
                maskedAddress={maskedWalletDisplay}
                profileUrlAbsolute={profileShareUrl}
                avatarSrc={DEFAULT_PROFILE_AVATAR_URL}
                vaultTotal={portfolioValue}
                transactionCount={semanticFootprint}
                trustPct={sentimentBias.trust}
                portfolioMix={sharePortfolioMix}
                protocolXpTotal={protocolXpTotal}
                arenaXpTotal={arenaXpTotal}
                traderStatusLabel={traderStatusLabel}
              />
              <p className="text-center mt-6 text-slate-600 text-[8px] font-black font-mono uppercase tracking-[0.8em] animate-pulse">
                Click outside to close
              </p>
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
};

export default PublicProfile;
