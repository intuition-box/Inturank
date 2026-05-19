/**
 * MobileHome — purpose-built mobile landing.
 * Loads only on mobile viewports; the full desktop `Home` page stays untouched.
 *
 * Visual language: layered glass cards, bold gradients, generous radii,
 * and a hierarchy that fits a thumb's reach (hero → actions → pulse → discovery).
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import {
  TrendingUp,
  Activity,
  Send,
  Cpu,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  BarChart2,
  Wallet,
  Plus,
  Trophy,
} from 'lucide-react';
import { getNetworkStats } from '../services/graphql';
import { fetchArenaXpRecordForWallet } from '../services/arenaXp';
import { getProtocolXpTotal, PROTOCOL_XP_UPDATED_EVENT } from '../services/protocolXp';
import { formatMarketValue, safeWeiToEther } from '../services/analytics';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { HomeWelcomeStrip } from '../components/HomeWelcomeStrip';
import { HomeGameBoard } from '../components/HomeGameBoard';
import { HomeArenaEntryEffects } from '../components/HomeArenaEntryEffects';
import { playClick, playHover } from '../services/audio';
import { DEFAULT_PROFILE_AVATAR_URL } from '../constants';

interface NetworkStats {
  tvl: string;
  atoms: number;
  signals: number;
  positions: number;
}

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function compact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

const QuickActions: Array<{
  to: string;
  label: string;
  icon: React.ReactNode;
  ring: string;
  bg: string;
  fg: string;
}> = [
  {
    to: '/climb',
    label: 'Arena',
    icon: <Activity size={20} strokeWidth={2.4} />,
    ring: 'border-intuition-secondary/40',
    bg: 'bg-intuition-secondary/10',
    fg: 'text-intuition-secondary',
  },
  {
    to: '/markets',
    label: 'Markets',
    icon: <TrendingUp size={20} strokeWidth={2.4} />,
    ring: 'border-intuition-primary/40',
    bg: 'bg-intuition-primary/10',
    fg: 'text-intuition-primary',
  },
  {
    to: '/send-trust',
    label: 'Send ₸',
    icon: <Send size={20} strokeWidth={2.4} />,
    ring: 'border-intuition-warning/40',
    bg: 'bg-intuition-warning/10',
    fg: 'text-intuition-warning',
  },
  {
    to: '/documentation',
    label: 'Docs',
    icon: <Cpu size={20} strokeWidth={2.4} />,
    ring: 'border-intuition-purple/40',
    bg: 'bg-intuition-purple/10',
    fg: 'text-intuition-purple',
  },
];

const MobileHome: React.FC = () => {
  const { address: walletAddress, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [arenaSelf, setArenaSelf] = useState({ xp: 0, duels: 0 });
  const [, setProtocolXpTick] = useState(0);

  useEffect(() => {
    const onProto = () => setProtocolXpTick((n) => n + 1);
    window.addEventListener(PROTOCOL_XP_UPDATED_EVENT, onProto);
    return () => window.removeEventListener(PROTOCOL_XP_UPDATED_EVENT, onProto);
  }, []);

  const activityXp = walletAddress ? getProtocolXpTotal(walletAddress) : 0;
  useEffect(() => {
    if (!walletAddress) {
      setArenaSelf({ xp: 0, duels: 0 });
      return;
    }
    let cancelled = false;
    fetchArenaXpRecordForWallet(walletAddress)
      .then((rec) => {
        if (!cancelled) setArenaSelf({ xp: rec.xp, duels: rec.duels });
      })
      .catch(() => {
        if (!cancelled) setArenaSelf({ xp: 0, duels: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  useEffect(() => {
    let cancelled = false;
    getNetworkStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const tvlEther = stats ? safeWeiToEther(stats.tvl) : 0;
  const atoms = stats?.atoms ?? 0;
  const signals = stats?.signals ?? 0;

  return (
    <div className="w-full min-w-0 px-4 pt-3 pb-36 space-y-8 text-slate-200 max-[380px]:px-3">
      <HomeArenaEntryEffects />
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[2rem] p-5 pb-6 border border-white/[0.1] bg-[#05070c] shadow-[0_18px_60px_rgba(0,243,255,0.1),inset_0_1px_0_rgba(255,255,255,0.05)]">
        {/* glow accents */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-intuition-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-intuition-secondary/20 blur-3xl"
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-mono tracking-[0.32em] uppercase text-intuition-primary/80 font-black">
              {isConnected ? 'Welcome back' : 'Welcome'}
            </p>
            <h1 className="mt-1 text-2xl font-display font-black text-white tracking-tight leading-none">
              {isConnected ? 'Ranker' : 'IntuRank'}
              <span className="text-intuition-primary">.</span>
            </h1>
            <p className="mt-1.5 text-[12px] text-slate-400 font-mono">
              {isConnected ? shortAddr(walletAddress ?? '') : 'Trust intelligence layer'}
            </p>
          </div>
          {isConnected && (
            <div className="shrink-0 h-12 w-12 rounded-2xl border border-white/10 overflow-hidden bg-black/30 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
              {walletAddress ? (
                <img
                  src={DEFAULT_PROFILE_AVATAR_URL}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : null}
            </div>
          )}
        </div>

        <div className="relative mt-5 rounded-2xl border border-white/8 bg-black/35 backdrop-blur-md p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-mono tracking-[0.28em] uppercase text-slate-400 font-black">
                Your XP
              </p>
              <div
                className="mt-1 flex items-baseline gap-2"
                title={`Arena ${arenaSelf.xp.toLocaleString()} · Activity ${activityXp.toLocaleString()} (this browser)`}
              >
                <span className="text-3xl font-display font-black text-white leading-none tracking-tight">
                  {compact(arenaSelf.xp + activityXp)}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  · {compact(arenaSelf.duels)} duels
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {isConnected
                  ? 'Arena from the graph · activity from trades & creates on this device.'
                  : 'Connect to start earning XP.'}
              </p>
            </div>
            <Link
              to={isConnected ? '/climb' : '#'}
              onClick={(e) => {
                if (!isConnected) {
                  e.preventDefault();
                  openConnectModal?.();
                  return;
                }
                playClick();
              }}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-intuition-primary to-cyan-300 text-black text-[11px] font-mono font-black uppercase tracking-[0.16em] active:scale-95 transition-transform shadow-[0_10px_28px_rgba(0,243,255,0.35)]"
            >
              {isConnected ? (
                <>
                  Climb <ArrowUpRight size={14} strokeWidth={2.5} />
                </>
              ) : (
                <>
                  <Wallet size={14} /> Connect
                </>
              )}
            </Link>
          </div>
        </div>

        {/* network pulse — slightly larger tap/read zones */}
        <div className="relative mt-5 grid grid-cols-3 gap-2.5 sm:gap-3">
          <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-3.5 sm:px-3">
            <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-slate-500 font-black truncate">
              TVL
            </p>
            <p className="mt-1.5 text-[15px] sm:text-base font-display font-black text-white leading-none truncate">
              <CurrencySymbol size="sm" leading className="shrink-0" />
              {formatMarketValue(tvlEther)}
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-3.5 sm:px-3">
            <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-slate-500 font-black truncate">
              Atoms
            </p>
            <p className="mt-1.5 text-[15px] sm:text-base font-display font-black text-intuition-primary leading-none truncate">
              {compact(atoms)}
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-3.5 sm:px-3">
            <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-slate-500 font-black truncate">
              Claims
            </p>
            <p className="mt-1.5 text-[15px] sm:text-base font-display font-black text-intuition-secondary leading-none truncate">
              {compact(signals)}
            </p>
          </div>
        </div>
      </section>

      {/* QUICK ACTIONS — 2×2 rows so tiles aren’t micro-columns */}
      <section aria-label="Quick actions">
        <div className="grid grid-cols-2 gap-3">
          {QuickActions.map((q) => (
            <Link
              key={q.label}
              to={q.to}
              onClick={() => playClick()}
              onMouseEnter={playHover}
              className="group flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 active:scale-[0.98] transition-transform"
            >
              <span
                className={`shrink-0 h-11 w-11 flex items-center justify-center rounded-xl border ${q.ring} ${q.bg} ${q.fg} shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`}
              >
                {q.icon}
              </span>
              <span className="min-w-0 text-left text-[11px] font-mono font-black uppercase tracking-[0.14em] text-slate-100 leading-tight">
                {q.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <HomeWelcomeStrip variant="mobile" />

      <HomeGameBoard compact />

      {/* Activity · Portfolio · Create — one row, three columns */}
      <section className="grid grid-cols-3 gap-2 sm:gap-2.5">
        <Link
          to="/feed"
          onClick={() => playClick()}
          className="flex min-h-[8.5rem] flex-col items-center gap-2 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0d1422] to-[#08101c] p-2.5 pt-3 text-center active:scale-[0.99] transition-transform sm:p-3"
        >
          <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center border border-intuition-primary/35 bg-intuition-primary/10 text-intuition-primary">
            <Sparkles size={16} strokeWidth={2.4} />
          </div>
          <span className="text-[11px] font-display font-black text-white leading-tight sm:text-[12px]">Activity</span>
          <span className="hidden text-[9px] leading-snug text-slate-500 min-[360px]:line-clamp-2 min-[360px]:block">
            Live atoms, claims, and stakes.
          </span>
          <span className="mt-auto inline-flex items-center gap-0.5 text-[9px] font-mono font-black uppercase tracking-[0.12em] text-intuition-primary">
            Feed <ArrowRight size={10} />
          </span>
        </Link>
        <Link
          to="/portfolio"
          onClick={() => playClick()}
          className="flex min-h-[8.5rem] flex-col items-center gap-2 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#1a0a1c] to-[#0a0610] p-2.5 pt-3 text-center active:scale-[0.99] transition-transform sm:p-3"
        >
          <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center border border-intuition-secondary/35 bg-intuition-secondary/10 text-intuition-secondary">
            <BarChart2 size={16} strokeWidth={2.4} />
          </div>
          <span className="text-[11px] font-display font-black text-white leading-tight sm:text-[12px]">Portfolio</span>
          <span className="hidden text-[9px] leading-snug text-slate-500 min-[360px]:line-clamp-2 min-[360px]:block">
            Positions, PnL, reputation.
          </span>
          <span className="mt-auto inline-flex items-center gap-0.5 text-[9px] font-mono font-black uppercase tracking-[0.12em] text-intuition-secondary">
            Open <ArrowRight size={10} />
          </span>
        </Link>
        <Link
          to="/create"
          onClick={() => playClick()}
          className="group relative flex min-h-[8.5rem] flex-col items-center gap-2 overflow-hidden rounded-2xl border border-intuition-primary/25 bg-gradient-to-b from-[#001a26] via-[#0a0612] to-[#1a0617] p-2.5 pt-3 text-center shadow-[0_12px_32px_rgba(0,243,255,0.12)] active:scale-[0.99] transition-transform sm:p-3"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-intuition-secondary/10 to-transparent opacity-60"
          />
          <span className="relative h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-intuition-primary to-intuition-secondary text-black flex items-center justify-center shadow-[0_6px_16px_rgba(0,243,255,0.35)]">
            <Plus size={18} strokeWidth={2.6} />
          </span>
          <span className="relative text-[10px] font-display font-black uppercase tracking-[0.12em] text-white leading-tight sm:text-[11px] sm:tracking-[0.14em]">
            Create
          </span>
          <span className="relative hidden text-[9px] leading-snug text-slate-400 min-[360px]:line-clamp-2 min-[360px]:block">
            Atom or claim
          </span>
          <span className="relative mt-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-intuition-primary group-active:scale-95 transition-transform">
            <ArrowRight size={12} />
          </span>
        </Link>
      </section>

      {/* FOOTNOTE — extra air above dock */}
      <p className="text-center text-[10px] font-mono uppercase tracking-[0.28em] text-slate-600 pt-2 pb-1 flex items-center justify-center gap-2">
        <Trophy size={11} className="text-intuition-warning/70 shrink-0" /> IntuRank mobile · live
      </p>
    </div>
  );
};

export default MobileHome;
