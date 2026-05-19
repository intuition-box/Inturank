export type { ArenaXpRecord } from './graphql';

/** Arena XP reads from indexed Intuition portal-list triples; never from local persistence. */
export { fetchArenaXpRecordForWallet, registerArenaPortalListTermsForIndexing } from './graphql';

const LEGACY_XP_KEYS = ['inturank-arena-xp-v1', 'inturank-arena-xp-v2', 'inturank-arena-xp-v3'];

/** Drops obsolete browser-side XP keys so production users are not stranded on phantom totals. */
export function purgeLegacyArenaXpLocalStorage(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    for (const k of LEGACY_XP_KEYS) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Optional mirror POST for analytics / your own leaderboard service (still backed by indexer reads in-app). */
import { getArenaLeaderboardMirrorUrl } from '../constants';

export function postArenaTotalsMirrorOptional(address: string, rec: import('./graphql').ArenaXpRecord): void {
  const url = getArenaLeaderboardMirrorUrl();
  if (!url || !address?.trim()) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: address.toLowerCase(),
      xp: rec.xp,
      duels: rec.duels,
      atomsRanked: rec.atomsRanked,
      listsPlayed: rec.listsPlayed,
      t: Date.now(),
    }),
  }).catch(() => {});
}
