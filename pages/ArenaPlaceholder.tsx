import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy, ArrowLeft, Sparkles, Swords } from 'lucide-react';
import { playArenaUiClick, playArenaUiHover } from '../services/audio';

/**
 * Shown at `/climb` when the full Arena is not displayed:
 * - `VITE_ARENA_ENABLED` is not `true`, or
 * - `VITE_ARENA_PLACEHOLDER=true` (mask WIP; route and nav still point here).
 */
const ArenaPlaceholder: React.FC = () => {
  return (
    <div className="relative min-h-[calc(100dvh-5rem)] flex flex-col items-center justify-center px-4 py-12 md:py-20 overflow-x-hidden font-mono w-full isolate">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[#030508]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,80,57,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,80,57,0.35) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 75%)',
        }}
      />

      <div className="relative z-10 w-full flex flex-col items-center justify-center min-h-[inherit]">
      <div className="relative w-full max-w-xl animate-in fade-in zoom-in-95 duration-500">
        <div className="rounded-3xl border-2 border-cyan-500/35 bg-gradient-to-b from-[#0a1018] via-[#060a10] to-[#0c0614] p-10 md:p-14 text-center shadow-[0_0_80px_rgba(34,211,238,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/5">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.35em] text-amber-200/95 mb-8">
            <Sparkles size={12} className="text-amber-300" />
            Coming soon
          </div>

          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-cyan-400/40 bg-gradient-to-br from-cyan-500/20 to-fuchsia-600/15 shadow-[0_0_40px_rgba(34,211,238,0.25)]">
            <Trophy size={40} className="text-cyan-200 drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]" />
          </div>

          <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight text-white mb-3">
            The Arena
          </h1>
          <p className="text-sm md:text-[15px] text-slate-400 leading-relaxed mb-2 max-w-md mx-auto">
            Stance grid, arena points, and leaderboards are finishing deployment. Check back after the next release — or explore markets and skill agent in the meantime.
          </p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 mb-10 flex items-center justify-center gap-2">
            <Swords size={12} className="text-fuchsia-400/80" />
            Masked for this build · route preserved
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              onClick={playArenaUiClick}
              onMouseEnter={playArenaUiHover}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-600 bg-slate-950/80 px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
              Home
            </Link>
            <Link
              to="/markets"
              onClick={playArenaUiClick}
              onMouseEnter={playArenaUiHover}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-cyan-500/50 bg-cyan-500/15 px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100 hover:bg-cyan-500/25 transition-colors shadow-[0_0_24px_rgba(34,211,238,0.15)]"
            >
              Markets
            </Link>
            <Link
              to="/skill-playground"
              onClick={playArenaUiClick}
              onMouseEnter={playArenaUiHover}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-fuchsia-500/35 bg-fuchsia-950/30 px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-200/90 hover:border-fuchsia-400/50 transition-colors"
            >
              Intuition Skill
            </Link>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ArenaPlaceholder;
