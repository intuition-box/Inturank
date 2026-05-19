import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Search, RefreshCw, ChevronDown, ListFilter, Terminal, Wifi, ShieldCheck, Zap, Brain, TrendingDown, TrendingUp, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { getIntuRankNetworkActivity, getActivityOnMyMarkets, getActivityBySenderIds, getUserPositions, getUserIntuRankRoutedHistory, getCurveLabel, type PositionActivityNotification } from '../services/graphql';
import ActivityRow from '../components/ActivityRow';
import { playClick, playHover } from '../services/audio';
import { formatEther } from 'viem';
import { getFollowedIdentities } from '../services/follows';
import { toAddress, isGraphResolvableAddress } from '../services/web3';
import { resolveFollowIdentityToAddress } from '../services/tns';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { formatMarketValue, formatDisplayedShares } from '../services/analytics';
import {
  EXPLORER_URL,
  FEE_PROXY_ADDRESS,
  MULTI_VAULT_ADDRESS,
  getGeminiApiKey,
  getGroqApiKey,
  getOpenAiApiKey,
  PAGE_HERO_EYEBROW,
  PAGE_HERO_TITLE,
  PAGE_HERO_BODY,
} from '../constants';
import { generateSimpleLlmCompletion } from '../services/skillLlm';
import { Transaction } from '../types';
import { getLocalTransactions } from '../services/web3';
import { subscribeVisibilityAwareInterval } from '../services/visibility';
import { PageLoading, PageLoadingSpinner } from '../components/PageLoading';

type SortOption = 'Newest' | 'Oldest' | 'Highest Volume';

type PersonalItem = PositionActivityNotification & { source?: 'holdings' | 'follow' };

function isProfileLinkableSender(senderId: string | undefined, senderLabel: string): boolean {
  if (!senderId || typeof senderId !== 'string') return false;
  const id = senderId.toLowerCase();
  if (id === FEE_PROXY_ADDRESS.toLowerCase() || id === MULTI_VAULT_ADDRESS.toLowerCase()) return false;
  if (senderLabel === 'IntuRank routing contract') return false;
  return true;
}

/** Buyer / actor label in personal columns → profile when the id is a real account (not proxy routers). */
const PersonalActorLink: React.FC<{
  senderId: string;
  senderLabel: string;
}> = ({ senderId, senderLabel }) => {
  const linkable = isProfileLinkableSender(senderId, senderLabel);
  const className = `font-black text-intuition-primary rounded-sm transition-[color,transform,filter] duration-300 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none hover:text-white focus-visible:outline focus-visible:ring-2 focus-visible:ring-intuition-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070c] ${
    linkable
      ? 'underline-offset-2 hover:underline hover:drop-shadow-[0_0_14px_rgba(0,243,255,0.4)] active:scale-[0.99]'
      : 'cursor-default opacity-90'
  }`;
  if (!linkable) {
    return <span className={className}>{senderLabel}</span>;
  }
  return (
    <Link
      to={`/profile/${encodeURIComponent(senderId)}`}
      onClick={playClick}
      onMouseEnter={playHover}
      className={className}
      aria-label={`View profile: ${senderLabel}`}
    >
      {senderLabel}
    </Link>
  );
};

const Feed: React.FC = () => {
    const { address: walletAddress } = useAccount();
    const [events, setEvents] = useState<any[]>([]);
    const [personalItems, setPersonalItems] = useState<PersonalItem[]>([]);
    const [personalLoading, setPersonalLoading] = useState(false);
    const [ownHistory, setOwnHistory] = useState<Transaction[]>([]);
    const [ownLoading, setOwnLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedTerm, setDebouncedTerm] = useState('');
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [activeSort, setActiveSort] = useState<SortOption>('Newest');
    const [aresPulse, setAresPulse] = useState<string>('Loading a quick summary of recent activity…');
    const [isAresLoading, setIsAresLoading] = useState(false);
    
    const PAGE_SIZE = 40;
    const observerTarget = useRef<HTMLDivElement>(null);

    const generateAresPulse = async (currentEvents: any[]) => {
        if (isAresLoading) return;
        setIsAresLoading(true);
        try {
            if (!getGroqApiKey() && !getGeminiApiKey() && !getOpenAiApiKey()) {
                setAresPulse('Add an API key in your environment to see an AI summary here. The activity list below is always live.');
                setIsAresLoading(false);
                return;
            }
            const summary = currentEvents.length > 0
                ? currentEvents.slice(0, 15).map(e =>
                    `${e.sender?.label || 'Node'} ${e.type} ${e.assets ? formatEther(BigInt(e.assets)) : ''} on ${e.target?.label}`
                ).join('; ')
                : 'No recent activity detected.';

            const prompt = `
                Here are recent IntuRank-routed graph activities (deposits/redemptions via the app's fee routing): [${summary}]
                Write ONE short sentence in plain English describing the overall trend or what stands out (e.g. volume, buys vs sells, notable names).
                Rules: sentence case, max 22 words, no ALL CAPS, no sci-fi jargon, no emojis, no quotes around the sentence.
            `;

            const { text } = await generateSimpleLlmCompletion(prompt);
            setAresPulse(text.trim() || 'Recent IntuRank-routed activity looks steady.');
        } catch (e) {
            setAresPulse('Couldn’t generate a summary right now. The feed below is up to date.');
        } finally {
            setIsAresLoading(false);
        }
    };

    const handleForceRecon = async () => {
        playClick();
        await fetchActivity(true, true);
    };

    const fetchActivity = useCallback(async (isInitial = false, reset = false) => {
        if (!reset && (isSyncing || loadingMore)) return;
        
        if (reset) {
            setLoading(true);
            setOffset(0);
            setHasMore(true);
        } else if (!isInitial) {
            setIsSyncing(true);
        }

        try {
            const currentOffset = reset ? 0 : offset;
            const data = await getIntuRankNetworkActivity(PAGE_SIZE, currentOffset);
            
            setEvents(prev => {
                const combined = reset ? data.items : [...prev, ...data.items];
                const uniqueMap = new Map();
                combined.forEach(item => uniqueMap.set(item.id, item));
                const final = Array.from(uniqueMap.values());
                if (reset) generateAresPulse(final);
                return final;
            });

            if (data.items.length < PAGE_SIZE) setHasMore(false);
        } catch (e) {
            console.warn('[Feed] activity fetch failed:', e);
        } finally {
            setLoading(false);
            setIsSyncing(false);
            setLoadingMore(false);
        }
    }, [offset, isSyncing, loadingMore]);

    useEffect(() => {
        fetchActivity(true, true);
        return subscribeVisibilityAwareInterval(() => fetchActivity(false, false), 30000);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedTerm(searchTerm), 400);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const fetchMore = async () => {
        if (loadingMore || !hasMore || loading) return;
        setLoadingMore(true);
        const nextOffset = offset + PAGE_SIZE;
        try {
            const data = await getIntuRankNetworkActivity(PAGE_SIZE, nextOffset);
            setEvents(prev => {
                const combined = [...prev, ...data.items];
                const uniqueMap = new Map();
                combined.forEach(item => uniqueMap.set(item.id, item));
                return Array.from(uniqueMap.values());
            });
            if (data.items.length < PAGE_SIZE) setHasMore(false);
            setOffset(nextOffset);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && debouncedTerm === '') {
                    fetchMore();
                }
            },
            { threshold: 0.1 }
        );
        if (observerTarget.current) observer.observe(observerTarget.current);
        return () => observer.disconnect();
    }, [hasMore, loading, loadingMore, debouncedTerm]);

    const filteredEvents = events.filter(ev => {
        if (!debouncedTerm) return true;
        const term = debouncedTerm.toLowerCase();
        return (ev.sender?.label || '').toLowerCase().includes(term) ||
               (ev.sender?.id || '').toLowerCase().includes(term) ||
               (ev.target?.label || '').toLowerCase().includes(term) ||
               (ev.target?.id || '').toLowerCase().includes(term);
    });

    const holdingsItems = personalItems.filter((n) => n.source !== 'follow');
    const followItems = personalItems.filter((n) => n.source === 'follow');
    const followsCount = walletAddress ? getFollowedIdentities(walletAddress).length : 0;

    // Personalized notifications: activity on holdings + followed accounts
    const fetchPersonal = useCallback(async () => {
            if (!walletAddress) {
                setPersonalItems([]);
                return;
            }
            // Show local tx immediately so Your Actions never disappears during refresh
            const local = getLocalTransactions(walletAddress) || [];
            if (local.length > 0) {
                const sorted = [...local].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                setOwnHistory(sorted.slice(0, 60));
            }
            setPersonalLoading(true);
            setOwnLoading(true);
            try {
                const [positions, graphIntuRankHistory] = await Promise.all([
                    getUserPositions(walletAddress),
                    getUserIntuRankRoutedHistory(walletAddress).catch(() => []),
                ]);
                const vaultIds = (positions || []).map((p: any) => p.vault?.term_id).filter(Boolean);
                const follows = getFollowedIdentities(walletAddress);

                // Run holdings and follow activity in parallel for faster refresh
                const [holdings, followActivity] = await Promise.all([
                    getActivityOnMyMarkets(walletAddress, vaultIds, 40, { onlyIntuRankRouted: true }),
                    (async () => {
                        if (follows.length === 0) return [];
                        const senderIds = await Promise.all(
                            follows.map(async (f) => {
                                const addr = toAddress(f.identityId);
                                if (addr) return addr;
                                const resolved = await resolveFollowIdentityToAddress(f.identityId);
                                if (!resolved) return null;
                                return toAddress(resolved) || (isGraphResolvableAddress(resolved) ? resolved : null);
                            })
                        );
                        const validIds = senderIds.filter((id): id is string => isGraphResolvableAddress(id));
                        return validIds.length > 0 ? getActivityBySenderIds(validIds, 30, { onlyIntuRankRouted: true }) : [];
                    })(),
                ]);

                const seen = new Set<string>();
                const merged: PersonalItem[] = [];
                for (const n of followActivity) {
                    if (!seen.has(n.id)) {
                        seen.add(n.id);
                        merged.push({ ...n, source: 'follow' });
                    }
                }
                for (const n of holdings) {
                    if (!seen.has(n.id)) {
                        seen.add(n.id);
                        merged.push({ ...n, source: 'holdings' });
                    }
                }
                merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                setPersonalItems(merged);

                const combinedHistory: Transaction[] = [...local, ...(graphIntuRankHistory || [])];
                const historyMap = new Map<string, Transaction>();
                combinedHistory.forEach((tx) => {
                    if (!tx?.id) return;
                    if (!historyMap.has(tx.id)) historyMap.set(tx.id, tx);
                });
                const mergedHistory = Array.from(historyMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                setOwnHistory(mergedHistory.slice(0, 60));
            } catch (e) {
                console.warn('[Feed] fetchPersonal error:', e);
            } finally {
                setPersonalLoading(false);
                setOwnLoading(false);
            }
        }, [walletAddress]);

    useEffect(() => {
        fetchPersonal();
        return subscribeVisibilityAwareInterval(fetchPersonal, 60_000);
    }, [fetchPersonal]);

    return (
        <div className="w-full max-w-[1600px] mx-auto px-6 py-12 pb-40 font-mono relative z-10">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12 border-b border-white/10 pb-10">
                <div className="relative min-w-0 max-w-3xl space-y-3">
                    <div className="flex items-start gap-4">
                        <div className="w-14 h-14 shrink-0 rounded-3xl bg-black/80 border border-intuition-primary/35 flex items-center justify-center shadow-[0_0_28px_rgba(0,243,255,0.12)] backdrop-blur-sm">
                            <Activity size={28} className="text-intuition-primary" />
                        </div>
                        <div className="min-w-0 space-y-2">
                            <p className={PAGE_HERO_EYEBROW}>Activity</p>
                            <h1 className={PAGE_HERO_TITLE}>Live feed</h1>
                            <p className={`${PAGE_HERO_BODY} max-w-2xl font-sans`}>
                                Deposits and exits that flowed through IntuRank’s routing contracts—plus{' '}
                                <span className="text-slate-200 font-semibold">your holdings, follows, and wallet moves</span> when they match the same routed pattern. Raw protocol traffic that never touched IntuRank’s router won’t appear here by design.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end shrink-0">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200 font-sans backdrop-blur-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-intuition-success animate-pulse" aria-hidden />
                        Live
                    </span>
                </div>
            </div>

            {/* Summary strip — plain-English AI blurb + refresh */}
            <div className="mb-10 rounded-[1.75rem] border border-intuition-primary/20 bg-[#05070c]/90 p-1 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl ring-1 ring-white/[0.04]">
                <div className="rounded-[1.6rem] bg-[#030508]/95 p-4 sm:p-6 flex flex-col md:flex-row items-stretch md:items-center gap-4 sm:gap-6 md:gap-8 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] pointer-events-none rounded-[1.6rem]" />
                    <div className="flex items-center gap-4 shrink-0 relative z-[1]">
                        <div className="w-12 h-12 rounded-2xl bg-intuition-primary/10 border border-intuition-primary/25 flex items-center justify-center text-intuition-primary">
                            <Brain size={22} className="opacity-90" />
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-intuition-primary font-sans">At a glance</div>
                            <div className="text-[11px] text-slate-400 font-sans mt-0.5">Short summary of recent activity</div>
                        </div>
                    </div>
                    <div className="flex-1 md:border-l md:border-white/[0.08] md:pl-6 py-1 min-w-0 relative z-[1]">
                        <p className={`text-sm font-sans text-slate-100 leading-relaxed transition-all duration-500 ${isAresLoading ? 'opacity-40' : 'opacity-100'}`}>
                            {aresPulse}
                            <span className="inline-block w-0.5 h-4 bg-intuition-primary ml-1.5 align-middle animate-pulse rounded-sm" aria-hidden />
                        </p>
                    </div>
                    <button 
                        type="button"
                        onClick={handleForceRecon}
                        disabled={loading}
                        onMouseEnter={playHover}
                        className="shrink-0 px-6 py-3 rounded-2xl bg-white/[0.06] border border-white/10 hover:border-intuition-primary/50 hover:bg-intuition-primary/10 text-slate-100 font-sans text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed relative z-[1]"
                    >
                        {loading ? 'Refreshing…' : 'Refresh feed'}
                    </button>
                </div>
            </div>

            {/* Personalized Notifications */}
            <div className="mb-14 grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-1 space-y-5">
                    {/* Header card */}
                    <div className="rounded-3xl border border-white/[0.08] bg-[#05070c]/90 shadow-xl overflow-hidden backdrop-blur-md ring-1 ring-black/40">
                        <div className="px-5 py-4 border-b border-white/[0.06] bg-white/[0.03] flex items-center justify-between gap-4">
                            <div>
                                <div className="text-xs font-semibold text-slate-300 font-sans mb-1 flex items-center gap-2">
                                    <Zap size={14} className="text-intuition-secondary shrink-0" /> For your wallet
                                </div>
                                <p className="text-[12px] text-slate-500 font-sans leading-snug">
                                    IntuRank-routed fills on vaults you hold, follows you watch, plus your own routed txs. Alerts email still considers full graph activity elsewhere.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Card 1: Holdings activity */}
                    <div className="rounded-3xl border border-white/[0.08] bg-[#05070c]/90 shadow-xl overflow-hidden backdrop-blur-md ring-1 ring-black/40">
                        <div className="px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.03] flex items-center justify-between gap-4">
                            <span className="text-xs font-semibold text-slate-200 font-sans">
                                On your claims
                            </span>
                        </div>
                        <div className="max-h-[260px] overflow-y-auto custom-scrollbar px-3 py-3 space-y-2">
                            {!walletAddress && (
                                <div className="px-4 py-6 text-sm font-sans text-slate-400 text-center leading-relaxed">
                                    Connect a wallet to see activity on markets you hold.
                                </div>
                            )}
                            {walletAddress && personalLoading && holdingsItems.length === 0 && (
                                <div className="flex items-center justify-center py-6 text-slate-400 text-sm font-sans">
                                    <RefreshCw size={16} className="animate-spin mr-2 shrink-0" /> Loading…
                                </div>
                            )}
                            {walletAddress && !personalLoading && holdingsItems.length === 0 && (
                                <div className="px-4 py-4 text-sm font-sans text-slate-500 text-center">
                                    No IntuRank-routed activity on your claims yet.
                                </div>
                            )}
                            {walletAddress && holdingsItems.slice(0, 15).map((n) => {
                                const sharesNum = n.shares ? parseFloat(formatEther(BigInt(n.shares))) : 0;
                                const assetsNum = n.assets ? parseFloat(formatEther(BigInt(n.assets))) : 0;
                                return (
                                    <div
                                        key={n.id}
                                        className="group/pitem relative flex items-start gap-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#04060a]/50 px-3 py-2.5 shadow-sm transition-all duration-500 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-r before:from-intuition-primary/[0.08] before:via-transparent before:to-transparent before:opacity-0 before:transition-opacity before:duration-500 hover:border-intuition-primary/45 hover:bg-white/[0.05] hover:shadow-[0_0_28px_rgba(0,243,255,0.1)] motion-safe:md:hover:before:opacity-100"
                                    >
                                        <span className={`relative z-[1] flex-shrink-0 mt-0.5 ${n.type === 'liquidated' ? 'text-intuition-danger' : 'text-intuition-success'}`}>
                                            {n.type === 'liquidated' ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                                        </span>
                                        <div className="relative z-[1] min-w-0 flex-1">
                                            <p className="text-[11px] font-bold font-mono text-white leading-tight">
                                                <PersonalActorLink senderId={n.senderId} senderLabel={n.senderLabel} />
                                                {' '}
                                                <span className="text-slate-200">{n.type === 'liquidated' ? 'liquidated' : 'acquired'}</span>
                                                {sharesNum > 0 ? (
                                                    <span className="text-slate-300 font-semibold">
                                                        {' '}{formatDisplayedShares(n.shares!)} shares
                                                        {assetsNum > 0 && (
                                                            <span className="text-slate-400 font-bold">
                                                                {' '}(<CurrencySymbol size="sm" leading className="text-slate-400" />{formatMarketValue(assetsNum)})
                                                            </span>
                                                        )}
                                                        {' '}in{' '}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300"> shares in </span>
                                                )}
                                                <Link
                                                    to={`/markets/${n.vaultId}`}
                                                    onClick={playClick}
                                                    onMouseEnter={playHover}
                                                    className="font-bold text-slate-100 group-hover/pitem:text-intuition-primary transition-colors truncate inline-block max-w-full align-baseline underline-offset-2 group-hover/pitem:underline"
                                                >
                                                    {n.marketLabel}
                                                </Link>
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[9px] font-mono text-slate-500">
                                                <span>{new Date(n.timestamp).toLocaleString()}</span>
                                                <span className="border border-slate-700 px-2 py-0.5 rounded-xl" title="Bonding curve type">
                                                    {getCurveLabel(n.curveId)}
                                                </span>
                                                {n.txHash && (
                                                    <a
                                                        href={`${EXPLORER_URL}/tx/${n.txHash}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onMouseEnter={playHover}
                                                        className="text-slate-500 hover:text-intuition-primary inline-flex items-center gap-1"
                                                    >
                                                        <Terminal size={10} /> TX
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Card 2: People you follow */}
                    <div className="rounded-3xl border border-white/[0.08] bg-[#05070c]/90 shadow-xl overflow-hidden backdrop-blur-md ring-1 ring-black/40">
                        <div className="px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.03] flex items-center justify-between gap-4">
                            <span className="text-xs font-semibold text-amber-200/95 font-sans flex items-center gap-2">
                                <UserPlus size={14} className="shrink-0 opacity-90" /> People you follow
                            </span>
                            {walletAddress && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-sans text-slate-500 tabular-nums" title="Accounts you follow">
                                        {followsCount} following
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { playClick(); fetchPersonal(); }}
                                        onMouseEnter={playHover}
                                        disabled={personalLoading}
                                        className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-amber-300 hover:border-amber-400/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        title="Refresh follow activity"
                                        aria-label="Refresh"
                                    >
                                        <RefreshCw size={12} className={personalLoading ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="max-h-[260px] overflow-y-auto custom-scrollbar px-3 py-3 space-y-2">
                            {!walletAddress && (
                                <div className="px-4 py-6 text-sm font-sans text-slate-400 text-center leading-relaxed">
                                    Connect a wallet, then follow people from their profiles to see their trades here.
                                </div>
                            )}
                            {walletAddress && personalLoading && followItems.length === 0 && (
                                <div className="flex items-center justify-center py-6 text-slate-400 text-sm font-sans">
                                    <RefreshCw size={16} className="animate-spin mr-2 shrink-0" /> Loading…
                                </div>
                            )}
                            {walletAddress && !personalLoading && followItems.length === 0 && (
                                <div className="px-4 py-4 text-sm font-sans text-slate-500 text-center space-y-2 leading-relaxed">
                                    {followsCount === 0 ? (
                                        <>
                                            <p>Follow someone from their profile to see their activity here.</p>
                                            <Link to="/markets" onClick={playClick} className="inline-flex items-center gap-1.5 text-intuition-primary hover:text-intuition-secondary transition-colors mt-1 font-medium">
                                                Browse markets <Activity size={14} />
                                            </Link>
                                        </>
                                    ) : (
                                        <p>No recent trades from people you follow.</p>
                                    )}
                                </div>
                            )}
                            {walletAddress && followItems.slice(0, 15).map((n) => {
                                const sharesNum = n.shares ? parseFloat(formatEther(BigInt(n.shares))) : 0;
                                const assetsNum = n.assets ? parseFloat(formatEther(BigInt(n.assets))) : 0;
                                return (
                                    <div
                                        key={n.id}
                                        className="group/pitem relative flex items-start gap-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#04060a]/50 px-3 py-2.5 shadow-sm transition-all duration-500 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-r before:from-amber-500/[0.08] before:via-transparent before:to-intuition-primary/[0.05] before:opacity-0 before:transition-opacity before:duration-500 hover:border-amber-400/55 hover:bg-amber-500/[0.07] hover:shadow-[0_0_28px_rgba(251,191,36,0.12)] motion-safe:md:hover:before:opacity-100"
                                    >
                                        <span className={`relative z-[1] flex-shrink-0 mt-0.5 ${n.type === 'liquidated' ? 'text-intuition-danger' : 'text-intuition-success'}`}>
                                            {n.type === 'liquidated' ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                                        </span>
                                        <div className="relative z-[1] min-w-0 flex-1">
                                            <p className="text-[11px] font-bold font-mono text-white leading-tight">
                                                <span className="inline-flex items-center gap-1 mr-1 text-amber-200/95 text-[10px] font-sans font-medium border border-amber-500/40 px-2 py-0.5 rounded-full" title="Someone you follow">
                                                    <UserPlus size={10} /> Following
                                                </span>
                                                <PersonalActorLink senderId={n.senderId} senderLabel={n.senderLabel} />
                                                {' '}
                                                <span className="text-slate-200">{n.type === 'liquidated' ? 'liquidated' : 'acquired'}</span>
                                                {sharesNum > 0 ? (
                                                    <span className="text-slate-300 font-semibold">
                                                        {' '}{formatDisplayedShares(n.shares!)} shares
                                                        {assetsNum > 0 && (
                                                            <span className="text-slate-400 font-bold">
                                                                {' '}(<CurrencySymbol size="sm" leading className="text-slate-400" />{formatMarketValue(assetsNum)})
                                                            </span>
                                                        )}
                                                        {' '}in{' '}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300"> shares in </span>
                                                )}
                                                <Link
                                                    to={`/markets/${n.vaultId}`}
                                                    onClick={playClick}
                                                    onMouseEnter={playHover}
                                                    className="font-bold text-slate-100 group-hover/pitem:text-intuition-primary transition-colors truncate inline-block max-w-full align-baseline underline-offset-2 group-hover/pitem:underline"
                                                >
                                                    {n.marketLabel}
                                                </Link>
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[9px] font-mono text-slate-500">
                                                <span>{new Date(n.timestamp).toLocaleString()}</span>
                                                <span className="border border-slate-700 px-2 py-0.5 rounded-xl" title="Bonding curve type">
                                                    {getCurveLabel(n.curveId)}
                                                </span>
                                                {n.txHash && (
                                                    <a
                                                        href={`${EXPLORER_URL}/tx/${n.txHash}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onMouseEnter={playHover}
                                                        className="text-slate-500 hover:text-intuition-primary inline-flex items-center gap-1"
                                                    >
                                                        <Terminal size={10} /> TX
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Card 3: Your actions */}
                    <div className="rounded-3xl border border-white/[0.08] bg-[#05070c]/90 shadow-xl overflow-hidden backdrop-blur-md ring-1 ring-black/40">
                        <div className="px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.03] flex items-center justify-between gap-4">
                            <span className="text-xs font-semibold text-slate-200 font-sans flex items-center gap-2">
                                <ShieldCheck size={14} className="text-intuition-success shrink-0" /> Your trades
                            </span>
                        </div>
                        <div className="max-h-[260px] overflow-y-auto custom-scrollbar px-3 py-3 space-y-2">
                            {!walletAddress && (
                                <div className="px-4 py-6 text-sm font-sans text-slate-400 text-center leading-relaxed">
                                    Connect a wallet to see your buys, sells, and new claims.
                                </div>
                            )}
                            {walletAddress && ownLoading && ownHistory.length === 0 && (
                                <div className="flex items-center justify-center py-6 text-slate-400 text-sm font-sans">
                                    <RefreshCw size={16} className="animate-spin mr-2 shrink-0" /> Loading your history…
                                </div>
                            )}
                            {walletAddress && !ownLoading && ownHistory.length === 0 && (
                                <div className="px-4 py-4 text-sm font-sans text-slate-500 text-center">
                                    No recent trades or claims yet.
                                </div>
                            )}
                            {walletAddress && ownHistory.slice(0, 20).map((tx) => {
                                const assetsNum = tx.assets ? parseFloat(formatEther(BigInt(tx.assets))) : 0;
                                const isRedeem = tx.type === 'REDEEM';
                                return (
                                    <div
                                        key={tx.id}
                                        className="group/pitem relative flex items-start gap-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#04060a]/50 px-3 py-2.5 shadow-sm transition-all duration-500 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-r before:from-intuition-success/[0.06] before:via-transparent before:to-intuition-primary/[0.05] before:opacity-0 before:transition-opacity before:duration-500 hover:border-intuition-primary/45 hover:bg-white/[0.05] hover:shadow-[0_0_28px_rgba(0,243,255,0.1)] motion-safe:md:hover:before:opacity-100"
                                    >
                                        <span className={`relative z-[1] flex-shrink-0 mt-0.5 ${isRedeem ? 'text-intuition-danger' : 'text-intuition-success'}`}>
                                            {isRedeem ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                                        </span>
                                        <div className="relative z-[1] min-w-0 flex-1">
                                            <p className="text-[11px] font-bold font-mono text-white leading-tight">
                                                {walletAddress ? (
                                                  <Link
                                                    to={`/profile/${encodeURIComponent(walletAddress)}`}
                                                    onClick={playClick}
                                                    onMouseEnter={playHover}
                                                    className="font-black text-intuition-primary underline-offset-2 transition-[color,transform] duration-300 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] hover:text-white hover:underline hover:drop-shadow-[0_0_14px_rgba(0,243,255,0.4)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-intuition-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070c] active:scale-[0.99]"
                                                    aria-label="View your public profile"
                                                  >
                                                    You
                                                  </Link>
                                                ) : (
                                                  <span className="font-black text-intuition-primary">You</span>
                                                )}
                                                {' '}
                                                <span className="text-slate-200">{isRedeem ? 'liquidated' : 'acquired'}</span>
                                                {' '}
                                                <span className="text-slate-300 font-semibold">
                                                    {formatDisplayedShares(tx.shares)} shares
                                                    {assetsNum > 0 && (
                                                        <span className="text-slate-400 font-bold">
                                                            {' '}(<CurrencySymbol size="sm" leading className="text-slate-400" />{formatMarketValue(assetsNum)})
                                                        </span>
                                                    )}
                                                    {' '}in{' '}
                                                </span>
                                                <Link
                                                    to={`/markets/${tx.vaultId}`}
                                                    onClick={playClick}
                                                    onMouseEnter={playHover}
                                                    className="font-bold text-slate-100 group-hover/pitem:text-intuition-primary transition-colors truncate inline-block max-w-full align-baseline underline-offset-2 group-hover/pitem:underline"
                                                >
                                                    {tx.assetLabel || tx.vaultId.slice(0, 10) + '…'}
                                                </Link>
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[9px] font-mono text-slate-500">
                                                <span>{new Date(tx.timestamp).toLocaleString()}</span>
                                                <span className="border border-slate-700 px-2 py-0.5 rounded-xl" title="Bonding curve type">
                                                    {getCurveLabel(tx.curveId)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="xl:col-span-2">

            {/* Action Bar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5 mb-8">
                <div className="flex-1 relative group p-[1px] rounded-2xl bg-gradient-to-r from-white/[0.08] to-white/[0.04] focus-within:from-intuition-primary/35 focus-within:to-intuition-primary/15 transition-colors">
                    <div className="relative rounded-2xl bg-[#080a10]">
                    <div className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-intuition-primary transition-colors pointer-events-none">
                        <Search size={18} />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search by wallet, name, or claim…" 
                        className="w-full bg-transparent py-3.5 sm:py-4 pl-12 sm:pl-14 pr-4 sm:pr-6 text-white font-sans text-sm focus:outline-none placeholder-slate-500 rounded-2xl min-h-[48px]"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button type="button" className="flex items-center gap-2 min-h-[48px] px-5 py-3 bg-white/[0.04] border border-white/10 text-slate-200 hover:text-white hover:border-white/20 transition-all text-sm font-sans font-medium rounded-2xl">
                        <ListFilter size={16} className="shrink-0" /> <span className="hidden sm:inline">Filter</span>
                    </button>
                    
                    <div className="relative min-w-0 flex-1 sm:flex-initial">
                        <button 
                            type="button"
                            onClick={() => { playClick(); setIsSortOpen(!isSortOpen); }}
                            className={`w-full sm:w-auto flex items-center justify-between gap-3 min-h-[48px] px-5 py-3 bg-white/[0.04] border transition-all text-sm font-sans font-medium rounded-2xl min-w-0 sm:min-w-[200px] ${isSortOpen ? 'border-intuition-primary text-white shadow-[0_0_20px_rgba(0,243,255,0.12)]' : 'border-white/10 text-slate-300'}`}
                        >
                            Sort: {activeSort} <ChevronDown size={16} className={`shrink-0 transition-transform duration-300 ${isSortOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isSortOpen && (
                            <div className="absolute right-0 top-full mt-2 w-full border border-white/10 bg-[#0a0c12]/98 backdrop-blur-xl shadow-2xl z-[100] p-1.5 rounded-2xl">
                                {(['Newest', 'Oldest', 'Highest Volume'] as SortOption[]).map((opt) => (
                                    <button 
                                        key={opt}
                                        type="button"
                                        onClick={() => { setActiveSort(opt); setIsSortOpen(false); playClick(); }}
                                        className={`w-full min-h-[44px] px-4 py-3 text-left text-sm font-sans rounded-xl transition-all hover:bg-intuition-primary/15 hover:text-white ${activeSort === opt ? 'text-intuition-primary bg-white/[0.06]' : 'text-slate-300'}`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Activity Feed Container */}
            <div className="relative min-h-[600px] z-10">
                <div className="flex items-center gap-2 text-slate-400 text-sm font-sans font-medium mb-6 px-1">
                    <Wifi size={14} className="text-intuition-success shrink-0 animate-pulse" aria-hidden /> IntuRank activity
                </div>

                {loading && events.length === 0 ? (
                    <PageLoading
                        variant="section"
                        message="Loading activity…"
                        subMessage="Connecting to the network…"
                        backLink={null}
                        className="absolute inset-0 bg-[#020308]/85 backdrop-blur-[2px]"
                    />
                ) : filteredEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-48 border border-dashed border-white/10 bg-white/[0.02] rounded-3xl relative group backdrop-blur-sm">
                        <div className="absolute inset-0 bg-intuition-danger/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <Zap size={64} className="text-slate-800 mb-8 opacity-40 group-hover:text-intuition-danger transition-colors" />
                        <div className="text-center space-y-2">
                            <span className="text-base font-sans font-semibold text-slate-300 group-hover:text-white transition-colors">No matches</span>
                            <p className="text-sm text-slate-500 font-sans">Broaden search or check back once more players route stakes through IntuRank.</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {filteredEvents.map((ev, i) => (
                            <div key={ev.id + i} className="animate-in fade-in slide-in-from-right-2 duration-500 fill-mode-both" style={{ animationDelay: `${Math.min(i * 30, 400)}ms` }}>
                                <ActivityRow event={ev} />
                            </div>
                        ))}
                    </div>
                )}

                {/* Observer / Loader */}
                <div ref={observerTarget} className="h-64 flex flex-col items-center justify-center mt-12 border-t border-white/5 pt-12">
                    {loadingMore ? (
                        <div className="flex flex-col items-center gap-4">
                            <PageLoadingSpinner size="md" />
                            <span className="text-sm text-slate-400 font-sans">Loading more…</span>
                        </div>
                    ) : !hasMore && events.length > 0 && (
                        <div className="flex flex-col items-center gap-6 opacity-80">
                            <div className="w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-500">
                                <Terminal size={18} />
                            </div>
                            <div className="text-center space-y-2">
                                <span className="text-sm font-sans font-medium text-slate-500">You’re caught up</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
                </div>
            </div>

        </div>
    );
};

export default Feed;