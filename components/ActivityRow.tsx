import React from 'react';
import { Link } from 'react-router-dom';
import { User, ExternalLink, Activity as PulseIcon, Box, Zap, AlertCircle, Fingerprint, Network, Database, TrendingUp, TrendingDown, Crown } from 'lucide-react';
import { formatEther } from 'viem';
import { EXPLORER_URL } from '../constants';
import { CurrencySymbol } from './CurrencySymbol';
import { playClick, playHover } from '../services/audio';
import { formatMarketValue, safeParseUnits } from '../services/analytics';

interface ActivityRowProps {
    event: {
        id: string;
        type: string;
        timestamp: number;
        sender: any;
        target: any;
        assets: string;
        shares: string;
        curveId: string;
    };
}

const formatRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
};

const ActivityRow: React.FC<ActivityRowProps> = ({ event }) => {
    const isDeposit = event.type === 'Deposited';
    const isRedeem = event.type === 'Redeemed';
    const isAtomCreation = event.type === 'AtomCreated';
    const isTripleCreation = event.type === 'TripleCreated';
    
    const assetsNum = safeParseUnits(event.assets || '0');
    const isWhale = assetsNum > 50; 
    
    const curveLabel = event.curveId === '1' ? 'Linear' : 'Exponential';
    const isOpposing = event.target?.label?.includes('OPPOSING');

    let colorHex = '#00f3ff';
    let statusLabel = 'Activity';
    let Icon = PulseIcon;
    let glowIntensity = isWhale ? '0 0 30px' : '0 0 15px';

    if (isDeposit) {
        if (isOpposing) {
            colorHex = '#ff0055';
            statusLabel = 'Opposing';
            Icon = TrendingDown;
        } else {
            colorHex = '#00f3ff';
            statusLabel = 'Bought';
            Icon = TrendingUp;
        }
    } else if (isRedeem) {
        colorHex = '#ff0055';
        statusLabel = 'Sold';
        Icon = AlertCircle;
    } else if (isAtomCreation) {
        colorHex = '#ffbd2e';
        statusLabel = 'New atom';
        Icon = Database;
    } else if (isTripleCreation) {
        colorHex = '#bd00ff';
        statusLabel = 'New claim';
        Icon = Network;
    }

    const cardStyle = {
        borderColor: `${colorHex}44`,
        boxShadow: `${glowIntensity} ${colorHex}11`,
    } as React.CSSProperties;

    return (
        <div 
            className={`group flex flex-col md:flex-row items-center gap-2 sm:gap-2.5 p-2.5 sm:p-3 border border-white/[0.12] bg-[#05070c]/95 backdrop-blur-sm transition-all duration-500 relative overflow-hidden mb-2 rounded-2xl hover:border-white/25 overflow-x-auto min-w-0 ring-1 ring-black/30 ${isWhale ? 'animate-pulse' : ''}`}
            style={cardStyle}
            onMouseEnter={playHover}
        >
            {/* Edge Lighting (Top 1px high-intensity line) */}
            <div 
                className="absolute top-0 left-0 w-full h-[1px] opacity-30 group-hover:opacity-100 transition-opacity duration-700"
                style={{ backgroundColor: colorHex, boxShadow: `0 0 10px ${colorHex}` }}
            ></div>

            {/* Neural Static / CRT Grid Texture */}
            <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none z-0"
                style={{ 
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
                    backgroundSize: '4px 4px'
                }}
            ></div>

            {/* Chroma Bloom Background */}
            <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-[0.07] transition-opacity duration-1000 pointer-events-none"
                style={{ background: `radial-gradient(circle at center, ${colorHex}, transparent 80%)` }}
            ></div>

            {/* Identity Segment */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0 md:min-w-[150px] relative z-10">
                <Link to={`/profile/${event.sender?.id}`} className="relative group/avatar shrink-0">
                    <div 
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-black/80 border flex items-center justify-center transition-all group-hover:scale-[1.02] relative overflow-hidden shadow-md shrink-0"
                        style={{ borderColor: `${colorHex}66` }}
                    >
                        {event.sender?.image ? (
                            <img src={event.sender.image} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" alt="" />
                        ) : (
                            <User size={18} className="text-slate-800" />
                        )}
                        {/* Overlay scanline on avatar */}
                        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.4)_50%)] bg-[length:100%_2px] opacity-20"></div>
                    </div>
                    {isWhale && (
                        <div 
                            className="absolute -top-0.5 -right-0.5 bg-white text-black p-[1px] rounded-full z-20 shadow border border-black/50"
                            style={{ boxShadow: `0 0 8px white` }}
                        >
                            <Crown size={8} />
                        </div>
                    )}
                </Link>
                <div className="flex flex-col min-w-0 gap-0.5">
                    <div className="flex items-center gap-1">
                        <Fingerprint size={9} style={{ color: colorHex }} className="shrink-0" />
                        <span className="text-[9px] font-medium font-sans text-slate-500 leading-none">From</span>
                    </div>
                    <Link to={`/profile/${event.sender?.id}`} className="text-[10px] sm:text-[11px] font-semibold text-white hover:text-intuition-primary transition-colors truncate max-w-[120px] sm:max-w-[140px] font-sans leading-tight">
                        {event.sender?.label || `${event.sender?.id?.slice(0, 8)}...`}
                    </Link>
                </div>
            </div>

            {/* Narrative Segment */}
            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] relative z-10 py-0.5">
                <div 
                    className={`px-2 py-0.5 rounded-md border text-[9px] sm:text-[10px] font-semibold font-sans leading-tight transition-all duration-300`}
                    style={{ 
                        backgroundColor: `${colorHex}12`, 
                        borderColor: `${colorHex}55`,
                        color: colorHex,
                    }}
                >
                    {isWhale ? `Large · ${statusLabel}` : statusLabel}
                </div>
                
                {!(isAtomCreation || isTripleCreation) && (
                    <div className="flex items-baseline gap-1">
                        <span className={`font-bold text-base sm:text-lg tabular-nums tracking-tight text-white transition-transform duration-700 ${isWhale ? 'scale-105' : ''}`}>
                            {formatMarketValue(assetsNum)}
                        </span>
                        <CurrencySymbol size="sm" className="font-bold" style={{ color: `${colorHex}88` }} />
                    </div>
                )}

                <span className="text-slate-600 font-sans text-[10px] px-0.5" aria-hidden>·</span>

                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] px-2 py-1.5 rounded-xl hover:border-white/15 transition-all duration-300 group/target cursor-pointer min-w-0 max-w-full">
                    <div className="w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-md bg-black/50 flex items-center justify-center overflow-hidden border border-white/10 shrink-0 group-hover:scale-105 transition-transform">
                        {event.target?.image ? (
                            <img src={event.target.image} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <Box size={10} className="text-slate-700" />
                        )}
                    </div>
                    <Link to={`/markets/${event.target?.id}`} className="text-white font-medium font-sans hover:text-intuition-primary transition-colors truncate max-w-[140px] sm:max-w-[200px] text-[10px] sm:text-[11px] leading-snug group-hover:text-intuition-primary/95">
                        {event.target?.label}
                    </Link>
                </div>
            </div>

            {/* Metadata Badges */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 relative z-10">
                <div 
                    className={`px-2 py-1 rounded-lg border text-[9px] font-medium font-sans flex items-center gap-1 transition-all duration-300 overflow-hidden group/badge leading-tight`}
                    style={{ 
                        backgroundColor: `${colorHex}08`, 
                        borderColor: `${colorHex}33`,
                        color: colorHex
                    }}
                >
                    <Icon size={10} className="shrink-0 opacity-90" />
                    {isWhale ? 'Large trade' : isOpposing ? 'Opposing' : isDeposit ? 'Support' : isAtomCreation ? 'New atom' : 'New link'}
                    {/* Tiny shimmer line inside badge */}
                    <div className="absolute inset-0 w-1/2 h-full bg-white opacity-[0.03] skew-x-[-20deg] -translate-x-full group-hover/badge:translate-x-[200%] transition-transform duration-[1500ms]"></div>
                </div>
                <div className="flex flex-col items-end gap-0">
                    <div className="text-[8px] font-sans text-slate-500 leading-none mb-0.5">Curve</div>
                    <div 
                        className="px-1.5 py-0.5 rounded-md bg-black/50 border text-[9px] font-medium font-sans leading-none"
                        style={{ borderColor: `${colorHex}44`, color: colorHex }}
                    >
                        {curveLabel}
                    </div>
                </div>
            </div>

            {/* Time & Explorer */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0 md:min-w-[108px] justify-end relative z-10 border-l border-white/10 pl-2 sm:pl-3 md:pl-4">
                <div className="text-right">
                    <div className="text-[8px] font-sans text-slate-500 leading-none mb-0.5">When</div>
                    <span className="text-[10px] sm:text-[11px] font-medium font-sans text-slate-300 group-hover:text-white transition-colors tabular-nums">
                        {formatRelativeTime(event.timestamp)}
                    </span>
                </div>
                <a 
                    href={`${EXPLORER_URL}/tx/${event.id}`} 
                    target="_blank" 
                    rel="noreferrer"
                    title="View transaction"
                    onClick={(e) => { e.stopPropagation(); playClick(); }}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/[0.04] border transition-all duration-300 flex items-center justify-center shrink-0 group/link hover:bg-white/[0.08]"
                    style={{ borderColor: `${colorHex}44`, color: colorHex }}
                >
                    <ExternalLink size={14} className="group-hover/link:scale-105 transition-all" />
                </a>
            </div>
        </div>
    );
};

export default ActivityRow;