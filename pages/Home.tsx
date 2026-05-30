import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Activity, Binary, Box, HardDrive, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { getLists, getNetworkStats } from '../services/graphql';
import { ARENA_PORTAL_LISTS_FETCH_LIMIT, CURRENCY_SYMBOL } from '../constants';
import {
  ARENA_LISTS,
  getRegisteredPortalListEntries,
  portalListIdFromTermId,
  registerPortalListEntries,
  type ArenaListEntry,
} from '../services/arenaListsRegistry';
import { HomeWelcomeStrip } from '../components/HomeWelcomeStrip';
import { HomeGameBoard } from '../components/HomeGameBoard';
import { HomeArenaEntryEffects } from '../components/HomeArenaEntryEffects';
import { ArenaRankedListsSpotlight } from '../components/arenaFlow/ArenaRankedListsSpotlight';
import { Reveal } from '../components/Reveal';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

/**
 * HomeHero — Arcium-style hero recede + warm ember signature.
 *
 * The hero owns a warm cinnabar-tinted gradient (deep ember) so it reads
 * as visually distinct from every other section. As the user scrolls past,
 * it physically shrinks + lifts — heavy enough to be unmistakable, but no
 * opacity fade so content stays readable.
 *
 * Transform + opacity only (no filter, no layout). Subtle parallax on the
 * decorative entry effects layer makes the dots drift down slightly while
 * the hero lifts up — the "world moving through the hero" feel.
 */
const HomeHero: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();

  // Heavier recede: more visible scale + lift, still no opacity loss.
  const scale = useTransform(scrollY, [0, 700], [1, 0.92]);
  const y = useTransform(scrollY, [0, 700], [0, -120]);
  // Parallax layer drifts the opposite direction at half-speed for depth.
  const parallaxY = useTransform(scrollY, [0, 700], [0, 60]);

  return (
    <motion.div
      style={
        reduceMotion ? undefined : { scale, y, transformOrigin: '50% 30%', willChange: 'transform' }
      }
      className="relative overflow-hidden border-t border-white/[0.07] bg-gradient-to-b from-[#5a2418] via-[#321410] to-[#1a0a08]"
    >
      {/* Surrounding canvas now reads as VISIBLY warm ember (not black). The
          glass panel inside stays dark for content readability. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgb(var(--primary))]/70 to-transparent" />
      {/* Strong top radial ember — the signature warmth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-5%,rgba(255,100,70,0.55),transparent_75%)]"
      />
      {/* Side ambient warmth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_0%_45%,rgba(255,80,57,0.20),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_100%_55%,rgba(255,80,57,0.18),transparent_55%)]"
      />
      {/* Bottom cobalt parallax for depth — drifts at half scroll speed */}
      <motion.div
        aria-hidden
        style={reduceMotion ? undefined : { y: parallaxY, willChange: 'transform' }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_120%,rgba(59,90,254,0.22),transparent_50%)]"
      />
      <div className="relative">
        <HomeGameBoard />
      </div>
    </motion.div>
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
        <div className="group relative overflow-hidden rounded-[1.75rem] border border-intuition-primary/25 bg-[#03050d]/[0.96] shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_40px_rgba(255,80,57,0.1),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-intuition-primary/15 backdrop-blur-2xl backdrop-saturate-150">
          <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(255,80,57,0.12),transparent_55%)]" />
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
                ANYONE CAN CREATE A CONTEST. WHAT IS THE BEST APP, THE BEST AGENT, THE BEST TRACK OF THE WEEK,
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
                  className="inline-block min-w-[0.55em] bg-intuition-primary text-[#03050d] shadow-[0_0_12px_rgba(255,80,57,0.9)]"
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
  const { address } = useAccount();
  const [portalListEntries, setPortalListEntries] = useState<
    Extract<ArenaListEntry, { source: 'portal' }>[]
  >([]);
  const [portalRegistryTick, setPortalRegistryTick] = useState(0);

  useEffect(() => {
    const onChainUpdated = () => setPortalRegistryTick((n) => n + 1);
    window.addEventListener('inturank-arena-onchain-updated', onChainUpdated);
    return () => window.removeEventListener('inturank-arena-onchain-updated', onChainUpdated);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { items } = await getLists(ARENA_PORTAL_LISTS_FETCH_LIMIT, 0, [
          { total_position_count: 'desc' },
        ]);
        if (cancelled) return;
        const entries: Extract<ArenaListEntry, { source: 'portal' }>[] = items.map((row: any) => ({
          id: portalListIdFromTermId(row.id),
          source: 'portal' as const,
          listObjectTermId: row.id,
          title: row.label || 'Untitled list',
          description: '',
          tag: 'Live',
          arenaCategory: 'network' as const,
          listGlyph: '◆',
          totalItems: row.totalItems ?? 0,
        }));
        registerPortalListEntries(entries);
        setPortalListEntries((prev) => {
          const merged = [...entries, ...prev, ...getRegisteredPortalListEntries()];
          const m = new Map<string, Extract<ArenaListEntry, { source: 'portal' }>>();
          for (const e of merged) m.set(e.id, e);
          return [...m.values()];
        });
      } catch {
        if (!cancelled) setPortalListEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const portalListsForSpotlight = useMemo(() => {
    const m = new Map<
      string,
      { id: string; title: string; listObjectTermId: string; arenaCategory?: string }
    >();
    for (const e of [...ARENA_LISTS, ...portalListEntries, ...getRegisteredPortalListEntries()]) {
      if (e.source !== 'portal' || !e.listObjectTermId) continue;
      m.set(e.id, {
        id: e.id,
        title: e.title,
        listObjectTermId: e.listObjectTermId,
        arenaCategory: e.arenaCategory,
      });
    }
    return [...m.values()];
  }, [portalListEntries, portalRegistryTick]);

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

      <HomeHero />

      {portalListsForSpotlight.length > 0 ? (
        <div className="relative w-full border-t border-white/[0.07] bg-[#030508]">
          <div className="mx-auto w-full max-w-[min(1720px,calc(100vw-1.5rem))] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 xl:px-12">
            <ArenaRankedListsSpotlight
              portalLists={portalListsForSpotlight}
              myAddress={address}
              variant="home"
            />
          </div>
        </div>
      ) : null}

      {/*
        Light marketing band — Arcium-style dark→light→dark rhythm. Section-themed
        via data-theme="light" so CSS variables flip locally (see index.css).
      */}
      <Reveal as="section" data-theme="light" className="relative z-10 border-y border-[rgb(var(--border))]">
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 sm:py-20 lg:px-10">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl flex-1">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-[rgb(var(--primary))]">
                Trust intelligence layer
              </p>
              <h2 className="mt-4 font-display text-5xl font-black leading-[0.95] tracking-tight text-[rgb(var(--ink))] sm:text-6xl lg:text-7xl">
                Rank what matters
                <br />
                <span className="text-[rgb(var(--primary))]">on the Intuition graph.</span>
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[rgb(var(--ink-muted))] sm:text-lg">
                Pick a list. Stack cards. Settle it on-chain when you're ready. Wallets are optional until conviction matters.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:shrink-0 lg:flex-col">
              <Link
                to="/climb"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[rgb(var(--primary))] px-7 py-4 text-[14px] font-bold tracking-wide text-white transition-transform hover:-translate-y-0.5"
              >
                Enter the Arena
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <Link
                to="/markets"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[rgb(var(--ink))] px-7 py-4 text-[14px] font-bold tracking-wide text-[rgb(var(--ink))] transition-colors hover:bg-[rgb(var(--ink))] hover:text-[rgb(var(--bg))]"
              >
                Explore markets
              </Link>
            </div>
          </div>
        </div>
      </Reveal>

      {/*
        Merged "Loop + Numbers" section — one rich magazine spread.
        On lg+ the loop sits on the left (5/12) and the network grid takes the
        right (7/12). Below lg they stack. This kills the "two short sections
        stacked" feeling and creates one dense, deliberate block.
      */}
      <div className="relative border-b border-white/[0.06] bg-gradient-to-b from-[#0a0e1a] via-[#0c0e18] to-[#0a0b14] py-14 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_15%_0%,rgba(255,80,57,0.08),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_85%_100%,rgba(59,90,254,0.08),transparent_55%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12 xl:gap-16">
            {/* LEFT — How the loop plays */}
            <div className="lg:col-span-5">
              <Reveal>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-intuition-primary/30 bg-intuition-primary/10">
                    <Activity className="text-intuition-primary" size={20} strokeWidth={2.4} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-intuition-primary">
                      The loop
                    </p>
                    <h2 className="mt-0.5 font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl lg:text-[2.25rem] lg:leading-[1.05]">
                      How the loop plays
                    </h2>
                  </div>
                </div>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400 sm:text-[15px]">
                  Curate, rank, compare, then jump into the next contest. Three beats, no friction.
                </p>
              </Reveal>

              <div className="mt-6 flex flex-col gap-3 sm:gap-4">
                {[
                  {
                    step: '01',
                    title: 'Curate',
                    body: 'Swipe yes / no on the list. Agree or disagree with how the crowd is ordering it.',
                    accent: 'border-intuition-primary/30 hover:border-intuition-primary/60',
                    titleClass: 'text-intuition-primary',
                    chip: 'bg-intuition-primary/15 text-intuition-primary',
                  },
                  {
                    step: '02',
                    title: 'Rank',
                    body: 'Order your personal deck. The top spot matters; ties get broken on TRUST.',
                    accent: 'border-white/[0.12] hover:border-white/30',
                    titleClass: 'text-white',
                    chip: 'bg-white/10 text-slate-200',
                  },
                  {
                    step: '03',
                    title: 'Compare & share',
                    body: 'See similarity with other players, follow whoever clicks, then run the next contest.',
                    accent: 'border-intuition-primary/30 hover:border-intuition-primary/60',
                    titleClass: 'text-intuition-primary',
                    chip: 'bg-intuition-primary/15 text-intuition-primary',
                  },
                ].map((s, i) => (
                  <Reveal key={s.step} delay={120 + i * 80}>
                    <div
                      className={`group flex items-start gap-4 rounded-2xl border ${s.accent} bg-[#080a10]/90 p-4 transition-all duration-200 hover:-translate-y-0.5 sm:p-5`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-black tracking-wider ${s.chip}`}
                      >
                        {s.step}
                      </span>
                      <div className="min-w-0">
                        <h3 className={`font-display text-lg font-black sm:text-xl ${s.titleClass}`}>
                          {s.title}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-400">{s.body}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>

            {/* RIGHT — Network in numbers */}
            <div className="lg:col-span-7">
              <Reveal>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-intuition-secondary bg-intuition-secondary/10 shadow-glow-red">
                    <Activity className="text-intuition-secondary" size={20} strokeWidth={2.2} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-intuition-secondary">
                      The network
                    </p>
                    <h2 className="mt-0.5 font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl lg:text-[2.25rem] lg:leading-[1.05]">
                      Network in numbers
                    </h2>
                  </div>
                </div>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400 sm:text-[15px]">
                  Live stats from the Intuition graph, the contest floor is where you play.
                </p>
              </Reveal>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <Reveal delay={120}>
                  <StatBox
                    label="TRUST locked"
                    value={formattedVolume}
                    sub={`Total ${CURRENCY_SYMBOL} in markets`}
                    icon={<Box size={18} />}
                    color="secondary"
                  />
                </Reveal>
                <Reveal delay={200}>
                  <StatBox
                    label="Identities"
                    value={stats.atoms.toLocaleString()}
                    sub="People, projects & topics"
                    icon={<HardDrive size={18} />}
                    color="primary"
                  />
                </Reveal>
                <Reveal delay={280}>
                  <StatBox
                    label="Claims"
                    value={stats.signals.toLocaleString()}
                    sub="Statements on the graph"
                    icon={<Binary size={18} />}
                    color="secondary"
                  />
                </Reveal>
                <Reveal delay={360}>
                  <StatBox
                    label="Open positions"
                    value={stats.positions.toLocaleString()}
                    sub="Active stakes"
                    icon={<Activity size={18} />}
                    color="primary"
                  />
                </Reveal>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*
        Cinnabar accent strip — the Arcium "logos band" moment. Sits between the
        merged loop+numbers block and the closing CTA. Trimmed font so it stops
        the eye without flattening neighbors.
      */}
      <Reveal as="section" className="relative bg-[rgb(var(--primary))] py-10 sm:py-14">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
          <div className="flex flex-col items-start gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-white/80">
                Live on Intuition mainnet
              </p>
              <h2 className="mt-3 font-display text-4xl font-black leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-[4.25rem]">
                {formattedVolume} TRUST
                <span className="block text-white/85">locked in markets.</span>
              </h2>
            </div>
            <Link
              to="/markets"
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-black px-7 py-4 text-[14px] font-bold tracking-wide text-white transition-transform hover:-translate-y-0.5"
            >
              See the markets
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>
      </Reveal>

      {/* Closing light CTA band — second dark→light→dark beat with a benefits row
          underneath the headline so the section stops feeling sparse and gives
          a clear "why play" handoff before the mission log. */}
      <Reveal as="section" data-theme="light" className="border-y border-[rgb(var(--border))]">
        <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 sm:py-20 lg:px-10">
          <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-[rgb(var(--primary))]">
                Ready when you are
              </p>
              <h2 className="mt-4 font-display text-4xl font-black leading-[0.95] tracking-tight text-[rgb(var(--ink))] sm:text-5xl lg:text-6xl">
                Pick a list. Pick a side.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-[rgb(var(--ink-muted))] sm:text-lg">
                Play first, stake later. No wallet required to start. Real positions when conviction matters.
              </p>
            </div>
            <Link
              to="/climb"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-[rgb(var(--primary))] px-7 py-4 text-[14px] font-bold tracking-wide text-white transition-transform hover:-translate-y-0.5"
            >
              Start a contest
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--border))] sm:grid-cols-3">
            {[
              {
                label: 'Free to play',
                body: 'Swipe and rank without connecting a wallet. Wallets are optional until conviction matters.',
              },
              {
                label: 'Real positions',
                body: 'Settle on-chain when you’re ready. TRUST stakes are public, transparent, claimable.',
              },
              {
                label: 'Compare with anyone',
                body: 'See similarity scores against other players, follow whoever clicks, run the next contest.',
              },
            ].map((b) => (
              <div
                key={b.label}
                className="group flex flex-col gap-2 bg-[rgb(var(--surface))] p-6 transition-colors sm:p-7"
              >
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[rgb(var(--primary))]">
                  {b.label}
                </p>
                <p className="text-[15px] leading-relaxed text-[rgb(var(--ink-muted))]">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* MissionTerminal sits on near-true-black — the deepest section, closes the page */}
      <div className="bg-[#050505]">
        <MissionTerminal />
      </div>
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
