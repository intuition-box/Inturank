/**
 * Ask — the live pulse and search behind the home surface.
 *
 * The design's pulse rows carry an editorial line under each claim, and that line is the
 * best thing in the product: it tells you your leverage ("small enough that 100 TRUST moves
 * it") or tells you not to bother ("settled, no edge left").
 *
 * IMPORTANT: some of the design's lines describe MOVEMENT — "the yes side is emptying",
 * "+3,100 moved in today". Those need a time series of vault balances, which the indexer
 * does not expose here. Rather than fake a delta, this derives only the states the data can
 * actually prove. The movement lines can return the day a history source exists; the shape
 * below leaves room for them.
 */
import { getTopClaims, searchGlobalAgents, searchClaims } from './graphql';
import { THIN_HOLDER_LIMIT } from './verdictData';

/** Splits inside this band of 50% are a real disagreement rather than a settled question. */
const CONTESTED_BAND = 5;
/** Past this the crowd has effectively decided and there is little edge left. */
const SETTLED_PCT = 90;

export type PulseTone = 'contested' | 'early' | 'settled' | 'neutral';

export interface PulseItem {
  id: string;
  label: string;
  image?: string;
  monogram: string;
  stakedTrust: number;
  holders: number;
  pctYes: number | null;
  tone: PulseTone;
  /** The editorial line. Only ever states something the numbers support. */
  note: string;
  /** Shown as a chip when the tone earns one. */
  chip?: string;
}

const monogramFor = (label: string): string =>
  (label || '?')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0));

/**
 * How much TRUST it takes to become the largest holder — the number that makes a thin
 * market feel like an opportunity instead of an empty room.
 */
function movesItAmount(stakedTrust: number, holders: number): number {
  if (holders <= 0) return 25;
  const averageHolding = stakedTrust / holders;
  // Round to something a person would actually type.
  const target = Math.max(25, Math.ceil((averageHolding * 1.2) / 25) * 25);
  return Math.min(target, 1000);
}

function describe(pctYes: number | null, stakedTrust: number, holders: number): Pick<PulseItem, 'tone' | 'note' | 'chip'> {
  if (holders < THIN_HOLDER_LIMIT) {
    const moves = movesItAmount(stakedTrust, holders);
    return {
      tone: 'early',
      chip: 'Get in early',
      note: `${holders} ${holders === 1 ? 'holder' : 'holders'} — small enough that ${moves} TRUST moves it`,
    };
  }
  if (pctYes === null) {
    return { tone: 'neutral', note: `${fmt(stakedTrust)} staked · ${holders} holders` };
  }
  if (Math.abs(pctYes - 50) <= CONTESTED_BAND) {
    return {
      tone: 'contested',
      chip: 'Contested',
      note: `${fmt(stakedTrust)} staked · nearly even`,
    };
  }
  if (pctYes >= SETTLED_PCT || pctYes <= 100 - SETTLED_PCT) {
    return { tone: 'settled', note: 'settled, no edge left' };
  }
  return { tone: 'neutral', note: `${fmt(stakedTrust)} staked · ${holders} holders` };
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function toPulseItem(row: any): PulseItem | null {
  const label = [row?.subject?.label, row?.predicate, row?.object?.label].filter(Boolean).join(' ').trim();
  if (!label || !row?.id) return null;

  const forTrust = num(row.value);
  const againstTrust = num(row.opposeValue);
  const holders = num(row.holders) + num(row.opposeHolders);
  const total = forTrust + againstTrust;
  const pctYes = holders >= THIN_HOLDER_LIMIT && total > 0 ? (forTrust / total) * 100 : null;

  return {
    id: String(row.id),
    label,
    image: row?.subject?.image || row?.object?.image,
    monogram: monogramFor(row?.subject?.label || label),
    stakedTrust: total,
    holders,
    pctYes,
    ...describe(pctYes, total, holders),
  };
}

/**
 * The pulse. Returns a lead item plus the rest for the 2-column grid, ordered so the most
 * interesting card leads: contested first, then thin markets, then everything else.
 */
export async function loadPulse(limit = 7): Promise<PulseItem[]> {
  let items: any[] = [];
  try {
    const res = await getTopClaims(limit * 4, 0);
    items = Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }

  const rank: Record<PulseTone, number> = { contested: 0, early: 1, neutral: 2, settled: 3 };
  return items
    .map(toPulseItem)
    .filter((i): i is PulseItem => i !== null)
    .sort((a, b) => rank[a.tone] - rank[b.tone] || b.stakedTrust - a.stakedTrust)
    .slice(0, limit);
}

export interface SearchHit {
  id: string;
  label: string;
  image?: string;
  monogram: string;
  kind: 'thing' | 'claim';
  stakedTrust: number;
  holders: number;
}

/** Search across things and claims at once — a person does not know which they are after. */
export async function searchGraph(term: string): Promise<SearchHit[]> {
  const t = term.trim();
  if (!t) return [];

  const [things, claims] = await Promise.all([
    searchGlobalAgents(t).catch(() => []),
    searchClaims(t).catch(() => []),
  ]);

  const hits: SearchHit[] = [];

  for (const a of things as any[]) {
    if (!a?.id) continue;
    hits.push({
      id: String(a.id),
      label: a.label ?? 'Untitled',
      image: a.image,
      monogram: monogramFor(a.label ?? ''),
      kind: 'thing',
      stakedTrust: num(a.marketCap),
      holders: num(a.positionCount),
    });
  }

  for (const c of claims as any[]) {
    const label = [c?.subject?.label, c?.predicate?.label ?? c?.predicate, c?.object?.label]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!c?.id || !label) continue;
    hits.push({
      id: String(c.id),
      label,
      image: c?.subject?.image,
      monogram: monogramFor(c?.subject?.label ?? label),
      kind: 'claim',
      stakedTrust: num(c.value ?? c.totalAssets),
      holders: num(c.holders ?? c.positionCount),
    });
  }

  // Most money first — the thing someone means is usually the one people have backed.
  return hits.sort((a, b) => b.stakedTrust - a.stakedTrust).slice(0, 30);
}
