import React, { Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ARENA_UI_VISIBLE, MAINTENANCE_MODE } from './constants';
import Maintenance from './pages/Maintenance';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import type { Theme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { wagmiConfig, intuitionChain } from './wagmi-config';
import { muiTheme } from './theme/muiTheme';

// IntuRank palette — cinnabar brand for RainbowKit modal theming.
const INTURANK = {
  dark: '#1c1620',
  card: '#251d27',
  border: '#3a2e3c',
  primary: '#ff5039',
  secondary: '#dc2626',
} as const;

const rainbowKitTheme: Theme = (() => {
  const base = darkTheme({
    accentColor: INTURANK.primary,
    accentColorForeground: 'black',
    borderRadius: 'small',
    overlayBlur: 'small',
  });
  return {
    ...base,
    colors: {
      ...base.colors,
      modalBackground: INTURANK.card,
      modalBackdrop: 'rgba(2, 3, 8, 0.88)',
      modalBorder: 'rgba(255,80,57, 0.25)',
      generalBorder: INTURANK.border,
      generalBorderDim: 'rgba(26, 42, 74, 0.7)',
      menuItemBackground: INTURANK.card,
      connectButtonBackground: INTURANK.card,
      connectButtonInnerBackground: INTURANK.dark,
      connectButtonText: INTURANK.primary,
      selectedOptionBorder: INTURANK.primary,
      closeButton: INTURANK.primary,
      closeButtonBackground: INTURANK.card,
      actionButtonSecondaryBackground: INTURANK.card,
      modalText: '#e2e8f0',
      modalTextDim: '#94a3b8',
      modalTextSecondary: '#64748b',
      profileForeground: '#e2e8f0',
      profileAction: INTURANK.card,
      profileActionHover: 'rgba(255,80,57, 0.12)',
    },
  };
})();
import { EmailNotifyProvider } from './contexts/EmailNotifyContext';
import Layout from './components/Layout';
import MobileLayout from './components/MobileLayout';
import { useIsMobile } from './hooks/useIsMobile';
import { useLenis, getLenis } from './hooks/useLenis';
// Eager: Home + MobileHome (landing pages — first paint critical)
import Home from './pages/Home';
import MobileHome from './pages/MobileHome';

// Lazy: everything else. Pulled out of the main bundle into per-route chunks.
const Stats           = lazy(() => import('./pages/Stats'));
const Markets         = lazy(() => import('./pages/Markets'));
const MarketDetail    = lazy(() => import('./pages/MarketDetail'));
const Feed            = lazy(() => import('./pages/Feed'));
const Portfolio       = lazy(() => import('./pages/Portfolio'));
const PublicProfile   = lazy(() => import('./pages/PublicProfile'));
const Account         = lazy(() => import('./pages/Account'));
const KPIDashboard    = lazy(() => import('./pages/KPIDashboard'));
const Documentation   = lazy(() => import('./pages/Documentation'));
const ComingSoon      = lazy(() => import('./pages/ComingSoon'));
const CreateSignal    = lazy(() => import('./pages/CreateSignal'));
const SendTrust       = lazy(() => import('./pages/SendTrust'));
const SkillPlayground = lazy(() => import('./pages/SkillPlayground'));
const DailyTrustHub   = lazy(() => import('./pages/DailyTrustHub'));
const Verdict         = lazy(() => import('./pages/Verdict'));
const Me              = lazy(() => import('./pages/Me'));
const Play            = lazy(() => import('./pages/Play'));
import { ToastContainer } from './components/Toast';
import EmailNotifyModal from './components/EmailNotifyModal';
import { RouteTransition } from './components/RouteTransition';
import { PageLoadingSpinner } from './components/PageLoading';
import ArenaTapOptic from './components/ArenaTapOptic';

const RankedList = lazy(() => import('./pages/RankedList'));
const ArenaPlaceholder = lazy(() => import('./pages/ArenaPlaceholder'));
// Isolated hackathon lane — delegated "sign once to play" (MetaMask Smart Accounts / ERC-7710).
const DelegatedArena = lazy(() => import('./pages/DelegatedArena'));

/** Thin code-split boundary for `/climb` so the main bundle stays smaller when users never open Arena. */
const ArenaRouteFallback: React.FC = () => (
  <div
    className="flex min-h-[min(100dvh,920px)] w-full flex-col items-center justify-center gap-3 bg-[#05070c]"
    role="status"
    aria-live="polite"
  >
    <PageLoadingSpinner />
    <span className="text-[10px] font-mono font-bold uppercase tracking-[0.35em] text-slate-600">Loading</span>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * AppRoutes — runtime chrome + routes. Lives inside the Router so we can
 * read the viewport via `useIsMobile()` and pick the matching layout +
 * landing page. Desktop bundle/markup stays identical to before; mobile
 * users get `MobileLayout` (floating bottom tabs + header menu sheet) and `MobileHome`.
 */
const AppRoutes: React.FC = () => {
  // Desktop-only smooth scroll (mobile uses native scroll for gesture safety).
  useLenis();

  const isMobile = useIsMobile();
  const location = useLocation();
  const onArena = location.pathname === '/climb';

  // Smooth scroll-to-top on every route change. Desktop uses Lenis for a
  // buttery momentum-eased glide; mobile uses native `scrollTo` (which the
  // browser already animates smoothly on iOS/Android). Skipped on /climb
  // because Arena has its own per-phase scroll choreography.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (location.pathname === '/climb') return;
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo(0, { duration: 0.85, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    } else {
      const reduceMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }, [location.pathname]);
  const Shell = isMobile ? MobileLayout : Layout;
  const Landing = isMobile ? MobileHome : Home;
  /**
   * Only pathname drives the transition. Including `location.search` made every
   * `/climb?list=…` / `view=` change replay the full-route fade (exit opacity 0) —
   * felt like the Arena “black flicker” when switching lists or tabs.
   */
  const routeKey =
    location.pathname === '/climb' ? '/climb' : `${location.pathname}${location.search}`;

  const routeTree = (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/agents" element={<Navigate to="/markets" replace />} />
      <Route path="/agents/:id" element={<Navigate to="/markets/:id" replace />} />

      <Route path="/portfolio" element={<Portfolio />} />
      <Route path="/account" element={<Account />} />
      <Route path="/profile/:address" element={<PublicProfile />} />
      <Route path="/dashboard" element={<Navigate to="/portfolio" replace />} />

      <Route path="/stats" element={<Stats />} />
      <Route path="/markets" element={<Navigate to="/markets/atoms" replace />} />
      <Route path="/markets/atoms" element={<Markets />} />
      <Route path="/markets/triples" element={<Markets />} />
      <Route path="/markets/lists" element={<Markets />} />
      <Route path="/markets/:id" element={<MarketDetail />} />
      <Route path="/feed" element={<Feed />} />
      <Route path="/health" element={<KPIDashboard />} />
      <Route path="/documentation" element={<Documentation />} />
      <Route path="/skill-playground" element={<SkillPlayground />} />

      <Route path="/compare" element={<Navigate to="/climb" replace />} />
      <Route path="/coming-soon" element={<ComingSoon />} />
      <Route path="/create" element={<CreateSignal />} />
      <Route path="/send-trust" element={<SendTrust />} />
      <Route path="/hub/trust-tools" element={<DailyTrustHub />} />
      <Route path="/verdict/:id" element={<Verdict />} />
      <Route path="/me" element={<Me />} />
      <Route path="/me/:address" element={<Me />} />
      <Route path="/play" element={<Play />} />
      <Route
        path="/climb"
        element={
          ARENA_UI_VISIBLE ? (
            <Suspense fallback={<ArenaRouteFallback />}>
              <RankedList />
            </Suspense>
          ) : (
            <Suspense fallback={<ArenaRouteFallback />}>
              <ArenaPlaceholder />
            </Suspense>
          )
        }
      />
      <Route
        path="/climb/delegated"
        element={
          <Suspense fallback={<ArenaRouteFallback />}>
            <DelegatedArena />
          </Suspense>
        }
      />
    </Routes>
  );

  return (
    <>
      <ArenaTapOptic />
      <Shell>
      <ToastContainer />
      {/*
        Arena (/climb) has its own gesture flows — opt out of Lenis on this
        route so wheel/touch events on the Arena page reach gesture handlers
        directly. `data-lenis-prevent` tells Lenis to skip this subtree.
      */}
      <RouteTransition
        routeKey={routeKey}
        variant={isMobile ? 'mobile-slide' : 'desktop-fade'}
        {...(onArena ? { 'data-lenis-prevent': true } : {})}
      >
        <Suspense fallback={<ArenaRouteFallback />}>
          {routeTree}
        </Suspense>
      </RouteTransition>
    </Shell>
    </>
  );
};

const App: React.FC = () => {
  if (MAINTENANCE_MODE) {
    return <Maintenance />;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={muiTheme}>
          <CssBaseline />
          <RainbowKitProvider
            theme={rainbowKitTheme}
            modalSize="compact"
            coolMode={false}
            initialChain={intuitionChain}
            appInfo={{
              appName: 'IntuRank',
              learnMoreUrl: 'https://intuition.systems',
            }}
          >
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <EmailNotifyProvider>
                <AppRoutes />
                <EmailNotifyModal />
              </EmailNotifyProvider>
            </Router>
          </RainbowKitProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;
