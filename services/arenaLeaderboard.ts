/**
 * Arena rankers leaderboard.
 * - Ranking uses **IntuRank total XP** = Arena XP (indexer / mirror) + Activity XP (protocol mirror + this browser for you).
 * - Mirror GET may return `arenaXp`, `protocolXp`, and `xp` (sum). Legacy rows may only have `xp` (treated as arena-only).
 * - Graph fallback: Arena XP from subgraph; Activity XP = 0 unless mirror also merged later.
 */
import {
  fetchArenaLeaderboardXpRowsFromGraph,
  getAccountsByIds,
  resolveIntuitionAccountForWallet,
} from './graphql';
import { ARENA_USE_GLOBAL_GRAPH_LEADERBOARD, getArenaLeaderboardMirrorUrl, DEFAULT_PROFILE_AVATAR_URL } from '../constants';
import { getProtocolXpTotal } from './protocolXp';

export interface ArenaPlayerRow {
  rank: number;
  address: string;
  label: string;
  image?: string;
  /** Indexed / on-chain Arena picks (portal lists). */
  arenaXp: number;
  /** IntuRank activity XP (markets, creates, sends, …) from mirror and/or this browser. */
  activityXp: number;
  duels: number;
  atomsRanked: number;
  listsPlayed: number;
  updatedAt: number;
}

/** Total XP used for ranking and podium — Arena + Activity. */
export function inturankLeaderboardTotalXp(p: Pick<ArenaPlayerRow, 'arenaXp' | 'activityXp'>): number {
  return Math.max(0, Math.floor((p.arenaXp || 0) + (p.activityXp || 0)));
}

type RawLb = {
  address: string;
  arenaXp: number;
  activityXp: number;
  duels: number;
  atomsRanked: number;
  listsPlayed: number;
  updatedAt: number;
};

function normWallet(a: unknown): string | null {
  const s = String(a ?? '').trim().toLowerCase();
  if (!s.startsWith('0x') || s.length < 6) return null;
  return s;
}

async function fetchArenaLeaderboardMirrorRows(): Promise<RawLb[] | null> {
  const url = getArenaLeaderboardMirrorUrl();
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const body = await res.json();
    const arr = Array.isArray(body)
      ? body
      : body?.leaderboard ?? body?.rows ?? body?.players ?? body?.data;
    if (!Array.isArray(arr) || arr.length === 0) return null;

    const out: RawLb[] = [];
    for (const row of arr) {
      const addr = normWallet(row?.address ?? row?.wallet ?? row?.id);
      if (!addr) continue;

      const xpCombined = Math.floor(Number(row.xp ?? row?.totalXp ?? 0) || 0);
      const hasArenaField = row.arenaXp != null && row.arenaXp !== '';
      const hasProtField =
        row.protocolXp != null ||
        row.protocolXpTotal != null ||
        (row.activityXp != null && row.activityXp !== '');

      let arenaXp = Math.floor(Number(row.arenaXp ?? 0) || 0);
      let activityXp = Math.floor(
        Number(row.protocolXp ?? row.protocolXpTotal ?? row.activityXp ?? 0) || 0,
      );

      if (!hasArenaField && !hasProtField && xpCombined > 0) {
        arenaXp = xpCombined;
        activityXp = 0;
      }

      const total = arenaXp + activityXp;
      if (total <= 0) continue;

      const duels = typeof row.duels === 'number' ? row.duels : Number(row.duels ?? 0);
      const atomsRanked =
        typeof row.atomsRanked === 'number' ? row.atomsRanked : Number(row.atomsRanked ?? row.atoms ?? duels);
      const listsPlayed =
        typeof row.listsPlayed === 'number' ? row.listsPlayed : Number(row.listsPlayed ?? row.lists ?? 0);
      const updatedAt =
        typeof row.updatedAt === 'number' ? row.updatedAt : Number(row.updatedAt ?? row.t ?? 0);
      out.push({
        address: addr,
        arenaXp,
        activityXp,
        duels: Number.isFinite(duels) ? Math.max(0, Math.floor(duels)) : 0,
        atomsRanked: Number.isFinite(atomsRanked) ? Math.max(0, Math.floor(atomsRanked)) : 0,
        listsPlayed: Number.isFinite(listsPlayed) ? Math.max(0, Math.floor(listsPlayed)) : 0,
        updatedAt: Number.isFinite(updatedAt) ? Math.floor(updatedAt) : 0,
      });
    }
    out.sort((a, b) => inturankLeaderboardTotalXp(b) - inturankLeaderboardTotalXp(a));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

async function leaderboardSourceRows(): Promise<RawLb[]> {
  const mirror = await fetchArenaLeaderboardMirrorRows();
  if (mirror && mirror.length > 0) return mirror;

  void ARENA_USE_GLOBAL_GRAPH_LEADERBOARD;
  const graph = await fetchArenaLeaderboardXpRowsFromGraph(4200);
  return graph.map((r) => ({
    address: r.address.toLowerCase(),
    arenaXp: r.xp,
    activityXp: 0,
    duels: r.duels,
    atomsRanked: r.atomsRanked,
    listsPlayed: r.listsPlayed,
    updatedAt: r.updatedAt ?? 0,
  }));
}

/**
 * @param viewerAddress Connected wallet — merges this browser’s protocol XP into that row for accurate rank.
 */
export async function fetchArenaPlayerLeaderboard(viewerAddress?: string | null): Promise<ArenaPlayerRow[]> {
  let source = await leaderboardSourceRows();
  if (source.length === 0) return [];

  source = [...source].sort((a, b) => inturankLeaderboardTotalXp(b) - inturankLeaderboardTotalXp(a));
  const byAddr = new Map(source.map((r) => [r.address.toLowerCase(), r]));
  const addrs = source.map((r) => r.address);

  const graphMap = await getAccountsByIds(addrs);
  const merged: Omit<ArenaPlayerRow, 'rank'>[] = [];

  for (const addr of addrs) {
    const row = byAddr.get(addr.toLowerCase());
    if (!row) continue;
    let arenaXp = row.arenaXp ?? 0;
    let activityXp = row.activityXp ?? 0;
    if (inturankLeaderboardTotalXp({ arenaXp, activityXp }) <= 0) continue;

    const atomsRanked = row.atomsRanked ?? row.duels;
    const listsPlayed = row.listsPlayed ?? 0;

    const id = resolveIntuitionAccountForWallet(addr, graphMap);
    if (!id) {
      merged.push({
        address: addr.toLowerCase(),
        label: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        image: DEFAULT_PROFILE_AVATAR_URL,
        arenaXp,
        activityXp,
        duels: row.duels,
        atomsRanked,
        listsPlayed,
        updatedAt: row.updatedAt ?? 0,
      });
      continue;
    }
    const label = id.label.length > 48 ? `${id.label.slice(0, 46)}…` : id.label;
    merged.push({
      address: addr.toLowerCase(),
      label,
      image: id.image || DEFAULT_PROFILE_AVATAR_URL,
      arenaXp,
      activityXp,
      duels: row.duels,
      atomsRanked,
      listsPlayed,
      updatedAt: row.updatedAt ?? 0,
    });
  }

  const v = viewerAddress?.trim().toLowerCase();
  if (v && typeof window !== 'undefined') {
    const localAct = getProtocolXpTotal(viewerAddress);
    const idx = merged.findIndex((m) => m.address === v);
    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        activityXp: Math.max(merged[idx].activityXp, localAct),
      };
    }
  }

  merged.sort((a, b) => inturankLeaderboardTotalXp(b) - inturankLeaderboardTotalXp(a));
  return merged.slice(0, 30).map((m, i) => ({ ...m, rank: i + 1 }));
}
