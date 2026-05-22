/**
 * Signal — Pulse (stance queue + markets) · Vouch (on-chain name claims).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flame,
  Hash,
  Heart,
  HeartPulse,
  Layers,
  Loader2,
  LogOut,
  Minus,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { formatEther, parseEther } from 'viem';
import { toast } from './Toast';
import ArenaBatchSuccessModal, { type ArenaBatchSuccessPayload } from './ArenaBatchSuccessModal';
import SignalStanceCartModal from './SignalStanceCartModal';
import { SignalStanceTrustControls } from './SignalStanceTrustControls';
import { playClick, playHover, playSuccess } from '../services/audio';
import { notifyProtocolXpEarned } from '../services/protocolXp';
import {
  fetchSignalNamedIdentityRows,
  fetchSignalPulseIdentityCards,
  fetchSignalPulseIdentityCardsForTermIds,
  fetchUserStanceHistory,
  prepareQueryIds,
  searchGlobalAgents,
  type SignalAtomTagCard,
  type SignalAtomTagRow,
  type SignalNamedIdentityRow,
  type UserStanceRow,
} from '../services/graphql';
import {
  readSignalPulseCrowdCache,
  readSignalPulseHotCache,
  writeSignalPulseCrowdCache,
  writeSignalPulseHotCache,
} from '../services/signalPulseCache';
import { submitSignalVouchesOnChain } from '../services/signalVouchOnchain';
import { submitSignalStancesOnChain } from '../services/signalStanceOnchain';
import {
  getSignalPendingForWallet,
  getSignalVouchesForWallet,
  bumpSignalPendingUnits,
  clearSignalPending,
  clearSignalVouches,
  removeSignalPending,
  removeSignalVouch,
  setSignalPendingUnits,
  MIN_SIGNAL_STANCE_TRUST,
  SIGNAL_PENDING_UPDATED_EVENT,
  SIGNAL_VOUCH_UPDATED_EVENT,
  toggleSignalPending,
  toggleSignalVouch,
  type SignalPendingPick,
  type SignalStance,
  type SignalVouchPick,
} from '../services/signalPendingBatch';
import { SIGNAL_PULSE_CROWD_ATOM_LABELS, SIGNAL_PULSE_HERO_ATOM_LABELS } from '../constants';
import { subscribeVisibilityAwareInterval } from '../services/visibility';

type Props = {
  className?: string;
  viewerAddress?: string | null;
};

type SignalLane = 'pulse' | 'vouch';

type PulseFilter = 'for-you' | 'network' | 'trending' | 'me';

const ME_PAGE_SIZE = 10;

type SignalRow = {
  tripleTermId: string;
  counterTermId?: string;
  subjectLabel: string;
  subjectImage?: string;
  predicateLabel: string;
  objectLabel: string;
  objectImage?: string;
  forCount: number;
  againstCount: number;
  totalAssetsForLabel: string;
  totalAssetsAgainstLabel: string;
  createdAt: number;
  /** Wallet id of the triple's creator (metadata only). */
  creatorId?: string;
  creatorLabel?: string;
  creatorImage?: string;
};

const ATOM_CLAIMS_PAGE_SIZE = 8;
const YOURS_STORAGE_KEY = 'ir-signal-pulse-yours-v1';
const DEFAULT_STAKE_UNITS = '0.1';
/** Lower default so experimenting with vouch txs is cheaper; users can raise in the field. */
const DEFAULT_VOUCH_DEPOSIT_TRUST = '0.1';

function shortPredicate(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return 'asserts';
  if (trimmed.length > 24) return `${trimmed.slice(0, 22)}…`;
  return trimmed;
}

/** Teal tag chip text — short so names + labels read like a profile row, not a raw triple dump. */
function shortTag(text: string, max = 22): string {
  const t = text.trim();
  if (!t) return '—';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

function shortAddress(addr: string): string {
  if (!addr.startsWith('0x') || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function samePulseTermId(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** True if two term id strings refer to the same atom (checksum, padded hex, etc.). */
function pulseTermIdsMatch(a: string, b: string): boolean {
  if (samePulseTermId(a, b)) return true;
  const aa = new Set(prepareQueryIds(a).map((x) => x.trim().toLowerCase()));
  const bb = new Set(prepareQueryIds(b).map((x) => x.trim().toLowerCase()));
  for (const x of aa) if (bb.has(x)) return true;
  return false;
}

function readYoursTermIds(): string[] {
  try {
    const raw = localStorage.getItem(YOURS_STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } catch {
    return [];
  }
}

function writeYoursTermIds(ids: string[]): void {
  try {
    localStorage.setItem(YOURS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

const SignalFeed: React.FC<Props> = ({ className, viewerAddress }) => {
  const [lane, setLane] = useState<SignalLane>('pulse');

  /* ---------------- Pulse (identity claim rail + My stakes) ---------------- */
  const [pulseFilter, setPulseFilter] = useState<PulseFilter>('trending');

  /* ---------------- "Me" slice — every triple where the wallet has staked ---------------- */
  const [meStances, setMeStances] = useState<UserStanceRow[]>([]);
  const [meLoading, setMeLoading] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);
  const [mePage, setMePage] = useState(0);

  /* ---------------- Atom-tag cards (identity atoms + list memberships / "has tag") ---------------- */
  const [atomCardsTrending, setAtomCardsTrending] = useState<SignalAtomTagCard[]>(
    () => readSignalPulseHotCache() ?? [],
  );
  const [atomCardsNetwork, setAtomCardsNetwork] = useState<SignalAtomTagCard[]>(
    () => readSignalPulseCrowdCache() ?? [],
  );
  const [atomCardsLoadingTrending, setAtomCardsLoadingTrending] = useState(false);
  const [atomCardsLoadingNetwork, setAtomCardsLoadingNetwork] = useState(false);
  const [atomCardsErrorTrending, setAtomCardsErrorTrending] = useState<string | null>(null);
  const [atomCardsErrorNetwork, setAtomCardsErrorNetwork] = useState<string | null>(null);

  const crowdIdlePrefetchStarted = useRef(false);

  const [yoursTermIds, setYoursTermIds] = useState<string[]>(() =>
    typeof window !== 'undefined' ? readYoursTermIds() : [],
  );
  const [yoursCards, setYoursCards] = useState<SignalAtomTagCard[]>([]);
  const [yoursLoading, setYoursLoading] = useState(false);
  const [yoursError, setYoursError] = useState<string | null>(null);
  const [yoursModalOpen, setYoursModalOpen] = useState(false);

  const yoursFetchGen = useRef(0);

  const loadPulseHot = useCallback(async () => {
    let shouldSpin = false;
    const cached = readSignalPulseHotCache();
    setAtomCardsTrending((curr) => {
      const next = cached?.length ? cached : curr;
      shouldSpin = next.length === 0;
      return next;
    });
    if (shouldSpin) setAtomCardsLoadingTrending(true);
    setAtomCardsErrorTrending(null);
    try {
      const items = await fetchSignalPulseIdentityCards({
        maxIdentityCards: SIGNAL_PULSE_HERO_ATOM_LABELS.length,
        maxClaimsPerCard: 22,
        buildConcurrency: 10,
      });
      setAtomCardsTrending((prev) => (items.length ? items : prev.length ? prev : []));
      if (items.length) writeSignalPulseHotCache(items);
      setAtomCardsErrorTrending(null);
    } catch (e: unknown) {
      setAtomCardsTrending((prev) => (prev.length ? prev : []));
      setAtomCardsErrorTrending(e instanceof Error ? e.message : 'Could not load Hot atoms');
    } finally {
      setAtomCardsLoadingTrending(false);
    }
  }, []);

  const loadPulseCrowd = useCallback(async (mode: 'ifNeeded' | 'always' = 'always') => {
    let skip = false;
    setAtomCardsNetwork((curr) => {
      const snap = readSignalPulseCrowdCache();
      const next = snap?.length ? snap : curr;
      if (mode === 'ifNeeded' && next.length > 0) skip = true;
      return next;
    });
    if (skip) return;

    let shouldSpin = false;
    setAtomCardsNetwork((curr) => {
      shouldSpin = curr.length === 0;
      return curr;
    });
    if (shouldSpin) setAtomCardsLoadingNetwork(true);
    setAtomCardsErrorNetwork(null);
    try {
      const items = await fetchSignalPulseIdentityCards({
        identityLabels: SIGNAL_PULSE_CROWD_ATOM_LABELS,
        maxClaimsPerCard: 22,
        buildConcurrency: 10,
      });
      setAtomCardsNetwork((prev) => (items.length ? items : prev.length ? prev : []));
      if (items.length) writeSignalPulseCrowdCache(items);
      setAtomCardsErrorNetwork(null);
    } catch (e: unknown) {
      setAtomCardsNetwork((prev) => (prev.length ? prev : []));
      setAtomCardsErrorNetwork(e instanceof Error ? e.message : 'Could not load Crowd atoms');
    } finally {
      setAtomCardsLoadingNetwork(false);
    }
  }, []);

  useEffect(() => {
    void loadPulseHot();
  }, [loadPulseHot]);

  useEffect(() => {
    if (pulseFilter !== 'network') return;
    void loadPulseCrowd('ifNeeded');
  }, [pulseFilter, loadPulseCrowd]);

  useEffect(() => {
    if (atomCardsTrending.length === 0 || crowdIdlePrefetchStarted.current) return;
    crowdIdlePrefetchStarted.current = true;
    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const run = () => void loadPulseCrowd('ifNeeded');
    if (typeof requestIdleCallback !== 'undefined') {
      idleHandle = requestIdleCallback(run, { timeout: 4500 });
    } else {
      timeoutHandle = setTimeout(run, 900);
    }
    return () => {
      if (idleHandle != null && typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(idleHandle);
      if (timeoutHandle != null) clearTimeout(timeoutHandle);
    };
  }, [atomCardsTrending.length, loadPulseCrowd]);

  useEffect(() => {
    return subscribeVisibilityAwareInterval(() => {
      void loadPulseHot();
      void loadPulseCrowd('always');
    }, 180_000);
  }, [loadPulseHot, loadPulseCrowd]);

  useEffect(() => {
    writeYoursTermIds(yoursTermIds);
  }, [yoursTermIds]);

  const loadYoursCards = useCallback(async () => {
    if (yoursTermIds.length === 0) {
      yoursFetchGen.current += 1;
      setYoursCards([]);
      setYoursError(null);
      setYoursLoading(false);
      return;
    }
    const gen = ++yoursFetchGen.current;
    setYoursLoading(true);
    setYoursError(null);
    try {
      const items = await fetchSignalPulseIdentityCardsForTermIds(yoursTermIds, { maxClaimsPerCard: 48 });
      if (gen !== yoursFetchGen.current) return;
      setYoursCards(items);
      setYoursTermIds((prev) => {
        const seen = new Set<string>();
        const next: string[] = [];
        for (const p of prev) {
          const card = items.find((c) => pulseTermIdsMatch(p, c.subjectTermId));
          const id = card ? card.subjectTermId : p.trim();
          if (!id) continue;
          const k = id.trim().toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          next.push(id);
        }
        if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
        return next;
      });
    } catch (e: unknown) {
      if (gen !== yoursFetchGen.current) return;
      setYoursError(e instanceof Error ? e.message : 'Could not load your atoms');
      setYoursCards([]);
    } finally {
      if (gen === yoursFetchGen.current) setYoursLoading(false);
    }
  }, [yoursTermIds]);

  useEffect(() => {
    void loadYoursCards();
  }, [loadYoursCards]);

  const addToYours = useCallback((termId: string) => {
    const t = termId.trim();
    if (!t) return;
    setYoursTermIds((prev) => {
      if (prev.some((p) => pulseTermIdsMatch(p, t))) {
        toast.info('Already in Yours');
        return prev;
      }
      toast.success('Added to Yours');
      return [...prev, t];
    });
  }, []);

  const removeFromYours = useCallback((termId: string) => {
    setYoursTermIds((prev) => {
      const next = prev.filter((p) => !pulseTermIdsMatch(p, termId));
      if (next.length === prev.length) return prev;
      toast.info('Removed from Yours');
      return next;
    });
    setYoursCards((cards) => cards.filter((c) => !pulseTermIdsMatch(c.subjectTermId, termId)));
  }, []);

  /* ---------------- named identities (Vouch) — vault atoms + accounts index ---------------- */
  const [namedRows, setNamedRows] = useState<SignalNamedIdentityRow[]>([]);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);

  /* ---------------- vouch submit (Phase D) ---------------- */
  const [vouchDepositTrust, setVouchDepositTrust] = useState(DEFAULT_VOUCH_DEPOSIT_TRUST);
  const [vouchSubmitBusy, setVouchSubmitBusy] = useState(false);
  const [stanceSubmitBusy, setStanceSubmitBusy] = useState(false);
  const [signalBatchSuccess, setSignalBatchSuccess] = useState<ArenaBatchSuccessPayload | null>(null);

  /* ---------------- queues ---------------- */
  const [stanceTick, setStanceTick] = useState(0);
  const [vouchTick, setVouchTick] = useState(0);

  const stanceQueue = useMemo<SignalPendingPick[]>(
    () => getSignalPendingForWallet(viewerAddress),
    [viewerAddress, stanceTick],
  );
  const vouchQueue = useMemo<SignalVouchPick[]>(
    () => getSignalVouchesForWallet(viewerAddress),
    [viewerAddress, vouchTick],
  );

  const queueByTriple = useMemo(() => {
    const m = new Map<string, SignalPendingPick>();
    for (const p of stanceQueue) m.set(p.tripleTermId, p);
    return m;
  }, [stanceQueue]);

  const queueByAccount = useMemo(() => {
    const m = new Map<string, SignalVouchPick>();
    for (const v of vouchQueue) m.set(v.accountId.toLowerCase(), v);
    return m;
  }, [vouchQueue]);

  const totalQueuedTrustUnits = useMemo(() => {
    let n = 0;
    for (const p of stanceQueue) {
      const v = Number(p.unitsTrust);
      if (Number.isFinite(v) && v > 0) n += v;
    }
    return n;
  }, [stanceQueue]);

  const [stanceCartModalOpen, setStanceCartModalOpen] = useState(false);

  useEffect(() => {
    if (stanceQueue.length === 0) setStanceCartModalOpen(false);
  }, [stanceQueue.length]);

  const onBumpStanceTrust = useCallback((tripleTermId: string, delta: number) => {
    if (!viewerAddress) return;
    bumpSignalPendingUnits(viewerAddress, tripleTermId, delta);
  }, [viewerAddress]);

  const onSetStanceTrust = useCallback((tripleTermId: string, raw: string): boolean => {
    if (!viewerAddress) return false;
    if (!setSignalPendingUnits(viewerAddress, tripleTermId, raw)) {
      toast.error(`Minimum is ${MIN_SIGNAL_STANCE_TRUST} TRUST per queued claim.`);
      return false;
    }
    return true;
  }, [viewerAddress]);

  const onClearStanceQueue = useCallback(() => {
    if (!viewerAddress) return;
    playClick();
    clearSignalPending(viewerAddress);
    toast.info('Cleared stance queue');
  }, [viewerAddress]);

  const yoursCardsVisible = useMemo(
    () =>
      yoursCards.filter((c) =>
        yoursTermIds.some((t) => pulseTermIdsMatch(t, c.subjectTermId)),
      ),
    [yoursCards, yoursTermIds],
  );

  useEffect(() => {
    const onP = () => setStanceTick((n) => n + 1);
    const onV = () => setVouchTick((n) => n + 1);
    window.addEventListener(SIGNAL_PENDING_UPDATED_EVENT, onP);
    window.addEventListener(SIGNAL_VOUCH_UPDATED_EVENT, onV);
    return () => {
      window.removeEventListener(SIGNAL_PENDING_UPDATED_EVENT, onP);
      window.removeEventListener(SIGNAL_VOUCH_UPDATED_EVENT, onV);
    };
  }, []);

  /* ---------------- fetchers ---------------- */
  const loadNamedBundle = useCallback(async () => {
    setBundleLoading(true);
    setBundleError(null);
    try {
      const all = await fetchSignalNamedIdentityRows({ vaultLimit: 220, accountLimit: 72 });
      setNamedRows(all);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load graph identities';
      setBundleError(msg);
      setNamedRows([]);
    } finally {
      setBundleLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNamedBundle();
  }, [loadNamedBundle]);

  useEffect(() => {
    return subscribeVisibilityAwareInterval(() => void loadNamedBundle(), 120_000);
  }, [loadNamedBundle]);

  const loadMeFeed = useCallback(async () => {
    if (!viewerAddress?.startsWith('0x')) {
      setMeStances([]);
      setMeError(null);
      setMeLoading(false);
      return;
    }
    setMeLoading(true);
    setMeError(null);
    try {
      const slice = await fetchUserStanceHistory(viewerAddress, 80);
      setMeStances(slice);
      setMePage(0);
    } catch (e: unknown) {
      setMeError(e instanceof Error ? e.message : 'Could not load your stances');
      setMeStances([]);
    } finally {
      setMeLoading(false);
    }
  }, [viewerAddress]);

  useEffect(() => {
    void loadMeFeed();
  }, [loadMeFeed]);

  useEffect(() => {
    return subscribeVisibilityAwareInterval(() => void loadMeFeed(), 120_000);
  }, [loadMeFeed]);

  /* ---------------- handlers ---------------- */
  /**
   * Graph-safe semantics (matches `getAgentTriplesWithVaults` / Intuition vaults):
   * - `tripleTermId` = claim positive vault term id (Support / for / stand).
   * - `counterTermId` = counter vault (Oppose / against); required for oppose deposits.
   */
  const onStance = useCallback(
    (row: SignalRow, stance: SignalStance) => {
      if (!viewerAddress) {
        toast.info('Connect a wallet to queue Signal stances.');
        return;
      }
      const result = toggleSignalPending(viewerAddress, {
        tripleTermId: row.tripleTermId,
        counterTermId: row.counterTermId,
        subjectLabel: row.subjectLabel,
        subjectImage: row.subjectImage,
        predicateLabel: row.predicateLabel,
        objectLabel: row.objectLabel,
        objectImage: row.objectImage,
        stance,
        unitsTrust: DEFAULT_STAKE_UNITS,
      });
      if (!result.applied) return;
      if (result.reason === 'added') toast.success(`Queued · ${stance === 'stand' ? 'Support' : 'Oppose'}`);
      else if (result.reason === 'flipped')
        toast.info(
          `${stance === 'stand' ? 'Support' : 'Oppose'} queued — submit from the conviction cart (new deposit, not an instant flip).`,
        );
      else toast.info('Removed from queue');
    },
    [viewerAddress],
  );

  const onVouch = useCallback(
    (row: SignalNamedIdentityRow) => {
      if (!viewerAddress) {
        toast.info('Connect a wallet to vouch for identities.');
        return;
      }
      const accountId = row.rowKey.trim().toLowerCase();
      const result = toggleSignalVouch(viewerAddress, {
        accountId,
        label: row.label,
        image: row.image,
        tld: row.tld,
        objectTermId: row.termId,
        objectWalletRef: row.walletId,
      });
      if (!result.applied) {
        if (result.reason === 'self') toast.info("Can't vouch for your own wallet.");
        return;
      }
      if (result.reason === 'added') toast.success(`Queued vouch · ${row.label}`);
      else if (result.reason === 'removed') toast.info(`Removed · ${row.label}`);
    },
    [viewerAddress],
  );

  const onSubmitVouchesOnChain = useCallback(async () => {
    if (!viewerAddress) {
      toast.info('Connect a wallet to submit vouches.');
      return;
    }
    if (vouchQueue.length === 0) return;
    setVouchSubmitBusy(true);
    try {
      const depPer = vouchDepositTrust.trim() || DEFAULT_VOUCH_DEPOSIT_TRUST;
      const hash = await submitSignalVouchesOnChain(
        viewerAddress,
        vouchQueue,
        depPer,
        (m) => toast.info(m),
      );
      try {
        const depWei = parseEther(depPer);
        const totalVaultWei = depWei * BigInt(vouchQueue.length);
        notifyProtocolXpEarned({
          address: viewerAddress,
          reasonKey: 'create_claim',
          txHash: hash,
          depositTrustWei: totalVaultWei,
        });
      } catch {
        /* parseEther / award edge cases — tx still succeeded */
      }
      toast.success(`Submitted · ${hash.slice(0, 12)}…`);
      clearSignalVouches(viewerAddress);
      setVouchTick((n) => n + 1);
      void loadNamedBundle();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Vouch submit failed');
    } finally {
      setVouchSubmitBusy(false);
    }
  }, [viewerAddress, vouchQueue, vouchDepositTrust, loadNamedBundle]);

  const onSubmitStancesOnChain = useCallback(async () => {
    if (!viewerAddress) {
      toast.info('Connect a wallet to submit stances.');
      return;
    }
    if (stanceQueue.length === 0) return;
    setStanceSubmitBusy(true);
    const picks = [...stanceQueue];
    try {
      const hashes = await submitSignalStancesOnChain(viewerAddress, picks, (m) => toast.info(m));
      let activityXpDelta = 0;
      const xpdnGrantsPerTx: number[] = [];
      for (let i = 0; i < hashes.length; i++) {
        const p = picks[i]!;
        const depWei = parseEther(p.unitsTrust.trim() || '0');
        const granted = notifyProtocolXpEarned({
          address: viewerAddress,
          reasonKey: 'add_to_list',
          txHash: hashes[i]!,
          depositTrustWei: depWei,
          dedupeKey: `pulse-stake:${hashes[i]!}:${p.key}`,
        });
        if (typeof granted === 'number' && granted > 0) {
          activityXpDelta += granted;
          xpdnGrantsPerTx.push(granted);
        }
      }
      const totalWei = picks.reduce((s, p) => s + parseEther(p.unitsTrust.trim() || '0'), 0n);
      const humanLine = picks
        .map((p) => {
          const side = p.stance === 'stand' ? 'Support' : 'Oppose';
          const lab = p.objectLabel.trim();
          const short = lab.length > 36 ? `${lab.slice(0, 34)}…` : lab;
          return `${side} · “${short}”`;
        })
        .join(' · ');
      try {
        playSuccess();
      } catch {
        /* ignore */
      }
      setSignalBatchSuccess({
        itemCount: picks.length,
        trustLabel: formatEther(totalWei),
        themeShort: 'Signal · Pulse',
        contextSuffix: `${picks.length === 1 ? 'vault stake' : `${picks.length} vault stakes`}`,
        humanLine,
        ...(activityXpDelta > 0 ? { activityXpEarned: activityXpDelta } : {}),
        ...(xpdnGrantsPerTx.length > 0 ? { xpdnByTx: xpdnGrantsPerTx } : {}),
        outro:
          picks.length > 1
            ? 'Your Pulse stances landed in one batched deposit. Portfolio and explorers update after the indexer syncs.'
            : 'Your Pulse stance is on-chain. Portfolio and explorers update after the indexer syncs.',
      });
      clearSignalPending(viewerAddress);
      setStanceTick((n) => n + 1);
      void loadMeFeed();
      window.setTimeout(() => {
        void loadMeFeed();
      }, 3000);
      window.setTimeout(() => {
        void loadMeFeed();
      }, 12000);
      try {
        window.dispatchEvent(new Event('inturank-arena-onchain-updated'));
      } catch {
        /* ignore */
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Stance submit failed');
    } finally {
      setStanceSubmitBusy(false);
    }
  }, [viewerAddress, stanceQueue, loadMeFeed]);

  const refreshActive = useCallback(() => {
    playClick();
    if (lane === 'pulse') {
      void loadMeFeed();
      void loadPulseHot();
      void loadPulseCrowd('always');
    } else void loadNamedBundle();
  }, [lane, loadNamedBundle, loadMeFeed, loadPulseHot, loadPulseCrowd]);

  const refreshing =
    lane === 'pulse'
      ? pulseFilter === 'me'
        ? meLoading
        : pulseFilter === 'network'
          ? atomCardsLoadingNetwork
          : atomCardsLoadingTrending
      : bundleLoading;

  const pulseRailAtomCards = pulseFilter === 'network' ? atomCardsNetwork : atomCardsTrending;
  const pulseRailAtomLoading = pulseFilter === 'network' ? atomCardsLoadingNetwork : atomCardsLoadingTrending;
  const pulseRailAtomError = pulseFilter === 'network' ? atomCardsErrorNetwork : atomCardsErrorTrending;

  /* ---------------- render ---------------- */
  return (
    <section
      className={`relative w-full min-w-0 ${className ?? ''}`}
      aria-label="Signal feed"
    >
      <div className="max-w-[min(1680px,calc(100vw-1.25rem))] mx-auto w-full space-y-6 pb-10 px-1 sm:px-0">
      {/* Welcome / intro strip */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.1] px-5 py-3.5 sm:px-7 sm:py-4 flex items-center justify-between gap-3 flex-wrap"
        style={{
          background:
            'linear-gradient(150deg, rgba(251,191,36,0.07) 0%, rgba(56,232,255,0.07) 38%, rgba(8,8,12,0.88) 52%, rgba(192,132,252,0.07) 72%, rgba(248,113,113,0.065) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div className="min-w-0 flex items-center gap-3">
          <div
            className="shrink-0 w-10 h-10 rounded-xl border border-cyan-400/50 bg-cyan-500/15 flex items-center justify-center"
            aria-hidden
          >
            <HeartPulse size={18} className="text-cyan-200" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-mono font-black uppercase tracking-[0.28em] text-cyan-200">
              IntuRank · Signal
            </p>
            <p className="text-[13px] text-slate-200 leading-snug mt-0.5">
              Queue Pulse stances, then open <strong className="text-cyan-300/95">Review cart</strong> below — same flow as the Arena conviction cart.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refreshActive}
          onMouseEnter={playHover}
          disabled={refreshing}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-100 hover:text-cyan-100 hover:border-cyan-400/50 transition-colors disabled:opacity-50"
          aria-label="Refresh active Signal lane"
        >
          {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      {/* Sub-lane pills */}
      <div
        className="flex flex-wrap gap-2 rounded-2xl border border-white/[0.1] bg-black/55 p-1.5"
        role="tablist"
        aria-label="Signal sub-lane"
      >
        <SubLanePill
          active={lane === 'pulse'}
          onClick={() => {
            playClick();
            setLane('pulse');
          }}
          icon={<Zap size={11} strokeWidth={2.6} />}
          label="Pulse"
          accent="cyan"
        />
        <SubLanePill
          active={lane === 'vouch'}
          onClick={() => {
            playClick();
            setLane('vouch');
          }}
          icon={<Shield size={11} strokeWidth={2.6} />}
          label="Vouch"
          accent="amber"
        />
      </div>

      {/* Body — switches per lane */}
      <AnimatePresence mode="wait">
        {lane === 'pulse' ? (
          <motion.div
            key="signal-lane-pulse"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <PulseLane
              pulseFilter={pulseFilter}
              onPulseFilterChange={setPulseFilter}
              meStances={meStances}
              meLoading={meLoading}
              meError={meError}
              mePage={mePage}
              onMePageChange={setMePage}
              atomCards={pulseRailAtomCards}
              atomCardsLoading={pulseRailAtomLoading}
              atomCardsError={pulseRailAtomError}
              yoursTermIds={yoursTermIds}
              yoursCards={yoursCardsVisible}
              yoursLoading={yoursLoading}
              yoursError={yoursError}
              onAddToYours={addToYours}
              onRemoveFromYours={removeFromYours}
              yoursModalOpen={yoursModalOpen}
              onYoursModalOpenChange={setYoursModalOpen}
              queueByTriple={queueByTriple}
              viewerAddress={viewerAddress ?? null}
              onStance={onStance}
              onBumpStanceTrust={onBumpStanceTrust}
              onSetStanceTrust={onSetStanceTrust}
            />
          </motion.div>
        ) : (
          <motion.div
            key="signal-lane-vouch"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <VouchLane
              namedRows={namedRows}
              loading={bundleLoading}
              error={bundleError}
              queueByAccount={queueByAccount}
              viewerAddress={viewerAddress ?? null}
              onVouch={onVouch}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <SignalStanceCartModal
        open={stanceCartModalOpen && stanceQueue.length > 0}
        onClose={() => setStanceCartModalOpen(false)}
        picks={stanceQueue}
        trustTotalLabel={totalQueuedTrustUnits.toFixed(2)}
        onBumpStanceTrust={onBumpStanceTrust}
        onSetStanceTrust={onSetStanceTrust}
        onRemove={(tripleTermId) => {
          if (!viewerAddress) return;
          playClick();
          removeSignalPending(viewerAddress, tripleTermId);
        }}
        onClearAll={onClearStanceQueue}
        onSubmit={() => {
          void onSubmitStancesOnChain();
        }}
        submitting={stanceSubmitBusy}
      />

      {/* Pulse cart (Arena conviction-cart pattern) + vouch strip */}
      {viewerAddress && (stanceQueue.length > 0 || vouchQueue.length > 0) ? (
        <div className="sticky bottom-3 sm:bottom-6 mt-8 mx-auto max-w-4xl z-30 flex flex-col gap-2.5">
          <AnimatePresence mode="popLayout">
            {stanceQueue.length > 0 ? (
              <motion.div
                key="pulse-cart-entry"
                layout
                initial={{ opacity: 0, y: 28, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="rounded-2xl border-2 border-slate-800 bg-slate-950/92 backdrop-blur-xl shadow-[0_22px_56px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] px-3 py-2.5 sm:px-4 flex flex-wrap items-center gap-3 sm:gap-4"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-initial">
                  <motion.div
                    key={stanceQueue.length}
                    initial={{ scale: 1.12 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                    className="relative shrink-0 w-10 h-10 rounded-xl border border-slate-700 bg-black/60 flex items-center justify-center"
                  >
                    <Layers size={20} className="text-intuition-primary" strokeWidth={2.2} aria-hidden />
                    <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-md text-[10px] font-black flex items-center justify-center bg-cyan-500 text-slate-950 border border-white/20 tabular-nums shadow-sm">
                      {stanceQueue.length > 99 ? '99+' : stanceQueue.length}
                    </span>
                  </motion.div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Conviction cart</p>
                    <p className="text-[12px] font-semibold text-slate-100 tabular-nums truncate">
                      <span className="text-cyan-200 font-bold">{totalQueuedTrustUnits.toFixed(2)}</span>
                      <span className="text-slate-500 font-normal"> TRUST</span>
                      <span className="text-slate-600 mx-1">·</span>
                      <span className="text-slate-400 font-normal">
                        {stanceQueue.length} claim{stanceQueue.length === 1 ? '' : 's'}
                      </span>
                    </p>
                  </div>
                </div>
                <motion.button
                  type="button"
                  onClick={() => {
                    playClick();
                    setStanceCartModalOpen(true);
                  }}
                  onMouseEnter={playHover}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-2 rounded-xl border-2 border-intuition-primary/50 bg-gradient-to-b from-intuition-primary/28 to-black/80 px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_22px_rgba(34,211,238,0.18)] hover:border-intuition-primary/65"
                >
                  <Layers size={15} strokeWidth={2.2} className="opacity-90 text-cyan-100" aria-hidden />
                  Review cart
                </motion.button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {vouchQueue.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 440, damping: 34 }}
              className="rounded-xl border border-white/10 px-4 py-3 sm:px-5 backdrop-blur-md bg-zinc-950/88 shadow-[0_10px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-slate-200">
                  <span className="font-bold tabular-nums text-amber-100/95">{vouchQueue.length}</span>
                  <span className="text-slate-500"> vouches queued</span>
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                  <label className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="text-slate-500 shrink-0">Deposit</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={vouchDepositTrust}
                      onChange={(e) => setVouchDepositTrust(e.target.value)}
                      className="w-full sm:w-28 rounded-lg border border-white/12 bg-black/55 px-2.5 py-1.5 text-slate-100 font-mono text-xs"
                      title="Per-vouch vault deposit"
                    />
                    <span className="text-slate-600 font-mono text-[10px] shrink-0">TRUST</span>
                  </label>
                  <motion.button
                    type="button"
                    disabled={vouchSubmitBusy}
                    onClick={() => {
                      playClick();
                      void onSubmitVouchesOnChain();
                    }}
                    whileTap={vouchSubmitBusy ? undefined : { scale: 0.98 }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/18 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-amber-50 hover:bg-amber-500/26 disabled:opacity-45 w-full sm:w-auto"
                  >
                    {vouchSubmitBusy ? <Loader2 size={14} className="animate-spin" /> : <Flame size={14} />}
                    Submit (1 tx)
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </div>
      ) : null}

      <ArenaBatchSuccessModal
        open={signalBatchSuccess != null}
        payload={signalBatchSuccess}
        onClose={() => setSignalBatchSuccess(null)}
      />
      </div>
    </section>
  );
};

export default SignalFeed;

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

type SubLaneAccent = 'cyan' | 'amber';

const ACCENT: Record<SubLaneAccent, { active: string; idle: string }> = {
  cyan: {
    active: 'bg-cyan-500/20 border-cyan-400/55 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
    idle: 'border-transparent text-slate-200 hover:text-cyan-200',
  },
  amber: {
    active: 'bg-amber-500/20 border-amber-400/55 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
    idle: 'border-transparent text-slate-200 hover:text-amber-200',
  },
};

const SubLanePill: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: SubLaneAccent;
}> = ({ active, onClick, icon, label, accent }) => {
  const tone = active ? ACCENT[accent].active : ACCENT[accent].idle;
  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={playHover}
      layout
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.12em] transition-all duration-200 ease-out ${tone}`}
    >
      {icon}
      {label}
    </motion.button>
  );
};

function fmtTrust(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(2);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(3);
  return n.toFixed(4);
}

const PulseYoursSearchModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onPick: (termId: string) => void;
}> = ({ open, onClose, onPick }) => {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ id: string; label: string; image?: string }[]>([]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setResults([]);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = q.trim();
    if (t.length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    let cancel = false;
    setBusy(true);
    const id = window.setTimeout(() => {
      void searchGlobalAgents(t)
        .then((rows) => {
          if (cancel) return;
          setResults(rows.map((r) => ({ id: r.id, label: r.label, image: r.image })));
        })
        .catch(() => {
          if (cancel) return;
          setResults([]);
        })
        .finally(() => {
          if (!cancel) setBusy(false);
        });
    }, 300);
    return () => {
      cancel = true;
      window.clearTimeout(id);
    };
  }, [open, q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Search atoms to add"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-zinc-950 shadow-2xl shadow-black/50 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.08]">
          <p className="text-[12px] font-black uppercase tracking-[0.2em] text-white">Add atom</p>
          <button
            type="button"
            onClick={() => {
              playClick();
              onClose();
            }}
            onMouseEnter={playHover}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2.3} />
          </button>
        </div>
        <div className="p-3 border-b border-white/[0.06]">
          <label className="sr-only" htmlFor="pulse-yours-search">
            Search Intuition atoms
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.12] bg-black/50 px-3 py-2">
            <Search size={16} className="text-cyan-400/90 shrink-0" />
            <input
              id="pulse-yours-search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search labels (live)…"
              className="flex-1 min-w-0 bg-transparent text-[14px] text-white placeholder:text-zinc-500 outline-none"
            />
            {busy ? <Loader2 className="w-4 h-4 text-cyan-300 animate-spin shrink-0" /> : null}
          </div>
        </div>
        <ul className="max-h-[min(52vh,420px)] overflow-y-auto divide-y divide-white/[0.06]">
          {q.trim().length < 2 ? (
            <li className="px-4 py-8 text-center text-[12px] text-zinc-500">Type at least 2 characters.</li>
          ) : results.length === 0 && !busy ? (
            <li className="px-4 py-8 text-center text-[12px] text-zinc-500">No matches.</li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
                  onClick={() => {
                    playClick();
                    onPick(r.id);
                  }}
                  onMouseEnter={playHover}
                >
                  <div className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-white/12 bg-zinc-900 shrink-0">
                    {r.image ? (
                      <img src={r.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[11px] font-black text-cyan-200">
                        {r.label.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-white truncate">{r.label}</p>
                    <p className="text-[10px] font-mono text-zinc-500 truncate">{shortAddress(r.id)}</p>
                  </div>
                  <Plus size={16} className="text-cyan-300 shrink-0" />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

const PulseFilterPill: React.FC<{
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <motion.button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={() => {
      playClick();
      onClick();
    }}
    onMouseEnter={playHover}
    layout
    transition={{ type: 'spring', stiffness: 440, damping: 34 }}
    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-all duration-200 ease-out ${
      active
        ? 'bg-cyan-500/20 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(56,232,255,0.15)] ring-1 ring-cyan-400/55'
        : 'text-slate-200 hover:text-white hover:bg-white/[0.05]'
    }`}
  >
    <span className={active ? 'text-cyan-200' : 'text-slate-300'}>{icon}</span>
    {label}
  </motion.button>
);

const PulseLane: React.FC<{
  pulseFilter: PulseFilter;
  onPulseFilterChange: (f: PulseFilter) => void;
  meStances: UserStanceRow[];
  meLoading: boolean;
  meError: string | null;
  mePage: number;
  onMePageChange: (n: number) => void;
  atomCards: SignalAtomTagCard[];
  atomCardsLoading: boolean;
  atomCardsError: string | null;
  yoursTermIds: string[];
  yoursCards: SignalAtomTagCard[];
  yoursLoading: boolean;
  yoursError: string | null;
  onAddToYours: (termId: string) => void;
  onRemoveFromYours: (termId: string) => void;
  yoursModalOpen: boolean;
  onYoursModalOpenChange: (open: boolean) => void;
  queueByTriple: Map<string, SignalPendingPick>;
  viewerAddress: string | null;
  onStance: (row: SignalRow, stance: SignalStance) => void;
  onBumpStanceTrust: (tripleTermId: string, delta: number) => void;
  onSetStanceTrust: (tripleTermId: string, raw: string) => boolean;
}> = ({
  pulseFilter,
  onPulseFilterChange,
  meStances,
  meLoading,
  meError,
  mePage,
  onMePageChange,
  atomCards,
  atomCardsLoading,
  atomCardsError,
  yoursTermIds,
  yoursCards,
  yoursLoading,
  yoursError,
  onAddToYours,
  onRemoveFromYours,
  yoursModalOpen,
  onYoursModalOpenChange,
  queueByTriple,
  viewerAddress,
  onStance,
  onBumpStanceTrust,
  onSetStanceTrust,
}) => {
  const orderedAtomCards = useMemo(() => {
    const tagActivity = (t: SignalAtomTagRow) => t.forCount + t.againstCount;
    const tagHeat = (t: SignalAtomTagRow) => t.forCount * t.againstCount + t.forCount + t.againstCount;
    const cardActivity = (c: SignalAtomTagCard) => c.tags.reduce((s, t) => s + tagActivity(t), 0);
    const cardHeat = (c: SignalAtomTagCard) => c.tags.reduce((s, t) => s + tagHeat(t), 0);

    const pinned = atomCards[0]?.spotlightSourceListLabel
      ? { ...atomCards[0]!, tags: [...atomCards[0]!.tags] }
      : null;
    const tailSource = pinned ? atomCards.slice(1) : atomCards;
    const tail = tailSource.map((c) => ({ ...c, tags: [...c.tags] }));

    if (pulseFilter === 'trending') {
      tail.sort((a, b) => (a.heroIndex ?? 1e9) - (b.heroIndex ?? 1e9));
    } else if (pulseFilter === 'network') {
      tail.sort(
        (a, b) =>
          (a.heroIndex ?? 1e9) - (b.heroIndex ?? 1e9) ||
          cardHeat(b) - cardHeat(a) ||
          cardActivity(b) - cardActivity(a) ||
          b.tags.length - a.tags.length,
      );
    }

    for (const c of tail) {
      c.tags.sort((a, b) => {
        if (pulseFilter === 'network') return tagHeat(b) - tagHeat(a) || tagActivity(b) - tagActivity(a);
        return tagActivity(b) - tagActivity(a) || (b.weight > a.weight ? 1 : a.weight > b.weight ? -1 : 0);
      });
    }

    return pinned ? [pinned, ...tail] : tail;
  }, [atomCards, pulseFilter]);

  const hasAtomFeed = orderedAtomCards.length > 0;

  const heroAndPills = (
    <>
      <div className="rounded-2xl border border-white/[0.1] bg-slate-950/75 px-5 py-5 sm:px-7 sm:py-5">
        <div className="flex items-center gap-3.5">
          <div
            className="shrink-0 w-11 h-11 rounded-2xl border border-cyan-400/45 bg-cyan-500/15 flex items-center justify-center"
            aria-hidden
          >
            <HeartPulse size={22} className="text-cyan-100" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-black font-display text-white leading-tight">Pulse</h2>
            <p className="text-[13px] text-slate-300 mt-0.5">Support or oppose claims, then submit.</p>
          </div>
        </div>
        <div
          className="mt-4 inline-flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/45 p-1"
          role="tablist"
          aria-label="Pulse feed filter"
        >
          <PulseFilterPill
            active={pulseFilter === 'trending'}
            onClick={() => onPulseFilterChange('trending')}
            icon={<Flame size={13} strokeWidth={2.4} />}
            label="Hot"
          />
          <PulseFilterPill
            active={pulseFilter === 'network'}
            onClick={() => onPulseFilterChange('network')}
            icon={<Users size={13} strokeWidth={2.4} />}
            label="Crowd"
          />
          <PulseFilterPill
            active={pulseFilter === 'for-you'}
            onClick={() => onPulseFilterChange('for-you')}
            icon={<Hash size={13} strokeWidth={2.4} />}
            label="Yours"
          />
          <PulseFilterPill
            active={pulseFilter === 'me'}
            onClick={() => onPulseFilterChange('me')}
            icon={<Radio size={13} strokeWidth={2.4} />}
            label="My stakes"
          />
        </div>
      </div>
    </>
  );

  if (pulseFilter === 'me') {
    if (!viewerAddress?.startsWith('0x')) {
      return (
        <div className="space-y-4">
          {heroAndPills}
          <div className="rounded-2xl border border-white/[0.08] bg-black/40 px-6 py-14 text-center">
            <p className="text-[14px] text-white font-semibold">Connect a wallet to see what you have staked.</p>
            <p className="text-[12px] text-slate-300 mt-2 max-w-md mx-auto leading-relaxed">
              <strong className="text-cyan-200">My stakes</strong> shows every triple where you put TRUST on the
              positive or counter vault. To lean the other way, queue the opposite stance in the cart and submit a
              new on-chain deposit; unstake opens the market vault.
            </p>
          </div>
        </div>
      );
    }
    if (meLoading && meStances.length === 0) {
      return (
        <div className="space-y-4">
          {heroAndPills}
          <div className="flex flex-col items-center gap-2 py-16">
            <Loader2 className="w-7 h-7 text-cyan-300 animate-spin" />
            <span className="text-[12px] font-semibold uppercase tracking-widest text-slate-300">
              Loading your stances…
            </span>
          </div>
        </div>
      );
    }
    if (meError) {
      return (
        <div className="space-y-4">
          {heroAndPills}
          <p className="text-center text-[13px] text-rose-300 py-10">{meError}</p>
        </div>
      );
    }
    if (meStances.length === 0) {
      return (
        <div className="space-y-4">
          {heroAndPills}
          <div className="rounded-2xl border border-white/[0.08] bg-black/40 px-6 py-14 text-center">
            <Sparkles className="mx-auto mb-3 text-cyan-300" size={24} />
            <p className="text-[14px] text-white font-semibold">You have not staked on any triples yet.</p>
            <p className="text-[12px] text-slate-300 mt-1 max-w-sm mx-auto leading-relaxed">
              Queue Support or Oppose on the <strong className="text-cyan-200">identity claim rail</strong> above, then submit from the conviction cart.
            </p>
            <p className="text-[11px] text-slate-500 mt-3 max-w-md mx-auto leading-relaxed">
              If you just confirmed on-chain, stakes can take a few minutes to show here while the indexer catches up — use{' '}
              <strong className="text-slate-400">Refresh</strong> at the top of Signal.
            </p>
          </div>
        </div>
      );
    }

    const totalPages = Math.max(1, Math.ceil(meStances.length / ME_PAGE_SIZE));
    const safePage = Math.min(mePage, totalPages - 1);
    const start = safePage * ME_PAGE_SIZE;
    const pageRows = meStances.slice(start, start + ME_PAGE_SIZE);

    return (
      <div className="space-y-4">
        {heroAndPills}
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[12px] text-slate-300">
            <strong className="text-white tabular-nums">{meStances.length}</strong> stake{meStances.length === 1 ? '' : 's'} ·
            <span className="text-slate-400"> showing {start + 1}–{start + pageRows.length}</span>
          </p>
          <Link
            to="/portfolio"
            onClick={playClick}
            onMouseEnter={playHover}
            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-cyan-300 hover:text-cyan-100"
          >
            Manage in portfolio
            <ExternalLink size={11} className="opacity-80" />
          </Link>
        </div>
        <ul className="space-y-2.5">
          {pageRows.map((it) => {
            const queued = queueByTriple.get(it.tripleTermId);
            const oppositeStance: SignalStance = it.support ? 'oppose' : 'stand';
            const oppositeQueued = queued?.stance === oppositeStance;
            return (
              <li
                key={it.tripleTermId}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-2xl border border-white/[0.1] bg-slate-950/65 px-4 py-3.5 hover:border-white/20 transition-colors"
              >
                <div className="shrink-0 h-12 w-12 rounded-full overflow-hidden ring-1 ring-white/15 bg-slate-900">
                  {it.subjectImage ? (
                    <img src={it.subjectImage} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[13px] font-black text-cyan-100">
                      {it.subjectLabel.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-[14px] font-bold text-white leading-tight truncate max-w-full">{it.subjectLabel}</p>
                    <span
                      className="text-[12px] font-semibold text-teal-300 truncate max-w-[14rem]"
                      title={it.objectLabel}
                    >
                      {shortTag(it.objectLabel, 28)}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-200 mt-1 font-mono">
                    <span className="tabular-nums text-white">{fmtTrust(it.trustAmount)}T</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                        it.support
                          ? 'bg-amber-500/15 border-amber-300/40 text-amber-100'
                          : 'bg-rose-500/15 border-rose-300/40 text-rose-100'
                      }`}
                    >
                      {it.support ? 'Agreed' : 'Disagreed'}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                  <button
                    type="button"
                    onClick={() => onStance(
                      {
                        tripleTermId: it.tripleTermId,
                        counterTermId: it.counterTermId,
                        subjectLabel: it.subjectLabel,
                        subjectImage: it.subjectImage,
                        predicateLabel: it.predicateLabel,
                        objectLabel: it.objectLabel,
                        objectImage: it.objectImage,
                        forCount: 0,
                        againstCount: 0,
                        totalAssetsForLabel: '0',
                        totalAssetsAgainstLabel: '0',
                        createdAt: it.ordering,
                      },
                      oppositeStance,
                    )}
                    onMouseEnter={playHover}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                      oppositeQueued
                        ? 'bg-amber-500/25 border-amber-300/60 text-amber-50'
                        : 'border-white/15 bg-black/40 text-slate-100 hover:text-white hover:border-white/40'
                    }`}
                    title={`Queue ${it.support ? 'Oppose' : 'Support'} in the conviction cart — you submit a separate vault deposit; this is not a one-tap “flip” like some other apps.`}
                  >
                    <ArrowLeftRight size={13} strokeWidth={2.3} />
                    {oppositeQueued
                      ? 'Opposite in cart'
                      : it.support
                        ? 'Oppose instead'
                        : 'Support instead'}
                  </button>
                  <Link
                    to={`/markets/${encodeURIComponent(it.tripleTermId)}`}
                    onClick={playClick}
                    onMouseEnter={playHover}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-100 hover:text-white hover:border-cyan-400/45"
                    title="Open the market vault to unstake"
                  >
                    <LogOut size={13} strokeWidth={2.3} />
                    Unstake
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => onMePageChange(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              onMouseEnter={playHover}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-100 hover:text-white hover:border-white/35 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <p className="text-[12px] text-slate-300 font-mono tabular-nums">
              Page <span className="text-white font-bold">{safePage + 1}</span> / {totalPages}
            </p>
            <button
              type="button"
              onClick={() => onMePageChange(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              onMouseEnter={playHover}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-100 hover:text-white hover:border-white/35 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (pulseFilter === 'for-you') {
    const yoursHasIds = yoursTermIds.length > 0;
    const showYoursLoad = yoursLoading && yoursHasIds && yoursCards.length === 0;

    return (
      <div className="space-y-4">
        {heroAndPills}
        <motion.div
          key="pulse-tab-yours"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          <PulseYoursSearchModal
            open={yoursModalOpen}
            onClose={() => onYoursModalOpenChange(false)}
            onPick={(id) => {
              onAddToYours(id);
              onYoursModalOpenChange(false);
            }}
          />
          {showYoursLoad ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <Loader2 className="w-7 h-7 text-cyan-300 animate-spin" />
              <span className="text-[12px] font-semibold uppercase tracking-widest text-slate-300">
                Loading your atoms…
              </span>
            </div>
          ) : !yoursHasIds ? (
            <div className="rounded-2xl border border-white/[0.08] bg-black/40 px-6 py-12 text-center">
              <Hash className="mx-auto mb-2 text-cyan-300" size={22} />
              <p className="text-[14px] text-white font-semibold">Nothing saved yet.</p>
              <p className="text-[12px] text-slate-400 mt-2 max-w-sm mx-auto">
                Heart atoms on <strong className="text-cyan-200">Hot</strong>/<strong className="text-cyan-200">Crowd</strong>,
                or search to add.
              </p>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  onYoursModalOpenChange(true);
                }}
                onMouseEnter={playHover}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/55 bg-cyan-500/15 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-cyan-50 hover:bg-cyan-500/25"
              >
                <Plus size={16} />
                Search atoms
              </button>
            </div>
          ) : (
            <motion.div
              key="yours-body"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              {yoursError && yoursCards.length === 0 ? (
                <p className="text-center text-[13px] text-rose-300 py-4">{yoursError}</p>
              ) : null}
              {!yoursLoading && yoursCards.length === 0 && !yoursError ? (
                <div className="rounded-2xl border border-white/[0.08] bg-black/40 px-6 py-8 text-center">
                  <p className="text-[13px] text-slate-300 max-w-md mx-auto leading-relaxed">
                    No claims for these atoms yet. Try <strong className="text-cyan-200">Refresh</strong> or{' '}
                    <strong className="text-cyan-200">Add</strong>.
                  </p>
                </div>
              ) : null}
              <PulseAtomTagSection
                atomCards={yoursCards}
                loading={yoursLoading && yoursCards.length === 0}
                error={yoursError}
                queueByTriple={queueByTriple}
                viewerAddress={viewerAddress}
                onStance={onStance}
                onBumpStanceTrust={onBumpStanceTrust}
                onSetStanceTrust={onSetStanceTrust}
                rail="yours"
                atomTone="yours"
                yoursTermIds={yoursTermIds}
                onAddToYours={onAddToYours}
                onRemoveFromYours={onRemoveFromYours}
                onOpenYoursSearch={() => onYoursModalOpenChange(true)}
                claimsCollapsible={true}
                favoritable={false}
              />
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  if (atomCardsError && !hasAtomFeed) {
    return (
      <div className="space-y-4">
        {heroAndPills}
        <p className="text-center text-[13px] text-rose-300 py-10">{atomCardsError}</p>
      </div>
    );
  }

  if (!atomCardsLoading && !hasAtomFeed) {
    return (
      <div className="space-y-4">
        {heroAndPills}
        <div className="rounded-2xl border border-white/[0.08] bg-black/40 px-6 py-12 text-center">
          <Sparkles className="mx-auto mb-2 text-cyan-300" size={22} />
          <p className="text-[14px] text-white font-semibold">Nothing to show yet.</p>
          <p className="text-[12px] text-slate-300 mt-2 max-w-sm mx-auto">Try Refresh or switch tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {heroAndPills}

      <motion.div
        key={pulseFilter === 'network' ? 'pulse-atoms-crowd' : 'pulse-atoms-hot'}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          pulseFilter === 'network'
            ? { duration: 0.28, ease: [0.34, 1.15, 0.64, 1] }
            : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
        }
      >
        <PulseAtomTagSection
          atomCards={orderedAtomCards}
          loading={atomCardsLoading && !hasAtomFeed}
          error={atomCardsError}
          queueByTriple={queueByTriple}
          viewerAddress={viewerAddress}
          onStance={onStance}
          onBumpStanceTrust={onBumpStanceTrust}
          onSetStanceTrust={onSetStanceTrust}
          rail="hotCrowd"
          atomTone={pulseFilter === 'network' ? 'crowd' : 'hot'}
          yoursTermIds={yoursTermIds}
          onAddToYours={onAddToYours}
          onRemoveFromYours={onRemoveFromYours}
          claimsCollapsible={pulseFilter === 'trending' || pulseFilter === 'network'}
          favoritable={pulseFilter === 'trending' || pulseFilter === 'network'}
        />
      </motion.div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Pulse · Identity atom cards — portal-style rail (teal tags + stake + gold thumbs)            */
/* -------------------------------------------------------------------------- */

/** Hide redundant “has tag” line; show predicate when it adds meaning (graph-driven). */
function pulseTagRowCaption(tag: SignalAtomTagRow): string | null {
  const p = tag.predicateLabel.trim().toLowerCase().replace(/_/g, ' ');
  if (p === 'has tag' || p.includes('has tag')) return null;
  return shortPredicate(tag.predicateLabel);
}

function atomTagToSignalRow(tag: SignalAtomTagRow): SignalRow {
  return {
    tripleTermId: tag.tripleTermId,
    counterTermId: tag.counterTermId,
    subjectLabel: tag.subjectLabel,
    subjectImage: tag.subjectImage,
    predicateLabel: tag.predicateLabel,
    objectLabel: tag.objectLabel,
    forCount: tag.forCount,
    againstCount: tag.againstCount,
    totalAssetsForLabel: tag.totalAssetsForLabel,
    totalAssetsAgainstLabel: tag.totalAssetsAgainstLabel,
    createdAt: 0,
  };
}

const PulseAtomTagSection: React.FC<{
  atomCards: SignalAtomTagCard[];
  loading: boolean;
  error: string | null;
  queueByTriple: Map<string, SignalPendingPick>;
  viewerAddress: string | null;
  onStance: (row: SignalRow, stance: SignalStance) => void;
  onBumpStanceTrust: (tripleTermId: string, delta: number) => void;
  onSetStanceTrust: (tripleTermId: string, raw: string) => boolean;
  rail: 'hotCrowd' | 'yours';
  atomTone: 'hot' | 'crowd' | 'yours';
  yoursTermIds?: string[];
  onAddToYours?: (termId: string) => void;
  onRemoveFromYours?: (termId: string) => void;
  onOpenYoursSearch?: () => void;
  claimsCollapsible: boolean;
  favoritable: boolean;
}> = ({
  atomCards,
  loading,
  error,
  queueByTriple,
  viewerAddress,
  onStance,
  onBumpStanceTrust,
  onSetStanceTrust,
  rail,
  atomTone,
  yoursTermIds = [],
  onAddToYours,
  onRemoveFromYours,
  onOpenYoursSearch,
  claimsCollapsible,
  favoritable,
}) => {
  const reduceMotion = useReducedMotion();
  const inYours = (termId: string) => yoursTermIds.some((t) => pulseTermIdsMatch(t, termId));

  const atomsHeading =
    rail === 'yours'
      ? 'Your atoms'
      : atomTone === 'crowd'
        ? 'Atoms · live order'
        : 'Atoms · curated heat';

  const gridClass = 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-start';

  if (loading && atomCards.length === 0) {
    return (
      <div className="space-y-3">
        <p className="px-1 text-[11px] font-medium text-slate-500 max-w-xl">
          Each card loads that identity on the Intuition graph, then triples and vault stats per atom (the same depth
          as a market claim view). That means many requests—first load is slower; Hot and Crowd are then cached in
          this browser for a while.
        </p>
        <div className={gridClass}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`pulse-skel-${i}`}
              className="rounded-2xl border border-white/[0.06] bg-slate-950/50 p-4 animate-pulse space-y-3"
            >
              <div className="flex gap-3">
                <div className="h-12 w-12 shrink-0 rounded-xl bg-slate-800/80" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-slate-800/80" />
                  <div className="h-4 w-3/4 max-w-[200px] rounded bg-slate-700/70" />
                  <div className="h-3 w-full rounded bg-slate-800/60" />
                </div>
              </div>
              <div className="h-16 w-full rounded-lg bg-slate-800/50" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-9 rounded-lg bg-cyan-950/40" />
                <div className="h-9 rounded-lg bg-rose-950/35" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (atomCards.length === 0) {
    if (!error) return null;
    return (
      <p className="text-center text-[13px] text-rose-300 py-6" role="alert">
        {error}
      </p>
    );
  }

  const cardProps = (card: SignalAtomTagCard, gridIndex: number) => ({
    card,
    queueByTriple,
    viewerAddress,
    onStance,
    onBumpStanceTrust,
    onSetStanceTrust,
    claimsCollapsible,
    favoritable: favoritable && !card.pulseSlotKind,
    atomTone,
    initialClaimsExpanded:
      claimsCollapsible && (atomTone === 'crowd' || atomTone === 'hot')
        ? (gridIndex + 2) % 5 === 0 || (gridIndex + 1) % 7 === 0
        : undefined,
    inYoursList: inYours(card.subjectTermId),
    yoursRail: rail === 'yours',
    onAddToYours: () => onAddToYours?.(card.subjectTermId),
    onRemoveFromYours: () => onRemoveFromYours?.(card.subjectTermId),
  });

  const staggerHotOrCrowd = (atomTone === 'crowd' || atomTone === 'hot') && !reduceMotion;
  const staggerDelays =
    atomTone === 'crowd'
      ? { stagger: 0.065, delayChildren: 0.03, y: 14 }
      : { stagger: 0.048, delayChildren: 0.02, y: 10 };

  const gridInner = staggerHotOrCrowd ? (
    <motion.div
      className={gridClass}
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: { staggerChildren: staggerDelays.stagger, delayChildren: staggerDelays.delayChildren },
        },
      }}
    >
      {atomCards.map((card, gridIndex) => (
        <motion.div
          key={`${card.heroIndex ?? gridIndex}-${card.subjectTermId}`}
          variants={{
            hidden: { opacity: 0, y: staggerDelays.y },
            visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
          }}
        >
          <PulseAtomTagCard {...cardProps(card, gridIndex)} />
        </motion.div>
      ))}
    </motion.div>
  ) : (
    <div className={gridClass}>
      {atomCards.map((card, gridIndex) => (
        <PulseAtomTagCard key={`${card.heroIndex ?? gridIndex}-${card.subjectTermId}`} {...cardProps(card, gridIndex)} />
      ))}
    </div>
  );

  return (
    <section aria-labelledby="signal-atoms-heading" className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200" role="alert">
          {error}
        </p>
      ) : null}
      <header className="px-1 flex flex-wrap items-center justify-between gap-3">
        <h3 id="signal-atoms-heading" className="text-[13px] sm:text-sm font-bold text-white uppercase tracking-wider">
          {atomsHeading}
          {atomTone === 'crowd' ? (
            <span className="block text-[10px] font-semibold normal-case tracking-normal text-amber-200/85 mt-0.5">
              Crowd-weighted · same heat rail as Hot (amber → violet → red)
            </span>
          ) : atomTone === 'hot' ? (
            <span className="block text-[10px] font-semibold normal-case tracking-normal text-amber-200/85 mt-0.5">
              Curated spotlight · gold rail
            </span>
          ) : null}
        </h3>
        {rail === 'yours' && onOpenYoursSearch ? (
          <button
            type="button"
            onClick={() => {
              playClick();
              onOpenYoursSearch();
            }}
            onMouseEnter={playHover}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/15 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-cyan-50 hover:bg-cyan-500/25 transition-colors duration-200"
            title="Search atoms"
          >
            <Plus size={14} strokeWidth={2.4} />
            Add
          </button>
        ) : null}
      </header>

      {gridInner}
    </section>
  );
};

const PulseStanceChip: React.FC<{
  polarity: 'for' | 'against';
  active: boolean;
  onClick: () => void;
  title: string;
}> = ({ polarity, active, onClick, title }) => {
  const Icon = polarity === 'for' ? ThumbsUp : ThumbsDown;
  const forCls = active
    ? 'border-cyan-400 bg-cyan-500/25 text-cyan-50 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]'
    : 'border-cyan-500/40 bg-zinc-950/80 text-cyan-400/95 hover:bg-cyan-500/10 hover:border-cyan-400/65';
  const againstCls = active
    ? 'border-red-400 bg-red-600/25 text-red-50 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.4)]'
    : 'border-red-500/40 bg-zinc-950/80 text-red-300/95 hover:bg-red-500/10 hover:border-red-400/65';
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={playHover}
      aria-pressed={active}
      title={title}
      className={`inline-flex items-center justify-center rounded-lg border-2 p-1.5 transition-all duration-200 ease-out ${polarity === 'for' ? forCls : againstCls}`}
    >
      <Icon size={15} strokeWidth={2.35} />
    </button>
  );
};

const PulseAtomTagCard: React.FC<{
  card: SignalAtomTagCard;
  queueByTriple: Map<string, SignalPendingPick>;
  viewerAddress: string | null;
  onStance: (row: SignalRow, stance: SignalStance) => void;
  onBumpStanceTrust: (tripleTermId: string, delta: number) => void;
  onSetStanceTrust: (tripleTermId: string, raw: string) => boolean;
  claimsCollapsible: boolean;
  favoritable: boolean;
  atomTone: 'hot' | 'crowd' | 'yours';
  /** Crowd-only: open claims by default for ~⅓ of cards (mixed collapsed / expanded). */
  initialClaimsExpanded?: boolean;
  inYoursList: boolean;
  yoursRail: boolean;
  onAddToYours: () => void;
  onRemoveFromYours: () => void;
}> = ({
  card,
  queueByTriple,
  viewerAddress,
  onStance,
  onBumpStanceTrust,
  onSetStanceTrust,
  claimsCollapsible,
  favoritable,
  atomTone,
  initialClaimsExpanded,
  inYoursList,
  yoursRail,
  onAddToYours,
  onRemoveFromYours,
}) => {
  const [claimsOpen, setClaimsOpen] = useState(() => {
    if (!claimsCollapsible) return true;
    if (card.tags.length === 0 || card.pulseSlotKind) return true;
    if (initialClaimsExpanded !== undefined) return initialClaimsExpanded;
    return false;
  });

  useEffect(() => {
    if (!claimsCollapsible) setClaimsOpen(true);
  }, [claimsCollapsible]);

  const allTags = card.tags;
  const claimPages = Math.max(1, Math.ceil(allTags.length / ATOM_CLAIMS_PAGE_SIZE));
  const [claimPage, setClaimPage] = useState(0);

  useEffect(() => {
    setClaimPage(0);
  }, [card.subjectTermId]);

  useEffect(() => {
    setClaimPage((p) => Math.min(p, Math.max(0, claimPages - 1)));
  }, [claimPages]);

  const safePage = Math.min(claimPage, claimPages - 1);
  const claimStart = safePage * ATOM_CLAIMS_PAGE_SIZE;
  const pageTags = allTags.slice(claimStart, claimStart + ATOM_CLAIMS_PAGE_SIZE);

  const showBody = !claimsCollapsible || claimsOpen;

  const slotKind = card.pulseSlotKind;
  const emptySlotCopy =
    slotKind === 'unresolved'
      ? 'Not indexed under this label yet — the graph may be catching up.'
      : slotKind === 'empty_claims'
        ? 'Atom resolved, but no “has tag” claims with vaults are wired for this slot yet.'
        : 'Nothing on this page.';

  const listInner = (
    <>
      {pageTags.length === 0 ? (
        <div className="px-4 py-6 text-center border-t border-zinc-800/60">
          <p className="text-[12px] text-zinc-400 leading-relaxed max-w-md mx-auto">{emptySlotCopy}</p>
        </div>
      ) : (
        <>
      <div className="relative px-3 py-1">
            <div
              className="absolute left-[15px] top-2 bottom-2 w-px bg-teal-500/40 rounded-full pointer-events-none"
              aria-hidden
            />
            <ul className="divide-y divide-zinc-800/55">
              {pageTags.map((tag) => {
                const queued = queueByTriple.get(tag.tripleTermId);
                const standActive = queued?.stance === 'stand';
                const opposeActive = queued?.stance === 'oppose';
                const row = atomTagToSignalRow(tag);
                const caption = pulseTagRowCaption(tag);
                return (
                  <li
                    key={tag.tripleTermId}
                    className={`flex items-center gap-2 pl-3 sm:pl-4 pr-1 py-2.5 transition-colors ${
                      queued
                        ? standActive
                          ? 'bg-cyan-500/[0.06]'
                          : 'bg-fuchsia-500/[0.07]'
                        : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[13px] sm:text-[14px] font-semibold text-teal-200/95 truncate leading-snug"
                        title={tag.objectLabel}
                      >
                        {shortTag(tag.objectLabel, 44)}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {caption ? (
                          <p className="text-[10px] text-zinc-500 leading-snug truncate">{caption}</p>
                        ) : null}
                        <p className="text-[10px] text-zinc-600 tabular-nums">
                          Pool TVL <span className="text-zinc-500">{tag.totalAssetsForLabel} T</span>
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                      {queued ? (
                        <SignalStanceTrustControls
                          tripleTermId={tag.tripleTermId}
                          unitsTrust={queued.unitsTrust}
                          onBump={onBumpStanceTrust}
                          onSet={onSetStanceTrust}
                        />
                      ) : null}
                      <div className="flex items-center gap-0.5">
                        <PulseStanceChip
                          polarity="for"
                          active={standActive}
                          title="Support this claim"
                          onClick={() => onStance(row, 'stand')}
                        />
                        <PulseStanceChip
                          polarity="against"
                          active={opposeActive}
                          title="Oppose this claim"
                          onClick={() => onStance(row, 'oppose')}
                        />
                        {queued ? (
                          <button
                            type="button"
                            onClick={() => {
                              playClick();
                              removeSignalPending(viewerAddress, tag.tripleTermId);
                            }}
                            onMouseEnter={playHover}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-white/5 ml-0.5"
                            title="Remove from queue"
                            aria-label="Unqueue"
                          >
                            <X size={13} strokeWidth={2.3} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          {claimPages > 1 ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-zinc-800/80 bg-black/30">
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setClaimPage((p) => Math.max(0, Math.min(p, claimPages - 1) - 1));
                }}
                disabled={safePage === 0}
                onMouseEnter={playHover}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-200 hover:text-white hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
                Prev
              </button>
              <p className="text-[11px] text-zinc-500 font-mono tabular-nums shrink-0">
                {safePage + 1} / {claimPages}
              </p>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setClaimPage((p) => Math.min(claimPages - 1, Math.min(p, claimPages - 1) + 1));
                }}
                disabled={safePage >= claimPages - 1}
                onMouseEnter={playHover}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-200 hover:text-white hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );

  const toneShell =
    atomTone === 'crowd'
      ? 'border-amber-700/55 shadow-[0_0_30px_rgba(232,197,71,0.15),0_0_36px_rgba(192,132,252,0.1)]'
      : atomTone === 'yours'
        ? 'border-cyan-900/55 shadow-[0_0_24px_rgba(34,211,238,0.1)]'
        : atomTone === 'hot'
          ? 'border-amber-700/55 shadow-[0_0_30px_rgba(232,197,71,0.18)]'
          : 'border-zinc-800/90';
  const toneBar =
    atomTone === 'crowd' ? (
      <div
        className="h-[3px] w-full shrink-0 bg-gradient-to-r from-amber-400/80 via-fuchsia-500/55 to-rose-600/55"
        aria-hidden
      />
    ) : atomTone === 'yours' ? (
      <div
        className="h-[3px] w-full shrink-0 bg-gradient-to-r from-cyan-500/55 via-teal-500/35 to-transparent"
        aria-hidden
      />
    ) : atomTone === 'hot' ? (
      <div
        className="h-[3px] w-full shrink-0 bg-gradient-to-r from-amber-400/85 via-orange-500/55 via-fuchsia-500/35 to-rose-600/50"
        aria-hidden
      />
    ) : null;

  return (
    <div
      className={`rounded-2xl border bg-zinc-950/95 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] self-start w-full transition-shadow duration-200 ${toneShell}`}
    >
      {toneBar}
      <div className="px-4 pt-3.5 pb-3 flex items-center gap-3 border-b border-zinc-800/85">
        <div
          className="shrink-0 w-10 h-10 rounded-full bg-zinc-900 ring-1 ring-white/10 flex items-center justify-center overflow-hidden"
          aria-hidden
        >
          {card.subjectImage ? (
            <img src={card.subjectImage} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <User size={18} className="text-zinc-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h4 className="text-[15px] font-bold text-white leading-tight truncate" title={card.subjectLabel}>
              {card.subjectLabel}
            </h4>
            <span className="text-[12px] text-zinc-400 tabular-nums">{allTags.length} claims</span>
          </div>
          {card.spotlightSourceListLabel ? (
            <p className="text-[10px] text-zinc-500 mt-0.5 truncate font-mono">{card.spotlightSourceListLabel}</p>
          ) : null}
          {showBody && claimPages > 1 ? (
            <p className="text-[10px] text-zinc-500 mt-0.5 font-mono tabular-nums">
              Page {safePage + 1} / {claimPages}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-0.5">
          {yoursRail ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playClick();
                onRemoveFromYours();
              }}
              onMouseEnter={playHover}
              className="mr-1 rounded-lg border border-white/10 bg-black/35 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-200 hover:text-rose-200 hover:border-rose-400/45 transition-colors duration-200"
              title="Remove from list"
            >
              Remove
            </button>
          ) : null}
          {favoritable ? (
            <motion.button
              type="button"
              onClick={() => {
                playClick();
                if (inYoursList) onRemoveFromYours();
                else onAddToYours();
              }}
              onMouseEnter={playHover}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 520, damping: 28 }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-300 hover:bg-white/[0.04]"
              aria-label={inYoursList ? 'Remove from Yours' : 'Add to Yours'}
              title={inYoursList ? 'Remove from Yours' : 'Add to Yours'}
            >
              <Heart
                size={17}
                strokeWidth={2.2}
                className={`transition-colors duration-200 ${inYoursList ? 'fill-rose-400 text-rose-400' : ''}`}
              />
            </motion.button>
          ) : null}
          {claimsCollapsible && card.tags.length > 0 ? (
            <motion.button
              type="button"
              onClick={() => {
                playClick();
                setClaimsOpen((o) => !o);
              }}
              onMouseEnter={playHover}
              aria-expanded={claimsOpen}
              title={claimsOpen ? 'Collapse' : 'Expand'}
              whileTap={{ scale: 0.94 }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors duration-200"
            >
              <ChevronDown
                size={18}
                strokeWidth={2.2}
                className={`transition-transform duration-300 ease-out ${claimsOpen ? 'rotate-180' : ''}`}
              />
            </motion.button>
          ) : null}
          <div className="shrink-0 flex items-center p-1.5 ml-0.5 border-l border-zinc-800/90 text-zinc-500" title="Live vaults">
            <Users size={14} className="opacity-70 shrink-0" aria-hidden />
          </div>
        </div>
      </div>

      {claimsCollapsible ? (
        <div
          className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            showBody ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="min-h-0 overflow-hidden">{listInner}</div>
        </div>
      ) : (
        listInner
      )}
    </div>
  );
};

const VouchLane: React.FC<{
  namedRows: SignalNamedIdentityRow[];
  loading: boolean;
  error: string | null;
  queueByAccount: Map<string, SignalVouchPick>;
  viewerAddress: string | null;
  onVouch: (row: SignalNamedIdentityRow) => void;
}> = ({ namedRows, loading, error, queueByAccount, viewerAddress, onVouch }) => {
  const sorted = useMemo(() => {
    return [...namedRows].sort((a, b) => {
      if (b.totalAssetsWei !== a.totalAssetsWei) return b.totalAssetsWei > a.totalAssetsWei ? 1 : -1;
      if (b.positionCount !== a.positionCount) return b.positionCount - a.positionCount;
      return a.label.localeCompare(b.label);
    });
  }, [namedRows]);

  if (loading && namedRows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <Loader2 className="w-8 h-8 text-amber-400/85 animate-spin" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Loading names from the graph…
        </span>
      </div>
    );
  }
  if (error) {
    return <p className="text-center text-[13px] text-rose-300/95 py-14">{error}</p>;
  }
  if (namedRows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 px-8 py-16 text-center max-w-xl mx-auto">
        <Shield className="mx-auto mb-3 text-amber-300" size={28} />
        <p className="text-[13px] text-slate-200 font-semibold">No `.eth` / `.trust` rows from the graph.</p>
        <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
          Refresh pulls vault atoms and the accounts index. If the subgraph lags, names can appear after sync.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/[0.1] bg-slate-950/70 px-4 py-5 sm:px-6 sm:py-6 max-w-3xl">
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 w-11 h-11 rounded-2xl border border-orange-400/35 bg-orange-500/10 flex items-center justify-center"
            aria-hidden
          >
            <Users size={22} className="text-orange-200" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-black font-display text-white leading-tight">Vouch</h2>
            <p className="text-[14px] text-slate-200 leading-relaxed mt-1">
              Queue trust for the handles below — submit the whole batch from the bar when you&rsquo;re ready.
            </p>
            <p className="text-[12px] font-mono uppercase tracking-[0.16em] text-slate-300 mt-2">
              {sorted.length} names · heavier vaults first
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-2.5 max-h-[min(72vh,840px)] overflow-y-auto pr-1">
        {sorted.map((i) => {
          const rk = i.rowKey.toLowerCase();
          const queued = queueByAccount.get(rk);
          const vw = viewerAddress?.toLowerCase() ?? '';
          const isSelf =
            Boolean(viewerAddress) &&
            (Boolean(i.walletId && vw === i.walletId.toLowerCase()) || (i.rowKey.length === 42 && vw === rk));
          const profileHref =
            i.walletId && i.walletId.startsWith('0x')
              ? `/profile/${encodeURIComponent(i.walletId)}`
              : i.termId
                ? `/markets/${encodeURIComponent(i.termId)}`
                : null;
          const metaLine = i.walletId
            ? shortAddress(i.walletId)
            : i.termId
              ? `${shortAddress(i.termId)} · vault`
              : shortAddress(i.rowKey);
          return (
            <li
              key={rk}
              className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
                queued
                  ? 'border-orange-400/45 bg-orange-500/[0.07] shadow-[0_0_18px_rgba(251,146,60,0.08)]'
                  : 'border-white/[0.08] bg-black/35 hover:border-white/20'
              }`}
            >
              <div className="shrink-0 h-11 w-11 rounded-full overflow-hidden ring-1 ring-white/15 bg-slate-900">
                {i.image ? (
                  <img src={i.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div
                    className={`h-full w-full flex items-center justify-center text-[12px] font-black ${
                      i.tld === '.trust' ? 'text-amber-200' : 'text-cyan-200'
                    }`}
                  >
                    {i.label.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-white truncate flex items-center gap-2 flex-wrap">
                  <span className="truncate">{i.label}</span>
                  <span
                    className={`shrink-0 text-[10px] font-mono font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      i.tld === '.trust'
                        ? 'bg-amber-500/25 text-amber-50 border border-amber-400/55'
                        : 'bg-cyan-500/25 text-cyan-50 border border-cyan-400/55'
                    }`}
                  >
                    {i.tld.replace('.', '')}
                  </span>
                  {i.source === 'vault' ? (
                    <span className="text-[10px] font-mono uppercase text-slate-200 border border-white/15 rounded px-1.5 py-0.5">
                      vault
                    </span>
                  ) : null}
                </p>
                <p className="text-[12px] text-slate-200 mt-1">
                  <span className="tabular-nums text-white font-bold">{i.positionCount.toLocaleString()}</span> positions
                </p>
                {profileHref ? (
                  <Link
                    to={profileHref}
                    onClick={playClick}
                    onMouseEnter={playHover}
                    className="text-[12px] font-mono text-slate-200 hover:text-cyan-200 truncate block mt-0.5"
                    title={i.termId ? 'Open market' : 'Profile'}
                  >
                    {metaLine} ↗
                  </Link>
                ) : (
                  <span className="text-[12px] font-mono text-slate-300 mt-0.5 block">{metaLine}</span>
                )}
              </div>
              <button
                type="button"
                disabled={Boolean(isSelf)}
                onClick={() => onVouch(i)}
                onMouseEnter={playHover}
                aria-pressed={Boolean(queued)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold uppercase tracking-[0.1em] border transition-colors ${
                  isSelf
                    ? 'border-white/[0.08] text-slate-400 cursor-not-allowed'
                    : queued
                      ? 'bg-orange-600/95 border-orange-300/80 text-white shadow-[0_0_14px_rgba(251,146,60,0.25)]'
                      : 'bg-orange-500 border-orange-400/60 text-white hover:bg-orange-400 hover:border-orange-300'
                }`}
                title={isSelf ? "Can't vouch for self" : queued ? 'Remove from queue' : 'Queue vouch'}
              >
                {queued ? (
                  <>
                    <X size={12} strokeWidth={2.6} />
                    Unqueue
                  </>
                ) : (
                  <>
                    <UserPlus size={12} strokeWidth={2.6} />
                    Vouch
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
