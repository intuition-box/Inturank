/**
 * Verdict — the answer page for anything on the graph.
 *
 * Assembles one model for the three modes in the design (artboards 1e, 1f, 5a, 5b, 4c, 7e):
 *   • CLAIM  — a statement with a for-vault and an against-vault, so it has a percentage.
 *   • THING  — an atom. No yes/no, because a thing is not a statement; only how much money
 *              holds it and what people claim about it.
 *   • THIN   — either of the above with too few holders to average. The percentage is
 *              deliberately withheld: "a percentage would be theatre".
 *
 * Reads only through existing graph helpers; no new queries. Share price comes from the
 * vault, so the quote here matches the protocol's own arithmetic
 * (25 TRUST ÷ 0.0421 a share = 594 shares, exactly as the artboards show).
 */
import { formatEther } from 'viem';
import {
  getAgentById,
  getVaultsByIds,
  getHoldersForVault,
  getUserPositions,
  getAgentTriplesWithVaults,
  getAtomInclusionLists,
} from './graphql';
import { bestWalletDisplayLabel } from './tns';

/** Below this many holders the crowd has no position worth averaging. */
export const THIN_HOLDER_LIMIT = 10;

/**
 * Protocol fee shown in the quote. The artboards use 0.5% (175 TRUST → 0.88).
 * TODO confirm against MultiVault's on-chain fee config before charging real money;
 * this figure is presentational until then.
 */
export const PROTOCOL_FEE_PCT = 0.005;

export type VerdictMode = 'claim' | 'thing';
export type Side = 'for' | 'against';

export interface VerdictBacker {
  address: string;
  label: string;
  trust: number;
  side: Side;
}

export interface RelatedClaim {
  id: string;
  label: string;
  pctYes: number | null;
  stakedTrust: number;
  holders: number;
}

export interface VerdictModel {
  id: string;
  mode: VerdictMode;
  label: string;
  image?: string;
  monogram: string;
  counterTermId?: string;

  /** Claim mode only. */
  forTrust: number;
  againstTrust: number;
  /** null when thin — the design refuses to print a percentage on a small sample. */
  pctYes: number | null;

  stakedTrust: number;
  holders: number;
  sharePrice: number;
  thin: boolean;

  /** Thing mode only. */
  claimCount: number;
  listCount: number;

  myShares: number;
  myTrust: number;
  myAvgPaid: number;
  myPnlPct: number | null;
  mySide: Side | null;

  backers: VerdictBacker[];
  relatedClaims: RelatedClaim[];
}

const trust = (wei: unknown): number => {
  try {
    return Number(formatEther(BigInt(String(wei ?? '0'))));
  } catch {
    return 0;
  }
};

const monogramFor = (label: string): string =>
  (label || '?')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

/** Value of a position in TRUST: shares × (total_assets ÷ total_shares). */
function positionTrust(shares: unknown, totalAssets: unknown, totalShares: unknown): number {
  try {
    const s = BigInt(String(shares ?? '0'));
    const ta = BigInt(String(totalAssets ?? '0'));
    const ts = BigInt(String(totalShares ?? '0'));
    if (ts === 0n) return 0;
    return Number(formatEther((s * ta) / ts));
  } catch {
    return 0;
  }
}

/** Quote for spending `amountTrust` at the current share price. */
export function quoteDeposit(amountTrust: number, sharePrice: number) {
  const amount = Number.isFinite(amountTrust) && amountTrust > 0 ? amountTrust : 0;
  const fee = amount * PROTOCOL_FEE_PCT;
  const shares = sharePrice > 0 ? amount / sharePrice : 0;
  return { shares, fee, total: amount + fee };
}

/**
 * Load everything Verdict renders for one term. Every sub-fetch is individually guarded:
 * a term with no backers, no related claims or no position still returns a usable model,
 * because the graph is empty far more often than the happy path suggests.
 */
export async function loadVerdict(termId: string, viewer?: string | null): Promise<VerdictModel> {
  const agent: any = await getAgentById(termId);
  const isClaim = String(agent?.type || '').toUpperCase() === 'CLAIM' || !!agent?.counterTermId;
  const counterTermId: string | undefined = agent?.counterTermId;

  // For a claim, the against side is its own vault; fetch both and split by assets.
  let forTrust = trust(agent?.totalAssets);
  let againstTrust = 0;
  let holders = Number(agent?.positionCount || 0);

  if (isClaim && counterTermId) {
    try {
      const vaults: any[] = await getVaultsByIds([counterTermId]);
      const counter = vaults?.[0];
      if (counter) {
        againstTrust = trust(counter.totalAssets);
        holders += Number(counter.positionCount || 0);
      }
    } catch {
      /* no counter vault indexed — treat as unopposed */
    }
  }

  const stakedTrust = isClaim ? forTrust + againstTrust : forTrust;
  const thin = holders < THIN_HOLDER_LIMIT;
  const pctYes = isClaim && !thin && stakedTrust > 0 ? (forTrust / stakedTrust) * 100 : null;
  const sharePrice = Number(agent?.currentSharePrice || 0) || 0;

  // ── Backers, both sides, biggest first ────────────────────────────────────
  const backers: VerdictBacker[] = [];
  const collect = async (id: string, side: Side, assets: number) => {
    try {
      const { holders: rows } = await getHoldersForVault(id);
      const totalShares = String(agent?.totalShares ?? '0');
      for (const row of rows as any[]) {
        const addr = row?.account?.id;
        if (!addr) continue;
        const value =
          side === 'for'
            ? positionTrust(row.shares, agent?.totalAssets, totalShares)
            : positionTrust(row.shares, String(BigInt(Math.round(assets * 1e18) || 0)), totalShares);
        backers.push({ address: addr, label: row?.account?.label || '', trust: value, side });
      }
    } catch {
      /* holders unavailable — the list simply renders empty */
    }
  };
  await collect(termId, 'for', forTrust);
  if (isClaim && counterTermId) await collect(counterTermId, 'against', againstTrust);
  backers.sort((a, b) => b.trust - a.trust);
  const topBackers = backers.slice(0, thin ? 20 : 3);

  // Resolve .trust / ENS names only for the rows actually shown.
  await Promise.all(
    topBackers.map(async (b) => {
      if (!b.label) {
        try {
          b.label = await bestWalletDisplayLabel(b.address);
        } catch {
          b.label = '';
        }
      }
    }),
  );

  // ── The viewer's own position ─────────────────────────────────────────────
  let myShares = 0;
  let myTrust = 0;
  let myAvgPaid = 0;
  let mySide: Side | null = null;
  if (viewer) {
    try {
      const positions: any[] = await getUserPositions(viewer);
      const ids = [termId.toLowerCase(), counterTermId?.toLowerCase()].filter(Boolean);
      const mine = (positions || []).find((p: any) =>
        ids.includes(String(p?.vault?.term_id ?? p?.term_id ?? '').toLowerCase()),
      );
      if (mine) {
        myShares = Number(formatEther(BigInt(String(mine.shares ?? '0'))));
        myTrust = positionTrust(mine.shares, agent?.totalAssets, agent?.totalShares);
        myAvgPaid = myShares > 0 ? Number(mine.avgPaid ?? 0) || 0 : 0;
        mySide =
          String(mine?.vault?.term_id ?? '').toLowerCase() === counterTermId?.toLowerCase()
            ? 'against'
            : 'for';
      }
    } catch {
      /* not connected or indexer lagging */
    }
  }
  const myPnlPct = myAvgPaid > 0 && sharePrice > 0 ? (sharePrice / myAvgPaid - 1) * 100 : null;

  // ── Thing mode: what people claim about it, and how many lists hold it ────
  let relatedClaims: RelatedClaim[] = [];
  let listCount = 0;
  if (!isClaim) {
    try {
      const triples = await getAgentTriplesWithVaults(termId);
      relatedClaims = (triples || []).slice(0, 6).map((t) => {
        const f = trust(t.supportTotalAssets);
        const a = trust(t.opposeTotalAssets);
        const h = Number(t.supportPositionCount || 0) + Number(t.opposePositionCount || 0);
        return {
          id: t.id,
          label: `${t.subject?.label ?? ''} ${t.predicate?.label ?? ''} ${t.object?.label ?? ''}`.trim(),
          pctYes: h >= THIN_HOLDER_LIMIT && f + a > 0 ? (f / (f + a)) * 100 : null,
          stakedTrust: f + a,
          holders: h,
        };
      });
    } catch {
      /* no claims about this thing yet */
    }
    try {
      listCount = (await getAtomInclusionLists(termId))?.length ?? 0;
    } catch {
      listCount = 0;
    }
  }

  return {
    id: termId,
    mode: isClaim ? 'claim' : 'thing',
    label: agent?.label ?? 'Unknown',
    image: agent?.image,
    monogram: monogramFor(agent?.label ?? ''),
    counterTermId,
    forTrust,
    againstTrust,
    pctYes,
    stakedTrust,
    holders,
    sharePrice,
    thin,
    claimCount: relatedClaims.length,
    listCount,
    myShares,
    myTrust,
    myAvgPaid,
    myPnlPct,
    mySide,
    backers: topBackers,
    relatedClaims,
  };
}
