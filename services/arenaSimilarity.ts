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
import type { UserArenaRankingClaim } from './graphql';
import type { RankItem } from '../pages/RankedList';

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
