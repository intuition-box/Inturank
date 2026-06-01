/**
 * MobileLayout: top bar + floating bottom nav (five primary tabs).
 * Used in place of the desktop `Layout` chrome whenever `useIsMobile()` is true.
 *
 * Dock: Home �/ Markets �/ Skill �/ Leaderboard �/ Portfolio (all in-app routes).
 * Header “Menu” opens a sheet with Activity, Arena, Trust tools, docs, Create, etc.
 */
import React, { memo, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect, useConfig } from 'wagmi';
import { getWalletClient } from '@wagmi/core';
import {
  Home,
  TrendingUp,
  Cpu,
  BarChart2,
  Users,
  Search,
  Wallet,
  ChevronDown,
  LayoutGrid,
} from 'lucide-react';
import {
  switchNetwork, disconnectWallet, setWagmiConnection, setOpenConnectModalRef,
} from '../services/web3';
import { ARENA_BATCH_MODE, CHAIN_ID } from '../constants';
import { playHover, playClick } from '../services/audio';
import Logo from './Logo';
import NotificationBar from './NotificationBar';
import { toast } from './Toast';
import { setEmailFailureHandler, maybeSendDailyDigest } from '../services/emailNotifications';
import { mergeFollowsFromServer } from '../services/follows';
import { useEffectiveChainId } from '../hooks/useEffectiveChainId';
import MobileNavSheet from './MobileNavSheet';
import ArenaBatchFab from './ArenaBatchFab';
import { WalletMenuMusicToggle } from './WalletMenuMusicToggle';
import { useWalletDisplayMeta } from '../hooks/useWalletDisplayMeta';
import { formatWalletHeadlineForUi } from '../services/analytics';
import { isNavPathActive } from '../services/navActive';
import SiteFooter from './SiteFooter';

interface Props {
  children: React.ReactNode;
}

interface BottomTab {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const BOTTOM_TABS: BottomTab[] = [
  { label: 'Home', path: '/', icon: <Home size={22} strokeWidth={2} /> },
  { label: 'Markets', path: '/markets', icon: <TrendingUp size={22} strokeWidth={2} /> },
  { label: 'Skill', path: '/skill-playground', icon: <Cpu size={22} strokeWidth={2} /> },
  { label: 'Ranks', path: '/stats', icon: <BarChart2 size={22} strokeWidth={2} /> },
  { label: 'Portfolio', path: '/portfolio', icon: <Users size={22} strokeWidth={2} /> },
];

const BottomNavTab = memo(function BottomNavTab({
  item,
  active,
  onNavigate,
}: {
  item: BottomTab;
  active: boolean;
  onNavigate: () => void;
}) {
  const chipClass = `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.35rem] px-1.5 py-2 transition-[background-color,color,transform] duration-200 ease-out ${
    active
      ? 'bg-intuition-primary/[0.16] text-white ring-1 ring-inset ring-intuition-primary/30 shadow-[0_0_18px_-6px_rgba(255,80,57,0.65)]'
      : 'text-zinc-400 active:bg-white/[0.06]'
  }`;

  const label = (
    <span className={`max-w-full truncate text-center text-[11px] font-semibold font-sans leading-tight tracking-tight ${active ? 'text-white' : 'text-zinc-500'}`}>
      {item.label}
    </span>
  );

  return (
    <Link
      to={item.path}
      onClick={() => {
        playClick();
        onNavigate();
      }}
      onMouseEnter={playHover}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={`${chipClass} no-underline`}
    >
      <motion.span
        className="flex w-full flex-col items-center justify-center gap-1"
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 520, damping: 28 }}
      >
        <span className="flex h-[22px] items-center justify-center [&>svg]:shrink-0">{item.icon}</span>
        {label}
      </motion.span>
    </Link>
  );
});

const MobileLayout: React.FC<Props> = ({ children }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [walletDropOpen, setWalletDropOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { openConnectModal } = useConnectModal();
  const { address: walletAddress, isConnected } = useAccount();
  const chainId = useEffectiveChainId();
  const { disconnect } = useDisconnect();
  const wagmiConfig = useConfig();
  const walletHead = useWalletDisplayMeta(walletAddress ?? null);
  const walletHeaderLabel = walletAddress ? formatWalletHeadlineForUi(walletHead, walletAddress) : '';

  const pathname = location.pathname;

  // Mirror Layout.tsx: wire wagmi → web3 service so legacy code paths still work.
  useEffect(() => {
    if (!isConnected || !walletAddress) {
      setWagmiConnection(null, null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const wc = await getWalletClient(wagmiConfig, {
          chainId: CHAIN_ID,
          account: walletAddress as `0x${string}`,
          assertChainId: false,
        });
        const eip1193 = {
          request: (args: { method: string; params?: readonly unknown[] | object }) =>
            wc.request(args as Parameters<(typeof wc)['request']>[0]),
        };
        if (!cancelled) setWagmiConnection(walletAddress, eip1193 as unknown as typeof window.ethereum);
      } catch {
        const injected =
          typeof window !== 'undefined'
            ? (window as unknown as { ethereum?: unknown }).ethereum
            : undefined;
        if (!cancelled) setWagmiConnection(walletAddress, (injected as typeof window.ethereum) ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, walletAddress, wagmiConfig]);

  useEffect(() => {
    setOpenConnectModalRef(() => openConnectModal?.());
    return () => setOpenConnectModalRef(null);
  }, [openConnectModal]);

  useEffect(() => {
    setEmailFailureHandler((m) => toast.error(m));
    return () => setEmailFailureHandler(null);
  }, []);

  useEffect(() => {
    if (walletAddress) maybeSendDailyDigest(walletAddress).catch(() => {});
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) mergeFollowsFromServer(walletAddress).catch(() => {});
  }, [walletAddress]);

  // Auto-close any open sheets/drops on route change so navigation feels snappy.
  useEffect(() => {
    setSheetOpen(false);
    setWalletDropOpen(false);
  }, [pathname]);

  const handleConnect = () => {
    playClick();
    openConnectModal?.();
  };

  const handleDisconnect = () => {
    playClick();
    disconnect();
    setWagmiConnection(null, null);
    disconnectWallet();
    toast.info('Session ended');
  };

  const goCreate = () => {
    navigate('/create');
  };

  return (
    <div className="mobile-app-shell min-h-screen bg-intuition-dark text-slate-200 font-sans selection:bg-intuition-primary selection:text-black">
      {/* Top app bar */}
      <header
        className="fixed top-0 inset-x-0 z-[150] backdrop-blur-xl bg-intuition-dark/80 border-b border-white/[0.06]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <Link
            to="/"
            onClick={() => playClick()}
            className="flex items-center gap-2.5 min-w-0 no-underline"
            aria-label="IntuRank home"
          >
            <span className="h-9 w-9 shrink-0 rounded-2xl bg-gradient-to-br from-slate-900 via-black to-slate-950 border border-intuition-primary/60 flex items-center justify-center shadow-[0_0_14px_rgba(255,80,57,0.28)] p-1.5">
              <Logo className="h-full w-full object-contain" />
            </span>
            <span className="text-base font-display font-black tracking-[0.18em] truncate">
              <span className="text-white">INTU</span>
              <span className="text-intuition-primary" style={{ textShadow: '0 0 12px rgba(255,80,57,0.6)' }}>
                RANK
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                playClick();
                setSheetOpen(true);
              }}
              aria-label="More navigation"
              aria-expanded={sheetOpen}
              className="h-10 w-10 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition-transform duration-200 ease-out active:scale-95"
            >
              <LayoutGrid size={20} strokeWidth={2} />
            </button>
            <Link
              to="/markets"
              onClick={() => playClick()}
              aria-label="Search markets"
              className="h-10 w-10 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-transform duration-200 ease-out active:scale-95"
            >
              <Search size={18} />
            </Link>
            <NotificationBar walletAddress={walletAddress ?? null} />
            {walletAddress ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setWalletDropOpen((p) => !p);
                  }}
                  className="h-10 px-2.5 flex items-center gap-1.5 rounded-full border border-intuition-primary/30 bg-intuition-primary/8 text-intuition-primary text-[11px] font-mono font-black tracking-[0.12em] transition-transform duration-200 ease-out active:scale-95"
                >
                  <span className="h-2 w-2 rounded-full bg-intuition-success shadow-[0_0_6px_rgba(0,255,157,0.7)]" />
                  {walletHeaderLabel}
                  <ChevronDown size={12} />
                </button>
                <AnimatePresence>
                {walletDropOpen && (
                  <>
                    <motion.button
                      type="button"
                      aria-label="Close wallet menu"
                      className="fixed inset-0 z-[160]"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => setWalletDropOpen(false)}
                    />
                    <motion.div
                      className="absolute right-0 mt-2 z-[170] w-56 rounded-2xl border border-intuition-primary/35 bg-intuition-dark shadow-[0_24px_60px_rgba(0,0,0,0.92)] overflow-hidden"
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (walletAddress) navigator.clipboard.writeText(walletAddress);
                          toast.success('Address copied');
                          setWalletDropOpen(false);
                        }}
                        className="w-full px-4 py-3.5 text-left text-[11px] font-mono font-black tracking-[0.18em] uppercase text-slate-200 hover:bg-white/5"
                      >
                        Copy address
                      </button>
                      <Link
                        to="/account"
                        onClick={() => {
                          playClick();
                          setWalletDropOpen(false);
                        }}
                        className="block px-4 py-3.5 text-[11px] font-mono font-black tracking-[0.18em] uppercase text-slate-200 hover:bg-white/5"
                      >
                        Profile
                      </Link>
                      <WalletMenuMusicToggle variant="mobile-wallet" />
                      <button
                        type="button"
                        onClick={() => {
                          setWalletDropOpen(false);
                          handleDisconnect();
                        }}
                        className="w-full px-4 py-3.5 text-left text-[11px] font-mono font-black tracking-[0.18em] uppercase text-intuition-danger hover:bg-intuition-danger/10 border-t border-white/5"
                      >
                        Disconnect
                      </button>
                    </motion.div>
                  </>
                )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                className="h-10 px-3 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-intuition-primary to-intuition-secondary text-white text-[11px] font-mono font-black tracking-[0.16em] uppercase shadow-[0_8px_22px_rgba(255,80,57,0.3)] transition-transform duration-200 ease-out active:scale-95"
              >
                <Wallet size={14} /> Connect
              </button>
            )}
          </div>
        </div>

        {walletAddress && chainId !== CHAIN_ID && (
          <button
            type="button"
            onClick={async () => {
              playClick();
              try {
                await switchNetwork();
              } catch (e: unknown) {
                const msg =
                  typeof e === 'object' && e !== null && 'message' in e
                    ? String((e as { message?: string }).message)
                    : 'Could not switch network';
                toast.error(msg.length > 160 ? `${msg.slice(0, 157)}…` : msg);
              }
            }}
            className="w-full px-4 py-2 text-[10px] font-mono font-black tracking-[0.18em] uppercase text-white bg-intuition-danger active:opacity-90"
          >
            Wrong network: tap to switch
          </button>
        )}
      </header>

      {/* Main scrollable content. pt offset = topbar height; pb offset = dock height + safe area. */}
      <main
        className="relative mobile-contain min-w-0 w-full max-w-full overflow-x-clip"
        style={{
          paddingTop: 'calc(3.5rem + env(safe-area-inset-top))',
          /* Extra clearance so long pages (e.g. market detail) never finish under the floating dock */
          paddingBottom: 'calc(8.75rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="min-h-full min-w-0 w-full">{children}</div>
        <SiteFooter compact />
      </main>

      {ARENA_BATCH_MODE && !location.pathname.startsWith('/climb') && <ArenaBatchFab />}

      {/* Floating bottom tab bar — pill, five equal tabs (matches mobile reference pattern). */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-[180] flex items-end justify-center pointer-events-none"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="pointer-events-auto mx-3 w-full max-w-lg">
          <motion.div
            layout
            className="flex items-stretch rounded-[999px] border border-white/12 bg-[#1a1a1c] px-1.5 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)]"
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            {BOTTOM_TABS.map((item) => (
              <BottomNavTab
                key={item.path}
                item={item}
                active={isNavPathActive(item.path, pathname)}
                onNavigate={() => setSheetOpen(false)}
              />
            ))}
          </motion.div>
        </div>
      </nav>

      <MobileNavSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreate={goCreate}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        walletAddress={walletAddress}
      />
    </div>
  );
};

export default MobileLayout;
