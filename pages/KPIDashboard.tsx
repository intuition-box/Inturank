
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Activity, Users, Zap, Download, RefreshCw, FileText, Globe, Terminal, Award, ArrowUpRight, BarChart3, TrendingUp, Loader2, UserCircle, BadgeCheck, Network, Lock, Coins, Clock, Box, ShieldCheck, ExternalLink } from 'lucide-react';
import { getNetworkKPIs, getRecentFeeProxyActivity, type FeeProxyActivityLine } from '../services/graphql';
import { subscribeVisibilityAwareInterval } from '../services/visibility';
import { formatEther } from 'viem';
import { PageLoading } from '../components/PageLoading';
import { playClick, playHover } from '../services/audio';
import { toast } from '../components/Toast';
import html2canvas from 'html2canvas';
import { CURRENCY_SYMBOL, FEE_PROXY_ADDRESS, EXPLORER_URL, PAGE_HERO_EYEBROW, PAGE_HERO_TITLE } from '../constants';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { getWalletBalance } from '../services/web3';

const KPIStatCard = ({ label, value, sub, icon: Icon, color = "primary", animate = false, isZero = false }: { label: string; value: string | number; sub: string | React.ReactNode; icon: any; color?: string; animate?: boolean; isZero?: boolean }) => {
    const isPrimary = color === "primary";
    const accentColor = isPrimary ? 'text-intuition-primary' : 'text-intuition-secondary';
    const accentGlow = isPrimary ? 'text-glow-blue' : 'text-glow-red';
    const borderColor = isPrimary ? 'border-intuition-primary/30' : 'border-intuition-secondary/30';
    const bgGlow = isPrimary ? 'bg-intuition-primary/10' : 'bg-intuition-secondary/10';
    const iconBgGlow = isPrimary ? 'shadow-glow-blue' : 'shadow-glow-red';

    return (
        <div className={`p-5 bg-black border-2 ${borderColor} clip-path-slant relative group overflow-hidden shadow-xl transition-all duration-500 hover:border-white/40 hover:shadow-[0_0_30px_rgba(255,255,255,0.06)]`}>
            <div className={`absolute inset-0 ${bgGlow} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
            <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-all duration-700 group-hover:scale-110 ${isPrimary ? 'text-intuition-primary' : 'text-intuition-secondary'}`}>
                <Icon size={60} className={animate ? 'animate-pulse' : ''} />
            </div>
            
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex flex-col gap-1">
                    <span className={`text-xs font-sans font-semibold tracking-wide text-slate-400 group-hover:text-white ${isPrimary ? 'group-hover:text-glow-blue' : 'group-hover:text-glow-red'} transition-all duration-300`}>{label}</span>
                    <div className={`h-px w-8 ${isPrimary ? 'bg-intuition-primary' : 'bg-intuition-secondary'} opacity-60 group-hover:w-full group-hover:opacity-100 transition-all duration-700 shadow-[0_0_8px_currentColor]`}></div>
                </div>
                <div className={`p-2 bg-black border border-white/10 clip-path-slant ${accentColor} ${iconBgGlow} ${animate ? 'animate-pulse' : ''} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon size={14} />
                </div>
            </div>

            <div className="relative z-10 flex items-baseline gap-2">
                <div className={`text-2xl md:text-3xl font-black text-white font-display tracking-tight leading-none group-hover:text-glow-white transition-all duration-300 ${isZero ? 'opacity-30' : ''}`}>
                    {value}
                </div>
                <span className={`text-xs font-sans font-medium tracking-wide ${accentColor} ${accentGlow} inline-flex items-baseline`}>{sub}</span>
            </div>
            {isZero && (
                <div className="absolute bottom-3 left-5 text-[10px] font-medium text-slate-500 animate-pulse font-sans">
                    No protocol activity yet
                </div>
            )}
        </div>
    );
};

const KPIDashboard: React.FC = () => {
    const reportRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [userBalances, setUserBalances] = useState<Record<string, string>>({});
    const [proxyLog, setProxyLog] = useState<FeeProxyActivityLine[]>([]);
    const [proxyLogLoading, setProxyLogLoading] = useState(true);
    const [proxyLogError, setProxyLogError] = useState(false);
    const [proxyLogManualRefresh, setProxyLogManualRefresh] = useState(false);

    const refreshProxyLog = useCallback(async (mode: 'initial' | 'poll' | 'manual' = 'poll') => {
        if (mode === 'initial') setProxyLogLoading(true);
        if (mode === 'manual') {
            playClick();
            setProxyLogManualRefresh(true);
        }
        try {
            const rows = await getRecentFeeProxyActivity(24);
            setProxyLog(rows);
            setProxyLogError(false);
        } catch {
            setProxyLogError(true);
        } finally {
            if (mode === 'initial') setProxyLogLoading(false);
            if (mode === 'manual') setProxyLogManualRefresh(false);
        }
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await getNetworkKPIs();
            if (data.txCount > 0) {
                toast.success('Stats updated');
                const topUsers = data.userLedger.slice(0, 15);
                const balanceMap: Record<string, string> = {};
                for (const user of topUsers) {
                    try {
                        const b = await getWalletBalance(user.id);
                        balanceMap[user.id] = parseFloat(b).toLocaleString(undefined, { maximumFractionDigits: 2 });
                    } catch {
                        balanceMap[user.id] = '0.00';
                    }
                }
                setUserBalances(balanceMap);
            } else {
                setUserBalances({});
            }
            setStats(data);
        } catch {
            toast.error('Failed to load stats');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        void refreshProxyLog('initial');
        return subscribeVisibilityAwareInterval(() => {
            void refreshProxyLog('poll');
        }, 12_000);
    }, [refreshProxyLog]);

    const handleExport = async () => {
        if (!reportRef.current) return;
        playClick();
        setIsExporting(true);
        toast.info("Saving image…");

        try {
            const canvas = await html2canvas(reportRef.current, {
                backgroundColor: '#020308',
                scale: 2,
                useCORS: true,
                logging: false
            });
            
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `inturank-ares-audit-${new Date().getTime()}.png`;
            link.click();
            toast.success("Image downloaded");
        } catch (e) {
            toast.error("Export failed");
        } finally {
            setIsExporting(false);
        }
    };

    if (loading) {
        return <PageLoading message="Loading system health…" backLink={null} />;
    }

    const formattedProxyTVL = parseFloat(formatEther(BigInt(stats?.proxyTVL || '0'))).toLocaleString(undefined, { maximumFractionDigits: 4 });
    const isProxyEmpty = !stats || stats.txCount === 0;

    return (
        <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-10 pb-24 font-sans min-w-0">
            {/* Header */}
            <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between mb-12 gap-6 border-b border-white/10 pb-8">
                <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 text-slate-500">
                        <ShieldCheck size={16} className="shrink-0 text-intuition-secondary/90" aria-hidden />
                        <p className={PAGE_HERO_EYEBROW}>Intuition Mainnet · operator metrics</p>
                    </div>
                    <h1 className={`${PAGE_HERO_TITLE} mobile-break`}>System health</h1>
                </div>
                
                <div className="flex flex-wrap gap-3">
                    <button 
                        onClick={fetchData}
                        className="px-6 py-3 bg-black border border-slate-800 text-slate-400 hover:text-white hover:border-white transition-all clip-path-slant flex items-center gap-3 text-xs font-semibold tracking-wide group"
                    >
                        <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-700" /> Refresh
                    </button>
                    <button 
                        onClick={handleExport}
                        disabled={isExporting}
                        className="px-8 py-3 bg-intuition-secondary text-white font-semibold text-xs tracking-wide clip-path-slant hover:bg-white hover:text-black shadow-glow-red transition-all flex items-center gap-3 disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        Export screenshot
                    </button>
                </div>
            </div>

            {/* Container */}
            <div ref={reportRef} className="space-y-8 bg-transparent relative">
                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none z-0 overflow-hidden select-none">
                    <span className="text-[18rem] font-black rotate-[-20deg] whitespace-nowrap">Intuition</span>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
                    <KPIStatCard label="Fee proxy TVL" value={formattedProxyTVL} sub={<CurrencySymbol size="md" />} icon={Coins} color="secondary" animate={!isProxyEmpty} isZero={isProxyEmpty} />
                    <KPIStatCard label="Accounts tracked" value={stats?.userCount || 0} sub="wallets" icon={Users} color="primary" isZero={isProxyEmpty} />
                    <KPIStatCard label="Fee proxy transactions" value={stats?.txCount || 0} sub="all time" icon={Box} color="secondary" animate={!isProxyEmpty} isZero={isProxyEmpty} />
                </div>

                <div className="grid grid-cols-1 gap-8 relative z-10">
                    {/* Citizen Ledger: full width so it scales with viewport */}
                    <div className="w-full min-w-0">
                        <div className="bg-[#02040a] border border-slate-900 clip-path-slant shadow-2xl overflow-hidden">
                            <div className="p-6 border-b border-slate-900 bg-white/[0.02] flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <Activity size={24} className="text-intuition-secondary animate-pulse" />
                                    <h3 className="font-bold text-white font-display tracking-tight text-lg">Account leaderboard</h3>
                                </div>
                                <div className="text-[10px] text-slate-600 font-medium hidden sm:block">By volume through the fee proxy</div>
                            </div>
                            <div className="overflow-x-auto min-h-[400px]">
                                {stats?.userLedger?.length > 0 ? (
                                    <table className="w-full text-left font-sans table-fixed">
                                        <colgroup>
                                            <col style={{ width: '4%' }} />
                                            <col style={{ width: '28%' }} />
                                            <col style={{ width: '10%' }} />
                                            <col style={{ width: '18%' }} />
                                            <col style={{ width: '22%' }} />
                                            <col style={{ width: '18%' }} />
                                        </colgroup>
                                        <thead className="bg-[#080808] text-slate-400 text-xs sm:text-sm font-semibold border-b border-slate-800">
                                            <tr>
                                                <th className="px-3 sm:px-4 py-4 w-12 text-center">#</th>
                                                <th className="px-3 sm:px-4 py-4">Account</th>
                                                <th className="px-3 sm:px-4 py-4 text-center">Transactions</th>
                                                <th className="px-3 sm:px-4 py-4 text-right whitespace-nowrap">Volume</th>
                                                <th className="px-3 sm:px-4 py-4 text-right whitespace-nowrap">{`${CURRENCY_SYMBOL} balance`}</th>
                                                <th className="px-3 sm:px-4 py-4 text-right whitespace-nowrap">Tier</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {stats.userLedger.map((user: any, i: number) => (
                                                <tr key={user.id} className="hover:bg-white/5 transition-all group cursor-pointer">
                                                    <td className="px-3 sm:px-4 py-5 text-center">
                                                        <span className="text-sm sm:text-base font-black text-slate-400 group-hover:text-white transition-colors tabular-nums">{i + 1}</span>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-5 min-w-0">
                                                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                                            <div className="w-10 h-10 bg-black border border-slate-800 clip-path-slant flex items-center justify-center overflow-hidden group-hover:border-intuition-secondary transition-all shrink-0">
                                                                {user.image ? <img src={user.image} className="w-full h-full object-cover" alt="" /> : <UserCircle size={20} className="text-slate-600" />}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-sm font-semibold text-white group-hover:text-intuition-secondary transition-colors truncate">{user.label || user.id.slice(0, 14)}</div>
                                                                <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">{user.id}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-5 text-center">
                                                        <div className="text-base sm:text-lg font-black text-white font-display group-hover:text-glow-white leading-none tabular-nums">{user.txCount}</div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-5 text-right whitespace-nowrap">
                                                        <div className="text-base sm:text-lg font-black text-intuition-success font-mono group-hover:text-glow-success leading-none tabular-nums">
                                                            {user.volume.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-5 text-right whitespace-nowrap">
                                                        <div className="text-sm font-black text-intuition-primary font-mono group-hover:text-glow-blue leading-none tabular-nums">
                                                            {userBalances[user.id] || "0.00"}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 mt-1 font-medium">Wallet balance</div>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-5 text-right whitespace-nowrap">
                                                        <span className={`inline-block px-3 py-1.5 border text-xs font-semibold clip-path-slant ${i < 3 ? 'border-intuition-secondary text-intuition-secondary bg-intuition-secondary/10 shadow-glow-red' : 'border-slate-600 text-slate-400'}`}>
                                                            {i < 3 ? 'Top 3' : 'Standard'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-[400px] space-y-6">
                                        <Shield size={60} className="text-slate-900 animate-pulse" />
                                        <p className="text-slate-500 text-sm font-medium">No ledger data yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar: full-width grid below ledger so table gets all horizontal space */}
                    <div className="grid w-full grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[minmax(0,1fr)_min(100%,260px)] xl:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
                        {/* Activity log */}
                        <div className="group/feeact flex min-h-[220px] min-w-0 flex-col rounded-2xl border border-cyan-500/30 bg-intuition-dark/90 p-5 shadow-lg shadow-black/40 ring-1 ring-white/[0.04] transition-all duration-300 [text-shadow:none] clip-path-slant hover:border-cyan-400/45 hover:shadow-xl hover:shadow-black/50 sm:p-6 [&_*]:[text-shadow:none]">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
                                <div className="flex min-w-0 items-center gap-3">
                                    <Terminal size={14} className="shrink-0 text-cyan-400" aria-hidden />
                                    <div>
                                        <h4 className="text-sm font-bold tracking-tight text-cyan-200">Fee proxy activity</h4>
                                        <p className="mt-1 text-[10px] font-medium text-slate-400">Indexed deposits &amp; redemptions · auto ~12s</p>
                                    </div>
                                </div>
                                <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void refreshProxyLog('manual');
                                        }}
                                        disabled={proxyLogManualRefresh}
                                        onMouseEnter={playHover}
                                        title="Refresh activity now"
                                        aria-label="Refresh fee proxy activity"
                                        className="group/ref inline-flex items-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-950/40 px-3 py-1.5 text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-cyan-100 shadow-sm shadow-black/30 transition-all duration-300 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none hover:-translate-y-px hover:border-cyan-400/80 hover:bg-cyan-950/70 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                                    >
                                        <RefreshCw
                                            size={12}
                                            className={`shrink-0 text-cyan-300 transition-transform duration-500 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] ${
                                                proxyLogManualRefresh ? 'animate-spin' : 'group-hover/ref:rotate-180'
                                            }`}
                                            aria-hidden
                                        />
                                        <span>Sync</span>
                                    </button>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-950/30 px-2.5 py-1 text-[9px] font-mono font-semibold uppercase tracking-wider text-cyan-200">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-emerald-500/50" aria-hidden />
                                        Live
                                    </span>
                                </div>
                            </div>
                            <div className="min-h-[200px] flex-1 overflow-hidden rounded-xl border border-white/[0.06] bg-[#03050d]/90">
                                {proxyLogLoading && proxyLog.length === 0 ? (
                                    <div className="flex items-center gap-2 p-5 text-sm text-slate-500">
                                        <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
                                        <span>Loading indexed activity…</span>
                                    </div>
                                ) : proxyLogError ? (
                                    <div className="p-5 text-sm text-amber-400/90">Could not load activity. Will retry on the next tick.</div>
                                ) : proxyLog.length === 0 ? (
                                    <div className="p-5 text-sm text-slate-500">No fee-proxy transactions in the subgraph yet.</div>
                                ) : (
                                    <div className="max-h-[340px] overflow-auto custom-scrollbar">
                                        <table className="w-full min-w-[640px] border-collapse text-left">
                                            <thead className="sticky top-0 z-[1] bg-[#05070c]/95 backdrop-blur-sm">
                                                <tr className="border-b border-white/[0.08] text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                                    <th className="whitespace-nowrap px-3 py-2.5 pl-4 font-medium sm:pl-5">When</th>
                                                    <th className="whitespace-nowrap px-2 py-2.5 font-medium">Type</th>
                                                    <th className="whitespace-nowrap px-2 py-2.5 font-medium">Amount</th>
                                                    <th className="min-w-[7.5rem] px-2 py-2.5 font-medium">Account</th>
                                                    <th className="min-w-[10rem] px-2 py-2.5 font-medium">Market / claim</th>
                                                    <th className="w-12 whitespace-nowrap px-3 py-2.5 pr-4 text-right font-medium sm:pr-5">Tx</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-sans text-[11px] text-slate-300 sm:text-xs">
                                                {proxyLog.map((row) => {
                                                    const d = new Date(row.timestampMs);
                                                    return (
                                                        <tr
                                                            key={row.id}
                                                            className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.03] last:border-b-0"
                                                        >
                                                            <td className="align-top whitespace-nowrap px-3 py-3 pl-4 sm:pl-5">
                                                                <div className="flex flex-col gap-0.5 leading-tight">
                                                                    <span className="text-[11px] font-medium tabular-nums text-slate-100 sm:text-xs">
                                                                        {d.toLocaleDateString(undefined, {
                                                                            weekday: 'short',
                                                                            month: 'short',
                                                                            day: 'numeric',
                                                                            year: 'numeric',
                                                                        })}
                                                                    </span>
                                                                    <span className="text-[10px] tabular-nums text-slate-500">
                                                                        {d.toLocaleTimeString(undefined, {
                                                                            hour: 'numeric',
                                                                            minute: '2-digit',
                                                                            second: '2-digit',
                                                                        })}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="align-top px-2 py-3">
                                                                <span
                                                                    className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wide [text-shadow:none] ${
                                                                        row.kind === 'DEP'
                                                                            ? 'border-cyan-500/50 bg-cyan-950/60 text-cyan-200'
                                                                            : 'border-rose-500/45 bg-rose-950/50 text-rose-200'
                                                                    }`}
                                                                >
                                                                    {row.kind}
                                                                </span>
                                                            </td>
                                                            <td className="align-top whitespace-nowrap px-2 py-3 tabular-nums font-semibold text-slate-100">
                                                                {row.amountFormatted}
                                                                <CurrencySymbol
                                                                    size="sm"
                                                                    className="inline align-[-0.1em] !text-cyan-300 [text-shadow:none]"
                                                                />
                                                            </td>
                                                            <td className="align-top px-2 py-3">
                                                                {row.actorId ? (
                                                                    <Link
                                                                        to={`/profile/${encodeURIComponent(row.actorId)}`}
                                                                        onClick={playClick}
                                                                        onMouseEnter={playHover}
                                                                        className="font-semibold text-cyan-300 [text-shadow:none] transition-colors hover:text-white hover:underline hover:decoration-cyan-500/50 hover:underline-offset-2"
                                                                        title={row.actorLabel}
                                                                    >
                                                                        <span className="line-clamp-2 break-all">{row.actorLabel}</span>
                                                                    </Link>
                                                                ) : (
                                                                    <span className="text-slate-500">—</span>
                                                                )}
                                                            </td>
                                                            <td className="align-top px-2 py-3 text-slate-300">
                                                                <span className="line-clamp-2 break-words [text-shadow:none]" title={row.marketLabel}>
                                                                    {row.marketLabel}
                                                                </span>
                                                            </td>
                                                            <td className="align-top px-3 py-3 pr-4 text-right sm:pr-5">
                                                                {row.transactionHash ? (
                                                                    <a
                                                                        href={`${EXPLORER_URL}/tx/${row.transactionHash}`}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        onClick={playClick}
                                                                        onMouseEnter={playHover}
                                                                        className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 [text-shadow:none] transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
                                                                        title="View on explorer"
                                                                        aria-label="View transaction on block explorer"
                                                                    >
                                                                        <ExternalLink size={14} />
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-slate-600">—</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Fee proxy — narrow column so activity table gets most width */}
                        <div className="relative w-full self-start overflow-hidden rounded-2xl border-2 border-intuition-secondary/30 bg-[#050505] p-5 shadow-2xl clip-path-slant transition-all duration-500 group hover:border-intuition-secondary/60 hover:shadow-[0_0_30px_rgba(239,68,68,0.12)]">
                             <div className="relative z-10 flex flex-col">
                                <div className="mb-4 flex items-center gap-3">
                                    <Lock size={16} className="shrink-0 animate-pulse text-intuition-secondary text-glow-red" aria-hidden />
                                    <h4 className="text-sm font-semibold text-intuition-secondary text-glow-red">Fee proxy contract</h4>
                                </div>
                                <div className="text-xs font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-300">
                                    <span className="mb-2 block text-[10px] uppercase tracking-wide text-slate-500">Address (read-only)</span>
                                    <span className="block break-all rounded-lg border border-intuition-primary/20 bg-white/5 px-3 py-2.5 font-mono text-[10px] font-semibold leading-snug text-intuition-primary/90 text-glow-blue transition-all group-hover:border-intuition-primary/40 sm:text-[11px]">{FEE_PROXY_ADDRESS}</span>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="pt-16 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 opacity-40 group-hover:opacity-70 transition-all duration-1000">
                    <div className="flex items-center gap-6">
                         <div className="w-12 h-12 bg-black border border-white/10 flex items-center justify-center text-white clip-path-slant group-hover:border-intuition-primary transition-colors">
                             <Shield size={24} strokeWidth={1.5} />
                         </div>
                         <div>
                             <div className="text-xs font-semibold font-display text-white mb-1">IntuRank health report</div>
                             <div className="text-[10px] font-medium text-slate-500">On-chain metrics · subgraph + fee proxy</div>
                         </div>
                    </div>
                    <div className="text-left sm:text-right flex flex-col items-start sm:items-end gap-1">
                         <div className="text-xs font-medium text-slate-300">{new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>
                         <div className="text-[10px] font-medium text-slate-600">Exported view · not financial advice</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KPIDashboard;
