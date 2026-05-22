/**
 * Pulse / Signal — submit queued Support (stand) or Oppose stances as FeeProxy vault deposits.
 * Mirrors Arena portal semantics: positive vault vs counter vault, with counter-stake checks.
 */
import { getAddress, parseEther } from 'viem';
import type { SignalPendingPick } from './signalPendingBatch';
import {
  calculateCounterTripleId,
  depositBatchToVaults,
  getProxyApprovalStatus,
  getRawShareBalance,
  grantProxyApproval,
  hasCachedProxyApproval,
} from './web3';
import { LINEAR_CURVE_ID, OFFSET_PROGRESSIVE_CURVE_ID } from '../constants';

function vaultSides(pick: SignalPendingPick): { target: `0x${string}` | string; opposite: `0x${string}` | string } {
  const yes = pick.tripleTermId.trim();
  const no =
    pick.counterTermId?.trim() && pick.counterTermId.trim().length > 0
      ? pick.counterTermId.trim()
      : calculateCounterTripleId(yes);
  if (pick.stance === 'stand') return { target: yes, opposite: no };
  return { target: no, opposite: yes };
}

async function maxSharesOnVault(account: string, termId: string): Promise<bigint> {
  const [a, b] = await Promise.all([
    getRawShareBalance(account, termId, LINEAR_CURVE_ID),
    getRawShareBalance(account, termId, OFFSET_PROGRESSIVE_CURVE_ID),
  ]);
  return a > b ? a : b;
}

/**
 * Single FeeProxy `depositBatch` for the whole cart (one fee lump). Returns the same tx hash
 * once per pick so XP callers can attach per-row `dedupeKey`s.
 */
export async function submitSignalStancesOnChain(
  wallet: string,
  picks: SignalPendingPick[],
  onProgress?: (m: string) => void,
): Promise<`0x${string}`[]> {
  if (!picks.length) throw new Error('No stances to submit.');
  const receiver = getAddress(String(wallet).trim() as `0x${string}`);

  let proxyOk = hasCachedProxyApproval(receiver);
  if (!proxyOk) {
    onProgress?.('Checking proxy approval…');
    proxyOk = await getProxyApprovalStatus(receiver);
  }
  if (!proxyOk) {
    onProgress?.('Approving Intuition proxy…');
    await grantProxyApproval(receiver);
  }

  onProgress?.('Checking for opposing vault positions…');
  const batchLegs: { termId: string; assetsWei: bigint }[] = [];

  for (let i = 0; i < picks.length; i++) {
    const p = picks[i]!;
    const { target, opposite } = vaultSides(p);
    const counterShares = await maxSharesOnVault(receiver, String(opposite));
    if (counterShares > 0n) {
      const holding = p.stance === 'stand' ? 'oppose' : 'support';
      const trying = p.stance === 'stand' ? 'support' : 'oppose';
      throw new Error(
        `STANCE_CONFLICT for "${p.objectLabel.slice(0, 64)}": you already hold ${holding} on this claim. ` +
          `Withdraw before staking ${trying}.`,
      );
    }

    const amt = p.unitsTrust.trim() || '0';
    batchLegs.push({ termId: String(target), assetsWei: parseEther(amt) });
    const labelShort = p.objectLabel.trim().slice(0, 40) + (p.objectLabel.length > 40 ? '…' : '');
    onProgress?.(
      picks.length > 1
        ? `Queued · ${labelShort} (${i + 1}/${picks.length})`
        : `Queued · ${labelShort}`,
    );
  }

  const { hash } = await depositBatchToVaults(batchLegs, receiver, (m) => onProgress?.(m));
  return picks.map(() => hash);
}
