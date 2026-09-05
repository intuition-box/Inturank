/**
 * Arena mechanics — the pure rules of the game, with no React and no UI.
 *
 * Deck refill and item selection, claim→card mapping, streak and combat tiers, score display,
 * and the per-list score cache. Lifted verbatim out of `pages/RankedList.tsx`, where 5,000 lines
 * of view code made them impossible to reuse or reason about. Behaviour is unchanged.
 *
 * Everything here is a pure function of its arguments (the storage helpers touch sessionStorage
 * and nothing else), so a new Arena UI can build on these without inheriting the old one.
 */
import type { RankItem } from './arenaTypes';
import type { ArenaListEntry } from './arenaListsRegistry';
// Predicate semantics live with the graph layer that defines them.
import { predicateIsSocialTagNoise, predicateLooksLikeBattlePredicateLoose } from './graphql';

// ── Tuning constants ────────────────────────────────────────────────────────
export const SCORE_START = 0;

/** Arena ranking: three stance cards fill the viewport; answering one removes & shifts lanes, new fills from the right. */
export const ARENA_CARDS_PER_ROUND = 3;

/** Raw Elo-style scores start at 0 and can go negative; display with a baseline so numbers read like familiar ratings. */
export const ARENA_RATING_DISPLAY_BASE = 1500;

export const STORAGE_PREFIX = 'inturank-arena-pairwise';

export const BATTLE_PRED_EXTRA =
  /(?:better than|versus|\bvs\b|over\b|compared to|outperforms|beats\b|wins against)/i;

// ── Deck and pool selection ─────────────────────────────────────────────────
/** Lane grid: roomier gutters and earlier 3-up on large screens so lanes are not cramped. */
export function arenaVoteLaneGridClasses(lanes: number): string {
  if (lanes >= 3) {
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-7 lg:gap-8 xl:gap-10';
  }
  if (lanes === 2) {
    return 'grid-cols-1 sm:grid-cols-2 gap-5 md:gap-7 lg:gap-9';
  }
  return 'grid-cols-1 gap-5 md:gap-6';
}

export function pickSingleItem(pool: RankItem[], lastId: string | null): RankItem | null {
  if (pool.length === 0) return null;
  const eligible = lastId && pool.length > 1 ? pool.filter((it) => it.id !== lastId) : pool;
  const src = eligible.length ? eligible : pool;
  return src[Math.floor(Math.random() * src.length)] ?? null;
}

export function pickYesNoGridItems(pool: RankItem[], n: number): RankItem[] {
  if (pool.length === 0) return [];
  const k = Math.min(n, pool.length);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, k);
}

export function pickNextUniqueFromPool(pool: RankItem[], visible: RankItem[]): RankItem | null {
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
export function refillLanesAfterAnswer(pool: RankItem[], prevLanes: RankItem[], answeredItem: RankItem): RankItem[] | null {
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

// ── Claim shape helpers ─────────────────────────────────────────────────────
export function isBattleClaimRow(row: any): boolean {
  const p = row?.predicate || '';
  if (!p || predicateIsSocialTagNoise(p)) return false;
  return predicateLooksLikeBattlePredicateLoose(p) || BATTLE_PRED_EXTRA.test(p);
}

export function dedupeArenaEntries(entries: ArenaListEntry[]): ArenaListEntry[] {
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

// ── Display formatting ──────────────────────────────────────────────────────
export function fmtArenaScore(raw: number): string {
  return Math.round(raw + ARENA_RATING_DISPLAY_BASE).toLocaleString('en-US');
}

export function getStreakTier(s: number): { label: string; className: string } {
  if (s >= 12)
    return {
      label: 'Unstoppable',
      className: 'from-intuition-primary/90 to-intuition-secondary/80 shadow-[0_0_20px_rgba(255,80,57,0.35)]',
    };
  if (s >= 7)
    return { label: 'Blazing', className: 'from-intuition-primary/85 to-intuition-primary/75 shadow-[0_0_16px_rgba(255,80,57,0.28)]' };
  if (s >= 3) return { label: 'On fire', className: 'from-intuition-primary/80 to-intuition-primary/70 shadow-[0_0_14px_rgba(255,80,57,0.22)]' };
  if (s >= 1) return { label: 'Heating up', className: 'from-slate-600/70 to-intuition-primary/60 shadow-[0_0_12px_rgba(255,80,57,0.15)]' };
  return { label: '', className: '' };
}

/** Arena XP tier (cyan/magenta palette; matches profile). */
export function arenaCombatTier(xp: number): { label: string; chip: string } {
  if (xp >= 5000)
    return {
      label: 'Mythic',
      chip: 'bg-gradient-to-r from-intuition-primary/45 to-intuition-secondary/40 text-white border-intuition-primary/55 shadow-[0_0_16px_rgba(255,80,57,0.22)]',
    };
  if (xp >= 2500)
    return {
      label: 'Apex',
      chip: 'bg-gradient-to-r from-intuition-primary/35 to-intuition-primary/40 text-intuition-primary border-intuition-primary/45 shadow-[0_0_14px_rgba(255,80,57,0.18)]',
    };
  if (xp >= 1000)
    return {
      label: 'Elite',
      chip: 'bg-gradient-to-r from-slate-600/55 to-intuition-primary/35 text-slate-50 border-intuition-primary/40 shadow-[0_0_12px_rgba(255,80,57,0.14)]',
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

export function formatRelativeArenaActive(ts: number): string {
  if (!ts) return '…';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 45) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** First meaningful avatar glyph when label is unclear (avoid leading “0” on 0x… strings). */
export function leaderboardAvatarGlyph(label: string): string {
  const t = (label || '').trim();
  if (/^0x/i.test(t)) {
    const firstHex = t.slice(2).match(/[a-f0-9]/i);
    return firstHex ? firstHex[0].toUpperCase() : '?';
  }
  const m = /[a-zA-Z0-9]/.exec(t);
  return m ? m[0].toUpperCase() : '?';
}

// ── Per-list score cache (sessionStorage) ───────────────────────────────────
export function loadPersistedForList(listId: string): Record<string, number> | null {
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

export function savePersistedForList(listId: string, s: Record<string, number>) {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}-scores-${listId}`, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Drop all cached stance integers for one list so a clear cannot “come back” after refresh. */
export function wipePersistedArenaScoresForList(listId: string | null | undefined) {
  if (!listId) return;
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}-scores-${listId}`);
  } catch {
    /* ignore */
  }
}

export function patchArenaPersistedScore(listId: string | null | undefined, itemId: string, delta: number) {
  if (!listId) return;
  const persisted = loadPersistedForList(listId) ?? {};
  const R = persisted[itemId] ?? SCORE_START;
  savePersistedForList(listId, { ...persisted, [itemId]: R + delta });
}
