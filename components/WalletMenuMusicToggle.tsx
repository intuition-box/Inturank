import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { playHover } from '../services/audio';
import { useArenaMusicPreference } from '../hooks/useArenaMusicPreference';

type Variant = 'desktop-wallet' | 'mobile-wallet' | 'sheet';

export interface WalletMenuMusicToggleProps {
  variant: Variant;
  /** Called after toggle (e.g. close dropdown). */
  onAfterToggle?: () => void;
}

/**
 * Persisted Arcade BGM for `/climb` ,  lives in wallet menus alongside copy / disconnect.
 */
export function WalletMenuMusicToggle({ variant, onAfterToggle }: WalletMenuMusicToggleProps): React.ReactElement {
  const { musicOn, toggleMusic } = useArenaMusicPreference();

  const hit = () => {
    toggleMusic();
    onAfterToggle?.();
  };

  if (variant === 'sheet') {
    return (
      <button
        type="button"
        onClick={hit}
        onMouseEnter={playHover}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] active:scale-[0.99] transition-transform"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {musicOn ? (
            <Volume2 size={16} className="shrink-0 text-intuition-primary" strokeWidth={2.25} aria-hidden />
          ) : (
            <VolumeX size={16} className="shrink-0 text-slate-500" strokeWidth={2.25} aria-hidden />
          )}
          <span className="text-left text-[13px] font-semibold text-slate-200">Arena music</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
            musicOn ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40' : 'bg-white/[0.08] text-slate-500'
          }`}
        >
          {musicOn ? 'On' : 'Off'}
        </span>
      </button>
    );
  }

  if (variant === 'mobile-wallet') {
    return (
      <button
        type="button"
        onClick={hit}
        onMouseEnter={playHover}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left border-t border-white/5 hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {musicOn ? (
            <Volume2 size={14} className="shrink-0 text-intuition-primary" aria-hidden />
          ) : (
            <VolumeX size={14} className="shrink-0 text-slate-500" aria-hidden />
          )}
          <span className="text-[11px] font-mono font-black tracking-[0.18em] uppercase text-slate-200 truncate">
            Arena music
          </span>
        </span>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
            musicOn ? 'text-cyan-200 bg-cyan-500/15 ring-1 ring-cyan-400/35' : 'text-slate-500 bg-white/5'
          }`}
        >
          {musicOn ? 'On' : 'Off'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={hit}
      onMouseEnter={playHover}
      className="w-full flex items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium font-sans text-slate-300 hover:bg-white/5 hover:text-intuition-primary transition-colors border-t border-white/5"
    >
      <span className="flex items-center gap-4 min-w-0">
        {musicOn ? (
          <Volume2 size={14} className="shrink-0 text-intuition-primary" aria-hidden />
        ) : (
          <VolumeX size={14} className="shrink-0 text-slate-500" aria-hidden />
        )}
        Arena music
      </span>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
          musicOn ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40' : 'bg-white/[0.08] text-slate-500'
        }`}
      >
        {musicOn ? 'On' : 'Off'}
      </span>
    </button>
  );
}
