import { parseEther } from 'viem';
import {
  getArenaLeaderboardMirrorUrl,
  PROTOCOL_XP_ADD_TO_LIST,
  PROTOCOL_XP_ADD_TO_LIST_MIN_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_ADD_TO_LIST_REFERENCE_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_CREATE_ATOM,
  PROTOCOL_XP_CREATE_ATOM_MIN_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_CREATE_ATOM_REFERENCE_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_CREATE_CLAIM,
  PROTOCOL_XP_CREATE_CLAIM_MIN_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_CREATE_CLAIM_REFERENCE_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_DAILY_CAP_ADD_TO_LIST,
  PROTOCOL_XP_DAILY_CAP_CREATE_ATOM,
  PROTOCOL_XP_DAILY_CAP_CREATE_CLAIM,
  PROTOCOL_XP_DAILY_CAP_MARKET_ACQUIRE,
  PROTOCOL_XP_DAILY_CAP_SEND_TRUST,
  PROTOCOL_XP_DAILY_CAP_SKILL_CHAT,
  PROTOCOL_XP_DAILY_CAP_SKILL_ONCHAIN,
  PROTOCOL_XP_MARKET_ACQUIRE,
  PROTOCOL_XP_MARKET_ACQUIRE_MIN_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_MARKET_ACQUIRE_REFERENCE_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_SEND_TRUST,
  PROTOCOL_XP_SKILL_ATOM,
  PROTOCOL_XP_SKILL_CHAT,
  PROTOCOL_XP_SKILL_ONCHAIN_MIN_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_SKILL_ONCHAIN_REFERENCE_DEPOSIT_TRUST_UNITS,
  PROTOCOL_XP_SKILL_TRIPLE,
} from '../constants';
import { toast } from '../components/Toast';
import { playXpChime } from './audio';

export const PROTOCOL_XP_UPDATED_EVENT = 'intrank-protocol-xp-updated';

const STORAGE_KEY = 'intrank-protocol-xp-v4';

const LEGACY_PROTOCOL_XP_KEYS = ['intrank-protocol-xp-v3', 'intrank-protocol-xp-v2', 'intrank-protocol-xp-v1'] as const;

export type ProtocolXpReasonKey =
  | 'market_acquire'
  | 'create_atom'
  | 'create_claim'
  | 'add_to_list'
  | 'send_trust'
  | 'skill_chat'
  | 'skill_atom'
  | 'skill_triple';

type DailyBucket = Partial<Record<ProtocolXpReasonKey, number>>;

type PerAddress = {
  total: number;
  seenHashes: Record<string, true>;
  /** Dedupe keys for awards without an on-chain tx hash (e.g. Skill chat message id). */
  seenDedupeKeys?: Record<string, true>;
  /** UTC date YYYY-MM-DD → XP granted that day per reason (anti-farming caps). */
  dailyByReason?: Record<string, DailyBucket>;
};

type LedgerFile = Record<string, PerAddress>;

const DAILY_CAP_BY_REASON: Record<ProtocolXpReasonKey, number> = {
  market_acquire: PROTOCOL_XP_DAILY_CAP_MARKET_ACQUIRE,
  create_atom: PROTOCOL_XP_DAILY_CAP_CREATE_ATOM,
  create_claim: PROTOCOL_XP_DAILY_CAP_CREATE_CLAIM,
  add_to_list: PROTOCOL_XP_DAILY_CAP_ADD_TO_LIST,
  skill_chat: PROTOCOL_XP_DAILY_CAP_SKILL_CHAT,
  skill_atom: PROTOCOL_XP_DAILY_CAP_SKILL_ONCHAIN,
  skill_triple: PROTOCOL_XP_DAILY_CAP_SKILL_ONCHAIN,
  send_trust: PROTOCOL_XP_DAILY_CAP_SEND_TRUST,
};

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function utcYesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Keep two UTC days so we don’t grow localStorage forever. */
function pruneDailyMap(map: Record<string, DailyBucket> | undefined): Record<string, DailyBucket> {
  const keep = new Set([utcDayKey(), utcYesterdayKey()]);
  const next: Record<string, DailyBucket> = {};
  if (!map) return next;
  for (const k of Object.keys(map)) {
    if (keep.has(k)) next[k] = map[k];
  }
  return next;
}

function loadLedger(): LedgerFile {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LedgerFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveLedger(data: LedgerFile): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/** Drop activity XP ledger (current + legacy keys). */
export function clearProtocolXpLedger(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    for (const k of LEGACY_PROTOCOL_XP_KEYS) window.localStorage.removeItem(k);
    window.dispatchEvent(new CustomEvent(PROTOCOL_XP_UPDATED_EVENT, { detail: {} }));
  } catch {
    /* ignore */
  }
}

/** Cap seen tx hashes per wallet so storage stays bounded. */
function pruneHashes(seen: Record<string, true>, maxKeys = 400): Record<string, true> {
  const keys = Object.keys(seen);
  if (keys.length <= maxKeys) return seen;
  const tail = keys.slice(-maxKeys);
  const next: Record<string, true> = {};
  for (const k of tail) next[k] = true;
  return next;
}

function pruneDedupeKeys(seen: Record<string, true> | undefined, maxKeys = 400): Record<string, true> {
  if (!seen || Object.keys(seen).length === 0) return {};
  const keys = Object.keys(seen);
  if (keys.length <= maxKeys) return seen;
  const tail = keys.slice(-maxKeys);
  const next: Record<string, true> = {};
  for (const k of tail) next[k] = true;
  return next;
}

const REASON_LABEL: Record<ProtocolXpReasonKey, string> = {
  market_acquire: 'Market purchase',
  create_atom: 'Atom created',
  create_claim: 'Claim created',
  add_to_list: 'Added to list',
  send_trust: 'TRUST sent',
  skill_chat: 'Skill chat',
  skill_atom: 'Skill · atom signed',
  skill_triple: 'Skill · triple signed',
};

function emitUpdated(addressLc: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PROTOCOL_XP_UPDATED_EVENT, {
      detail: { address: addressLc },
    })
  );
}

function postMirrorOptional(opts: {
  address: string;
  total: number;
  delta: number;
  reasonKey: ProtocolXpReasonKey;
  txHash?: string | null;
  dedupeKey?: string | null;
}): void {
  const url = getArenaLeaderboardMirrorUrl();
  if (!url) return;
  const dk = opts.dedupeKey?.trim();
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'protocol_xp_event',
      address: opts.address,
      delta: opts.delta,
      protocolXpTotal: opts.total,
      reason: opts.reasonKey,
      txHash: opts.txHash ?? undefined,
      dedupeKey: dk || undefined,
      t: Date.now(),
    }),
  }).catch(() => {});
}

/**
 * Linear scale: 0 below minWei; full baseXp at refWei and above; between → proportional to deposit/ref.
 * Any qualifying deposit (≥ minWei) earns at least 1 XP — guarantees activity always feels rewarded.
 */
export function scaleProtocolXpByDeposit(
  baseXp: number,
  depositWei: bigint,
  minTrustUnits: number,
  referenceTrustUnits: number,
): number {
  if (!Number.isFinite(baseXp) || baseXp <= 0 || depositWei <= 0n) return 0;
  const minWei = parseEther(String(minTrustUnits));
  const refWei = parseEther(String(referenceTrustUnits));
  if (refWei <= 0n) return 0;
  if (depositWei < minWei) return 0;
  const full = BigInt(Math.floor(baseXp));
  let scaled = (full * depositWei) / refWei;
  if (scaled > full) scaled = full;
  if (scaled <= 0n) scaled = 1n;
  return Number(scaled);
}

/** Gross XP before daily cap (send_trust uses fixed amount after caller-side min-send gate). */
export function computeGrossProtocolXp(opts: {
  reasonKey: ProtocolXpReasonKey;
  depositTrustWei?: bigint | null;
  /** Only for send_trust — fixed reward when qualifying send (≥ min TRUST). */
  sendTrustFixedAmount?: number;
}): number {
  const { reasonKey, depositTrustWei, sendTrustFixedAmount } = opts;
  if (reasonKey === 'send_trust') {
    const a = sendTrustFixedAmount ?? PROTOCOL_XP_SEND_TRUST;
    return Number.isFinite(a) && a > 0 ? Math.floor(a) : 0;
  }
  if (reasonKey === 'skill_chat') {
    const n = PROTOCOL_XP_SKILL_CHAT;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  const wei = depositTrustWei ?? null;
  if (wei === null || wei <= 0n) return 0;

  switch (reasonKey) {
    case 'market_acquire':
      return scaleProtocolXpByDeposit(
        PROTOCOL_XP_MARKET_ACQUIRE,
        wei,
        PROTOCOL_XP_MARKET_ACQUIRE_MIN_DEPOSIT_TRUST_UNITS,
        PROTOCOL_XP_MARKET_ACQUIRE_REFERENCE_DEPOSIT_TRUST_UNITS,
      );
    case 'create_atom':
      return scaleProtocolXpByDeposit(
        PROTOCOL_XP_CREATE_ATOM,
        wei,
        PROTOCOL_XP_CREATE_ATOM_MIN_DEPOSIT_TRUST_UNITS,
        PROTOCOL_XP_CREATE_ATOM_REFERENCE_DEPOSIT_TRUST_UNITS,
      );
    case 'create_claim':
      return scaleProtocolXpByDeposit(
        PROTOCOL_XP_CREATE_CLAIM,
        wei,
        PROTOCOL_XP_CREATE_CLAIM_MIN_DEPOSIT_TRUST_UNITS,
        PROTOCOL_XP_CREATE_CLAIM_REFERENCE_DEPOSIT_TRUST_UNITS,
      );
    case 'add_to_list':
      return scaleProtocolXpByDeposit(
        PROTOCOL_XP_ADD_TO_LIST,
        wei,
        PROTOCOL_XP_ADD_TO_LIST_MIN_DEPOSIT_TRUST_UNITS,
        PROTOCOL_XP_ADD_TO_LIST_REFERENCE_DEPOSIT_TRUST_UNITS,
      );
    case 'skill_atom':
      return scaleProtocolXpByDeposit(
        PROTOCOL_XP_SKILL_ATOM,
        wei,
        PROTOCOL_XP_SKILL_ONCHAIN_MIN_DEPOSIT_TRUST_UNITS,
        PROTOCOL_XP_SKILL_ONCHAIN_REFERENCE_DEPOSIT_TRUST_UNITS,
      );
    case 'skill_triple':
      return scaleProtocolXpByDeposit(
        PROTOCOL_XP_SKILL_TRIPLE,
        wei,
        PROTOCOL_XP_SKILL_ONCHAIN_MIN_DEPOSIT_TRUST_UNITS,
        PROTOCOL_XP_SKILL_ONCHAIN_REFERENCE_DEPOSIT_TRUST_UNITS,
      );
    default:
      return 0;
  }
}

/** Local activity XP total for a wallet (not Arena indexer XP). */
export function getProtocolXpTotal(address: string | null | undefined): number {
  if (!address?.trim()) return 0;
  const lc = address.toLowerCase();
  const ledger = loadLedger();
  return ledger[lc]?.total ?? 0;
}

/**
 * Persist + UX for a qualifying on-chain action.
 * Dedupes by `txHash`. Deposit-sized categories require `depositTrustWei` (spam-safe scaling + daily caps).
 *
 * Back-compat: returns truthy (the awarded amount) when XP was granted, falsy otherwise.
 * Callers that previously checked `if (notifyProtocolXpEarned(...)) ...` keep working.
 */
export function notifyProtocolXpEarned(opts: {
  address: string | null | undefined;
  reasonKey: ProtocolXpReasonKey;
  txHash?: string | null;
  depositTrustWei?: bigint | null;
  /** Only send_trust — pass fixed XP after min-send gate at callsite. */
  sendTrustFixedAmount?: number;
  /** Dedupe non-tx awards (e.g. Skill assistant message id). */
  dedupeKey?: string | null;
  /**
   * Multiply gross (after deposit scaling) before daily cap — e.g. Arena rank uses `add_to_list` on the same tx as pick XP.
   * Omit or use 1 for full weight; values in (0, 1) floor after multiply.
   */
  grossMultiplier?: number;
}): number {
  const { address, reasonKey, txHash, depositTrustWei, sendTrustFixedAmount, dedupeKey, grossMultiplier } = opts;
  if (!address?.trim()) return 0;

  let gross = computeGrossProtocolXp({
    reasonKey,
    depositTrustWei,
    sendTrustFixedAmount,
  });
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  if (grossMultiplier != null && Number.isFinite(grossMultiplier) && grossMultiplier > 0 && grossMultiplier < 1) {
    gross = Math.floor(gross * grossMultiplier);
  }
  if (!Number.isFinite(gross) || gross <= 0) return 0;

  const addrLc = address.toLowerCase();
  const h = typeof txHash === 'string' && txHash.startsWith('0x') ? txHash.toLowerCase() : null;
  const dedupe = typeof dedupeKey === 'string' && dedupeKey.trim() ? `dk:${dedupeKey.trim()}` : null;

  const ledger = loadLedger();
  let entry: PerAddress = ledger[addrLc] ?? { total: 0, seenHashes: {} };

  if (dedupe && entry.seenDedupeKeys?.[dedupe]) {
    return 0;
  }

  /** Same tx hash may credit multiple logical deposits (FeeProxy depositBatch); require per-row `dedupeKey`. */
  if (h && entry.seenHashes[h] && !dedupe) {
    return 0;
  }

  const cap = DAILY_CAP_BY_REASON[reasonKey];
  const dayKey = utcDayKey();
  let dailyByReason = pruneDailyMap(entry.dailyByReason);
  const todayBucket: DailyBucket = { ...(dailyByReason[dayKey] ?? {}) };
  const usedToday = todayBucket[reasonKey] ?? 0;
  const room = Number.isFinite(cap) ? Math.max(0, cap - usedToday) : gross;
  const award = Math.min(gross, room);

  if (award <= 0) {
    toast.info(`Daily XP limit reached for ${REASON_LABEL[reasonKey]} — resets at UTC midnight.`);
    if (h) {
      entry.seenHashes = { ...entry.seenHashes, [h]: true };
      entry.seenHashes = pruneHashes(entry.seenHashes);
      ledger[addrLc] = entry;
      saveLedger(ledger);
    }
    return 0;
  }

  if (dedupe) {
    entry = {
      ...entry,
      seenDedupeKeys: pruneDedupeKeys({ ...entry.seenDedupeKeys, [dedupe]: true }),
    };
  }

  if (h) {
    entry.seenHashes = { ...entry.seenHashes, [h]: true };
    entry.seenHashes = pruneHashes(entry.seenHashes);
  }

  todayBucket[reasonKey] = usedToday + award;
  dailyByReason = { ...dailyByReason, [dayKey]: todayBucket };
  entry = { ...entry, total: entry.total + award, dailyByReason };
  ledger[addrLc] = entry;
  saveLedger(ledger);

  playXpChime();
  toast.success(`+${award} XP — ${REASON_LABEL[reasonKey]}`);
  emitUpdated(addrLc);
  postMirrorOptional({
    address: addrLc,
    total: entry.total,
    delta: award,
    reasonKey,
    txHash: h ?? undefined,
    dedupeKey: opts.dedupeKey?.trim() ? opts.dedupeKey.trim() : undefined,
  });
  return award;
}

/** Map env-friendly reason strings to canonical max XP amounts (before scaling / caps). */
export function protocolXpAmountFor(reasonKey: ProtocolXpReasonKey): number {
  switch (reasonKey) {
    case 'market_acquire':
      return PROTOCOL_XP_MARKET_ACQUIRE;
    case 'create_atom':
      return PROTOCOL_XP_CREATE_ATOM;
    case 'create_claim':
      return PROTOCOL_XP_CREATE_CLAIM;
    case 'add_to_list':
      return PROTOCOL_XP_ADD_TO_LIST;
    case 'send_trust':
      return PROTOCOL_XP_SEND_TRUST;
    case 'skill_chat':
      return PROTOCOL_XP_SKILL_CHAT;
    case 'skill_atom':
      return PROTOCOL_XP_SKILL_ATOM;
    case 'skill_triple':
      return PROTOCOL_XP_SKILL_TRIPLE;
    default:
      return 0;
  }
}
