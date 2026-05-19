
import React from 'react';
import { Link } from 'react-router-dom';
import { Terminal, ShieldAlert, ZapOff, ArrowLeft, Radio, Network } from 'lucide-react';
import { playClick, playHover } from '../services/audio';

const ComingSoon: React.FC = () => {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 relative overflow-hidden font-mono">
      {/* HUD Background Decorations */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-intuition-primary/5 rounded-full blur-[120px] animate-pulse pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-2xl animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-[#050505] border-2 border-intuition-primary/40 p-12 md:p-16 flex flex-col items-center text-center clip-path-slant shadow-[0_0_100px_rgba(0,0,0,1)] relative overflow-hidden">
          
          {/* Animated Scanline Overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-10"></div>
          
          {/* Status Badge */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-intuition-secondary/10 border border-intuition-secondary px-6 py-1.5 text-xs font-semibold text-intuition-secondary rounded-lg">
            Not available
          </div>

          <div className="relative mb-12 mt-4">
            <div className="absolute -inset-8 bg-intuition-primary/20 blur-3xl rounded-full animate-pulse"></div>
            <div className="w-24 h-24 bg-black border-2 border-intuition-primary flex items-center justify-center text-intuition-primary shadow-glow-blue clip-path-slant transition-transform duration-1000 group-hover:rotate-12">
              <ZapOff size={48} className="animate-pulse" />
            </div>
          </div>

          <div className="mb-10 space-y-3 text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-white font-display tracking-tight leading-tight">
              Coming soon
            </h1>
            <p className="text-[15px] text-slate-400 font-sans leading-relaxed max-w-md mx-auto">
              This area isn&apos;t available yet. We&apos;re still wiring up on-chain creation flows for this build.
            </p>
          </div>

          <p className="text-sm text-slate-500 font-sans leading-relaxed max-w-md mb-12 mx-auto text-center">
            Check the next release for updates, or use Markets and Create from the main navigation.
          </p>

          <div className="w-full flex flex-col md:flex-row gap-4 relative z-20">
            <Link 
              to="/" 
              onClick={playClick}
              onMouseEnter={playHover}
              className="flex-1 bg-white/5 border border-white/10 hover:border-white text-white font-semibold py-4 text-sm flex items-center justify-center gap-3 transition-all rounded-xl"
            >
              <ArrowLeft size={16} /> Back home
            </Link>
            <Link 
              to="/markets" 
              onClick={playClick}
              onMouseEnter={playHover}
              className="flex-1 bg-intuition-primary hover:bg-white text-black font-semibold py-4 text-sm flex items-center justify-center gap-3 transition-all rounded-xl shadow-[0_0_24px_rgba(0,243,255,0.2)]"
            >
              <Network size={16} /> Browse markets
            </Link>
          </div>

          {/* HUD Tech Readout */}
          <div className="mt-12 flex items-center justify-center gap-8 border-t border-white/5 pt-8 w-full opacity-60 font-mono">
            <div className="flex flex-col items-center">
              <span className="text-[7px] text-slate-600 uppercase font-black tracking-widest mb-1">Module</span>
              <span className="text-[9px] font-black text-white uppercase tracking-widest">S05_CREATE</span>
            </div>
            <div className="w-px h-6 bg-white/10"></div>
            <div className="flex flex-col items-center">
              <span className="text-[7px] text-slate-600 uppercase font-black tracking-widest mb-1">Handshake</span>
              <span className="text-[9px] font-semibold text-intuition-secondary tracking-wide">Coming soon</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 text-slate-700 text-[8px] font-black uppercase tracking-[0.4em] opacity-40">
          <Terminal size={10} />
          SYSTEM_VERSION_1.4.0_STABLE // SECTOR_04_ARES
        </div>
      </div>
    </div>
  );
};

export default ComingSoon;
