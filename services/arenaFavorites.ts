import { getInturankApiOrigin } from '../constants';

const STORAGE_KEY = 'inturank-arena-favorite-list-ids-v1';

export function loadArenaFavoriteListIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveArenaFavoriteListIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* ignore quota / privacy mode */
  }
}

async function fetchArenaFavoritesRemoteRaw(walletLc: string): Promise<string[]> {
  const origin = getInturankApiOrigin();
  if (!origin) return [];
  const r = await fetch(
    `${origin}/api/user-preferences?wallet=${encodeURIComponent(walletLc)}`,
    { credentials: 'omit', headers: { Accept: 'application/json' } }
  );
  if (!r.ok) return [];
  const j = await r.json().catch(() => ({}));
  const arr = j?.arenaFavoriteListIds;
  return Array.isArray(arr) ? arr.filter((x: unknown): x is string => typeof x === 'string') : [];
}

export function pushArenaFavoriteListIdsRemote(
  wallet: string | null | undefined,
  ids: string[]
): void {
  const origin = getInturankApiOrigin();
  const w = String(wallet ?? '').trim().toLowerCase();
  if (!origin || !w.startsWith('0x')) return;
  fetch(`${origin}/api/user-preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: w, arenaFavoriteListIds: [...new Set(ids)] }),
    credentials: 'omit',
  }).catch(() => {});
}

/** Union server + device favorites once per session connect, persist locally, optionally sync server up. */
export async function hydrateArenaFavoritesFromServer(wallet: string | null | undefined): Promise<string[] | null> {
  const w = String(wallet ?? '').trim().toLowerCase();
  if (!w.startsWith('0x')) return null;
  const origin = getInturankApiOrigin();
  try {
    const remote = origin ? await fetchArenaFavoritesRemoteRaw(w) : [];
    const local = loadArenaFavoriteListIds();
    const merged = [...new Set([...remote, ...local])];
    saveArenaFavoriteListIds(merged);
    if (
      origin &&
      merged.length &&
      (merged.length !== remote.length || merged.some((id) => !remote.includes(id)))
    ) {
      pushArenaFavoriteListIdsRemote(w, merged);
    }
    return merged;
  } catch {
    return null;
  }
}
