import React from 'react';
import { X } from 'lucide-react';
import { playClick, playHover } from '../services/audio';

interface BondingCurvesInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const BondingCurvesInfoPanel: React.FC<BondingCurvesInfoPanelProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[180] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => { playClick(); onClose(); }}
        aria-hidden="true"
      />
      <div
        className="fixed top-0 right-0 bottom-0 z-[190] w-full max-w-lg bg-[#02040a] border-l-2 border-intuition-primary/30 shadow-[-20px_0_60px_rgba(0,0,0,0.8)] flex flex-col animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-labelledby="bonding-curves-title"
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
          <h2 id="bonding-curves-title" className="text-lg font-black font-mono text-white uppercase tracking-wider">
            How Bonding Curves Work
          </h2>
          <button
            type="button"
            onClick={() => { playClick(); onClose(); }}
            onMouseEnter={playHover}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors rounded"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-10">
          <p className="text-sm font-mono text-slate-400 leading-relaxed">
            Intuition uses bonding curves to automatically set identity and claim prices based on supply and demand, rewarding early curation of valuable information.
          </p>

          {/* Linear Curve */}
          <section>
            <h3 className="text-sm font-black text-intuition-primary uppercase tracking-widest mb-3">Linear Curve</h3>
            <div className="bg-black/60 border border-white/10 rounded p-4 mb-4">
              <div className="h-32 flex items-end justify-between gap-1 px-2">
                {[0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-cyan-500/50 rounded-t transition-all"
                    style={{ height: `${h * 40}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                <span>Shares</span>
                <span className="text-cyan-400">Price</span>
              </div>
            </div>
            <p className="text-xs font-mono text-slate-300 leading-relaxed mb-2">
              The Linear curve keeps pricing stable with gradual increases, your stake value increases or decreases proportionally as more people stake or redeem, making it predictable and lower-risk.
            </p>
            <p className="text-xs font-mono text-slate-500 leading-relaxed">
              In other words, minus the fees, you will get back your original deposit value, plus your portion of the fees collected.
            </p>
          </section>

          {/* Exponential Curve */}
          <section>
            <h3 className="text-sm font-black text-rose-400 uppercase tracking-widest mb-3">Exponential Curve</h3>
            <div className="bg-black/60 border border-white/10 rounded p-4 mb-4">
              <div className="h-32 flex items-end justify-between gap-1 px-2">
                {[0.05, 0.1, 0.2, 0.35, 0.55, 0.85, 1.25, 1.7, 2.2, 2.8].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-rose-500/50 rounded-t transition-all"
                    style={{ height: `${Math.min(h * 35, 100)}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                <span>Shares</span>
                <span className="text-rose-400">Price</span>
              </div>
            </div>
            <p className="text-xs font-mono text-slate-300 leading-relaxed mb-2">
              The Exponential curve (Offset Progressive) rewards early stakers significantly more, as each new deposit increases the share price at an increasing rate, creating higher potential returns for curators who stake earliest, but greater potential losses as stakers redeem.
            </p>
            <p className="text-xs font-mono text-slate-300 leading-relaxed mb-2">
              Choose based on your risk tolerance and timing.
            </p>
            <p className="text-xs font-mono text-slate-500 leading-relaxed">
              It&apos;s riskier but can yield higher returns; however, if you deposit later, you will pay more for the same amount of shares.
            </p>
          </section>
        </div>
      </div>
    </>
  );
};

export default BondingCurvesInfoPanel;
