import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronRight, Copy, Loader2, Sparkles, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAddress } from 'viem';
import {
  fetchRankedListsSpotlight,
  groupSpotlightByRanker,
  type RankedListSpotlightEntry,
  type SpotlightPortalList,
  type SpotlightRankerGroup,
} from '../../services/arenaRankedListsSpotlight';
import { queueArenaPendingAdopt } from '../../services/arenaRankingRemix';
import { playArenaUiClick, playArenaUiHover } from '../../services/audio';
import { deckPalette, type DeckPaletteEntry } from '../../services/arenaCardDesign';
import { ArenaAdoptionInbox } from './ArenaAdoptionInbox';
import { ArenaPortraitImg } from './ArenaPortraitImg';

type Props = {
  portalLists: SpotlightPortalList[];
  myAddress?: string | null;
  refreshVersion?: number;
  variant?: 'home' | 'arena';
  className?: string;
  onAdopt?: (entry: RankedListSpotlightEntry) => void;
  onExploreList?: (listId: string) => void;
};

const SPOTLIGHT_FETCH = {
  maxLists: 16,
  maxRankersPerList: 80,
  maxEntries: 160,
} as const;

function shortWallet(addr: string): string {
  try {
    const a = getAddress(addr as `0x${string}`);
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
  } catch {
    return addr.length >= 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
  }
}

function isTrustName(label: string): boolean {
  return label.trim().toLowerCase().endsWith('.trust');
}

export const ArenaRankedListsSpotlight: React.FC<Props> = ({
  portalLists,
  myAddress,
  refreshVersion = 0,
  variant = 'arena',
  className = '',
  onAdopt,
  onExploreList,
}) => {
  const reduceMotion = useReducedMotion();
  const [entries, setEntries] = useState<RankedListSpotlightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRanker, setExpandedRanker] = useState<string | null>(null);
  const [expandedListKey, setExpandedListKey] = useState<string | null>(null);

  const portalKey = useMemo(
    () => portalLists.map((l) => `${l.id}:${l.listObjectTermId}`).join(','),
    [portalLists],
  );

  const rankerGroups = useMemo(() => groupSpotlightByRanker(entries), [entries]);

  const loadSpotlight = useCallback(async () => {
    if (portalLists.length < 1) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchRankedListsSpotlight({
        portalLists,
        myAddress,
        ...SPOTLIGHT_FETCH,
      });
      setEntries(rows);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [portalLists, myAddress]);

  useEffect(() => {
    void loadSpotlight();
  }, [loadSpotlight, portalKey, refreshVersion]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bump = () => void loadSpotlight();
    window.addEventListener('inturank-arena-onchain-updated', bump);
    return () => window.removeEventListener('inturank-arena-onchain-updated', bump);
  }, [loadSpotlight]);

  const handleAdopt = useCallback(
    (entry: RankedListSpotlightEntry) => {
      playArenaUiClick();
      if (onAdopt) {
        onAdopt(entry);
        return;
      }
      queueArenaPendingAdopt(entry.listId, entry.peer.player.address);
    },
    [onAdopt],
  );

  const isHome = variant === 'home';
  const showSection = loading || rankerGroups.length > 0;
  if (!showSection && portalLists.length < 1) return null;

  const listCount = new Set(entries.map((e) => e.listId)).size;

  return (
    <section
      className={`relative w-full overflow-hidden rounded-[1.35rem] border border-white/[0.09] bg-[#06080f]/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_-32px_rgba(0,243,255,0.22)] ${className}`}
      aria-label="Ranked lists by top rankers"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/45 to-transparent" />

      <div className="relative px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-7">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/[0.07] px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/90">
              <Trophy className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              On-chain spotlight
            </div>
            <h2 className="mt-2 font-display text-2xl font-black tracking-tight text-white sm:text-3xl">
              Ranked lists by top rankers
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-base">
              Same rankers you see after Compare — indexed from IntuRank + the graph. Each player shows which lists
              they ranked; expand to see their full order, then adopt.
            </p>
            {!loading && rankerGroups.length > 0 ? (
              <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {rankerGroups.length} ranker{rankerGroups.length === 1 ? '' : 's'} · {listCount} list
                {listCount === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
          {myAddress ? (
            <div className="shrink-0">
              <ArenaAdoptionInbox walletAddress={myAddress} />
            </div>
          ) : null}
        </div>

        {loading && rankerGroups.length === 0 ? (
          <div className="flex min-h-[14rem] items-center justify-center gap-3 rounded-xl border border-white/[0.06] bg-black/30">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
            <p className="text-sm text-slate-400">Loading rankers from Compare + graph index…</p>
          </div>
        ) : rankerGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/25 px-4 py-10 text-center">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-slate-500" />
            <p className="text-sm text-slate-400">No published rankings yet — rank a list and they will appear here.</p>
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rankerGroups.map((group, gi) => (
              <RankerSpotlightCard
                key={group.address}
                group={group}
                index={gi}
                myAddress={myAddress}
                reduceMotion={Boolean(reduceMotion)}
                expanded={expandedRanker === group.address.toLowerCase()}
                expandedListKey={expandedListKey}
                onToggleExpand={() => {
                  playArenaUiClick();
                  const lc = group.address.toLowerCase();
                  setExpandedRanker((prev) => (prev === lc ? null : lc));
                  setExpandedListKey(null);
                }}
                onToggleList={(key) => {
                  playArenaUiClick();
                  setExpandedRanker(group.address.toLowerCase());
                  setExpandedListKey((prev) => (prev === key ? null : key));
                }}
                onAdopt={handleAdopt}
                isHome={isHome}
                onExploreList={onExploreList}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const RankerSpotlightCard: React.FC<{
  group: SpotlightRankerGroup;
  index: number;
  myAddress?: string | null;
  reduceMotion: boolean;
  expanded: boolean;
  expandedListKey: string | null;
  onToggleExpand: () => void;
  onToggleList: (listKey: string) => void;
  onAdopt: (entry: RankedListSpotlightEntry) => void;
  isHome: boolean;
  onExploreList?: (listId: string) => void;
}> = ({
  group,
  index,
  myAddress,
  reduceMotion,
  expanded,
  expandedListKey,
  onToggleExpand,
  onToggleList,
  onAdopt,
  isHome,
  onExploreList,
}) => {
  const isSelf =
    Boolean(myAddress) && group.address.toLowerCase() === myAddress!.toLowerCase();
  const named = isTrustName(group.rankerLabel) || !/^0x/i.test(group.rankerLabel);

  return (
    <motion.article
      className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-black/55"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.28) }}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-start gap-3 p-4 text-left sm:p-4"
      >
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-lg font-black sm:text-xl ${
              isTrustName(group.rankerLabel) ? 'text-amber-100' : 'text-white'
            }`}
          >
            {group.rankerLabel}
          </p>
          {named ? (
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">{shortWallet(group.address)}</p>
          ) : null}
          <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wide text-slate-500">
            {group.lists.length} list{group.lists.length === 1 ? '' : 's'} ranked
            {group.maxArenaXp > 0 ? ` · ${group.maxArenaXp.toLocaleString()} arena XP` : ''}
          </p>
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="mt-1 shrink-0 text-slate-400"
        >
          <ChevronDown className="h-5 w-5" />
        </motion.span>
      </button>

      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {group.lists.map((entry) => {
          const deck = deckPalette(entry.arenaCategory);
          const listKey = `${group.address}-${entry.listId}`;
          return (
            <button
              key={listKey}
              type="button"
              onClick={() => onToggleList(listKey)}
              className="rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wide transition-colors hover:brightness-110"
              style={{
                borderColor: `${deck.hex}44`,
                background: expandedListKey === listKey ? `${deck.hex}28` : `${deck.hex}12`,
                color: deck.hex,
              }}
            >
              {entry.listTitle}
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="overflow-hidden border-t border-white/[0.08]"
          >
            <div className="space-y-3 p-4 pt-3">
              {group.lists.map((entry) => {
                const listKey = `${group.address}-${entry.listId}`;
                return (
                  <ListRankingPanel
                    key={listKey}
                    entry={entry}
                    open={expandedListKey === listKey}
                    isSelf={isSelf}
                    isHome={isHome}
                    onToggle={() => onToggleList(listKey)}
                    onAdopt={() => onAdopt(entry)}
                    onExploreList={onExploreList}
                  />
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
};

const ListRankingPanel: React.FC<{
  entry: RankedListSpotlightEntry;
  open: boolean;
  isSelf: boolean;
  isHome: boolean;
  onToggle: () => void;
  onAdopt: () => void;
  onExploreList?: (listId: string) => void;
}> = ({ entry, open, isSelf, isHome, onToggle, onAdopt, onExploreList }) => {
  const deck = deckPalette(entry.arenaCategory);
  const stack = useMemo(() => {
    const yes = entry.peer.listRanking.filter((r) => r.support);
    return yes.length > 0 ? yes : entry.peer.listRanking;
  }, [entry.peer.listRanking]);
  const listHref = `/climb?list=${encodeURIComponent(entry.listId)}`;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/35">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-cyan-400/90">
          {entry.listTitle}
        </span>
        <span className="flex items-center gap-2 font-mono text-[9px] text-slate-500">
          {entry.pickCount} picks
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/[0.06]"
          >
            <ol className="space-y-1.5 px-3 py-2.5">
              {stack.map((row, i) => (
                <li
                  key={row.subjectId}
                  className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/40 px-2 py-1.5"
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[8px] font-black"
                    style={{ background: `${deck.hex}28`, color: deck.hex }}
                  >
                    {i + 1}
                  </span>
                  <div className="h-7 w-7 shrink-0 overflow-hidden rounded border border-white/10">
                    <ArenaPortraitImg src={row.image} className="h-full w-full object-cover" loading="lazy">
                      <span
                        className="flex h-full w-full items-center justify-center text-[8px] font-black text-slate-500"
                        style={{ background: deck.soft }}
                      >
                        {row.label.slice(0, 1)}
                      </span>
                    </ArenaPortraitImg>
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-200">
                    {row.label}
                  </span>
                  {row.trustLabel !== '—' ? (
                    <span className="shrink-0 font-mono text-[9px] text-slate-500">{row.trustLabel}</span>
                  ) : null}
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] px-3 py-2.5">
              {isHome ? (
                <Link
                  to={listHref}
                  onClick={() => playArenaUiClick()}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-black/40 px-3 py-1.5 font-mono text-[9px] font-black uppercase text-slate-300 hover:bg-black/55"
                >
                  Open list
                  <ChevronRight className="h-3 w-3" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    playArenaUiClick();
                    onExploreList?.(entry.listId);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-black/40 px-3 py-1.5 font-mono text-[9px] font-black uppercase text-slate-300 hover:bg-black/55"
                >
                  Open list
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
              {!isSelf ? (
                isHome ? (
                  <Link
                    to={listHref}
                    onClick={() => {
                      queueArenaPendingAdopt(entry.listId, entry.peer.player.address);
                      playArenaUiClick();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-mono text-[9px] font-black uppercase text-black hover:brightness-110"
                    style={{ background: deck.hex }}
                  >
                    <Copy className="h-3 w-3" />
                    Adopt
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      playArenaUiHover();
                      onAdopt();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-mono text-[9px] font-black uppercase text-black hover:brightness-110"
                    style={{ background: deck.hex, color: deck.contrastText }}
                  >
                    <Copy className="h-3 w-3" />
                    Adopt
                  </button>
                )
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
