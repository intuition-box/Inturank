import type { SignalAtomTagCard } from './graphql';

/** Same-session fast path — refreshed eagerly in background. */
const MEMORY_TTL_MS = 120_000;

/** Disk cache survives refresh / new tab so Pulse is not a blank spinner on every visit. */
const LS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7d

const LS_KEY_HOT = 'inturank-signal-pulse-hot-v2';
const LS_KEY_CROWD = 'inturank-signal-pulse-crowd-v2';

type Entry = { cards: SignalAtomTagCard[]; at: number };

let hot: Entry | null = null;
let crowd: Entry | null = null;

function memoryFresh(e: Entry | null): SignalAtomTagCard[] | null {
  if (!e?.cards?.length) return null;
  if (Date.now() - e.at > MEMORY_TTL_MS) return null;
  return e.cards;
}

function readLs(key: string): SignalAtomTagCard[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as { at?: number; cards?: SignalAtomTagCard[] };
    if (!Array.isArray(p.cards) || p.cards.length === 0) return null;
    if (typeof p.at !== 'number' || Date.now() - p.at > LS_MAX_AGE_MS) return null;
    return p.cards;
  } catch {
    return null;
  }
}

function writeLs(key: string, cards: SignalAtomTagCard[], at: number) {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify({ at, cards });
    if (payload.length > 4_500_000) return;
    localStorage.setItem(key, payload);
  } catch {
    /* quota / private mode */
  }
}

/** Hot rail: memory first, then durable cache for instant paint after refresh. */
export function readSignalPulseHotCache(): SignalAtomTagCard[] | null {
  const mem = memoryFresh(hot);
  if (mem) return mem;
  const fromDisk = readLs(LS_KEY_HOT);
  if (fromDisk?.length) {
    hot = { cards: fromDisk, at: Date.now() };
    return fromDisk;
  }
  if (hot?.cards?.length) return hot.cards;
  return null;
}

export function writeSignalPulseHotCache(cards: SignalAtomTagCard[]) {
  if (!cards.length) return;
  const at = Date.now();
  hot = { cards, at };
  writeLs(LS_KEY_HOT, cards, at);
}

export function readSignalPulseCrowdCache(): SignalAtomTagCard[] | null {
  const mem = memoryFresh(crowd);
  if (mem) return mem;
  const fromDisk = readLs(LS_KEY_CROWD);
  if (fromDisk?.length) {
    crowd = { cards: fromDisk, at: Date.now() };
    return fromDisk;
  }
  if (crowd?.cards?.length) return crowd.cards;
  return null;
}

export function writeSignalPulseCrowdCache(cards: SignalAtomTagCard[]) {
  if (!cards.length) return;
  const at = Date.now();
  crowd = { cards, at };
  writeLs(LS_KEY_CROWD, cards, at);
}
