/**
 * Gamified badges section ,  shows user's leaderboard ranks and badge tier
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Crown, Medal, Award, Trophy, BarChart2 } from 'lucide-react';
import { useUserBadges } from '../hooks/useUserBadges';
import { BADGE_NAMES, type BadgeTier } from '../services/badges';
import { playClick, playHover } from '../services/audio';

interface BadgesSectionProps {
  address: string;
  compact?: boolean;
}

const BADGE_ICONS: Record<BadgeTier, React.ReactNode> = {
  apex: <Crown size={20} />,
  elite: <Medal size={20} />,
  rising: <Medal size={20} />,
  scout: <Award size={20} />,
};

const BADGE_CARD_STYLES: Record<BadgeTier, string> = {
  apex: 'from-amber-400/30 to-amber-600/20 border-amber-400/60 text-amber-300',
  elite: 'from-slate-300/25 to-slate-500/15 border-slate-400/50 text-slate-200',
  rising: 'from-amber-700/25 to-amber-900/15 border-amber-600/50 text-amber-200',
  scout: 'from-slate-600/20 to-slate-800/10 border-slate-500/40 text-slate-400',
};

const BadgesSection: React.FC<BadgesSectionProps> = ({ address, compact }) => {
  const { badges, loading } = useUserBadges(address);

  if (loading && !badges) {
    return (
      <div className="bg-black border border-slate-800 p-8 clip-path-slant animate-pulse">
        <div className="h-6 bg-slate-800 rounded w-32 mb-4" />
        <div className="h-20 bg-slate-800/60 rounded" />
      </div>
    );
  }

  const tier = badges?.bestTier ?? 'scout';
  const ranks = badges?.ranks ?? [];

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border bg-gradient-to-br ${BADGE_CARD_STYLES[tier]}`}>
        {BADGE_ICONS[tier]}
        <span className="font-black text-sm uppercase tracking-wider">{BADGE_NAMES[tier]}</span>
      </div>
    );
  }

  return (
    <div className="bg-black border border-slate-900 p-8 clip-path-slant group hover:border-intuition-primary/40 transition-all shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
        <Trophy size={80} />
      </div>
      <div className="text-[9px] font-black font-mono text-slate-600 uppercase mb-4 tracking-[0.3em] flex items-center gap-3">
        <Trophy size={14} className="text-amber-400" /> Badges & Ranks
      </div>
      <div className="flex flex-col gap-4">
        <div className={`inline-flex items-center gap-3 px-4 py-3 rounded-xl border w-fit bg-gradient-to-br ${BADGE_CARD_STYLES[tier]}`}>
          {BADGE_ICONS[tier]}
          <div>
            <div className="font-black text-lg uppercase tracking-wider">{BADGE_NAMES[tier]}</div>
            <div className="text-[10px] opacity-80">Current tier</div>
          </div>
        </div>
        {ranks.length > 0 && (
          <div className="space-y-2">
            <div className="text-[9px] font-black font-mono text-slate-500 uppercase tracking-wider">Leaderboards</div>
            {ranks.map((r) => (
              <div key={r.leaderboard} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-300 text-sm font-medium">{r.leaderboard}</span>
                <span className={`font-black text-sm px-2 py-0.5 rounded border ${
                  r.tier === 'apex' ? 'bg-amber-500/20 border-amber-400/50 text-amber-300' :
                  r.tier === 'elite' ? 'bg-slate-400/20 border-slate-400/50 text-slate-200' :
                  r.tier === 'rising' ? 'bg-amber-600/20 border-amber-600/50 text-amber-200' :
                  'bg-slate-600/20 border-slate-500/50 text-slate-400'
                }`}>
                  #{r.rank}
                </span>
              </div>
            ))}
          </div>
        )}
        <Link
          to="/stats"
          onClick={playClick}
          onMouseEnter={playHover}
          className="inline-flex items-center gap-2 text-intuition-primary text-xs font-black uppercase tracking-wider hover:underline"
        >
          <BarChart2 size={14} /> View all leaderboards
        </Link>
      </div>
    </div>
  );
};

export default BadgesSection;
