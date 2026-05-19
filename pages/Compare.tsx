import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Activity, Zap, Trophy, Brain, Loader2, Quote, Terminal, Crosshair, Network, Shield, Users, BarChart3, TrendingUp, Swords } from 'lucide-react';
import { getAllAgents, getRedemptionCountForVault } from '../services/graphql';
import { Account } from '../types';
import { calculateTrustScore, calculateVolatility, formatMarketValue } from '../services/analytics';
import { formatEther } from 'viem';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { playClick, playHover } from '../services/audio';
import { Link } from 'react-router-dom';
import { CURRENCY_SYMBOL, getGeminiApiKey, getGroqApiKey, getOpenAiApiKey } from '../constants';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { generateSimpleLlmCompletion } from '../services/skillLlm';

// --- TACTICAL CONFLICT SIMULATION COMPONENT (Updated to V3 Inspo) ---
export const RivalryAnalysis: React.FC<{
  left: Account;
  right: Account;
  lScore: number;
  rScore: number;
  /** Arena modal: cyan/fuchsia IntuRank theme; default: amber battleground */
  variant?: 'default' | 'arena';
}> = ({ left, right, lScore, rScore, variant = 'default' }) => {
    const [analysis, setAnalysis] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [displayedText, setDisplayedText] = useState('');

    useEffect(() => {
        if (analysis) {
            let i = 0;
            setDisplayedText('');
            const interval = setInterval(() => {
                setDisplayedText(analysis.slice(0, i));
                i++;
                if (i > analysis.length) clearInterval(interval);
            }, 8);
            return () => clearInterval(interval);
        }
    }, [analysis]);

    const generateAnalysis = async () => {
        setLoading(true);
        try {
            if (!getGroqApiKey() && !getGeminiApiKey() && !getOpenAiApiKey()) {
                setAnalysis('AI summary is disabled. Set VITE_GROQ_API_KEY (preferred) or VITE_GEMINI_API_KEY / VITE_OPENAI_API_KEY in your environment to enable it.');
                setLoading(false);
                return;
            }
            const prompt = `
                Compare two reputation-based assets for a normal (non-expert) user.

                Asset A: ${left.label} — Score: ${lScore.toFixed(1)}, Type: ${left.type || 'asset'}
                Asset B: ${right.label} — Score: ${rScore.toFixed(1)}, Type: ${right.type || 'asset'}
                Stronger so far: ${lScore > rScore ? left.label : right.label}

                Write one short, clear paragraph (2–4 sentences) that:
                - Says who is ahead and by how much (scores above).
                - Explains in plain language why one might be stronger (e.g. more volume, more holders, higher score).
                - Avoids jargon. Use everyday words: "ahead", "stronger", "more activity", "more support", "higher score". Do NOT use: protocol incursion, liquidity bleed, semantic fragging, neural arbitrage, consensus overload, or military/combat metaphors.
            `;

            const { text } = await generateSimpleLlmCompletion(prompt);
            setAnalysis(text || 'Could not generate summary. Try again.');
        } catch (e) {
            setAnalysis('Summary unavailable. Check your API key or connection.');
        } finally {
            setLoading(false);
        }
    };

    if (variant === 'arena') {
        return (
            <div className="relative mb-5 rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-[#050a12] via-[#070d16] to-[#0a0614] p-4 sm:p-5 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_48px_rgba(0,0,0,0.35)] group">
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(34,211,238,0.07)_0%,transparent_42%,rgba(217,70,239,0.06)_100%)]" />
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
                <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-fuchsia-600/10 blur-3xl" />
                <div className="relative z-10">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/35 bg-cyan-500/10 shadow-[0_0_24px_rgba(34,211,238,0.15)]">
                            <Brain size={22} className="text-cyan-300" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white font-display">Battle summary</h3>
                            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Plain-language · optional AI</p>
                        </div>
                    </div>

                    {!analysis && !loading ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-slate-700/60 bg-slate-950/50 px-4 py-4 border-l-4 border-l-cyan-500/60">
                            <p className="text-sm text-slate-400 leading-relaxed flex-1 min-w-0">
                                Short summary of who&apos;s ahead and why — same signals as the full battleground, tuned for the arena.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    playClick();
                                    generateAnalysis();
                                }}
                                className="shrink-0 rounded-xl border border-fuchsia-500/40 bg-gradient-to-r from-cyan-500/15 to-fuchsia-600/20 px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.15em] text-white shadow-[0_0_20px_rgba(34,211,238,0.12)] hover:from-cyan-500/25 hover:to-fuchsia-500/30 hover:border-cyan-400/50 transition-all active:scale-[0.98]"
                            >
                                Generate report
                            </button>
                        </div>
                    ) : loading ? (
                        <div className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-slate-950/40 px-4 py-4 text-cyan-300/90 text-sm font-medium border-l-4 border-l-cyan-500/50">
                            <Loader2 size={18} className="animate-spin text-cyan-400" />
                            <span className="font-mono text-xs uppercase tracking-wider">Synthesizing…</span>
                        </div>
                    ) : (
                        <div className="flex gap-3 items-start rounded-xl border border-slate-700/50 bg-slate-950/40 px-4 py-4 border-l-4 border-l-fuchsia-500/50 animate-in fade-in duration-500">
                            <Quote size={22} className="text-fuchsia-400/80 shrink-0 mt-0.5" />
                            <p className="text-slate-200 text-sm leading-relaxed">
                                {displayedText}
                                <span className="inline-block w-2 h-3.5 bg-gradient-to-b from-cyan-400 to-fuchsia-400 ml-1 animate-pulse rounded-sm align-middle" />
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-[#020308] via-[#040612] to-[#020308] border-2 border-amber-500/30 p-4 sm:p-6 md:p-10 relative overflow-hidden group shadow-2xl min-h-[180px] mb-6 md:mb-8 rounded-sm hover:border-amber-500/50 hover:shadow-[0_0_40px_rgba(250,204,21,0.08)] transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-intuition-primary/5 via-transparent to-intuition-secondary/5 pointer-events-none" />
            <div className="absolute -top-12 -right-12 opacity-[0.12] text-amber-400 pointer-events-none group-hover:opacity-20 group-hover:scale-110 transition-all duration-700">
                <Swords size={280} />
            </div>

            <div className="relative z-10">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-10 h-10 bg-black/80 border-2 border-amber-500/50 flex items-center justify-center text-amber-400 clip-path-slant shadow-[0_0_20px_rgba(250,204,21,0.2)]">
                        <Brain size={20} />
                    </div>
                    <h3 className="text-sm font-bold text-white tracking-wide">Battle Summary</h3>
                </div>
                
                {!analysis && !loading ? (
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8 pl-4 border-l-2 border-amber-500/30">
                        <p className="text-slate-300 font-sans text-sm leading-relaxed max-w-2xl">
                            Get a short, plain-language summary of how these two compare — who’s ahead and why.
                        </p>
                        <button 
                            onClick={() => { playClick(); generateAnalysis(); }}
                            className="px-8 py-3 bg-amber-500 text-black font-bold text-sm tracking-wide hover:bg-amber-400 hover:shadow-[0_0_24px_rgba(250,204,21,0.4)] transition-all whitespace-nowrap active:scale-95"
                        >
                            Generate Battle Report
                        </button>
                    </div>
                ) : loading ? (
                    <div className="flex items-center gap-3 text-amber-400 font-sans text-sm animate-pulse font-medium py-4 pl-4 border-l-2 border-amber-500/40">
                        <Loader2 size={16} className="animate-spin" /> Analyzing combatants…
                    </div>
                ) : (
                    <div className="flex gap-6 items-start animate-in fade-in duration-500 pl-4 border-l-2 border-amber-500/50">
                        <Quote size={24} className="text-amber-400 shrink-0 opacity-60 mt-1" />
                        <p className="text-slate-200 font-sans text-sm leading-relaxed">
                            {displayedText}
                            <span className="inline-block w-2 h-3.5 bg-amber-400 ml-1 animate-pulse rounded-sm"></span>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- POKÉ BALL ARENA — top (red) vs bottom (blue), TCG battleground style ---
const PokeBallArena: React.FC<{
    topAgent: Account | null;
    bottomAgent: Account | null;
    topScore: number;
    bottomScore: number;
    onSelectTop: () => void;
    onSelectBottom: () => void;
    onSwap: () => void;
}> = ({ topAgent, bottomAgent, topScore, bottomScore, onSelectTop, onSelectBottom, onSwap }) => {
    const topHp = Math.min(100, Math.max(0, topScore));
    const bottomHp = Math.min(100, Math.max(0, bottomScore));
    const topWins = topAgent && bottomAgent && topScore > bottomScore;
    const bottomWins = topAgent && bottomAgent && bottomScore > topScore;

    const TCGCard: React.FC<{ agent: Account | null; hp: number; isWinner: boolean; zone: 'RED' | 'BLUE'; onSelect: () => void }> = ({ agent, hp, isWinner, zone, onSelect }) => {
        const isRed = zone === 'RED';
        return (
            <div onClick={() => { playClick(); onSelect(); }} onMouseEnter={playHover} className={`relative w-full max-w-[280px] mx-auto cursor-pointer group transition-all duration-500 ${agent ? 'hover:scale-[1.02]' : ''}`}>
                {agent ? (
                    <div className={`relative rounded-xl overflow-hidden border-2 transition-all ${isWinner ? 'border-emerald-500 shadow-[0_0_30px_rgba(34,197,94,0.3)]' : isRed ? 'border-red-500/60 bg-gradient-to-b from-red-950/40 to-red-950/20 shadow-[0_0_20px_rgba(220,38,38,0.15)]' : 'border-blue-500/60 bg-gradient-to-b from-blue-950/40 to-blue-950/20 shadow-[0_0_20px_rgba(37,99,235,0.15)]'}`}>
                        <div className={`flex justify-between items-center px-3 py-2 ${isRed ? 'bg-red-600/30' : 'bg-blue-600/30'} border-b border-white/10`}>
                            <span className="text-sm font-black text-white uppercase truncate max-w-[140px]">{agent.label}</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black text-white/80">HP</span>
                                <span className={`text-lg font-black tabular-nums ${isWinner ? 'text-emerald-400' : 'text-white'}`}>{hp.toFixed(0)}</span>
                            </div>
                        </div>
                        <div className="relative h-28 max-md:max-h-[7.5rem] sm:h-40 flex items-center justify-center p-3 sm:p-4">
                            <div className={`absolute inset-0 opacity-20 ${isRed ? 'bg-red-500' : 'bg-blue-500'}`} />
                            {agent.image ? <img src={agent.image} alt={agent.label} className="relative z-10 w-full h-full object-cover rounded-lg" /> : (
                                <div className="relative z-10 w-20 h-20 rounded-full bg-black/60 flex items-center justify-center text-2xl font-black text-white/60">{agent.label?.slice(0, 2)}</div>
                            )}
                        </div>
                        <div className="px-3 py-2 bg-black/40 flex flex-col gap-2">
                            <div className="h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
                                <div className={`h-full rounded-full transition-all duration-700 ${isWinner ? 'bg-emerald-500' : isRed ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${hp}%` }} />
                            </div>
                            <Link to={`/markets/${agent.id}`} onClick={(e) => e.stopPropagation()} className="text-[9px] font-black text-center text-white/80 hover:text-white uppercase tracking-wider transition-colors">
                                VIEW MARKET
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center h-48 ${isRed ? 'border-red-500/30 bg-red-950/20 hover:border-red-500/60' : 'border-blue-500/30 bg-blue-950/20 hover:border-blue-500/60'} transition-all`}>
                        <Crosshair size={40} className="opacity-40 mb-2" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">SELECT</span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="relative w-full max-w-2xl mx-auto rounded-3xl overflow-hidden border-2 border-slate-700/50 shadow-2xl">
            <div className="relative bg-gradient-to-b from-red-600/30 via-red-900/20 to-red-950/30 pt-8 pb-6 px-6">
                <div className="absolute top-2 left-4 text-[9px] font-black text-red-400/90 uppercase tracking-wider">Player 1</div>
                <TCGCard agent={topAgent} hp={topHp} isWinner={!!topWins} zone="RED" onSelect={onSelectTop} />
            </div>
            <div className="relative flex items-center justify-center bg-black py-2 border-y-2 border-slate-800">
                <button onClick={() => { playClick(); onSwap(); }} onMouseEnter={playHover} className="relative z-10 w-14 h-14 rounded-full bg-white border-4 border-black flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-110 transition-all">
                    <span className="font-black text-black text-lg">VS</span>
                </button>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-full h-px bg-slate-700 absolute" /></div>
            </div>
            <div className="relative bg-gradient-to-b from-blue-950/30 via-blue-900/20 to-blue-600/30 pt-6 pb-8 px-6">
                <div className="absolute top-2 left-4 text-[9px] font-black text-blue-400/90 uppercase tracking-wider">Player 2</div>
                <TCGCard agent={bottomAgent} hp={bottomHp} isWinner={!!bottomWins} zone="BLUE" onSelect={onSelectBottom} />
            </div>
        </div>
    );
};

// --- UPDATED COMPARISON ROW WITH WEIGHT BARS ---
export const ComparisonRow: React.FC<{
  label: string;
  leftVal: string | number;
  rightVal: string | number;
  unit?: string | React.ReactNode;
  icon: React.ReactNode;
  /** Arena: Lane A/B cyan & fuchsia; default: red & blue TCG */
  variant?: 'default' | 'arena';
}> = ({ label, leftVal, rightVal, unit = '', icon, variant = 'default' }) => {
  const lNum = parseFloat(leftVal.toString());
  const rNum = parseFloat(rightVal.toString());
  const total = lNum + rNum;

  const lPct = total > 0 ? Math.max(5, (lNum / total) * 100) : 50;
  const rPct = total > 0 ? Math.max(5, (rNum / total) * 100) : 50;

  const leftWins = lNum > rNum;
  const rightWins = rNum > lNum;
  const arena = variant === 'arena';

  const leftBar = arena ? 'bg-cyan-500/35' : 'bg-red-500';
  const rightBar = arena ? 'bg-fuchsia-500/35' : 'bg-blue-500';
  const leftText = arena ? (leftWins ? 'text-cyan-300' : 'text-slate-500') : leftWins ? 'text-red-400' : 'text-white';
  const rightText = arena ? (rightWins ? 'text-fuchsia-300' : 'text-slate-500') : rightWins ? 'text-blue-400' : 'text-white';
  const iconBox = arena
    ? `${leftWins ? 'text-cyan-400 border-cyan-500/45' : rightWins ? 'text-fuchsia-400 border-fuchsia-500/45' : 'text-slate-500 border-slate-600/50'}`
    : `${leftWins ? 'text-red-400 border-red-500/40' : rightWins ? 'text-blue-400 border-blue-500/40' : 'text-slate-500'}`;

  return (
    <div
      className={`flex items-center justify-between transition-all group relative overflow-hidden border-b ${
        arena ? 'py-2.5 px-2 sm:px-5 min-h-[64px] sm:min-h-[84px] border-slate-800/80' : 'py-3 px-3 sm:px-10 min-h-[68px] sm:min-h-[100px] border-white/5'
      }`}
    >
      <div className={`absolute inset-0 flex pointer-events-none ${arena ? 'opacity-[0.12] group-hover:opacity-[0.18]' : 'opacity-[0.08] group-hover:opacity-[0.12]'} transition-opacity`}>
        <div className={`h-full ${leftBar} transition-all duration-1000 ease-out`} style={{ width: `${lPct}%` }} />
        <div className={`h-full ${rightBar} transition-all duration-1000 ease-out`} style={{ width: `${rPct}%` }} />
      </div>

      <div
        className={`relative z-10 w-1/3 text-right pr-6 sm:pr-10 transition-all duration-500 ${
          arena ? (leftWins ? '' : 'opacity-70') : leftWins ? 'scale-110' : 'opacity-40 grayscale'
        }`}
      >
        <div className={`font-mono font-black text-lg sm:text-3xl tracking-tighter ${leftText}`}>
          {Number(leftVal).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <span className="inline-flex items-baseline text-slate-400 font-bold uppercase tracking-wider text-[9px] sm:text-[10px] mt-0.5">
          {typeof unit === 'string' ? unit : unit}
        </span>
      </div>

      <div className="relative z-10 flex flex-col items-center w-1/3 shrink-0 px-1">
        <div className={`mb-1.5 p-2 rounded-lg bg-black/50 border shadow-lg transition-all ${iconBox}`}>
          {React.cloneElement(icon as React.ReactElement<{ size?: number }>, { size: arena ? 15 : 16 })}
        </div>
        <div className="text-[9px] sm:text-[10px] font-black font-mono text-slate-300 text-center leading-tight uppercase tracking-wide px-0.5">
          {label}
        </div>
      </div>

      <div
        className={`relative z-10 w-1/3 text-left pl-6 sm:pl-10 transition-all duration-500 ${
          arena ? (rightWins ? '' : 'opacity-70') : rightWins ? 'scale-110' : 'opacity-40 grayscale'
        }`}
      >
        <div className={`font-mono font-black text-lg sm:text-3xl tracking-tighter ${rightText}`}>
          {Number(rightVal).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        <span className="inline-flex items-baseline text-slate-400 font-bold uppercase tracking-wider text-[9px] sm:text-[10px] mt-0.5">
          {typeof unit === 'string' ? unit : unit}
        </span>
      </div>
    </div>
  );
};

const Compare: React.FC = () => {
    const [agents, setAgents] = useState<Account[]>([]);
    const [leftAgent, setLeftAgent] = useState<Account | null>(null);
    const [rightAgent, setRightAgent] = useState<Account | null>(null);
    const [isSelectorOpen, setIsSelectorOpen] = useState<'LEFT' | 'RIGHT' | null>(null);
    const [search, setSearch] = useState('');
    const [leftExits, setLeftExits] = useState<number>(0);
    const [rightExits, setRightExits] = useState<number>(0);

    useEffect(() => {
        getAllAgents().then(data => setAgents(data.items));
    }, []);

    useEffect(() => {
        if (!leftAgent?.id || !rightAgent?.id) {
            setLeftExits(0);
            setRightExits(0);
            return;
        }
        let cancelled = false;
        Promise.all([
            getRedemptionCountForVault(leftAgent.id),
            getRedemptionCountForVault(rightAgent.id),
        ]).then(([l, r]) => {
            if (!cancelled) {
                setLeftExits(l);
                setRightExits(r);
            }
        });
        return () => { cancelled = true; };
    }, [leftAgent?.id, rightAgent?.id]);

    const handleSelect = (agent: Account) => {
        if (isSelectorOpen === 'LEFT') setLeftAgent(agent);
        if (isSelectorOpen === 'RIGHT') setRightAgent(agent);
        setIsSelectorOpen(null);
        setSearch('');
        playClick();
    };

    const handleSwap = () => {
        const temp = leftAgent;
        setLeftAgent(rightAgent);
        setRightAgent(temp);
        playClick();
    };

    const lScore = useMemo(() => leftAgent ? calculateTrustScore(leftAgent.totalAssets || '0', leftAgent.totalShares || '0') : 50, [leftAgent]);
    const rScore = useMemo(() => rightAgent ? calculateTrustScore(rightAgent.totalAssets || '0', rightAgent.totalShares || '0') : 50, [rightAgent]);

    // --- ENHANCED CHART DATA (Fixed "Bad" Look) ---
    const chartData = useMemo(() => {
        const data = [];
        let lBase = lScore;
        let rBase = rScore;
        for (let i = 40; i >= 0; i--) {
            // Simulate "Neural Drift"
            lBase += (Math.random() - 0.5) * 1.5;
            rBase += (Math.random() - 0.5) * 1.5;
            lBase = Math.max(10, Math.min(95, lBase));
            rBase = Math.max(10, Math.min(95, rBase));
            data.push({
                time: i,
                left: parseFloat(lBase.toFixed(2)),
                right: parseFloat(rBase.toFixed(2)),
            });
        }
        return data;
    }, [lScore, rScore]);

    const tensionIndex = Math.abs(lScore - rScore);
    const arbitrageDelta = useMemo(() => {
        if (!leftAgent || !rightAgent) return 0;
        const lAssets = parseFloat(formatEther(BigInt(leftAgent.totalAssets || '0')));
        const rAssets = parseFloat(formatEther(BigInt(rightAgent.totalAssets || '0')));
        return Math.abs(lAssets - rAssets) * 0.42; // Simplified delta logic for visual
    }, [leftAgent, rightAgent]);

    const filteredAgents = agents.filter(a => (a.label || '').toLowerCase().includes(search.toLowerCase()) || a.id.includes(search));

    return (
        <div className="min-h-screen bg-[#020308] pt-6 pb-28 px-3 sm:pt-12 sm:pb-32 sm:px-6 max-w-[1500px] mx-auto relative font-mono selection:bg-intuition-primary selection:text-black min-w-0 overflow-x-hidden">
            <div className="fixed inset-0 pointer-events-none z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>

                <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-8 gap-4 border-b border-white/10 pb-6 relative z-10 sm:mb-12 sm:gap-8 sm:pb-10">
                <div className="flex items-start gap-4 min-w-0">
                    <div className="w-11 h-11 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-black/80 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_20px_rgba(250,204,21,0.15)]">
                        <Swords size={22} className="sm:w-7 sm:h-7" />
                    </div>
                    <div className="min-w-0 space-y-2">
                        <p className="text-sm text-slate-500 font-sans">Compare two atoms</p>
                        <h1 className="text-2xl sm:text-4xl lg:text-[2.75rem] font-bold text-white font-display tracking-tight leading-[1.12] mobile-break">
                            Battleground
                        </h1>
                        <p className="text-[15px] text-slate-400 leading-relaxed font-sans max-w-xl">
                            Side-by-side stats and rivalry metrics. Pick two champions to analyze.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                    <div className="px-4 py-2.5 rounded-xl bg-black/50 border border-white/10 text-slate-400 text-sm font-sans flex items-center gap-2">
                        <Terminal size={14} className="text-amber-400 shrink-0" aria-hidden />
                        <span>
                          {leftAgent && rightAgent ? 'Ready to compare' : 'Pick two atoms'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="mb-8 z-10 sm:mb-12">
                <PokeBallArena
                    topAgent={leftAgent}
                    bottomAgent={rightAgent}
                    topScore={lScore}
                    bottomScore={rScore}
                    onSelectTop={() => setIsSelectorOpen('LEFT')}
                    onSelectBottom={() => setIsSelectorOpen('RIGHT')}
                    onSwap={handleSwap}
                />
            </div>

            {leftAgent && rightAgent ? (
                <div className="space-y-12 animate-in fade-in zoom-in-95 duration-700 relative z-10">
                    <RivalryAnalysis left={leftAgent} right={rightAgent} lScore={lScore} rScore={rScore} />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* Choose Your Attack — metric cards (Battleground inspo) */}
                        <div className="bg-gradient-to-b from-[#04060c] to-[#020308] border border-white/10 shadow-2xl relative overflow-hidden clip-path-slant hover:border-amber-500/20 transition-all duration-500">
                            <div className="bg-gradient-to-r from-intuition-primary/10 via-amber-500/5 to-intuition-secondary/10 py-4 border-b border-amber-500/20 flex justify-center items-center relative z-20">
                                <Swords size={16} className="text-amber-400 mr-2" />
                                <div className="text-sm font-bold text-white uppercase tracking-wider">Choose Your Attack</div>
                            </div>
                            
                            <div className="bg-black/40">
                                <ComparisonRow 
                                    label="Trading volume" 
                                    leftVal={parseFloat(formatEther(BigInt(leftAgent.totalAssets || '0')))} 
                                    rightVal={parseFloat(formatEther(BigInt(rightAgent.totalAssets || '0')))}
                                    unit={<CurrencySymbol size="sm" className="text-slate-300" />}
                                    icon={<Shield />}
                                />
                                <ComparisonRow 
                                    label="Volatility" 
                                    leftVal={calculateVolatility(leftAgent.totalAssets || '0')} 
                                    rightVal={calculateVolatility(rightAgent.totalAssets || '0')}
                                    unit="index"
                                    icon={<Activity />}
                                />
                                <ComparisonRow 
                                    label="Holders" 
                                    leftVal={leftAgent.positionCount ?? 0} 
                                    rightVal={rightAgent.positionCount ?? 0}
                                    unit="count"
                                    icon={<Users />}
                                />
                                <ComparisonRow 
                                    label="Exits (sells)" 
                                    leftVal={leftExits} 
                                    rightVal={rightExits}
                                    unit="count"
                                    icon={<Activity />}
                                />
                                <ComparisonRow 
                                    label="Risk proxy" 
                                    leftVal={calculateVolatility(leftAgent.totalAssets || '0')} 
                                    rightVal={calculateVolatility(rightAgent.totalAssets || '0')}
                                    unit="σ"
                                    icon={<TrendingUp />}
                                />
                                <ComparisonRow 
                                    label="Signal strength" 
                                    leftVal={(lScore * 1.2).toFixed(0)} 
                                    rightVal={(rScore * 1.2).toFixed(0)}
                                    unit="score"
                                    icon={<Network />}
                                />
                            </div>
                        </div>

                        {/* LIVE TELEMETRY CHART */}
                        <div className="bg-gradient-to-b from-[#04060c] to-[#020308] border border-white/10 p-10 h-[520px] relative group shadow-2xl overflow-hidden clip-path-slant hover:border-intuition-primary/20 transition-all duration-500">
                            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.05] pointer-events-none"></div>
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-intuition-primary/5 to-transparent pointer-events-none" />
                            
                            <div className="flex justify-between items-center mb-10 relative z-10">
                                <div className="flex gap-8 text-[10px] font-black font-mono">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                                        <span className="text-white uppercase tracking-widest">{leftAgent.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                                        <span className="text-white uppercase tracking-widest">{rightAgent.label}</span>
                                    </div>
                                </div>
                                <div className="px-4 py-2 bg-black/80 border border-intuition-primary/30 text-[9px] font-black font-mono text-intuition-primary uppercase tracking-[0.3em] shadow-glow-blue">
                                    ROI_OVER_TIME
                                </div>
                            </div>

                            <div className="h-[280px] w-full relative z-10">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorL" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#dc2626" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorR" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 6" stroke="#ffffff08" vertical={false} />
                                        <XAxis dataKey="time" hide />
                                        <YAxis domain={[0, 100]} hide />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: 'rgba(0,0,0,0.95)', border: '1px solid #333', fontSize: '10px', fontWeight: 'bold' }}
                                        />
                                        <Area type="monotone" dataKey="left" stroke="#dc2626" strokeWidth={4} fillOpacity={1} fill="url(#colorL)" animationDuration={2000} />
                                        <Area type="monotone" dataKey="right" stroke="#2563eb" strokeWidth={4} fillOpacity={1} fill="url(#colorR)" animationDuration={2000} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="mt-12 flex flex-col items-center gap-4 relative z-10">
                                <div className="text-[10px] font-black font-mono text-slate-500 uppercase tracking-[0.6em] animate-pulse">
                                    MAGNITUDE & ROI TRAJECTORY
                                </div>
                                <div className="flex gap-2 h-1.5 w-48 bg-white/10 overflow-hidden rounded-full border border-white/10">
                                    <div className="h-full bg-gradient-to-r from-red-500 to-blue-500 animate-buffer-fill rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="max-w-3xl mx-auto text-center py-32 border-2 border-dashed border-slate-800 bg-gradient-to-b from-slate-900/40 to-black/40 clip-path-slant relative group transition-all duration-500 hover:border-amber-500/40 hover:shadow-[0_0_60px_rgba(250,204,21,0.08)]">
                    <div className="absolute inset-0 bg-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Swords size={64} className="mx-auto text-slate-600 mb-8 opacity-40 group-hover:text-amber-400 group-hover:opacity-100 transition-all duration-700 animate-pulse relative z-10" />
                    <h3 className="text-2xl font-black font-display text-slate-500 uppercase tracking-[0.5em] mb-4 group-hover:text-amber-400 transition-all duration-500 relative z-10">SELECT YOUR CHAMPIONS</h3>
                    <p className="text-slate-600 font-mono text-[10px] uppercase tracking-[0.4em] px-8 leading-relaxed max-w-lg mx-auto font-black group-hover:text-slate-400 transition-colors relative z-10">
                        Pick two atoms to pit against each other. Compare power, volume, and holders in the battleground.
                    </p>
                </div>
            )}

            {isSelectorOpen && (
                <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setIsSelectorOpen(null)}>
                    <div className="w-full max-w-2xl bg-gradient-to-b from-[#06080e] to-[#020308] border-2 border-amber-500/40 p-10 clip-path-slant relative overflow-hidden shadow-[0_0_80px_rgba(250,204,21,0.1)] hover:shadow-[0_0_100px_rgba(250,204,21,0.15)] transition-shadow duration-500" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-5 mb-10">
                             <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 clip-path-slant shadow-[0_0_20px_rgba(250,204,21,0.2)]">
                                 <Search size={24} />
                             </div>
                             <div>
                                 <h4 className="text-xl font-black font-display text-white uppercase leading-none mb-1 tracking-widest">Select Your Fighter</h4>
                                 <div className="text-[9px] font-mono text-amber-400/60 tracking-[0.4em] uppercase font-black">Atom_Directory</div>
                             </div>
                        </div>

                        <div className="mb-10 group">
                            <input 
                                type="text" 
                                placeholder="SEARCH ATOMS..." 
                                autoFocus
                                className="w-full bg-black border-b border-slate-800 p-6 text-white font-mono text-sm focus:border-amber-500 outline-none transition-all placeholder-slate-800 uppercase tracking-widest font-black"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-4 custom-scrollbar">
                            {filteredAgents.map(a => (
                                <button 
                                    key={a.id}
                                    onClick={() => handleSelect(a)}
                                    className="w-full flex items-center justify-between p-5 bg-white/5 border border-slate-900 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group text-left clip-path-slant"
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="w-12 h-12 bg-black border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-amber-500/50 transition-all shadow-xl">
                                            {a.image ? <img src={a.image} className="w-full h-full object-cover grayscale group-hover:grayscale-0"/> : <div className="text-xs font-black text-slate-700">{a.label?.[0]}</div>}
                                        </div>
                                        <div>
                                            <div className="font-black text-sm text-white group-hover:text-amber-400 transition-colors uppercase leading-none mb-1.5 tracking-tight">{a.label}</div>
                                            <div className="text-[7px] text-slate-600 font-mono tracking-[0.2em] uppercase font-bold">UID: {a.id.slice(0,20)}...</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-black font-mono text-white group-hover:text-amber-400 leading-none mb-1">{calculateTrustScore(a.totalAssets || '0', a.totalShares || '0').toFixed(1)}</div>
                                        <div className="text-[7px] text-slate-700 font-mono uppercase font-black tracking-widest">MAGNITUDE</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        
                        <div className="mt-10 pt-8 border-t border-white/5 flex justify-center">
                            <button onClick={() => setIsSelectorOpen(null)} className="text-[10px] font-black font-mono text-slate-700 hover:text-amber-400 uppercase tracking-[0.6em] transition-colors">CANCEL</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Compare;