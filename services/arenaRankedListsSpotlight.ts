/**
 * Spotlight catalog — same rankers as Arena Compare + Ranking Pulse feed (graph-backed).
 */
import { getAddress } from 'viem';
import type { ArenaComparePeer, RankItem } from '../pages/RankedList';
import { fetchPortalListCommunityRankings } from './arenaCommunityRankings';
import { enrichPeersWithPool } from './arenaRankingEnrich';
import { fetchArenaPlayerLeaderboard, type ArenaPlayerRow } from './arenaLeaderboard';
import type { PortalListRankRow } from './arenaSimilarity';
import {
  fetchArenaCompareGraphBundle,
  fetchDistinctRankingCreatorsForPortalList,
  fetchDistinctReceiversForPortalListFromProxyDeposits,
  fetchRecentArenaPortalRankingFeed,
  getListMemberSubjectsForObject,
  portalListStanceMatchesListObject,
  type ArenaPortalRankingFeedItem,
} from './graphql';
import { communityRankingsFromPeers } from './arenaRankingRemix';
import { resolveRankerDisplayLabels } from './tns';

export type SpotlightPortalList = {
  id: string;
  title: string;
  listObjectTermId: string;
  arenaCategory?: string;
};

export type RankedListSpotlightEntry = {
  listId: string;
  listTitle: string;
  listObjectTermId: string;
  arenaCategory?: string;
  peer: ArenaComparePeer;
  pickCount: number;
  previewPool: RankItem[];
  rankerLabel: string;
};

export type SpotlightRankerGroup = {
  address: string;
  rankerLabel: string;
  lists: RankedListSpotlightEntry[];
  totalPicks: number;
  maxArenaXp: number;
};

function normalizeWallet(raw: string): string | null {
  try {
    return getAddress(raw.trim() as `0x${string}`).toLowerCase();
  } catch {
    const lc = raw.trim().toLowerCase();
    return lc.startsWith('0x') && lc.length >= 10 ? lc : null;
  }
}

function feedRowsForList(
  listObjectTermId: string,
  feed: ArenaPortalRankingFeedItem[],
): ArenaPortalRankingFeedItem[] {
  return feed.filter((row) => portalListStanceMatchesListObject(row.listTermId, listObjectTermId));
}

/** Discover every wallet IntuRank knows ranked this list (feed + deposits + triple creators). */
async function discoverAllRankerWalletsForList(
  listObjectTermId: string,
  myAddress: string | null | undefined,
  feed: ArenaPortalRankingFeedItem[],
  players: ArenaPlayerRow[],
): Promise<string[]> {
  const seen = new Set<string>();
  const add = (w: string) => {
    const lc = normalizeWallet(w);
    if (!lc || seen.has(lc)) return;
    seen.add(lc);
  };

  for (const row of feedRowsForList(listObjectTermId, feed)) {
    add(row.creatorId);
  }

  const [fromDeposits, fromTriples] = await Promise.all([
    fetchDistinctReceiversForPortalListFromProxyDeposits(listObjectTermId, myAddress ?? undefined, 120),
    fetchDistinctRankingCreatorsForPortalList(listObjectTermId, myAddress ?? undefined, 120),
  ]);
  for (const w of fromDeposits) add(w);
  for (const w of fromTriples) add(w);
  for (const p of players) {
    if (p.address) add(p.address);
  }

  return [...seen].map((lc) => {
    try {
      return getAddress(lc as `0x${string}`);
    } catch {
      return lc;
    }
  });
}

/** Ranking Pulse rows → peer when deposit bundle hasn't indexed them yet (same humans as Compare UI). */
function buildPeersFromFeedForList(
  list: SpotlightPortalList,
  feed: ArenaPortalRankingFeedItem[],
  players: ArenaPlayerRow[],
): ArenaComparePeer[] {
  const rows = feedRowsForList(list.listObjectTermId, feed);
  if (rows.length < 1) return [];

  const playerByAddr = new Map<string, ArenaPlayerRow>();
  for (const p of players) {
    if (p.address) playerByAddr.set(p.address.toLowerCase(), p);
  }

  const byWallet = new Map<string, ArenaPortalRankingFeedItem[]>();
  for (const row of rows) {
    const lc = normalizeWallet(row.creatorId);
    if (!lc) continue;
    const bucket = byWallet.get(lc) ?? [];
    bucket.push(row);
    byWallet.set(lc, bucket);
  }

  const peers: ArenaComparePeer[] = [];
  for (const [walletLc, walletRows] of byWallet) {
    const sorted = [...walletRows].sort((a, b) => b.blockNumber - a.blockNumber);
    const yesRows = sorted.filter((r) => r.support);
    const stackSource = yesRows.length > 0 ? yesRows : sorted;
    const seenSubject = new Set<string>();
    const listRanking: PortalListRankRow[] = [];

    for (const r of stackSource) {
      const sid = (r.claimTermId || `${r.subjectLabel}:${r.support}`).toLowerCase();
      if (seenSubject.has(sid)) continue;
      seenSubject.add(sid);
      listRanking.push({
        rank: listRanking.length + 1,
        subjectId: sid,
        label: r.subjectLabel || 'Pick',
        support: r.support,
        trustWei: 0n,
        trustLabel: '—',
      });
    }
    if (listRanking.length < 1) continue;

    const hit = playerByAddr.get(walletLc);
    const feedLabel = sorted.find((r) => r.creatorLabel && !/^0x[a-f0-9]{40}$/i.test(r.creatorLabel))?.creatorLabel;
    const label =
      hit?.label && !/^0x[a-f0-9]{4,12}…/i.test(hit.label)
        ? hit.label
        : feedLabel?.trim() || `${walletLc.slice(0, 6)}…${walletLc.slice(-4)}`;

    let address = walletLc;
    try {
      address = getAddress(walletLc as `0x${string}`);
    } catch {
      /* keep */
    }

    peers.push({
      player: hit ?? {
        rank: 0,
        address,
        label,
        arenaXp: 0,
        activityXp: 0,
        duels: 0,
        atomsRanked: 0,
        listsPlayed: 0,
        updatedAt: 0,
      },
      claims: [],
      similarity: {
        similarityPct: 0,
        sharedCount: 0,
        agreeCount: 0,
        disagreeCount: 0,
        sharedSubjects: [],
      },
      listRanking,
    });
  }

  return peers;
}

function mergeListRankingRows(a: PortalListRankRow[], b: PortalListRankRow[]): PortalListRankRow[] {
  const bySubject = new Map<string, PortalListRankRow>();
  for (const r of [...a, ...b]) {
    const key = r.subjectId.toLowerCase();
    const prev = bySubject.get(key);
    if (!prev) {
      bySubject.set(key, r);
      continue;
    }
    const rTrust = r.trustWei ?? 0n;
    const pTrust = prev.trustWei ?? 0n;
    const pick =
      rTrust > pTrust ? r : rTrust < pTrust ? prev : r.support && !prev.support ? r : prev;
    bySubject.set(key, pick);
  }
  return [...bySubject.values()]
    .sort((x, y) => {
      const tw = (y.trustWei ?? 0n) - (x.trustWei ?? 0n);
      if (tw !== 0n) return tw > 0n ? 1 : -1;
      return x.rank - y.rank;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function pickRicherPlayer(
  a: ArenaComparePeer['player'],
  b: ArenaComparePeer['player'],
): ArenaComparePeer['player'] {
  const score = (p: ArenaComparePeer['player']) => {
    const label = p.label.toLowerCase();
    let s = p.arenaXp ?? 0;
    if (label.endsWith('.trust') || label.endsWith('.box')) s += 10_000;
    if (!/^0x[a-f0-9]{4}/i.test(p.label)) s += 500;
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

function mergePeersForList(
  fromCompare: ArenaComparePeer[],
  fromFeed: ArenaComparePeer[],
): ArenaComparePeer[] {
  const byWallet = new Map<string, ArenaComparePeer>();

  for (const peer of [...fromFeed, ...fromCompare]) {
    const lc = peer.player.address.toLowerCase();
    const existing = byWallet.get(lc);
    if (!existing) {
      byWallet.set(lc, peer);
      continue;
    }
    byWallet.set(lc, {
      ...existing,
      player: pickRicherPlayer(existing.player, peer.player),
      claims: existing.claims.length >= peer.claims.length ? existing.claims : peer.claims,
      listRanking: mergeListRankingRows(existing.listRanking, peer.listRanking),
      similarity:
        existing.similarity.sharedCount >= peer.similarity.sharedCount
          ? existing.similarity
          : peer.similarity,
    });
  }

  return [...byWallet.values()];
}

async function previewPoolForList(listObjectTermId: string): Promise<RankItem[]> {
  try {
    const rows = await getListMemberSubjectsForObject(listObjectTermId, 32);
    return rows.map((r) => ({
      id: r.id,
      kind: 'atom' as const,
      label: r.label,
      subtitle: 'On-chain list',
      image: r.image,
      pairKind: 'list-preview',
    }));
  } catch {
    return [];
  }
}

function applyLabelsToPeers(
  peers: ArenaComparePeer[],
  labels: Map<string, string>,
  players: ArenaPlayerRow[],
): ArenaComparePeer[] {
  const playerByAddr = new Map<string, ArenaPlayerRow>();
  for (const p of players) {
    if (p.address) playerByAddr.set(p.address.toLowerCase(), p);
  }

  return peers.map((peer) => {
    const lc = peer.player.address.toLowerCase();
    const resolved = labels.get(lc);
    const lbRow = playerByAddr.get(lc);
    const label =
      resolved ??
      (lbRow?.label && !/^0x[a-f0-9]{4,12}…/i.test(lbRow.label) ? lbRow.label : peer.player.label);
    return {
      ...peer,
      player: { ...peer.player, label },
    };
  });
}

export function groupSpotlightByRanker(entries: RankedListSpotlightEntry[]): SpotlightRankerGroup[] {
  const byAddr = new Map<string, SpotlightRankerGroup>();

  for (const entry of entries) {
    const lc = entry.peer.player.address.toLowerCase();
    const hit = byAddr.get(lc);
    if (hit) {
      hit.lists.push(entry);
      hit.totalPicks += entry.pickCount;
      hit.maxArenaXp = Math.max(hit.maxArenaXp, entry.peer.player.arenaXp ?? 0);
      if (entry.rankerLabel && !entry.rankerLabel.startsWith('0x')) hit.rankerLabel = entry.rankerLabel;
    } else {
      byAddr.set(lc, {
        address: entry.peer.player.address,
        rankerLabel: entry.rankerLabel,
        lists: [entry],
        totalPicks: entry.pickCount,
        maxArenaXp: entry.peer.player.arenaXp ?? 0,
      });
    }
  }

  return [...byAddr.values()].sort((a, b) => {
    if (b.lists.length !== a.lists.length) return b.lists.length - a.lists.length;
    if (b.maxArenaXp !== a.maxArenaXp) return b.maxArenaXp - a.maxArenaXp;
    return b.totalPicks - a.totalPicks;
  });
}

export async function fetchRankedListsSpotlight(opts: {
  portalLists: SpotlightPortalList[];
  players?: ArenaPlayerRow[];
  myAddress?: string | null;
  maxLists?: number;
  maxRankersPerList?: number;
  maxEntries?: number;
}): Promise<RankedListSpotlightEntry[]> {
  const maxLists = opts.maxLists ?? 16;
  const maxRankersPerList = opts.maxRankersPerList ?? 80;
  const maxEntries = opts.maxEntries ?? 160;
  const portalLists = opts.portalLists.filter((l) => l.listObjectTermId).slice(0, maxLists);
  if (portalLists.length < 1) return [];

  let players = opts.players;
  if (!players?.length) {
    players = await fetchArenaPlayerLeaderboard(opts.myAddress);
  }

  await fetchArenaCompareGraphBundle().catch(() => null);
  const feed = await fetchRecentArenaPortalRankingFeed(600).catch(() => []);

  const previewByTerm = new Map<string, RankItem[]>();
  const flat: RankedListSpotlightEntry[] = [];

  for (const list of portalLists) {
    try {
      const seedWallets = await discoverAllRankerWalletsForList(
        list.listObjectTermId,
        opts.myAddress,
        feed,
        players,
      );

      const [fromCompareRaw, fromFeedRaw] = await Promise.all([
        fetchPortalListCommunityRankings({
          listObjectTermId: list.listObjectTermId,
          listId: list.id,
          myAddress: opts.myAddress,
          players,
          maxPeers: maxRankersPerList,
          seedWallets,
          includeSelf: true,
        }),
        Promise.resolve(buildPeersFromFeedForList(list, feed, players)),
      ]);

      const merged = mergePeersForList(fromCompareRaw, fromFeedRaw);
      const ranked = communityRankingsFromPeers(merged, { minRankingRows: 1 });
      if (ranked.length < 1) continue;

      let previewPool = previewByTerm.get(list.listObjectTermId);
      if (!previewPool) {
        previewPool = await previewPoolForList(list.listObjectTermId);
        previewByTerm.set(list.listObjectTermId, previewPool);
      }

      const enriched = enrichPeersWithPool(ranked, previewPool);
      for (const peer of enriched) {
        const yesRows = peer.listRanking.filter((r) => r.support);
        const stack = yesRows.length > 0 ? yesRows : peer.listRanking;
        flat.push({
          listId: list.id,
          listTitle: list.title,
          listObjectTermId: list.listObjectTermId,
          arenaCategory: list.arenaCategory,
          peer,
          pickCount: stack.length,
          previewPool,
          rankerLabel: peer.player.label,
        });
      }
    } catch (e) {
      console.warn('[fetchRankedListsSpotlight] list failed', list.id, e);
    }
  }

  if (flat.length < 1) return [];

  const wallets = flat.map((e) => e.peer.player.address);
  const labels = await resolveRankerDisplayLabels(wallets);

  const withLabels = flat.map((entry) => {
    const lc = entry.peer.player.address.toLowerCase();
    const resolved = labels.get(lc);
    const peer = resolved
      ? applyLabelsToPeers([entry.peer], labels, players!)[0]!
      : entry.peer;
    const rankerLabel = resolved ?? entry.rankerLabel;
    return { ...entry, peer, rankerLabel };
  });

  return withLabels
    .sort((a, b) => {
      const aTrust = a.rankerLabel.toLowerCase().endsWith('.trust') ? 0 : 1;
      const bTrust = b.rankerLabel.toLowerCase().endsWith('.trust') ? 0 : 1;
      if (aTrust !== bTrust) return aTrust - bTrust;
      const xpDiff = (b.peer.player.arenaXp ?? 0) - (a.peer.player.arenaXp ?? 0);
      if (xpDiff !== 0) return xpDiff;
      return b.pickCount - a.pickCount;
    })
    .slice(0, maxEntries);
}
