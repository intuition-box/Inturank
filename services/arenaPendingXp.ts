/**
 * Arena gift-box: XP accrues here until the user taps Claim (then merges into protocol XP ledger).
 */
import { playXpChime } from './audio';
import { toast } from '../components/Toast';
import {
  creditProtocolXpToLedger,
  getProtocolXpTotal,
  type ProtocolXpReasonKey,
  tryReserveProtocolXpAward,
} from './protocolXp';

const STORAGE_KEY = 'inturank-arena-pending-xp-v1';
const UPDATED_EVENT = 'inturank-arena-pending-xp-updated';

export type ArenaPendingXpSource =
  | 'arena_batch'
  | 'arena_pick'
  | 'ranking_adopted'
  | 'ranking_adopted_bonus'
  | 'streak'
  | 'bonus';

export type ArenaPendingXpEntry = {
  id: string;
  amount: number;
  source: ArenaPendingXpSource;
  label: string;
  createdAt: number;
};

type WalletFile = Record<string, ArenaPendingXpEntry[]>;

function load(): WalletFile {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as WalletFile;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function save(data: WalletFile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function emit(walletLc: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(UPDATED_EVENT, { detail: { wallet: walletLc } }),
  );
}

function normalizeWallet(address: string | null | undefined): string | null {
  const w = (address ?? '').trim().toLowerCase();
  return w.startsWith('0x') ? w : null;
}

export function subscribeArenaPendingXp(
  wallet: string | null | undefined,
  cb: () => void,
): () => void {
  const lc = normalizeWallet(wallet);
  if (!lc || typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const d = (e as CustomEvent<{ wallet?: string }>).detail;
    if (!d?.wallet || d.wallet === lc) cb();
  };
  window.addEventListener(UPDATED_EVENT, handler);
  return () => window.removeEventListener(UPDATED_EVENT, handler);
}

export function getArenaPendingXpEntries(wallet: string | null | undefined): ArenaPendingXpEntry[] {
  const lc = normalizeWallet(wallet);
  if (!lc) return [];
  return [...(load()[lc] ?? [])].sort((a, b) => b.createdAt - a.createdAt);
}

export function getArenaPendingXpTotal(wallet: string | null | undefined): number {
  return getArenaPendingXpEntries(wallet).reduce((s, e) => s + e.amount, 0);
}

export function accrueArenaPendingXp(
  wallet: string | null | undefined,
  opts: {
    amount: number;
    source: ArenaPendingXpSource;
    label: string;
  },
): void {
  const lc = normalizeWallet(wallet);
  const amount = Math.floor(opts.amount);
  if (!lc || amount <= 0) return;

  const file = load();
  const list = file[lc] ?? [];
  list.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    amount,
    source: opts.source,
    label: opts.label,
    createdAt: Date.now(),
  });
  file[lc] = list.slice(-120);
  save(file);
  emit(lc);
}

/**
 * Reserve protocol XP (dedupe + daily cap) and queue the award in the gift box.
 */
export function queueProtocolXpForGiftBox(opts: {
  address: string | null | undefined;
  reasonKey: ProtocolXpReasonKey;
  txHash?: string | null;
  depositTrustWei?: bigint | null;
  sendTrustFixedAmount?: number;
  dedupeKey?: string | null;
  grossMultiplier?: number;
  pendingLabel?: string;
  pendingSource?: ArenaPendingXpSource;
}): number {
  const award = tryReserveProtocolXpAward(opts);
  if (award <= 0) return 0;

  accrueArenaPendingXp(opts.address, {
    amount: award,
    source: opts.pendingSource ?? 'arena_batch',
    label: opts.pendingLabel ?? `Activity · ${opts.reasonKey}`,
  });
  return award;
}

export function claimAllArenaPendingXp(wallet: string | null | undefined): number {
  const lc = normalizeWallet(wallet);
  if (!lc) return 0;

  const entries = getArenaPendingXpEntries(wallet);
  if (entries.length === 0) return 0;

  const total = entries.reduce((s, e) => s + e.amount, 0);
  if (total <= 0) return 0;

  creditProtocolXpToLedger(lc, total);

  const file = load();
  delete file[lc];
  save(file);
  emit(lc);

  playXpChime();
  toast.success(`Claimed ${total.toLocaleString()} XP from your Arena gift box`);
  return total;
}

export function getArenaXpDisplayTotal(wallet: string | null | undefined): number {
  return getProtocolXpTotal(wallet) + getArenaPendingXpTotal(wallet);
}
