/**
 * Fetch on-chain rankings for a portal list (community browse / compare).
 */
import { getAddress } from 'viem';
import type { ArenaComparePeer } from './arenaSimilarity';
import type { ArenaPlayerRow } from './arenaLeaderboard';
import {
  buildArenaRankingClaimsForReceivers,
  discoverPortalListRankerReceiversFromDeposits,
  fetchArenaCompareGraphBundle,
  fetchDistinctRankingCreatorsForPortalList,
} from './graphql';
import {
  buildPortalListRankingByAccumulatedTrust,
  computeArenaListSimilarity,
} from './arenaSimilarity';
import type { RankItem } from './arenaTypes';

export async function fetchPortalListCommunityRankings(opts: {
  listObjectTermId: string;
  listId: string;
  myAddress?: string | null;
  players: ArenaPlayerRow[];
  /** When set, similarity is computed vs this deck (compare step). */
  myDeck?: RankItem[];
  maxPeers?: number;
  /** Extra wallets to merge (e.g. Arena ranking feed) — same discovery path as Compare. */
  seedWallets?: string[];
  /** Spotlight: keep the viewer in the peer set (Compare excludes self from browse). */
  includeSelf?: boolean;
}): Promise<ArenaComparePeer[]> {
  const {
    listObjectTermId,
    myAddress,
    players,
    myDeck = [],
    maxPeers = 22,
    seedWallets = [],
    includeSelf = false,
  } = opts;
  const myLower = (myAddress ?? '').toLowerCase();

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
      giftXp: 0,
      duels: 0,
      atomsRanked: 0,
      listsPlayed: 0,
      updatedAt: 0,
    };
  };

  const lb = players
    .filter((p) => p.address && p.address.toLowerCase() !== myLower)
    .slice(0, 8)
    .map((p) => p.address);

  const peerCap = Math.min(Math.max(maxPeers, 22), 80);
  const creatorScan = Math.min(Math.max(peerCap * 3, 48), 200);

  const [bundle, fromList] = await Promise.all([
    fetchArenaCompareGraphBundle(),
    fetchDistinctRankingCreatorsForPortalList(listObjectTermId, myAddress ?? undefined, creatorScan),
  ]);

  let fromDeposits: string[] = [];
  if (bundle) {
    fromDeposits = discoverPortalListRankerReceiversFromDeposits(
      listObjectTermId,
      myAddress ?? undefined,
      Math.min(peerCap + 24, 80),
      bundle.deposits,
      bundle.stanceByVault,
    );
  }

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const w of [...seedWallets, ...fromDeposits, ...fromList, ...lb]) {
    const lc = w.toLowerCase();
    if (!lc || seen.has(lc)) continue;
    if (!includeSelf && lc === myLower) continue;
    seen.add(lc);
    merged.push(w);
    if (merged.length >= peerCap) break;
  }

  if (merged.length === 0 || !bundle) return [];

  const { deposits, stanceByVault, allow } = bundle;
  const claimsByWallet = buildArenaRankingClaimsForReceivers(
    merged,
    deposits,
    stanceByVault,
    allow,
  );

  const results: ArenaComparePeer[] = merged.map((wallet) => {
    const walletKey = wallet.toLowerCase();
    const claims = claimsByWallet.get(walletKey) ?? [];
    const sim =
      myDeck.length > 0
        ? computeArenaListSimilarity(myDeck, claims, listObjectTermId)
        : null;
    const listRanking = buildPortalListRankingByAccumulatedTrust(
      wallet,
      listObjectTermId,
      claims,
      deposits,
      stanceByVault,
    );
    return {
      player: syntheticRow(wallet),
      claims,
      similarity: sim ?? {
        similarityPct: 0,
        sharedCount: 0,
        agreeCount: 0,
        disagreeCount: 0,
        sharedSubjects: [],
      },
      listRanking,
    };
  });

  return results
    .filter((r) => r.listRanking.length > 0)
    .sort((a, b) => b.listRanking.length - a.listRanking.length);
}
