/**
 * Promote a static / off-chain Arena contest to a real on-chain portal list.
 *
 * One call → three on-chain side effects:
 *   1. Mint the **list atom** (Identity atom with `type: 'List'`). Its `termId`
 *      becomes the contest anchor that future rankers stake against.
 *   2. Mint / reuse each **member atom** (one per item label) via
 *      `batchEnsureAtomTermIds` so we never duplicate existing atoms.
 *   3. Write a batch of **list-membership triples** `(member → LIST_PREDICATE → list)`
 *      via `createSemanticTriplesBatch` so the indexer recognises members.
 *
 * The product effect: once promoted, this contest behaves exactly like a
 * native portal list — peer similarity, leaderboard credit, and ranking XP
 * all start working. No more "no on-chain peers yet" empty state.
 *
 * Failures are surfaced rather than swallowed; on partial completion (atom
 * step succeeded but triple step failed) the caller can retry — the atom
 * resolution is idempotent.
 */
import { parseEther } from 'viem';
import {
  atomRefJobKey,
  batchEnsureAtomTermIds,
  ensureIdentityAtom,
  createSemanticTriplesBatch,
  publicClient,
  type SemanticTripleBatchInput,
} from './web3';
import { LIST_PREDICATE_ID } from '../constants';

export type ArenaPromoteListItem = {
  /** Local id (so the caller can map back). */
  id: string;
  /** Human label used as the atom name. Required. */
  label: string;
  /** Optional metadata that lands on the atom (display only). */
  subtitle?: string;
  image?: string;
};

export type ArenaPromoteListInput = {
  /** Contest title — becomes the list atom's `name`. */
  title: string;
  /** Optional contest description that lands on the list atom. */
  description?: string;
  /** Members to anchor on-chain. Empty array is rejected. */
  items: ArenaPromoteListItem[];
  /** Connected wallet (receiver/creator on every leg). */
  wallet: string;
  /**
   * TRUST deposit per atom. Should be ≥ network minimum (see `CURVE_OFFSET` / `getMinClaimDeposit`). The
   * same value is reused for each member triple's deposit.
   */
  depositPerLeg: string;
  /** Streamed progress lines for the UI tx terminal. */
  onProgress?: (msg: string) => void;
};

export type ArenaPromoteListResult = {
  /** New list atom `termId` — feed to `registerPortalListEntries`. */
  listTermId: `0x${string}`;
  /** Tx hash that minted the list atom. */
  listTxHash: `0x${string}`;
  /** Tx hash for the membership triples batch. */
  triplesTxHash: `0x${string}`;
  /** Map of local item id → on-chain member atom term id. */
  memberTermIds: Map<string, `0x${string}`>;
  /** Items that resolved (i.e. their member triple landed). Equals input
   *  unless we trimmed for cost reasons. */
  members: ArenaPromoteListItem[];
};

/**
 * Hard cap on members per single promote tx. The protocol can accept more,
 * but a wider batch means a larger up-front TRUST send and a heavier wallet
 * confirm — capping keeps the UX predictable. Callers can chunk if needed.
 */
export const ARENA_PROMOTE_MAX_MEMBERS = 24;

export async function promoteArenaListOnChain(
  input: ArenaPromoteListInput,
): Promise<ArenaPromoteListResult> {
  const { title, description, items, wallet, depositPerLeg, onProgress } = input;
  if (!title.trim()) throw new Error('Contest title is required.');
  if (!wallet || !wallet.startsWith('0x')) throw new Error('Wallet not connected.');
  if (!items.length) throw new Error('Need at least one member to promote this contest.');

  const seenLabels = new Set<string>();
  const trimmedItems = items
    .filter((it) => it.label && it.label.trim().length > 0)
    .filter((it) => {
      const key = it.label.trim().toLowerCase();
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    })
    .slice(0, ARENA_PROMOTE_MAX_MEMBERS);
  if (!trimmedItems.length) throw new Error('No member labels to anchor.');

  /* ────────── 1) Mint list atom ────────── */
  onProgress?.(`Minting list atom "${title.trim()}"…`);
  const listMeta = {
    name: title.trim(),
    description: description?.trim() || undefined,
    type: 'List' as const,
  };
  const { hash: listTxHash, termId: listTermId } = await ensureIdentityAtom(
    listMeta,
    depositPerLeg,
    wallet,
    (m) => onProgress?.(`List atom · ${m}`),
  );
  if (!listTermId) {
    throw new Error('List atom could not be resolved on-chain.');
  }
  onProgress?.(`List atom anchored · ${listTermId.slice(0, 10)}…`);
  /** Wait only when we actually broadcast a new list atom (reuse skips the tx). */
  if (listTxHash && !/^0x0{64}$/i.test(listTxHash)) {
    await publicClient.waitForTransactionReceipt({ hash: listTxHash });
  }

  /* ────────── 2) Resolve / mint member atoms (batched) ────────── */
  onProgress?.(`Resolving ${trimmedItems.length} member atom(s)…`);
  const atomJobs = trimmedItems.map((it) => ({
    ref: it.label.trim(),
    depositTrust: depositPerLeg,
  }));
  const { termMap } = await batchEnsureAtomTermIds(atomJobs, wallet, (m) =>
    onProgress?.(`Members · ${m}`),
  );

  const memberTermIds = new Map<string, `0x${string}`>();
  for (const it of trimmedItems) {
    const tid = termMap.get(atomRefJobKey(it.label.trim(), depositPerLeg));
    if (!tid) {
      throw new Error(`Could not resolve atom term id for "${it.label.slice(0, 64)}".`);
    }
    memberTermIds.set(it.id, tid);
  }
  onProgress?.(`${memberTermIds.size} member atoms ready.`);

  /* ────────── 3) Batch-write membership triples ────────── */
  const tripleLegs: SemanticTripleBatchInput[] = [];
  for (const it of trimmedItems) {
    const memberTid = memberTermIds.get(it.id);
    if (!memberTid) continue;
    tripleLegs.push({
      subjectId: memberTid,
      predicateId: LIST_PREDICATE_ID,
      objectId: listTermId,
      assetsWei: parseEther(depositPerLeg),
    });
  }
  if (!tripleLegs.length) {
    throw new Error('No member triples to write — every atom resolution failed.');
  }
  onProgress?.(`Writing ${tripleLegs.length} membership triple(s)…`);
  const triplesTxHash = await createSemanticTriplesBatch(tripleLegs, wallet, (m) =>
    onProgress?.(`Triples · ${m}`),
  );
  if (triplesTxHash && !/^0x0{64}$/i.test(triplesTxHash)) {
    try {
      await publicClient.waitForTransactionReceipt({ hash: triplesTxHash });
    } catch {
      /* receipt polling is best-effort; triples may still be indexed */
    }
  }
  onProgress?.('Contest is live on-chain.');

  return {
    listTermId,
    listTxHash: listTxHash ?? ('0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`),
    triplesTxHash,
    memberTermIds,
    members: trimmedItems,
  };
}

/**
 * Estimate of total TRUST the user needs to send.
 * 1× list atom + N× member atoms + N× triples — each leg is `depositPerLeg`
 * (at the protocol floor) plus an 8% buffer to cover protocol/FeeProxy fees
 * and gas. Lower than the previous 25% margin because most legs reuse atoms
 * (cheaper than the worst case) and the protocol floor already includes the
 * MultiVault triple cost.
 */
export function estimateArenaPromoteCost(input: {
  memberCount: number;
  depositPerLeg: string;
}): number {
  const dep = parseFloat(input.depositPerLeg) || 0.1;
  const n = Math.max(0, Math.min(input.memberCount, ARENA_PROMOTE_MAX_MEMBERS));
  const legs = 1 + n + n;
  /** 1.08× covers fee proxy overhead + gas — the deposit itself is at floor. */
  return Math.ceil(legs * dep * 1.08 * 1000) / 1000;
}
