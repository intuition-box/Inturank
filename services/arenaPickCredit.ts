import { ARENA_XP_PER_RANK_PICK } from '../constants';

const STORAGE_KEY = 'intrank-arena-pick-count-v1';
const STREAK_STORAGE_KEY = 'intrank-arena-streak-v1';
/** Window for "consecutive" picks. Outside this window, streak resets on the next submit. */
export const ARENA_STREAK_WINDOW_MS = 24 * 60 * 60 * 1000;

type PickCountFile = Record<string, number>;
type StreakRecord = { count: number; lastTs: number };
type StreakFile = Record<string, StreakRecord>;

function loadCounts(): PickCountFile {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PickCountFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCounts(data: PickCountFile): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

/** Increment successful on-chain Arena ranking rows for this wallet (vault stakes count as picks). */
export function recordArenaRankingPicks(address: string | null | undefined, pickCount: number): void {
  const w = address?.trim().toLowerCase();
  if (!w?.startsWith('0x') || pickCount <= 0) return;
  const m = loadCounts();
  m[w] = (m[w] ?? 0) + pickCount;
  saveCounts(m);
}

export function getArenaRankingPickCount(address: string | null | undefined): number {
  const w = address?.trim().toLowerCase();
  if (!w?.startsWith('0x')) return 0;
  return loadCounts()[w] ?? 0;
}

/** XP floor from picks submitted from this browser until the indexer attributes portal triples to your wallet. */
export function arenaPickCreditXp(address: string | null | undefined): number {
  return getArenaRankingPickCount(address) * ARENA_XP_PER_RANK_PICK;
}

export function clearArenaPickCreditLedger(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STREAK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function loadStreaks(): StreakFile {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STREAK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StreakFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStreaks(data: StreakFile): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

/**
 * Bump streak after a successful Arena submission.
 * If picks land within ARENA_STREAK_WINDOW_MS of the last batch, the streak adds; otherwise it resets to `pickCount`.
 */
export function recordArenaStreakPicks(
  address: string | null | undefined,
  pickCount: number,
  now: number = Date.now(),
): void {
  const w = address?.trim().toLowerCase();
  if (!w?.startsWith('0x') || pickCount <= 0) return;
  const file = loadStreaks();
  const prev = file[w];
  const within = !!prev && now - prev.lastTs <= ARENA_STREAK_WINDOW_MS;
  const next: StreakRecord = {
    count: within ? prev!.count + pickCount : pickCount,
    lastTs: now,
  };
  file[w] = next;
  saveStreaks(file);
}

/** Returns 0 if the window has elapsed since the last pick — feels honest, "you broke the streak". */
export function getArenaCurrentStreak(
  address: string | null | undefined,
  now: number = Date.now(),
): number {
  const w = address?.trim().toLowerCase();
  if (!w?.startsWith('0x')) return 0;
  const rec = loadStreaks()[w];
  if (!rec) return 0;
  if (now - rec.lastTs > ARENA_STREAK_WINDOW_MS) return 0;
  return Math.max(0, rec.count);
}
