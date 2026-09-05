import type { ArenaComparePeer } from './arenaSimilarity';
import type { RankItem } from './arenaTypes';
import type { PortalListRankRow } from './arenaSimilarity';

/** Merge list pool metadata (labels, portraits) into on-chain ranking rows. */
export function enrichRankingRowsWithPool(
  rows: PortalListRankRow[],
  pool: RankItem[],
): PortalListRankRow[] {
  if (pool.length < 1) return rows;
  const byId = new Map<string, RankItem>();
  for (const it of pool) {
    byId.set(it.id.toLowerCase(), it);
  }
  return rows.map((row) => {
    const hit = byId.get(row.subjectId.toLowerCase());
    if (!hit) return row;
    return {
      ...row,
      label: hit.label?.trim() || row.label,
      image: row.image || hit.image,
    };
  });
}

export function enrichPeersWithPool(peers: ArenaComparePeer[], pool: RankItem[]): ArenaComparePeer[] {
  if (pool.length < 1) return peers;
  return peers.map((p) => ({
    ...p,
    listRanking: enrichRankingRowsWithPool(p.listRanking, pool),
  }));
}
