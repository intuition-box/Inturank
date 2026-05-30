import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Star } from 'lucide-react';
import type { ArenaListEntry } from '../services/arenaListsRegistry';
import { playArenaUiClick, playArenaUiHover } from '../services/audio';

type Props = {
  activeListId: string;
  favorites: ArenaListEntry[];
  others: ArenaListEntry[];
  onSelectList: (id: string) => void;
  className?: string;
};

/**
 * List switcher rendered in a fixed portal so parents with `overflow:hidden` never clip the panel.
 */
const ArenaListQuickPick: React.FC<Props> = ({ activeListId, favorites, others, onSelectList, className = '' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const active = [...favorites, ...others].find((l) => l.id === activeListId);
  const label = active?.title ?? 'Pick a list';

  const updatePanelPos = React.useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxW = 380;
    const w = Math.min(maxW, Math.max(260, r.width));
    let left = r.right - w;
    const pad = 10;
    if (left < pad) left = pad;
    if (left + w > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - w - pad);
    const maxH = Math.min(window.innerHeight * 0.52, 420);
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const openDown = spaceBelow >= 140 || spaceBelow >= r.top;
    if (openDown) {
      setPanelStyle({
        position: 'fixed',
        left,
        width: w,
        top: r.bottom + 8,
        bottom: undefined,
        maxHeight: Math.min(maxH, Math.max(120, spaceBelow - 4)),
        zIndex: 100025,
      });
    } else {
      const spaceAbove = r.top - 16;
      setPanelStyle({
        position: 'fixed',
        left,
        width: w,
        top: undefined,
        bottom: window.innerHeight - r.top + 8,
        maxHeight: Math.min(maxH, Math.max(120, spaceAbove)),
        zIndex: 100025,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPos();
    const onResize = () => updatePanelPos();
    const onScroll = () => updatePanelPos();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (shellRef.current?.contains(t)) return;
      const portal = document.getElementById(`arena-quickpick-portal-${listboxId}`);
      if (portal?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, listboxId]);

  const pick = (id: string) => {
    playArenaUiClick();
    if (id !== activeListId) onSelectList(id);
    setOpen(false);
  };

  const row = (L: ArenaListEntry, starred: boolean) => {
    const selected = L.id === activeListId;
    return (
      <button
        key={L.id}
        type="button"
        role="option"
        aria-selected={selected}
        onMouseEnter={playArenaUiHover}
        onClick={() => pick(L.id)}
        className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors flex items-start gap-2 min-w-0 ${
          selected
            ? 'border-intuition-primary/45 bg-intuition-primary/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'border-transparent hover:border-white/10 hover:bg-white/[0.04] text-slate-200'
        }`}
      >
        {starred ? (
          <Star className="w-3.5 h-3.5 shrink-0 mt-0.5 text-intuition-warning fill-intuition-warning/40" strokeWidth={2.25} aria-hidden />
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-sm leading-snug line-clamp-2 block">{L.title}</span>
        </span>
      </button>
    );
  };

  const panel =
    open ? (
      <div
        id={`arena-quickpick-portal-${listboxId}`}
        style={panelStyle}
        className="overflow-y-auto overscroll-contain rounded-2xl border border-intuition-primary/25 bg-[rgba(5,8,16,0.98)] backdrop-blur-2xl shadow-[0_24px_64px_rgba(0,0,0,0.55)] px-2 py-2"
        role="presentation"
      >
        <div id={`${listboxId}-panel`} role="listbox" aria-labelledby={`${listboxId}-trigger`}>
          {favorites.length > 0 ? (
            <div className="mb-2 pb-2 border-b border-white/[0.06]">
              <p className="text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-intuition-warning/95 px-2 py-1.5 flex items-center gap-1.5">
                <Star className="w-3 h-3" fill="currentColor" opacity={0.35} aria-hidden /> Favorites
              </p>
              <div className="flex flex-col gap-0.5">{favorites.map((L) => row(L, true))}</div>
            </div>
          ) : null}
          {others.length > 0 ? (
            <div className={favorites.length > 0 ? 'pt-0.5' : ''}>
              {favorites.length > 0 ? (
                <p className="text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-slate-500 px-2 py-1.5">More lists</p>
              ) : null}
              <div className="flex flex-col gap-0.5">{others.map((L) => row(L, false))}</div>
            </div>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div ref={rootRef} className={`relative min-w-0 ${className}`.trim()}>
        <div
          ref={shellRef}
          className="rounded-2xl p-[1px] shadow-[0_0_32px_rgba(255,80,57,0.12)]"
          style={{
            background: 'linear-gradient(135deg, rgba(255,80,57,0.55), rgba(239,68,68,0.35), rgba(255,80,57,0.25))',
          }}
        >
          <button
            type="button"
            id={`${listboxId}-trigger`}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? `${listboxId}-panel` : undefined}
            onClick={() => {
              playArenaUiClick();
              setOpen((o) => !o);
            }}
            onMouseEnter={playArenaUiHover}
            className="w-full rounded-[0.9rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(6,10,22,0.98),rgba(3,6,14,0.99))] px-4 py-2.5 sm:py-3 text-left backdrop-blur-xl flex items-center gap-3 min-h-[48px]"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
          >
            <span
              className="text-[9px] font-mono font-black uppercase tracking-[0.24em] text-intuition-primary/90 shrink-0 hidden min-[440px]:inline"
              aria-hidden
            >
              Switch
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block leading-none mb-1">List</span>
              <span className="font-bold text-[15px] text-white leading-tight truncate block">{label}</span>
            </span>
            <ChevronDown
              className={`w-5 h-5 shrink-0 text-intuition-primary/80 transition-transform ${open ? 'rotate-180' : ''}`}
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        </div>
      </div>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </>
  );
};

export default ArenaListQuickPick;
