import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';
import {
  ARENA_PENDING_UPDATED_EVENT,
  getFirstListIdWithPending,
  getTotalPendingCount,
} from '../services/arenaPendingBatch';
import { playArenaUiClick } from '../services/audio';
import { useIsMobile } from '../hooks/useIsMobile';

/**
 * Fixed bottom-right batch queue control (viewport-anchored).
 * Inline `right`/`left` so layout never mirrors to the wrong corner; renders to `document.body`.
 */
const ArenaBatchFab: React.FC = () => {
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const safeBottom = useMemo(
    () =>
      isMobile
        ? `max(calc(4.85rem + env(safe-area-inset-bottom, 0px)), 1.25rem)`
        : `max(1.25rem, env(safe-area-inset-bottom, 0px))`,
    [isMobile],
  );
  const safeRight = useMemo(() => `max(1.25rem, env(safe-area-inset-right, 0px))`, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const read = () => setCount(getTotalPendingCount());
    read();

    const onUpdate = () => read();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'inturank-arena-pending-v1') read();
    };
    const onVisibility = () => {
      if (!document.hidden) read();
    };

    window.addEventListener(ARENA_PENDING_UPDATED_EVENT, onUpdate);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener(ARENA_PENDING_UPDATED_EVENT, onUpdate);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loc.pathname]);

  const onOpen = () => {
    const lid = getFirstListIdWithPending();
    playArenaUiClick();
    if (loc.pathname === '/climb') {
      window.dispatchEvent(new CustomEvent('arena-batch-fab-toggle'));
      return;
    }
    if (lid) {
      void navigate(`/climb?openBatch=1&listId=${encodeURIComponent(lid)}`);
    } else {
      void navigate('/climb');
    }
  };

  if (!mounted || count < 1) return null;

  return createPortal(
    <button
      type="button"
      dir="ltr"
      onClick={onOpen}
      style={{
        position: 'fixed',
        zIndex: 760,
        left: 'auto',
        right: safeRight,
        bottom: safeBottom,
        width: '3.5rem',
        height: '3.5rem',
      }}
      className="sm:w-[3.35rem] sm:h-[3.35rem] rounded-2xl flex items-center justify-center border-2 border-slate-700 bg-slate-950/95 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-intuition-primary/45 hover:shadow-[0_20px_52px_rgba(0,0,0,0.65),0_0_28px_rgba(34,211,238,0.12)] active:scale-[0.97] transition-[transform,box-shadow,border-color]"
      aria-label={`Review ${count} queued stance${count === 1 ? '' : 's'}`}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle,rgba(0,243,255,0.06)_1px,transparent_1px)] bg-[size:14px_14px] opacity-50"
        aria-hidden
      />
      <Layers className="relative w-6 h-6 text-intuition-primary" strokeWidth={2.2} aria-hidden />
      <span className="absolute -top-1 -right-1 min-w-[1.35rem] h-5 px-1 rounded-lg text-white text-[11px] font-black flex items-center justify-center border border-white/20 bg-rose-600 shadow-md tabular-nums">
        {count > 99 ? '99+' : count}
      </span>
    </button>,
    document.body,
  );
};

export default ArenaBatchFab;
