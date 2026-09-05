/**
 * IntuRank Badge System — Gamified profile ranks.
 *
 * Tiers are **percentile bands of the leaderboard**, not fixed rank slots:
 *   Apex   top 1%    ·  Elite  top 10%    ·  Rising  top 33%    ·  Scout  everyone else
 *
 * The previous model hard-coded `rank<=1 apex / <=2 elite / <=3 rising`, which meant only
 * three people on the whole network could ever hold anything above Scout — no visible
 * progress for anyone else, and no way to express "you are N places from the next tier".
 * Bands scale with the population, always have a meaningful number of holders, and give
 * every player a reachable next step.
 *
 * Cutoffs are computed per leaderboard, so a rank is only ever compared against the board
 * it came from (comparing raw rank numbers across boards of different sizes is meaningless).
 */
import { getPnlLeaderboardPeriodAccount, buildPnlLeaderboardPeriodArgs } from './graphql';
import { getTopPositions } from './graphql';
import { formatEther } from 'viem';
import { getResolvedSeason2EpochForNow } from '../constants';

const normalize = (x: string) => (x ? x.toLowerCase() : '');

export type BadgeTier = 'apex' | 'elite' | 'rising' | 'scout';

export const BADGE_NAMES: Record<BadgeTier, string> = {
  apex: 'Apex',
  elite: 'Elite',
  rising: 'Rising',
  scout: 'Scout',
};

export const BADGE_COLORS: Record<BadgeTier, string> = {
  apex: 'amber',
  elite: 'slate',
  rising: 'amber',
  scout: 'slate',
};

/** Ascending, so index + 1 gives the "tier N of 4" the profile shows. */
export const BADGE_TIER_ORDER: readonly BadgeTier[] = ['scout', 'rising', 'elite', 'apex'];

/** Share of the leaderboard each tier occupies, best first. */
const TIER_PERCENTILES: ReadonlyArray<{ tier: BadgeTier; share: number }> = [
  { tier: 'apex', share: 0.01 },
  { tier: 'elite', share: 0.1 },
  { tier: 'rising', share: 0.33 },
];

/**
 * Inclusive rank cutoff for each tier on a board of `population` players.
 * Each band is forced at least one rank wider than the one above it, so tiny boards still
 * resolve to distinct tiers instead of collapsing into a single bucket.
 */
export function getTierCutoffs(population: number): Record<'apex' | 'elite' | 'rising', number> {
  const n = Math.max(1, Math.floor(population));
  let previous = 0;
  const out = {} as Record<'apex' | 'elite' | 'rising', number>;
  for (const { tier, share } of TIER_PERCENTILES) {
    const cutoff = Math.max(previous + 1, Math.round(n * share));
    out[tier as 'apex' | 'elite' | 'rising'] = cutoff;
    previous = cutoff;
  }
  return out;
}

/** Tier for `rank` on a board of `population` players. Rank is 1-based. */
export function getTierForRank(rank: number, population: number): BadgeTier {
  if (!Number.isFinite(rank) || rank < 1) return 'scout';
  const cutoffs = getTierCutoffs(population);
  if (rank <= cutoffs.apex) return 'apex';
  if (rank <= cutoffs.elite) return 'elite';
  if (rank <= cutoffs.rising) return 'rising';
  return 'scout';
}

/** 1-based position in {@link BADGE_TIER_ORDER} — Scout is 1, Apex is 4. */
export function getTierIndex(tier: BadgeTier): number {
  return BADGE_TIER_ORDER.indexOf(tier) + 1;
}

/**
 * The next tier up and how many places must be climbed to reach it.
 * Returns null at Apex, where there is nothing above.
 */
export function getNextTierTarget(
  rank: number,
  population: number,
): { tier: BadgeTier; rankNeeded: number; placesToClimb: number } | null {
  const current = getTierForRank(rank, population);
  if (current === 'apex') return null;
  const next = BADGE_TIER_ORDER[getTierIndex(current)];
  if (!next || next === 'scout') return null;
  const rankNeeded = getTierCutoffs(population)[next as 'apex' | 'elite' | 'rising'];
  return { tier: next, rankNeeded, placesToClimb: Math.max(0, rank - rankNeeded) };
}

export interface LeaderboardRank {
  leaderboard: string;
  rank: number;
  /** Size of the board this rank came from — the denominator for the tier band. */
  population: number;
  tier: BadgeTier;
}

export interface UserBadges {
  bestTier: BadgeTier;
  bestRank: number | null;
  /** Population of the board `bestRank` came from. */
  bestPopulation: number | null;
  /** 1..4, for "Tier 2 of 4" style display. */
  tierIndex: number;
  /** Next tier up on the best board, or null at Apex / with no ranking at all. */
  nextTier: BadgeTier | null;
  /** Places to climb on the best board to reach `nextTier`. */
  placesToNextTier: number | null;
  ranks: LeaderboardRank[];
}

/** Fetches the user's rank across leaderboards. Returns best tier, its band, and all ranks. */
export async function getUserLeaderboardRanks(address: string): Promise<UserBadges> {
  const addr = normalize(address);
  const ranks: LeaderboardRank[] = [];

  // 1. PnL Season 2 (current epoch)
  const currentEpoch = getResolvedSeason2EpochForNow();
  try {
    const args = buildPnlLeaderboardPeriodArgs(currentEpoch.start, currentEpoch.end);
    const pnl = await getPnlLeaderboardPeriodAccount(address, args);
    if (pnl?.row?.rank != null) {
      const rank = Number(pnl.row.rank);
      ranks.push({
        leaderboard: `PnL · ${currentEpoch.label}`,
        rank,
        population: pnl.total,
        tier: getTierForRank(rank, pnl.total),
      });
    }
  } catch {
    // ignore
  }

  // 2. Top stakers (global)
  try {
    const positions = await getTopPositions(1500);
    const userMap = new Map<string, number>();
    positions.forEach((pos: any) => {
      const accId = pos.account_id;
      if (!accId) return;
      const shares = BigInt(pos.shares || '0');
      const vaultAssets = BigInt(pos.vault?.total_assets || '0');
      const vaultShares = BigInt(pos.vault?.total_shares || '1');
      const valueWei = vaultShares > 0n ? (shares * vaultAssets) / vaultShares : 0n;
      const valueEth = parseFloat(formatEther(valueWei));
      const current = userMap.get(accId) || 0;
      userMap.set(accId, current + valueEth);
    });
    const sorted = Array.from(userMap.entries()).sort((a, b) => b[1] - a[1]);
    const idx = sorted.findIndex(([id]) => normalize(id) === addr);
    if (idx >= 0) {
      ranks.push({
        leaderboard: 'Top Stakers',
        rank: idx + 1,
        population: sorted.length,
        tier: getTierForRank(idx + 1, sorted.length),
      });
    }
  } catch {
    // ignore
  }

  // Best = highest tier; ties broken by percentile, since a rank only means something
  // relative to the size of the board it came from.
  const best =
    ranks.length > 0
      ? ranks.reduce((a, b) => {
          const byTier = getTierIndex(b.tier) - getTierIndex(a.tier);
          if (byTier !== 0) return byTier > 0 ? b : a;
          return b.rank / Math.max(1, b.population) < a.rank / Math.max(1, a.population) ? b : a;
        })
      : null;

  const bestTier = best?.tier ?? 'scout';
  const next = best ? getNextTierTarget(best.rank, best.population) : null;

  return {
    bestTier,
    bestRank: best?.rank ?? null,
    bestPopulation: best?.population ?? null,
    tierIndex: getTierIndex(bestTier),
    nextTier: next?.tier ?? null,
    placesToNextTier: next?.placesToClimb ?? null,
    ranks,
  };
}
