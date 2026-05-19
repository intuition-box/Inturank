import React, { useEffect, useState, useRef } from 'react';
import { Activity, Binary, Box, HardDrive, Network } from 'lucide-react';
import { formatEther } from 'viem';
import { getNetworkStats } from '../services/graphql';
import { CURRENCY_SYMBOL } from '../constants';
import { HomeWelcomeStrip } from '../components/HomeWelcomeStrip';
import { HomeGameBoard } from '../components/HomeGameBoard';
import { HomeArenaEntryEffects } from '../components/HomeArenaEntryEffects';

interface InViewOptions extends IntersectionObserverInit {
  once?: boolean;
}

const useInView = (options: InViewOptions = {}) => {
  const [isInView, setIsInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        if (options.once) observer.unobserve(entry.target);
      } else if (!options.once) {
        setIsInView(false);
      }
    }, { threshold: 0.1, ...options });

    const currentRef = ref.current;
    if (currentRef) observer.observe(currentRef);
    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [options.once]);

  return [ref, isInView] as const;
};

const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string; direction?: 'up' | 'down' | 'none' }> = ({
  children,
  delay = 0,
  className = '',
  direction = 'up',
}) => {
  const [ref, isInView] = useInView({ once: true });

  const getTransform = () => {
    if (!isInView) {
      if (direction === 'up') return 'translateY(16px)';
      if (direction === 'down') return 'translateY(-16px)';
      return 'scale(0.99)';
    }
    return 'translateY(0) scale(1)';
  };

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-500 ${className} ${isInView ? 'opacity-100' : 'opacity-0'}`}
      style={{
        transitionDelay: `${delay}ms`,
        transform: getTransform(),
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {children}
    </div>
  );
};

const MissionTerminal: React.FC = () => {
  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 py-20 sm:py-28">
      {/*
        Do not use Tailwind CDN `animate-in` / `fade-in` / `slide-in-*` here: those utilities
        (tailwindcss-animate-style) can leave content at opacity 0 with fill-mode, and they
        conflict with the custom `.animate-in` rule in index.html. Mission copy must always render.
      */}
      <div className="animate-fade-in">
        <div className="group relative overflow-hidden rounded-[1.75rem] border border-intuition-primary/25 bg-[#03050d]/[0.96] shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_40px_rgba(0,243,255,0.1),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-intuition-primary/15 backdrop-blur-2xl backdrop-saturate-150">
          <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(0,243,255,0.12),transparent_55%)]" />
          <div className="relative z-[2] flex items-center justify-between border-b border-white/[0.07] bg-[#03050d]/40 px-5 py-3.5 sm:px-6">
            <div className="flex gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]/90" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]/90" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]/90" />
            </div>
            <div className="text-[9px] font-mono font-semibold uppercase tracking-[0.28em] text-slate-400 sm:text-[10px] sm:tracking-[0.35em]">
              MISSION_LOG.TXT
            </div>
            <div className="w-10" />
          </div>

          <div className="relative z-[2] p-6 sm:p-8 md:p-10">
            <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] opacity-25" />

            <div className="relative z-[3] space-y-4 text-left font-mono text-[11px] uppercase leading-relaxed tracking-[0.12em] text-slate-300 sm:space-y-5 sm:text-xs sm:tracking-[0.14em]">
              <p className="text-intuition-primary">
                <span className="select-none">&gt;&gt; </span>
                LOADING CONTEST FLOOR ...
              </p>

              <p>
                INTURANK IS A{' '}
                <span className="inline-block rounded border border-intuition-primary/70 bg-intuition-primary/10 px-1.5 py-0.5 font-bold text-intuition-primary">
                  GAME
                </span>{' '}
                FOR YOUR KNOWLEDGE. PICK A LIST, RANK WHAT BELONGS ON TOP, COMPARE WITH FRIENDS.
              </p>

              <p className="text-slate-200">
                ANYONE CAN CREATE A CONTEST. WHAT IS THE BEST APP, THE BEST AGENT, THE BEST TRACK OF THE WEEK —
                YOU AND THE CROWD DECIDE THE ORDER.
              </p>

              <p className="font-bold text-intuition-success" style={{ textShadow: '0 0 20px rgba(0,255,157,0.4)' }}>
                PLAY FIRST. STAKE LATER. WALLETS ARE OPTIONAL UNTIL YOU WANT TO PUT CONVICTION ON-CHAIN AND
                CLAIM REWARDS.
              </p>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-intuition-primary">
                <span className="select-none">&gt;&gt; </span>
                <span>READY TO PLAY</span>
                <span
                  className="inline-block min-w-[0.55em] bg-intuition-primary text-[#03050d] shadow-[0_0_12px_rgba(0,243,255,0.9)]"
                  aria-hidden
                >
                  █
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -right-8 -top-8 -z-10 h-40 w-40 rounded-full bg-intuition-primary/10 blur-[70px]" />
      <div className="absolute -bottom-8 -left-8 -z-10 h-40 w-40 rounded-full bg-intuition-secondary/10 blur-[70px]" />
    </div>
  );
};

const Home: React.FC = () => {
  const [stats, setStats] = useState({ tvl: '0', atoms: 0, signals: 0, positions: 0 });

  useEffect(() => {
    const initData = async () => {
      try {
        const netStats = await getNetworkStats().catch(() => ({
          tvl: '0',
          atoms: 0,
          signals: 0,
          positions: 0,
        }));
        setStats(netStats);
      } catch (e) {
        console.error(e);
      }
    };
    initData();
  }, []);

  const volumeValue = parseFloat(formatEther(BigInt(stats.tvl)));
  const formattedVolume =
    volumeValue > 0
      ? volumeValue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '0.0';

  return (
    <div className="relative flex min-h-screen w-full min-w-0 max-w-[100vw] flex-col overflow-x-clip bg-intuition-dark selection:bg-intuition-secondary selection:text-white">
      <HomeArenaEntryEffects />
      <HomeWelcomeStrip />

      <div className="relative border-t border-white/[0.07] bg-[#030508]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
        <HomeGameBoard />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10 pb-16 sm:pb-20">
        <Reveal className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-intuition-primary/30 bg-intuition-primary/10">
              <Activity className="text-intuition-primary" size={20} strokeWidth={2.4} />
            </div>
            <div>
              <h2 className="font-display text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
                How the loop plays
              </h2>
              <p className="text-[12px] text-slate-500">Curate · Rank · Compare — then jump into the next contest.</p>
            </div>
          </div>
        </Reveal>
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {[
            {
              step: '01',
              title: 'Curate',
              body: 'Swipe yes / no on the list — agree or disagree with how the crowd is ordering it.',
              borderClass: 'border-cyan-400/30',
              titleClass: 'text-cyan-200',
            },
            {
              step: '02',
              title: 'Rank',
              body: 'Order your personal deck of cards. The top spot matters; ties get broken on TRUST.',
              borderClass: 'border-white/[0.12]',
              titleClass: 'text-slate-100',
            },
            {
              step: '03',
              title: 'Compare & share',
              body: 'See similarity with other players, follow whoever clicks, then run the next contest.',
              borderClass: 'border-intuition-secondary/30',
              titleClass: 'text-intuition-secondary',
            },
          ].map((s, i) => (
            <Reveal key={s.step} delay={120 + i * 80}>
              <div
                className={`group flex h-full flex-col rounded-2xl border ${s.borderClass} bg-[#080a10]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-transform duration-200 hover:-translate-y-0.5 sm:p-6`}
              >
                <span className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">
                  {s.step}
                </span>
                <h3 className={`mt-2 font-display text-lg font-black text-white sm:text-xl ${s.titleClass}`}>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <div className="relative border-y-2 border-white/10 bg-intuition-dark py-16 sm:py-20">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
          <Reveal className="mb-10 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-intuition-secondary bg-intuition-secondary/10 shadow-glow-red">
              <Activity className="text-intuition-secondary" size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
                The network in numbers
              </h2>
              <p className="text-[12px] text-slate-500">Live stats from the Intuition graph — the contest floor is where you play.</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
            <Reveal delay={100}>
              <div className="min-w-0">
                <StatBox
                  label="TRUST locked"
                  value={formattedVolume}
                  sub={`Total ${CURRENCY_SYMBOL} in markets`}
                  icon={<Box size={18} />}
                  color="secondary"
                />
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="min-w-0">
                <StatBox
                  label="Identities"
                  value={stats.atoms.toLocaleString()}
                  sub="People, projects & topics"
                  icon={<HardDrive size={18} />}
                  color="primary"
                />
              </div>
            </Reveal>
            <Reveal delay={300}>
              <div className="min-w-0">
                <StatBox
                  label="Claims"
                  value={stats.signals.toLocaleString()}
                  sub="Statements on the graph"
                  icon={<Binary size={18} />}
                  color="secondary"
                />
              </div>
            </Reveal>
            <Reveal delay={400}>
              <div className="min-w-0">
                <StatBox
                  label="Open positions"
                  value={stats.positions.toLocaleString()}
                  sub="Active stakes"
                  icon={<Activity size={18} />}
                  color="primary"
                />
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      <MissionTerminal />
    </div>
  );
};

const StatBox = ({ label, value, sub, icon, color }: any) => {
  const isRed = color === 'secondary';
  const borderClass = isRed
    ? 'border-intuition-secondary/40 hover:border-intuition-secondary'
    : 'border-intuition-primary/30 hover:border-intuition-primary';
  const textClass = isRed ? 'group-hover:text-intuition-secondary' : 'group-hover:text-intuition-primary';
  const glowClass = isRed ? 'text-glow-red' : 'text-glow-blue';
  const bgClass = isRed ? 'bg-intuition-secondary shadow-glow-red' : 'bg-intuition-primary shadow-glow-blue';

  const valStr = value.toString();
  const valLength = valStr.length;

  const getFontSize = () => {
    if (valLength > 14) return 'text-base sm:text-lg md:text-xl';
    if (valLength > 12) return 'text-lg sm:text-xl md:text-2xl';
    if (valLength > 10) return 'text-xl sm:text-2xl md:text-3xl';
    if (valLength > 8) return 'text-2xl sm:text-3xl md:text-4xl';
    return 'text-3xl sm:text-4xl md:text-5xl';
  };

  return (
    <div
      className={`group relative flex h-44 min-w-0 select-none flex-col overflow-hidden rounded-2xl border-2 ${borderClass} bg-[#03050d]/90 p-5 shadow-2xl backdrop-blur-md motion-hover-lift hover:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55)] sm:h-48 sm:p-6`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] opacity-10" />

      <div
        className={`absolute left-0 top-0 h-8 w-8 border-t-2 border-l-2 ${isRed ? 'border-intuition-secondary/60' : 'border-intuition-primary/60'} opacity-40 transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div
        className={`absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 ${isRed ? 'border-intuition-secondary/60' : 'border-intuition-primary/60'} opacity-40 transition-opacity duration-500 group-hover:opacity-100`}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent opacity-40" />

      <div className="relative z-10 mb-3 flex shrink-0 items-start justify-between sm:mb-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-balance font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 transition-colors [text-shadow:0_0_24px_rgba(255,255,255,0.12)] group-hover:text-white sm:text-[11px]">
            {label}
          </span>
          <div
            className={`h-[2px] w-12 opacity-70 transition-all duration-1000 group-hover:w-full ${isRed ? 'bg-intuition-secondary' : 'bg-intuition-primary'}`}
          />
        </div>
        <div
          className={`shrink-0 rounded-xl border border-white/10 bg-black/50 p-3 shadow-inner transition-all duration-500 group-hover:scale-105 group-hover:border-current ${textClass}`}
        >
          {icon}
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 items-center justify-start overflow-hidden">
        <div
          title={valStr}
          className={`w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-display font-black leading-[1.35] tracking-tighter text-white transition-all duration-500 group-hover:scale-[1.02] ${getFontSize()} ${glowClass}`}
        >
          {value}
        </div>
      </div>

      <div className="relative z-10 mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="flex min-w-0 items-start gap-2 text-balance font-mono text-[9px] font-semibold uppercase leading-snug tracking-[0.12em] text-slate-300 transition-colors group-hover:text-white sm:text-[10px]">
          <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${bgClass.split(' ')[0]} shadow-[0_0_10px_currentColor]`} />
          <span>{sub}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-slate-400">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wide">Live</span>
          <Network size={14} className="text-slate-400 opacity-90" aria-hidden />
        </div>
      </div>

      <div
        className={`pointer-events-none absolute left-0 top-0 h-1/2 w-full -translate-y-full bg-gradient-to-b from-${isRed ? 'intuition-secondary' : 'intuition-primary'}/10 to-transparent group-hover:animate-[scanline_3s_linear_infinite]`}
      />

      <div
        className={`absolute bottom-0 left-0 h-1.5 w-full ${bgClass.split(' ')[0]} origin-left scale-x-0 shadow-[0_0_20px_currentColor] transition-transform duration-700 group-hover:scale-x-100`}
      />
    </div>
  );
};

export default Home;
