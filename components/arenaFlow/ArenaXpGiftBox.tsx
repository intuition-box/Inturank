import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Gift, Sparkles, X } from 'lucide-react';
import {
  claimAllArenaPendingXp,
  getArenaPendingXpEntries,
  getArenaPendingXpTotal,
  subscribeArenaPendingXp,
} from '../../services/arenaPendingXp';
import { playArenaUiClick, playArenaUiHover } from '../../services/audio';
import { deckPalette } from '../../services/arenaCardDesign';

type Props = {
  walletAddress?: string | null;
  listCategory?: string;
  className?: string;
  variant?: 'compact' | 'hero';
};

export const ArenaXpGiftBox: React.FC<Props> = ({
  walletAddress,
  listCategory,
  className = '',
  variant = 'compact',
}) => {
  const deck = deckPalette(listCategory);
  const reduceMotion = useReducedMotion();
  const [pendingTotal, setPendingTotal] = useState(() => getArenaPendingXpTotal(walletAddress));
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimedFlash, setClaimedFlash] = useState(false);

  useEffect(() => {
    setPendingTotal(getArenaPendingXpTotal(walletAddress));
    return subscribeArenaPendingXp(walletAddress, () => {
      setPendingTotal(getArenaPendingXpTotal(walletAddress));
    });
  }, [walletAddress]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!walletAddress?.startsWith('0x')) return null;

  const entries = open ? getArenaPendingXpEntries(walletAddress) : [];
  const isHero = variant === 'hero';

  const modal =
    open && typeof document !== 'undefined' ? (
      <GiftBoxClaimModal
        deck={deck}
        pendingTotal={pendingTotal}
        entries={entries}
        claiming={claiming}
        claimedFlash={claimedFlash}
        reduceMotion={Boolean(reduceMotion)}
        onClose={() => setOpen(false)}
        onClaim={async () => {
          playArenaUiClick();
          setClaiming(true);
          const before = pendingTotal;
          claimAllArenaPendingXp(walletAddress);
          setPendingTotal(getArenaPendingXpTotal(walletAddress));
          setClaiming(false);
          if (before > 0) {
            setClaimedFlash(true);
            window.setTimeout(() => setClaimedFlash(false), 1400);
          }
        }}
      />
    ) : null;

  return (
    <>
      <motion.button
        type="button"
        layout
        onClick={() => {
          playArenaUiClick();
          setOpen(true);
        }}
        onMouseEnter={() => playArenaUiHover()}
        whileTap={reduceMotion ? undefined : { scale: 0.94 }}
        whileHover={reduceMotion ? undefined : { scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 480, damping: 28 }}
        className={
          isHero
            ? `relative flex h-full min-h-[9.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-3 sm:gap-2 sm:p-4 transition-[filter] hover:brightness-110 ${className}`
            : `relative inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2 transition-[filter] hover:brightness-110 ${className}`
        }
        style={{
          borderColor: pendingTotal > 0 ? deck.hex : 'rgba(255,255,255,0.12)',
          background: pendingTotal > 0
            ? `linear-gradient(165deg, ${deck.hex}28 0%, rgba(0,0,0,0.55) 60%)`
            : 'rgba(0,0,0,0.35)',
          boxShadow: pendingTotal > 0 ? `0 0 40px ${deck.hex}33, inset 0 1px 0 rgba(255,255,255,0.08)` : undefined,
        }}
        aria-label={`Arena gift box, ${pendingTotal} XP to claim`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <motion.span
          animate={
            reduceMotion || pendingTotal <= 0
              ? undefined
              : { y: [0, -5, 0], rotate: [0, -6, 6, 0] }
          }
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="inline-flex"
        >
          <Gift
            className={isHero ? 'h-10 w-10 sm:h-11 sm:w-11' : 'h-5 w-5'}
            style={{ color: pendingTotal > 0 ? deck.hex : '#94a3b8' }}
            strokeWidth={isHero ? 1.8 : 2.2}
          />
        </motion.span>
        {isHero ? (
          <>
            <span className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
              Arena gift box
            </span>
            <motion.span
              key={pendingTotal}
              initial={reduceMotion ? false : { scale: 0.88, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-display text-2xl font-black tabular-nums text-white sm:text-3xl"
            >
              {pendingTotal.toLocaleString()}
              <span className="ml-0.5 text-sm text-slate-400 sm:text-base">XP</span>
            </motion.span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-slate-300">
              {pendingTotal > 0 ? 'Tap to claim' : 'Bonuses land here'}
            </span>
          </>
        ) : (
          <span className="font-mono text-[10px] font-black uppercase tracking-wide text-slate-200">
            Gift box
          </span>
        )}
        <AnimatePresence>
          {pendingTotal > 0 ? (
            <motion.span
              key="badge"
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 24 }}
              className={
                isHero
                  ? 'absolute right-3 top-3 flex h-8 min-w-[2rem] items-center justify-center rounded-full px-2 font-mono text-xs font-black text-black'
                  : 'absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 font-mono text-[9px] font-black text-black'
              }
              style={{ background: deck.hex }}
            >
              {pendingTotal > 99 ? '99+' : pendingTotal}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.button>

      {modal ? createPortal(modal, document.body) : null}
    </>
  );
};

function GiftBoxClaimModal({
  deck,
  pendingTotal,
  entries,
  claiming,
  claimedFlash,
  reduceMotion,
  onClose,
  onClaim,
}: {
  deck: ReturnType<typeof deckPalette>;
  pendingTotal: number;
  entries: ReturnType<typeof getArenaPendingXpEntries>;
  claiming: boolean;
  claimedFlash: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  onClaim: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[600] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        role="presentation"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <GiftBoxModalPanel
          deck={deck}
          pendingTotal={pendingTotal}
          entries={entries}
          claiming={claiming}
          claimedFlash={claimedFlash}
          reduceMotion={reduceMotion}
          onClose={onClose}
          onClaim={onClaim}
        />
      </motion.div>
    </AnimatePresence>
  );
}

function GiftBoxModalPanel({
  deck,
  pendingTotal,
  entries,
  claiming,
  claimedFlash,
  reduceMotion,
  onClose,
  onClaim,
}: {
  deck: ReturnType<typeof deckPalette>;
  pendingTotal: number;
  entries: ReturnType<typeof getArenaPendingXpEntries>;
  claiming: boolean;
  claimedFlash: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  onClaim: () => void;
}) {
  return (
    <motion.div
      className="relative z-[601] w-full max-w-md overflow-hidden rounded-2xl border-2 shadow-2xl"
      style={{ borderColor: deck.line, background: '#070a10' }}
      role="dialog"
      aria-modal
      aria-labelledby="arena-gift-box-title"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 16 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <AnimatePresence>
        {claimedFlash ? (
          <motion.div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: `radial-gradient(circle at 50% 40%, ${deck.hex}55, transparent 65%)` }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1.4, opacity: 0.85 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55 }}
            />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <motion.span
                key={i}
                className="absolute h-2 w-2 rounded-full"
                style={{ background: deck.hex }}
                initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                animate={{
                  opacity: 0,
                  scale: 0,
                  x: Math.cos((i / 6) * Math.PI * 2) * 90,
                  y: Math.sin((i / 6) * Math.PI * 2) * 70,
                }}
                transition={{ duration: 0.65, ease: 'easeOut' }}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4"
        style={{ background: `${deck.hex}14` }}
      >
        <div className="flex items-center gap-3">
          <motion.span
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: `${deck.hex}30` }}
            animate={reduceMotion || pendingTotal <= 0 ? undefined : { rotate: [0, -8, 8, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Gift className="h-6 w-6" style={{ color: deck.hex }} />
          </motion.span>
          <div>
            <h2 id="arena-gift-box-title" className="font-display text-lg font-black text-white">
              Arena gift box
            </h2>
            <p className="text-xs text-slate-400">Bonus XP waiting to claim</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-5 py-5">
        <motion.p
          key={pendingTotal}
          className="font-display text-4xl font-black tabular-nums text-white"
          initial={reduceMotion ? false : { scale: 0.9, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        >
          {pendingTotal.toLocaleString()}
          <span className="ml-2 text-lg text-slate-400">XP</span>
        </motion.p>
        {entries.length > 0 ? (
          <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
            {entries.map((e, i) => (
              <motion.li
                key={e.id}
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2"
              >
                <span className="min-w-0 truncate text-xs text-slate-300">{e.label}</span>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-emerald-300">
                  +{e.amount}
                </span>
              </motion.li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Rank, remix decks, and sign on-chain — bonuses land here before you claim.
          </p>
        )}
      </div>

      <GiftBoxModalPanelFooter deck={deck} pendingTotal={pendingTotal} claiming={claiming} onClaim={onClaim} />
    </motion.div>
  );
}

function GiftBoxModalPanelFooter({
  deck,
  pendingTotal,
  claiming,
  onClaim,
}: {
  deck: ReturnType<typeof deckPalette>;
  pendingTotal: number;
  claiming: boolean;
  onClaim: () => void;
}) {
  return (
    <div className="border-t border-white/[0.08] px-5 py-4">
      <motion.button
        type="button"
        disabled={pendingTotal <= 0 || claiming}
        onClick={onClaim}
        whileTap={pendingTotal > 0 && !claiming ? { scale: 0.97 } : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-mono text-xs font-black uppercase tracking-[0.14em] text-black transition-[filter] hover:brightness-110 disabled:opacity-40"
        style={{ background: deck.hex }}
      >
        <motion.span
          animate={claiming ? { rotate: 360 } : { rotate: 0 }}
          transition={claiming ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : undefined}
        >
          <Sparkles className="h-4 w-4" />
        </motion.span>
        {claiming ? 'Claiming…' : pendingTotal > 0 ? 'Claim all XP' : 'Nothing to claim yet'}
      </motion.button>
    </div>
  );
}
