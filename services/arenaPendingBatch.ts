const STORAGE_KEY = 'inturank-arena-pending-v1';

/** Row shape stored for batch review (matches `RankItem` fields we need on-chain/offline). */
export type ArenaPendingRow = {
  key: string;
  item: {
    id: string;
    kind: 'claim' | 'atom' | 'token';
    label: string;
    subtitle?: string;
    image?: string;
    imageSecondary?: string;
    versusLeftLabel?: string;
    versusRightLabel?: string;
    pairKind: string;
  };
  support: boolean;
  /** Integer ≥1; multiplies the session stake TRUST for this row */
  units: number;
};

type Store = Record<string, ArenaPendingRow[] | undefined>;

function readStore(): Store {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Store;
    }
    const legacy = parsed as { theme?: string; rows?: unknown };
    if (legacy?.theme && Array.isArray(legacy.rows)) {
      const t = String(legacy.theme);
      return { [t]: legacy.rows as ArenaPendingRow[] };
    }
  } catch {
    /* ignore */
  }
  return {};
}

/** Custom event name — fires after any mutation so listeners (FAB, badges) can refresh without polling. */
export const ARENA_PENDING_UPDATED_EVENT = 'inturank-arena-pending-updated';

function notifyPendingUpdated() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(ARENA_PENDING_UPDATED_EVENT));
    }
  } catch {
    /* ignore */
  }
}

function writeStore(s: Store) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  notifyPendingUpdated();
}

/** Row with originating list id (for unified batch UI + per-list submission). */
export type ArenaPendingRowWithSource = ArenaPendingRow & { sourceListId: string };

/**
 * Live view of queued rows across all lists. Uses in-memory `activeRows` for `activeListId`
 * so the current list stays in sync before the persistence effect runs after render.
 */
export function loadAllPendingRowsLive(
  activeListId: string | null | undefined,
  activeRows: ArenaPendingRow[]
): ArenaPendingRowWithSource[] {
  const store = readStore();
  const ids = new Set<string>([
    ...Object.keys(store),
    ...(activeListId ? [activeListId] : []),
  ]);
  const out: ArenaPendingRowWithSource[] = [];
  for (const lid of [...ids].sort()) {
    const rows =
      lid === activeListId ? activeRows : ((store[lid] as ArenaPendingRow[] | undefined) ?? []);
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || typeof r !== 'object' || !r.key || !r.item || typeof r.units !== 'number') continue;
      out.push({ ...r, sourceListId: lid });
    }
  }
  return out;
}

/** Pending batch rows for the current Arena list (`listId` from `arenaListsRegistry`). */
export function loadPendingForList(listId: string): ArenaPendingRow[] {
  if (!listId) return [];
  const rows = readStore()[listId];
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (r) => r && typeof r === 'object' && r.key && r.item && typeof r.units === 'number'
  ) as ArenaPendingRow[];
}

export function savePendingForList(listId: string, rows: ArenaPendingRow[]) {
  if (!listId) return;
  const all = readStore();
  all[listId] = rows;
  writeStore(all);
}

export function clearPendingStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notifyPendingUpdated();
}

export function clearPendingForList(listId: string) {
  if (!listId) return;
  const all = readStore();
  delete all[listId];
  writeStore(all);
}

/** Total queued stances across all lists (for global FAB). */
export function getTotalPendingCount(): number {
  const s = readStore();
  let n = 0;
  for (const rows of Object.values(s)) {
    if (Array.isArray(rows)) n += rows.length;
  }
  return n;
}

/** Prefer the list with the most queued rows (tie: first in key order). */
export function getFirstListIdWithPending(): string | null {
  const s = readStore();
  let bestId: string | null = null;
  let bestN = 0;
  for (const [id, rows] of Object.entries(s)) {
    const n = Array.isArray(rows) ? rows.length : 0;
    if (n > bestN) {
      bestN = n;
      bestId = id;
    }
  }
  return bestId;
}
