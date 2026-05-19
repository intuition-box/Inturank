/**
 * Signal lane: per-wallet local queue of stance picks (separate from Arena lists batch).
 *
 * Phase A persists the user's selections so they survive refreshes / device switches
 * (within this browser). Phase B will wire a multi-vote submit on top of this queue.
 *
 * Storage layout is intentionally distinct from `arenaPendingBatch` so a "Signal" submit
 * never accidentally drains a "Lists" queue (and vice versa).
 */

const STORAGE_KEY = 'inturank-signal-pending-v1';
const VOUCH_STORAGE_KEY = 'inturank-signal-vouch-v1';
const MAX_PER_WALLET = 200;
const MAX_VOUCHES_PER_WALLET = 100;
const SIGNAL_PENDING_EVENT = 'inturank-signal-pending-updated';
const SIGNAL_VOUCH_EVENT = 'inturank-signal-vouch-updated';

export type SignalStance = 'stand' | 'oppose';

export type SignalPendingPick = {
  /** Stable composite key (tripleTermId + stance) — drives dedupe + flip semantics. */
  key: string;
  /** Triple term id (positive vault). */
  tripleTermId: string;
  /** Counter triple term id (negative vault) — Phase B uses this when stance === 'oppose'. */
  counterTermId?: string;
  /** Snapshot for instant render even when graph fetch lags. */
  subjectLabel: string;
  subjectImage?: string;
  predicateLabel: string;
  objectLabel: string;
  objectImage?: string;
  /** STAND = positive vault deposit; OPPOSE = counter vault deposit. */
  stance: SignalStance;
  /** TRUST units the user wants to stake when batch submit lands (Phase B). */
  unitsTrust: string;
  /** ms epoch at queue time. */
  ts: number;
};

/** Minimum TRUST per stance row when batch lands (testing default 0.1). */
export const MIN_SIGNAL_STANCE_TRUST = 0.1;
const TRUST_STEP = 0.1;

function clampNewPickUnits(raw: string): string {
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < MIN_SIGNAL_STANCE_TRUST) return String(MIN_SIGNAL_STANCE_TRUST);
  return String(Math.round(n * 1000) / 1000);
}

type LedgerFile = Record<string, SignalPendingPick[]>;

function safeWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function emitUpdated(addressLc: string): void {
  const w = safeWindow();
  if (!w) return;
  w.dispatchEvent(
    new CustomEvent(SIGNAL_PENDING_EVENT, { detail: { address: addressLc } }),
  );
}

function loadFile(): LedgerFile {
  const w = safeWindow();
  if (!w?.localStorage) return {};
  try {
    const raw = w.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LedgerFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveFile(data: LedgerFile): void {
  const w = safeWindow();
  if (!w?.localStorage) return;
  try {
    w.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function normWallet(address: string | null | undefined): string | null {
  const s = String(address ?? '').trim().toLowerCase();
  if (!s.startsWith('0x') || s.length < 6) return null;
  return s;
}

export const SIGNAL_PENDING_UPDATED_EVENT = SIGNAL_PENDING_EVENT;

/** Read the current Signal queue for a wallet. Returns [] when wallet is missing. */
export function getSignalPendingForWallet(address: string | null | undefined): SignalPendingPick[] {
  const w = normWallet(address);
  if (!w) return [];
  const file = loadFile();
  const list = Array.isArray(file[w]) ? [...file[w]!] : [];
  let dirty = false;
  const next = list.map((p) => {
    const c = clampNewPickUnits(p.unitsTrust);
    if (c !== p.unitsTrust) dirty = true;
    return { ...p, unitsTrust: c };
  });
  if (dirty) {
    file[w] = next;
    saveFile(file);
  }
  return next;
}

/** Total queued count across all wallets (for badges before connect). */
export function getSignalPendingTotalCount(): number {
  const file = loadFile();
  let n = 0;
  for (const k of Object.keys(file)) n += file[k]?.length ?? 0;
  return n;
}

/** Toggle: add if absent, flip stance if same triple already queued, remove on second tap of same stance. */
export function toggleSignalPending(
  address: string | null | undefined,
  pick: Omit<SignalPendingPick, 'key' | 'ts'>,
): { applied: boolean; reason: 'added' | 'flipped' | 'removed' | 'no-wallet' } {
  const w = normWallet(address);
  if (!w) return { applied: false, reason: 'no-wallet' };

  const file = loadFile();
  const list = Array.isArray(file[w]) ? [...file[w]!] : [];

  const existingIdx = list.findIndex((p) => p.tripleTermId === pick.tripleTermId);
  if (existingIdx === -1) {
    const next: SignalPendingPick = {
      ...pick,
      unitsTrust: clampNewPickUnits(pick.unitsTrust),
      key: `${pick.tripleTermId}|${pick.stance}|${Date.now()}`,
      ts: Date.now(),
    };
    list.unshift(next);
    while (list.length > MAX_PER_WALLET) list.pop();
    file[w] = list;
    saveFile(file);
    emitUpdated(w);
    return { applied: true, reason: 'added' };
  }

  const existing = list[existingIdx]!;
  if (existing.stance === pick.stance) {
    list.splice(existingIdx, 1);
    file[w] = list;
    saveFile(file);
    emitUpdated(w);
    return { applied: true, reason: 'removed' };
  }

  list[existingIdx] = {
    ...existing,
    ...pick,
    stance: pick.stance,
    unitsTrust: existing.unitsTrust,
    ts: Date.now(),
  };
  file[w] = list;
  saveFile(file);
  emitUpdated(w);
  return { applied: true, reason: 'flipped' };
}

/** Set queued TRUST for one triple (min {@link MIN_SIGNAL_STANCE_TRUST}). */
export function setSignalPendingUnits(
  address: string | null | undefined,
  tripleTermId: string,
  raw: string,
): boolean {
  const w = normWallet(address);
  if (!w || !tripleTermId?.trim()) return false;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < MIN_SIGNAL_STANCE_TRUST - 1e-12) return false;
  const file = loadFile();
  const list = Array.isArray(file[w]) ? [...file[w]!] : [];
  const i = list.findIndex((p) => p.tripleTermId === tripleTermId);
  if (i === -1) return false;
  list[i] = { ...list[i]!, unitsTrust: clampNewPickUnits(String(raw)), ts: Date.now() };
  file[w] = list;
  saveFile(file);
  emitUpdated(w);
  return true;
}

/** Step TRUST by delta (step {@link TRUST_STEP}, floor {@link MIN_SIGNAL_STANCE_TRUST}). */
export function bumpSignalPendingUnits(
  address: string | null | undefined,
  tripleTermId: string,
  delta: number,
): boolean {
  const w = normWallet(address);
  if (!w || !tripleTermId?.trim()) return false;
  if (!Number.isFinite(delta) || delta === 0) return false;
  const file = loadFile();
  const list = Array.isArray(file[w]) ? [...file[w]!] : [];
  const i = list.findIndex((p) => p.tripleTermId === tripleTermId);
  if (i === -1) return false;
  const cur = Number(list[i]!.unitsTrust);
  const base = Number.isFinite(cur) ? cur : MIN_SIGNAL_STANCE_TRUST;
  const stepped = Math.round((base + delta) / TRUST_STEP) * TRUST_STEP;
  const next = Math.max(MIN_SIGNAL_STANCE_TRUST, stepped);
  list[i] = { ...list[i]!, unitsTrust: clampNewPickUnits(String(next)), ts: Date.now() };
  file[w] = list;
  saveFile(file);
  emitUpdated(w);
  return true;
}

/** Hard-remove an entry (e.g. user dismisses from queue list). */
export function removeSignalPending(
  address: string | null | undefined,
  tripleTermId: string,
): boolean {
  const w = normWallet(address);
  if (!w) return false;
  const file = loadFile();
  const list = Array.isArray(file[w]) ? [...file[w]!] : [];
  const next = list.filter((p) => p.tripleTermId !== tripleTermId);
  if (next.length === list.length) return false;
  file[w] = next;
  saveFile(file);
  emitUpdated(w);
  return true;
}

/** Clear the queue for a wallet (e.g. after a future Phase B submit). */
export function clearSignalPending(address: string | null | undefined): void {
  const w = normWallet(address);
  if (!w) return;
  const file = loadFile();
  if (!file[w]) return;
  delete file[w];
  saveFile(file);
  emitUpdated(w);
}

/* -------------------------------------------------------------------------- */
/* Vouch queue (Phase B) — distinct from stance queue                         */
/* -------------------------------------------------------------------------- */

export type SignalVouchTld = '.eth' | '.trust';

export type SignalVouchPick = {
  /**
   * Stable queue id: atom `term_id` (bytes32) when the vouch targets a vault atom,
   * else the target wallet (`0x` + 40 hex).
   */
  accountId: string;
  /** Display label (e.g. `zerexbilly.eth`). */
  label: string;
  /** Cached image URL (optional). */
  image?: string | null;
  /** TLD bucket — drives small visual badge in the UI. */
  tld: SignalVouchTld;
  /** Object atom term id when known (enables single-tx batch). */
  objectTermId?: string;
  /** When the row is an `accounts` index entry, wallet used to resolve Account atom. */
  objectWalletRef?: string;
  /** ms epoch at queue time. */
  ts: number;
};

type VouchFile = Record<string, SignalVouchPick[]>;

function emitVouchUpdated(addressLc: string): void {
  const w = safeWindow();
  if (!w) return;
  w.dispatchEvent(
    new CustomEvent(SIGNAL_VOUCH_EVENT, { detail: { address: addressLc } }),
  );
}

function loadVouchFile(): VouchFile {
  const w = safeWindow();
  if (!w?.localStorage) return {};
  try {
    const raw = w.localStorage.getItem(VOUCH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VouchFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveVouchFile(data: VouchFile): void {
  const w = safeWindow();
  if (!w?.localStorage) return;
  try {
    w.localStorage.setItem(VOUCH_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export const SIGNAL_VOUCH_UPDATED_EVENT = SIGNAL_VOUCH_EVENT;

export function getSignalVouchesForWallet(address: string | null | undefined): SignalVouchPick[] {
  const w = normWallet(address);
  if (!w) return [];
  const file = loadVouchFile();
  return Array.isArray(file[w]) ? [...file[w]!] : [];
}

/** Toggle on/off — second tap on the same identity removes the vouch. */
export function toggleSignalVouch(
  address: string | null | undefined,
  pick: Omit<SignalVouchPick, 'ts'>,
): { applied: boolean; reason: 'added' | 'removed' | 'no-wallet' | 'self' } {
  const w = normWallet(address);
  if (!w) return { applied: false, reason: 'no-wallet' };

  const target = pick.accountId.trim().toLowerCase();
  if (!target) return { applied: false, reason: 'no-wallet' };
  if (target === w) return { applied: false, reason: 'self' };
  const ow = pick.objectWalletRef?.trim().toLowerCase();
  if (ow && ow === w) return { applied: false, reason: 'self' };

  const file = loadVouchFile();
  const list = Array.isArray(file[w]) ? [...file[w]!] : [];
  const existingIdx = list.findIndex((p) => p.accountId.toLowerCase() === target);
  if (existingIdx !== -1) {
    list.splice(existingIdx, 1);
    file[w] = list;
    saveVouchFile(file);
    emitVouchUpdated(w);
    return { applied: true, reason: 'removed' };
  }

  list.unshift({ ...pick, accountId: target, ts: Date.now() });
  while (list.length > MAX_VOUCHES_PER_WALLET) list.pop();
  file[w] = list;
  saveVouchFile(file);
  emitVouchUpdated(w);
  return { applied: true, reason: 'added' };
}

export function removeSignalVouch(
  address: string | null | undefined,
  accountId: string,
): boolean {
  const w = normWallet(address);
  if (!w) return false;
  const target = accountId.trim().toLowerCase();
  const file = loadVouchFile();
  const list = Array.isArray(file[w]) ? [...file[w]!] : [];
  const next = list.filter((p) => p.accountId.toLowerCase() !== target);
  if (next.length === list.length) return false;
  file[w] = next;
  saveVouchFile(file);
  emitVouchUpdated(w);
  return true;
}

export function clearSignalVouches(address: string | null | undefined): void {
  const w = normWallet(address);
  if (!w) return;
  const file = loadVouchFile();
  if (!file[w]) return;
  delete file[w];
  saveVouchFile(file);
  emitVouchUpdated(w);
}
