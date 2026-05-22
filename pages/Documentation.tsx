import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, type LucideIcon } from 'react';
import {
  Terminal,
  Cpu,
  Network,
  TrendingUp,
  Target,
  Fingerprint,
  BookOpen,
  Database,
  Zap,
  ArrowRight,
  ChevronRight,
  Activity,
  Sparkles,
  Command,
  Layers,
  ExternalLink,
  Trophy,
  PlusCircle,
  Radio,
  Send,
  Wallet,
  UserCircle,
  FileText,
  ArrowLeft,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { playClick, playHover } from '../services/audio';
import {
  APP_VERSION,
  APP_VERSION_DISPLAY,
  ARENA_ENABLED,
  ARENA_UI_VISIBLE,
  ARENA_XP_PER_RANK_PICK,
  CHAIN_ID,
  CURRENCY_SYMBOL,
  EXPLORER_URL,
  LINEAR_CURVE_ID,
  MULTI_VAULT_ADDRESS,
  FEE_PROXY_ADDRESS,
  NETWORK_NAME,
  OFFSET_PROGRESSIVE_CURVE_ID,
  PAGE_HERO_TITLE,
  PROTOCOL_XP_ADD_TO_LIST,
  PROTOCOL_XP_ARENA_RANK_ADD_TO_LIST_MULT,
  PROTOCOL_XP_CREATE_ATOM,
  PROTOCOL_XP_CREATE_CLAIM,
  PROTOCOL_XP_MARKET_ACQUIRE,
  PROTOCOL_XP_SEND_TRUST,
  PROTOCOL_XP_SEND_TRUST_MIN_TRUST_UNITS,
  PROTOCOL_XP_SKILL_ATOM,
  PROTOCOL_XP_SKILL_CHAT,
  PROTOCOL_XP_SKILL_TRIPLE,
} from '../constants';

type SectionDef = {
  id: string;
  navLabel: string;
  icon: LucideIcon;
};

const SECTIONS: SectionDef[] = [
  { id: 'intro', navLabel: 'Introduction', icon: Terminal },
  { id: 'mission', navLabel: 'Mission', icon: Target },
  { id: 'concepts', navLabel: 'Core concepts', icon: Fingerprint },
  { id: 'markets', navLabel: 'Markets & curves', icon: TrendingUp },
  { id: 'ares', navLabel: 'ARES layer', icon: Sparkles },
  { id: 'skill', navLabel: 'Intuition Skill', icon: Cpu },
  { id: 'leaderboards', navLabel: 'Leaderboards', icon: Trophy },
  { id: 'activity-xp', navLabel: 'How XP works', icon: Zap },
  { id: 'create-flows', navLabel: 'Create & Send TRUST', icon: PlusCircle },
  { id: 'portfolio-profile', navLabel: 'Portfolio & profile', icon: Wallet },
  { id: 'guide', navLabel: 'How to use IntuRank', icon: Command },
  { id: 'glossary', navLabel: 'Glossary', icon: BookOpen },
];

function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 md:scroll-mt-28 border-b border-white/[0.06] py-10 md:py-14 last:border-b-0">
      <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight mb-6">{title}</h2>
      <div className="max-w-[52rem] space-y-4 text-[15px] leading-7 text-slate-300">{children}</div>
    </section>
  );
}

function ProseLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-intuition-primary hover:text-intuition-primary/90 underline underline-offset-4 decoration-intuition-primary/40"
    >
      {children}
      <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
    </a>
  );
}

function MobileDocSectionJump({
  sections,
  activeId,
  onSelect,
}: {
  sections: SectionDef[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];
  const ActiveIcon = active.icon;

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="lg:hidden mb-8 relative z-30">
      <div className="rounded-2xl border border-intuition-primary/35 bg-gradient-to-br from-[#0a1018]/98 via-[#06080f]/95 to-black/90 p-[1px] shadow-[0_0_0_1px_rgba(0,243,255,0.08),0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        <div className="rounded-[0.9rem] bg-[#05070c]/90 backdrop-blur-md p-4">
          <p className="text-[11px] font-semibold text-intuition-primary/90 uppercase tracking-[0.22em] mb-3 flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-intuition-primary shadow-[0_0_10px_rgba(0,243,255,0.9)]" />
            Jump to section
          </p>
          <button
            type="button"
            id="doc-section-jump-trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls="doc-section-jump-list"
            onClick={() => {
              playClick();
              setOpen((o) => !o);
            }}
            onMouseEnter={playHover}
            className="w-full flex items-center gap-3 rounded-xl border border-intuition-primary/55 bg-black/65 px-4 py-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_24px_rgba(0,243,255,0.08)] motion-safe:transition-[border-color,box-shadow,transform] motion-safe:duration-200 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-intuition-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070c]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-intuition-primary/25 bg-intuition-primary/10">
              <ActiveIcon
                className="w-4 h-4 text-intuition-primary drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]"
                aria-hidden
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white leading-snug truncate">{active.navLabel}</span>
              <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-0.5">
                {sections.length} sections
              </span>
            </span>
            <ChevronDown
              className={`w-5 h-5 shrink-0 text-slate-400 motion-safe:transition-transform motion-safe:duration-200 ${
                open ? 'rotate-180 text-intuition-primary' : ''
              }`}
              aria-hidden
            />
          </button>

          <div
            id="doc-section-jump-list"
            role="listbox"
            aria-labelledby="doc-section-jump-trigger"
            className={`mt-3 overflow-hidden rounded-xl border border-white/[0.09] bg-[#070a12]/95 shadow-[0_20px_48px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.05)] motion-safe:transition-[max-height,opacity] motion-safe:duration-300 motion-reduce:transition-none ${
              open ? 'max-h-[min(65vh,22rem)] opacity-100' : 'max-h-0 opacity-0 pointer-events-none border-transparent shadow-none'
            }`}
          >
            <ul className="max-h-[min(65vh,22rem)] overflow-y-auto overscroll-contain py-2 px-2 space-y-0.5">
              {sections.map((s) => {
                const Icon = s.icon;
                const selected = s.id === activeId;
                return (
                  <li key={s.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={playHover}
                      onClick={() => {
                        onSelect(s.id);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm motion-safe:transition-[background,box-shadow,transform,color] motion-safe:duration-200 ${
                        selected
                          ? 'bg-gradient-to-r from-intuition-primary/22 via-intuition-primary/10 to-transparent text-white shadow-[inset_0_0_0_1px_rgba(0,243,255,0.35),0_0_24px_rgba(0,243,255,0.12)]'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] active:scale-[0.99]'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${selected ? 'text-intuition-primary' : 'opacity-70'}`}
                        aria-hidden
                      />
                      <span className="flex-1 min-w-0 leading-snug">{s.navLabel}</span>
                      {selected && <Check className="w-4 h-4 shrink-0 text-intuition-primary" strokeWidth={2.5} aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Match DocSection scroll-mt (24 = 6rem) + small buffer so the active TOC tracks the reading line. */
const SECTION_ACTIVATION_OFFSET_PX = 120;

/** Offset for TOC / in-page jumps: matches `md:scroll-mt-28` (7rem) on sections so headings align below the column top. */
const DOC_ANCHOR_SCROLL_MARGIN_PX = 112;

function sectionTopInScrollContainer(el: HTMLElement, scrollRoot: HTMLElement): number {
  return el.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop;
}

const Documentation: React.FC = () => {
  const location = useLocation();
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const mainRef = useRef<HTMLDivElement>(null);
  /** While set, scroll-based highlighting is frozen so TOC clicks are not overwritten mid-smooth-scroll. */
  const pendingSectionRef = useRef<string | null>(null);
  const scrollLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const tocListRef = useRef<HTMLDivElement>(null);
  const tocItemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [tocHighlight, setTocHighlight] = useState({ top: 0, height: 0 });

  const updateTocHighlight = useCallback(() => {
    const wrap = tocListRef.current;
    if (!wrap) return;
    const idx = SECTIONS.findIndex((s) => s.id === activeSection);
    const li = tocItemRefs.current[idx];
    if (!li) return;
    const w = wrap.getBoundingClientRect();
    const l = li.getBoundingClientRect();
    setTocHighlight({ top: l.top - w.top + wrap.scrollTop, height: l.height });
  }, [activeSection]);

  useLayoutEffect(() => {
    const idx = SECTIONS.findIndex((s) => s.id === activeSection);
    const li = tocItemRefs.current[idx];
    li?.scrollIntoView({ block: 'nearest' });
    updateTocHighlight();
  }, [updateTocHighlight, activeSection]);

  useEffect(() => {
    const ro = new ResizeObserver(() => updateTocHighlight());
    const wrap = tocListRef.current;
    if (wrap) ro.observe(wrap);
    const onWin = () => updateTocHighlight();
    window.addEventListener('resize', onWin, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWin);
    };
  }, [updateTocHighlight]);

  const computeActiveFromScroll = useCallback((): string => {
    const main = mainRef.current;
    const mq = window.matchMedia('(min-width: 1024px)');
    const scrollRoot: HTMLElement | null = mq.matches && main ? main : document.documentElement;
    if (!scrollRoot) return SECTIONS[0].id;

    const scrollTop =
      mq.matches && main ? main.scrollTop : window.scrollY || document.documentElement.scrollTop;
    const line = scrollTop + SECTION_ACTIVATION_OFFSET_PX;

    let active = SECTIONS[0].id;
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (!el) continue;
      const top =
        mq.matches && main
          ? sectionTopInScrollContainer(el, main)
          : el.getBoundingClientRect().top + window.scrollY;
      if (line >= top) active = s.id;
    }
    return active;
  }, []);

  const syncActiveFromScroll = useCallback(() => {
    if (pendingSectionRef.current) return;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const next = computeActiveFromScroll();
      setActiveSection((prev) => (prev === next ? prev : next));
    });
  }, [computeActiveFromScroll]);

  useEffect(() => {
    const main = mainRef.current;
    const onScroll = () => syncActiveFromScroll();
    const mq = window.matchMedia('(min-width: 1024px)');

    window.addEventListener('scroll', onScroll, { passive: true });
    main?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    mq.addEventListener('change', onScroll);

    syncActiveFromScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      main?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      mq.removeEventListener('change', onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [syncActiveFromScroll]);

  /** Scroll docs column (or window on mobile) to a section — shared by TOC clicks and deep links (`/documentation#activity-xp`). */
  const applySectionScroll = useCallback((id: string, behavior: ScrollBehavior) => {
    const target = document.getElementById(id);
    if (!target) return false;

    const mq = window.matchMedia('(min-width: 1024px)');
    const main = mainRef.current;
    if (mq.matches && main) {
      if (id === 'intro') {
        main.scrollTo({ top: 0, behavior });
      } else {
        const y = sectionTopInScrollContainer(target, main) - DOC_ANCHOR_SCROLL_MARGIN_PX;
        main.scrollTo({ top: Math.max(0, y), behavior });
      }
    } else if (id === 'intro') {
      window.scrollTo({ top: 0, behavior });
    } else {
      target.scrollIntoView({ behavior, block: 'start' });
    }
    return true;
  }, []);

  /** Deep link / hash: jump to "How XP works" etc. without firing TOC click sound. */
  useLayoutEffect(() => {
    if (location.pathname !== '/documentation') return;
    const raw = (location.hash || '').replace(/^#/, '').trim();
    if (!raw || !SECTIONS.some((s) => s.id === raw)) return;
    setActiveSection(raw);
    requestAnimationFrame(() => {
      applySectionScroll(raw, 'auto');
    });
  }, [location.pathname, location.hash, applySectionScroll]);

  const scrollTo = (id: string) => {
    playClick();
    const target = document.getElementById(id);
    if (!target) return;

    if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
    pendingSectionRef.current = id;
    setActiveSection(id);

    applySectionScroll(id, 'smooth');

    let released = false;
    const releaseLock = () => {
      if (released) return;
      released = true;
      scrollLockTimerRef.current = null;
      pendingSectionRef.current = null;
      setActiveSection(computeActiveFromScroll());
    };

    scrollLockTimerRef.current = setTimeout(releaseLock, 700);

    const mq = window.matchMedia('(min-width: 1024px)');
    const main = mainRef.current;
    const scrollEndTarget: HTMLElement | Window = mq.matches && main ? main : window;
    const onScrollEnd = () => {
      if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
      releaseLock();
    };
    scrollEndTarget.addEventListener('scrollend', onScrollEnd, { once: true });
  };

  return (
    <div className="w-full min-h-screen bg-[#020308] selection:bg-intuition-primary selection:text-black lg:min-h-0 lg:h-[calc(100dvh-7rem)] lg:max-h-[calc(100dvh-7rem)] lg:overflow-hidden lg:flex lg:flex-col">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 md:py-12 w-full lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between shrink-0 mb-8 sm:mb-9 lg:mb-8 w-full">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-black border-2 border-intuition-primary/80 flex items-center justify-center rounded-2xl sm:rounded-3xl shadow-[0_0_32px_rgba(0,243,255,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]">
              <FileText size={26} className="text-intuition-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-500 font-sans mb-0.5">
                Brought to you by{' '}
                <Link
                  to="/"
                  onClick={playClick}
                  onMouseEnter={playHover}
                  className="font-semibold text-intuition-primary hover:text-intuition-primary/85 transition-colors"
                >
                  IntuRank
                </Link>
              </p>
              <h1 className={PAGE_HERO_TITLE}>Documentation</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
            <Link
              to="/"
              onClick={playClick}
              onMouseEnter={playHover}
              className="px-4 sm:px-5 py-2.5 bg-white/5 border border-white/10 hover:border-intuition-primary text-slate-300 hover:text-white text-sm font-medium rounded-2xl inline-flex items-center gap-2 transition-all"
            >
              <ArrowLeft size={14} /> Back
            </Link>
            <Link
              to="/markets"
              onClick={playClick}
              onMouseEnter={playHover}
              className="px-4 sm:px-5 py-2.5 bg-white/5 border-2 border-intuition-primary/40 hover:border-intuition-primary hover:bg-intuition-primary/10 text-intuition-primary hover:text-white text-sm font-medium transition-all rounded-2xl inline-flex items-center gap-2 shadow-[0_0_20px_rgba(0,243,255,0.12)]"
            >
              Markets <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://docs.intuition.systems"
              target="_blank"
              rel="noopener noreferrer"
              onClick={playClick}
              onMouseEnter={playHover}
              className="px-4 sm:px-5 py-2.5 bg-intuition-primary text-black text-sm font-semibold rounded-2xl shadow-[0_0_28px_rgba(0,243,255,0.35)] inline-flex items-center gap-2"
            >
              <BookOpen size={14} /> Intuition Docs <ExternalLink size={10} className="opacity-80" />
            </a>
          </div>
        </header>

        {/*
          Desktop: only <main> scrolls; the TOC stays in the left column (no fixed/JS overlap).
        */}
        <div className="flex flex-col lg:flex-row lg:gap-10 xl:gap-14 lg:items-stretch lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <aside className="hidden lg:flex w-[260px] shrink-0 flex-col min-h-0">
            <nav
              className="group/toc flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-xl border border-white/[0.08] bg-[#0a0c12]/95 backdrop-blur-md p-3 shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
              aria-label="Documentation sections"
            >
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">
                On this page
              </p>
              <div ref={tocListRef} className="relative min-h-0">
                <div
                  className="pointer-events-none absolute left-0 right-0 top-0 z-0 h-0"
                  aria-hidden
                >
                  <div
                    className="absolute left-0 right-0 top-0 min-h-[2.25rem] rounded-lg border-l-[3px] border-intuition-primary bg-gradient-to-r from-intuition-primary/[0.2] via-intuition-primary/[0.08] to-white/[0.04] ring-1 ring-inset ring-white/[0.07] shadow-[0_0_0_1px_rgba(0,243,255,0.1),0_6px_28px_rgba(0,243,255,0.12)] will-change-[transform,height] motion-safe:transition-[transform,height,opacity] motion-safe:duration-500 motion-reduce:transition-none motion-safe:[transition-timing-function:cubic-bezier(0.33,1,0.68,1)]"
                    style={{
                      transform: `translateY(${tocHighlight.top}px) scaleY(1)`,
                      height: Math.max(0, tocHighlight.height),
                      opacity: tocHighlight.height > 0 ? 1 : 0,
                    }}
                  />
                </div>
                <ul className="relative z-10 m-0 list-none space-y-1 p-0">
                  {SECTIONS.map((s, i) => {
                    const Icon = s.icon;
                    const active = activeSection === s.id;
                    return (
                      <li
                        key={s.id}
                        ref={(el) => {
                          tocItemRefs.current[i] = el;
                        }}
                        className="relative"
                      >
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => scrollTo(s.id)}
                          onMouseEnter={playHover}
                          className={`w-full text-left flex items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-colors duration-300 ${
                            active
                              ? 'text-white font-medium'
                              : 'text-slate-400 hover:text-slate-100'
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 mt-0.5 shrink-0 transition-all duration-300 ${
                              active
                                ? 'text-intuition-primary opacity-100 scale-110 drop-shadow-[0_0_8px_rgba(0,243,255,0.45)]'
                                : 'opacity-60'
                            }`}
                            aria-hidden
                          />
                          <span className="leading-snug">{s.navLabel}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </nav>
          </aside>

          <div
            ref={mainRef}
            role="main"
            className="min-w-0 flex-1 min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1 scroll-smooth"
          >
            <div className="mb-10 md:mb-14 max-w-[52rem]">
              <p className="text-[11px] font-mono text-slate-500 uppercase tracking-[0.2em] mb-3">
                {APP_VERSION_DISPLAY} · {NETWORK_NAME} · chain {CHAIN_ID}
              </p>
              <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
                A full-stack guide to IntuRank {APP_VERSION_DISPLAY}: the trust graph, how markets price conviction with
                bonding curves, what each major screen is for, and how to operate safely on {NETWORK_NAME}. Use it
                alongside the <ProseLink href="https://docs.intuition.systems">Intuition protocol docs</ProseLink> for
                deeper contract-level detail.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm">
                <ProseLink href={EXPLORER_URL}>Block explorer</ProseLink>
              </div>
            </div>

            <div className="lg:hidden mb-8 max-w-[52rem]">
              <MobileDocSectionJump sections={SECTIONS} activeId={activeSection} onSelect={scrollTo} />
            </div>

            <DocSection id="intro" title="Introduction">
              <p>
                <strong className="text-slate-100 font-semibold">IntuRank</strong> is a web client for the{' '}
                <strong className="text-slate-100 font-semibold">Intuition</strong> trust graph: you browse and trade{' '}
                <strong className="text-slate-100 font-semibold">reputation markets</strong> where each market is backed
                by on-chain <strong className="text-slate-100 font-semibold">terms</strong> (atoms or triples), priced
                shares, and live liquidity. The app reads indexed graph data, merges it with wallet state, and walks you
                through deposits, redemptions, and claims without hiding that everything ultimately settles on-chain as{' '}
                <strong className="text-slate-100 font-semibold">TRUST</strong> ({CURRENCY_SYMBOL}).
              </p>
              <p>
                In practice you move between <strong className="text-slate-100 font-semibold">Markets</strong> (atoms,
                triples, and lists), <strong className="text-slate-100 font-semibold">market detail</strong> pages for any
                term,                 <strong className="text-slate-100 font-semibold">Portfolio</strong> for your positions, PnL, and
                activity history, <strong className="text-slate-100 font-semibold">Profile</strong> (
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/account</code>, public{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/profile/:address</code>) for your
                wallet summary or any trader you look up, <strong className="text-slate-100 font-semibold">Feed</strong> for
                network activity,{' '}
                <strong className="text-slate-100 font-semibold">Stats</strong> for leaderboards and epoch-scoped
                performance, <strong className="text-slate-100 font-semibold">Create atom or claim</strong> and{' '}
                <strong className="text-slate-100 font-semibold">Send TRUST</strong> from the nav for direct creation and
                transfers, <strong className="text-slate-100 font-semibold">Intel → Intuition Skill</strong> for
                conversational transaction building, and (when enabled){' '}
                <strong className="text-slate-100 font-semibold">The Arena</strong> for stance-based comparison.
                Documentation (this page) and health views round out operator tooling.
              </p>
              <p>
                Deployments target <strong className="text-slate-100 font-semibold">{NETWORK_NAME}</strong>, EVM chain ID{' '}
                <strong className="text-slate-100 font-semibold">{CHAIN_ID}</strong>. Always confirm balances, contract
                targets, and calldata in your wallet before signing. For hashes, events, and bytecode, use the official{' '}
                <ProseLink href={EXPLORER_URL}>block explorer</ProseLink>.
              </p>
              <div className="not-prose grid sm:grid-cols-2 gap-4 mt-6">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-intuition-primary" />
                    Signal quality
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Ranks and activity feeds blend vault economics with heuristics (for example denoising) so that raw
                    volume alone does not tell the whole story. Treat rankings as one input: read the triples, curve, and
                    liquidity on each term you care about.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-intuition-secondary" />
                    Markets you can verify
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Every market page ties together metadata, linked claims, and curve parameters. Before sizing ingress or
                    exit, verify the term ID, curve ID, and fee behavior match your intent, then cross-check large moves on
                    the explorer.
                  </p>
                </div>
              </div>
            </DocSection>

            <DocSection id="mission" title="Mission">
              <p>
                Open networks struggle with spam, Sybil identities, and contradictory narratives that are cheap to
                produce. Intuition treats{' '}
                <strong className="text-slate-100 font-semibold">belief as something you express with capital</strong>:
                staking, curves, and fees make conviction visible and expensive to fake at meaningful scale. The graph
                stays permissionless: anyone can create atoms and triples, but sustaining a position in a live market
                requires TRUST and attention to execution risk.
              </p>
              <p>
                IntuRank&apos;s job is to make that economics legible: surfaces for discovery and comparison, transparent
                previews of vault math (deposit, redeem, slippage), and tooling that points back to the same on-chain
                objects developers and agents use elsewhere. It is a terminal for operators, not a black box.
              </p>
              <ul className="list-disc pl-5 space-y-2 marker:text-slate-500">
                <li>
                  <strong className="text-slate-200">Reward real signal.</strong> Early, consistent support on coherent
                  terms can show up in price and rank, but nothing is guaranteed: markets are adversarial and liquidity can
                  move quickly.
                </li>
                <li>
                  <strong className="text-slate-200">Raise the cost of noise.</strong> Creation fees, curve slope, and
                  redemption paths reduce drive-by flooding of the graph relative to sustained conviction.
                </li>
                <li>
                  <strong className="text-slate-200">Composable reputation.</strong> Atoms and triples are stable IDs:
                  dashboards, indexers, agents, and DAOs can all refer to the same term IDs and vault state.
                </li>
                <li>
                  <strong className="text-slate-200">User sovereignty.</strong> You keep custody of keys; the app proposes
                  transactions and you approve them in your wallet. There is no custodial bridge inside IntuRank itself.
                </li>
              </ul>
            </DocSection>

            <DocSection id="concepts" title="Core concepts">
              <p>
                Intuition&apos;s knowledge layer is a graph of <strong className="text-slate-100 font-semibold">terms</strong>.
                An <strong className="text-slate-100 font-semibold">atom</strong> is a single term: a person, project,
                tag, or concept identified on-chain. A <strong className="text-slate-100 font-semibold">triple</strong> is
                another kind of term: a structured claim (subject atom, predicate atom, object atom) such as &quot;Alice →
                works_at → Acme&quot;. Both atoms and triples can have vaults, shares, and markets attached. The
                protocol also supports curated <strong className="text-slate-100 font-semibold">lists</strong> (for example
                identities added under a list predicate) that you can browse under Markets.
              </p>
              <p>
                On-chain creation flows (for example via FeeProxy) pay TRUST to register atoms and triples; deposits into
                MultiVault-style vaults are separate actions that move TRUST into curve-backed liquidity for an existing
                term. IntuRank surfaces term IDs, share balances, and curve choice so you always know which contract path
                you are on.
              </p>

              <div className="not-prose grid md:grid-cols-2 gap-4 mt-2">
                <div className="rounded-lg border border-white/10 p-5 bg-[#080a10]">
                  <div className="flex items-center gap-2 mb-3 text-intuition-primary">
                    <Database className="w-5 h-5" />
                    <h3 className="text-base font-semibold text-white">Atoms</h3>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Atoms are the atomic units of identity and meaning in the graph. Each has a stable bytes32 ID and can
                    carry metadata (for example labels or URIs resolved by the indexer). In the UI, an atom detail page shows
                    linked triples where it appears, vault metrics, and rank relative to other markets you compare.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 p-5 bg-[#080a10]">
                  <div className="flex items-center gap-2 mb-3 text-intuition-secondary">
                    <Network className="w-5 h-5" />
                    <h3 className="text-base font-semibold text-white">Triples</h3>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Triples encode semantic claims between atoms. They are first-class terms with their own IDs and vaults,
                    so you can stake on a specific statement, not only on an entity. Conflicting triples can coexist; the
                    market mechanism does not resolve truth, it prices attention and capital around competing claims.
                  </p>
                </div>
              </div>

              <h3 className="text-base font-semibold text-slate-100 mt-8 mb-2">Vaults, shares, and curves</h3>
              <p>
                A <strong className="text-slate-100 font-semibold">vault</strong> holds TRUST against a term and a{' '}
                <strong className="text-slate-100 font-semibold">curve ID</strong>. Depositing buys shares at the current
                curve price; redeeming burns shares for TRUST back, subject to fees and slippage. Curve ID{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">{LINEAR_CURVE_ID}</code> is the
                linear (stable-style) curve; curve ID{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">
                  {OFFSET_PROGRESSIVE_CURVE_ID}
                </code>{' '}
                is the offset progressive (discovery-style) curve with steeper response to supply. The UI labels these
                flavors in plain language; the exact parameters live in protocol configuration and on-chain storage.
              </p>

              <h3 className="text-base font-semibold text-slate-100 mt-6 mb-2">Typical flow</h3>
              <ol className="list-decimal pl-5 space-y-3 marker:text-slate-500">
                <li>
                  <strong className="text-slate-200">Orient.</strong> Find a term in Markets or via search, open its detail
                  page, and read triples, liquidity, curve type, and recent activity before you commit size.
                </li>
                <li>
                  <strong className="text-slate-200">Commit (ingress).</strong> Deposit TRUST into the vault for that term
                  and curve. You receive shares representing your position on the bonding curve; the transaction may
                  include min-shares and fee lines shown in the flow.
                </li>
                <li>
                  <strong className="text-slate-200">Signal.</strong> While you hold shares, your capital is tied to that
                  term&apos;s market. Other participants can join or leave, which moves price along the curve.
                </li>
                <li>
                  <strong className="text-slate-200">Exit or rebalance.</strong> Redeem shares (fully or in batch where
                  supported) to take TRUST out, or move to another term after comparing opportunity and fees.
                </li>
              </ol>
            </DocSection>

            <DocSection id="markets" title="Markets and bonding curves">
              <p>
                Each market is a <strong className="text-slate-100 font-semibold">bonding curve</strong> over outstanding
                shares: as more TRUST is deposited, the marginal cost of the next share changes according to the curve
                family. That yields continuous liquidity (you can usually buy or sell into the pool) while making early
                conviction structurally different from late entry, especially on progressive curves.
              </p>
              <p>
                IntuRank shows previews for deposits and redemptions: expected shares, fees, and slippage relative to pool
                state. Always read those lines before signing. High volatility, thin liquidity, or MEV can still move the
                realized price away from the preview; large trades warrant smaller clips or manual price checks on the{' '}
                <ProseLink href={EXPLORER_URL}>explorer</ProseLink>.
              </p>
              <p className="text-xs font-mono text-slate-500 bg-black/40 border border-white/5 rounded-lg px-3 py-2">
                App release {APP_VERSION} · curve IDs {LINEAR_CURVE_ID} (linear) and {OFFSET_PROGRESSIVE_CURVE_ID}{' '}
                (offset progressive) match protocol constants in this build
              </p>

              <div className="not-prose grid md:grid-cols-2 gap-4 mt-4">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-semibold text-white">Offset progressive (discovery)</h3>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed mb-3">
                    Curve ID {OFFSET_PROGRESSIVE_CURVE_ID}. Steeper response of price to supply changes, which rewards early
                    positioning in newer or contested markets and can mean sharper moves as flow arrives.
                  </p>
                  <p className="text-xs font-mono text-slate-500">Often described as discovery or &quot;alpha&quot; style</p>
                </div>
                <div className="rounded-lg border border-intuition-primary/25 bg-intuition-primary/[0.05] p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-intuition-primary/15 text-intuition-primary">
                      <Layers className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-semibold text-white">Linear (stable)</h3>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed mb-3">
                    Curve ID {LINEAR_CURVE_ID}. More predictable marginal pricing for incremental supply, often preferred
                    when depth is high or when participants want smoother ingress over time.
                  </p>
                  <p className="text-xs font-mono text-slate-500">Utility or &quot;stable&quot; style in product copy</p>
                </div>
              </div>
              <p className="text-sm text-slate-500 mt-4">
                Fee routing (for example via FeeProxy) and exact math live in deployed contracts. If you integrate
                programmatically, use the same ABIs and addresses as this app or the official Intuition SDKs, and verify
                against the explorer for upgrades.
              </p>
            </DocSection>

            <DocSection id="ares" title="ARES (intelligence layer)">
              <p>
                <strong className="text-slate-100 font-semibold">ARES</strong> is IntuRank&apos;s umbrella for
                generative and heuristic overlays on top of chain and indexer data. In the product you will see it in
                places like <strong className="text-slate-100 font-semibold">AI briefings</strong> on market detail pages
                (short natural-language summaries of a term&apos;s claims and activity), pulsed summaries on the{' '}
                <strong className="text-slate-100 font-semibold">Feed</strong>, and similar callouts where the UI needs a
                quick narrative. None of that replaces the underlying triples, vault balances, or transaction history:
                it is a lens, not a source of truth.
              </p>
              <p>
                When the deployment has AI features turned on, those summaries use a hosted language model; if the
                assistant is unavailable, you still get template or on-chain-only context so markets and portfolio keep
                working.
              </p>
              <p>
                <strong className="text-slate-100 font-semibold">Skill Playground</strong> (Intel menu) is related but
                distinct: it uses Gemini to help craft and review <em>transactions</em> (atoms, triples, deposits) from
                natural language, then you sign with your wallet. ARES-style copy on Feed or market pages does not execute
                trades by itself.
              </p>
              <div className="not-prose flex items-start gap-3 rounded-lg border border-violet-500/20 bg-violet-500/[0.06] p-4 mt-2">
                <Sparkles className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-400 leading-relaxed">
                  Treat AI copy as a hint, not proof: verify important decisions against raw graph data and the explorer.
                  Nothing here is investment or legal advice.
                </p>
              </div>
            </DocSection>

            <DocSection id="skill" title="Intuition Skill Playground">
              <p>
                The <strong className="text-slate-100 font-semibold">Intuition Skill Playground</strong> (
                <strong className="text-slate-100 font-semibold">Intel → Intuition Skill</strong>, route{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/skill-playground</code>) is a
                chat workspace where a Gemini-powered agent follows the same mental model as the official{' '}
                <strong className="text-slate-100 font-semibold">Intuition Skill</strong> for coding agents. You describe
                what you want in plain language; the UI builds calldata against{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">FeeProxy</code> and{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">MultiVault</code>, shows a human
                summary, and you execute with <strong className="text-slate-100 font-semibold">Sign &amp; broadcast</strong>{' '}
                in your wallet. Raw hex is not required for the default flows.
              </p>
              <p>
                The chat needs the AI assistant to be enabled for this app (whoever runs IntuRank handles that on the server
                or build). You can open the Playground and read replies without a wallet; connect on {NETWORK_NAME} (chain{' '}
                {CHAIN_ID}) when you are ready to sign transactions and spend TRUST.
              </p>
              <p>
                <strong className="text-slate-100 font-semibold">Activity XP</strong> (wallet connected): +{PROTOCOL_XP_SKILL_CHAT}{' '}
                per assistant reply (daily cap). Signing a Skill-proposed <strong className="text-slate-200">atom</strong> adds
                up to +{PROTOCOL_XP_SKILL_ATOM}; signing a <strong className="text-slate-200">triple</strong> adds up to +
                {PROTOCOL_XP_SKILL_TRIPLE} — on-chain amounts scale with your vault deposit (see{' '}
                <Link
                  to="/documentation#activity-xp"
                  className="text-intuition-primary hover:text-intuition-primary/90 underline-offset-2 hover:underline font-medium"
                >
                  How XP works
                </Link>
                ).
              </p>
              <p>
                Typical actions include <strong className="text-slate-100 font-semibold">creating atoms</strong> (labels and
                deposits), <strong className="text-slate-100 font-semibold">creating triples</strong> from subject, predicate,
                and object labels (missing atoms can be created in the same flow), and{' '}
                <strong className="text-slate-100 font-semibold">vault deposits</strong> into existing terms. The sidebar
                shows approximate costs: on the order of <strong className="text-slate-100 font-semibold">~0.15 {CURRENCY_SYMBOL}</strong>{' '}
                plus your chosen vault deposit for atom and triple creation in many configurations; deposit size for
                staking varies with the curve and pool. First-time flows may ask for{' '}
                <strong className="text-slate-100 font-semibold">FeeProxy approval</strong> before the protocol accepts your
                transactions.
              </p>
              <p>
                <strong className="text-slate-100 font-semibold">Minimum TRUST for creations via the Skill:</strong> Any atom
                or triple the Intuition Skill agent proposes uses a vault deposit of at least{' '}
                <strong className="text-slate-100 font-semibold">0.5 TRUST</strong> ({CURRENCY_SYMBOL}). The JSON field{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">depositTrust</code> must be{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">&quot;0.5&quot;</code> or higher (that
                floor matches the bonding-curve minimum for claims in the app). Protocol creation fees are separate and still
                apply on top of the deposit.
              </p>

              <h3 className="text-base font-semibold text-slate-100 mt-8 mb-3">Language and multilingual use</h3>
              <p>
                The Playground is <strong className="text-slate-100 font-semibold">multilingual in practice</strong>: there
                is no separate language selector in the UI. The assistant follows your{' '}
                <strong className="text-slate-100 font-semibold">written language</strong> for explanations, protocol
                teaching, and clarifying questions. The system prompt instructs the agent to mirror the user&apos;s language
                when possible and to keep machine-readable JSON keys in English so the client can parse them. On-chain string
                fields (atom labels, triple parts, descriptions) may use any Unicode text you intend to register as metadata.
              </p>
              <p>
                <strong className="text-slate-100 font-semibold">What stays English:</strong> JSON property names in code
                blocks (<code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">action</code>,{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">label</code>,{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">depositTrust</code>,{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">chainId</code>,{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">subject</code>,{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">predicate</code>,{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">object</code>,{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">description</code>).{' '}
                <strong className="text-slate-100 font-semibold">Values</strong> inside those fields can be French, Spanish,
                Japanese, and so on. Fixed chrome in the chat (for example &quot;Sign &amp; broadcast&quot;, &quot;Technical
                details (JSON)&quot;) remains English because it is rendered by the app, not the model.
              </p>
              <p>
                <strong className="text-slate-100 font-semibold">Quality and limits:</strong> Fluency varies by language and
                model version. Rare languages or mixed scripts may get weaker answers. The agent may fall back to English if it
                cannot follow safely. Always verify JSON, amounts, and network before signing. Nothing here is a guarantee of
                regulatory or legal correctness in any jurisdiction.
              </p>

              <h3 className="text-base font-semibold text-slate-100 mt-8 mb-3">Example prompts (copy into the chat)</h3>
              <p className="text-slate-400 text-sm">
                Below are realistic user messages. Expected behavior: replies in the same language; when a transaction is
                proposed, a markdown <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">json</code>{' '}
                fenced block with English keys; string values reflect your wording. Keep{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">depositTrust</code> at{' '}
                <strong className="text-slate-200">0.5</strong> or above for atom and triple creation.
              </p>

              <div className="not-prose space-y-4 mt-4 text-[13px]">
                <div className="rounded-xl border border-white/10 bg-[#080a10] p-4">
                  <p className="text-xs font-semibold text-intuition-primary mb-2">French · create atom</p>
                  <pre className="text-slate-300 font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                    {`Crée un atome nommé « Réseau Nova » avec un dépôt de 0,5 TRUST. Description : communauté open-source autour de la réputation on-chain.`}
                  </pre>
                  <p className="text-slate-500 mt-2 leading-relaxed">
                    Expect a French explanation and JSON with{' '}
                    <code className="text-[11px] bg-white/5 px-1 rounded">"label": "Réseau Nova"</code> (or NFC-normalized
                    form) and an English <code className="text-[11px] bg-white/5 px-1 rounded">"action": "createAtom"</code>.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#080a10] p-4">
                  <p className="text-xs font-semibold text-intuition-primary mb-2">Spanish · triple / claim</p>
                  <pre className="text-slate-300 font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                    {`Quiero registrar la afirmación: el sujeto es "DAO Alpha", el predicado es "colabora_con", el objeto es "Estudio Beta". Depósito de bóveda 0.5 TRUST.`}
                  </pre>
                  <p className="text-slate-500 mt-2 leading-relaxed">
                    Expect Spanish narrative plus{' '}
                    <code className="text-[11px] bg-white/5 px-1 rounded">createTriple</code> JSON;{' '}
                    <code className="text-[11px] bg-white/5 px-1 rounded">subject</code>,{' '}
                    <code className="text-[11px] bg-white/5 px-1 rounded">predicate</code>,{' '}
                    <code className="text-[11px] bg-white/5 px-1 rounded">object</code> values carry the Spanish labels you
                    gave.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#080a10] p-4">
                  <p className="text-xs font-semibold text-intuition-primary mb-2">German · question only (no tx)</p>
                  <pre className="text-slate-300 font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                    {`Was ist der Unterschied zwischen einem Atom und einem Triple im Intuition-Protokoll? Antworte kurz auf Deutsch.`}
                  </pre>
                  <p className="text-slate-500 mt-2 leading-relaxed">
                    Expect a German answer with no mandatory transaction; the agent should not invent JSON unless you ask to
                    create something.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#080a10] p-4">
                  <p className="text-xs font-semibold text-intuition-primary mb-2">Japanese · explain + create</p>
                  <pre className="text-slate-300 font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                    {`TRUSTのデポジット最小値を日本語で一言で教えて。そのあと「オープン研究ラボ」という名前の原子を0.5 TRUSTで作るための手順を出して。`}
                  </pre>
                  <p className="text-slate-500 mt-2 leading-relaxed">
                    Expect Japanese prose, then (if the model follows the flow) a{' '}
                    <code className="text-[11px] bg-white/5 px-1 rounded">createAtom</code> block with{' '}
                    <code className="text-[11px] bg-white/5 px-1 rounded">label</code> including the Japanese name.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#080a10] p-4">
                  <p className="text-xs font-semibold text-intuition-primary mb-2">English · explicit triple (labels)</p>
                  <pre className="text-slate-300 font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                    {`Create a triple: subject "Alice", predicate "endorses", object "Bob", depositTrust 0.5, chain 1155. One-line description: social trust edge.`}
                  </pre>
                  <p className="text-slate-500 mt-2 leading-relaxed">
                    Baseline path most docs assume; JSON values stay Latin script here but could be any script in other
                    sessions.
                  </p>
                </div>
              </div>

              <h3 className="text-base font-semibold text-slate-100 mt-8 mb-3">Example JSON shape (keys must stay English)</h3>
              <p className="text-sm text-slate-400 mb-3">
                The app parses only the English keys. Non-English content lives in the string values:
              </p>
              <pre className="not-prose rounded-xl border border-intuition-primary/25 bg-black/50 p-4 text-[11px] leading-relaxed text-slate-400 font-mono overflow-x-auto">
                {`{
  "action": "createTriple",
  "subject": "DAO Alpha",
  "predicate": "colabora_con",
  "object": "Estudio Beta",
  "depositTrust": "0.5",
  "chainId": "1155",
  "description": "Alianza entre DAO y estudio (ejemplo de documentación)."
}`}
              </pre>

              <p>
                Outside the browser, developers install the same skill with{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">
                  npx skills add 0xintuition/agent-skills --skill intuition
                </code>{' '}
                so agents emit compatible transaction intents. The Playground is the interactive counterpart: same ABIs and
                addresses (
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">{FEE_PROXY_ADDRESS}</code>,{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">{MULTI_VAULT_ADDRESS}</code>), your
                wallet as signer.
              </p>
              <div className="not-prose flex flex-wrap gap-3 mt-4">
                <Link
                  to="/skill-playground"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 rounded-lg bg-intuition-primary/15 border border-intuition-primary/35 px-4 py-2 text-intuition-primary font-medium hover:bg-intuition-primary/25 transition-colors text-sm"
                >
                  Open Skill Playground <ArrowRight className="w-4 h-4" />
                </Link>
                <ProseLink href="https://docs.intuition.systems">Protocol documentation</ProseLink>
              </div>
            </DocSection>

            <DocSection id="leaderboards" title="Leaderboards (Stats)">
              <p>
                The <strong className="text-slate-100 font-semibold">Leaderboards</strong> page (
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/stats</code>, nav label{' '}
                <strong className="text-slate-100 font-semibold">LEADERBOARD</strong>) ranks activity and performance from
                the indexer. Use the tabs to switch views; data refreshes when you change tab or reload.
              </p>
              <ul className="list-disc pl-5 space-y-2 marker:text-slate-500">
                <li>
                  <strong className="text-slate-200">TOP STAKERS.</strong> Wallets ranked by staking-related weighting.
                  Rows link to <strong className="text-slate-100 font-semibold">public profiles</strong> (
                  <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/profile/:address</code>) when
                  applicable. ENS names may resolve for display.
                </li>
                <li>
                  <strong className="text-slate-200">TOP PNL.</strong> Period-based profit-and-loss leaderboard sourced from
                  the protocol&apos;s PnL leaderboard API. Figures are cached briefly in the client for responsiveness; treat
                  rankings as indicative and confirm large claims against your own accounting.
                </li>
                <li>
                  <strong className="text-slate-200">MOST SUPPORTED.</strong> Agents (terms) with strong supportive flow
                  under the indexer&apos;s &quot;support&quot; semantics. Deep links go to{' '}
                  <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/markets/:id</code>.
                </li>
                <li>
                  <strong className="text-slate-200">Claim entropy.</strong> A discovery list for{' '}
                  <strong className="text-slate-100">markets</strong> (atoms and claims): we sort by a simple IntuRank score
                  (explained below). Same score everywhere; small labels like <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">MARKET_ENTROPY_INDEX</code> or{' '}
                  <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">PROTOCOL_MAGNITUDE</code> are just different names for that one number.
                </li>
                <li>
                  <strong className="text-slate-200">TOP CLAIMS.</strong> Semantic triples ranked for attention in the graph.
                </li>
              </ul>

              <h4 className="text-sm font-semibold text-slate-100 mt-6 mb-2">Claim entropy in plain English</h4>
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-white">In one sentence:</strong> IntuRank gives each market a single number so that
                pools with <strong className="text-slate-100">more TRUST locked</strong>, a <strong className="text-slate-100">higher share price</strong>, and{' '}
                <strong className="text-slate-100">more open positions</strong> tend to rank higher. The name
                &quot;entropy&quot; is just a label. This is <strong className="text-slate-100">not</strong> a separate on
                chain entropy reading. The app computes the number from ordinary vault data from the indexer.
              </p>

              <div className="not-prose rounded-xl border border-white/10 bg-[#0a0d14] p-4 sm:p-5 my-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Three parts (we add them up)</p>
                <ul className="list-none space-y-3 text-sm text-slate-300 leading-relaxed pl-0">
                  <li className="flex gap-3">
                    <span className="shrink-0 font-mono text-intuition-primary font-bold">1</span>
                    <span>
                      <strong className="text-white">Size of the pool.</strong> More {CURRENCY_SYMBOL} in the vault lifts
                      the score. We use a <em className="text-slate-400 not-italic">log</em> curve so the list is not only
                      about who has the most capital. Extra liquidity still helps, with a little less impact each time the pool
                      roughly doubles.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 font-mono text-intuition-primary font-bold">2</span>
                    <span>
                      <strong className="text-white">Price of one share.</strong> If one share costs more {CURRENCY_SYMBOL}, the
                      score moves up a little. We use the index price when present. If not,{' '}
                      <code className="text-[11px] bg-black/40 px-1 rounded">pool / shares</code> when there are shares, else a
                      small safe default.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="shrink-0 font-mono text-intuition-primary font-bold">3</span>
                    <span>
                      <strong className="text-white">How busy the vault is.</strong> More open positions add a little. We use
                      a square root so one very large count does not override everything else.
                    </span>
                  </li>
                </ul>
              </div>

              <p className="text-slate-400 text-sm leading-relaxed">
                <strong className="text-slate-200">On screen</strong> you get{' '}
                <code className="text-[11px] bg-white/5 px-1 rounded">Score: …</code> and the table sorted{' '}
                <strong className="text-slate-200">high → low</strong>. For discovery only, not investment advice.
              </p>

              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-5 mb-2">The formula</p>
              <p className="text-slate-400 text-sm mb-2">
                <em className="not-italic text-slate-300">A</em> = total assets in {CURRENCY_SYMBOL}.{' '}
                <em className="not-italic text-slate-300">P</em> = {CURRENCY_SYMBOL} per share: use the index price, or{' '}
                <em className="not-italic text-slate-300">A / S</em> when share supply <em className="not-italic text-slate-300">S &gt; 0</em>, or{' '}
                <em className="not-italic text-slate-300">1</em> if there are no shares.{' '}
                <em className="not-italic text-slate-300">N</em> = number of positions.
              </p>
              <pre className="not-prose rounded-xl border border-white/10 bg-[#080a10] p-4 text-[12px] leading-relaxed text-slate-300 font-mono overflow-x-auto my-2">
{`score = 10 * log10(A + 1) + 2 * P + 5 * sqrt(N + 1)`}
              </pre>
              <p className="text-slate-500 text-xs leading-relaxed">
                Code: <code className="bg-white/5 px-1 rounded">computeClaimEntropyScore</code> in{' '}
                <code className="bg-white/5 px-1 rounded">services/statsClaimEntropy.ts</code>. For protocol-level definitions, see{' '}
                <a
                  className="text-intuition-primary hover:underline"
                  href="https://docs.intuition.systems"
                  target="_blank"
                  rel="noreferrer"
                >
                  Intuition Docs
                </a>
                .
              </p>

              <p>
                For <strong className="text-slate-100 font-semibold">TOP STAKERS</strong> and{' '}
                <strong className="text-slate-100 font-semibold">TOP PNL</strong>, a command-style search accepts{' '}
                <strong className="text-slate-100 font-semibold">wallet address</strong> or{' '}
                <strong className="text-slate-100 font-semibold">ENS</strong> with autocomplete suggestions. That helps you
                jump to a profile or verify how an address appears on the board. Epoch windows for seasonal stats are defined
                in app constants and rotate; read the in-app labels for the active range.
              </p>
              <div className="not-prose mt-4">
                <Link
                  to="/stats"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-intuition-primary hover:bg-white/10 transition-colors"
                >
                  Open Leaderboards <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </DocSection>

            <DocSection id="activity-xp" title="How XP works">
              <p>
                There are <strong className="text-slate-100 font-semibold">two kinds of XP</strong>.{' '}
                <strong className="text-slate-100 font-semibold">Arena XP</strong> is what you get from playing the Arena — the fast voting flow on{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/climb</code>.{' '}
                <strong className="text-slate-100 font-semibold">Activity XP</strong> is extra credit for things you do on-chain (markets, create flows, sending TRUST, Arena vault deposits, and Signal vouch batches). The app adds it when your wallet qualifies; numbers stay in sync with the little hints on each page.
              </p>
              <p className="text-slate-400 text-sm leading-relaxed">
                These amounts can change when the product updates; they all come from one place in the code so nothing drifts.
              </p>

              <div className="not-prose overflow-x-auto rounded-xl border border-white/10 bg-[#0a0d14] my-4">
                <table className="w-full min-w-[280px] text-left text-sm text-slate-300">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3 font-semibold">What you did</th>
                      <th className="px-4 py-3 font-semibold">Typical max XP</th>
                      <th className="px-4 py-3 font-semibold">In plain terms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Voted in the Arena (Climb)</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">≥ {ARENA_XP_PER_RANK_PICK}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Arena XP — not chain trading. You get more when you turn up the stake on your picks.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Bought into a market (deposit TRUST)</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_MARKET_ACQUIRE}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Activity XP — scales with how much {CURRENCY_SYMBOL} you deposit on that buy. Dust-sized buys earn little or none; big buys earn up to this max.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Created an atom</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_CREATE_ATOM}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Activity XP — scales with your vault deposit on create; protocol minimum alone usually isn’t enough for the full amount.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Created a claim (triple)</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_CREATE_CLAIM}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Activity XP — scales with triple deposit; small deposits earn a fraction of this max.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Added something to a list</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_ADD_TO_LIST}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Activity XP — scales with list triple deposit (often the protocol floor unless you raise it).
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Arena · stance batch (vault deposit)</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_ADD_TO_LIST}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Same <strong className="text-slate-400 font-semibold">add-to-list</strong> category when you submit ranked picks: deposit-scaled, then the gross is multiplied by{' '}
                        <strong className="text-slate-400 font-semibold">×{PROTOCOL_XP_ARENA_RANK_ADD_TO_LIST_MULT}</strong> so it stacks fairly with arena pick XP on the same flow.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Signal · Vouch batch (FeeProxy createTriples)</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_CREATE_CLAIM}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Activity XP — treated like <strong className="text-slate-400 font-semibold">created a claim</strong>. One transaction can mint several “vouches for” triples; the deposit basis is the{' '}
                        <strong className="text-slate-400 font-semibold">sum</strong> of per-vouch vault deposits, then the usual create-claim scaling and daily cap apply.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Chatted with Skill agent</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_SKILL_CHAT}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Activity XP — each assistant reply while your wallet is connected (deduped per message). Capped per day.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Used Skill to create an atom (signed)</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_SKILL_ATOM}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Activity XP — scales with vault deposit on that Skill-signed atom; small deposits earn a fraction of this max. Separate from the generic “Created an atom” row (Create flow).
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Used Skill to publish a triple (signed)</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_SKILL_TRIPLE}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Activity XP — scales with the triple deposit (label pipeline or FeeProxy createTriples from Skill). Higher cap than Skill atom; tiny deposits earn little or none.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-slate-200">Sent TRUST (wallet to wallet)</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-amber-200/95">+{PROTOCOL_XP_SEND_TRUST}</td>
                      <td className="px-4 py-3 text-slate-500 text-[13px] leading-snug">
                        Activity XP — only if this send is <strong className="text-slate-400 font-semibold">{PROTOCOL_XP_SEND_TRUST_MIN_TRUST_UNITS} TRUST or more</strong> in one go. Daily caps still apply. Not the same as buying market shares.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="not-prose rounded-xl border border-white/[0.06] bg-[#080a12]/90 p-4 sm:p-5 text-[13px] leading-relaxed text-slate-400 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Keeping it honest</p>
                <p>
                  Activity XP is meant to reward real use, not scripted spam. In the app we combine three simple rules: you need a{' '}
                  <strong className="text-slate-200">meaningful-sized TRUST deposit</strong> before anything counts; between that floor and a reference size your XP{' '}
                  <strong className="text-slate-200">ramps up smoothly</strong> toward the max in the table; and each row also has a{' '}
                  <strong className="text-slate-200">daily ceiling</strong> (UTC midnight) so endless tiny repeats stop paying off.
                </p>
                <p className="text-slate-500 text-xs">
                  Exact floors, reference sizes, and caps live in <code className="bg-white/5 px-1 rounded text-slate-400">constants.ts</code> next to the XP numbers — tune them as the product evolves.
                </p>
              </div>
            </DocSection>

            <DocSection id="create-flows" title="Create atom, Send TRUST, and Arena">
              <h3 className="text-base font-semibold text-slate-100 mt-0 mb-3 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-intuition-primary shrink-0" aria-hidden />
                Create atom or claim
              </h3>
              <p>
                <strong className="text-slate-100 font-semibold">Create atom or claim</strong> (
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/create</code>) is a multi-path
                wizard for on-chain creation without using the Skill chat. From the root menu you can start an{' '}
                <strong className="text-slate-100 font-semibold">identity atom</strong> (guided or manual metadata, optional
                imagery with IPFS upload when configured),                 compose a <strong className="text-slate-100 font-semibold">semantic claim</strong> (triple) with
                search-backed atom pickers, use a <strong className="text-slate-100 font-semibold">quick SDK string</strong>{' '}
                path to broadcast a simple atom from text and deposit, or open{' '}
                <strong className="text-slate-100 font-semibold">advanced pathways</strong>{' '}
                for <strong className="text-slate-100 font-semibold">advanced atom creation</strong> and{' '}
                <strong className="text-slate-100 font-semibold">manual triple</strong> flows with explicit
                term IDs and deposits. Review screens estimate fees, enforce minimum deposits where the protocol requires
                them, and may validate that referenced atoms exist before you confirm.
              </p>
              <p>
                Creation always costs TRUST: protocol fees plus vault deposits depend on the path and current fee schedule.
                Ensure <strong className="text-slate-100 font-semibold">FeeProxy approval</strong> is granted when the UI asks,
                then confirm each transaction in your wallet. Successful runs show term IDs and links to the explorer.
              </p>

              <h3 className="text-base font-semibold text-slate-100 mt-8 mb-3 flex items-center gap-2">
                <Send className="w-5 h-5 text-amber-400 shrink-0" aria-hidden />
                Send TRUST
              </h3>
              <p>
                <strong className="text-slate-100 font-semibold">Send TRUST</strong> (
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/send-trust</code>) is a simple{' '}
                <strong className="text-slate-100 font-semibold">native TRUST transfer</strong> to another wallet. Enter a{' '}
                <strong className="text-slate-100 font-semibold">0x address</strong> or an{' '}
                <strong className="text-slate-100 font-semibold">ENS name</strong> (for example{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">name.eth</code>); the page resolves ENS
                on-chain and shows validation errors for bad input. Choose an amount; the{' '}
                <strong className="text-slate-100 font-semibold">Max</strong> control leaves a small
                TRUST reserve for future gas on {NETWORK_NAME}. Sending to yourself is blocked. After broadcast,
                you get a confirmation with a link to the transaction on the explorer. This is{' '}
                <strong className="text-slate-100 font-semibold">not</strong> a MultiVault deposit: it does not open or close
                a market position by itself. For <strong className="text-slate-100 font-semibold">activity XP</strong>, the app
                only counts sends of <strong className="text-slate-100 font-semibold">{PROTOCOL_XP_SEND_TRUST_MIN_TRUST_UNITS} TRUST or more</strong> in one go (
                <strong className="text-slate-100 font-semibold">+{PROTOCOL_XP_SEND_TRUST} XP</strong>).
              </p>

              <h3 className="text-base font-semibold text-slate-100 mt-8 mb-3 flex items-center gap-2">
                <Activity className="w-5 h-5 text-intuition-secondary shrink-0" aria-hidden />
                Arena (Climb)
              </h3>
              {ARENA_UI_VISIBLE ? (
                <p>
                  <strong className="text-slate-100 font-semibold">The Arena</strong> (
                  <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/climb</code>, nav{' '}
                  <strong className="text-slate-100 font-semibold">THE ARENA</strong>) is a stance and comparison surface:
                  you vote on claims and narratives in a fast UI, earn{' '}
                  <strong className="text-slate-100 font-semibold">arena XP</strong> stored locally, and can compete on
                  player leaderboards fed by the app&apos;s arena service.
                  Optional stakes send <strong className="text-slate-100 font-semibold">native TRUST</strong> to a configured
                  treasury address as part of the arena flow (not a vault deposit). Vault-based trading remains on{' '}
                  <Link to="/markets/atoms" onClick={playClick} className="text-intuition-primary hover:underline font-medium">
                    Markets
                  </Link>
                  .
                </p>
              ) : (
                <p>
                  <strong className="text-slate-100 font-semibold">The Arena</strong> route (
                  <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/climb</code>) may show a
                  coming-soon screen when the feature is not enabled, or when{' '}
                  <code className="text-xs bg-white/5 px-1 py-0.5 rounded text-slate-300">VITE_ARENA_PLACEHOLDER=true</code>{' '}
                  masks the work-in-progress UI. The nav can still list{' '}
                  <strong className="text-slate-100 font-semibold">THE ARENA</strong> while the full surface is hidden.
                </p>
              )}

              <h3 className="text-base font-semibold text-slate-100 mt-8 mb-3 flex items-center gap-2">
                <Radio className="w-5 h-5 text-cyan-300 shrink-0" aria-hidden />
                Signal — Pulse &amp; Vouch
              </h3>
              {ARENA_UI_VISIBLE ? (
                <>
                  <p>
                    <strong className="text-slate-100 font-semibold">Signal</strong> is the Arena tab for quick social graph actions without picking a themed list first. It has two sub-lanes:{' '}
                    <strong className="text-slate-100 font-semibold">Pulse</strong> and{' '}
                    <strong className="text-slate-100 font-semibold">Vouch</strong>.
                  </p>
                  <p>
                    <strong className="text-slate-100 font-semibold">Pulse</strong> surfaces identity atoms as <strong className="text-slate-200">tag cards</strong> (third-person predicates like “has tag”, “trusts”, etc.).
                    Tabs group the rail: <strong className="text-slate-200">Hot</strong> is the editorial spotlight;{' '}
                    <strong className="text-slate-200">Crowd</strong> is the full curated portal list (same order you configured in the app);{' '}
                    <strong className="text-slate-200">Yours</strong> is atoms you pin; <strong className="text-slate-200">My stakes</strong> lists every triple where your wallet already has a position, with controls to queue the opposite stance{' '}
                    (new on-chain deposit via the conviction cart) or unstake from the vault.{' '}
                    Tapping <strong className="text-slate-200">Support</strong> or <strong className="text-slate-200">Oppose</strong> queues a stance for that vault triple (local queue — no wallet yet). Queued stances are summarized in the footer; the on-chain batch for those stances is still rolling out — until then, plan in Signal and execute larger Arena list batches from the main grid when you need vault deposits and XP.
                  </p>
                  <p>
                    <strong className="text-slate-100 font-semibold">Vouch</strong> is for named identities (e.g. <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">.eth</code> /{' '}
                    <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">.trust</code>). You queue who you want to vouch for;{' '}
                    <strong className="text-slate-200">Submit (1 tx)</strong> calls FeeProxy <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">createTriples</code> with predicate{' '}
                    <strong className="text-slate-200">vouches for</strong>, your account atom as subject, and a per-row vault deposit. Successful submits earn{' '}
                    <strong className="text-slate-200">activity XP</strong> under the same rules as creating a claim ( basis = sum of deposits in that transaction). Daily caps still apply.
                  </p>
                </>
              ) : (
                <p>
                  When the Arena UI is visible, <strong className="text-slate-100 font-semibold">Signal</strong> appears as a tab on{' '}
                  <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/climb</code>: Pulse for identity tag cards and stance queueing, Vouch for batched “vouches for” claims.
                </p>
              )}

              <div className="not-prose flex flex-wrap gap-3 mt-6">
                <Link
                  to="/create"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-intuition-primary hover:underline"
                >
                  Create atom or claim <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/send-trust"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Send TRUST <ChevronRight className="w-4 h-4" />
                </Link>
                {ARENA_ENABLED && (
                  <Link
                    to="/climb"
                    onClick={playClick}
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
                    title={ARENA_UI_VISIBLE ? undefined : 'Route may show coming-soon'}
                  >
                    Arena <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </DocSection>

            <DocSection id="portfolio-profile" title="Portfolio and profile">
              <h3 className="text-base font-semibold text-slate-100 mt-0 mb-3 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-intuition-primary shrink-0" aria-hidden />
                Portfolio
              </h3>
              <p>
                <strong className="text-slate-100 font-semibold">Portfolio</strong> (
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/portfolio</code>, nav{' '}
                <strong className="text-slate-100 font-semibold">PORTFOLIO</strong>) is your command center after you connect
                a wallet. It pulls indexed positions and history for the connected address and surfaces{' '}
                <strong className="text-slate-100 font-semibold">wallet TRUST balance</strong>,{' '}
                <strong className="text-slate-100 font-semibold">aggregate portfolio value</strong>,{' '}
                <strong className="text-slate-100 font-semibold">net PnL</strong>, and (when data is available) an{' '}
                <strong className="text-slate-100 font-semibold">equity curve</strong> over time. You get category exposure
                and sentiment-style breakdowns, a sortable and paginated <strong className="text-slate-100 font-semibold">
                  holdings
                </strong>{' '}
                table with links back to each term, <strong className="text-slate-100 font-semibold">transaction history</strong>
                , and a <strong className="text-slate-100 font-semibold">My created</strong> area split into identities and
                claims you originated. Use it to reconcile what you think you own with vault state after each trade. The old{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/dashboard</code> path redirects
                here.
              </p>
              <div className="not-prose mt-4">
                <Link
                  to="/portfolio"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-intuition-primary hover:bg-white/10 transition-colors"
                >
                  Open Portfolio <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <h3 className="text-base font-semibold text-slate-100 mt-10 mb-3 flex items-center gap-2">
                <UserCircle className="w-5 h-5 text-intuition-primary shrink-0" aria-hidden />
                Profile (your wallet and public profiles)
              </h3>
              <p>
                <strong className="text-slate-100 font-semibold">Profile</strong> in the nav (
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/account</code>) is the entry point:
                if you are not connected, you see a short screen asking you to connect; once a wallet is active, the app
                sends you to <strong className="text-slate-100 font-semibold">your public profile</strong> at{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/profile/&lt;your-address&gt;</code>
                .
              </p>
              <p>
                <strong className="text-slate-100 font-semibold">Public profile pages</strong> work for{' '}
                <strong className="text-slate-100 font-semibold">any</strong> checksummed address: paste or navigate to{' '}
                <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/profile/0x…</code> (for example from
                leaderboards or shared links). The view shows that wallet&apos;s <strong className="text-slate-100 font-semibold">
                  TRUST balance
                </strong>
                , <strong className="text-slate-100 font-semibold">portfolio value</strong>,{' '}
                <strong className="text-slate-100 font-semibold">holdings and history</strong>, exposure and activity
                summaries, and <strong className="text-slate-100 font-semibold">ENS</strong> resolution when a name exists.
                When you view someone else while connected, you can <strong className="text-slate-100 font-semibold">follow</strong>{' '}
                them; on your own profile you can manage optional <strong className="text-slate-100 font-semibold">email</strong>{' '}
                notification settings where the app supports them. Nothing on a profile page moves funds by itself: trading
                still happens from Markets or other flows that open transactions in your wallet.
              </p>
              <div className="not-prose flex flex-wrap gap-3 mt-4">
                <Link
                  to="/account"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-intuition-primary hover:bg-white/10 transition-colors"
                >
                  Profile (Account) <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </DocSection>

            <DocSection id="guide" title="How to use IntuRank">
              <ol className="list-decimal pl-5 space-y-4 marker:text-intuition-primary/80">
                <li>
                  <strong className="text-slate-200">Connect a wallet.</strong> Use any EVM wallet the app supports
                  (browser extension or WalletConnect). Switch to {NETWORK_NAME} (chain {CHAIN_ID}) when prompted; fund the
                  wallet with TRUST for gas and positions. If the network is wrong, transactions will fail or target the
                  wrong chain.
                </li>
                <li>
                  <strong className="text-slate-200">Browse Markets.</strong> Open{' '}
                  <Link
                    to="/markets/atoms"
                    onClick={playClick}
                    className="text-intuition-primary hover:underline font-medium"
                  >
                    Markets
                  </Link>{' '}
                  and switch between atoms, triples, and lists. Use search and sort to narrow the set, then open any row
                  to reach that term&apos;s full detail view (claims, vault stats, activity, and ingress or exit controls).
                </li>
                <li>
                  <strong className="text-slate-200">Read before you size.</strong> On a term page, review linked triples,
                  curve type, liquidity, and rank in context. Expand history and compare against similar terms if you are
                  deciding between competing claims.
                </li>
                <li>
                  <strong className="text-slate-200">Commit TRUST (ingress).</strong> Start a deposit flow, enter an
                  amount, and inspect the preview (shares out, fees, min bounds). Confirm only if the calldata and value
                  match your intent. For withdrawals, use redeem flows and the same discipline.
                </li>
                <li>
                  <strong className="text-slate-200">Portfolio and profile.</strong>{' '}
                  <Link
                    to="/portfolio"
                    onClick={playClick}
                    className="text-intuition-primary hover:underline font-medium"
                  >
                    Portfolio
                  </Link>{' '}
                  shows your holdings, PnL, history, and what you created.{' '}
                  <Link to="/account" onClick={playClick} className="text-intuition-primary hover:underline font-medium">
                    Profile
                  </Link>{' '}
                  opens your wallet&apos;s public page (or connect first); any address can be viewed at{' '}
                  <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-slate-300">/profile/0x…</code>. See{' '}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => scrollTo('portfolio-profile')}
                    className="text-intuition-primary hover:underline font-medium"
                  >
                    Portfolio and profile
                  </button>{' '}
                  above for detail.
                </li>
                <li>
                  <strong className="text-slate-200">Watch the network.</strong>{' '}
                  <Link to="/feed" onClick={playClick} className="text-intuition-primary hover:underline font-medium">
                    Feed
                  </Link>{' '}
                  streams recent protocol activity; useful for context and for spotting large flows. Optional ARES copy on
                  Feed is decorative: verify anything material on-chain.
                </li>
                <li>
                  <strong className="text-slate-200">Leaderboards and epochs.</strong> Open{' '}
                  <Link to="/stats" onClick={playClick} className="text-intuition-primary hover:underline font-medium">
                    Stats
                  </Link>{' '}
                  for tabbed rankings (stakers, PnL, agents, claims). Full behavior is documented under{' '}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => scrollTo('leaderboards')}
                    className="text-intuition-primary hover:underline font-medium"
                  >
                    Leaderboards
                  </button>{' '}
                  above. Epoch windows shift over time; read the labels in-app.
                </li>
                <li>
                  <strong className="text-slate-200">Create, send, skill, arena.</strong> Use{' '}
                  <Link to="/create" onClick={playClick} className="text-intuition-primary hover:underline font-medium">
                    Create atom or claim
                  </Link>{' '}
                  for guided creation flows,{' '}
                  <Link to="/send-trust" onClick={playClick} className="text-intuition-primary hover:underline font-medium">
                    Send TRUST
                  </Link>{' '}
                  for native transfers,{' '}
                  <Link
                    to="/skill-playground"
                    onClick={playClick}
                    className="text-intuition-primary hover:underline font-medium"
                  >
                    Intuition Skill Playground
                  </Link>{' '}
                  under Intel for Gemini-assisted transactions
                  {ARENA_UI_VISIBLE ? (
                    <>
                      {', and '}
                      <Link to="/climb" onClick={playClick} className="text-intuition-primary hover:underline font-medium">
                        The Arena
                      </Link>{' '}
                      for stance comparison.
                    </>
                  ) : (
                    <>
                      . The Arena route exists but may show a placeholder unless the deployment enables it (see{' '}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => scrollTo('create-flows')}
                        className="text-intuition-primary hover:underline font-medium"
                      >
                        Create &amp; Send TRUST
                      </button>
                      ).
                    </>
                  )}{' '}
                  See the dedicated sections on this page for full detail.
                </li>
              </ol>
              <div className="not-prose flex flex-wrap gap-3 mt-6">
                <Link
                  to="/markets/atoms"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-intuition-primary hover:underline"
                >
                  Markets <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/portfolio"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Portfolio <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/account"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Profile <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/feed"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Feed <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/stats"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Stats <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/create"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Create <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/send-trust"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Send TRUST <ChevronRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/skill-playground"
                  onClick={playClick}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Skill Playground <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </DocSection>

            <DocSection id="glossary" title="Glossary">
              <dl className="not-prose grid gap-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">TRUST ({CURRENCY_SYMBOL})</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Native gas and staking asset on {NETWORK_NAME}. Used for atom and triple creation fees, vault deposits,
                    redemptions, and other payable protocol calls.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Term</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Generic name for an on-chain object that can hold a vault: an atom, a triple, or another supported term
                    type. Identified by a bytes32 term ID.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Atom</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    A single node in the graph (entity, concept, tag). Has its own ID and can back a market and vault.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Triple</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    A subject, predicate, and object claim built from three atom IDs. Triples are first-class terms with their own
                    IDs and markets.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Rank</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    A reputation-weighted ordering signal for atoms in the UI, derived from vault state, assets, and
                    protocol heuristics. Not a standalone investment metric.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Curve ID</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Selects which bonding curve implementation prices shares for a vault. In this build, ID{' '}
                    {LINEAR_CURVE_ID} is linear and ID {OFFSET_PROGRESSIVE_CURVE_ID} is offset progressive. Confirm live
                    parameters on-chain before integrating.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">MultiVault</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Core contract family for pooled TRUST, share accounting, and redemptions around terms. IntuRank
                    interacts with MultiVault-compatible entry points for deposits and batch redeems where enabled.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">FeeProxy</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Router used for payable flows such as creating atoms and triples with bundled deposits. Address and ABI
                    match the deployment referenced by this client build.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Ingress</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Depositing TRUST to mint shares on a bonding curve (enter a position). Opposite of redeem / exit.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Handshake</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    The ordered set of contract calls the UI batches to complete a user intent (approve, deposit, create,
                    redeem), as implemented in the app and wallet flow.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Epoch</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    A time-bounded window used for seasonal leaderboards and stats. Current ranges are labeled in Stats;
                    they rotate on a schedule published in-app.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Arbitrage</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Capturing value when on-chain price or semantics diverge from your model of fair value. Requires
                    execution discipline; fees and latency can dominate small edges.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Provenance</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Who created or last moved a term or position, as visible from events and indexer history.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Denoising</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Heuristic or model-based down-weighting of activity that looks automated or spam-like in ranking and
                    feed surfaces.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Intuition Skill Playground</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    Chat UI at /skill-playground: same transaction patterns as the Intuition Skill CLI package. You sign and
                    broadcast; the agent does not custody keys. Minimum vault deposit for atom or triple creation via the
                    Skill is <strong className="text-slate-300">0.5 TRUST</strong> (<code className="text-[11px] bg-white/5 px-1 rounded text-slate-400">depositTrust</code>). Explanations can follow your chat language; JSON keys stay English for parsing.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Portfolio</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    /portfolio: connected-wallet view of balances, portfolio value, PnL, equity chart, exposure, sortable
                    holdings, history, and &quot;My created&quot; identities and claims. /dashboard redirects here.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Profile</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    /account connects then routes to /profile/&lt;address&gt;. Public /profile/:address shows any
                    wallet&apos;s positions, history, ENS, and follow/email options where available.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Leaderboards (Stats)</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    /stats: tabbed rankings (TOP STAKERS, TOP PNL, MOST SUPPORTED, Claim entropy, TOP CLAIMS) backed by the
                    indexer and PnL APIs. Search supports addresses and ENS on staker and PnL tabs.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Create atom or claim</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    /create: multi-step wizard for identity atoms, semantic triples, SDK string atoms, and manual construct
                    or synapse flows. Requires TRUST for fees and deposits and may use IPFS for images when configured.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Send TRUST</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    /send-trust: wallet-to-wallet native TRUST transfer with ENS or 0x resolution. Not a vault deposit.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-intuition-primary">Arena (Climb)</dt>
                  <dd className="mt-1.5 text-sm text-slate-400 leading-relaxed">
                    /climb when enabled: stance UI, arena XP, optional TRUST stakes to treasury. Some deployments show a
                    placeholder until the feature is turned on.
                  </dd>
                </div>
              </dl>
            </DocSection>

            {/* Footer CTA */}
            <div className="mt-12 rounded-xl border border-intuition-primary/30 bg-gradient-to-b from-intuition-primary/[0.08] to-transparent p-8 text-center">
              <h2 className="text-lg font-semibold text-white mb-2">Ready to trade conviction?</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                Browse live markets by atom or triple, track exposure in portfolio, and use Feed and Stats when you need
                network-level context.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/markets"
                  onClick={playClick}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-black font-semibold text-sm px-6 py-3 hover:bg-intuition-primary transition-colors"
                >
                  Go to markets <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/portfolio"
                  onClick={playClick}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 text-white font-medium text-sm px-6 py-3 hover:bg-white/5 transition-colors"
                >
                  Portfolio
                </Link>
              </div>
            </div>

            <footer className="mt-12 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <span>© 2026 IntuRank · {APP_VERSION_DISPLAY}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider">{NETWORK_NAME}</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Documentation;
