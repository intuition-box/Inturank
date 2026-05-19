import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Twitter,
  Github,
  Send,
  FileText,
  ExternalLink,
  BookOpen,
  Globe,
  Store,
  Activity,
  Trophy,
  Wallet,
} from 'lucide-react';
import { playHover } from '../services/audio';
import { APP_VERSION, EXPLORER_URL } from '../constants';
import Logo from './Logo';

const TRUST_SWAP_URL =
  'https://aero.drome.eth.limo/swap?from=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&to=0x6cd905df2ed214b22e0d48ff17cd4200c1c6d8a3&chain0=8453&chain1=8453';

const FOOTER_EXPLORE: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/markets', label: 'Markets', Icon: Store },
  { to: '/feed', label: 'Activity', Icon: Activity },
  { to: '/stats', label: 'Leaderboard', Icon: Trophy },
  { to: '/portfolio', label: 'Portfolio', Icon: Wallet },
];

type FooterEco =
  | { kind: 'route'; to: string; label: string; Icon: LucideIcon }
  | { kind: 'external'; href: string; label: string; Icon: LucideIcon; trust?: boolean };

const FOOTER_ECOSYSTEM: FooterEco[] = [
  { kind: 'route', to: '/documentation', label: 'Documentation', Icon: FileText },
  { kind: 'external', href: TRUST_SWAP_URL, label: 'Get Trust', Icon: ExternalLink, trust: true },
  { kind: 'external', href: 'https://intuition.systems', label: 'Intuition home', Icon: ExternalLink },
  { kind: 'external', href: 'https://docs.intuition.systems', label: 'Intuition Docs', Icon: BookOpen },
  { kind: 'external', href: EXPLORER_URL, label: 'Block explorer', Icon: Globe },
];

const MediumIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42zM24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75c.66 0 1.19 2.58 1.19 5.75z" />
  </svg>
);

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const IntuitionTargetLogo = () => (
  <svg
    width="60"
    height="60"
    viewBox="0 0 60 60"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="group-hover/powered:scale-110 transition-transform duration-700"
  >
    <circle cx="30" cy="30" r="28" stroke="#00f3ff" strokeWidth="1" strokeOpacity="0.2" />
    <circle cx="30" cy="30" r="20" stroke="#00f3ff" strokeWidth="1" strokeOpacity="0.4" />
    <circle cx="30" cy="30" r="12" stroke="#00f3ff" strokeWidth="2" />
    <circle cx="30" cy="30" r="4" fill="#00f3ff" />
  </svg>
);

export interface SiteFooterProps {
  /** Tighter vertical rhythm for the mobile shell (main already sets bottom padding for the dock). */
  compact?: boolean;
}

const SiteFooter: React.FC<SiteFooterProps> = ({ compact = false }) => {
  const socialBtn = compact
    ? 'w-12 h-12 rounded-xl border border-white/10'
    : 'w-14 h-14 sm:w-14 sm:h-14 md:w-14 md:h-14 rounded-2xl border border-white/10';

  return (
    <footer
      className={`border-t border-white/5 bg-[#020308] z-20 relative overflow-hidden ${
        compact ? 'mt-10 py-10' : 'mt-auto py-12 md:py-24'
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-intuition-primary/[0.04] to-transparent pointer-events-none" />
      <div
        className={`max-w-[1600px] mx-auto relative z-10 ${
          compact ? 'px-4' : 'px-4 sm:px-6 lg:px-10'
        }`}
      >
        <div
          className={`grid items-start ${
            compact
              ? 'grid-cols-1 gap-8 mb-10'
              : 'grid-cols-1 md:grid-cols-4 gap-12 md:gap-16 lg:gap-20 mb-12 md:mb-24'
          }`}
        >
          <div className={`space-y-8 ${compact ? '' : 'md:col-span-2 md:space-y-10'}`}>
            <div className="flex items-center gap-4 sm:gap-6 group cursor-pointer" onMouseEnter={playHover}>
              <div
                className={`${
                  compact
                    ? 'w-14 h-14 rounded-2xl p-2'
                    : 'w-16 h-16 sm:w-20 sm:h-20 md:w-28 md:h-28 rounded-3xl p-2 sm:p-2.5'
                } border-2 border-intuition-primary flex items-center justify-center text-intuition-primary group-hover:shadow-[0_0_55px_rgba(0,243,255,0.7)] group-hover:scale-110 group-hover:rotate-3 transition-all duration-700 overflow-hidden bg-gradient-to-br from-slate-900 via-black to-slate-950`}
              >
                <Logo className="w-full h-full max-h-[88%] max-w-[88%] object-contain" />
              </div>
              <span
                className={`${
                  compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl md:text-5xl'
                } font-display font-black tracking-tight text-white group-hover:text-intuition-primary transition-all duration-500 uppercase text-glow-blue`}
              >
                INTU<span className="group-hover:text-white transition-colors">RANK</span>
              </span>
            </div>
            <p
              className={`text-slate-200 font-mono uppercase tracking-wider font-black opacity-80 leading-relaxed ${
                compact ? 'text-[11px] max-w-xl' : 'text-sm max-w-lg'
              }`}
            >
              Quantifying reputation as a tradable asset on the Intuition Network. Establishing the global source of
              truth via semantic dynamics.
            </p>
            <div className={`flex flex-wrap ${compact ? 'gap-3' : 'gap-6'}`}>
              <a
                href="https://x.com/inturank"
                target="_blank"
                rel="noreferrer"
                onMouseEnter={playHover}
                className={`${socialBtn} bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:border-intuition-primary hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:-translate-y-1 transition-all duration-300 group`}
              >
                <Twitter size={compact ? 20 : 24} className="group-hover:scale-110 transition-transform" />
              </a>
              <a
                href="https://github.com/intuition-box/INTURANK"
                target="_blank"
                rel="noreferrer"
                onMouseEnter={playHover}
                className={`${socialBtn} bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:border-intuition-primary hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:-translate-y-1 transition-all duration-300 group`}
              >
                <Github size={compact ? 20 : 24} className="group-hover:scale-110 transition-transform" />
              </a>
              <a
                href="https://discord.gg/gz62ER2e7a"
                target="_blank"
                rel="noreferrer"
                onMouseEnter={playHover}
                className={`${socialBtn} bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:border-intuition-primary hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:-translate-y-1 transition-all duration-300 group`}
              >
                <DiscordIcon className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} group-hover:scale-110 transition-transform`} />
              </a>
              <a
                href="https://t.me/inturank"
                target="_blank"
                rel="noreferrer"
                onMouseEnter={playHover}
                className={`${socialBtn} bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:border-intuition-primary hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:-translate-y-1 transition-all duration-300 group`}
              >
                <Send size={compact ? 20 : 24} className="group-hover:scale-110 transition-transform" />
              </a>
              <a
                href="https://inturank.medium.com"
                target="_blank"
                rel="noreferrer"
                onMouseEnter={playHover}
                className={`${socialBtn} bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:border-intuition-primary hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] hover:-translate-y-1 transition-all duration-300 group`}
              >
                <MediumIcon className={`${compact ? 'w-5 h-5' : 'w-7 h-7'} group-hover:scale-110 transition-transform`} />
              </a>
            </div>
          </div>

          {compact ? (
            <div className="col-span-full grid grid-cols-2 gap-x-4 gap-y-2 sm:gap-x-8 min-w-0">
              <div className="flex flex-col gap-3 min-w-0">
                <h4 className="text-sm sm:text-lg font-bold font-display text-intuition-primary tracking-wide leading-tight">
                  Explore
                </h4>
                <nav
                  className="flex flex-col gap-1 font-sans text-[13px] sm:text-[15px] font-semibold leading-snug"
                  aria-label="Explore"
                >
                  {FOOTER_EXPLORE.map(({ to, label, Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      className="group inline-flex items-center gap-1.5 py-1.5 text-slate-200 transition-colors hover:text-intuition-primary"
                    >
                      {label}
                      <Icon
                        size={14}
                        className="shrink-0 text-slate-500 transition-colors group-hover:text-intuition-primary"
                        aria-hidden
                      />
                    </Link>
                  ))}
                </nav>
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <h4 className="text-sm sm:text-lg font-bold font-display text-intuition-secondary tracking-wide leading-tight text-glow-red">
                  Ecosystem
                </h4>
                <nav
                  className="flex flex-col gap-1 font-sans text-[13px] sm:text-[15px] font-semibold leading-snug"
                  aria-label="Ecosystem"
                >
                  {FOOTER_ECOSYSTEM.map((row) => {
                    if (row.kind === 'route') {
                      const Icon = row.Icon;
                      return (
                        <Link
                          key={row.to}
                          to={row.to}
                          className="group inline-flex items-center gap-1.5 py-1.5 text-slate-200 transition-colors hover:text-intuition-secondary"
                        >
                          {row.label}
                          <Icon
                            size={14}
                            className="shrink-0 text-slate-500 transition-colors group-hover:text-intuition-secondary"
                            aria-hidden
                          />
                        </Link>
                      );
                    }
                    const Icon = row.Icon;
                    return (
                      <a
                        key={row.href}
                        href={row.href}
                        target="_blank"
                        rel="noreferrer"
                        className={
                          row.trust
                            ? 'group inline-flex items-center gap-1.5 py-1.5 text-intuition-success transition-colors hover:text-white'
                            : 'group inline-flex items-center gap-1.5 py-1.5 text-slate-200 transition-colors hover:text-intuition-secondary'
                        }
                      >
                        {row.label}
                        <Icon
                          size={14}
                          className={
                            row.trust
                              ? 'shrink-0 opacity-90 text-intuition-success transition-colors group-hover:text-white'
                              : 'shrink-0 text-slate-500 transition-colors group-hover:text-intuition-secondary'
                          }
                          aria-hidden
                        />
                      </a>
                    );
                  })}
                </nav>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 min-w-0">
                <h4 className="text-lg sm:text-xl font-bold font-display text-intuition-primary tracking-wide leading-tight">
                  Explore
                </h4>
                <nav
                  className="flex flex-col gap-1 font-sans text-[15px] sm:text-base font-semibold leading-snug"
                  aria-label="Explore"
                >
                  {FOOTER_EXPLORE.map(({ to, label, Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      className="group inline-flex items-center gap-2 py-2 text-slate-200 transition-colors hover:text-intuition-primary"
                    >
                      {label}
                      <Icon
                        size={16}
                        className="shrink-0 text-slate-500 transition-colors group-hover:text-intuition-primary"
                        aria-hidden
                      />
                    </Link>
                  ))}
                </nav>
              </div>

              <div className="flex flex-col gap-4 min-w-0">
                <h4 className="text-lg sm:text-xl font-bold font-display text-intuition-secondary tracking-wide leading-tight text-glow-red">
                  Ecosystem
                </h4>
                <nav
                  className="flex flex-col gap-1 font-sans text-[15px] sm:text-base font-semibold leading-snug"
                  aria-label="Ecosystem"
                >
                  {FOOTER_ECOSYSTEM.map((row) => {
                    if (row.kind === 'route') {
                      const Icon = row.Icon;
                      return (
                        <Link
                          key={row.to}
                          to={row.to}
                          className="group inline-flex items-center gap-2 py-2 text-slate-200 transition-colors hover:text-intuition-secondary"
                        >
                          {row.label}
                          <Icon
                            size={16}
                            className="shrink-0 text-slate-500 transition-colors group-hover:text-intuition-secondary"
                            aria-hidden
                          />
                        </Link>
                      );
                    }
                    const Icon = row.Icon;
                    return (
                      <a
                        key={row.href}
                        href={row.href}
                        target="_blank"
                        rel="noreferrer"
                        className={
                          row.trust
                            ? 'group inline-flex items-center gap-2 py-2 text-intuition-success transition-colors hover:text-white'
                            : 'group inline-flex items-center gap-2 py-2 text-slate-200 transition-colors hover:text-intuition-secondary'
                        }
                      >
                        {row.label}
                        <Icon
                          size={16}
                          className={
                            row.trust
                              ? 'shrink-0 opacity-90 text-intuition-success transition-colors group-hover:text-white'
                              : 'shrink-0 text-slate-500 transition-colors group-hover:text-intuition-secondary'
                          }
                          aria-hidden
                        />
                      </a>
                    );
                  })}
                </nav>
              </div>
            </>
          )}
        </div>

        <div
          className={`border-t border-white/10 grid grid-cols-1 md:grid-cols-3 items-center justify-items-center ${
            compact ? 'pt-10 gap-8' : 'pt-16 gap-12'
          }`}
        >
          <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest font-black text-center md:text-left justify-self-start">
            v{APP_VERSION} · © 2025 IntuRank
          </div>

          <div className="flex flex-col items-center group/powered relative">
            <span className="text-[11px] font-black font-mono text-slate-500 uppercase tracking-[0.8em] mb-4 group-hover/powered:text-white transition-all duration-500">
              Powered By
            </span>
            <a href="https://intuition.systems" target="_blank" rel="noreferrer" className="flex items-center gap-8 no-underline">
              <IntuitionTargetLogo />
              <span
                className={`${
                  compact ? 'text-2xl md:text-4xl' : 'text-3xl md:text-5xl lg:text-6xl'
                } font-display font-black tracking-[0.25em] text-white group-hover/powered:text-intuition-primary transition-all duration-700 uppercase text-glow-blue`}
              >
                INTUITION
              </span>
            </a>
            <div className="absolute -bottom-6 w-48 h-px bg-gradient-to-r from-transparent via-intuition-primary/40 to-transparent" />
          </div>

          <div className="flex items-center justify-center md:justify-end gap-3 text-[10px] font-black font-mono text-intuition-secondary uppercase tracking-[0.5em] text-glow-red justify-self-end">
            <div className="w-2.5 h-2.5 bg-intuition-secondary shadow-[0_0_15px_#ff1e6d] motion-safe:animate-pulse" />
            Live
          </div>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
