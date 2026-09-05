/**
 * SignalNav — the four destinations, and the shell the new surfaces live in.
 *
 * Ask · Play · Create · Me. Create carries the accent because it is the act that feeds
 * everything else: Play consumes eight claims a day and creation is the only supply, so it
 * earns a destination rather than a floating button people learn to ignore.
 *
 * A bottom bar under the thumb on mobile, a left rail on desktop — the design's two
 * treatments, one component. Motion is transform and opacity only.
 */
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Layers, PlusCircle, Diamond } from 'lucide-react';
import { press } from '../services/motion';

interface Dest {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** The accented one — Create. */
  accent?: boolean;
}

const DESTINATIONS: Dest[] = [
  { to: '/ask', label: 'Ask', icon: <Search className="h-5 w-5" strokeWidth={2.2} /> },
  { to: '/play', label: 'Play', icon: <Layers className="h-5 w-5" strokeWidth={2.2} /> },
  { to: '/create', label: 'Create', icon: <PlusCircle className="h-5 w-5" strokeWidth={2.2} />, accent: true },
  { to: '/me', label: 'Me', icon: <Diamond className="h-5 w-5" strokeWidth={2.2} /> },
];

/** Routes that render inside this shell rather than the legacy layout. */
export const SIGNAL_ROUTES = ['/ask', '/play', '/create', '/me', '/verdict'];

export function isSignalRoute(pathname: string): boolean {
  return SIGNAL_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const Item: React.FC<{ dest: Dest; rail?: boolean }> = ({ dest, rail }) => (
  <NavLink
    to={dest.to}
    className={({ isActive }) =>
      [
        'group relative flex items-center gap-3 rounded-xl transition-colors',
        rail ? 'px-3 py-2.5' : 'flex-1 flex-col gap-1 px-2 py-2',
        isActive ? 'text-primary' : dest.accent ? 'text-primary-ink' : 'text-ink-muted hover:text-ink',
      ].join(' ')
    }
  >
    {({ isActive }) => (
      <>
        <motion.span whileTap={press} className="flex items-center justify-center">
          {dest.icon}
        </motion.span>
        <span
          className={`font-display text-[10px] font-black uppercase tracking-wider ${
            rail ? 'text-xs tracking-wide' : ''
          }`}
        >
          {dest.label}
        </span>
        {/* The active marker slides between items rather than fading in place. */}
        {isActive && (
          <motion.span
            layoutId={rail ? 'signal-rail-active' : 'signal-tab-active'}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={
              rail
                ? 'absolute inset-0 -z-10 rounded-xl bg-surface-2'
                : 'absolute inset-x-3 -top-px -z-10 h-0.5 rounded-full bg-primary'
            }
          />
        )}
      </>
    )}
  </NavLink>
);

export const SignalNav: React.FC = () => (
  <>
    {/* Mobile: bottom bar, thumb-reachable */}
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-bg/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-0 lg:hidden"
    >
      {DESTINATIONS.map((d) => (
        <Item key={d.to} dest={d} />
      ))}
    </nav>

    {/* Desktop: left rail */}
    <nav
      aria-label="Main"
      className="fixed left-0 top-0 z-40 hidden h-full w-[232px] flex-col border-r border-border bg-bg px-4 py-6 lg:flex"
    >
      <div className="mb-8 flex items-center gap-2 px-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-fill font-display text-[10px] font-black text-bg">
          IR
        </span>
        <span className="font-display text-sm font-black uppercase tracking-wider text-ink">IntuRank</span>
      </div>
      <div className="flex flex-col gap-1">
        {DESTINATIONS.map((d) => (
          <Item key={d.to} dest={d} rail />
        ))}
      </div>
    </nav>
  </>
);

/** Wraps a signal surface with the nav and the padding it needs to clear it. */
export const SignalShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-bg text-ink">
      <SignalNav />
      <main key={pathname} className="pb-24 lg:pb-0 lg:pl-[232px]">
        {children}
      </main>
    </div>
  );
};

export default SignalShell;
