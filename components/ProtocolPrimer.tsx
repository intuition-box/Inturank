
import React, { useState } from 'react';
import { X, BookOpen, Database, Network, TrendingUp, Info, ArrowRight, Zap, Shield, Cpu, Activity, ChevronRight } from 'lucide-react';
import { playClick, playHover } from '../services/audio';

interface ProtocolPrimerProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrimerSection = ({ title, icon: Icon, color, children, delay }: any) => (
    <div 
        className="animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both"
        style={{ animationDelay: `${delay}ms` }}
    >
        <div className="flex items-center gap-4 mb-4">
            <div className={`p-2.5 bg-black border-2 border-${color}/40 rounded-none clip-path-slant text-${color} shadow-[0_0_15px_rgba(var(--${color}-rgb),0.3)]`}>
                <Icon size={20} />
            </div>
            <h3 className="text-xl font-black font-display text-white uppercase tracking-tight">{title}</h3>
        </div>
        <div className="pl-14">
            <div className="p-6 bg-white/[0.02] border border-white/5 clip-path-slant relative group hover:border-white/20 transition-all">
                <div className={`absolute left-0 top-0 bottom-0 w-1 bg-${color} opacity-40`}></div>
                <p className="text-sm font-mono text-slate-400 leading-relaxed uppercase tracking-tight group-hover:text-slate-200 transition-colors">
                    {children}
                </p>
            </div>
        </div>
    </div>
);

const ProtocolPrimer: React.FC<ProtocolPrimerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/98 backdrop-blur-2xl animate-in fade-in duration-300 font-mono">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none"></div>
      
      <div className="relative w-full max-w-4xl bg-[#02040a] border-2 border-intuition-primary/30 shadow-[0_0_100px_rgba(0,0,0,1)] clip-path-slant overflow-hidden flex flex-col max-h-[90vh]">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none"></div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-10 py-8 border-b border-white/5 bg-black/40">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-black border-2 border-intuition-primary flex items-center justify-center text-intuition-primary clip-path-slant shadow-glow-blue animate-pulse">
                <BookOpen size={28} />
            </div>
            <div>
                <h2 className="text-3xl font-black font-display text-white tracking-tighter uppercase text-glow-white leading-none mb-1">
                    Protocol_Primer
                </h2>
                <div className="text-[10px] font-mono text-intuition-primary/60 tracking-[0.5em] uppercase font-black flex items-center gap-2">
                    <Activity size={12} /> Deciphering_Semantic_Capitalism
                </div>
            </div>
          </div>
          <button 
            onClick={() => { playClick(); onClose(); }} 
            onMouseEnter={playHover}
            className="w-12 h-12 flex items-center justify-center border-2 border-slate-800 text-slate-500 hover:text-white hover:border-white transition-all clip-path-slant"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar relative z-10">
            
            <div className="max-w-2xl">
                <p className="text-slate-500 text-xs font-black uppercase tracking-widest leading-relaxed">
                    {" >> "} Welcome, Architect. IntuRank is more than a market, it is a semantic intelligence layer. To navigate this sector effectively, you must understand the primitives of the trust graph.
                </p>
            </div>

            <PrimerSection title="Semantic_Atoms" icon={Database} color="intuition-primary" delay={100}>
                Every unique identity, project, or concept is anchored as an <strong>Atom</strong>. They are the base primitives of the network. When you view a market, you are looking at the collective valuation of that specific Atom's reputation.
            </PrimerSection>

            <PrimerSection title="Logic_Triples" icon={Network} color="intuition-secondary" delay={200}>
                Claims are structured as <strong>Triples</strong> (Subject → Predicate → Object). For example: (Vitalik) [is] (Trustworthy). By staking on a Triple, you are signaling your conviction in that specific semantic relationship.
            </PrimerSection>

            <PrimerSection title="Bonding_Curves" icon={TrendingUp} color="intuition-success" delay={300}>
                The protocol utilizes two dominant bonding curve types to facilitate different valuation needs:
                <br /><br />
                • <strong>Offset Progressive:</strong> Used for emerging identities and speculative claims. It features exponential price scaling to reward early signals and penalize deceptive mass-coordination.
                <br /><br />
                • <strong>Linear:</strong> Used for utility-focused atoms and organizational structures. It provides stable, predictable valuation scaling as participation increases.
            </PrimerSection>

            <div className="p-8 bg-black/60 border-2 border-intuition-primary/20 clip-path-slant mt-8 group hover:border-intuition-primary/40 transition-all">
                <h4 className="text-[10px] font-black text-white uppercase tracking-[0.4em] mb-6 flex items-center gap-3">
                    <Zap size={14} className="text-intuition-primary animate-pulse" /> Why_Price_Fluctuates?
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-mono">
                    <div className="space-y-4">
                        <div className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-2">
                            <ChevronRight size={10} className="text-intuition-primary" /> Staking_Ingress
                        </div>
                        <p className="text-[11px] text-slate-400 uppercase leading-relaxed tracking-tight">
                            When you stake ₸, you mint new portal shares. This pushes the node further up the active bonding curve, raising the "Spot Price" for all subsequent participants.
                        </p>
                    </div>
                    <div className="space-y-4">
                        <div className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-2">
                            <ChevronRight size={10} className="text-intuition-secondary" /> Liquidity_Exit
                        </div>
                        <p className="text-[11px] text-slate-400 uppercase leading-relaxed tracking-tight">
                            Liquidating shares burns them back into ₸ assets. This moves the node down the curve, lowering the price and extracting value from the consensus pool.
                        </p>
                    </div>
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-8 bg-black/80 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
                <div className="w-2.5 h-2.5 rounded-full bg-intuition-primary animate-pulse shadow-glow-blue"></div>
                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Protocol_Version: 1.4.0_Stable</span>
            </div>
            <button 
                onClick={() => { playClick(); onClose(); }}
                className="w-full md:w-auto px-10 py-4 bg-white text-black font-black font-display text-[10px] tracking-[0.3em] uppercase clip-path-slant hover:bg-intuition-primary transition-all shadow-xl active:scale-95"
            >
                Acknowledge_Sync <ArrowRight size={14} className="inline ml-2" />
            </button>
        </div>
      </div>
    </div>
  );
};

export default ProtocolPrimer;
