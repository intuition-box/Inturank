/**
 * Community ranking remix: browse others' stacks, adopt into your session, adoption notifications.
 */
import { formatEther, parseEther } from 'viem';
import type { ArenaComparePeer } from './arenaSimilarity';
import type { RankItem } from './arenaTypes';
import type { PortalListRankRow } from './arenaSimilarity';
import type { ArenaPlayerRow } from './arenaLeaderboard';
import { autoDistributeStakeUnitsAlongOrder } from './arenaRankStake';

const ADOPTIONS_KEY = 'inturank-arena-adoptions-v1';
const NOTIFICATIONS_KEY = 'inturank-arena-adopt-notifications-v1';
const MAX_NOTIFICATIONS = 80;

export type ArenaAdoptionNotification = {
  id: string;
  /** Wallet that receives the notification (original ranker). */
  toWallet: string;
  adopterWallet: string;
  adopterLabel: string;
  listId: string;
  listTitle: string;
  createdAt: number;
  read: boolean;
};

export type AdoptRankingResult = {
  deck: RankItem[];
  rankTrustUnits: Record<string, number>;
  /** Subject ids the adopter inherited as YES (for curate skip). */
  adoptedSubjectIds: string[];
  skippedCount: number;
};

function normalizeAddr(a: string): string {
  return a.trim().toLowerCase();
}

function loadAdoptions(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ADOPTIONS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, number>;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function bumpAdoptionCount(authorWallet: string): void {
  if (typeof window === 'undefined') return;
  const lc = normalizeAddr(authorWallet);
  const m = loadAdoptions();
  m[lc] = (m[lc] ?? 0) + 1;
  try {
    localStorage.setItem(ADOPTIONS_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

function loadNotifications(): ArenaAdoptionNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as ArenaAdoptionNotification[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function saveNotifications(list: ArenaAdoptionNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list.slice(0, MAX_NOTIFICATIONS)));
    window.dispatchEvent(new CustomEvent('inturank-arena-adopt-notifications-updated'));
  } catch {
    /* ignore */
  }
}

export function getAdoptionNotificationsFor(wallet: string | null | undefined): ArenaAdoptionNotification[] {
  const lc = normalizeAddr(wallet ?? '');
  if (!lc.startsWith('0x')) return [];
  return loadNotifications()
    .filter((n) => normalizeAddr(n.toWallet) === lc)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getUnreadAdoptionNotificationCount(wallet: string | null | undefined): number {
  return getAdoptionNotificationsFor(wallet).filter((n) => !n.read).length;
}

export function markAdoptionNotificationsRead(wallet: string | null | undefined): void {
  const lc = normalizeAddr(wallet ?? '');
  if (!lc.startsWith('0x')) return;
  const next = loadNotifications().map((n) =>
    normalizeAddr(n.toWallet) === lc ? { ...n, read: true } : n,
  );
  saveNotifications(next);
}

export function subscribeAdoptionNotifications(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener('inturank-arena-adopt-notifications-updated', handler);
  return () => window.removeEventListener('inturank-arena-adopt-notifications-updated', handler);
}

/** Peers with a non-empty on-chain ranking for this list (browse before you play). */
export function communityRankingsFromPeers(
  peers: ArenaComparePeer[],
  opts?: { minRankingRows?: number },
): ArenaComparePeer[] {
  const minRows = opts?.minRankingRows ?? 1;
  return peers
    .filter((p) => p.listRanking.length >= minRows)
    .sort((a, b) => {
      const ta = rankingTrustTotal(b.listRanking) - rankingTrustTotal(a.listRanking);
      if (ta !== 0) return ta;
      return (b.listRanking.length ?? 0) - (a.listRanking.length ?? 0);
    });
}

function rankingTrustTotal(rows: PortalListRankRow[]): number {
  let sum = 0n;
  for (const r of rows) {
    if (r.trustWei > 0n) sum += r.trustWei;
  }
  if (sum <= 0n) return rows.length;
  return Number.parseFloat(formatEther(sum));
}

/**
 * Build a deck + unit weights from a peer's published ranking, mapped onto the current pool.
 */
export function buildAdoptedRankingSession(
  pool: RankItem[],
  peer: ArenaComparePeer,
  stakeBaseLabel: string,
): AdoptRankingResult | null {
  const poolById = new Map<string, RankItem>();
  for (const it of pool) {
    poolById.set(it.id.toLowerCase(), it);
  }

  const deck: RankItem[] = [];
  const rankTrustUnits: Record<string, number> = {};
  const adoptedSubjectIds: string[] = [];
  let skippedCount = 0;

  let base = 0.1;
  try {
    base = parseFloat(stakeBaseLabel) || 0.1;
  } catch {
    base = 0.1;
  }
  let baseWei = parseEther('0.1');
  try {
    baseWei = parseEther(stakeBaseLabel.trim() || '0.1');
  } catch {
    /* keep default */
  }

  const yesRanked = peer.listRanking.filter((r) => r.support !== false);
  const ordered = yesRanked.length > 0 ? yesRanked : peer.listRanking;

  for (const row of ordered) {
    const hit = poolById.get(row.subjectId.toLowerCase());
    if (!hit) {
      skippedCount += 1;
      continue;
    }
    if (deck.some((d) => d.id === hit.id)) continue;

    deck.push(hit);
    adoptedSubjectIds.push(hit.id);

    let units = 1;
    if (row.trustWei > 0n && baseWei > 0n) {
      const ratio = Number(row.trustWei) / Number(baseWei);
      if (Number.isFinite(ratio) && ratio > 0) {
        units = Math.max(1, Math.min(12, Math.round(ratio)));
      }
    }
    rankTrustUnits[hit.id] = units;
  }

  if (deck.length < 1) return null;

  const distributed = autoDistributeStakeUnitsAlongOrder(deck, rankTrustUnits, 1, 12);
  return {
    deck,
    rankTrustUnits: distributed,
    adoptedSubjectIds,
    skippedCount,
  };
}

export function recordRankingAdoption(opts: {
  adopterWallet: string;
  adopterLabel: string;
  authorWallet: string;
  listId: string;
  listTitle: string;
}): void {
  const author = normalizeAddr(opts.authorWallet);
  const adopter = normalizeAddr(opts.adopterWallet);
  if (!author.startsWith('0x') || !adopter.startsWith('0x') || author === adopter) return;

  bumpAdoptionCount(author);

  const note: ArenaAdoptionNotification = {
    id: `${Date.now()}-${adopter.slice(2, 10)}`,
    toWallet: author,
    adopterWallet: adopter,
    adopterLabel: opts.adopterLabel.trim() || `${adopter.slice(0, 6)}…${adopter.slice(-4)}`,
    listId: opts.listId,
    listTitle: opts.listTitle,
    createdAt: Date.now(),
    read: false,
  };

  const list = [note, ...loadNotifications()];
  saveNotifications(list);
}

export function peerDisplayLabel(player: ArenaPlayerRow): string {
  const raw = (player.label || '').trim();
  if (raw && !/^0x[a-fA-F0-9]{40}$/i.test(raw)) {
    return raw.length > 22 ? `${raw.slice(0, 20)}…` : raw;
  }
  const a = player.address || raw;
  if (a.length >= 10) return `${a.slice(0, 6)}…${a.slice(-4)}`;
  return a || 'Peer';
}

const PENDING_ADOPT_KEY = 'inturank-arena-pending-adopt-v1';

export type PendingArenaAdopt = {
  listId: string;
  peerAddress: string;
  queuedAt: number;
};

/** Queue adopt-from-spotlight (Home → Climb handoff). */
export function queueArenaPendingAdopt(listId: string, peerAddress: string): void {
  if (typeof window === 'undefined') return;
  const addr = peerAddress.trim();
  if (!listId.trim() || !addr.startsWith('0x')) return;
  const payload: PendingArenaAdopt = {
    listId: listId.trim(),
    peerAddress: addr,
    queuedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(PENDING_ADOPT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function peekArenaPendingAdopt(): PendingArenaAdopt | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_ADOPT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingArenaAdopt;
    if (!p?.listId || !p?.peerAddress?.startsWith('0x')) return null;
    return p;
  } catch {
    return null;
  }
}

export function consumeArenaPendingAdopt(): PendingArenaAdopt | null {
  const p = peekArenaPendingAdopt();
  if (!p) return null;
  try {
    sessionStorage.removeItem(PENDING_ADOPT_KEY);
  } catch {
    /* ignore */
  }
  return p;
}
