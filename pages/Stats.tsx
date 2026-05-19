/**
 * Leaderboard — Arena-only. Network-wide staking / PnL / entropy boards were removed per product scope.
 */
import React from 'react';
import { Crown } from 'lucide-react';
import IntuRankRankersLeaderboard from '../components/IntuRankRankersLeaderboard';

const Stats: React.FC = () => {
  return (
    <div className="min-h-screen pt-16 md:pt-20 pb-32 md:pb-40 relative overflow-x-hidden min-w-0 w-full bg-[#020308] font-mono selection:bg-intuition-primary selection:text-black">
      <div className="fixed inset-0 pointer-events-none z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-intuition-primary/5 rounded-full blur-[150px] animate-pulse pointer-events-none" />

      <div className="w-full max-w-[min(1680px,calc(100vw-32px))] mx-auto px-4 sm:px-6 relative z-10 min-w-0 pb-8">
        <header className="mb-10 md:mb-12 flex flex-col gap-4 border-b border-slate-800/90 pb-6 md:pb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-intuition-primary">IntuRank</p>
              <h1 className="text-left text-3xl sm:text-4xl md:text-5xl font-black font-display tracking-[0.08em] text-white uppercase leading-none flex flex-wrap items-center gap-3">
                <Crown className="h-9 w-9 sm:h-11 sm:w-11 text-amber-300 shrink-0" strokeWidth={2} aria-hidden />
                Arena leaderboard
              </h1>
              <p className="max-w-2xl text-[13px] leading-relaxed text-slate-400 font-sans font-medium normal-case tracking-normal">
                Live rankers, Arena XP, and list coverage from the Arena flow — not a general Intuition network leaderboard.
              </p>
            </div>
          </div>
        </header>

        <div className="relative z-10 w-full animate-in fade-in duration-500">
          <IntuRankRankersLeaderboard />
        </div>
      </div>
    </div>
  );
};

export default Stats;
