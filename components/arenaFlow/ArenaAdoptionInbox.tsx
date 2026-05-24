import React, { useEffect, useState } from 'react';
import { Bell, Sparkles } from 'lucide-react';
import {
  getAdoptionNotificationsFor,
  getUnreadAdoptionNotificationCount,
  markAdoptionNotificationsRead,
  subscribeAdoptionNotifications,
} from '../../services/arenaRankingRemix';
import { playArenaUiClick } from '../../services/audio';

type Props = {
  walletAddress?: string | null;
  className?: string;
};

export const ArenaAdoptionInbox: React.FC<Props> = ({ walletAddress, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(() => getAdoptionNotificationsFor(walletAddress));
  const [unread, setUnread] = useState(() => getUnreadAdoptionNotificationCount(walletAddress));

  useEffect(() => {
    const refresh = () => {
      setItems(getAdoptionNotificationsFor(walletAddress));
      setUnread(getUnreadAdoptionNotificationCount(walletAddress));
    };
    refresh();
    return subscribeAdoptionNotifications(refresh);
  }, [walletAddress]);

  if (!walletAddress?.startsWith('0x')) return null;
  if (items.length === 0 && !open) return null;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          playArenaUiClick();
          setOpen((v) => !v);
          if (!open) markAdoptionNotificationsRead(walletAddress);
        }}
        className="relative inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-slate-200 hover:border-cyan-400/40"
        aria-label="Ranking adoption notifications"
      >
        <Bell className="h-4 w-4" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-wide">Adoptions</span>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[9px] font-black text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-white/10 bg-[#0a0c12] shadow-2xl">
          <div className="border-b border-white/[0.08] px-3 py-2">
            <p className="font-mono text-[10px] font-black uppercase tracking-wide text-slate-400">
              Your rankings were adopted
            </p>
          </div>
          <ul className="max-h-64 overflow-y-auto divide-y divide-white/[0.06]">
            {items.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-slate-500">No adoptions yet.</li>
            ) : (
              items.map((n) => (
                <li key={n.id} className="px-3 py-2.5">
                  <p className="text-sm text-slate-200">
                    <span className="font-semibold text-cyan-200">{n.adopterLabel}</span> adopted your
                    ranking
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{n.listTitle}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
