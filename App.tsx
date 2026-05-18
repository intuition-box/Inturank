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

// IntuRank palette
const INTURANK = {
  dark: '#020308',
  card: '#080a12',
  border: '#1a2a4a',
  primary: '#00f3ff',
  secondary: '#ff1e6d',
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
      modalBorder: 'rgba(0, 243, 255, 0.25)',
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
      profileActionHover: 'rgba(0, 243, 255, 0.12)',
    },
  };
})();
import { EmailNotifyProvider } from './contexts/EmailNotifyContext';
import Layout from './components/Layout';
import MobileLayout from './components/MobileLayout';
import { useIsMobile } from './hooks/useIsMobile';
import Home from './pages/Home';
import MobileHome from './pages/MobileHome';
import Stats from './pages/Stats';
import Markets from './pages/Markets';
import MarketDetail from './pages/MarketDetail';
import Feed from './pages/Feed';
import Portfolio from './pages/Portfolio';
import PublicProfile from './pages/PublicProfile';
import Account from './pages/Account';
import KPIDashboard from './pages/KPIDashboard';
import Documentation from './pages/Documentation';
import ComingSoon from './pages/ComingSoon';
import CreateSignal from './pages/CreateSignal';
import SendTrust from './pages/SendTrust';
import SkillPlayground from './pages/SkillPlayground';
import DailyTrustHub from './pages/DailyTrustHub';
import { ToastContainer } from './components/Toast';
import EmailNotifyModal from './components/EmailNotifyModal';
import { RouteTransition } from './components/RouteTransition';
import { PageLoadingSpinner } from './components/PageLoading';
import ArenaTapOptic from './components/ArenaTapOptic';

const RankedList = lazy(() => import('./pages/RankedList'));
const ArenaPlaceholder = lazy(() => import('./pages/ArenaPlaceholder'));

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
  const isMobile = useIsMobile();
  const location = useLocation();
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
    </Routes>
  );

  return (
    <>
      <ArenaTapOptic />
      <Shell>
      <ToastContainer />
      <RouteTransition routeKey={routeKey} variant={isMobile ? 'mobile-slide' : 'desktop-fade'}>
        {routeTree}
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
