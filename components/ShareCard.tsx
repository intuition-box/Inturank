import React, { useRef, useState } from 'react';
import { Download, Share2, Award, Copy, Twitter, Loader2, CheckCircle, Activity, Zap, Cpu, User } from 'lucide-react';
import html2canvas from 'html2canvas';
import { toast } from './Toast';
import Logo from './Logo';
import { CurrencySymbol } from './CurrencySymbol';

interface ShareCardProps {
  username: string;
  pnl: string;
  entryPrice: string;
  currentPrice: string;
  assetName: string;
  assetImage?: string;
  side: 'TRUST' | 'DISTRUST';
  themeColor?: string;
}

const ShareCard: React.FC<ShareCardProps> = ({
  username,
  pnl,
  entryPrice,
  currentPrice,
  assetName,
  assetImage,
  side,
  themeColor = '#00f3ff' // Default to Intuition Primary
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const isPositive = parseFloat(pnl) >= 0;

  const handleShareToX = () => {
    const text = `🚀 I just realized ${pnl}% PnL on ${assetName} using @IntuRank!\n\n📈 Entry: ${entryPrice}\n📉 Exit: ${currentPrice}\n\nTrade Reputation on @IntuitionSys. #SemanticCapitalism`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleSave = async () => {
     if (!cardRef.current) return;
     setIsCapturing(true);
     try {
        const canvas = await html2canvas(cardRef.current, {
            backgroundColor: '#02040a',
            scale: 3, // Ultra-high resolution
            useCORS: true,
            logging: false,
            allowTaint: true,
        });
        const image = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.href = image;
        link.download = `inturank-pnl-${assetName.toLowerCase()}-${Date.now()}.png`;
        link.click();
        toast.success("Image saved");
     } catch (err) {
        console.error(err);
        toast.error("Couldn’t save image");
     } finally {
        setIsCapturing(false);
     }
  };

  // Neon style calculations
  const glowStyle = {
    boxShadow: `0 0 40px ${themeColor}33, inset 0 0 20px ${themeColor}1a`,
    borderColor: `${themeColor}cc`
  };

  return (
    <div className="flex flex-col gap-6 items-center w-full">
        {/* THE CARD ITSELF */}
        <div className="w-full max-w-sm mx-auto perspective-1000 group">
          <div 
            ref={cardRef} 
            className="relative bg-[#020308] border-2 p-8 rounded-[2rem] overflow-hidden transition-all duration-700"
            style={glowStyle}
          >
            {/* Ultra-high fidelity background layers */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] opacity-20 pointer-events-none"></div>
            <div 
              className="absolute inset-0 opacity-20 pointer-events-none transition-opacity duration-1000"
              style={{ background: `radial-gradient(circle at 50% 0%, ${themeColor}, transparent 70%)` }}
            ></div>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            
            {/* Animated Scanline overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.03] to-transparent h-1/2 -translate-y-full animate-[scanline_4s_linear_infinite] pointer-events-none"></div>

            {/* Header */}
            <div className="flex justify-between items-start mb-10 relative z-10">
                <div className="flex items-center gap-4">
                    <div 
                      className="w-14 h-14 bg-black border-2 flex items-center justify-center rounded-[1rem] transition-all duration-700 overflow-hidden shadow-2xl"
                      style={{ borderColor: `${themeColor}88`, boxShadow: `0 0 20px ${themeColor}44` }}
                    >
                        {assetImage ? (
                          <img src={assetImage} className="w-full h-full object-cover" crossOrigin="anonymous" alt="" />
                        ) : (
                          <Logo className="w-10 h-10" style={{ filter: `drop-shadow(0 0 5px ${themeColor})` }} />
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-white font-black font-display tracking-[0.15em] text-xl leading-none">INTU<span style={{ color: themeColor }}>RANK</span></h3>
                        </div>
                        <div className="text-[8px] font-mono text-slate-500 uppercase tracking-[0.4em] mt-1 font-black">Neural_Ledger_S04</div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[7px] font-black font-mono text-slate-500 uppercase tracking-widest mb-1">Authenticated_Trader</div>
                    <div 
                      className="text-white font-bold font-mono text-[10px] bg-black px-3 py-1.5 border rounded-lg"
                      style={{ borderColor: `${themeColor}44` }}
                    >
                        {username.slice(0, 6)}...{username.slice(-4)}
                    </div>
                </div>
            </div>

            {/* Main PnL Section */}
            <div 
              className="text-center py-8 border-y bg-white/[0.02] backdrop-blur-md mb-8 relative z-10 overflow-hidden rounded-2xl"
              style={{ borderColor: `${themeColor}22` }}
            >
                <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
                    <Activity size={80} style={{ color: themeColor }} />
                </div>
                <div className="text-[9px] font-black font-mono text-slate-400 mb-2 uppercase tracking-[0.5em]">Realized_Consensus_PnL</div>
                <div 
                  className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black font-display tracking-tighter transition-all duration-1000`}
                  style={{ 
                    color: isPositive ? '#00ff9d' : '#ff1e6d',
                    textShadow: `0 0 30px ${isPositive ? '#00ff9d66' : '#ff1e6d66'}` 
                  }}
                >
                    {isPositive ? '+' : ''}{pnl}%
                </div>
                <div 
                  className={`inline-flex items-center gap-2 mt-4 px-4 py-2 text-[9px] font-black uppercase tracking-[0.3em] border rounded-full transition-all`}
                  style={{ 
                    backgroundColor: side === 'TRUST' ? 'rgba(0,255,157,0.1)' : 'rgba(255,30,109,0.1)',
                    borderColor: side === 'TRUST' ? '#00ff9d44' : '#ff1e6d44',
                    color: side === 'TRUST' ? '#00ff9d' : '#ff1e6d'
                  }}
                >
                    <Zap size={10} /> {side}_STAKE_CLOSED
                </div>
            </div>

            {/* Trade Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 sm:gap-y-6 gap-x-4 sm:gap-x-10 mb-6 sm:mb-8 text-sm font-mono relative z-10">
                <div className="flex flex-col">
                    <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Asset_Identity</span>
                    <span className="text-white font-black truncate border-b border-white/10 pb-1.5 text-xs uppercase tracking-tight">{assetName}</span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Result_Status</span>
                    <span 
                      className="font-black pb-1.5 border-b border-white/10 text-xs tracking-widest"
                      style={{ color: isPositive ? '#00ff9d' : '#ff1e6d' }}
                    >{isPositive ? 'DOMINANT' : 'SUBORDINATE'}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Entry_Basis</span>
                    <span className="text-slate-300 font-bold text-xs tracking-tighter inline-flex items-baseline gap-0.5">{entryPrice} <CurrencySymbol size="sm" className="text-slate-600" /></span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Exit_Terminal</span>
                    <span className="text-white font-bold text-xs tracking-tighter inline-flex items-baseline gap-0.5">{currentPrice} <CurrencySymbol size="sm" className="text-slate-600" /></span>
                </div>
            </div>

            {/* Footer Watermark */}
            <div 
              className="flex justify-between items-center pt-6 border-t relative z-10 opacity-60"
              style={{ borderColor: `${themeColor}22` }}
            >
                <div className="flex items-center gap-2">
                    <Cpu size={10} style={{ color: themeColor }} />
                    <div className="text-[7px] font-black font-mono uppercase tracking-[0.4em]" style={{ color: themeColor }}>
                        VERIFIED_ON_INTURANK_PROTOCOL
                    </div>
                </div>
                <div className="text-[7px] font-black font-mono text-slate-600 uppercase tracking-widest">
                    {new Date().toLocaleDateString()} // SYNC_OK
                </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 w-full max-w-sm relative z-[110]">
            <button 
                onClick={handleShareToX} 
                className="flex-1 py-4 bg-white/5 border border-white/10 text-white font-black font-mono text-[9px] tracking-[0.3em] uppercase hover:bg-white hover:text-black transition-all rounded-2xl flex items-center justify-center gap-2.5 active:scale-95 shadow-2xl"
            >
                <Twitter size={14} /> Share_X
            </button>
            <button 
                onClick={handleSave} 
                disabled={isCapturing}
                className="flex-1 py-4 font-black font-mono text-[9px] tracking-[0.3em] uppercase rounded-2xl transition-all flex items-center justify-center gap-2.5 active:scale-95 shadow-2xl duration-700"
                style={{ 
                  backgroundColor: themeColor, 
                  color: '#000',
                  boxShadow: `0 0 30px ${themeColor}66`
                }}
            >
                {isCapturing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 
                {isCapturing ? 'Saving...' : 'Save_Frame'}
            </button>
        </div>
    </div>
  );
};

export default ShareCard;