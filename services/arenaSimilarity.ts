/**
 * Arena similarity — REAL comparison between your ordered deck and a peer's
 * on-chain ranking claims for the same portal list.
 *
 * Data source: `fetchUserArenaRankingClaims` returns FeeProxy-attributed ranks (receiver wallet),
 * deduped to the latest YES/NO per (list, subject). We treat YES as "this belongs on the
 * list" and weight by inverse rank so the top of your deck counts more than
 * the bottom (matches what users intuit when they say "we picked the same #1").
 *
 * Honest about emptiness:
 *  - For non-portal lists (`listTermId` absent) we return `null` — no on-chain
 *    truth to compare against. The UI MUST surface that, not fabricate.
 *  - For portal lists with no peer claims we return `null` (no overlap).
 *  - Only when there is real overlap do we return a similarity score.
 */
import { formatEther } from 'viem';
import type { ArenaProxyDepositRow, UserArenaRankingClaim } from './graphql';
import type { RankItem } from '../pages/RankedList';

/** One row in a peer's full list ranking (ordered by accumulated TRUST on this list). */
export type PortalListRankRow = {
  rank: number;
  subjectId: string;
  label: string;
  image?: string;
  support: boolean;
  trustWei: bigint;
  trustLabel: string;
};

function formatTrustWei(wei: bigint): string {
  if (wei <= 0n) return '—';
  const t = parseFloat(formatEther(wei));
  if (!Number.isFinite(t) || t <= 0) return '—';
  if (t >= 100) return `${Math.round(t)}`;
  const rounded = Math.round(t * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

function listTermMatches(a: string, b: string): boolean {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * Build a peer's ordered ranking for one portal list: total TRUST per identity
 * (all FeeProxy deposits on YES vaults add up), highest first. Latest YES/NO per
 * subject comes from their indexed claims.
 */
export function buildPortalListRankingByAccumulatedTrust(
  wallet: string,
  listTermId: string,
  peerClaims: UserArenaRankingClaim[],
  deposits: ArenaProxyDepositRow[],
  stanceByVault: Map<
    string,
    {
      support: boolean;
      stance: {
        listTermId: string;
        subjectId: string;
        subjectLabel: string;
        subjectImage?: string;
      };
    }
  >,
): PortalListRankRow[] {
  const walletLc = wallet.trim().toLowerCase();
  if (!walletLc || !listTermId) return [];

  const latestSupport = new Map<string, boolean>();
  const meta = new Map<string, { label: string; image?: string }>();
  for (const c of peerClaims) {
    if (!listTermMatches(c.listTermId, listTermId)) continue;
    const sid = String(c.subjectId).toLowerCase();
    latestSupport.set(sid, Boolean(c.support));
    if (!meta.has(sid)) {
      meta.set(sid, { label: c.subjectLabel, image: c.subjectImage });
    }
  }

  const trustBySubject = new Map<string, bigint>();
  for (const dep of deposits) {
    if (normalizeReceiver(dep.receiverId) !== walletLc) continue;
    const stance = stanceByVault.get(dep.vaultTermId);
    if (!stance || !listTermMatches(stance.stance.listTermId, listTermId)) continue;
    if (!stance.support) continue;
    const wei = dep.assetsAfterFeesWei ?? 0n;
    if (wei <= 0n) continue;
    const sid = String(stance.stance.subjectId).toLowerCase();
    trustBySubject.set(sid, (trustBySubject.get(sid) ?? 0n) + wei);
    if (!meta.has(sid)) {
      meta.set(sid, {
        label: stance.stance.subjectLabel,
        image: stance.stance.subjectImage,
      });
    }
  }

  /** Fallback when deposit amounts are missing: order by latest YES stakes. */
  if (trustBySubject.size === 0) {
    const yesRows = peerClaims
      .filter((c) => listTermMatches(c.listTermId, listTermId) && c.support)
      .sort((a, b) => b.blockNumber - a.blockNumber);
    return yesRows.map((c, i) => ({
      rank: i + 1,
      subjectId: c.subjectId,
      label: c.subjectLabel,
      image: c.subjectImage,
      support: true,
      trustWei: 0n,
      trustLabel: '—',
    }));
  }

  const sorted = [...trustBySubject.entries()].sort((a, b) => {
    if (b[1] > a[1]) return 1;
    if (b[1] < a[1]) return -1;
    return 0;
  });

  return sorted.map(([sid, wei], i) => {
    const m = meta.get(sid);
    return {
      rank: i + 1,
      subjectId: sid,
      label: m?.label ?? 'Pick',
      image: m?.image,
      support: latestSupport.get(sid) ?? true,
      trustWei: wei,
      trustLabel: formatTrustWei(wei),
    };
  });
}

function normalizeReceiver(id: string): string {
  const t = id.trim().toLowerCase();
  return t.startsWith('0x') ? t : t;
}

export type ArenaSimilarityResult = {
  /** 0–100, weighted agreement on items in your deck. */
  similarityPct: number;
  /** Distinct subjects that appear in both your deck AND their claims. */
  sharedCount: number;
  /** Subjects you ranked where they said YES. */
  agreeCount: number;
  /** Subjects you ranked where they said NO. */
  disagreeCount: number;
  /** Concrete shared subjects, in YOUR rank order (for chip rendering). */
  sharedSubjects: Array<{
    id: string;
    label: string;
    image?: string;
    myRank: number;
    theirSupport: boolean;
  }>;
};

/**
 * Compute weighted similarity between `myDeck` (ordered) and `peerClaims`
 * (their on-chain support records). Returns `null` when there is nothing
 * comparable rather than inventing a number.
 */
export function computeArenaListSimilarity(
  myDeck: RankItem[],
  peerClaims: UserArenaRankingClaim[],
  listTermId: string | null | undefined,
): ArenaSimilarityResult | null {
  if (!listTermId || myDeck.length === 0 || peerClaims.length === 0) return null;
  const wanted = String(listTermId).toLowerCase();

  /** Most-recent support per subject for THIS list (peerClaims is already
   *  best-per-(list,subject) — but we still filter by list to be safe). */
  const support = new Map<string, boolean>();
  for (const c of peerClaims) {
    if (String(c.listTermId).toLowerCase() !== wanted) continue;
    support.set(String(c.subjectId).toLowerCase(), Boolean(c.support));
  }
  if (support.size === 0) return null;

  const n = myDeck.length;
  /**
   * Per-position weight: top-of-deck matters more. Triangular weights
   * (n, n-1, …, 1) — gives a smooth contribution that doesn't crash to
   * zero on small decks.
   */
  let weightSum = 0;
  let agreeWeight = 0;
  let disagreeWeight = 0;
  let agreeCount = 0;
  let disagreeCount = 0;
  const shared: ArenaSimilarityResult['sharedSubjects'] = [];

  for (let i = 0; i < n; i++) {
    const item = myDeck[i]!;
    const key = String(item.id).toLowerCase();
    const w = n - i;
    weightSum += w;
    const s = support.get(key);
    if (s === undefined) continue;
    shared.push({
      id: item.id,
      label: item.label,
      image: item.image,
      myRank: i + 1,
      theirSupport: s,
    });
    if (s) {
      agreeWeight += w;
      agreeCount += 1;
    } else {
      disagreeWeight += w;
      disagreeCount += 1;
    }
  }

  if (shared.length === 0) return null;

  /**
   * Score = agreeWeight / (agreeWeight + disagreeWeight + missingWeight*0.5).
   * `missing` (items in your deck the peer hasn't ranked) is penalised at
   * half-weight so a peer can score high by agreeing on what they HAVE
   * ranked, even if they haven't touched every item.
   */
  const ratedWeight = agreeWeight + disagreeWeight;
  const missingWeight = Math.max(0, weightSum - ratedWeight);
  const denom = ratedWeight + missingWeight * 0.5;
  const pct = denom <= 0 ? 0 : Math.round((agreeWeight / denom) * 100);

  return {
    similarityPct: Math.max(0, Math.min(100, pct)),
    sharedCount: shared.length,
    agreeCount,
    disagreeCount,
    sharedSubjects: shared,
  };
}

/**
 * Aggregate similarity to a *set* of peers — used to display "you are X%
 * similar to the top of the leaderboard" honestly. Returns `null` when no
 * peer has any overlap with your deck.
 */
export function aggregateSimilarity(
  results: Array<ArenaSimilarityResult | null>,
): { similarityPct: number; contributors: number } | null {
  const live = results.filter((r): r is ArenaSimilarityResult => r !== null && r.sharedCount > 0);
  if (live.length === 0) return null;
  /** Mean weighted by shared-subject count so peers with thin overlap don't dominate. */
  let totalShared = 0;
  let weightedSum = 0;
  for (const r of live) {
    totalShared += r.sharedCount;
    weightedSum += r.similarityPct * r.sharedCount;
  }
  if (totalShared === 0) return null;
  return {
    similarityPct: Math.round(weightedSum / totalShared),
    contributors: live.length,
  };
}
