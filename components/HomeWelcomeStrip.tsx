import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronsDown, Crosshair, Plus, Sparkles } from 'lucide-react';
import { playClick, playHover } from '../services/audio';
import { pulseArenaTapOptic } from '../services/arenaTapOptic';

type HomeWelcomeStripProps = {
  variant?: 'desktop' | 'mobile';
};

const H_PAD = { paddingLeft: 'clamp(1.5rem, 6vw, 4rem)', paddingRight: 'clamp(1.5rem, 6vw, 4rem)' } as const;

const GLASS_PANEL =
  'relative overflow-hidden rounded-[1.75rem] border border-white/[0.1] bg-[#05070c]/[0.88] shadow-[0_20px_50px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.04]';

function HudCorners({ className = '' }: { className?: string }) {
  const edge = 'pointer-events-none absolute border-intuition-primary/50';
  return (
    <div className={`pointer-events-none absolute inset-0 z-[1] ${className}`} aria-hidden>
      <span className={`${edge} left-3 top-3 h-9 w-9 rounded-tl-lg border-l-2 border-t-2 sm:left-4 sm:top-4`} />
      <span className={`${edge} right-3 top-3 h-9 w-9 rounded-tr-lg border-r-2 border-t-2 sm:right-4 sm:top-4`} />
      <span className={`${edge} bottom-3 left-3 h-9 w-9 rounded-bl-lg border-b-2 border-l-2 sm:bottom-4 sm:left-4`} />
      <span className={`${edge} bottom-3 right-3 h-9 w-9 rounded-br-lg border-b-2 border-r-2 sm:bottom-4 sm:right-4`} />
    </div>
  );
}

/**
 * Landing hero — glass + cyan/magenta arena language, HUD framing, optimized motion (CSS-only nudge).
 */
export const HomeWelcomeStrip: React.FC<HomeWelcomeStripProps> = ({ variant = 'desktop' }) => {
  const mobile = variant === 'mobile';

  const scrollToContestFloor = useCallback(() => {
    playClick();
    pulseArenaTapOptic();
    const el = document.getElementById('arena-home-contests');
    const reduced =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, []);

  const heroMinClass = mobile
    ? 'min-h-0 py-10 sm:py-12'
    : 'min-h-[min(78vh,44rem)] lg:min-h-[min(82vh,48rem)]';

  return (
    <section
      aria-label="IntuRank hero"
      className={
        mobile
          ? `relative flex flex-col overflow-hidden rounded-[1.75rem] border border-white/[0.08] ${heroMinClass}`
          : `relative flex flex-col overflow-x-clip scroll-mt-6 ${heroMinClass}`
      }
      style={mobile ? undefined : H_PAD}
    >
      <div className="absolute inset-0 bg-[#020308]" />

      {/* Soft twin auroras — static, cheap paint */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.95]"
        style={{
          background:
            'radial-gradient(ellipse 85% 60% at 8% -8%, rgba(0,243,255,0.14), transparent 55%), radial-gradient(ellipse 70% 55% at 92% 108%, rgba(255,30,109,0.11), transparent 50%), radial-gradient(ellipse 50% 40% at 52% 45%, rgba(168,85,247,0.06), transparent 60%)',
        }}
      />

      {/* Floor grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,243,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(0,243,255,0.045) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      {/* Vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_50%_50%,transparent_35%,rgba(0,0,0,0.55)_95%)]"
      />

      <div
        className={
          mobile
            ? 'relative z-10 flex flex-1 flex-col px-5 py-8 sm:px-6'
            : 'relative z-10 mx-auto flex flex-1 w-full flex-col justify-center py-16 sm:py-20 lg:py-24'
        }
        style={mobile ? undefined : { maxWidth: 1200 }}
      >
        {/* Top marquee strip */}
        <div className="mx-auto mb-6 flex max-w-3xl justify-center sm:mb-8">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.1] bg-[#05070c]/85 px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_40px_rgba(0,243,255,0.06)] backdrop-blur-sm sm:px-5 sm:py-3">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-intuition-success/40 opacity-75 motion-safe:animate-ping motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-intuition-success shadow-[0_0_10px_rgba(0,255,157,0.55)]" />
            </span>
            <p className="text-center text-[11px] font-semibold leading-snug text-slate-300 sm:text-[13px]">
              IntuRank — a gamified way to <span className="font-bold text-white">rank items inside lists</span> and share
              that with friends, on Intuition.
            </p>
            <Crosshair className="hidden h-3.5 w-3.5 shrink-0 text-intuition-primary/70 sm:block" aria-hidden strokeWidth={2.5} />
          </div>
        </div>

        <div
          className={`mx-auto flex w-full max-w-5xl flex-col gap-8 ${mobile ? '' : 'lg:flex-row lg:items-stretch lg:gap-10'}`}
        >
          <div className={`${GLASS_PANEL} min-w-0 flex-1 p-6 sm:p-8 lg:p-10`}>
            <HudCorners />
            {/* Single moving shine — tiny layer, opacity + transform */}
            <div
              aria-hidden
              className="pointer-events-none absolute -left-1/2 top-0 z-0 h-full w-[45%] rotate-[12deg] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent motion-safe:animate-slot-shimmer motion-reduce:hidden"
              style={{ animationDuration: '5.5s' }}
            />

            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 opacity-80"
              style={{
                boxShadow: 'inset 0 0 90px rgba(0,243,255,0.055)',
              }}
            />

            <div className="relative z-[2] text-center lg:text-left">
              <div className="inline-flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.38em] text-intuition-primary/85 sm:text-[11px]">
                  IntuRank
                </p>
                <span className="hidden h-1 w-1 rounded-full bg-white/25 sm:inline sm:h-1.5 sm:w-1.5" aria-hidden />
                <span className="rounded border border-intuition-secondary/35 bg-intuition-secondary/[0.08] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-fuchsia-200/90">
                  Rank engine online
                </span>
              </div>

              <h1 className="mt-3 font-display text-[1.65rem] font-black leading-[1.08] tracking-tight text-white sm:text-3xl md:text-4xl lg:text-[2.75rem]">
                Anyone can create a game
                <span className="mt-3 block text-lg font-bold text-slate-200 sm:text-xl md:text-2xl">
                  Where the collective output is{' '}
                  <span className="bg-gradient-to-r from-white via-cyan-100 to-intuition-primary bg-clip-text font-black text-transparent drop-shadow-[0_0_24px_rgba(0,243,255,0.25)]">
                    rank anything
                  </span>
                </span>
              </h1>

              {/* Energy tick — narrow; arena-pulse is opacity-only */}
              <div
                aria-hidden
                className="mx-auto mt-5 h-[3px] max-w-xs overflow-hidden rounded-full bg-white/[0.06] lg:mx-0"
              >
                <div className="h-full w-[42%] rounded-full bg-gradient-to-r from-intuition-primary via-fuchsia-400 to-intuition-secondary motion-safe:animate-arena-pulse motion-reduce:opacity-90" />
              </div>

              <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400 sm:text-base lg:mx-0">
                <span className="font-semibold text-intuition-primary/90">A game for your knowledge</span>
                {' — '}
                stack cards, fight for what belongs on top, then show your deck to the crowd.
              </p>

              <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center lg:justify-start">
                <Link
                  to="/climb"
                  onClick={() => playClick()}
                  onMouseEnter={() => playHover()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-intuition-primary/45 bg-black/55 px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white shadow-[0_0_28px_rgba(0,243,255,0.18),inset_0_1px_0_rgba(255,255,255,0.06)] transition-[transform,filter,box-shadow] hover:shadow-[0_0_42px_rgba(0,243,255,0.28)] active:scale-[0.99] sm:text-xs"
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-intuition-primary" strokeWidth={2.5} aria-hidden />
                  Enter the Arena
                  <ArrowRight className="h-4 w-4 shrink-0 text-intuition-primary" strokeWidth={2.5} aria-hidden />
                </Link>
                <Link
                  to="/markets/atoms"
                  onClick={() => playClick()}
                  onMouseEnter={() => playHover()}
                  className="inline-flex items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300 backdrop-blur-sm transition-colors hover:border-intuition-primary/35 hover:text-white sm:text-xs"
                >
                  Browse the graph
                </Link>
              </div>
            </div>
          </div>

          <div
            className={`relative flex shrink-0 flex-col items-center justify-center gap-2 ${
              mobile ? 'w-full' : 'lg:w-48 xl:w-52'
            }`}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 opacity-55 blur-[48px]"
              style={{
                background:
                  'radial-gradient(circle at 50% 30%, rgba(255,36,112,0.35), transparent 55%), radial-gradient(circle at 50% 80%, rgba(234,88,12,0.28), transparent 52%)',
              }}
            />
            <Link
              to="/"
              state={{ scrollArenaContests: true, showArenaCreateGameToast: true }}
              onClick={() => playClick()}
              onMouseEnter={() => playHover()}
              className="group relative flex w-full max-w-[16rem] flex-col items-center justify-center gap-3 overflow-hidden rounded-[1.75rem] border border-white/[0.12] bg-gradient-to-br from-intuition-secondary via-rose-600 to-orange-600 py-9 shadow-[0_16px_40px_rgba(255,30,109,0.28),inset_0_1px_0_rgba(255,255,255,0.14)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99] lg:max-w-none lg:flex-1 lg:py-11 motion-reduce:active:scale-100"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-35 mix-blend-soft-light motion-safe:animate-slot-shimmer motion-reduce:opacity-0"
                style={{
                  background:
                    'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.22) 50%, transparent 62%)',
                  backgroundSize: '220% 100%',
                  animationDuration: '3.2s',
                }}
              />
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/35 bg-black/25 text-white shadow-[0_0_28px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                <Plus className="h-7 w-7" strokeWidth={2.5} aria-hidden />
              </span>
              <span className="relative px-2 text-center text-[11px] font-black uppercase tracking-[0.2em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
                Create your game
              </span>
            </Link>
            <p className="max-w-[14rem] text-center text-[10px] leading-snug text-slate-500">
              Contest picker lives below. Use nav for graph create (identities + claims).
            </p>
          </div>
        </div>

        {/* Scroll cue into contest grid */}
        <div
          className={`mx-auto flex w-full max-w-5xl flex-col items-center ${mobile ? 'mt-10' : 'mt-14'}`}
        >
          <div className="h-px w-full max-w-md bg-gradient-to-r from-transparent via-intuition-primary/35 to-transparent" aria-hidden />

          <button
            type="button"
            onClick={() => scrollToContestFloor()}
            onMouseEnter={() => playHover()}
            aria-controls="arena-home-contests"
            aria-label="Scroll to contest floor to pick a ranking game"
            className="group mt-7 flex flex-col items-center gap-1.5 rounded-2xl border border-intuition-primary/25 bg-black/40 px-6 py-3 text-intuition-primary/95 shadow-[0_0_32px_rgba(0,243,255,0.06)] backdrop-blur-sm transition-[transform,border-color,box-shadow,color] hover:border-intuition-primary/55 hover:text-intuition-primary hover:shadow-[0_0_40px_rgba(0,243,255,0.12)] active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <span className="font-mono text-[10px] font-black uppercase tracking-[0.32em] text-slate-500 transition-colors group-hover:text-intuition-primary/80">
              Scroll to play
            </span>
            <span className="flex flex-col items-center gap-0.5">
              <ChevronsDown className="h-8 w-8 text-intuition-primary opacity-95 hero-scroll-nudge" strokeWidth={2.4} aria-hidden />
            </span>
          </button>
          <span className="mt-3 font-mono text-[9px] uppercase tracking-[0.28em] text-slate-600">
            Contest floor
          </span>
        </div>
      </div>
    </section>
  );
};
