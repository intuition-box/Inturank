/**
 * Mobile “More” menu: routes not in the bottom dock, Create, wallet.
 * Animated open on mobile only (hidden from md breakpoint up).
 */
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Activity,
  Send,
  UserCircle,
  Globe,
  FileText,
  BarChart2,
  HeartPulse,
  Coins,
  Plus,
  Wallet,
  LogOut,
  ExternalLink,
  CalendarDays,
} from 'lucide-react';
import { playClick, playHover } from '../services/audio';
import { WalletMenuMusicToggle } from './WalletMenuMusicToggle';

const TRUST_SWAP_URL = 'https://aero.drome.eth.limo/swap?from=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&to=0x6cd905df2ed214b22e0d48ff17cd4200c1c6d8a3&chain0=8453&chain1=8453';

// Arcium-style choreography: backdrop fades, sheet slides up smoothly,
// then list items stagger-fade in with a slight horizontal drift. Ease-out
// quintic curve for a buttery "settle and land" feel, not a bouncy spring.
const SMOOTH_EASE = [0.22, 1, 0.36, 1] as const;

const sheetListVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.055, delayChildren: 0.18 },
  },
};

const sheetRowVariants = {
  hidden: { opacity: 0, x: 24, scale: 0.98 },
  show: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.45, ease: SMOOTH_EASE },
  },
};

interface SheetItem {
  label: string;
  desc: string;
  to: string;
  icon: React.ReactNode;
  external?: boolean;
  accent: 'cyan' | 'magenta' | 'gold' | 'green' | 'purple' | 'slate';
}

const SECTIONS: Array<{ heading: string; items: SheetItem[] }> = [
  {
    heading: 'Feed & profile',
    items: [
      { label: 'Activity', desc: 'IntuRank-routed stakes and your Arena-related moves', to: '/feed', icon: <Globe size={20} />, accent: 'cyan' },
      { label: 'Profile', desc: 'Account, identity, and badges', to: '/account', icon: <UserCircle size={20} />, accent: 'purple' },
    ],
  },
  {
    heading: 'Arena & Trust',
    items: [
      {
        label: 'The Arena',
        desc: 'Ranked lists and stance batches',
        to: '/climb',
        icon: <Activity size={20} />,
        accent: 'magenta',
      },
      { label: 'Leaderboard', desc: 'Arena rankers leaderboard', to: '/stats', icon: <BarChart2 size={20} />, accent: 'gold' },
      { label: 'Send Trust', desc: 'Transfer TRUST (₸)', to: '/send-trust', icon: <Send size={20} />, accent: 'gold' },
      { label: 'Trust tools', desc: 'Daily Trust hub', to: '/hub/trust-tools', icon: <CalendarDays size={20} />, accent: 'cyan' },
    ],
  },
  {
    heading: 'Buy TRUST & docs',
    items: [
      {
        label: 'Buy TRUST (DEX)',
        desc: 'Opens Aerodrome in a new tab (external swap page)',
        to: TRUST_SWAP_URL,
        icon: <Coins size={20} />,
        accent: 'green',
        external: true,
      },
      { label: 'Documentation', desc: 'How IntuRank works', to: '/documentation', icon: <FileText size={20} />, accent: 'slate' },
      { label: 'System health', desc: 'Live KPIs', to: '/health', icon: <HeartPulse size={20} />, accent: 'slate' },
    ],
  },
];

const accentClasses: Record<SheetItem['accent'], { ring: string; bg: string; icon: string; glow: string }> = {
  cyan: {
    ring: 'border-intuition-primary/35',
    bg: 'bg-intuition-primary/8',
    icon: 'text-intuition-primary',
    glow: 'shadow-[0_8px_24px_rgba(255,80,57,0.18)]',
  },
  magenta: {
    ring: 'border-intuition-secondary/40',
    bg: 'bg-intuition-secondary/10',
    icon: 'text-intuition-secondary',
    glow: 'shadow-[0_8px_24px_rgba(239,68,68,0.18)]',
  },
  gold: {
    ring: 'border-intuition-warning/40',
    bg: 'bg-intuition-warning/10',
    icon: 'text-intuition-warning',
    glow: 'shadow-[0_8px_24px_rgba(250,204,21,0.18)]',
  },
  green: {
    ring: 'border-intuition-success/40',
    bg: 'bg-intuition-success/10',
    icon: 'text-intuition-success',
    glow: 'shadow-[0_8px_24px_rgba(0,255,157,0.18)]',
  },
  purple: {
    ring: 'border-intuition-purple/40',
    bg: 'bg-intuition-purple/10',
    icon: 'text-intuition-purple',
    glow: 'shadow-[0_8px_24px_rgba(168,85,247,0.18)]',
  },
  slate: {
    ring: 'border-white/10',
    bg: 'bg-white/[0.04]',
    icon: 'text-slate-300',
    glow: 'shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
  },
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  walletAddress?: string | null;
}

const MobileNavSheet: React.FC<Props> = ({ open, onClose, onCreate, onConnect, onDisconnect, walletAddress }) => {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
  }, [open]);

  useEffect(
    () => () => {
      document.body.style.overflow = '';
    },
    [],
  );

  const handleNavigate = () => {
    playClick();
    onClose();
  };

  return (
    <AnimatePresence
      mode="sync"
      onExitComplete={() => {
        document.body.style.overflow = '';
      }}
    >
      {open && (
        <motion.div
          key="mobile-nav-sheet"
          className="fixed inset-0 z-[200] flex items-end justify-center md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: SMOOTH_EASE }}
        >
          {/* Backdrop: heavier blur on enter (Arcium-style "world dims away"),
              slightly slower fade so it feels like the world is pushed back. */}
          <motion.button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/75 backdrop-blur-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: SMOOTH_EASE }}
            onClick={() => {
              playClick();
              onClose();
            }}
          />
          {/* Sheet container — ember tint (matches global brand), buttery slide
              up with ease-out-quint instead of a bouncy spring. Subtle scale on
              enter (0.985 -> 1) adds depth. */}
          <motion.div
            className="relative w-full max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[2rem] border-t border-x border-intuition-primary/25 bg-gradient-to-b from-[#1e1218] via-[#16101a] to-[#0e0a14] shadow-[0_-30px_80px_rgba(0,0,0,0.85),0_-1px_0_rgba(255,80,57,0.30)]"
            style={{
              paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
              willChange: 'transform, opacity',
              transformOrigin: '50% 100%',
            }}
            initial={{ y: '100%', opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '100%', opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.52, ease: SMOOTH_EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 px-5 pt-3 pb-3 bg-gradient-to-b from-[#1e1218] via-[#1e1218]/95 to-[#1e1218]/0 backdrop-blur-sm">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-white/15 mb-4" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold tracking-wide text-intuition-primary/85 uppercase">More</p>
                  <h2 className="text-xl font-display font-bold text-white tracking-tight mt-0.5">
                    Activity, Arena, and tools
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => {
                    playClick();
                    onClose();
                  }}
                  className="h-10 w-10 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 active:scale-95 transition-transform"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <motion.div
              variants={sheetListVariants}
              initial="hidden"
              animate="show"
              className="px-5 pb-2 pt-1 space-y-6"
            >
              <motion.div variants={sheetRowVariants}>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  onClose();
                  onCreate();
                }}
                className="w-full relative overflow-hidden flex items-center gap-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-intuition-secondary via-intuition-secondary to-intuition-purple text-white shadow-[0_18px_48px_rgba(239,68,68,0.45),inset_0_1px_0_rgba(255,255,255,0.18)] active:scale-[0.98] transition-transform duration-200 ease-out"
              >
                <span className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center shadow-inner">
                  <Plus size={24} strokeWidth={2.5} />
                </span>
                <span className="text-left flex-1 min-w-0">
                  <span className="block text-sm font-display font-bold tracking-tight">Create identity or claim</span>
                  <span className="block text-[11px] font-sans opacity-85 mt-0.5">
                    New identity, triple, or on-chain signal
                  </span>
                </span>
              </button>
              </motion.div>

              {SECTIONS.map((section) => (
                <motion.div key={section.heading} variants={sheetRowVariants}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-3 px-1">
                    {section.heading}
                  </p>
                  <div className="space-y-2.5">
                    {section.items.map((item) => {
                      const a = accentClasses[item.accent];
                      const inner = (
                        <>
                          <span
                            className={`h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center border ${a.ring} ${a.bg} ${a.icon} ${a.glow}`}
                          >
                            {item.icon}
                          </span>
                          <span className="flex-1 min-w-0 text-left">
                            <span className="flex items-center gap-2 text-[15px] font-semibold text-white">
                              <span className="truncate">{item.label}</span>
                              {item.external && <ExternalLink size={12} className="text-slate-500 shrink-0" />}
                            </span>
                            <span className="block text-[12px] text-slate-400 truncate mt-0.5">{item.desc}</span>
                          </span>
                        </>
                      );
                      const cls =
                        'flex items-center gap-4 px-3 py-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] active:bg-white/[0.05] active:scale-[0.99] transition-all duration-200 ease-out';
                      if (item.external) {
                        return (
                          <motion.div key={item.label} variants={sheetRowVariants}>
                          <a
                            href={item.to}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleNavigate}
                            onMouseEnter={playHover}
                            className={cls}
                          >
                            {inner}
                          </a>
                          </motion.div>
                        );
                      }
                      return (
                        <motion.div key={item.label} variants={sheetRowVariants}>
                        <Link
                          to={item.to}
                          onClick={handleNavigate}
                          onMouseEnter={playHover}
                          className={cls}
                        >
                          {inner}
                        </Link>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}

              <motion.div variants={sheetRowVariants} className="pt-2 space-y-2">
                <WalletMenuMusicToggle variant="sheet" />
                {walletAddress ? (
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      onClose();
                      onDisconnect();
                    }}
                    className="w-full flex items-center justify-center gap-2.5 px-5 py-4 rounded-2xl border border-intuition-danger/40 bg-intuition-danger/10 text-intuition-danger font-sans font-semibold text-sm active:scale-[0.99] transition-transform"
                  >
                    <LogOut size={16} /> Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      onClose();
                      onConnect();
                    }}
                    className="w-full flex items-center justify-center gap-2.5 px-5 py-4 rounded-2xl bg-gradient-to-r from-intuition-primary to-intuition-secondary text-white font-sans font-semibold text-sm shadow-[0_12px_36px_rgba(255,80,57,0.3)] active:scale-[0.99] transition-transform"
                  >
                    <Wallet size={16} /> Connect wallet
                  </button>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileNavSheet;
