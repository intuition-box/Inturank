import { Link, useLocation, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect, useConnect, useConfig } from 'wagmi';
import { getWalletClient } from '@wagmi/core';
import { Wallet, Menu, X, TrendingUp, Users, BarChart2, LogOut, Copy, ChevronDown, AlertTriangle, Globe, ArrowRightLeft, Activity, Home, UserCircle, Search, Plus, Send, Coins, HeartPulse, FileText, Cpu } from 'lucide-react';
import { switchNetwork, disconnectWallet, setWagmiConnection, setOpenConnectModalRef } from '../services/web3';
import { APP_VERSION_DISPLAY, CHAIN_ID } from '../constants';
import { playHover, playClick } from '../services/audio';
import Logo from './Logo';
import NotificationBar from './NotificationBar';
import { toast } from './Toast';
import { setEmailFailureHandler, maybeSendDailyDigest } from '../services/emailNotifications';
import { mergeFollowsFromServer } from '../services/follows';
import ProfileBadgeWidget from './ProfileBadgeWidget';
import ArenaBatchFab from './ArenaBatchFab';
import { WalletMenuMusicToggle } from './WalletMenuMusicToggle';
import { ARENA_BATCH_MODE } from '../constants';
import { isNavPathActive } from '../services/navActive';
import { useEffectiveChainId } from '../hooks/useEffectiveChainId';
import SiteFooter from './SiteFooter';

interface LayoutProps {
  children: React.ReactNode;
}

const TRUST_SWAP_URL = "https://aero.drome.eth.limo/swap?from=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&to=0x6cd905df2ed214b22e0d48ff17cd4200c1c6d8a3&chain0=8453&chain1=8453";

/** Module-level nav config keeps icon refs stable so React.memo(NavItem) and hover stay cheap. */
const MAIN_NAV_ITEMS: Array<{
  label: string;
  path: string;
  icon: React.ReactNode;
  /** Stand-out pricing / trust flows vs default cyan */
  variant?: 'gold' | 'arena';
  /** HOT-style chip on icon when rail is collapsed, and after label when expanded */
  badge?: 'hot';
  /** Passed to router `Link` (e.g. scroll contest floor on Home). */
  linkState?: Record<string, unknown>;
  /** When set, tab is active on any of these pathnames (see Arena: `/` entry + `/climb` play). */
  activePaths?: string[];
}> = [
  {
    label: 'The Arena',
    path: '/climb',
    icon: <Activity size={18} strokeWidth={2} />,
    variant: 'arena',
    badge: 'hot',
  },
  { label: 'Markets', path: '/markets', icon: <TrendingUp size={18} strokeWidth={2} /> },
  { label: 'Portfolio', path: '/portfolio', icon: <Users size={18} strokeWidth={2} /> },
  { label: 'Send Trust', path: '/send-trust', icon: <Send size={18} strokeWidth={2} />, variant: 'gold' },
  { label: 'Profile', path: '/account', icon: <UserCircle size={18} strokeWidth={2} /> },
  { label: 'Skill agent', path: '/skill-playground', icon: <Cpu size={18} strokeWidth={2} /> },
];

const EXPLORE_NAV_ITEMS: Array<{
  label: string;
  path: string;
  icon: React.ReactNode;
  external?: boolean;
}> = [
  { label: 'Activity', path: '/feed', icon: <Globe size={18} strokeWidth={2} /> },
  { label: 'Documentation', path: '/documentation', icon: <FileText size={18} strokeWidth={2} /> },
  { label: 'Leaderboard', path: '/stats', icon: <BarChart2 size={18} strokeWidth={2} /> },
  { label: 'Get Trust', path: TRUST_SWAP_URL, icon: <Coins size={18} strokeWidth={2} />, external: true },
];

const MONITOR_NAV_ITEMS = [{ label: 'System health', path: '/health', icon: <HeartPulse size={18} strokeWidth={2} /> }];

const ALL_MOBILE_NAV_ITEMS = [...MAIN_NAV_ITEMS, ...EXPLORE_NAV_ITEMS, ...MONITOR_NAV_ITEMS];

interface NavItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  /** Gold = Send Trust; arena = magenta “hero” Arena row */
  variant?: 'default' | 'gold' | 'success' | 'arena';
  /** Pill on icon when collapsed; repeats next to label when rail expands */
  badge?: 'hot';
  /** External tab links (e.g. Get TRUST) use <a>, not router Link */
  external?: boolean;
  linkState?: Record<string, unknown>;
}

const NavItem = memo(function NavItem({
  to,
  label,
  icon,
  active,
  onClick,
  variant = 'default',
  badge,
  external = false,
  linkState,
}: NavItemProps) {
  const isGold = variant === 'gold';
  const isArena = variant === 'arena';
  const isSuccess = variant === 'success';
  const motionEasing = 'motion-safe:[transition-timing-function:cubic-bezier(0.33,1,0.68,1)]';
  const baseMotion =
    'motion-reduce:transition-none motion-reduce:duration-0 motion-safe:transition-[gap,padding,background-color,border-color,color,box-shadow,transform,filter] motion-safe:duration-400 ' +
    motionEasing;
  const activeCls = isGold
    ? 'text-black bg-intuition-warning border-intuition-warning/60'
    : isArena
      ? 'text-white bg-intuition-primary border-intuition-primary/60'
      : isSuccess
        ? 'text-black bg-intuition-success border-intuition-success/60'
        : 'text-white bg-intuition-primary/15 border-intuition-primary/40';
  const idleCls = isGold
    ? 'text-amber-200/85 border-transparent hover:text-amber-50 hover:bg-amber-500/8'
    : isArena
      ? 'text-orange-100/90 border-transparent hover:text-white hover:bg-intuition-primary/10'
      : isSuccess
        ? 'text-intuition-success/90 border-transparent hover:text-intuition-success hover:bg-intuition-success/8'
        : 'text-slate-300 border-transparent hover:text-white hover:bg-white/[0.04]';

  const cls = `group/item relative z-0 flex items-center overflow-hidden gap-3 justify-start px-3 py-2 min-h-[40px] text-[13px] font-medium tracking-normal font-sans normal-case rounded-lg border min-w-0 will-change-transform active:scale-[0.99] ${baseMotion} ${
    active ? activeCls : idleCls
  }`;

  const handleActivate = () => {
    playClick();
    onClick();
  };

  const iconHoverIdle = isGold
    ? 'text-amber-200/85 group-hover/item:text-amber-50'
    : isArena
      ? 'text-orange-200/85 group-hover/item:text-white'
      : isSuccess
        ? 'text-intuition-success/85 group-hover/item:text-intuition-success'
        : 'text-slate-400 group-hover/item:text-white';

  const iconActive = isArena ? 'text-white' : 'text-current';

  const inner = (
    <>
      <span className="relative shrink-0 flex items-center justify-center w-5 z-[2]">
        {badge === 'hot' ? (
          <span
            className="pointer-events-none absolute -top-2 -right-2 z-[4] rounded px-1 py-0.5 bg-intuition-secondary text-[7px] font-black text-white tracking-wider leading-none shadow-[0_0_10px_rgba(239,68,68,0.55)] motion-reduce:hidden"
            aria-hidden
          >
            HOT
          </span>
        ) : null}
        <span className={`flex items-center justify-center [&>svg]:shrink-0 transition-colors duration-200 ${active ? iconActive : iconHoverIdle}`}>
          {icon}
        </span>
      </span>
      <span className="whitespace-nowrap overflow-hidden text-left flex-1 min-w-0 relative z-[2] flex items-center gap-1.5">
        <span className="truncate">{label}</span>
        {badge === 'hot' ? (
          <span className="inline-flex shrink-0 items-center rounded border border-white/35 bg-black/35 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-orange-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            Hot
          </span>
        ) : null}
      </span>
    </>
  );

  if (external) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        title={label}
        onClick={handleActivate}
        onMouseEnter={playHover}
        className={cls}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link to={to} state={linkState} title={label} onClick={handleActivate} onMouseEnter={playHover} className={cls}>
      {inner}
    </Link>
  );
});

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isWalletDropdownOpen, setIsWalletDropdownOpen] = useState(false);
  const [isIntelOpen, setIsIntelOpen] = useState(false);

  const { openConnectModal } = useConnectModal();
  const wagmiConfig = useConfig();
  // useAccount in wagmi v2 does not support `select`; passing { select } still returns the full account object,
  // which made `walletAddress` an object and broke `.slice()` in ProfileBadgeWidget etc.
  const { address: walletAddress, isConnected } = useAccount();
  const chainId = useEffectiveChainId();
  const { disconnect } = useDisconnect();

  const dropdownRef = useRef<HTMLDivElement>(null);
  const intelRef = useRef<HTMLDivElement>(null);
  const sidebarAsideRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Sync RainbowKit/wagmi → web3 (getProvider / sendTransaction). Do not use connector.getProvider():
  // some connectors exposed via React do not implement it; getWalletClient uses the live connection.
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
        const injected = typeof window !== 'undefined' ? (window as unknown as { ethereum?: unknown }).ethereum : undefined;
        if (!cancelled) setWagmiConnection(walletAddress, (injected as typeof window.ethereum) ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, walletAddress, wagmiConfig]);

  // Let legacy connectWallet() calls (Account, Portfolio, etc.) open the RainbowKit modal
  useEffect(() => {
    setOpenConnectModalRef(() => openConnectModal?.());
    return () => setOpenConnectModalRef(null);
  }, [openConnectModal]);

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      const t = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(t)) {
        setIsWalletDropdownOpen(false);
      }
      if (intelRef.current && !intelRef.current.contains(t)) {
        setIsIntelOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, []);

  // Surface email delivery failures to the user (e.g. follow alerts, activity notifications)
  useEffect(() => {
    setEmailFailureHandler((msg) => toast.error(msg));
    return () => setEmailFailureHandler(null);
  }, []);

  // When wallet is set and user has daily digest, send digest if 24h passed and queue has items
  useEffect(() => {
    if (walletAddress) maybeSendDailyDigest(walletAddress).catch(() => {});
  }, [walletAddress]);

  // Merge follows from backend on connect (fills gaps when local was non-empty but server had more)
  useEffect(() => {
    if (walletAddress) mergeFollowsFromServer(walletAddress).catch(() => {});
  }, [walletAddress]);

  const openModal = () => {
    playClick();
    openConnectModal?.();
  };

  const handleDisconnect = (e: React.MouseEvent) => {
    playClick();
    e.stopPropagation();
    disconnect();
    setWagmiConnection(null, null);
    disconnectWallet();
    setIsWalletDropdownOpen(false);
    toast.info('Wallet disconnected');
  };

  const handleCopyAddress = (e: React.MouseEvent) => {
    playClick();
    e.stopPropagation();
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setIsWalletDropdownOpen(false);
      toast.success('Address copied');
    }
  };

  const toggleDropdown = () => {
    playClick();
    setIsWalletDropdownOpen(prev => !prev);
  };

  const handleNewSignal = () => {
    playClick();
    setIsMenuOpen(false);
    navigate('/create');
  };

  const pathname = location.pathname;

  const isActive = useCallback((path: string) => isNavPathActive(path, pathname), [pathname]);

  const closeSidebarNav = useCallback(() => {
    setIsMenuOpen(false);
    setIsIntelOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-intuition-dark text-slate-300 flex font-sans selection:bg-intuition-primary selection:text-black">
      {/* Desktop side nav — standard always-expanded sidebar, no hover-to-expand. */}
      <aside
        ref={sidebarAsideRef}
        className="hidden lg:flex fixed inset-y-0 left-0 z-[105] flex-col bg-intuition-dark border-r border-slate-800/80 shadow-[2px_0_16px_rgba(0,0,0,0.3)] overflow-hidden w-64 xl:w-72"
      >
        <Link
          to="/"
          onClick={playClick}
          aria-label="IntuRank home"
          className="flex h-16 shrink-0 items-center gap-3 px-4 border-b border-slate-800/50 min-w-0 overflow-visible relative z-10 no-underline outline-none focus-visible:ring-2 focus-visible:ring-intuition-primary/80 focus-visible:ring-offset-2 focus-visible:ring-offset-intuition-dark"
        >
          <div className="shrink-0 flex items-center justify-center">
            <div
              className="rounded-xl bg-gradient-to-br from-slate-900 via-black to-slate-950 border border-intuition-primary/70 flex items-center justify-center text-intuition-primary shadow-[0_0_14px_rgba(255,80,57,0.3)] overflow-hidden p-2 box-border"
              style={{ width: 44, height: 44 }}
            >
              <Logo className="h-7 w-7 max-h-[85%] max-w-[85%] object-contain object-center" />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg font-black tracking-[0.16em] font-display whitespace-nowrap min-w-0">
              <span className="text-[#f8fafc]">INTU</span>
              <span className="text-intuition-primary">RANK</span>
            </span>
            <span className="text-[9px] text-slate-500 font-mono tracking-[0.25em] uppercase font-black whitespace-nowrap">
              {APP_VERSION_DISPLAY}
            </span>
          </div>
        </Link>

        <div data-lenis-prevent className="flex-1 flex flex-col px-3 py-4 gap-5 overflow-y-auto overflow-x-clip min-h-0 overscroll-contain">
          <nav className="space-y-0.5" aria-label="Primary navigation">
            <p className="px-3 pb-2 text-[10px] font-mono uppercase tracking-[0.25em] font-bold text-intuition-primary/80">
              Main
            </p>
            {MAIN_NAV_ITEMS.map((item) => (
              <NavItem
                key={`${item.label}-${item.path}`}
                to={item.path}
                label={item.label}
                icon={item.icon}
                active={
                  item.activePaths?.length ? item.activePaths.includes(pathname) : isActive(item.path)
                }
                onClick={closeSidebarNav}
                variant={item.variant ?? 'default'}
                badge={item.badge}
                linkState={item.linkState}
              />
            ))}
          </nav>

          <div ref={intelRef} className="flex flex-col gap-5 min-h-0">
            <nav className="space-y-0.5" aria-label="Explore">
              <p className="px-3 pb-2 text-[10px] font-mono uppercase tracking-[0.25em] font-bold text-slate-500">
                Explore
              </p>
              {EXPLORE_NAV_ITEMS.map((item) => (
                <NavItem
                  key={item.external ? `explore-ext-${item.label}` : item.path}
                  to={item.path}
                  label={item.label}
                  icon={item.icon}
                  active={item.external ? false : isActive(item.path)}
                  onClick={closeSidebarNav}
                  external={item.external}
                  variant={item.external ? 'success' : 'default'}
                />
              ))}
            </nav>

            <nav className="space-y-0.5" aria-label="Monitor">
              <p className="px-3 pb-2 text-[10px] font-mono uppercase tracking-[0.25em] font-bold text-slate-500">
                Monitor
              </p>
              {MONITOR_NAV_ITEMS.map((item) => (
                <NavItem
                  key={item.path}
                  to={item.path}
                  label={item.label}
                  icon={item.icon}
                  active={isActive(item.path)}
                  onClick={closeSidebarNav}
                />
              ))}
            </nav>
          </div>
        </div>

        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 border-t border-slate-800/50 shrink-0 flex h-14 items-center gap-2">
          <Wallet size={16} className={`shrink-0 ${walletAddress ? 'text-intuition-primary' : 'text-slate-600'}`} aria-hidden />
          <span className="overflow-hidden whitespace-nowrap truncate text-[9px] font-mono text-slate-500 uppercase tracking-[0.25em]">
            {walletAddress ? 'Connected' : 'No session'}
          </span>
        </div>
      </aside>

      {/* Main column: offset = sidebar width (no hover expansion). */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0 w-full lg:ml-64 xl:ml-72">
        <nav className="lg:hidden fixed top-0 w-full z-50 bg-black/95 border-b border-slate-900/70 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.45)]">
          <div className="w-full px-3 sm:px-6 max-w-[100vw] min-w-0">
            <div className="flex items-center justify-between h-16 min-w-0">
              <Link
                to="/"
                onClick={playClick}
                onMouseEnter={playHover}
                aria-label="IntuRank home"
                className="flex items-center flex-shrink-0 gap-3 min-w-0 no-underline outline-none focus-visible:ring-2 focus-visible:ring-intuition-primary/80 rounded-xl"
              >
                <div className="group-hover:scale-105 transition-transform duration-150 shrink-0">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-900 via-black to-slate-950 border border-intuition-primary/70 flex items-center justify-center text-intuition-primary shadow-[0_0_14px_rgba(255,80,57,0.3)] overflow-hidden p-2 box-border">
                    <Logo className="h-7 w-7 sm:h-8 sm:w-8 max-h-[85%] max-w-[85%] object-contain object-center" />
                  </div>
                </div>
                <span className="text-lg font-black tracking-[0.18em] font-display whitespace-nowrap min-w-0">
                  <span className="text-[#f8fafc]" style={{ textShadow: '0 0 12px rgba(255,80,57,0.35)' }}>
                    INTU
                  </span>
                  <span className="text-intuition-primary" style={{ textShadow: '0 0 14px rgba(255,80,57,0.55)' }}>
                    RANK
                  </span>
                </span>
              </Link>

              <div className="lg:hidden flex items-center gap-2">
                <NotificationBar walletAddress={walletAddress ?? null} />
                <button
                  onClick={() => {
                    playClick();
                    setIsMenuOpen(!isMenuOpen);
                  }}
                  className="text-intuition-primary p-3 min-h-[40px] min-w-[40px] flex items-center justify-center border border-slate-800 rounded-full bg-black/90 shadow-lg active:scale-95 transition-transform"
                >
                  {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>
          </div>

          {/*
            Hamburger drawer (shown <lg). Was CSS animate-in classes;
            now framer-motion for buttery enter/exit with ease-out-quint,
            scaled backdrop blur, staggered item fade-in.
          */}
          <AnimatePresence>
          {isMenuOpen && (
            <React.Fragment key="layout-hamburger-drawer">
              <motion.div
                className="lg:hidden fixed inset-0 top-[4rem] z-[99] bg-black/80 backdrop-blur-lg"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              />
              <motion.div
                className="lg:hidden absolute w-full left-0 top-full z-[100] bg-gradient-to-b from-[#1e1218] via-[#16101a] to-[#0e0a14] border-b-2 border-intuition-primary/25 max-h-[85vh] overflow-y-auto overflow-x-clip shadow-[0_30px_90px_rgba(0,0,0,0.9),0_-1px_0_rgba(255,80,57,0.30)]"
                initial={{ opacity: 0, y: -12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.99 }}
                transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                style={{ willChange: 'transform, opacity', transformOrigin: '50% 0%' }}
              >
                <div className="px-4 pl-5 pt-4 pb-10 space-y-2 max-w-[100vw]">
                  {ALL_MOBILE_NAV_ITEMS.map((item, index) => {
                    const ext = 'external' in item && item.external;
                    const ap = 'activePaths' in item ? item.activePaths : undefined;
                    const variant = 'variant' in item ? item.variant : undefined;
                    const showHotBadge = 'badge' in item && item.badge === 'hot';
                    const navActive = ap?.length ? ap.includes(pathname) : isActive(item.path);
                    const mobileCls = `relative flex items-center gap-3 min-w-0 pl-5 pr-5 py-4 border-2 text-sm font-semibold font-sans normal-case tracking-normal transition-all rounded-2xl animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both ${
                      ext
                        ? 'text-intuition-success border-intuition-success/45 bg-intuition-success/8 hover:bg-intuition-success/15 hover:border-intuition-success'
                        : navActive
                          ? variant === 'gold'
                            ? 'text-black bg-intuition-warning border-intuition-warning shadow-[0_0_20px_rgba(250,204,21,0.35)]'
                            : variant === 'arena'
                              ? 'text-white bg-gradient-to-r from-[#ff7038] via-intuition-primary to-[#e63c1f] border-intuition-primary shadow-[0_0_24px_rgba(255,80,57,0.45)]'
                              : 'text-black bg-intuition-primary border-intuition-primary'
                          : variant === 'gold'
                            ? 'text-amber-200 border-amber-500/45 bg-amber-950/35 hover:text-amber-50 hover:border-amber-400 hover:bg-amber-500/10'
                            : variant === 'arena'
                              ? 'text-orange-100 border-intuition-primary/55 bg-gradient-to-r from-intuition-primary/20 to-black/50 hover:border-intuition-primary/80 hover:from-intuition-primary/30'
                            : 'text-slate-400 border-slate-900 hover:text-white bg-white/5'
                    }`;
                    const delay = { animationDelay: `${index * 45}ms` };
                    const close = () => {
                      playClick();
                      setIsMenuOpen(false);
                    };
                    if (ext) {
                      return (
                        <a
                          key={`${item.label}-ext`}
                          href={item.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={close}
                          style={delay}
                          className={mobileCls}
                        >
                          <span className="shrink-0 flex items-center justify-center w-5">{item.icon}</span>
                          <span className="min-w-0 break-words">{item.label}</span>
                        </a>
                      );
                    }
                    return (
                      <Link
                        key={`${item.label}-${item.path}`}
                        to={item.path}
                        state={'linkState' in item ? item.linkState : undefined}
                        onClick={close}
                        style={delay}
                        className={mobileCls}
                      >
                        {navActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-black rounded-r" />
                        )}
                        <span className="relative shrink-0 flex items-center justify-center w-5">
                          {showHotBadge ? (
                            <span
                              className="pointer-events-none absolute -right-2 -top-2 z-[1] rounded border border-white/40 bg-black/80 px-[3px] py-px text-[7px] font-black uppercase tracking-tight leading-none text-amber-100 shadow-[0_0_8px_rgba(251,113,133,0.6)]"
                              aria-hidden
                            >
                              HOT
                            </span>
                          ) : null}
                          {item.icon}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="min-w-0 flex-1 break-words">{item.label}</span>
                          {showHotBadge ? (
                            <span
                              className="shrink-0 rounded-md border border-white/35 bg-black/35 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-100"
                              aria-hidden
                            >
                              HOT
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}

                  <a
                    href={TRUST_SWAP_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      playClick();
                      setIsMenuOpen(false);
                    }}
                    style={{ animationDelay: `${ALL_MOBILE_NAV_ITEMS.length * 45}ms` }}
                    className="w-full flex items-center justify-center gap-3 px-5 py-4 border-2 border-intuition-success text-intuition-success font-semibold font-sans text-sm normal-case rounded-full mt-6 hover:bg-intuition-success hover:text-black transition-all animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both"
                  >
                    <Coins size={18} /> Get Trust
                  </a>

                  <button
                    type="button"
                    onClick={handleNewSignal}
                    aria-label="Create a new identity or claim"
                    style={{
                      animationDelay: `${(ALL_MOBILE_NAV_ITEMS.length + 1) * 45}ms`,
                    }}
                    className="w-full flex items-center justify-center gap-3 px-5 py-4 bg-intuition-secondary text-white font-semibold font-sans text-sm normal-case rounded-full shadow-xl mt-2 border-2 border-transparent active:scale-95 transition-transform animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both"
                  >
                    <Plus size={18} /> New identity or claim
                  </button>

                  {walletAddress ? (
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      style={{
                        animationDelay: `${(ALL_MOBILE_NAV_ITEMS.length + 2) * 45}ms`,
                      }}
                      className="w-full py-4 border-2 border-intuition-danger text-intuition-danger font-sans font-semibold text-sm normal-case bg-intuition-danger/5 rounded-2xl mt-2 animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both"
                    >
                      Disconnect wallet
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        playClick();
                        setIsMenuOpen(false);
                        openModal();
                      }}
                      style={{
                        animationDelay: `${(ALL_MOBILE_NAV_ITEMS.length + 2) * 45}ms`,
                      }}
                      className="w-full py-4 border-2 border-intuition-primary text-intuition-primary font-sans font-semibold text-sm normal-case bg-intuition-primary/5 rounded-2xl mt-2 animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both"
                    >
                      Connect wallet
                    </button>
                  )}
                </div>
              </motion.div>
            </React.Fragment>
          )}
          </AnimatePresence>
        </nav>

        {/* Desktop top bar pill cluster (cyan rim + pink CTA) */}
        <div className="hidden lg:flex h-14 shrink-0 items-center w-full border-b border-intuition-primary/10 bg-intuition-dark/90 backdrop-blur-md supports-[backdrop-filter]:bg-intuition-dark/82 relative z-[100] overflow-visible">
          <div className="flex w-full min-w-0 items-center justify-end gap-3 pl-4 pr-[max(1rem,env(safe-area-inset-right))] lg:pr-8">
            {walletAddress && chainId !== CHAIN_ID && (
              <button
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
                className="flex items-center gap-2 px-4 py-2 bg-intuition-danger text-white text-[11px] font-semibold font-sans rounded-full shrink-0 shadow-[0_0_18px_rgba(239,68,68,0.35)] ring-1 ring-white/10 transition-transform active:scale-[0.98]"
              >
                <AlertTriangle size={14} strokeWidth={2} /> Wrong network
              </button>
            )}

            <div className="flex items-center gap-2 rounded-full border border-intuition-primary/30 bg-gradient-to-b from-intuition-primary/[0.09] to-black/50 pl-2 pr-2 py-1.5 shadow-[inset_0_1px_0_0_rgba(255,80,57,0.18)] overflow-visible ring-1 ring-intuition-primary/15">
            <NotificationBar walletAddress={walletAddress ?? null} />

            <button
              type="button"
              onClick={handleNewSignal}
              onMouseEnter={playHover}
              aria-label="Create a new identity or claim"
              title="Create identity or claim"
              className="hidden lg:inline-flex items-center gap-2 px-4 sm:px-5 py-2 min-h-0 text-xs font-semibold font-sans text-white rounded-full bg-intuition-secondary hover:brightness-110 active:scale-[0.98] border border-white/15 shadow-[0_0_22px_rgba(239,68,68,0.45)] hover:shadow-[0_0_32px_rgba(239,68,68,0.55)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intuition-secondary/50"
            >
              <Plus size={16} strokeWidth={2.5} className="shrink-0" aria-hidden />
              <span className="hidden xl:inline whitespace-nowrap">Create identity or claim</span>
              <span className="xl:hidden">Create</span>
            </button>

            <div className="relative flex items-center">
              {walletAddress ? (
                <ProfileBadgeWidget
                  address={walletAddress}
                  isDropdownOpen={isWalletDropdownOpen}
                  onToggleDropdown={toggleDropdown}
                  dropdownRef={dropdownRef}
                >
                  <div className="absolute right-0 mt-3 w-72 z-[110] rounded-3xl animate-dropdown-panel-in border border-intuition-primary/35 bg-intuition-dark shadow-[0_24px_60px_rgba(0,0,0,0.92),0_0_28px_rgba(255,80,57,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-black/50">
                      <div className="space-y-0.5 rounded-[1.35rem] bg-intuition-dark p-1.5">
                        <div className="px-4 py-3 border-b border-white/5 text-[11px] font-semibold font-sans text-slate-500 tracking-wide mb-1">
                          Wallet
                        </div>
                    <a
                      href={TRUST_SWAP_URL}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        playClick();
                        setIsWalletDropdownOpen(false);
                      }}
                      onMouseEnter={playHover}
                      className="w-full flex items-center gap-4 px-4 py-4 text-left text-sm font-semibold font-sans text-intuition-success hover:bg-white/5 transition-colors"
                    >
                      <Coins size={14} /> Get Trust
                    </a>
                    <button
                      onClick={handleCopyAddress}
                      onMouseEnter={playHover}
                      className="w-full flex items-center gap-4 px-4 py-4 text-left text-sm font-medium font-sans text-slate-300 hover:bg-white/5 hover:text-intuition-primary transition-colors"
                    >
                      <Copy size={14} /> Copy address
                    </button>
                    <WalletMenuMusicToggle variant="desktop-wallet" />
                    <button
                      onClick={handleDisconnect}
                      onMouseEnter={playHover}
                      className="w-full flex items-center gap-4 px-4 py-4 text-left text-sm font-semibold font-sans text-intuition-danger hover:bg-intuition-danger/10 transition-colors border-t border-white/5"
                    >
                      <LogOut size={14} /> Disconnect
                    </button>
                  </div>
                </div>
                </ProfileBadgeWidget>
              ) : (
                <button
                  onClick={openModal}
                  onMouseEnter={playHover}
                  className="flex items-center gap-2 px-4 py-2 font-sans text-xs font-semibold rounded-full border border-intuition-primary/40 bg-intuition-primary/10 text-intuition-primary hover:bg-intuition-primary/20 hover:shadow-[0_0_20px_rgba(255,80,57,0.2)] transition-all"
                >
                  <Wallet size={16} className="shrink-0" strokeWidth={2} />
                  Connect wallet
                </button>
              )}
            </div>
            </div>
          </div>
        </div>

        <main
          className={`flex-grow pt-16 lg:pt-0 retro-grid relative z-0 mobile-contain min-w-0 w-full max-w-full ${
            pathname === '/documentation' ? 'overflow-x-visible' : 'overflow-x-clip'
          }`}
        >
          <div
            className={`min-h-full min-w-0 w-full ${
              pathname === '/documentation' ? 'overflow-x-visible' : 'overflow-x-clip'
            }`}
          >
            {children}
          </div>
        </main>

        {ARENA_BATCH_MODE && !pathname.startsWith('/climb') && <ArenaBatchFab />}

        <SiteFooter />
      </div>
    </div>
  );
};

export default Layout;