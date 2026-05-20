/** Arena: local stance grid + arena points. Vaults: /markets/:id */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { parseEther, formatEther, getAddress } from 'viem';
import {
  Trophy,
  Loader2,
  Sparkles,
  ChevronRight,
  Flame,
  Zap,
  SkipForward,
  Crown,
  Wallet,
  Activity,
  Clock,
  Medal,
  X,
  List,
  ArrowLeft,
  Check,
  ExternalLink,
  Scale,
  Trash2,
} from 'lucide-react';
import {
  getTopClaims,
  getLists,
  getListMemberSubjectsForObject,
  getListMembershipTripleTermId,
  predicateIsSocialTagNoise,
  predicateLooksLikeBattlePredicateLoose,
  resolveMetadata,
  registerArenaPortalListTermsForIndexing,
  fetchUserArenaRankingClaims,
  fetchDistinctRankingCreatorsForPortalList,
  fetchDistinctReceiversForPortalListFromProxyDeposits,
  fetchApproxDistinctPortalListRankerCount,
  fetchArenaLiveAtomsFromGraph,
  countListMembersForObject,
  type UserArenaRankingClaim,
} from '../services/graphql';
import {
  atomRefJobKey,
  batchEnsureAtomTermIds,
  calculateCounterTripleId,
  calculateTripleId,
  connectWallet,
  createSemanticTriplesBatch,
  depositBatchToVaults,
  getProxyApprovalStatus,
  hasCachedProxyApproval,
  getRawShareBalance,
  grantProxyApproval,
  switchNetwork,
  collapseAdjacentDuplicateSentences,
  isTermCreatedOnChain,
  isUserRejectedWalletError,
  parseProtocolError,
  sendNativeTransfer,
} from '../services/web3';
import {
  resumeArenaAudio,
  playArenaFloorEnter,
  playArenaUiClick,
  playArenaUiHover,
  playArenaCelebrateMini,
  syncArenaAmbientForClimb,
} from '../services/audio';
import { toast } from '../components/Toast';
import {
  recordArenaRankingPicks,
  arenaPickCreditXp,
  clearArenaPickCreditLedger,
  recordArenaStreakPicks,
  getArenaCurrentStreak,
  getArenaRankingPickCount,
} from '../services/arenaPickCredit';
import { recordArenaCurationPicks } from '../services/arenaCurations';
import { fetchArenaXpRecordForWallet, postArenaTotalsMirrorOptional } from '../services/arenaXp';
import { clearProtocolXpLedger, getProtocolXpTotal, notifyProtocolXpEarned, PROTOCOL_XP_UPDATED_EVENT } from '../services/protocolXp';
import { fetchArenaPlayerLeaderboard, inturankLeaderboardTotalXp, type ArenaPlayerRow } from '../services/arenaLeaderboard';
import {
  aggregateSimilarity,
  computeArenaListSimilarity,
  type ArenaSimilarityResult,
} from '../services/arenaSimilarity';
import {
  ARENA_BATCH_MODE,
  ARENA_PORTAL_LISTS_FETCH_LIMIT,
  ARENA_PERSONAL_ATTESTATION_TRIPLES,
  ARENA_XP_PER_RANK_PICK,
  BUILT_ON_INTUITION_PORTAL_LIST_OBJECT_TERM_ID,
  CURVE_OFFSET,
  LINEAR_CURVE_ID,
  OFFSET_PROGRESSIVE_CURVE_ID,
  PROTOCOL_XP_ARENA_RANK_ADD_TO_LIST_MULT,
} from '../constants';
import { bestWalletDisplayLabel } from '../services/tns';
import {
  clearPendingForList,
  clearPendingStorage,
  getFirstListIdWithPending,
  getTotalPendingCount,
  loadAllPendingRowsLive,
  loadPendingForList,
  savePendingForList,
  type ArenaPendingRow,
} from '../services/arenaPendingBatch';
import {
  ARENA_CATEGORY_PILLS,
  ARENA_LISTS,
  buildArenaItemQuestion,
  filterArenaListsByCategory,
  getArenaListById,
  getArenaListConstituents,
  getArenaPreviewItems,
  getArenaDataSourceFootprint,
  registerPortalListEntries,
  portalListIdFromTermId,
  type ArenaListEntry,
} from '../services/arenaListsRegistry';
import { buildContestHubSections } from '../services/arenaHubGroups';
import {
  alignPendingRowsToDeck,
  autoDistributeStakeUnitsAlongOrder,
  parseStakeBaseLabel,
  sortRankItemsByEffectiveStake,
} from '../services/arenaRankStake';
import { hydrateArenaFavoritesFromServer, loadArenaFavoriteListIds, pushArenaFavoriteListIdsRemote, saveArenaFavoriteListIds } from '../services/arenaFavorites';
import ArenaBatchReviewModal from '../components/ArenaBatchReviewModal';
import ArenaBatchSuccessModal, {
  type ArenaBatchSuccessPayload,
} from '../components/ArenaBatchSuccessModal';
import ArenaListCard from '../components/ArenaListCard';
import ArenaLeaderboardGlance from '../components/ArenaLeaderboardGlance';
import ArenaRankingPulse from '../components/ArenaRankingPulse';
import SignalFeed from '../components/SignalFeed';
import ArenaListQuickPick from '../components/ArenaListQuickPick';
import ArenaClimbTerrace from '../components/ArenaClimbTerrace';
import { ArenaContestHub } from '../components/arenaFlow/ArenaContestHub';
import { ArenaCreateCardModal, isPendingArenaCardId } from '../components/arenaFlow/ArenaCreateCardModal';
import { ArenaCurateStack } from '../components/arenaFlow/ArenaCurateStack';
import { ArenaRankDeck } from '../components/arenaFlow/ArenaRankDeck';
import { ArenaCompareView } from '../components/arenaFlow/ArenaCompareView';
import { ArenaPortraitImg } from '../components/arenaFlow/ArenaPortraitImg';
import { ArenaPromoteBanner } from '../components/arenaFlow/ArenaPromoteBanner';
import { ArenaPromoteContestModal } from '../components/arenaFlow/ArenaPromoteContestModal';
import type { ArenaPromoteListResult } from '../services/arenaPromoteList';
import ArenaStarredRail from '../components/ArenaStarredRail';
import { XpEarnHint } from '../components/XpEarnHint';
import IntuRankXpBadge from '../components/IntuRankXpBadge';
import { AnimatedXpFigure } from '../components/AnimatedXpFigure';
import {
  ArenaBrowseLaneHud,
  ArenaSidebarDeck,
  ArenaSidebarSessionStrip,
} from '../components/ArenaSidebarPanels';
import { FLAGSHIP_ARENA_LIST_ID } from '../services/intuRankProductSpec';
import { ARENA_THEME } from '../services/arenaUiTheme';
import { copyTextToClipboard, getArenaListShareUrl } from '../services/arenaShareLink';
export type ArenaTheme = 'claims' | 'narratives' | 'tokens' | 'passion' | 'atoms' | 'identities';

type ClaimsSortTheme = 'claims' | 'narratives' | 'passion';

/**
 * A leaderboard peer's REAL alignment with the player's current deck for
 * this contest. `similarity` carries the agree/disagree breakdown and the
 * concrete shared subjects (so chips show real items, not placeholders).
 */
export type ArenaComparePeer = {
  player: ArenaPlayerRow;
  claims: UserArenaRankingClaim[];
  similarity: ArenaSimilarityResult;
};

export type RankItemKind = 'claim' | 'atom' | 'token';

export interface RankItem {
  id: string;
  kind: RankItemKind;
  label: string;
  subtitle?: string;
  image?: string;
  /** Object / right side of a head-to-head claim (subject image stays in `image`). */
  imageSecondary?: string;
  /** Short labels for vs hero when an image is missing. */
  versusLeftLabel?: string;
  versusRightLabel?: string;
  /** Same-kind pairing: e.g. person vs person, claim-vs vs claim-vs */
  pairKind: string;
}

const POOL_SIZE = 28;
const SCORE_START = 0;
/** Single-item yes/no themes: nudge claim score up or down per stance. */
const YESNO_SCORE_YES = 28;
const YESNO_SCORE_NO = -18;

export type ArenaRound = {
  kind: 'yesno';
  /** Several stance cards at once (prediction-market grid). */
  items: RankItem[];
};

/** Arena ranking: three stance cards fill the viewport; answering one removes & shifts lanes, new fills from the right. */
const ARENA_CARDS_PER_ROUND = 3;
/** Contest flow: hub → curate stack → rank deck → compare (replaces 3-lane grid in-run). */
const ARENA_CONTEST_FLOW_V2 = true;
type ArenaFlowPhase = 'hub' | 'curate' | 'rank' | 'compare';
/**
 * IntuRank-native rankers leaderboard: always shown alongside the ranking flow
 * via the `ArenaRankerLeaderboard` component (right column on desktop, below
 * the ranking column on mobile).
 */
const ARENA_SHOW_LEADERBOARD = true;
const TERM_ID_RE = /^0x[0-9a-fA-F]{64}$/;

function readArenaListIdFromWindowSearch(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let rawSearch = window.location.search;
    if ((!rawSearch || rawSearch === '?') && window.location.hash.includes('?')) {
      rawSearch = `?${window.location.hash.split('?').slice(1).join('?').split('#')[0] ?? ''}`;
    }
    const u = new URLSearchParams(rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch);
    const lid = (u.get('list') || u.get('listId'))?.trim();
    if (lid && getArenaListById(lid)) return lid;
  } catch {
    /* ignore */
  }
  return null;
}

const ARENA_CONTEST_FLOW_STORAGE = 'inturank-arena-contest-flow-v1';

type PersistedContestFlow = {
  phase: Exclude<ArenaFlowPhase, 'hub'>;
  rankOrderIds: string[];
  rankTrustUnits: Record<string, number>;
};

function readPersistedContestFlow(listId: string): PersistedContestFlow | null {
  try {
    const raw = sessionStorage.getItem(`${ARENA_CONTEST_FLOW_STORAGE}:${listId}`);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PersistedContestFlow>;
    if (!p || typeof p !== 'object') return null;
    if (p.phase !== 'curate' && p.phase !== 'rank' && p.phase !== 'compare') return null;
    const rankOrderIds = Array.isArray(p.rankOrderIds) ? p.rankOrderIds.filter((x) => typeof x === 'string') : [];
    const rankTrustUnits =
      p.rankTrustUnits && typeof p.rankTrustUnits === 'object' ? { ...p.rankTrustUnits } : {};
    return { phase: p.phase, rankOrderIds, rankTrustUnits };
  } catch {
    return null;
  }
}

function writePersistedContestFlow(listId: string, data: PersistedContestFlow) {
  try {
    sessionStorage.setItem(`${ARENA_CONTEST_FLOW_STORAGE}:${listId}`, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function clearPersistedContestFlow(listId: string | null | undefined) {
  if (!listId) return;
  try {
    sessionStorage.removeItem(`${ARENA_CONTEST_FLOW_STORAGE}:${listId}`);
  } catch {
    /* ignore */
  }
}

/** Lane grid: roomier gutters and earlier 3-up on large screens so lanes are not cramped. */
function arenaVoteLaneGridClasses(lanes: number): string {
  if (lanes >= 3) {
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-7 lg:gap-8 xl:gap-10';
  }
  if (lanes === 2) {
    return 'grid-cols-1 sm:grid-cols-2 gap-5 md:gap-7 lg:gap-9';
  }
  return 'grid-cols-1 gap-5 md:gap-6';
}

/** Perceived-performance placeholder while pool loads (matches lane skeleton grid). */
function ArenaPoolSkeleton({ lanes }: { lanes: number }) {
  return (
    <div
      className="rounded-2xl border border-white/[0.1] p-5 sm:p-6 md:p-7 w-full backdrop-blur-sm"
      style={{
        background: ARENA_THEME.signalBrowseWell,
        boxShadow: ARENA_THEME.signalBrowseWellShadow,
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-slate-600 mb-4">Loading stance pool</p>
      <div className={`grid w-full items-stretch animate-pulse ${arenaVoteLaneGridClasses(lanes)}`}>
        {Array.from({ length: Math.max(1, lanes) }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-slate-800/40 to-slate-950/80 min-h-[220px] md:min-h-[260px] overflow-hidden"
          >
            <div className="aspect-[4/3] bg-slate-800/50" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-slate-700/50 rounded w-4/5" />
              <div className="h-3 bg-slate-800/60 rounded w-full" />
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="h-10 bg-cyan-950/40 rounded-lg border border-cyan-500/10" />
                <div className="h-10 bg-fuchsia-950/40 rounded-lg border border-fuchsia-500/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-slate-600 text-center mt-4 font-mono uppercase tracking-wider">Fetching from graph</p>
    </div>
  );
}

function pickSingleItem(pool: RankItem[], lastId: string | null): RankItem | null {
  if (pool.length === 0) return null;
  const eligible = lastId && pool.length > 1 ? pool.filter((it) => it.id !== lastId) : pool;
  const src = eligible.length ? eligible : pool;
  return src[Math.floor(Math.random() * src.length)] ?? null;
}

const STORAGE_PREFIX = 'inturank-arena-pairwise';

/** Intuition FeeProxy / vault minimum deposit per triple (enforced on-chain; see `CURVE_OFFSET`). */
const PROTOCOL_MIN_CLAIM_DEPOSIT_LABEL = formatEther(CURVE_OFFSET);

/**
 * Discrete stake tiers. With batch submissions, **each queued row’s on-chain deposit** is
 * `preset TRUST × row units`; every row must be ≥ protocol minimum (`CURVE_OFFSET`, 0.1 TRUST at 1 unit with default preset).
 */
const ARENA_STAKE_PRESETS_BATCH = [0.1, 0.25, 0.5, 1, 2.5, 5] as const;
const ARENA_STAKE_PRESETS_LEGACY = [0.1, 0.25, 0.5, 1, 2.5, 10] as const;
const ARENA_STAKE_PRESETS = (ARENA_BATCH_MODE ? ARENA_STAKE_PRESETS_BATCH : ARENA_STAKE_PRESETS_LEGACY) as
  | typeof ARENA_STAKE_PRESETS_BATCH
  | typeof ARENA_STAKE_PRESETS_LEGACY;
const ARENA_STAKE_TITLES = ARENA_BATCH_MODE
  ? (['Pulse', 'Surge', 'Blitz', 'Nova', 'Forge', 'Singularity'] as const)
  : (['Spark', 'Pulse', 'Surge', 'Blitz', 'Nova', 'Singularity'] as const);

/** Per-card multiplier in Step 2 · Rank (batch deposit = stake preset × units per row). */
const RANK_TRUST_UNITS_MAX = 12;

const NARRATIVE_PRED = /predict|forecast|will\b|should\b|believe|future|outcome|if\s+.+\s+then/i;
const BATTLE_PRED_EXTRA =
  /(?:better than|versus|\bvs\b|over\b|compared to|outperforms|beats\b|wins against)/i;

function isBattleClaimRow(row: any): boolean {
  const p = row?.predicate || '';
  if (!p || predicateIsSocialTagNoise(p)) return false;
  return predicateLooksLikeBattlePredicateLoose(p) || BATTLE_PRED_EXTRA.test(p);
}

function claimToRankItem(row: any, pairKind: string): RankItem | null {
  if (!row?.id) return null;
  const sub = row.subject?.label || '';
  const pred = row.predicate || '';
  const obj = row.object?.label || '';
  const label = [sub, pred, obj].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!label) return null;
  const subM = resolveMetadata(row.subject || {});
  const objM = resolveMetadata(row.object || {});
  const subImg = subM.image;
  const objImg = objM.image;
  const leftName = (subM.label || sub || '').trim();
  const rightName = (objM.label || obj || '').trim();
  const isVs = pairKind === 'claim-vs';
  return {
    id: String(row.id),
    kind: 'claim',
    label: label.length > 120 ? `${label.slice(0, 118)}…` : label,
    subtitle: pairKind === 'claim-vs' ? 'Versus-style claim' : 'Claim',
    image: isVs ? subImg : subImg || objImg,
    imageSecondary: isVs ? objImg : undefined,
    versusLeftLabel: isVs ? (leftName || 'A').slice(0, 48) : undefined,
    versusRightLabel: isVs ? (rightName || 'B').slice(0, 48) : undefined,
    pairKind,
  };
}

function rankItemToPendingSnapshot(item: RankItem): ArenaPendingRow['item'] {
  return {
    id: item.id,
    kind: item.kind,
    label: item.label,
    subtitle: item.subtitle,
    image: item.image,
    imageSecondary: item.imageSecondary,
    versusLeftLabel: item.versusLeftLabel,
    versusRightLabel: item.versusRightLabel,
    pairKind: item.pairKind,
  };
}

/**
 * Stance pool for contest Curate: **deterministic order** so cards follow ecosystem / indexer ordering
 * (portal lists = graph order; static = registry order; claims = indexer order). Not shuffled.
 */
async function loadClaimsSortedPool(theme: ClaimsSortTheme): Promise<RankItem[]> {
  /** Larger claim slice so more head-to-heads surface (mcap indexing is shallow versus claim depth). */
  const { items } = await getTopClaims(420, 0);
  const base = items.filter((row: any) => !predicateIsSocialTagNoise(row.predicate || ''));

  if (theme === 'claims') {
    const battle = base.filter(isBattleClaimRow);
    const src = battle.length >= 2 ? battle : base;
    const pk = battle.length >= 2 ? 'claim-vs' : 'claim';
    const mapped = src.map((r: any) => claimToRankItem(r, pk)).filter(Boolean) as RankItem[];
    return mapped.slice(0, POOL_SIZE);
  }

  if (theme === 'narratives') {
    const narrRows = base.filter((row: any) => NARRATIVE_PRED.test(row.predicate || ''));
    let src = narrRows.length >= 2 ? narrRows : base;
    return src.map((r: any) => claimToRankItem(r, 'narrative')).filter(Boolean).slice(0, POOL_SIZE) as RankItem[];
  }

  if (theme === 'passion') {
    const sorted = [...base].sort(
      (a: any, b: any) =>
        (b.holders ?? 0) + (b.opposeHolders ?? 0) - ((a.holders ?? 0) + (a.opposeHolders ?? 0))
    );
    return sorted.map((r: any) => claimToRankItem(r, 'heat')).filter(Boolean).slice(0, POOL_SIZE) as RankItem[];
  }

  return base.map((r: any) => claimToRankItem(r, 'claim')).filter(Boolean).slice(0, POOL_SIZE) as RankItem[];
}

async function loadGraphqlArenaContestPool(entry: Extract<ArenaListEntry, { source: 'graphql' }>): Promise<RankItem[]> {
  const cid = entry.id;
  /** After skipping claim-heavy vault heads, small pools still beat an empty Arena deck. */
  const minAtomRows = 2;
  const minIdentityRows = 2;

  if (entry.theme === 'tokens') {
    try {
      const rows = await fetchArenaLiveAtomsFromGraph({ poolSize: POOL_SIZE, scanLimit: 480 });
      if (rows.length >= minAtomRows) return mapArenaGraphAtomsToRank(rows, 'graph-macro');
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Arena] ticker graph hydrate failed', cid, e);
    }
    return [];
  }

  if (entry.theme === 'atoms') {
    try {
      const rows = await fetchArenaLiveAtomsFromGraph({ poolSize: POOL_SIZE, scanLimit: 480 });
      if (rows.length >= minAtomRows) return mapArenaGraphAtomsToRank(rows, 'graph-ecosystem');
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Arena] atoms contest hydrate failed', cid, e);
    }
    return [];
  }

  if (entry.theme === 'identities') {
    try {
      let rows = await fetchArenaLiveAtomsFromGraph({
        poolSize: POOL_SIZE,
        scanLimit: 640,
        atomTypesUpper: ['ACCOUNT', 'PERSON'],
      });
      /** Indexer atom `type` strings vary — widen before falling back to all non-claim vault picks. */
      if (rows.length < minIdentityRows) {
        rows = await fetchArenaLiveAtomsFromGraph({
          poolSize: POOL_SIZE,
          scanLimit: 840,
          atomTypesUpper: ['ACCOUNT', 'PERSON', 'ORGANIZATION', 'ORG'],
        });
      }
      if (rows.length < minIdentityRows) {
        rows = await fetchArenaLiveAtomsFromGraph({ poolSize: POOL_SIZE, scanLimit: 960 });
      }
      if (rows.length >= minIdentityRows) return mapArenaGraphAtomsToRank(rows, 'graph-identity');
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Arena] identity contest hydrate failed', cid, e);
    }
    return [];
  }

  const t = entry.theme;
  if (t === 'claims' || t === 'narratives' || t === 'passion') {
    return loadClaimsSortedPool(t);
  }
  return loadClaimsSortedPool('claims');
}

function mapArenaGraphAtomsToRank(
  rows: Awaited<ReturnType<typeof fetchArenaLiveAtomsFromGraph>>,
  pairKind: string
): RankItem[] {
  return rows.map((r) => ({
    id: r.termId,
    kind: 'atom' as const,
    label: r.label,
    subtitle: r.subtitle,
    image: r.image,
    pairKind,
  }));
}

async function loadArenaListPool(entry: ArenaListEntry): Promise<RankItem[]> {
  if (entry.source === 'static') {
    /** Registry order preserved (same curator sequence as authored). */
    return [...entry.items];
  }
  if (entry.source === 'portal') {
    /** Members in subgraph order (recent adds first); community-visible, not random. */
    const rows = await getListMemberSubjectsForObject(entry.listObjectTermId, 280);
    if (rows.length < 1) return [];
    return rows.map((r) => ({
      id: r.id,
      kind: 'atom' as const,
      label: r.label,
      subtitle: 'On-chain list roster in subgraph order',
      image: r.image,
      pairKind: 'list-member',
    }));
  }
  return loadGraphqlArenaContestPool(entry);
}

/** Explains curator vs indexer vs portal for reviewers and demos (see `arenaListsRegistry` header). */
function FootprintStripe({ entry }: { entry: ArenaListEntry }) {
  const fp = getArenaDataSourceFootprint(entry);
  const shell =
    fp.kind === 'live_indexer' || fp.kind === 'portal_chain'
      ? 'border-emerald-400/35 bg-emerald-500/[0.12] text-emerald-100/95'
      : 'border-amber-400/35 bg-amber-500/[0.1] text-amber-100/95';

  return (
    <div className="mt-2 rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-1.5">
      <p className="text-[10px] leading-snug text-slate-400">
        <span
          className={`mr-2 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 align-middle text-[9px] font-mono font-black uppercase tracking-[0.14em] ${shell}`}
          title={fp.detailLine}
        >
          {fp.kind === 'live_indexer' || fp.kind === 'portal_chain' ? (
            <span className="block h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.8)]" aria-hidden />
          ) : null}
          {fp.badgeShort}
        </span>
        {fp.detailLine}
      </p>
    </div>
  );
}

function pickYesNoGridItems(pool: RankItem[], n: number): RankItem[] {
  if (pool.length === 0) return [];
  const k = Math.min(n, pool.length);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, k);
}

function pickNextUniqueFromPool(pool: RankItem[], visible: RankItem[]): RankItem | null {
  const keepIds = new Set(visible.map((it) => it.id));
  const eligible = pool.filter((it) => !keepIds.has(it.id));
  if (eligible.length > 0) {
    return eligible[Math.floor(Math.random() * eligible.length)] ?? null;
  }
  const lastId = visible[visible.length - 1]?.id ?? null;
  return pickSingleItem(pool, lastId);
}

/**
 * After a Yes/No, remove that lane entry; lanes shift visually (compact array order).
 * Back-fill slots from pool up to `ARENA_CARDS_PER_ROUND` with unique entries where possible.
 */
function refillLanesAfterAnswer(pool: RankItem[], prevLanes: RankItem[], answeredItem: RankItem): RankItem[] | null {
  const idx = prevLanes.findIndex((it) => it.id === answeredItem.id);
  if (idx < 0) return null;
  const rest = [...prevLanes.slice(0, idx), ...prevLanes.slice(idx + 1)];
  while (rest.length < ARENA_CARDS_PER_ROUND && pool.length > 0) {
    const next = pickNextUniqueFromPool(pool, rest);
    if (!next) break;
    rest.push(next);
  }
  return rest.length > 0 ? rest : null;
}

function dedupeArenaEntries(entries: ArenaListEntry[]): ArenaListEntry[] {
  const seenIds = new Set<string>();
  const seenPortalListObjectHex = new Set<string>();
  const out: ArenaListEntry[] = [];
  for (const e of entries) {
    if (seenIds.has(e.id)) continue;
    if (e.source === 'portal') {
      const raw = e.listObjectTermId.trim();
      if (raw) {
        const hex = raw.replace(/^0x/i, '').toLowerCase();
        if (seenPortalListObjectHex.has(hex)) continue;
        seenPortalListObjectHex.add(hex);
      }
    }
    seenIds.add(e.id);
    out.push(e);
  }
  return out;
}

/** Raw Elo-style scores start at 0 and can go negative; display with a baseline so numbers read like familiar ratings. */
const ARENA_RATING_DISPLAY_BASE = 1500;

function fmtArenaScore(raw: number): string {
  return Math.round(raw + ARENA_RATING_DISPLAY_BASE).toLocaleString('en-US');
}

function getStreakTier(s: number): { label: string; className: string } {
  if (s >= 12)
    return {
      label: 'Unstoppable',
      className: 'from-intuition-primary/90 to-intuition-secondary/80 shadow-[0_0_20px_rgba(0,243,255,0.35)]',
    };
  if (s >= 7)
    return { label: 'Blazing', className: 'from-intuition-primary/85 to-cyan-600/75 shadow-[0_0_16px_rgba(0,243,255,0.28)]' };
  if (s >= 3) return { label: 'On fire', className: 'from-cyan-400/80 to-intuition-primary/70 shadow-[0_0_14px_rgba(0,243,255,0.22)]' };
  if (s >= 1) return { label: 'Heating up', className: 'from-slate-600/70 to-intuition-primary/60 shadow-[0_0_12px_rgba(0,243,255,0.15)]' };
  return { label: '', className: '' };
}

/** Arena XP tier (cyan/magenta palette; matches profile). */
function arenaCombatTier(xp: number): { label: string; chip: string } {
  if (xp >= 5000)
    return {
      label: 'Mythic',
      chip: 'bg-gradient-to-r from-intuition-primary/45 to-intuition-secondary/40 text-white border-intuition-primary/55 shadow-[0_0_16px_rgba(0,243,255,0.22)]',
    };
  if (xp >= 2500)
    return {
      label: 'Apex',
      chip: 'bg-gradient-to-r from-intuition-primary/35 to-cyan-700/40 text-cyan-50 border-intuition-primary/45 shadow-[0_0_14px_rgba(0,243,255,0.18)]',
    };
  if (xp >= 1000)
    return {
      label: 'Elite',
      chip: 'bg-gradient-to-r from-slate-600/55 to-intuition-primary/35 text-slate-50 border-intuition-primary/40 shadow-[0_0_12px_rgba(0,243,255,0.14)]',
    };
  if (xp >= 500)
    return {
      label: 'Veteran',
      chip: 'bg-gradient-to-r from-slate-600/50 to-slate-800/55 text-slate-100 border-slate-400/45',
    };
  if (xp >= 150)
    return {
      label: 'Contender',
      chip: 'bg-gradient-to-r from-slate-600/50 to-slate-700/50 text-slate-50 border-slate-400/45',
    };
  return {
    label: 'Rookie',
    chip: 'bg-gradient-to-r from-slate-700/55 to-slate-900/55 text-slate-200 border-slate-500/40',
  };
}

function formatRelativeArenaActive(ts: number): string {
  if (!ts) return '…';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 45) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** First meaningful avatar glyph when label is unclear (avoid leading “0” on 0x… strings). */
function leaderboardAvatarGlyph(label: string): string {
  const t = (label || '').trim();
  if (/^0x/i.test(t)) {
    const firstHex = t.slice(2).match(/[a-f0-9]/i);
    return firstHex ? firstHex[0].toUpperCase() : '?';
  }
  const m = /[a-zA-Z0-9]/.exec(t);
  return m ? m[0].toUpperCase() : '?';
}

function loadPersistedForList(listId: string): Record<string, number> | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}-scores-${listId}`);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && typeof o === 'object') return o as Record<string, number>;
  } catch {
    /* ignore */
  }
  return null;
}

function savePersistedForList(listId: string, s: Record<string, number>) {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}-scores-${listId}`, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Drop all cached stance integers for one list so a clear cannot “come back” after refresh. */
function wipePersistedArenaScoresForList(listId: string | null | undefined) {
  if (!listId) return;
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}-scores-${listId}`);
  } catch {
    /* ignore */
  }
}

function patchArenaPersistedScore(listId: string | null | undefined, itemId: string, delta: number) {
  if (!listId) return;
  const persisted = loadPersistedForList(listId) ?? {};
  const R = persisted[itemId] ?? SCORE_START;
  savePersistedForList(listId, { ...persisted, [itemId]: R + delta });
}

/** Vote lane card. Markets-style metrics strip + Yes/No actions. */
function ArenaLaneCard({
  item,
  activeList,
  stakingTx,
  reduceMotion,
  emphasized,
  marketHref,
  laneIndex,
  lanesInRound,
  xpRoundTotal,
  onYesNo,
}: {
  item: RankItem;
  activeList: ArenaListEntry | null | undefined;
  stakingTx: boolean;
  reduceMotion: boolean | null;
  emphasized: boolean;
  marketHref?: string | null;
  laneIndex: number;
  lanesInRound: number;
  xpRoundTotal: number;
  onYesNo: (support: boolean) => void;
}) {
  let questionLine = '';
  if (activeList) {
    questionLine =
      typeof activeList.itemQuestion === 'function' ? activeList.itemQuestion(item) : buildArenaItemQuestion(activeList, item);
  }

  const isClaimVs = item.kind === 'claim' && item.pairKind === 'claim-vs';
  const idShort = item.id.length > 12 ? `${item.id.slice(0, 10)}…` : item.id;
  const li = (item.versusLeftLabel || '?').trim().charAt(0).toUpperCase() || '?';
  const ri = (item.versusRightLabel || '?').trim().charAt(0).toUpperCase() || '?';
  const soloLetter = (item.label || '?').trim().charAt(0).toUpperCase() || '?';

  const shellTint = emphasized
    ? `0 0 0 1px ${ARENA_THEME.violet}33, 0 12px 40px ${ARENA_THEME.redDim}`
    : `inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 44px rgba(0,0,0,0.35)`;

  const laneAccent =
    lanesInRound >= 3
      ? laneIndex === 0
        ? ARENA_THEME.cyan
        : laneIndex === 1
          ? ARENA_THEME.gold
          : ARENA_THEME.violet
      : laneIndex === 0
        ? ARENA_THEME.cyan
        : ARENA_THEME.gold;

  return (
    <article
      title={item.id}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-950/80 backdrop-blur-xl transition-[box-shadow,border-color] duration-300 hover:border-white/[0.14] ${
        emphasized ? 'ring-1 ring-violet-400/15' : ''
      }`}
      style={{
        background: ARENA_THEME.currentRunCard,
        boxShadow: shellTint,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-1 rounded-t-2xl"
        aria-hidden
        style={{ background: ARENA_THEME.rimBar }}
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-violet-500/[0.04] opacity-70"
        aria-hidden
      />

      <div className="relative z-10 flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            {isClaimVs ? (
              <div className="-space-x-2 flex items-center">
                <div className="relative z-[2] h-10 w-10 overflow-hidden rounded-lg border border-white/12 bg-black/70 sm:h-11 sm:w-11">
                  <ArenaPortraitImg
                    src={item.image}
                    className="h-full w-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0"
                    loading="lazy"
                  >
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">{li}</div>
                  </ArenaPortraitImg>
                </div>
                <div className="relative z-[1] h-10 w-10 overflow-hidden rounded-lg border border-white/12 bg-black/70 sm:h-11 sm:w-11">
                  <ArenaPortraitImg
                    src={item.imageSecondary}
                    className="h-full w-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0"
                    loading="lazy"
                  >
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">{ri}</div>
                  </ArenaPortraitImg>
                </div>
              </div>
            ) : (
              <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-white/12 bg-black/70 sm:h-11 sm:w-11">
                <ArenaPortraitImg
                  src={item.image}
                  className="h-full w-full object-cover grayscale transition-all duration-700 group-hover:grayscale-0"
                  loading="lazy"
                >
                  <div
                    className="flex h-full w-full items-center justify-center text-base font-bold sm:text-lg"
                    style={{ color: ARENA_THEME.cyanMuted }}
                  >
                    {soloLetter}
                  </div>
                </ArenaPortraitImg>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="mb-1.5 flex flex-wrap items-center gap-1">
              {item.pairKind ? (
                <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {item.pairKind}
                </span>
              ) : null}
              <span className="rounded-md bg-intuition-primary/12 px-2 py-0.5 text-[10px] font-medium text-intuition-primary/95">
                Climb
              </span>
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                style={{
                  color: ARENA_THEME.cyanMuted,
                  background: `${ARENA_THEME.cyan}12`,
                }}
              >
                {item.kind}
              </span>
            </div>
            <h3 className="line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-white sm:text-base">
              {item.label}
            </h3>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1 tabular-nums text-slate-400">
                <Zap size={12} className="shrink-0 text-intuition-primary/90" aria-hidden />+{xpRoundTotal} XP
              </span>
              <span className="text-slate-600" aria-hidden>
                ·
              </span>
              {item.subtitle ? (
                <>
                  <span className="truncate text-slate-500">{item.subtitle}</span>
                  <span className="text-slate-600" aria-hidden>
                    ·
                  </span>
                </>
              ) : null}
              <span className="font-mono text-[10px] text-slate-600">{idShort}</span>
            </p>
          </div>

          <span
            className="shrink-0 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-200"
            style={{
              background: `${laneAccent}18`,
              boxShadow: `inset 0 0 0 1px ${laneAccent}35`,
            }}
          >
            {laneIndex + 1}/{lanesInRound}
          </span>
        </div>
        {questionLine ? (
          <div
            className="mb-4 mt-4 border-l-2 py-0.5 pl-3 sm:mb-5 sm:mt-5"
            style={{
              borderColor: `${ARENA_THEME.cyan}66`,
              background: `linear-gradient(90deg, ${ARENA_THEME.cyan}0d, transparent 70%)`,
            }}
          >
            <p className="text-[13px] leading-relaxed text-slate-200 sm:text-sm">{questionLine}</p>
          </div>
        ) : null}

        <div className="mt-auto pt-2">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => onYesNo(true)}
              disabled={stakingTx}
              onMouseEnter={playArenaUiHover}
              className="rounded-xl border border-cyan-400/45 bg-cyan-500/[0.14] py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-150 hover:border-cyan-300/55 hover:bg-cyan-500/[0.2] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <Check className="h-[17px] w-[17px] text-cyan-100" strokeWidth={2.4} />
                <span className="text-sm font-semibold text-white">Yes</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onYesNo(false)}
              disabled={stakingTx}
              onMouseEnter={playArenaUiHover}
              className="rounded-xl border border-red-400/45 bg-red-500/[0.12] py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-150 hover:border-red-300/55 hover:bg-red-500/[0.18] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <X className="h-[17px] w-[17px] text-red-100" strokeWidth={2.4} />
                <span className="text-sm font-semibold text-white">No</span>
              </span>
            </button>
          </div>
        </div>

        {marketHref ? (
          <div className="mt-3 border-t border-white/[0.06] pt-3">
            <Link
              to={marketHref}
              onClick={() => playArenaUiClick()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:text-cyan-200"
            >
              <ExternalLink size={13} strokeWidth={2.2} />
              Crowd &amp; vault
              <ChevronRight size={13} className="opacity-70" />
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function parseEnvTreasuryRaw(): string {
  let raw = (import.meta.env.VITE_ARENA_TREASURY_ADDRESS as string | undefined)?.trim() ?? '';
  raw = raw.replace(/^['"]|['"]$/g, '');
  return raw;
}

/** Resolves checksum; strips quotes. Restarts `npm run dev` after changing `.env` so Vite picks up `VITE_*`. */
function getTreasury(): `0x${string}` | null {
  const raw = parseEnvTreasuryRaw();
  if (!raw) return null;
  const with0x = raw.startsWith('0x') || raw.startsWith('0X') ? raw : `0x${raw}`;
  try {
    return getAddress(with0x as `0x${string}`);
  } catch {
    return null;
  }
}

/** Index into `ARENA_STAKE_PRESETS` (defaults to `CURVE_OFFSET`, 0.1 TRUST). */
function defaultStakePresetIndex(): number {
  const raw = (import.meta.env.VITE_ARENA_DEFAULT_STAKE_TRUST as string | undefined)?.trim();
  /** Earlier builds documented `0.5` as the example default; ignore so testers land on 0.1 unless they pick another value. */
  const env = raw && raw !== '0.5' ? raw : '';
  const floorTrust = parseFloat(formatEther(CURVE_OFFSET));
  const target = (() => {
    if (!env) return Number.isFinite(floorTrust) && floorTrust > 0 ? floorTrust : 0.1;
    const n = parseFloat(env.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return Number.isFinite(floorTrust) && floorTrust > 0 ? floorTrust : 0.1;
    return n;
  })();
  let best = 0;
  let bestD = Infinity;
  ARENA_STAKE_PRESETS.forEach((v, i) => {
    const d = Math.abs(v - target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

const RankedList: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [listId, setListId] = useState<string | null>(() => readArenaListIdFromWindowSearch());
  const [pool, setPool] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [round, setRound] = useState<ArenaRound | null>(null);
  const [duels, setDuels] = useState(0);
  const [streak, setStreak] = useState(0);
  const [stakePresetIdx, setStakePresetIdx] = useState(defaultStakePresetIndex);
  const [stakingTx, setStakingTx] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);
  const [arenaCategoryId, setArenaCategoryId] = useState<string>('all');
  const [openBatchAfterLoad, setOpenBatchAfterLoad] = useState(false);
  const [showAllLists, setShowAllLists] = useState(false);
  const [arenaFlowPhase, setArenaFlowPhase] = useState<ArenaFlowPhase>(() => {
    const lid = readArenaListIdFromWindowSearch();
    if (!lid) return 'hub';
    const persisted = readPersistedContestFlow(lid);
    if (persisted) return persisted.phase;
    return 'curate';
  });
  const [curateQueue, setCurateQueue] = useState<RankItem[]>([]);
  const [rankDeckItems, setRankDeckItems] = useState<RankItem[]>([]);
  /** Inline "create a new card" modal for the Rank step (no nav-away). */
  const [createCardOpen, setCreateCardOpen] = useState(false);
  /** Mint contest modal (static lists only). */
  const [promoteContestOpen, setPromoteContestOpen] = useState(false);
  /**
   * Commit coordinator phase. On Compare, "Sign + pick next game" runs the
   * full on-chain commit chain. We track which phase we're in so the promote
   * modal's success callback knows to chain into the rank-batch step instead
   * of just navigating away. Stays `'idle'` until the user hits Submit.
   */
  const [commitPhase, setCommitPhase] = useState<'idle' | 'promote' | 'rank-batch'>('idle');
  /** Per ranked card: TRUST weight = session preset × units (batch rows). */
  const [rankTrustUnits, setRankTrustUnits] = useState<Record<string, number>>({});
  /** Tracks latest trust units for reorder handlers (avoid nested setState drift). */
  const rankTrustUnitsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    rankTrustUnitsRef.current = rankTrustUnits;
  }, [rankTrustUnits]);
  /** Deck tune counter until you sign XP from batch/protocol. */
  const [deckEngagementTuneCount, setDeckEngagementTuneCount] = useState(0);
  const bumpDeckEngagement = useCallback(() => setDeckEngagementTuneCount((c) => c + 1), []);
  const curateInitForListRef = useRef<string | null>(null);
  const prevListIdForFlowRef = useRef<string | null>(null);
  const guestCurateNudgeRef = useRef(false);
  /** Deeplink vs hub: avoid double-playing the floor-enter stinger for the same list. */
  const arenaFloorStingerPlayedForListRef = useRef<string | null>(null);
  /** Stars rail collapsed by default (expands from the right rail). */
  const [starredRailCollapsed, setStarredRailCollapsed] = useState(false);
  const [favoriteListIds, setFavoriteListIds] = useState<string[]>(() => loadArenaFavoriteListIds());
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showOnboardTip = searchParams.get('onboard') === '1';
  const climbViewMode: 'arena' | 'explorer' | 'signal' = (() => {
    const v = searchParams.get('view');
    if (v === 'explorer') return 'explorer';
    if (v === 'signal') return 'signal';
    return 'arena';
  })();

  const setClimbViewMode = useCallback(
    (mode: 'arena' | 'explorer' | 'signal') => {
      playArenaUiClick();
      setSearchParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (mode === 'arena') next.delete('view');
          else next.set('view', mode);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const dismissOnboardTip = useCallback(() => {
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('onboard');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);
  const openBatchParamHandled = useRef(false);
  /** Avoid clearing session-restored list on first `/climb` mount when the URL has no `list` param. */
  const urlSyncSkipInitialClearRef = useRef(true);
  const graphReturnNudgeDone = useRef(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  /** Inline confirm: clear this contest vs clear global conviction cart (from top bar). */
  const [pendingArenaClear, setPendingArenaClear] = useState<null | 'contest' | 'cart'>(null);
  const [arenaBatchSuccess, setArenaBatchSuccess] = useState<ArenaBatchSuccessPayload | null>(null);
  const [pendingRows, setPendingRows] = useState<ArenaPendingRow[]>([]);
  const [players, setPlayers] = useState<ArenaPlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  /**
   * Real per-peer similarity for the current contest. Only populated for
   * portal lists where we have an on-chain `listObjectTermId` to anchor
   * `UserArenaRankingClaim` rows against.
   */
  const [comparePeers, setComparePeers] = useState<ArenaComparePeer[]>([]);
  const [comparePeersLoading, setComparePeersLoading] = useState(false);
  /** Refetch Compare similarities after batch / pick events (indexer lags). */
  const [comparePeersVersion, setComparePeersVersion] = useState(0);
  /** Bumps portal list ranker-count refetch alongside Compare peers after on-chain submits. */
  const [listRankersTick, setListRankersTick] = useState(0);
  /** Distinct wallets with indexed activity on this portal list (deposit path + triple creators). */
  const [portalListRankerCount, setPortalListRankerCount] = useState<number | null>(null);
  const [portalListRankerCountLoading, setPortalListRankerCountLoading] = useState(false);
  const reduceMotion = useReducedMotion();

  const batchModalRows = useMemo(
    () => loadAllPendingRowsLive(listId, pendingRows),
    [listId, pendingRows]
  );

  const batchModalRowsLabeled = useMemo(() => {
    const ids = new Set(batchModalRows.map((r) => r.sourceListId));
    const multi = ids.size > 1;
    return batchModalRows.map((r) => ({
      ...r,
      ...(multi
        ? { sourceListTitle: getArenaListById(r.sourceListId)?.title ?? 'List' }
        : {}),
    }));
  }, [batchModalRows]);

  const batchModalHeader = useMemo(() => {
    const ids = [...new Set(batchModalRows.map((r) => r.sourceListId))];
    if (ids.length === 1) {
      const e = getArenaListById(ids[0]);
      return { contextSuffix: e?.tag ?? 'list', themeShort: e?.title ?? 'Arena' };
    }
    if (ids.length === 0) return { contextSuffix: 'live', themeShort: 'Arena' };
    return { contextSuffix: `${ids.length} lists`, themeShort: 'All queued picks' };
  }, [batchModalRows]);

  const stakeTRUST = useMemo(() => String(ARENA_STAKE_PRESETS[stakePresetIdx] ?? ARENA_STAKE_PRESETS[0]), [stakePresetIdx]);
  const rankStakeBaseParsed = useMemo(() => parseStakeBaseLabel(stakeTRUST), [stakeTRUST]);

  /** Batch claims: FeeProxy rejects any triple row whose depositWei is below CURVE_OFFSET. */
  const batchDepositBelowProtocol = useMemo(() => {
    if (!ARENA_BATCH_MODE || batchModalRows.length === 0) return false;
    let baseWei: bigint;
    try {
      baseWei = parseEther((stakeTRUST || '0').trim() || '0');
    } catch {
      return true;
    }
    return batchModalRows.some((row) => baseWei * BigInt(row.units) < CURVE_OFFSET);
  }, [batchModalRows, stakeTRUST]);

  /** Keep preset index in range if tiers differ between batch vs legacy builds. */
  useEffect(() => {
    setStakePresetIdx((i) => Math.min(Math.max(0, i), ARENA_STAKE_PRESETS.length - 1));
  }, []);

  const treasury = useMemo(() => getTreasury(), []);

  const refreshPlayers = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setPlayersLoading(true);
    try {
      const rows = await fetchArenaPlayerLeaderboard(address ?? undefined);
      setPlayers(rows);
    } catch {
      setPlayers([]);
    } finally {
      if (!silent) setPlayersLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refreshPlayers();
  }, [refreshPlayers]);

  /**
   * Poll leaderboard bursts after Arena batch succeeds; indexer needs seconds to attach FeeProxy stakes.
   */
  useEffect(() => {
    let burstTimers: number[] = [];
    const onUp = () => {
      void refreshPlayers({ silent: true });
      burstTimers.forEach((t) => window.clearTimeout(t));
      burstTimers = [4_000, 12_000, 25_000, 45_000].map((ms) =>
        window.setTimeout(() => void refreshPlayers({ silent: true }), ms),
      );
    };
    window.addEventListener('inturank-arena-onchain-updated', onUp);
    return () => {
      burstTimers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('inturank-arena-onchain-updated', onUp);
    };
  }, [refreshPlayers]);

  useEffect(() => {
    const w = address?.trim();
    if (!w?.toLowerCase().startsWith('0x')) return;
    let cancelled = false;
    void hydrateArenaFavoritesFromServer(w).then((merged) => {
      if (!cancelled && merged) setFavoriteListIds(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    const bump = () => {
      setComparePeersVersion((v) => v + 1);
      setListRankersTick((t) => t + 1);
    };
    window.addEventListener('inturank-arena-onchain-updated', bump);
    return () => window.removeEventListener('inturank-arena-onchain-updated', bump);
  }, []);

  const [graphArenaXp, setGraphArenaXp] = useState(0);
  /** After first graph XP fetch for wallet; avoids flashing 0 before indexer lands. */
  const [arenaGraphReady, setArenaGraphReady] = useState(false);
  const [protocolLedgerTick, setProtocolLedgerTick] = useState(0);
  const [pickCreditTick, setPickCreditTick] = useState(0);

  useEffect(() => {
    const onProto = () => setProtocolLedgerTick((n) => n + 1);
    window.addEventListener(PROTOCOL_XP_UPDATED_EVENT, onProto);
    return () => window.removeEventListener(PROTOCOL_XP_UPDATED_EVENT, onProto);
  }, []);

  const myProtocolXp = useMemo(
    () => (address ? getProtocolXpTotal(address) : 0),
    [address, protocolLedgerTick]
  );
  const arenaPickXp = useMemo(() => arenaPickCreditXp(address), [address, pickCreditTick]);
  /** Lifetime ranks confirmed through IntuRank from this device, by wallet. Drives the Session strip. */
  const lifetimeRoundsForWallet = useMemo(
    () => (address ? getArenaRankingPickCount(address) : 0),
    [address, pickCreditTick],
  );
  const currentStreakForWallet = useMemo(
    () => (address ? getArenaCurrentStreak(address) : 0),
    [address, pickCreditTick],
  );
  /** Indexer rarely credits vault-only stakes to `triple.creator`; pick credit bridges until subgraph matches your wallet. */
  const arenaXpUi = Math.max(graphArenaXp, arenaPickXp);
  /** One total on this page (no animated count-up; it read as wrong numbers mid-tween). */
  const xpDisplayTarget = arenaXpUi + myProtocolXp;

  const refreshArenaXpSelf = useCallback(async () => {
    if (!address) {
      setGraphArenaXp(0);
      return;
    }
    try {
      const rec = await fetchArenaXpRecordForWallet(address);
      setGraphArenaXp(rec.xp);
    } catch {
      setGraphArenaXp(0);
    } finally {
      setArenaGraphReady(true);
    }
  }, [address]);

  useEffect(() => {
    setArenaGraphReady(false);
  }, [address]);

  useEffect(() => {
    void refreshArenaXpSelf();
  }, [refreshArenaXpSelf]);

  useEffect(() => {
    const onUp = () => void refreshArenaXpSelf();
    window.addEventListener('inturank-arena-onchain-updated', onUp);
    return () => window.removeEventListener('inturank-arena-onchain-updated', onUp);
  }, [refreshArenaXpSelf]);

  const playersMaxXp = useMemo(() => {
    if (!players.length) return 1;
    return Math.max(1, ...players.map((p) => inturankLeaderboardTotalXp(p)));
  }, [players]);

  const myLadderPosition = useMemo(() => {
    if (!address || !players.length) return null;
    const i = players.findIndex((p) => p.address === address.toLowerCase());
    if (i < 0) return null;
    return { place: i + 1, total: players.length };
  }, [address, players]);

  const curateAgreedYesCount = useMemo(
    () => pool.filter((it) => (scores[it.id] ?? SCORE_START) > SCORE_START).length,
    [pool, scores],
  );
  const curatePlayerCount = useMemo(() => {
    const entry = listId ? getArenaListById(listId) : undefined;
    if (
      entry?.source === 'portal' &&
      portalListRankerCount != null &&
      portalListRankerCount >= 1
    ) {
      return portalListRankerCount;
    }
    return Math.max(players.length, pool.length + 4, 12);
  }, [listId, portalListRankerCount, players.length, pool.length]);
  /**
   * Compare numbers from on-chain data when we have it; otherwise `null` so UI stays honest.
   */
  const compareSimilarityAgg = useMemo(
    () => aggregateSimilarity(comparePeers.map((p) => p.similarity)),
    [comparePeers],
  );
  /** Headline similarity vs the top of the on-chain leaderboard for THIS list. */
  const compareSimilarityPct: number | null = compareSimilarityAgg?.similarityPct ?? null;
  /** Ladder bar when placement is known. */
  const compareProgressionPct: number | null = useMemo(() => {
    if (!myLadderPosition || myLadderPosition.total <= 0) return null;
    return Math.max(
      0,
      Math.min(100, Math.round((1 - myLadderPosition.place / myLadderPosition.total) * 100)),
    );
  }, [myLadderPosition]);
  /** Games-to-top-10 only when their actual place is known and they're outside top-10. */
  const compareGamesToTop10: number | null = useMemo(() => {
    if (!myLadderPosition) return null;
    if (myLadderPosition.place <= 10) return 0;
    return myLadderPosition.place - 10;
  }, [myLadderPosition]);

  const activeList = useMemo(() => getArenaListById(listId), [listId]);

  useEffect(() => {
    const entry = listId ? getArenaListById(listId) : undefined;
    if (entry?.source === 'portal' && entry.listObjectTermId) {
      registerArenaPortalListTermsForIndexing([entry.listObjectTermId]);
    }
  }, [listId]);

  /**
   * Curate headline: approximate “players on this list” from indexer (FeeProxy receivers ∪ triple creators).
   */
  useEffect(() => {
    const entry = listId ? getArenaListById(listId) : undefined;
    if (!entry || entry.source !== 'portal' || !entry.listObjectTermId) {
      setPortalListRankerCount(null);
      setPortalListRankerCountLoading(false);
      return;
    }
    let cancelled = false;
    setPortalListRankerCountLoading(true);
    void (async () => {
      try {
        const n = await fetchApproxDistinctPortalListRankerCount(entry.listObjectTermId, address ?? null);
        if (!cancelled) setPortalListRankerCount(n);
      } catch {
        if (!cancelled) setPortalListRankerCount(null);
      } finally {
        if (!cancelled) setPortalListRankerCountLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listId, address, listRankersTick]);

  /**
   * Fetches other rankers’ on-chain claims for this portal
   * list (global leaderboard plus FeeProxy receivers and triple creators here) and
   * scores overlap with your deck. Refetch on Compare, deck edits, leaderboard
   * churn, or `inturank-arena-onchain-updated` (`comparePeersVersion`).
   */
  useEffect(() => {
    if (arenaFlowPhase !== 'compare') return;
    if (!activeList || activeList.source !== 'portal' || !activeList.listObjectTermId) {
      setComparePeers([]);
      setComparePeersLoading(false);
      return;
    }
    if (rankDeckItems.length === 0) {
      setComparePeers([]);
      setComparePeersLoading(false);
      return;
    }

    let cancelled = false;
    const myLower = (address ?? '').toLowerCase();
    const playerByAddr = new Map<string, ArenaPlayerRow>();
    for (const p of players) {
      if (p.address) playerByAddr.set(p.address.toLowerCase(), p);
    }

    const syntheticRow = (wallet: string): ArenaPlayerRow => {
      const hit = playerByAddr.get(wallet.toLowerCase());
      if (hit) return hit;
      let short = wallet;
      try {
        const a = getAddress(wallet as `0x${string}`);
        short = `${a.slice(0, 6)}…${a.slice(-4)}`;
      } catch {
        short = wallet.length >= 10 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
      }
      return {
        rank: 0,
        address: wallet,
        label: short,
        arenaXp: 0,
        activityXp: 0,
        duels: 0,
        atomsRanked: 0,
        listsPlayed: 0,
        updatedAt: 0,
      };
    };

    setComparePeersLoading(true);
    (async () => {
      const lb = players
        .filter((p) => p.address && p.address.toLowerCase() !== myLower)
        .slice(0, 8)
        .map((p) => p.address);

      let fromList: string[] = [];
      try {
        fromList = await fetchDistinctRankingCreatorsForPortalList(
          activeList.listObjectTermId!,
          address,
          20,
        );
      } catch (e) {
        console.warn('[comparePeers] list rankers fetch failed', e);
      }

      let fromDeposits: string[] = [];
      try {
        fromDeposits = await fetchDistinctReceiversForPortalListFromProxyDeposits(
          activeList.listObjectTermId!,
          address,
          26,
        );
      } catch (e) {
        console.warn('[comparePeers] deposit list rankers fetch failed', e);
      }

      const merged: string[] = [];
      const seen = new Set<string>();
      for (const w of [...lb, ...fromDeposits, ...fromList]) {
        const lc = w.toLowerCase();
        if (!lc || lc === myLower || seen.has(lc)) continue;
        seen.add(lc);
        merged.push(w);
        if (merged.length >= 22) break;
      }

      if (merged.length === 0) {
        if (!cancelled) {
          setComparePeers([]);
          setComparePeersLoading(false);
        }
        return;
      }

      const results = await Promise.all(
        merged.map(async (wallet) => {
          try {
            const claims = await fetchUserArenaRankingClaims(wallet);
            const sim = computeArenaListSimilarity(
              rankDeckItems,
              claims,
              activeList.listObjectTermId,
            );
            return { player: syntheticRow(wallet), claims, similarity: sim };
          } catch (e) {
            console.warn('[comparePeers] failed for', wallet, e);
            return { player: syntheticRow(wallet), claims: [] as UserArenaRankingClaim[], similarity: null };
          }
        }),
      );

      if (cancelled) return;
      const peers: ArenaComparePeer[] = results
        .filter((r): r is ArenaComparePeer => r.similarity !== null && r.similarity.sharedCount > 0)
        .sort((a, b) => b.similarity.similarityPct - a.similarity.similarityPct);
      setComparePeers(peers);
      setComparePeersLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [arenaFlowPhase, activeList, rankDeckItems, players, address, comparePeersVersion]);

  const [portalListEntries, setPortalListEntries] = useState<
    Extract<ArenaListEntry, { source: 'portal' }>[]
  >([]);
  /** Hub tile: live member count from indexer (portal lists). */
  const [arenaListConstituentOverrides, setArenaListConstituentOverrides] = useState<Record<string, number>>({});
  /** Hub tile previews for portal lists with empty `previewItemsData` (e.g. Built on Intuition). */
  const [hubPreviewPoolByListId, setHubPreviewPoolByListId] = useState<Record<string, RankItem[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { items } = await getLists(ARENA_PORTAL_LISTS_FETCH_LIMIT, 0, [{ total_position_count: 'desc' }]);
        if (cancelled) return;
        const entries: Extract<ArenaListEntry, { source: 'portal' }>[] = items.map((row: any) => {
          const subs = (row.items || []) as { termId?: string; label?: string; image?: string }[];
          return {
            id: portalListIdFromTermId(row.id),
            source: 'portal' as const,
            listObjectTermId: row.id,
            title: row.label || 'Untitled list',
            description: `Intuition list · ${
              typeof row.totalItems === 'number' ? `${row.totalItems} members indexed` : 'live on the graph'
            }`,
            tag: 'Live',
            arenaCategory: 'network',
            listGlyph: '◆',
            totalItems: row.totalItems ?? 0,
            itemQuestion: (item: RankItem) =>
              `Should “${(item.label || 'this entry').trim()}” stay on “${(row.label || 'this list').trim()}” for you?`,
            previewItemsData: subs.map((s) => ({
              termId: s.termId,
              label: s.label || '…',
              image: s.image,
            })),
          };
        });
        registerPortalListEntries(entries);
        setPortalListEntries(entries);
      } catch {
        if (!cancelled) setPortalListEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const entry of ARENA_LISTS) {
        if (entry.source !== 'portal') continue;
        try {
          const [rows, count] = await Promise.all([
            getListMemberSubjectsForObject(entry.listObjectTermId, 6),
            countListMembersForObject(entry.listObjectTermId),
          ]);
          if (cancelled) return;
          if (typeof count === 'number' && count >= 0) {
            setArenaListConstituentOverrides((prev) => ({ ...prev, [entry.id]: count }));
          }
          if (rows.length > 0) {
            setHubPreviewPoolByListId((prev) => ({
              ...prev,
              [entry.id]: rows.map((r) => ({
                id: r.id,
                kind: 'atom' as const,
                label: r.label,
                subtitle: 'On-chain list',
                image: r.image,
                pairKind: 'list-preview',
              })),
            }));
          }
        } catch {
          /* ignore hub portal hydrate */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const listsForCategory = useMemo(() => {
    const curated = filterArenaListsByCategory(ARENA_LISTS, arenaCategoryId);
    const portalDeduped = portalListEntries.filter((p) => {
      if (p.source !== 'portal') return true;
      const a = p.listObjectTermId.replace(/^0x/i, '').toLowerCase();
      const b = BUILT_ON_INTUITION_PORTAL_LIST_OBJECT_TERM_ID.replace(/^0x/i, '').toLowerCase();
      return a !== b;
    });
    if (arenaCategoryId === 'all') return [...curated, ...portalDeduped];
    if (arenaCategoryId === 'network') {
      return filterArenaListsByCategory(portalDeduped, 'network');
    }
    return curated;
  }, [arenaCategoryId, portalListEntries]);

  const groupedArenaLists = useMemo(() => {
    const order = ['daily', 'network', 'ecosystem', 'identities', 'graph', 'macro'] as const;
    const groups = order
      .map((id) => ({
        id,
        label: ARENA_CATEGORY_PILLS.find((p) => p.id === id)?.label ?? id,
        lists: listsForCategory.filter((l) => l.arenaCategory === id),
      }))
      .filter((g) => g.lists.length > 0);
    return groups;
  }, [listsForCategory]);

  const favoriteSet = useMemo(() => new Set(favoriteListIds), [favoriteListIds]);

  const toggleListFavorite = useCallback((fid: string) => {
    const k = fid.trim();
    if (!k || !getArenaListById(k)) return;
    playArenaUiClick();
    setFavoriteListIds((prev) => {
      const i = prev.findIndex((x) => x === k);
      const next = i >= 0 ? prev.filter((_, j) => j !== i) : [...prev, k];
      saveArenaFavoriteListIds(next);
      const addrLc = address?.trim().toLowerCase();
      queueMicrotask(() => {
        if (addrLc?.startsWith('0x')) pushArenaFavoriteListIdsRemote(addrLc, next);
        if (i < 0) setStarredRailCollapsed(false);
      });
      return next;
    });
  }, [address]);

  const allArenaListsFlat = useMemo(() => dedupeArenaEntries([...ARENA_LISTS, ...portalListEntries]), [portalListEntries]);

  const contestHubSections = useMemo(() => buildContestHubSections(allArenaListsFlat), [allArenaListsFlat]);

  const resumeBrowseTitle = useMemo(() => {
    try {
      const id = sessionStorage.getItem('inturank-arena-last-list')?.trim();
      const entry = id ? getArenaListById(id) : null;
      return entry?.title ?? null;
    } catch {
      return null;
    }
  }, [listId]);

  /** Quick-switch + dropdown: favorites first, then alphabetical. */
  const quickSwitchSortedLists = useMemo(() => {
    return [...allArenaListsFlat].sort((a, b) => {
      const fa = favoriteSet.has(a.id);
      const fb = favoriteSet.has(b.id);
      if (fa !== fb) return fa ? -1 : 1;
      return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
    });
  }, [allArenaListsFlat, favoriteSet]);

  const favoriteListsInLane = useMemo(
    () =>
      [...listsForCategory]
        .filter((l) => favoriteSet.has(l.id))
        .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })),
    [listsForCategory, favoriteSet],
  );

  const starredRailRows = useMemo(
    () =>
      favoriteListsInLane.map((L) => ({
        id: L.id,
        title: L.title,
        tag: L.tag,
        listGlyph: L.listGlyph,
      })),
    [favoriteListsInLane],
  );

  const arenaLaneLabelShort = ARENA_CATEGORY_PILLS.find((p) => p.id === arenaCategoryId)?.label ?? 'lane';

  const quickPickFavoriteRows = useMemo(
    () => quickSwitchSortedLists.filter((l) => favoriteSet.has(l.id)),
    [quickSwitchSortedLists, favoriteSet]
  );
  const quickPickOtherRows = useMemo(
    () => quickSwitchSortedLists.filter((l) => !favoriteSet.has(l.id)),
    [quickSwitchSortedLists, favoriteSet]
  );

  useEffect(() => {
    setShowAllLists(false);
  }, [arenaCategoryId]);

  const stanceSummary = useMemo(() => {
    let yes = 0;
    let no = 0;
    for (const it of pool) {
      const r = scores[it.id] ?? SCORE_START;
      if (r > SCORE_START) yes += 1;
      else if (r < SCORE_START) no += 1;
    }
    return { yes, no, total: pool.length };
  }, [pool, scores]);

  useEffect(() => {
    if (!listId) {
      setPendingRows([]);
      return;
    }
    setPendingRows(loadPendingForList(listId));
  }, [listId]);

  useEffect(() => {
    if (searchParams.get('openBatch') !== '1') {
      openBatchParamHandled.current = false;
      return;
    }
    if (openBatchParamHandled.current) return;
    openBatchParamHandled.current = true;
    const lid = searchParams.get('listId') || getFirstListIdWithPending();
    if (lid && getArenaListById(lid)) {
      navigate(`/climb?list=${encodeURIComponent(lid)}`, { replace: true });
      try {
        sessionStorage.setItem('inturank-arena-last-list', lid);
      } catch {
        /* ignore */
      }
      setListId(lid);
      setOpenBatchAfterLoad(true);
    } else {
      navigate('/climb', { replace: true });
    }
  }, [searchParams, navigate]);

  /** Sync list selection with `?list=` so browser Back returns to browse mode on /climb instead of leaving the Arena. */
  useEffect(() => {
    if (searchParams.get('openBatch') === '1') return;
    const lid = (searchParams.get('list') || searchParams.get('listId'))?.trim();
    const valid = lid && getArenaListById(lid) ? lid : null;

    if (valid) {
      urlSyncSkipInitialClearRef.current = false;
      setListId(valid);
      try {
        sessionStorage.setItem('inturank-arena-last-list', valid);
      } catch {
        /* ignore */
      }
      return;
    }

    if (urlSyncSkipInitialClearRef.current) {
      urlSyncSkipInitialClearRef.current = false;
      return;
    }

    setListId(null);
  }, [searchParams]);

  useEffect(() => {
    if (!ARENA_CONTEST_FLOW_V2) return;
    if (!listId) {
      prevListIdForFlowRef.current = null;
      setArenaFlowPhase('hub');
      curateInitForListRef.current = null;
      setCurateQueue([]);
      setRankDeckItems([]);
      setRankTrustUnits({});
      setDeckEngagementTuneCount(0);
      return;
    }
    const prev = prevListIdForFlowRef.current;
    if (prev !== listId) {
      if (prev != null) {
        clearPersistedContestFlow(prev);
        setArenaFlowPhase('curate');
        curateInitForListRef.current = null;
        setRankDeckItems([]);
        setRankTrustUnits({});
        setDeckEngagementTuneCount(0);
      } else if (listId) {
        const persisted = readPersistedContestFlow(listId);
        if (persisted) {
          setArenaFlowPhase(persisted.phase);
          if (persisted.phase === 'curate') {
            curateInitForListRef.current = null;
            setRankDeckItems([]);
            setRankTrustUnits({});
            setDeckEngagementTuneCount(0);
          }
        } else {
          setArenaFlowPhase('curate');
          curateInitForListRef.current = null;
          setRankDeckItems([]);
          setRankTrustUnits({});
          setDeckEngagementTuneCount(0);
        }
      }
      prevListIdForFlowRef.current = listId;
    }
  }, [listId]);

  useEffect(() => {
    if (!listId) {
      arenaFloorStingerPlayedForListRef.current = null;
    }
    setPendingArenaClear(null);
  }, [listId]);

  /** Floor stinger when landing in a contest via URL (hub path calls `startListRun` which primes audio). */
  useEffect(() => {
    if (!ARENA_CONTEST_FLOW_V2 || climbViewMode !== 'arena') return;
    if (!listId || loading || pool.length < 1) return;
    if (arenaFloorStingerPlayedForListRef.current === listId) return;
    arenaFloorStingerPlayedForListRef.current = listId;
    resumeArenaAudio();
    playArenaFloorEnter();
  }, [listId, loading, pool.length, climbViewMode]);

  /** Retro arcade BGM while RankedList (Arena / Signal / Explorer) is mounted. */
  useEffect(() => {
    syncArenaAmbientForClimb(true);
    return () => {
      syncArenaAmbientForClimb(false);
    };
  }, []);

  /** After hard refresh during rank/compare: restore deck once pool loads. */
  useEffect(() => {
    if (!ARENA_CONTEST_FLOW_V2 || !listId || loading || pool.length < 1) return;
    if (arenaFlowPhase !== 'rank' && arenaFlowPhase !== 'compare') return;
    if (rankDeckItems.length > 0) return;

    const persisted = readPersistedContestFlow(listId);
    if (!persisted || (persisted.phase !== 'rank' && persisted.phase !== 'compare')) return;

    const rebuilt = persisted.rankOrderIds
      .map((id) => pool.find((x) => x.id === id))
      .filter(Boolean) as RankItem[];
    if (rebuilt.length < 1) {
      clearPersistedContestFlow(listId);
      setArenaFlowPhase('curate');
      curateInitForListRef.current = null;
      return;
    }
    const units = persisted.rankTrustUnits && typeof persisted.rankTrustUnits === 'object' ? persisted.rankTrustUnits : {};
    const base = parseStakeBaseLabel(stakeTRUST);
    const sortedDeck = sortRankItemsByEffectiveStake(rebuilt, units, base);
    setRankDeckItems(sortedDeck);
    setRankTrustUnits(units);
  }, [listId, loading, pool, arenaFlowPhase, rankDeckItems.length, stakeTRUST]);

  useEffect(() => {
    if (!ARENA_CONTEST_FLOW_V2 || !listId) return;
    if (arenaFlowPhase === 'hub') return;
    if ((arenaFlowPhase === 'rank' || arenaFlowPhase === 'compare') && rankDeckItems.length < 1) return;

    writePersistedContestFlow(listId, {
      phase: arenaFlowPhase === 'compare' ? 'compare' : arenaFlowPhase === 'rank' ? 'rank' : 'curate',
      rankOrderIds: rankDeckItems.map((x) => x.id),
      rankTrustUnits,
    });
  }, [listId, arenaFlowPhase, rankDeckItems, rankTrustUnits]);

  useEffect(() => {
    if (!ARENA_CONTEST_FLOW_V2) return;
    if (arenaFlowPhase !== 'curate' || !listId || loading || pool.length < 1) return;
    if (curateInitForListRef.current === listId) return;
    curateInitForListRef.current = listId;
    setCurateQueue([...pool]);
  }, [arenaFlowPhase, listId, loading, pool]);

  /** Nudge when returning from graph bookmark (`?ref=graph`). */
  useEffect(() => {
    if (searchParams.get('ref') !== 'graph' || graphReturnNudgeDone.current) return;
    graphReturnNudgeDone.current = true;
    toast.info('Crowd stakes on this list may have moved. Worth another pass when you’re ready.');
  }, [searchParams]);

  useEffect(() => {
    if (!listId || loading) return;
    setOpenBatchAfterLoad(false);
    if (getTotalPendingCount() > 0) {
      setBatchModalOpen(true);
    }
  }, [openBatchAfterLoad, listId, loading]);

  useEffect(() => {
    if (!listId) return;
    savePendingForList(listId, pendingRows);
  }, [listId, pendingRows]);

  useEffect(() => {
    const onFabToggle = () => {
      if (!ARENA_BATCH_MODE) return;
      if (!listId) {
        const lid = getFirstListIdWithPending();
        if (lid && getArenaListById(lid)) {
          navigate(`/climb?list=${encodeURIComponent(lid)}`, { replace: true });
          setListId(lid);
          setOpenBatchAfterLoad(true);
        }
        return;
      }
      if (getTotalPendingCount() < 1) return;
      setBatchModalOpen((v) => !v);
    };
    window.addEventListener('arena-batch-fab-toggle', onFabToggle as EventListener);
    return () => window.removeEventListener('arena-batch-fab-toggle', onFabToggle as EventListener);
  }, [listId, navigate]);

  const initScoresForPool = useCallback(
    (items: RankItem[]) => {
      if (!listId) return {};
      const persisted = loadPersistedForList(listId);
      const next: Record<string, number> = {};
      for (const it of items) {
        next[it.id] = persisted?.[it.id] ?? SCORE_START;
      }
      return next;
    },
    [listId]
  );

  const refreshPool = useCallback(async () => {
    if (!listId) return;
    const entry = getArenaListById(listId);
    if (!entry) return;
    setLoading(true);
    setRound(null);
    try {
      const items = await loadArenaListPool(entry);
      const roundItems = pickYesNoGridItems(items, ARENA_CARDS_PER_ROUND);
      const nextRound =
        ARENA_CONTEST_FLOW_V2
          ? null
          : roundItems.length > 0
            ? ({ kind: 'yesno' as const, items: roundItems } satisfies ArenaRound)
            : null;
      setPool(items);
      setScores(initScoresForPool(items));
      setDuels(0);
      setStreak(0);
      setRound(nextRound);
      if (items.length < 1) {
        toast.error('Not enough items in this list. Try another list.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Could not load Arena pool');
      setPool([]);
      setRound(null);
    } finally {
      setLoading(false);
    }
  }, [listId, initScoresForPool]);

  useEffect(() => {
    if (!listId) {
      setPool([]);
      setRound(null);
      setLoading(false);
      return;
    }
    void refreshPool();
    // refreshPool is listId-scoped via closure; we only re-run when listId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  useEffect(() => {
    if (ARENA_CONTEST_FLOW_V2) return;
    if (!listId) return;
    if (loading || round) return;
    if (pool.length < 1) return;
    const items = pickYesNoGridItems(pool, ARENA_CARDS_PER_ROUND);
    if (items.length > 0) {
      setRound({ kind: 'yesno', items });
    }
  }, [pool, loading, round, listId]);

  /** Items moved off the baseline; after reset the list is empty until you stance again. */
  const ranking = useMemo(() => {
    return [...pool]
      .map((it) => ({ it, r: scores[it.id] ?? SCORE_START }))
      .filter((x) => x.r !== SCORE_START)
      .sort((a, b) => b.r - a.r)
      .map((x, i) => ({ ...x, place: i + 1 }));
  }, [pool, scores]);

  /** True when Curate has stances, Rank has a deck, or this list has queued batch rows. */
  const hasClearableContestPicks = useMemo(() => {
    if (!listId || !ARENA_CONTEST_FLOW_V2) return false;
    if (arenaFlowPhase === 'hub') return false;
    if (rankDeckItems.length > 0) return true;
    if (ranking.length > 0) return true;
    if (ARENA_BATCH_MODE && pendingRows.length > 0) return true;
    return false;
  }, [listId, arenaFlowPhase, rankDeckItems.length, ranking.length, pendingRows.length]);

  const applyLocalYesNo = useCallback(
    (item: RankItem, support: boolean) => {
      const delta = support ? YESNO_SCORE_YES : YESNO_SCORE_NO;
      setScores((prev) => {
        const R = prev[item.id] ?? SCORE_START;
        const next = { ...prev, [item.id]: R + delta };
        if (listId) savePersistedForList(listId, next);
        return next;
      });
      setDuels((d) => d + 1);
      setStreak((s) => s + 1);

      setRound((prev) => {
        if (ARENA_CONTEST_FLOW_V2) return prev;
        if (!prev) return prev;
        const newItems = refillLanesAfterAnswer(pool, prev.items, item);
        if (!newItems) return null;
        return { kind: 'yesno', items: newItems };
      });
    },
    [listId, pool]
  );

  const submitArenaBatch = useCallback(async () => {
    const rowsToSend = loadAllPendingRowsLive(listId, pendingRows);
    if (rowsToSend.length === 0) return;
    if (!isConnected || !address) {
      toast.error('Connect your wallet to submit your batch.');
      return;
    }
    let baseWei: bigint;
    try {
      baseWei = parseEther((stakeTRUST || '0').trim() || '0');
    } catch {
      toast.error('Invalid stake amount');
      return;
    }
    for (const row of rowsToSend) {
      const rowWei = baseWei * BigInt(row.units);
      if (rowWei < CURVE_OFFSET) {
        toast.error(
          `Intuition requires ≥ ${PROTOCOL_MIN_CLAIM_DEPOSIT_LABEL} TRUST per on-chain claim. ` +
            `Each row deposit is stake × units; one row totals ${formatEther(rowWei)} TRUST (${stakeTRUST}×${row.units}). ` +
            `Raise the stake preset or bump units until every line reaches at least ${PROTOCOL_MIN_CLAIM_DEPOSIT_LABEL}.`
        );
        return;
      }
    }
    const allSubjectsResolvable = rowsToSend.every(
      (row) => TERM_ID_RE.test(row.item.id) || !!row.item.label?.trim()
    );
    if (!allSubjectsResolvable) {
      toast.error('Some rows are missing valid term ids/labels for claim creation.');
      return;
    }

    setStakingTx(true);
    setSubmitProgress('Reviewing batch…');
    let sent = false;
    const totalWei = rowsToSend.reduce((acc, row) => acc + baseWei * BigInt(row.units), 0n);
    /** Captured per-row tx hashes so we can record curations + streak with the real txHash after success. */
    const txByRowKey = new Map<string, string>();
    /** Per-row activity XP grant for curation modal / ledger (batch tx shares one hash across rows). */
    const xpdnByRowKey = new Map<string, number>();
    /** Activity XP (XPDN) for this batch from `notifyProtocolXpEarned`. */
    let activityXpDelta = 0;
    const xpdnGrantsPerTx: number[] = [];
    try {
      setSubmitProgress('Switching to Intuition if needed…');
      await switchNetwork();
      const awardArenaStakeXp = (txHash: string, depositWei: bigint, rowKey: string) => {
        const granted = notifyProtocolXpEarned({
          address: address!,
          reasonKey: 'add_to_list',
          txHash,
          depositTrustWei: depositWei,
          grossMultiplier: PROTOCOL_XP_ARENA_RANK_ADD_TO_LIST_MULT,
          dedupeKey: `arena:${txHash}:${rowKey}`,
        });
        if (typeof granted === 'number' && granted > 0) {
          activityXpDelta += granted;
          xpdnGrantsPerTx.push(granted);
          xpdnByRowKey.set(rowKey, granted);
        }
      };

      const byList = new Map<string, typeof rowsToSend>();
      for (const row of rowsToSend) {
        const lid = row.sourceListId;
        if (!byList.has(lid)) byList.set(lid, []);
        byList.get(lid)!.push(row);
      }

      type PortalBatchJob = {
        portalListObjectId: string;
        listRows: typeof rowsToSend;
        listEntry: NonNullable<ReturnType<typeof getArenaListById>>;
      };

      const portalJobs: PortalBatchJob[] = [];
      const legacyJobs: Array<{ listRows: typeof rowsToSend; listEntry: ReturnType<typeof getArenaListById> }> =
        [];

      for (const [, lr] of byList) {
        const listEntry = getArenaListById(lr[0]!.sourceListId);
        const portalListObjectId =
          listEntry?.source === 'portal' && TERM_ID_RE.test(listEntry.listObjectTermId)
            ? listEntry.listObjectTermId
            : null;

        if (portalListObjectId && lr.every((row) => TERM_ID_RE.test(row.item.id))) {
          if (!listEntry) continue;
          portalJobs.push({ portalListObjectId, listRows: lr, listEntry });
        } else {
          legacyJobs.push({ listRows: lr, listEntry });
        }
      }

      if (portalJobs.length > 0 || legacyJobs.length > 0) {
        const checksumReceiver = getAddress(address);
        // Cache-first: skip the on-chain read if we recorded a successful approval before.
        let proxyOk = hasCachedProxyApproval(checksumReceiver);
        if (!proxyOk) {
          setSubmitProgress('Checking proxy approval…');
          proxyOk = await getProxyApprovalStatus(checksumReceiver);
        }
        if (!proxyOk) {
          setSubmitProgress('Approving IntuRank proxy…');
          await grantProxyApproval(checksumReceiver);
        }
      }

      const progressCb = (m: string) => setSubmitProgress(m);

      const mergedDepositLegs: { termId: string; assetsWei: bigint }[] = [];
      const depositXpRows: Array<{ rowKey: string; rowWei: bigint }> = [];

      type LegacyRowSpec = {
        row: (typeof rowsToSend)[0];
        rowTrust: string;
        subjectRef: string;
        predicateRef: string;
        objectRef: string;
        rowWei: bigint;
      };
      const legacyRowSpecs: LegacyRowSpec[] = [];
      type AttestSpec = {
        subjectRef: string;
        predicateRef: string;
        objectRef: string;
        rowTrust: string;
        rowWei: bigint;
      };
      const attestSpecs: AttestSpec[] = [];

      for (const { portalListObjectId, listRows, listEntry } of portalJobs) {
        const checkBothCurves = async (account: string, termId: string): Promise<bigint> => {
          const [a, b] = await Promise.all([
            getRawShareBalance(account, termId, LINEAR_CURVE_ID),
            getRawShareBalance(account, termId, OFFSET_PROGRESSIVE_CURVE_ID),
          ]);
          return a > b ? a : b;
        };

        setSubmitProgress(
          listRows.length > 1 ? `Resolving ${listRows.length} vaults…` : 'Resolving vault…',
        );
        const resolved = await Promise.all(
          listRows.map(async (row) => {
            const rowWei = baseWei * BigInt(row.units);
            const membershipVault = await getListMembershipTripleTermId(row.item.id, portalListObjectId);
            if (!membershipVault) return { row, rowWei, membershipVault: null, counterShares: 0n };
            const yesVault = membershipVault;
            const noVault = calculateCounterTripleId(yesVault);
            const oppositeVault = row.support ? noVault : yesVault;
            const counterShares = await checkBothCurves(address, oppositeVault);
            return { row, rowWei, membershipVault, counterShares };
          }),
        );

        for (const r of resolved) {
          if (!r.membershipVault) {
            throw new Error(
              `Could not resolve list-membership vault for "${r.row.item.label}". ` +
                `If this identity is new on-chain, wait for the indexer to sync or pick another member.`,
            );
          }
          if (r.counterShares > 0n) {
            const sideWord = r.row.support ? 'NO' : 'YES';
            const newSideWord = r.row.support ? 'YES' : 'NO';
            throw new Error(
              `STANCE_CONFLICT for "${r.row.item.label}": you already hold a ${sideWord} position on this claim. ` +
                `Withdraw it from your portfolio before voting ${newSideWord} (protocol blocks counter-stakes on the same triple).`,
            );
          }
        }

        for (const r of resolved) {
          const yesVault = r.membershipVault!;
          const noVault = calculateCounterTripleId(yesVault);
          const targetVault = r.row.support ? yesVault : noVault;
          mergedDepositLegs.push({ termId: targetVault, assetsWei: r.rowWei });
          depositXpRows.push({ rowKey: r.row.key, rowWei: r.rowWei });
        }

        if (ARENA_PERSONAL_ATTESTATION_TRIPLES && listEntry?.title) {
          const listTitle = listEntry.title;
          const arenaSpeakerLabel = await bestWalletDisplayLabel(address);
          for (const row of listRows) {
            const rowTrust = formatEther(baseWei * BigInt(row.units));
            const sideWord = row.support ? 'YES' : 'NO';
            const stance = `${arenaSpeakerLabel} chose ${sideWord} for “${row.item.label}” in list “${listTitle}” (${rowTrust} TRUST)`;
            attestSpecs.push({
              subjectRef: address,
              predicateRef: stance,
              objectRef: row.item.id,
              rowTrust,
              rowWei: parseEther(rowTrust),
            });
          }
        }
      }

      for (const { listRows, listEntry } of legacyJobs) {
        const listLabel = listEntry?.title || 'Arena list';
        for (const row of listRows) {
          const rowTrust = formatEther(baseWei * BigInt(row.units));
          const subjectRef = TERM_ID_RE.test(row.item.id) ? row.item.id : (row.item.label || row.item.id);
          const predicateRef = row.support ? `belongs in ${listLabel}` : `does not belong in ${listLabel}`;
          const objectRef = listLabel;
          legacyRowSpecs.push({
            row,
            rowTrust,
            subjectRef,
            predicateRef,
            objectRef,
            rowWei: parseEther(rowTrust),
          });
        }
      }

      const atomJobs: { ref: string; depositTrust: string }[] = [];
      for (const spec of legacyRowSpecs) {
        atomJobs.push({ ref: spec.subjectRef, depositTrust: spec.rowTrust });
        atomJobs.push({ ref: spec.predicateRef, depositTrust: spec.rowTrust });
        atomJobs.push({ ref: spec.objectRef, depositTrust: spec.rowTrust });
      }
      for (const a of attestSpecs) {
        atomJobs.push({ ref: a.subjectRef, depositTrust: a.rowTrust });
        atomJobs.push({ ref: a.predicateRef, depositTrust: a.rowTrust });
        atomJobs.push({ ref: a.objectRef, depositTrust: a.rowTrust });
      }

      if (atomJobs.length > 0) {
        const nUnique = new Set(atomJobs.map((j) => atomRefJobKey(j.ref, j.depositTrust))).size;
        setSubmitProgress(`Preparing ${nUnique} unique identity reference(s) for batch submit…`);
      }
      const { termMap } = await batchEnsureAtomTermIds(atomJobs, address, progressCb);

      const pickTerm = (ref: string, dep: string): `0x${string}` => {
        const tid = termMap.get(atomRefJobKey(ref, dep));
        if (!tid) throw new Error(`Could not resolve identity for “${String(ref).slice(0, 48)}…”.`);
        return tid;
      };

      type ResolvedTripleLeg = {
        sTerm: `0x${string}`;
        pTerm: `0x${string}`;
        oTerm: `0x${string}`;
        tripleId: string;
        exists: boolean;
        rowWei: bigint;
        rowKey?: string;
        isLegacy: boolean;
      };

      const resolvedTriples: ResolvedTripleLeg[] = [];

      for (const spec of legacyRowSpecs) {
        const sTerm = pickTerm(spec.subjectRef, spec.rowTrust);
        const pTerm = pickTerm(spec.predicateRef, spec.rowTrust);
        const oTerm = pickTerm(spec.objectRef, spec.rowTrust);
        const tripleId = calculateTripleId(sTerm, pTerm, oTerm);
        const exists = await isTermCreatedOnChain(tripleId);
        resolvedTriples.push({
          sTerm,
          pTerm,
          oTerm,
          tripleId,
          exists,
          rowWei: spec.rowWei,
          rowKey: spec.row.key,
          isLegacy: true,
        });
      }

      for (const a of attestSpecs) {
        const sTerm = pickTerm(a.subjectRef, a.rowTrust);
        const pTerm = pickTerm(a.predicateRef, a.rowTrust);
        const oTerm = pickTerm(a.objectRef, a.rowTrust);
        const tripleId = calculateTripleId(sTerm, pTerm, oTerm);
        const exists = await isTermCreatedOnChain(tripleId);
        resolvedTriples.push({
          sTerm,
          pTerm,
          oTerm,
          tripleId,
          exists,
          rowWei: a.rowWei,
          isLegacy: false,
        });
      }

      const tripleCreateInputs: {
        subjectId: string;
        predicateId: string;
        objectId: string;
        assetsWei: bigint;
      }[] = [];
      const tripleCreateLegacyRows: Array<{ rowKey: string; rowWei: bigint }> = [];

      for (const r of resolvedTriples) {
        if (r.exists) continue;
        tripleCreateInputs.push({
          subjectId: r.sTerm,
          predicateId: r.pTerm,
          objectId: r.oTerm,
          assetsWei: r.rowWei,
        });
        if (r.isLegacy && r.rowKey) tripleCreateLegacyRows.push({ rowKey: r.rowKey, rowWei: r.rowWei });
      }

      if (tripleCreateInputs.length > 0) {
        setSubmitProgress(
          tripleCreateInputs.length > 1
            ? `Confirm in wallet · create ${tripleCreateInputs.length} claims (one transaction)`
            : 'Confirm in wallet · create claim',
        );
        const createHash = await createSemanticTriplesBatch(tripleCreateInputs, address, progressCb);
        for (const x of tripleCreateLegacyRows) {
          awardArenaStakeXp(createHash, x.rowWei, x.rowKey);
          txByRowKey.set(x.rowKey, createHash);
        }
      }

      for (const r of resolvedTriples) {
        if (!r.exists) continue;
        mergedDepositLegs.push({ termId: r.tripleId, assetsWei: r.rowWei });
        if (r.isLegacy && r.rowKey) depositXpRows.push({ rowKey: r.rowKey, rowWei: r.rowWei });
      }

      if (mergedDepositLegs.length > 0) {
        setSubmitProgress(
          mergedDepositLegs.length > 1
            ? `Confirm in wallet · ${mergedDepositLegs.length} vault deposits (one transaction)`
            : 'Confirm in wallet · vault deposit',
        );
        const { hash: depHash } = await depositBatchToVaults(mergedDepositLegs, address, progressCb);
        for (const x of depositXpRows) {
          awardArenaStakeXp(depHash, x.rowWei, x.rowKey);
          txByRowKey.set(x.rowKey, depHash);
        }
      }
      sent = true;
    } catch (e: unknown) {
      console.error('[Arena batch submit]', e);
      let msg = collapseAdjacentDuplicateSentences(parseProtocolError(e));
      if (!msg?.trim()) msg = collapseAdjacentDuplicateSentences(String((e as { shortMessage?: string })?.shortMessage ?? ''));
      if (!msg?.trim()) msg = e instanceof Error ? e.message : 'Transaction failed';
      msg = collapseAdjacentDuplicateSentences(msg);
      if (isUserRejectedWalletError(e)) {
        toast.info('Signing was cancelled. Your queued picks are unchanged.');
      } else {
        toast.error(msg.length > 420 ? `${msg.slice(0, 417)}…` : msg);
      }
    } finally {
      setStakingTx(false);
      setSubmitProgress(null);
    }
    if (!sent) return;

    if (address) {
      recordArenaRankingPicks(address, rowsToSend.length);
      recordArenaStreakPicks(address, rowsToSend.length);
      // Snapshot every confirmed pick into the wallet's curation ledger so the Portfolio renders instantly.
      try {
        const curationPicks = rowsToSend.map((row) => {
          const entry = getArenaListById(row.sourceListId);
          const trustLabel = formatEther(baseWei * BigInt(row.units));
          const txHash = txByRowKey.get(row.key);
          const xpdn = typeof row.key === 'string' ? xpdnByRowKey.get(row.key) : undefined;
          return {
            listId: row.sourceListId,
            listTitle: entry?.title ?? 'Arena list',
            itemId: row.item.id,
            itemLabel: row.item.label,
            ...(row.item.image ? { itemImage: row.item.image } : {}),
            support: row.support,
            trustLabel,
            arenaXpPick: ARENA_XP_PER_RANK_PICK,
            ...(typeof xpdn === 'number' && xpdn > 0 ? { xpdnAward: xpdn } : {}),
            ...(txHash ? { txHash } : {}),
          };
        });
        recordArenaCurationPicks(address, curationPicks);
      } catch (err) {
        console.warn('[Arena] failed to record curation picks locally', err);
      }
      setPickCreditTick((n) => n + 1);
    }

    const successListIds = [...new Set(rowsToSend.map((r) => r.sourceListId))];
    let successThemeShort = 'Arena';
    let successContextSuffix = 'live';
    if (successListIds.length === 1) {
      const e = getArenaListById(successListIds[0]!);
      successContextSuffix = e?.tag ?? 'list';
      successThemeShort = e?.title ?? 'Arena';
    } else if (successListIds.length > 1) {
      successContextSuffix = `${successListIds.length} lists`;
      successThemeShort = 'All queued picks';
    }

    if (address) {
      let humanLine: string | undefined;
      try {
        const who = await bestWalletDisplayLabel(address);
        const rowSummaries = rowsToSend.map((r) => {
          const lt = getArenaListById(r.sourceListId)?.title ?? 'list';
          const side = r.support ? 'YES' : 'NO';
          return `${side} for “${r.item.label}” in “${lt}”`;
        });
        humanLine = `${who}: ${rowSummaries.join(' · ')}`;
      } catch {
        /* ignore */
      }
      try {
        playArenaCelebrateMini();
      } catch {
        /* ignore */
      }
      /** Arena XP: fixed pick credit per queued row (matches `arenaPickCreditXp` / indexer attribution). */
      const arenaXpDelta = rowsToSend.length * ARENA_XP_PER_RANK_PICK;
      setArenaBatchSuccess({
        itemCount: rowsToSend.length,
        trustLabel: formatEther(totalWei),
        themeShort: successThemeShort,
        contextSuffix: successContextSuffix,
        ...(humanLine ? { humanLine } : {}),
        ...(activityXpDelta > 0 ? { activityXpEarned: activityXpDelta } : {}),
        ...(arenaXpDelta > 0 ? { arenaXpEarned: arenaXpDelta } : {}),
        ...(xpdnGrantsPerTx.length > 0 ? { xpdnByTx: xpdnGrantsPerTx } : {}),
      });
      void refreshPlayers({ silent: true });
      void refreshArenaXpSelf();
      try {
        window.dispatchEvent(new Event('inturank-arena-onchain-updated'));
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        void fetchArenaXpRecordForWallet(address).then((rec) => {
          setGraphArenaXp(rec.xp);
          postArenaTotalsMirrorOptional(address, rec);
        });
      }, 2800);
    } else {
      toast.success('Claims written on Intuition.');
    }

    clearPendingStorage();
    setPendingRows([]);
    setBatchModalOpen(false);
  }, [pendingRows, listId, isConnected, address, stakeTRUST, refreshPlayers, refreshArenaXpSelf]);

  const updatePendingUnits = useCallback((sourceListId: string, key: string, units: number) => {
    const rows = loadPendingForList(sourceListId);
    const next = rows.map((r) => (r.key === key ? { ...r, units } : r));
    savePendingForList(sourceListId, next);
    if (sourceListId === listId) setPendingRows(next);
  }, [listId]);

  const togglePendingSupport = useCallback(
    (sourceListId: string, key: string) => {
      const rows = loadPendingForList(sourceListId);
      const row = rows.find((r) => r.key === key);
      if (!row) return;
      const was = row.support;
      const flipDelta =
        (was ? -YESNO_SCORE_YES : -YESNO_SCORE_NO) + (!was ? YESNO_SCORE_YES : YESNO_SCORE_NO);
      patchArenaPersistedScore(sourceListId, row.item.id, flipDelta);
      if (sourceListId === listId) {
        setScores((p) => {
          const R = p[row.item.id] ?? SCORE_START;
          return { ...p, [row.item.id]: R + flipDelta };
        });
      }
      const nextRows = rows.map((r) => (r.key === key ? { ...r, support: !r.support } : r));
      savePendingForList(sourceListId, nextRows);
      if (sourceListId === listId) setPendingRows(nextRows);
    },
    [listId]
  );

  const removePendingRow = useCallback(
    (sourceListId: string, key: string) => {
      const rows = loadPendingForList(sourceListId);
      const row = rows.find((r) => r.key === key);
      if (!row) return;
      const back = row.support ? -YESNO_SCORE_YES : -YESNO_SCORE_NO;
      patchArenaPersistedScore(sourceListId, row.item.id, back);
      if (sourceListId === listId) {
        setScores((p) => {
          const R = p[row.item.id] ?? SCORE_START;
          return { ...p, [row.item.id]: R + back };
        });
        setDuels((d) => Math.max(0, d - 1));
        setStreak(0);
      }
      const nextRows = rows.filter((r) => r.key !== key);
      savePendingForList(sourceListId, nextRows);
      if (sourceListId === listId) setPendingRows(nextRows);
    },
    [listId]
  );

  const clearAllArenaBatch = useCallback(() => {
    const rows = loadAllPendingRowsLive(listId, pendingRows);
    if (rows.length === 0) {
      setBatchModalOpen(false);
      return;
    }
    for (const row of rows) {
      const back = row.support ? -YESNO_SCORE_YES : -YESNO_SCORE_NO;
      patchArenaPersistedScore(row.sourceListId, row.item.id, back);
    }
    clearPendingStorage();
    setPendingRows([]);
    const nCurrentList = listId ? rows.filter((r) => r.sourceListId === listId).length : 0;
    setDuels((d) => Math.max(0, d - nCurrentList));
    setStreak(0);
    if (listId && pool.length > 0) {
      const persisted = loadPersistedForList(listId);
      setScores((prev) => {
        const next = { ...prev };
        for (const it of pool) {
          next[it.id] = persisted?.[it.id] ?? SCORE_START;
        }
        return next;
      });
    }

    if (ARENA_CONTEST_FLOW_V2 && listId) {
      setRankDeckItems([]);
      setRankTrustUnits({});
      setDeckEngagementTuneCount(0);
      guestCurateNudgeRef.current = false;
      curateInitForListRef.current = null;
      if (pool.length > 0) setCurateQueue([...pool]);
      setArenaFlowPhase('curate');
      clearPersistedContestFlow(listId);
    }
    setCommitPhase((c) => (c === 'rank-batch' ? 'idle' : c));
    setBatchModalOpen(false);
    setPendingArenaClear(null);
    toast.success('Conviction cart cleared.');
  }, [listId, pendingRows, pool]);

  /** Clears this contest only; other lists’ carts stay as-is. */
  const clearContestPicksForCurrentList = useCallback(() => {
    playArenaUiClick();
    if (!listId) return;

    if (ARENA_BATCH_MODE) {
      const rows = loadPendingForList(listId);
      for (const row of rows) {
        const back = row.support ? -YESNO_SCORE_YES : -YESNO_SCORE_NO;
        patchArenaPersistedScore(listId, row.item.id, back);
      }
      clearPendingForList(listId);
      setPendingRows([]);
    }

    const next: Record<string, number> = {};
    for (const it of pool) next[it.id] = SCORE_START;
    wipePersistedArenaScoresForList(listId);
    setScores(next);
    savePersistedForList(listId, next);

    setDuels(0);
    setStreak(0);
    setRound(null);
    setRankDeckItems([]);
    setRankTrustUnits({});
    setDeckEngagementTuneCount(0);
    guestCurateNudgeRef.current = false;
    curateInitForListRef.current = null;
    if (pool.length > 0) setCurateQueue([...pool]);
    if (ARENA_CONTEST_FLOW_V2) {
      setArenaFlowPhase('curate');
      clearPersistedContestFlow(listId);
    }
    setBatchModalOpen(false);
    setPendingArenaClear(null);
    setCommitPhase('idle');
    toast.success('Picks cleared. Start again from Curate.');
  }, [listId, pool]);

  const resolveYesNo = useCallback(
    async (item: RankItem, support: boolean): Promise<boolean> => {
      if (support) playArenaCelebrateMini();
      else playArenaUiClick();

      if (!isConnected || !address) {
        toast.error('Connect your wallet to pick.');
        return false;
      }

      if (ARENA_BATCH_MODE) {
        applyLocalYesNo(item, support);
        if (!ARENA_CONTEST_FLOW_V2 || support) {
          setPendingRows((prev) => [
            ...prev,
            {
              key: `q-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              item: rankItemToPendingSnapshot(item),
              support,
              units: 1,
            },
          ]);
        }
        return true;
      }

      let stakeOk = true;
      let wei = 0n;
      try {
        wei = parseEther((stakeTRUST || '0').trim() || '0');
      } catch {
        toast.error('Invalid stake amount');
        return false;
      }

      if (!treasury) {
        toast.error('Arena payouts aren’t enabled in this deployment (treasury not configured).');
        return false;
      }

      setStakingTx(true);
      try {
        await sendNativeTransfer(address, treasury, wei);
        toast.success('TRUST sent with this stance.');
      } catch (e: any) {
        const msg = e?.shortMessage ?? e?.message ?? 'Transaction failed';
        toast.error(msg);
        stakeOk = false;
      } finally {
        setStakingTx(false);
      }

      if (!stakeOk) return false;

      applyLocalYesNo(item, support);

      if (address) {
        toast.success(`Stance sent on-chain. Arena XP refreshes from the indexer after sync.`);
        void refreshArenaXpSelf();
        void refreshPlayers({ silent: true });
        try {
          window.dispatchEvent(new Event('inturank-arena-onchain-updated'));
        } catch {
          /* ignore */
        }
        window.setTimeout(() => {
          void fetchArenaXpRecordForWallet(address).then((rec) => {
            setGraphArenaXp(rec.xp);
            postArenaTotalsMirrorOptional(address, rec);
          });
        }, 2800);
      }
      return true;
    },
    [stakeTRUST, isConnected, address, treasury, refreshPlayers, refreshArenaXpSelf, applyLocalYesNo]
  );

  const onCurateDecide = useCallback(
    (item: RankItem, agree: boolean) => {
      const pop = () => setCurateQueue((q) => q.filter((x) => x.id !== item.id));

      if (!isConnected || !address) {
        applyLocalYesNo(item, agree);
        pop();
        if (!guestCurateNudgeRef.current) {
          guestCurateNudgeRef.current = true;
          toast.info('Practice mode: connect a wallet to queue TRUST and submit on-chain.');
        }
        return;
      }

      void resolveYesNo(item, agree).then((ok) => {
        if (ok) pop();
      });
    },
    [isConnected, address, applyLocalYesNo, resolveYesNo],
  );

  const onCurateSkip = useCallback(() => {
    playArenaUiClick();
    setCurateQueue((q) => q.slice(1));
  }, []);

  const onNextToRankFromCurate = useCallback(() => {
    playArenaUiClick();
    const yesItems = pool
      .filter((it) => (scores[it.id] ?? SCORE_START) > SCORE_START)
      .sort((a, b) => (scores[b.id] ?? SCORE_START) - (scores[a.id] ?? SCORE_START));
    if (yesItems.length < 1) {
      toast.error('Agree with at least one pick to build your rank deck.');
      return;
    }
    const initTrust: Record<string, number> = {};
    for (const it of yesItems) {
      const row = pendingRows.find((r) => r.item.id === it.id);
      initTrust[it.id] = Math.max(1, Math.min(RANK_TRUST_UNITS_MAX, row?.units ?? 1));
    }
    const ordered = yesItems;
    const distributed = autoDistributeStakeUnitsAlongOrder(ordered, initTrust, 1, RANK_TRUST_UNITS_MAX);
    const deckOrdered = sortRankItemsByEffectiveStake(ordered, distributed, rankStakeBaseParsed);
    setRankTrustUnits(distributed);
    setRankDeckItems(deckOrdered);
    setDeckEngagementTuneCount(0);
    setArenaFlowPhase('rank');
  }, [pool, scores, pendingRows, rankStakeBaseParsed]);

  const onRankReorder = useCallback(
    (next: RankItem[]) => {
      const prevTrust = rankTrustUnitsRef.current;
      const merged = autoDistributeStakeUnitsAlongOrder(next, prevTrust, 1, RANK_TRUST_UNITS_MAX);
      setRankDeckItems(next);
      setRankTrustUnits(merged);
      if (ARENA_BATCH_MODE && listId) {
        setPendingRows((prevRows) => alignPendingRowsToDeck(next, prevRows, merged));
      }
      bumpDeckEngagement();
    },
    [listId, bumpDeckEngagement],
  );

  const onRankRemoveItem = useCallback(
    (itemId: string) => {
      playArenaUiClick();

      const rowsForItem = pendingRows.filter((r) => r.item.id === itemId);
      const nRows = rowsForItem.length;

      setScores((p) => {
        const next = { ...p, [itemId]: SCORE_START };
        if (listId) savePersistedForList(listId, next);
        return next;
      });

      const duelDrop = nRows > 0 ? nRows : 1;
      setDuels((d) => Math.max(0, d - duelDrop));
      setStreak(0);

      setRankDeckItems((prev) => {
        const nextDeck = prev.filter((x) => x.id !== itemId);
        if (nextDeck.length < 1) {
          toast.info('Deck empty; opening Curate to add picks.');
          setRankTrustUnits({});
          setPendingRows((pr) => pr.filter((r) => r.item.id !== itemId));
          queueMicrotask(() => {
            curateInitForListRef.current = null;
            setArenaFlowPhase('curate');
          });
          return [];
        }

        toast.info('Removed from deck. Remaining stakes were rebalanced by rank.');
        const pruned = { ...rankTrustUnitsRef.current };
        delete pruned[itemId];
        const dist = autoDistributeStakeUnitsAlongOrder(nextDeck, pruned, 1, RANK_TRUST_UNITS_MAX);
        const base =
          rankStakeBaseParsed > 0 ? rankStakeBaseParsed : parseStakeBaseLabel(stakeTRUST);
        const sorted = sortRankItemsByEffectiveStake(nextDeck, dist, base);

        setRankTrustUnits(dist);
        if (!ARENA_BATCH_MODE || !listId) {
          setPendingRows((pr) => pr.filter((r) => r.item.id !== itemId));
        } else {
          setPendingRows((pr) =>
            alignPendingRowsToDeck(
              sorted,
              pr.filter((r) => r.item.id !== itemId),
              dist,
            ),
          );
        }
        bumpDeckEngagement();
        return sorted;
      });
    },
    [listId, pendingRows, rankStakeBaseParsed, stakeTRUST, bumpDeckEngagement],
  );

  const onRankTrustUnitsChange = useCallback(
    (itemId: string, units: number) => {
      const u = Math.max(1, Math.min(RANK_TRUST_UNITS_MAX, units));
      playArenaUiClick();
      const base = rankStakeBaseParsed > 0 ? rankStakeBaseParsed : parseStakeBaseLabel(stakeTRUST);

      setRankTrustUnits((prevTrust) => {
        const nextTrust = { ...prevTrust, [itemId]: u };
        setRankDeckItems((deck) => {
          const sorted = sortRankItemsByEffectiveStake(deck, nextTrust, base);
          if (ARENA_BATCH_MODE && listId) {
            setPendingRows((prevRows) => alignPendingRowsToDeck(sorted, prevRows, nextTrust));
          }
          return sorted;
        });
        return nextTrust;
      });
      bumpDeckEngagement();
    },
    [listId, bumpDeckEngagement, rankStakeBaseParsed, stakeTRUST],
  );

  const rankFlowCartCount = useMemo(
    () => (listId ? batchModalRows.filter((r) => r.sourceListId === listId).length : 0),
    [batchModalRows, listId],
  );

  const onOpenRankBatchSign = useCallback(() => {
    playArenaUiClick();
    if (!isConnected || !address) {
      toast.error('Connect your wallet to sign and submit.');
      return;
    }
    if (!ARENA_BATCH_MODE) {
      toast.info('Batch mode is off. Use per-pick sends instead.');
      return;
    }
    if (rankFlowCartCount < 1) {
      toast.error('No stances in your cart for this list.');
      return;
    }
    setBatchModalOpen(true);
  }, [isConnected, address, rankFlowCartCount]);

  const onCompareFromRank = useCallback(() => {
    playArenaUiClick();
    setArenaFlowPhase('compare');
  }, []);

  const onYesNo = (item: RankItem, support: boolean) => {
    if (!round) return;
    void resolveYesNo(item, support);
  };

  const onSkip = () => {
    playArenaUiClick();
    setStreak(0);
    const items = pickYesNoGridItems(pool, ARENA_CARDS_PER_ROUND);
    if (items.length > 0) {
      setRound({ kind: 'yesno', items });
    } else {
      setRound(null);
    }
  };

  const itemHref = (it: RankItem) => {
    if (it.kind === 'token') return null;
    return `/markets/${it.id}`;
  };

  const nextMilestone = Math.ceil((duels + 1) / 5) * 5;
  const progressToMilestone = duels % 5;

  const xpPickPreview = useMemo(() => {
    try {
      const wei = parseEther((stakeTRUST || '0').trim() || '0');
      if (wei > 0n) {
        const t = parseFloat(formatEther(wei));
        if (Number.isFinite(t)) return Math.max(ARENA_XP_PER_RANK_PICK, Math.round(t * 100));
      }
    } catch {
      /* ignore */
    }
    return ARENA_XP_PER_RANK_PICK;
  }, [stakeTRUST]);

  const streakTier = getStreakTier(streak);
  const minPoolNeeded = 1;
  /** Slim top bar for contest run (no heavy “Current run” card). */
  const arenaSlimRunChrome =
    ARENA_CONTEST_FLOW_V2 &&
    (arenaFlowPhase === 'curate' || arenaFlowPhase === 'rank' || arenaFlowPhase === 'compare');
  const quickStartList = useMemo(() => {
    const flagship = getArenaListById(FLAGSHIP_ARENA_LIST_ID);
    const flagshipInLane = listsForCategory.some((l) => l.id === FLAGSHIP_ARENA_LIST_ID);
    if (flagship && (arenaCategoryId === 'all' || flagshipInLane)) return flagship;
    return listsForCategory[0] ?? ARENA_LISTS[0];
  }, [listsForCategory, arenaCategoryId]);

  const startListRun = useCallback(
    (id: string) => {
      resumeArenaAudio();
      arenaFloorStingerPlayedForListRef.current = id;
      playArenaFloorEnter();
      setListId(id);
      if (ARENA_CONTEST_FLOW_V2) {
        clearPersistedContestFlow(id);
        guestCurateNudgeRef.current = false;
        setArenaFlowPhase('curate');
        curateInitForListRef.current = null;
        setRankDeckItems([]);
        setRankTrustUnits({});
        setDeckEngagementTuneCount(0);
      }
      try {
        sessionStorage.setItem('inturank-arena-last-list', id);
      } catch {
        /* ignore */
      }
      const hasListInUrl = Boolean((searchParams.get('list') || searchParams.get('listId'))?.trim());
      const next = new URLSearchParams(searchParams);
      next.set('list', id);
      next.delete('listId');
      next.delete('view');
      navigate(`/climb?${next.toString()}`, { replace: hasListInUrl });
    },
    [navigate, searchParams],
  );

  const exitToArenaBrowse = useCallback(() => {
    playArenaUiClick();
    if (ARENA_CONTEST_FLOW_V2) {
      clearPersistedContestFlow(listId);
      setArenaFlowPhase('hub');
      curateInitForListRef.current = null;
      setCurateQueue([]);
      setRankDeckItems([]);
      setRankTrustUnits({});
      setDeckEngagementTuneCount(0);
      guestCurateNudgeRef.current = false;
    }
    setListId(null);
    setRound(null);
    try {
      sessionStorage.removeItem('inturank-arena-last-list');
    } catch {
      /* ignore */
    }
    navigate('/climb', { replace: true });
  }, [navigate, listId]);

  const onCompareRandomGame = useCallback(() => {
    playArenaUiClick();
    const others = allArenaListsFlat.filter((l) => l.id !== listId);
    if (others.length < 1) {
      toast.info('No other lists to jump to.');
      return;
    }
    const pick = others[Math.floor(Math.random() * others.length)]!;
    startListRun(pick.id);
  }, [allArenaListsFlat, listId, startListRun]);

  /** Count of locally-created cards (id starts with `pending-card-…`) in the deck. */
  const pendingCardCount = useMemo(
    () => rankDeckItems.filter((it) => isPendingArenaCardId(it.id)).length,
    [rankDeckItems],
  );

  /**
   * Compare → "Sign + pick next game" entry point.
   *
   * On-chain writes ONLY happen here, at the end of a contest run. Chain:
   *   1. If the contest is off-chain (`source !== 'portal'`) → open the
   *      promote modal. Its success callback then migrates the pending
   *      batch rows to the new portal id and (if any) opens the rank
   *      batch modal in the same flow.
   *   2. Else if there are queued rank stakes → open the batch review modal.
   *   3. Else → nothing to sign; exit to hub (Compare only calls this when (1) or (2) applies).
   */
  const beginArenaCommit = useCallback(() => {
    playArenaUiClick();

    if (!isConnected || !address) {
      void connectWallet();
      return;
    }

    if (activeList && activeList.source !== 'portal') {
      setCommitPhase('promote');
      setPromoteContestOpen(true);
      return;
    }

    if (ARENA_BATCH_MODE && rankFlowCartCount > 0) {
      setCommitPhase('rank-batch');
      setBatchModalOpen(true);
      return;
    }

    setCommitPhase('idle');
    exitToArenaBrowse();
  }, [
    activeList,
    address,
    isConnected,
    rankFlowCartCount,
    exitToArenaBrowse,
  ]);

  const onQuickStart = useCallback(() => {
    if (!quickStartList) return;
    playArenaUiClick();
    startListRun(quickStartList.id);
  }, [quickStartList, startListRun]);

  const onRandomContestFromGate = useCallback(() => {
    playArenaUiClick();
    const pool = allArenaListsFlat;
    if (pool.length < 1) {
      toast.info('No contests available.');
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    startListRun(pick.id);
  }, [allArenaListsFlat, startListRun]);

  const onResumeLastFromGate = useCallback(() => {
    playArenaUiClick();
    try {
      const id = sessionStorage.getItem('inturank-arena-last-list')?.trim();
      if (id && getArenaListById(id)) startListRun(id);
    } catch {
      /* ignore */
    }
  }, [startListRun]);

  return (
    <div
      className={`relative isolate z-10 min-h-screen w-full min-w-0 overflow-x-hidden font-sans text-slate-300 selection:bg-intuition-primary/25 selection:text-white ${listId ? 'pb-6 sm:pb-8' : 'pb-16 sm:pb-20'}`}
      style={{ backgroundColor: ARENA_THEME.bgPage }}
    >
      <section className="relative z-10 border-b border-white/[0.06] overflow-hidden">
        <div className="h-1.5 w-full" style={{ background: ARENA_THEME.topAccentBar }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.55]" style={{ background: ARENA_THEME.heroGlow }} />
        <div className="w-full max-w-[min(1720px,calc(100vw-1.5rem))] sm:max-w-[min(1720px,calc(100vw-2rem))] mx-auto px-3 sm:px-6 lg:px-10 xl:px-12 pt-5 pb-4 md:pt-6 md:pb-5 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 sm:gap-8 lg:gap-10">
            <div className="relative min-w-0">
              <p
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.4em]"
                style={{
                  color: `${ARENA_THEME.cyan}ee`,
                  borderColor: `${ARENA_THEME.cyan}33`,
                  background: `linear-gradient(90deg, ${ARENA_THEME.cyan}10, transparent)`,
                  boxShadow: `0 0 20px ${ARENA_THEME.cyan}12, inset 0 1px 0 rgba(255,255,255,0.06)`,
                }}
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: ARENA_THEME.cyan }} />
                IntuRank · Climb
              </p>
              <h1
                className="mt-3 text-3xl sm:text-4xl md:text-5xl font-black font-display tracking-tight bg-clip-text text-transparent drop-shadow-[0_0_42px_rgba(0,243,255,0.12)] leading-[1.05]"
                style={{ backgroundImage: ARENA_THEME.heroTitle }}
              >
                THE ARENA
              </h1>
              <div
                className="mt-3 h-[3px] w-28 max-w-[40%] rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${ARENA_THEME.accentPink}, ${ARENA_THEME.cyan}, transparent)`,
                  boxShadow: `0 0 18px ${ARENA_THEME.cyan}55`,
                }}
                aria-hidden
              />
              <p className="text-sm text-slate-400 mt-4 max-w-md leading-relaxed font-medium">
                {climbViewMode === 'explorer' ? (
                  <>
                    Recent ranks through IntuRank. Switch to{' '}
                    <span className="text-slate-400 font-semibold">Arena</span> to vote or{' '}
                    <span className="text-cyan-300 font-semibold">Signal</span> to stance.
                  </>
                ) : climbViewMode === 'signal' ? (
                  <>
                    Stake your conviction on triples surfacing across Intuition.{' '}
                    <span className="text-cyan-300 font-semibold">STAND</span> · or ·{' '}
                    <span className="text-rose-300 font-semibold">OPPOSE</span>.
                  </>
                ) : listId ? (
                  address ? (
                    <>
                      <span style={{ color: ARENA_THEME.cyanMuted }} className="font-semibold">Yes</span>
                      {' / '}
                      <span style={{ color: ARENA_THEME.roseNo }} className="font-semibold">No</span>
                      {' · batch when ready.'}
                    </>
                  ) : (
                    'Pick now. Wallet only when you stake.'
                  )
                ) : (
                  'Pick a lane, then a list, or jump to Signal for live stances.'
                )}
              </p>
              {showOnboardTip ? (
                <div className="mt-3 max-w-md rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 flex items-center gap-3">
                  <Sparkles size={14} className="text-cyan-300 shrink-0" aria-hidden />
                  <p className="text-[11px] text-slate-300 leading-snug flex-1">
                    Tap <strong className="text-white">Quick start</strong>. Toggle <strong className="text-white">Explorer</strong> for stars, leaderboard & feed.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      playArenaUiClick();
                      dismissOnboardTip();
                    }}
                    className="shrink-0 rounded-md bg-cyan-500/15 border border-cyan-400/30 px-2 py-1 text-[10px] font-bold text-cyan-200 hover:bg-cyan-500/25"
                  >
                    OK
                  </button>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-stretch w-full sm:w-auto sm:max-w-[min(410px,calc(100vw-2rem))] shrink-0 gap-0">
              <div className="relative overflow-hidden rounded-[1.35rem] border border-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_64px_-24px_rgba(34,211,238,0.45),0_0_1px_rgba(236,72,153,0.28)] backdrop-blur-xl backdrop-saturate-150 pt-px">
                {/* Panel chrome */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-4 top-0 h-px rounded-full opacity-80"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${ARENA_THEME.cyan}99, transparent)`,
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.035]"
                  style={{
                    backgroundImage: `linear-gradient(${ARENA_THEME.cyan}06 1px, transparent 1px)`, backgroundSize: '100% 3px'
                  }}
                />
                <div aria-hidden className="pointer-events-none absolute top-2 left-2 h-6 w-6 border-l-2 border-t-2 border-cyan-400/45 rounded-tl-md" />
                <div aria-hidden className="pointer-events-none absolute top-2 right-2 h-6 w-6 border-r-2 border-t-2 border-fuchsia-500/35 rounded-tr-md" />
                <div aria-hidden className="pointer-events-none absolute bottom-2 left-2 h-6 w-6 border-l-2 border-b-2 border-fuchsia-500/30 rounded-bl-md" />
                <div aria-hidden className="pointer-events-none absolute bottom-2 right-2 h-6 w-6 border-r-2 border-b-2 border-cyan-400/35 rounded-br-md" />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-24 -top-28 h-56 w-56 rounded-full opacity-25 blur-3xl"
                  style={{ background: `radial-gradient(circle, ${ARENA_THEME.cyan}55, transparent 70%)` }}
                />

                <div
                  className="relative px-3.5 sm:px-4 py-4 sm:py-5 space-y-3.5"
                  style={{
                    background: `linear-gradient(165deg, ${ARENA_THEME.cyan}0f 0%, rgba(10,12,22,0.88) 45%, rgba(4,6,12,0.94) 100%)`,
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-[9px] font-mono font-black uppercase tracking-[0.42em] text-cyan-500/85 pl-0.5">
                      Climb uplink
                    </p>
                    <div
                      className="inline-flex w-full flex-wrap gap-1.5 rounded-xl border border-white/[0.08] bg-black/58 p-1.5 shadow-[inset_0_2px_12px_rgba(0,0,0,0.45)]"
                      role="group"
                      aria-label="Arena view"
                    >
                      <motion.button
                        type="button"
                        onClick={() => setClimbViewMode('arena')}
                        aria-pressed={climbViewMode === 'arena'}
                        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                        className={`relative inline-flex flex-1 min-w-[4.75rem] items-center justify-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] transition-all duration-200 ${
                          climbViewMode === 'arena'
                            ? 'bg-gradient-to-b from-cyan-400/35 to-cyan-600/12 text-white shadow-[0_0_28px_rgba(34,211,238,0.4),inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-cyan-300/60'
                            : 'text-slate-500 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        <Trophy size={14} strokeWidth={2.4} className={climbViewMode === 'arena' ? 'text-cyan-100' : 'text-slate-600'} />
                        Arena
                        {climbViewMode !== 'arena' ? (
                          <span className="absolute -top-1 -right-1 inline-block px-1 py-px rounded-md bg-intuition-secondary text-[7px] font-black text-white tracking-wider leading-none shadow-[0_0_12px_rgba(255,30,109,0.5)] ring-1 ring-white/25">
                            NEW
                          </span>
                        ) : null}
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => setClimbViewMode('signal')}
                        aria-pressed={climbViewMode === 'signal'}
                        title="Stance feed · stake your conviction on circulating triples"
                        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                        className={`relative inline-flex flex-1 min-w-[4.75rem] items-center justify-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] transition-all duration-200 ${
                          climbViewMode === 'signal'
                            ? 'bg-gradient-to-b from-cyan-400/35 to-cyan-600/12 text-white shadow-[0_0_28px_rgba(34,211,238,0.4),inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-cyan-300/60'
                            : 'text-slate-500 hover:text-cyan-200 hover:bg-white/[0.06]'
                        }`}
                      >
                        <Zap size={14} strokeWidth={2.5} className={climbViewMode === 'signal' ? 'text-cyan-100' : 'text-slate-600'} />
                        Signal
                        {climbViewMode !== 'signal' ? (
                          <span className="absolute -top-1 -right-1 inline-block px-1 py-px rounded-md bg-intuition-secondary text-[7px] font-black text-white tracking-wider leading-none shadow-[0_0_12px_rgba(255,30,109,0.5)] ring-1 ring-white/25">
                            NEW
                          </span>
                        ) : null}
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => setClimbViewMode('explorer')}
                        aria-pressed={climbViewMode === 'explorer'}
                        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                        className={`relative inline-flex flex-1 min-w-[4.75rem] items-center justify-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em] transition-all duration-200 ${
                          climbViewMode === 'explorer'
                            ? 'bg-gradient-to-b from-cyan-400/35 to-cyan-600/12 text-white shadow-[0_0_28px_rgba(34,211,238,0.4),inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-cyan-300/60'
                            : 'text-slate-500 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        <Sparkles size={14} strokeWidth={2.4} className={climbViewMode === 'explorer' ? 'text-cyan-100' : 'text-slate-600'} />
                        Explorer
                        {climbViewMode !== 'explorer' ? (
                          <span className="absolute -top-1 -right-1 inline-block px-1 py-px rounded-md bg-intuition-secondary text-[7px] font-black text-white tracking-wider leading-none shadow-[0_0_12px_rgba(255,30,109,0.5)] ring-1 ring-white/25">
                            NEW
                          </span>
                        ) : null}
                      </motion.button>
                    </div>
                  </div>

                  {address ? (
                    <IntuRankXpBadge
                      arenaXp={arenaXpUi}
                      activityXp={myProtocolXp}
                      size="md"
                      presentation="arenaHud"
                      className="w-full"
                      loading={!arenaGraphReady}
                    />
                  ) : (
                    <div
                      className="w-full min-h-[7.5rem] rounded-xl border border-dashed border-white/12 bg-black/30 flex flex-col items-center justify-center gap-1.5 px-4 py-3 text-center"
                      aria-hidden
                    >
                      <span className="text-[9px] font-mono font-black uppercase tracking-[0.32em] text-slate-600">
                        XP uplink
                      </span>
                      <span className="text-[11px] text-slate-500 leading-snug max-w-[14rem]">
                        Connect your wallet to show live XP in this rail.
                      </span>
                    </div>
                  )}

                  <div
                    className="rounded-xl border border-white/[0.09] px-3 py-2.5 backdrop-blur-sm min-h-[3.75rem] flex items-center"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(8,8,12,0.88) 0%, rgba(0,243,255,0.07) 100%)',
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px ${ARENA_THEME.goldDim}`,
                    }}
                  >
                    {listId && climbViewMode === 'arena' ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] sm:text-[11px] w-full">
                        <span className="font-mono font-black uppercase tracking-[0.2em] text-slate-600 w-full sm:w-auto">
                          Session
                        </span>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-slate-600 font-mono uppercase tracking-wider text-[9px]">Rounds</span>
                            <span className="text-white font-mono font-bold tabular-nums text-sm">{duels}</span>
                          </div>
                          <span className="text-slate-700 hidden sm:inline">│</span>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-slate-600 font-mono uppercase tracking-wider text-[9px]">Streak</span>
                            <span className="font-mono font-bold tabular-nums text-sm text-[#fcd34d]">{streak}</span>
                          </div>
                          {address ? (
                            <>
                              <span className="text-slate-700 hidden sm:inline">│</span>
                              <div className="flex items-baseline gap-1.5 min-w-0">
                                <span className="text-slate-600 font-mono uppercase tracking-wider text-[9px] shrink-0">XP</span>
                                <span
                                  className="text-slate-500 min-w-0 truncate"
                                  title={`Arena ${arenaXpUi.toLocaleString()} (indexer ${graphArenaXp.toLocaleString()} · this device picks ${arenaPickXp.toLocaleString()}) · Activity ${myProtocolXp.toLocaleString()} · Total`}
                                >
                                  <AnimatedXpFigure
                                    ready={arenaGraphReady}
                                    value={xpDisplayTarget}
                                    className="text-intuition-primary font-mono font-bold tabular-nums text-sm arena-xp-roll"
                                  />
                                </span>
                              </div>
                            </>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto sm:flex-1 sm:min-w-[120px] sm:max-w-[180px]">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-900/90 overflow-hidden ring-1 ring-inset ring-white/[0.08]">
                            <div
                              className="h-full rounded-full transition-[width] duration-500 ease-out"
                              style={{
                                width: `${(progressToMilestone / 5) * 100}%`,
                                background: `linear-gradient(90deg, ${ARENA_THEME.cyan}, ${ARENA_THEME.accentPink})`,
                                boxShadow: `0 0 12px ${ARENA_THEME.cyan}66`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="w-full text-[10px] sm:text-[11px] font-mono text-slate-500 leading-relaxed px-0.5">
                        <span className="font-black uppercase tracking-[0.2em] text-slate-600 mr-2">Session</span>
                        Open a contest from <span className="text-slate-400">Arena</span> to track rounds, streak, and
                        lane XP here. Signal and Explorer leave this rail idle until then.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {climbViewMode === 'signal' ? (
        <div className="relative z-10 w-full max-w-[min(1720px,calc(100vw-1.5rem))] sm:max-w-[min(1720px,calc(100vw-2rem))] mx-auto px-3 sm:px-6 lg:px-10 xl:px-12 pt-4 pb-16 sm:pb-20 min-w-0">
          <div
            className="rounded-[1.75rem] border border-white/[0.07] backdrop-blur-2xl backdrop-saturate-150 overflow-hidden"
            style={{
              background: ARENA_THEME.shellGlass,
              boxShadow: ARENA_THEME.shellShadow,
            }}
          >
            <div className="p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8">
              <SignalFeed viewerAddress={address ?? undefined} />
            </div>
          </div>
        </div>
      ) : climbViewMode === 'explorer' ? (
        <div className="relative z-10 w-full max-w-[min(1720px,calc(100vw-1.5rem))] sm:max-w-[min(1720px,calc(100vw-2rem))] mx-auto px-3 sm:px-6 lg:px-10 xl:px-12 pt-4 pb-16 sm:pb-20 min-w-0">
          <div
            className="rounded-[1.75rem] border border-white/[0.07] backdrop-blur-2xl backdrop-saturate-150 overflow-hidden"
            style={{
              background: ARENA_THEME.shellGlass,
              boxShadow: ARENA_THEME.shellShadow,
            }}
          >
            <div className="p-4 sm:p-5 md:p-6 lg:p-7 xl:p-8">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] gap-6 xl:gap-8 xl:items-start">
                <aside
                  className="flex flex-col gap-4 min-w-0 w-full p-4 sm:p-5 rounded-3xl border border-white/[0.07] backdrop-blur-md [scrollbar-width:thin] xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:overscroll-auto order-2 xl:order-1"
                  style={{
                    background: 'linear-gradient(165deg, rgba(12,12,16,0.75) 0%, rgba(8,8,10,0.82) 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 40px rgba(232,197,71,0.04)',
                  }}
                >
                  <div className="shrink-0 space-y-2">
                    <ArenaLeaderboardGlance
                      players={players}
                      loading={playersLoading}
                      myAddress={address}
                      myArenaXp={arenaXpUi}
                      myActivityXp={myProtocolXp}
                    />
                    {address ? (
                      <div className="flex justify-center px-1">
                        <button
                          type="button"
                          onClick={() => {
                            playArenaUiClick();
                            clearProtocolXpLedger();
                            clearArenaPickCreditLedger();
                            setPickCreditTick((n) => n + 1);
                            toast.success(
                              'Cleared activity XP and device Arena pick credit on this browser.',
                            );
                          }}
                          className="text-[9px] font-bold uppercase tracking-wider text-slate-600 hover:text-slate-400 underline-offset-2 hover:underline transition-colors"
                        >
                          Clear device XP (activity + Arena picks)
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <ArenaBrowseLaneHud laneLabel={arenaLaneLabelShort} listCount={listsForCategory.length} />
                  <ArenaSidebarSessionStrip
                    duels={lifetimeRoundsForWallet}
                    streak={currentStreakForWallet}
                    xpTotal={xpDisplayTarget}
                    xpTotalReady={arenaGraphReady}
                    connected={Boolean(address)}
                  />
                  <ArenaStarredRail
                    items={starredRailRows}
                    collapsed={starredRailCollapsed}
                    onToggleCollapsed={() => setStarredRailCollapsed((v) => !v)}
                    onOpen={(id) => startListRun(id)}
                    onUnstar={(id) => toggleListFavorite(id)}
                    laneLabel={arenaLaneLabelShort}
                  />
                  <ArenaSidebarDeck flagshipListId={FLAGSHIP_ARENA_LIST_ID} />
                </aside>
                <div className="min-w-0 order-1 xl:order-2">
                  <ArenaRankingPulse variant="explorer" viewerAddress={address ?? undefined} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
      <div
        className={`relative z-10 mx-auto w-full max-w-[min(1800px,calc(100vw-1rem))] sm:max-w-[min(1800px,calc(100vw-1.25rem))] pt-0 ${
          listId && arenaSlimRunChrome ? 'px-2 sm:px-4 lg:px-6 xl:px-8' : 'px-3 sm:px-6 lg:px-10 xl:px-12'
        } ${listId ? 'pb-4 sm:pb-5' : 'pb-10'}`}
      >
        <div
          className={
            false
              ? 'rounded-2xl border border-slate-200/95 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.07)] overflow-x-hidden lg:overflow-visible'
              : 'rounded-[1.75rem] border border-white/[0.1] backdrop-blur-2xl backdrop-saturate-150 overflow-x-hidden lg:overflow-visible shadow-[0_0_48px_rgba(56,232,255,0.05)]'
          }
          style={
            false
              ? undefined
              : {
                  background: ARENA_THEME.shellGlass,
                  boxShadow: ARENA_THEME.shellShadow,
                }
          }
        >
        <div
          className={`grid grid-cols-1 gap-0 ${
            false ? 'divide-y divide-slate-200/90' : 'divide-y divide-white/[0.06]'
          } items-stretch`}
        >
        <div
          className={`min-w-0 flex flex-col lg:min-h-[calc(100vh-12rem)] ${
            listId && arenaSlimRunChrome ? 'p-2 sm:p-3 md:p-4 lg:p-5 xl:p-6' : 'p-3 sm:p-4 md:p-5 lg:p-7 xl:p-8'
          }`}
        >
          {!listId && !ARENA_CONTEST_FLOW_V2 ? (
            <div
              className="mb-4 rounded-2xl border border-white/[0.1] px-5 py-3.5 sm:px-7 sm:py-4 relative overflow-hidden"
              style={{
                background: ARENA_THEME.signalIntroStrip,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 40px rgba(0,243,255,0.08), 0 0 28px rgba(255,30,109,0.04)',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <div
                    className="shrink-0 w-10 h-10 rounded-xl border border-intuition-primary/35 bg-intuition-primary/10 flex items-center justify-center shadow-[0_0_20px_rgba(0,243,255,0.12)]"
                    aria-hidden
                  >
                    <Trophy size={18} className="text-intuition-primary" strokeWidth={2.35} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono font-black uppercase tracking-[0.28em] text-intuition-primary/90">
                      IntuRank · Arena
                    </p>
                    <p className="text-[13px] text-slate-200 leading-snug mt-0.5">
                      Same dark glass and cyan numbers as your IntuRank profile.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <div
            className={`relative min-w-0 isolate overflow-hidden rounded-xl grid grid-cols-1 ${
              false
                ? 'border border-slate-200/70 bg-[#f8fafc]'
                : 'border border-white/10'
            } ${
              listId
                ? 'min-h-0 auto-rows-min'
                : 'flex-1 min-h-[min(520px,calc(100vh-13rem))] lg:min-h-[min(560px,calc(100vh-12rem))] grid-rows-1'
            }`}
            style={
              false
                ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)' }
                : {
                    background: ARENA_THEME.signalBrowseWell,
                    boxShadow: ARENA_THEME.signalBrowseWellShadow,
                  }
            }
          >
            {!listId ? (
              <div
                role="tabpanel"
                aria-label={ARENA_CONTEST_FLOW_V2 ? 'Arena play entry' : 'Browse Arena lists'}
                className="col-start-1 row-start-1 z-[1] min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-auto pr-1 [scrollbar-gutter:stable]"
              >
            {ARENA_CONTEST_FLOW_V2 ? (
              <div className="p-3 sm:p-4 md:p-5 lg:p-6">
                <ArenaContestHub
                  sections={contestHubSections}
                  onSelectList={startListRun}
                  reduceMotion={reduceMotion}
                  onRandomContest={onRandomContestFromGate}
                  onResumeLast={onResumeLastFromGate}
                  resumeListTitle={resumeBrowseTitle}
                  previewPoolByListId={hubPreviewPoolByListId}
                  listConstituentOverrides={arenaListConstituentOverrides}
                />
              </div>
            ) : (
            <div
              className="rounded-2xl border border-white/[0.1] p-4 sm:p-5 relative overflow-hidden backdrop-blur-md"
              style={{
                background: ARENA_THEME.signalIntroStrip,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 56px rgba(0,0,0,0.45), 0 0 36px rgba(0,243,255,0.08), 0 0 28px rgba(255,30,109,0.05)',
              }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-90" style={{ background: ARENA_THEME.rimBar }} aria-hidden />
              <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="shrink-0 w-10 h-10 rounded-xl border border-intuition-primary/35 bg-intuition-primary/10 flex items-center justify-center shadow-[0_0_20px_rgba(0,243,255,0.12)]"
                    aria-hidden
                  >
                    <Scale size={18} className="text-intuition-primary" strokeWidth={2.35} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono font-black uppercase tracking-[0.28em] text-intuition-primary/90">Arena · Climb</p>
                    <h2 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">Pick a list</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Tap a list card below to start.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span
                    className="flex items-center gap-1 rounded-full border px-2.5 py-1"
                    style={{ borderColor: `${ARENA_THEME.cyan}40`, background: `${ARENA_THEME.cyan}10` }}
                  >
                    <span className="font-black tabular-nums" style={{ color: ARENA_THEME.cyanMuted }}>
                      1
                    </span>{' '}
                    Lane
                  </span>
                  <ChevronRight size={12} className="text-slate-600 shrink-0" />
                  <span className="flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1">
                    <span className="font-black tabular-nums text-slate-200">2</span> List
                  </span>
                  <ChevronRight size={12} className="text-slate-600 shrink-0" />
                  <span className="flex items-center gap-1 rounded-full border border-intuition-secondary/35 bg-intuition-secondary/10 px-2.5 py-1">
                    <span className="font-black tabular-nums text-intuition-secondary/95">3</span> Vote
                  </span>
                </div>
              </div>
              <div
                className="mb-4 rounded-xl border border-intuition-primary/25 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative overflow-hidden bg-[#05070c]/80"
                style={{
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 28px rgba(0,243,255,0.08)`,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center border border-intuition-primary/40 bg-intuition-primary/10"
                  >
                    <Sparkles size={18} className="text-intuition-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-300">
                      Jump in
                    </p>
                    <p className="text-sm font-bold text-white truncate">{quickStartList?.title ?? '…'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onQuickStart}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_28px_rgba(0,243,255,0.25)] hover:brightness-110 transition-[filter]"
                  style={{
                    background: `linear-gradient(90deg, ${ARENA_THEME.cyan}, ${ARENA_THEME.accentPink})`,
                  }}
                >
                  Go
                  <ChevronRight size={16} strokeWidth={2.8} />
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:thin] rounded-xl border border-white/[0.08] bg-black/50 p-1.5">
                {ARENA_CATEGORY_PILLS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      playArenaUiClick();
                      setArenaCategoryId(c.id);
                    }}
                    onMouseEnter={playArenaUiHover}
                    className={`shrink-0 rounded-lg px-3.5 py-1.5 text-[11px] font-bold transition-all duration-200 ${
                      arenaCategoryId === c.id
                        ? 'text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(56,232,255,0.12)] ring-1 ring-cyan-400/55'
                        : 'text-slate-200 border border-transparent hover:text-white hover:bg-white/[0.05]'
                    }`}
                    style={
                      arenaCategoryId === c.id
                        ? {
                            background: `linear-gradient(135deg, ${ARENA_THEME.cyan}22, rgba(8,10,14,0.92))`,
                          }
                        : undefined
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2 mb-1 font-mono tabular-nums">
                {listsForCategory.length} list{listsForCategory.length === 1 ? '' : 's'} in this lane
              </p>
              <div className="space-y-5">
                {groupedArenaLists.map((group) => {
                  const visible = showAllLists ? group.lists : group.lists.slice(0, 4);
                  return (
                    <div key={group.id}>
                      <div className="flex items-center justify-between mb-2.5 gap-3">
                        <p className="text-[10px] font-mono font-black uppercase tracking-[0.22em] text-cyan-200/90">
                          {group.label}
                        </p>
                        <span className="text-[10px] text-slate-500 tabular-nums">{group.lists.length}</span>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-3.5">
                        {visible.map((L) => (
                          <div key={L.id}>
                          <ArenaListCard
                            title={L.title}
                            description={L.description}
                            tag={L.tag}
                            categoryLabel={
                              ARENA_CATEGORY_PILLS.find((p) => p.id === L.arenaCategory)?.label ?? L.tag
                            }
                            listGlyph={L.listGlyph}
                            constituentCount={getArenaListConstituents(L)}
                            previewItems={getArenaPreviewItems(L, [])}
                            reduceMotion={reduceMotion}
                            isFavorite={favoriteSet.has(L.id)}
                            onFavoriteToggle={() => toggleListFavorite(L.id)}
                            onSelect={() => {
                              startListRun(L.id);
                            }}
                          />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {arenaCategoryId === 'all' && listsForCategory.length > 8 && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      playArenaUiClick();
                      setShowAllLists((v) => !v);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:border-cyan-500/35 hover:text-cyan-100 transition-colors"
                  >
                    {showAllLists ? 'Show fewer lists' : 'Show more lists'}
                    <ChevronRight size={13} className={showAllLists ? 'rotate-90' : ''} />
                  </button>
                </div>
              )}
              </div>
            </div>
            )}
                </div>
              ) : (
                <div
                  role="tabpanel"
                  aria-label="Arena voting"
                  className="col-start-1 row-start-1 z-[2] min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-auto flex flex-col gap-4 md:gap-5 pb-3 pr-1 [scrollbar-gutter:stable]"
                  style={
                    false
                      ? {
                          background: '#f8fafc',
                          boxShadow: 'none',
                        }
                      : {
                          background: ARENA_THEME.signalRunColumnBg,
                          boxShadow: ARENA_THEME.signalRunColumnShadow,
                        }
                  }
                >
            <>
              {listId && !address ? (
                <div
                  className={`rounded-xl border px-3 py-2 mb-4 text-[11px] ${
                    false
                      ? 'border-sky-200 bg-sky-50 text-slate-600'
                      : 'text-slate-300'
                  }`}
                  style={
                    false
                      ? undefined
                      : {
                          borderColor: `${ARENA_THEME.cyan}35`,
                          background: `linear-gradient(135deg, ${ARENA_THEME.cyan}08, ${ARENA_THEME.redDim})`,
                        }
                  }
                >
                  Guest, connects when you stake
                </div>
              ) : null}
          {arenaSlimRunChrome ? (
            <div className="mb-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exitToArenaBrowse}
                  onMouseEnter={playArenaUiHover}
                  aria-label="Back to Arena lists"
                  title="Back"
                  className={
                    false
                      ? 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:border-sky-300 hover:text-slate-900'
                      : 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] bg-black/45 text-slate-200 transition-all hover:border-intuition-primary/45 hover:text-white hover:bg-black/55'
                  }
                  style={false ? undefined : { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)` }}
                >
                  <ArrowLeft
                    size={18}
                    strokeWidth={2.5}
                    style={{ color: false ? '#0f172a' : ARENA_THEME.cyanMuted }}
                  />
                </button>
                {ARENA_BATCH_MODE && batchModalRows.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        playArenaUiClick();
                        setBatchModalOpen(true);
                      }}
                      className={
                        false
                          ? 'rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-sky-900 transition-colors hover:border-sky-300'
                          : 'rounded-xl border border-cyan-500/35 bg-cyan-500/[0.1] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-cyan-100 transition-colors hover:border-cyan-400/50'
                      }
                    >
                      Cart ({batchModalRows.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playArenaUiClick();
                        setPendingArenaClear((k) => (k === 'cart' ? null : 'cart'));
                      }}
                      aria-label="Clear entire conviction cart"
                      title="Clear all queued stances (every list)"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.12] bg-black/35 text-slate-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
                    >
                      <Trash2 size={17} strokeWidth={2.2} aria-hidden />
                    </button>
                  </>
                ) : null}
                {hasClearableContestPicks ? (
                  <button
                    type="button"
                    onClick={() => {
                      playArenaUiClick();
                      setPendingArenaClear((k) => (k === 'contest' ? null : 'contest'));
                    }}
                    className="rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                  >
                    Clear picks
                  </button>
                ) : null}
              </div>
              {pendingArenaClear ? (
                <div
                  role="region"
                  aria-label={pendingArenaClear === 'cart' ? 'Confirm clear cart' : 'Confirm clear picks'}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5"
                  style={
                    pendingArenaClear === 'cart'
                      ? {
                          borderColor: 'rgba(244,63,94,0.35)',
                          background: 'rgba(69,10,10,0.35)',
                        }
                      : {
                          borderColor: 'rgba(244,63,94,0.28)',
                          background: 'rgba(15,23,42,0.65)',
                        }
                  }
                >
                  <span className="text-[11px] text-slate-300 pr-2 leading-snug min-w-[12rem] flex-1">
                    {pendingArenaClear === 'cart' ? (
                      <>
                        Remove all <span className="font-semibold text-white">{batchModalRows.length}</span> queued
                        stance{batchModalRows.length === 1 ? '' : 's'} (every list)?
                      </>
                    ) : (
                      <>Reset Curate votes, your Rank deck, and this list&apos;s cart and start fresh?</>
                    )}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        playArenaUiClick();
                        setPendingArenaClear(null);
                      }}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-300 border border-white/15 hover:bg-white/[0.06]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (pendingArenaClear === 'cart') clearAllArenaBatch();
                        else clearContestPicksForCurrentList();
                      }}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-rose-600/90 text-white border border-rose-400/45 hover:bg-rose-600"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
          <div
            className="rounded-2xl border border-white/10 p-4 sm:p-5 backdrop-blur-md relative overflow-hidden ring-1 ring-intuition-primary/20"
            style={{
              background: ARENA_THEME.currentRunCard,
              boxShadow: `0 0 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 32px ${ARENA_THEME.redDim}`,
            }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px] rounded-t-2xl opacity-95 bg-gradient-to-r from-transparent via-intuition-primary/90 to-transparent"
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-90 rounded-t-3xl" style={{ background: ARENA_THEME.rimBar }} aria-hidden />
            <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <button
                type="button"
                onClick={exitToArenaBrowse}
                onMouseEnter={playArenaUiHover}
                aria-label="Back to Arena lists"
                title="Back"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.14] bg-black/45 text-slate-200 transition-all hover:border-intuition-primary/45 hover:text-white hover:bg-black/55 self-start"
                style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)` }}
              >
                <ArrowLeft size={18} strokeWidth={2.5} style={{ color: ARENA_THEME.cyanMuted }} />
              </button>

              <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1 lg:min-h-[40px]">
                <span
                  className="rounded-full border px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-[0.28em]"
                  style={{
                    borderColor: `${ARENA_THEME.cyan}44`,
                    background: `linear-gradient(135deg, ${ARENA_THEME.cyan}14, rgba(8,10,14,0.9))`,
                    color: ARENA_THEME.goldBright,
                  }}
                >
                  Current run
                </span>
                <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-500">
                  <span>Prompt</span>
                  <ChevronRight size={11} className="text-slate-600 shrink-0" />
                  <span>Vote</span>
                  <ChevronRight size={11} className="text-slate-600 shrink-0" />
                  <span>Cuts</span>
                </div>
              </div>

              <ArenaListQuickPick
                activeListId={listId ?? ''}
                favorites={quickPickFavoriteRows}
                others={quickPickOtherRows}
                onSelectList={startListRun}
                className="w-full lg:flex-1 lg:min-w-[min(100%,220px)] lg:max-w-xl xl:max-w-2xl lg:ml-auto"
              />
            </div>

            {activeList && !arenaSlimRunChrome ? (
              <>
                <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 gap-y-3">
                  <h2 className="text-xl sm:text-2xl font-black text-white leading-tight tracking-tight truncate min-w-0">
                    {activeList.title}
                  </h2>
                  {stanceSummary.total > 0 ? (
                    <p className="text-[11px] text-slate-500 shrink-0 tabular-nums sm:text-right">
                      {stanceSummary.total} indexed ·{' '}
                      <span className="font-semibold" style={{ color: ARENA_THEME.cyan }}>
                        yes {stanceSummary.yes}
                      </span>
                      {' · '}
                      <span className="font-semibold" style={{ color: ARENA_THEME.red }}>
                        no {stanceSummary.no}
                      </span>
                    </p>
                  ) : null}
                </div>
                {activeList.description ? (
                  <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-1 leading-snug">{activeList.description}</p>
                ) : null}
                {activeList ? (
                  <FootprintStripe entry={activeList} />
                ) : null}
              </>
            ) : null}

            {listId && !ARENA_CONTEST_FLOW_V2 && round?.kind === 'yesno' && round.items?.length ? (
              <div
                className="mt-5 rounded-xl border border-white/10 bg-black/35 px-4 py-3 md:px-5 md:py-4"
                style={{
                  borderColor: 'rgba(251,191,36,0.22)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 24px rgba(56,232,255,0.06), 0 0 20px rgba(248,113,113,0.05)',
                }}
              >
                {round.items.length === 1 && round.items[0] && activeList ? (
                  <p className="text-sm font-medium text-slate-100 leading-snug">{buildArenaItemQuestion(activeList, round.items[0])}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 gap-y-1.5">
                    <span
                      className="shrink-0 rounded-lg border px-2 py-1 text-[10px] font-mono font-black uppercase tracking-wider tabular-nums"
                      style={{
                        borderColor: `${ARENA_THEME.cyan}44`,
                        background: `${ARENA_THEME.cyan}12`,
                        color: ARENA_THEME.cyanMuted,
                      }}
                    >
                      {round.items.length}-lane vote
                    </span>
                    <p className="text-xs sm:text-[13px] text-slate-400 leading-relaxed min-w-0">
                      Each lane card asks a Yes / No prompt.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {ARENA_BATCH_MODE && batchModalRows.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  playArenaUiClick();
                  setBatchModalOpen(true);
                }}
                className="mt-3 w-full text-center rounded-xl py-2.5 px-3 border transition-colors hover:border-intuition-primary/45 hover:bg-intuition-primary/[0.08]"
                style={{
                  borderColor: `${ARENA_THEME.cyan}44`,
                  background: `linear-gradient(135deg, ${ARENA_THEME.cyan}10, rgba(8,8,12,0.85))`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px ${ARENA_THEME.redDim}`,
                }}
              >
                <span className="block text-[11px] font-bold" style={{ color: ARENA_THEME.cyanMuted }}>
                  Review conviction cart ({batchModalRows.length} queued)
                </span>
                <span className="block text-[9px] text-slate-500 mt-1 font-semibold uppercase tracking-wide">
                  TRUST settles when you submit the batch
                </span>
              </button>
            ) : null}
          </div>
          )}

          {loading ? (
            <ArenaPoolSkeleton lanes={ARENA_CONTEST_FLOW_V2 ? 1 : ARENA_CARDS_PER_ROUND} />
          ) : pool.length < minPoolNeeded ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-16 px-4 text-center text-sm text-slate-500">
              <p className="font-semibold text-slate-400">Nothing loaded from the indexer for this contest.</p>
              <p className="mt-2 text-xs text-slate-600">
                GraphQL returned no rows (or the request failed). Try another list or confirm `VITE_GRAPHQL_URL` / network.
              </p>
            </div>
          ) : ARENA_CONTEST_FLOW_V2 && listId ? (
            <div className="w-full min-w-0 py-2 md:py-3">
              {/**
               * Static / off-chain contests can't produce peers or on-chain
               * ranking credit. Surface the "promote on-chain" path right at
               * the top of every step so the user can fix it any time.
               */}
              {activeList && activeList.source !== 'portal' ? (
                <div className="mb-4">
                  <ArenaPromoteBanner
                    listCategory={activeList.arenaCategory}
                    memberCount={pool.length || rankDeckItems.length}
                  />
                </div>
              ) : null}
              {arenaFlowPhase === 'curate' ? (
                <ArenaCurateStack
                  listTitle={activeList?.title ?? '…'}
                  listGlyph={activeList?.listGlyph}
                  listCategory={activeList?.arenaCategory}
                  queue={curateQueue}
                  pool={pool}
                  playerCount={curatePlayerCount}
                  playerCountLoading={activeList?.source === 'portal' && portalListRankerCountLoading}
                  agreedYesCount={curateAgreedYesCount}
                  topLeaderAddress={players[0]?.address ?? null}
                  stakingTx={stakingTx}
                  reduceMotion={reduceMotion}
                  onDecide={onCurateDecide}
                  onSkip={onCurateSkip}
                  onNextToRank={onNextToRankFromCurate}
                />
              ) : arenaFlowPhase === 'rank' ? (
                <ArenaRankDeck
                  items={rankDeckItems}
                  listCategory={activeList?.arenaCategory}
                  stakeBaseLabel={stakeTRUST}
                  rankTrustUnits={rankTrustUnits}
                  onTrustUnitsChange={onRankTrustUnitsChange}
                  reduceMotion={reduceMotion}
                  onReorder={onRankReorder}
                  onRemoveItem={onRankRemoveItem}
                  onCompare={onCompareFromRank}
                  /**
                   * On-chain writes (list promotion, identity mints, membership
                   * triples, rank stakes) finish in one Compare commit. Rank no longer
                   * shows a sign button (`onSignSubmit` omitted on purpose).
                   */
                  signDisabled={stakingTx}
                  queuedStanceCount={rankFlowCartCount}
                  listTitle={activeList?.title}
                  poolParticipantCount={pool.length}
                  listStakersCount={portalListRankerCount}
                  listStakersLoading={portalListRankerCountLoading}
                  deckEngagementTuneCount={deckEngagementTuneCount}
                  onCreateCard={() => {
                    playArenaUiClick();
                    setCreateCardOpen(true);
                  }}
                />
              ) : (
                <ArenaCompareView
                  deck={rankDeckItems}
                  listCategory={activeList?.arenaCategory}
                  peers={comparePeers}
                  peersLoading={comparePeersLoading}
                  listIsOnChain={activeList?.source === 'portal' && Boolean(activeList?.listObjectTermId)}
                  similarityPct={compareSimilarityPct}
                  progressionPct={compareProgressionPct}
                  gamesToTop10Hint={compareGamesToTop10}
                  pendingPromote={Boolean(activeList && activeList.source !== 'portal')}
                  pendingCardCount={pendingCardCount}
                  pendingStakeCount={ARENA_BATCH_MODE ? rankFlowCartCount : 0}
                  batchMode={ARENA_BATCH_MODE}
                  isWalletConnected={isConnected}
                  contestTitle={activeList?.title}
                  poolParticipantCount={pool.length}
                  listStakersCount={portalListRankerCount}
                  listStakersLoading={portalListRankerCountLoading}
                  onSubmitAndContinue={beginArenaCommit}
                  onRandomGame={onCompareRandomGame}
                  onPickNextGame={exitToArenaBrowse}
                  onOpenConvictionCart={() => {
                    playArenaUiClick();
                    setBatchModalOpen(true);
                  }}
                  onOpenSignal={() => {
                    playArenaUiClick();
                    setClimbViewMode('signal');
                  }}
                />
              )}
            </div>
          ) : !round ? (
            <div className="rounded-xl border border-slate-700/60 py-16 text-center bg-slate-900/15">
              <Loader2 className="w-9 h-9 text-cyan-400 animate-spin mx-auto mb-2" />
              <p className="text-slate-500 text-sm">Next item…</p>
            </div>
          ) : (
            <div className="space-y-4 md:space-y-5 w-full mx-auto lg:mx-0">
              <div
                className="relative w-full overflow-hidden rounded-2xl border border-white/[0.1] backdrop-blur-xl"
                style={{
                  background: ARENA_THEME.signalBrowseWell,
                  boxShadow: `${ARENA_THEME.signalBrowseWellShadow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
                }}
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-1"
                  aria-hidden
                  style={{ background: ARENA_THEME.rimBar }}
                />
                <div className="relative z-10 p-4 sm:p-5 md:p-6 pb-4 sm:pb-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-[11px] font-semibold text-slate-500 md:mb-5">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shadow-[0_0_12px_rgba(0,243,255,0.9)]"
                        style={{ background: ARENA_THEME.cyan, boxShadow: `0 0 14px ${ARENA_THEME.cyan}66` }}
                      />
                      <span className="text-slate-300 tabular-nums">Round {duels + 1}</span>
                      {streakTier.label ? (
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-sans font-black normal-case text-white ${streakTier.className}`}>
                          <Flame size={10} />
                          {streakTier.label} ×{streak}
                        </span>
                      ) : null}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-intuition-primary/90 tabular-nums">
                      <Zap size={12} className="text-intuition-primary" />
                      +{xpPickPreview} XP
                      {round.items.length > 1 ? (
                        <span className="ml-1.5 rounded-md bg-white/[0.06] px-2 py-0.5 font-sans tabular-nums normal-case tracking-normal text-[9px] text-slate-400">
                          {round.items.length} up
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div className={`grid w-full items-stretch ${arenaVoteLaneGridClasses(round.items.length)}`}>
                    <div className="contents">
                      {round.items.map((item, slotIdx) => (
                        <ArenaLaneCard
                          key={`arena-lane-${item.id}`}
                          item={item}
                          activeList={activeList ?? undefined}
                          stakingTx={stakingTx}
                          reduceMotion={reduceMotion}
                          emphasized={round.items.length >= 3 ? slotIdx === 1 : round.items.length === 1}
                          marketHref={itemHref(item)}
                          laneIndex={slotIdx}
                          lanesInRound={round.items.length}
                          xpRoundTotal={xpPickPreview}
                          onYesNo={(support) => onYesNo(item, support)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 md:mt-7 flex flex-col items-center gap-3 md:gap-4 pb-1">
                    <button
                      type="button"
                      onClick={onSkip}
                      disabled={stakingTx}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white hover:border-cyan-400/35 hover:shadow-[0_0_18px_rgba(248,113,113,0.12)] transition-colors active:scale-[0.98] disabled:opacity-50"
                    >
                      <SkipForward size={14} />
                      Skip
                    </button>
                    <XpEarnHint variant="arena" presentation="arena-deck" className="w-full max-w-2xl mx-auto" />
                  </div>
                </div>
              </div>
            </div>
          )}
          <ArenaClimbTerrace
            queuedBatchCount={ARENA_BATCH_MODE ? batchModalRows.length : 0}
            onReviewBatch={
              ARENA_BATCH_MODE
                ? () => {
                    playArenaUiClick();
                    setBatchModalOpen(true);
                  }
                : undefined
            }
          />
                </>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Legacy bottom leaderboard (disabled); use ArenaRankerLeaderboard instead. */}
        {false && (
        <motion.section
          className="relative mt-8 md:mt-10 w-full min-w-0 overflow-hidden rounded-3xl border-2 border-fuchsia-500/30 bg-[#020814] shadow-[0_0_100px_rgba(168,85,247,0.14),0_0_1px_rgba(34,211,238,0.35),inset_0_1px_0_rgba(255,255,255,0.07)] transition-[box-shadow] duration-500 hover:shadow-[0_0_120px_rgba(168,85,247,0.2),0_0_1px_rgba(34,211,238,0.45),inset_0_1px_0_rgba(255,255,255,0.09)]"
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] opacity-[0.06]" />
          <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-amber-400/12 blur-[110px]" />
          <div className="pointer-events-none absolute right-0 bottom-0 h-56 w-56 rounded-full bg-cyan-400/12 blur-[100px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/40 to-transparent" />
          <div className="relative z-10 p-5 sm:p-7 md:p-10">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-6 md:mb-8 pb-6 md:pb-8 border-b border-slate-700/80">
              <div className="flex items-start gap-4 min-w-0">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-400/35 to-fuchsia-700/25 border border-amber-300/50 shadow-[0_0_32px_rgba(251,191,36,0.25),inset_0_1px_0_rgba(255,255,255,0.2)] shrink-0">
                  <Medal size={26} className="text-amber-100 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                </div>
                <div className="min-w-0 text-center lg:text-left mx-auto lg:mx-0 max-w-xl lg:max-w-none">
                  <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.45em] text-fuchsia-300 mb-2.5 drop-shadow-[0_0_16px_rgba(217,70,239,0.5)]">
                    Worldwide ladder
                  </p>
                  <h2 className="text-[1.65rem] sm:text-3xl md:text-[2.65rem] font-black font-display uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-white to-cyan-200 leading-[1.05] drop-shadow-[0_2px_28px_rgba(255,255,255,0.14)]">
                    Arena champions
                  </h2>
                  <div className="h-[3px] w-24 mx-auto lg:mx-0 mt-3 rounded-full bg-gradient-to-r from-amber-400 via-fuchsia-500 to-cyan-400 opacity-95 shadow-[0_0_16px_rgba(217,70,239,0.35)]" />
                  <p className="text-sm md:text-[15px] text-slate-400 mt-4 leading-relaxed max-w-xl lg:max-w-2xl">
                    Arena points (play + optional TRUST per pick). Not a truth score.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3.5 rounded-2xl border border-amber-400/35 bg-gradient-to-br from-slate-950/95 via-[#0a101c]/95 to-slate-950/95 px-5 py-3.5 shrink-0 backdrop-blur-sm shadow-[0_0_28px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] mx-auto lg:mx-0">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-400/30">
                  <Trophy size={22} className="text-amber-300 shrink-0 drop-shadow-[0_0_10px_rgba(251,191,36,0.4)]" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200/90 font-black">On the board</div>
                  <div className="text-2xl font-black text-white tabular-nums leading-none mt-1 drop-shadow-[0_0_12px_rgba(255,255,255,0.08)]">
                    {playersLoading ? '…' : players.length}
                  </div>
                </div>
              </div>
            </div>

            {!playersLoading && players.length > 0 && myLadderPosition && (
              <motion.div
                key={address ?? 'anon'}
                className="mb-6 rounded-3xl border border-cyan-500/35 bg-gradient-to-r from-cyan-500/[0.08] via-slate-900/80 to-fuchsia-600/[0.06] px-4 py-3.5 text-center sm:text-left shadow-[0_0_28px_rgba(34,211,238,0.1)] transition-shadow duration-300 hover:shadow-[0_0_36px_rgba(34,211,238,0.16)]"
                initial={false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              >
                <p className="text-sm text-slate-200 font-semibold">
                  <span className="text-cyan-300 font-black tabular-nums">#{myLadderPosition.place}</span>
                  <span className="text-slate-500 font-normal mx-1">of</span>
                  <span className="text-white font-black tabular-nums">{myLadderPosition.total}</span>
                  <span className="text-slate-400 font-normal ml-2">Keep ranking to move up.</span>
                </p>
              </motion.div>
            )}

            {playersLoading ? (
              <div className="flex flex-col items-center justify-center py-20 md:py-28 gap-3">
                <Loader2 className="w-12 h-12 text-fuchsia-400 animate-spin" />
                <span className="text-xs text-slate-500">Loading…</span>
              </div>
            ) : players.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/40 py-16 md:py-20 text-center px-4">
                <Sparkles className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
                  Connect, pick, and stake TRUST to show up here.
                </p>
              </div>
            ) : (
              <>
                {players.length >= 3 && (
                  <div className="flex justify-center items-end gap-4 sm:gap-8 mb-10 max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-2">
                    {[
                      { idx: 1, h: 'h-16', ring: 'from-slate-200/55 to-slate-500/45', label: '2nd' },
                      { idx: 0, h: 'h-28', ring: 'from-amber-200/70 to-amber-600/50', label: '1st', showCrown: true },
                      { idx: 2, h: 'h-12', ring: 'from-amber-600/50 to-orange-900/50', label: '3rd' },
                    ].map((slot) => {
                      const { idx, h, ring, label, showCrown } = slot;
                      const p = players[idx]!;
                      const isYou = address && p.address === address.toLowerCase();
                      const xpPct = Math.min(100, Math.round((inturankLeaderboardTotalXp(p) / playersMaxXp) * 100));
                      return (
                        <motion.div
                          key={p.address}
                          className="flex flex-col items-center flex-1 max-w-[200px] sm:max-w-[220px]"
                          whileHover={reduceMotion ? undefined : { y: -6, transition: { type: 'spring', stiffness: 380, damping: 22 } }}
                        >
                          <div
                            className={`flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${idx === 0 ? 'text-amber-200' : 'text-slate-400'}`}
                          >
                            {showCrown ? (
                              <Crown size={15} className="text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                            ) : null}
                            {label}
                          </div>
                          <div
                            className={`w-full rounded-t-3xl bg-gradient-to-b ${ring} p-[3px] shadow-xl ${idx === 0 ? 'shadow-[0_0_40px_rgba(251,191,36,0.25)]' : 'shadow-black/50'}`}
                          >
                            <div
                              className={`rounded-t-[1.15rem] bg-gradient-to-b from-[#0c1520] to-[#060a10] ${h} flex flex-col items-center justify-end pb-2.5 px-2 border-b border-white/10`}
                            >
                              <span className="text-sm font-mono text-amber-100 tabular-nums font-black drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]">
                                {inturankLeaderboardTotalXp(p)}
                              </span>
                              <span className="text-[9px] text-amber-400/90 uppercase tracking-widest font-bold font-mono">Total XP</span>
                              <span className="text-[9px] text-slate-400 font-mono font-semibold mt-1">{p.duels} picks</span>
                            </div>
                          </div>
                          <div className="mt-3 text-center w-full min-w-0 px-1">
                            <div className="text-[12px] font-bold text-slate-100 truncate drop-shadow-sm">
                              {isYou ? <span className="text-cyan-300">You · </span> : null}
                              {p.label}
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-slate-800/90 overflow-hidden ring-1 ring-white/5">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-fuchsia-500 to-cyan-400 shadow-[0_0_10px_rgba(251,191,36,0.35)]"
                                style={{ width: `${xpPct}%` }}
                              />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                <div className="mx-auto w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
                  <ol
                    className={`flex flex-col gap-2 sm:gap-2.5 max-h-[min(560px,62vh)] overflow-y-auto pr-1 custom-scrollbar ${
                      players.length > 5 ? 'sm:grid sm:grid-cols-2 sm:flex-none sm:gap-x-3 sm:gap-y-2.5' : ''
                    }`}
                  >
                    {players.map((p, rowIdx) => {
                      const isYou = address && p.address === address.toLowerCase();
                      const xpPct = Math.min(100, Math.round((inturankLeaderboardTotalXp(p) / playersMaxXp) * 100));
                      const top = p.rank <= 3;
                      const tier = arenaCombatTier(inturankLeaderboardTotalXp(p));
                      const avgPick = p.duels > 0 ? Math.round(p.arenaXp / p.duels) : p.arenaXp;
                      const shortAddr = `${p.address.slice(0, 6)}…${p.address.slice(-4)}`;
                      const rankColor =
                        p.rank === 1
                          ? 'text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,0.35)]'
                          : p.rank === 2
                            ? 'text-slate-200'
                            : p.rank === 3
                              ? 'text-orange-300/95'
                              : 'text-slate-500';
                      return (
                        <motion.li
                          key={p.address}
                          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.35,
                            delay: reduceMotion ? 0 : Math.min(rowIdx, 20) * 0.03,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className="flex items-stretch gap-2 sm:gap-3 min-w-0"
                          aria-label={`Rank ${p.rank}`}
                        >
                          <div
                            className="shrink-0 w-8 sm:w-9 flex flex-col items-center justify-start pt-2 sm:pt-2.5 select-none"
                            aria-hidden
                          >
                            <span className={`text-xl sm:text-2xl font-black tabular-nums leading-none ${rankColor}`}>
                              {p.rank}
                            </span>
                          </div>
                          <div
                            className={`group relative flex min-w-0 flex-1 flex-col rounded-2xl sm:rounded-3xl px-3 py-2.5 sm:px-3.5 sm:py-3 text-[13px] transition-all duration-300 ease-out hover:-translate-y-0.5 ${
                              isYou
                                ? 'bg-gradient-to-br from-cyan-500/[0.12] via-slate-950/95 to-slate-950 border border-cyan-400/50 shadow-[0_0_28px_rgba(34,211,238,0.18),inset_0_1px_0_rgba(255,255,255,0.06)] hover:shadow-[0_0_40px_rgba(34,211,238,0.22)]'
                                : top
                                  ? 'bg-gradient-to-br from-amber-500/[0.08] via-[#0b1018]/98 to-slate-950/98 border border-amber-400/35 hover:border-amber-300/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:shadow-[0_12px_36px_rgba(245,158,11,0.08)]'
                                  : 'border border-slate-700/65 bg-slate-950/95 hover:border-slate-500/55 hover:bg-slate-900/95 hover:shadow-[0_10px_32px_rgba(0,0,0,0.45)]'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="relative h-10 w-10 shrink-0 rounded-2xl overflow-hidden ring-1 ring-white/15 bg-gradient-to-br from-slate-800 to-slate-950 shadow-inner">
                                <ArenaPortraitImg src={p.image} className="h-full w-full object-cover">
                                  <div className="h-full w-full flex items-center justify-center text-sm font-black text-cyan-200/90">
                                    {leaderboardAvatarGlyph(p.label)}
                                  </div>
                                </ArenaPortraitImg>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
                                  {isYou && (
                                    <span className="text-[8px] font-black uppercase tracking-wider text-cyan-950 shrink-0 px-1.5 py-0.5 rounded bg-cyan-400/90 border border-cyan-200/50">
                                      You
                                    </span>
                                  )}
                                  <span className="text-white font-semibold text-sm sm:text-[15px] leading-snug truncate">
                                    {p.label}
                                  </span>
                                  <span
                                    className={`shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${tier.chip}`}
                                  >
                                    {tier.label}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-[11px]">
                                  <span className="inline-flex items-center gap-1 text-slate-300">
                                    <Activity size={12} className="text-cyan-400 shrink-0" />
                                    <span className="font-mono tabular-nums font-bold text-white">{p.duels}</span>
                                    <span className="text-slate-400 font-medium">duels</span>
                                  </span>
                                  <span className="text-slate-600">·</span>
                                  <span className="text-slate-300">
                                    <span className="text-amber-300 font-mono tabular-nums font-bold">{avgPick}</span>{' '}
                                    <span className="text-slate-500 font-medium">XP/pick</span>
                                  </span>
                                  <span className="text-slate-600">·</span>
                                  <span className="inline-flex items-center gap-1 text-slate-300">
                                    <Clock size={11} className="text-fuchsia-400/80 shrink-0" />
                                    <span className="font-medium text-slate-200">{formatRelativeArenaActive(p.updatedAt)}</span>
                                  </span>
                                </div>
                                <p className="text-[9px] text-slate-500 font-mono mt-1.5 truncate tracking-wide">{shortAddr}</p>
                              </div>
                              <div className="shrink-0 text-right pl-1">
                                <span className="font-mono text-lg sm:text-xl tabular-nums font-black leading-none text-transparent bg-clip-text bg-gradient-to-b from-amber-200 to-amber-500">
                                  {inturankLeaderboardTotalXp(p)}
                                </span>
                                <div className="text-[8px] text-amber-400/90 uppercase tracking-[0.15em] font-bold mt-0.5">
                                  Total XP
                                </div>
                              </div>
                            </div>
                            <div className="mt-2.5 h-2.5 rounded-full bg-slate-900/95 overflow-hidden ring-1 ring-slate-700/70 shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)]">
                              <motion.div
                                className={`h-full rounded-full ${
                                  isYou
                                    ? 'bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-fuchsia-600'
                                    : 'bg-gradient-to-r from-amber-400 via-fuchsia-500 to-cyan-400'
                                }`}
                                initial={false}
                                animate={{ width: `${xpPct}%` }}
                                transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                              />
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </ol>
                </div>
              </>
            )}
          </div>
        </motion.section>
        )}
        </div>
        </div>
      )}

      {ARENA_BATCH_MODE && listId && (
        <ArenaBatchReviewModal
          open={batchModalOpen}
          onClose={() => {
            setBatchModalOpen(false);
            /**
             * Close without signing: stop the commit chain so we do not
             * auto-advance past the contest.
             */
            if (commitPhase === 'rank-batch') {
              setCommitPhase('idle');
            }
          }}
          themeShort={batchModalHeader.themeShort}
          contextSuffix={batchModalHeader.contextSuffix}
          stakeLabel={stakeTRUST}
          rows={batchModalRowsLabeled}
          onUpdateUnits={updatePendingUnits}
          onToggleSupport={togglePendingSupport}
          onRemove={removePendingRow}
          onClearAll={clearAllArenaBatch}
          onSubmit={() => void submitArenaBatch()}
          submitting={stakingTx}
          submitProgress={submitProgress}
          depositBlocked={batchDepositBelowProtocol}
          minDepositLabel={ARENA_BATCH_MODE ? PROTOCOL_MIN_CLAIM_DEPOSIT_LABEL : undefined}
        />
      )}

      <ArenaBatchSuccessModal
        open={arenaBatchSuccess != null}
        payload={arenaBatchSuccess}
        onClose={() => {
          setArenaBatchSuccess(null);
          /**
           * Dismissing batch success ends the Compare chain: jump back to contests.
           */
          if (commitPhase === 'rank-batch') {
            setCommitPhase('idle');
            exitToArenaBrowse();
          }
        }}
      />

      <style>{`
        @keyframes arena-row-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .arena-sidebar-row {
          animation: arena-row-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .arena-sidebar-row {
            animation: none !important;
          }
          .arena-yesno-scanline,
          .arena-stake-top-glow,
          .arena-stake-track-inner--pulse,
          .arena-stake-fill-bar--animated,
          .arena-stake-track-shell--animated {
            animation: none !important;
          }
          .arena-stake-range::-webkit-slider-thumb,
          .arena-stake-range::-moz-range-thumb {
            animation: none !important;
          }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15,23,42,0.5); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(34,211,238,0.25); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(34,211,238,0.45); }
        @keyframes arena-stake-top-pulse {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 1; }
        }
        @keyframes arena-yesno-scan {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .arena-yesno-scanline {
          animation: arena-yesno-scan 2.4s ease-in-out infinite;
        }
        .arena-xp-roll {
          text-shadow: 0 0 20px rgba(251, 191, 36, 0.22);
        }
        .arena-stake-top-glow {
          animation: arena-stake-top-pulse 2.8s ease-in-out infinite;
        }
        @keyframes arena-stake-track-pulse {
          0%, 100% {
            box-shadow: inset 0 4px 14px rgba(0,0,0,0.78), 0 0 0 1px rgba(34,211,238,0.35), 0 0 18px rgba(34,211,238,0.12);
          }
          50% {
            box-shadow: inset 0 4px 14px rgba(0,0,0,0.78), 0 0 0 1px rgba(34,211,238,0.55), 0 0 28px rgba(34,211,238,0.28), 0 0 40px rgba(168,85,247,0.12);
          }
        }
        .arena-stake-track-inner--pulse {
          animation: arena-stake-track-pulse 2.4s ease-in-out infinite;
        }
        @keyframes arena-stake-fill-sweep {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes arena-stake-fill-glow {
          0%, 100% {
            filter: brightness(1);
            box-shadow: 0 0 18px rgba(34,211,238,0.4), inset 0 1px 0 rgba(255,255,255,0.22);
          }
          50% {
            filter: brightness(1.12);
            box-shadow: 0 0 32px rgba(34,211,238,0.55), 0 0 24px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.28);
          }
        }
        .arena-stake-fill-bar {
          box-shadow: 0 0 18px rgba(34,211,238,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
          background: linear-gradient(90deg, #22d3ee, #38bdf8 35%, #c084fc 70%, #d946ef);
          background-size: 100% 100%;
        }
        .arena-stake-fill-bar--animated {
          background-size: 200% 100%;
          animation: arena-stake-fill-sweep 4s linear infinite, arena-stake-fill-glow 2.2s ease-in-out infinite;
        }
        @keyframes arena-stake-thumb-float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-3px) scale(1.05); }
        }
        @keyframes arena-stake-shell-glow {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
        .arena-stake-track-shell--animated {
          animation: arena-stake-shell-glow 3s ease-in-out infinite;
        }
        .arena-stake-range {
          -webkit-appearance: none;
          appearance: none;
          height: 3.5rem;
          background: transparent;
          outline: none;
        }
        .arena-stake-range::-webkit-slider-runnable-track {
          height: 14px;
          background: transparent;
          border: none;
        }
        .arena-stake-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 30px;
          height: 30px;
          margin-top: -8px;
          border-radius: 50%;
          background:
            radial-gradient(circle at 30% 25%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.15) 28%, transparent 42%),
            linear-gradient(150deg, #67e8f9 0%, #22d3ee 35%, #a855f7 88%, #c084fc);
          border: 3px solid rgba(255,255,255,0.55);
          box-shadow:
            0 0 0 1px rgba(34,211,238,0.45),
            0 0 32px rgba(34,211,238,0.55),
            0 0 20px rgba(168,85,247,0.35),
            0 5px 14px rgba(0,0,0,0.5),
            inset 0 2px 3px rgba(255,255,255,0.45);
          cursor: grab;
          animation: arena-stake-thumb-float 2.6s ease-in-out infinite;
        }
        .arena-stake-range:hover::-webkit-slider-thumb {
          animation-duration: 1.5s;
        }
        .arena-stake-range::-webkit-slider-thumb:active {
          cursor: grabbing;
          animation: none;
          transform: scale(1.08) translateY(0);
        }
        .arena-stake-range::-moz-range-track {
          height: 14px;
          background: transparent;
          border: none;
        }
        .arena-stake-range::-moz-range-thumb {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.55);
          background: linear-gradient(150deg, #67e8f9, #22d3ee 40%, #a855f7);
          box-shadow: 0 0 28px rgba(34,211,238,0.5), 0 4px 12px rgba(0,0,0,0.45);
          cursor: grab;
          animation: arena-stake-thumb-float 2.6s ease-in-out infinite;
        }
        .arena-stake-range:hover::-moz-range-thumb {
          animation-duration: 1.5s;
        }
        .arena-stake-range::-moz-range-thumb:active {
          animation: none;
          transform: scale(1.08);
        }
      `}</style>

      {/**
       * Promote a static contest to a real Intuition portal list. On success
       * we register the new list with the runtime registry and switch the
       * router to its portal id so the very next render uses real on-chain
       * peers / leaderboard credit.
       */}
      <ArenaPromoteContestModal
        isOpen={promoteContestOpen}
        onClose={() => {
          setPromoteContestOpen(false);
          /**
           * User closed the promote modal before signing → bail out of the
           * commit chain so the Compare CTA stays "Sign + pick next game"
           * rather than silently advancing.
           */
          if (commitPhase === 'promote') {
            setCommitPhase('idle');
          }
        }}
        listCategory={activeList?.arenaCategory}
        contestTitle={activeList?.title ?? 'New contest'}
        contestDescription={activeList && 'description' in activeList ? activeList.description : undefined}
        items={
          /** Prefer the curated pool (broader on-chain canvas); fall back to the user's deck. */
          pool.length > 0
            ? pool.map((p) => ({
                id: p.id,
                label: p.label,
                subtitle: p.subtitle,
                image: p.image,
              }))
            : rankDeckItems.map((p) => ({
                id: p.id,
                label: p.label,
                subtitle: p.subtitle,
                image: p.image,
              }))
        }
        walletAddress={address ?? null}
        isWalletConnected={isConnected}
        onPromoted={(result: ArenaPromoteListResult) => {
          /** Register the freshly minted list so Hub / Compare / portfolio all see it. */
          const arenaCategory = activeList?.arenaCategory ?? 'network';
          const portalId = portalListIdFromTermId(result.listTermId);
          const portalEntry: Extract<ArenaListEntry, { source: 'portal' }> = {
            id: portalId,
            source: 'portal',
            listObjectTermId: result.listTermId,
            title: activeList?.title ?? 'New contest',
            description:
              activeList && 'description' in activeList && activeList.description
                ? activeList.description
                : 'Promoted on-chain · live on the graph',
            tag: 'Live',
            arenaCategory,
            listGlyph: activeList?.listGlyph ?? '◆',
            totalItems: result.members.length,
            previewItemsData: result.members.slice(0, 5).map((m) => {
              const termId = result.memberTermIds.get(m.id);
              return {
                termId: termId ?? undefined,
                label: m.label,
                image: m.image,
              };
            }),
          };
          registerPortalListEntries([portalEntry]);
          registerArenaPortalListTermsForIndexing([result.listTermId]);

          /**
           * Migrate the queued batch rows from the (old) static list id to the
           * new portal id so the existing batch flow can deposit straight to
           * the freshly-minted membership triples.
           */
          const oldListId = listId;
          if (oldListId && oldListId !== portalId) {
            try {
              const rows = loadPendingForList(oldListId);
              if (rows.length > 0) savePendingForList(portalId, rows);
              clearPendingForList(oldListId);
            } catch (e) {
              console.error('arena: failed to migrate pending batch rows', e);
            }
          }

          setPromoteContestOpen(false);
          toast.success(`"${portalEntry.title}" is live on-chain.`);

          /**
           * Promote-only exits here. Mid-commit replaces URL/listId and continues to rank-batch
           * so signing stays one flow.
           */
          if (commitPhase !== 'promote') {
            navigate(`/climb?list=${encodeURIComponent(portalId)}`);
            return;
          }

          /** Stay on Compare; update URL + listId so the page picks up portal data. */
          navigate(`/climb?list=${encodeURIComponent(portalId)}`, { replace: true });
          setListId(portalId);

          const hasQueuedStakes = ARENA_BATCH_MODE && oldListId
            ? loadPendingForList(portalId).length > 0
            : false;
          if (hasQueuedStakes) {
            setCommitPhase('rank-batch');
            /** Wait a tick so the listId state propagates before the batch modal reads it. */
            setTimeout(() => setBatchModalOpen(true), 60);
          } else {
            setCommitPhase('idle');
            toast.info('Contest minted. Run another round to stake on the new list.');
          }
        }}
      />

      {/**
       * Create card on-chain (Identity mint). New item id is the graph `termId`.
       */}
      <ArenaCreateCardModal
        isOpen={createCardOpen}
        onClose={() => setCreateCardOpen(false)}
        listCategory={activeList?.arenaCategory}
        listTitle={activeList?.title}
        existingItems={rankDeckItems}
        onSubmit={(item) => {
          setRankDeckItems((prev) => [...prev, item]);
          setRankTrustUnits((prev) => ({ ...prev, [item.id]: 1 }));
          toast.success(`"${item.label}" added. Will mint on-chain when you submit.`);
        }}
      />
    </div>
  );
};

export default RankedList;
