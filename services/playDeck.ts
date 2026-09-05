/**
 * Play — the daily run: eight claims, about ninety seconds, judged for free.
 *
 * The loop the whole product turns on. A card shows one claim and nothing else; you call it
 * true or not; only then does the money speak. Points land immediately and locally, real
 * TRUST moves only when a queued batch is signed at the end — one signature, never a wallet
 * popup per card.
 *
 * Pool comes from `getTopClaims`, which already returns both sides of a claim
 * (`value` / `opposeValue`), so the reveal percentage is real money and not an estimate.
 */
import { formatEther } from 'viem';
import { getTopClaims } from './graphql';
import { ARENA_XP_PER_RANK_PICK } from '../constants';
import { THIN_HOLDER_LIMIT } from './verdictData';

/** Cards in one daily run. Matches the design: eight cards, +120 points at 15 a call. */
export const RUN_SIZE = 8;
/** Points for calling a card, right or wrong — playing is what earns, not being correct. */
export const POINTS_PER_CALL = ARENA_XP_PER_RANK_PICK;
/** Bonus every fifth consecutive correct call. */
export const COMBO_BONUS = 25;
export const COMBO_EVERY = 5;
/** Default stake attached to a queued call. */
export const DEFAULT_STAKE = 25;

export type Call = 'true' | 'nope';

/**
 * The five games. One palette, told apart by shape and pattern (see the handoff): a card's
 * kind is chosen from what its data can actually support, so a thin market becomes "get in
 * early" rather than a percentage question it cannot answer.
 */
export type GameKind = 'call' | 'split' | 'overunder' | 'early' | 'sort';

/** Round thresholds to something a person would recognise. */
function niceThreshold(n: number): number {
  if (n >= 10000) return Math.round(n / 5000) * 5000;
  if (n >= 1000) return Math.round(n / 500) * 500;
  if (n >= 100) return Math.round(n / 50) * 50;
  return Math.max(10, Math.round(n / 10) * 10);
}

export interface PlayCard {
  id: string;
  counterTermId?: string;
  /** Rendered claim, e.g. "1Password does not sell your data". */
  label: string;
  image?: string;
  monogram: string;
  forTrust: number;
  againstTrust: number;
  holders: number;
  /** null when too few holders for an average to mean anything. */
  pctYes: number | null;
}

/** A sort round bundles four cards into one question. */
export interface SortRound {
  kind: 'sort';
  id: string;
  prompt: string;
  items: PlayCard[];
}

export type Round = ({ kind: Exclude<GameKind, 'sort'> } & { card: PlayCard; threshold?: number }) | SortRound;

export interface Judged {
  card: PlayCard;
  call: Call;
  /** Did the money agree with the call? null when the crowd is too thin to say. */
  agreed: boolean | null;
  points: number;
  combo: boolean;
}

/** A call the player chose to put money behind. Local until the batch is signed. */
export interface QueuedStake {
  cardId: string;
  label: string;
  call: Call;
  /** Where the TRUST actually goes — the claim's vault, or its counter-vault when fading. */
  termId: string;
  trust: number;
}

const num = (wei: unknown): number => {
  const raw = String(wei ?? '0');
  try {
    // getTopClaims returns already-formatted numbers in some paths and wei in others.
    if (raw.includes('.') || raw.length < 15) return Number(raw) || 0;
    return Number(formatEther(BigInt(raw)));
  } catch {
    return Number(raw) || 0;
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

/**
 * Build today's run. Pulls a wider pool than needed and shuffles, so two people playing the
 * same day do not get an identical deck and one person's second run is not a replay.
 *
 * Returns fewer than RUN_SIZE — possibly zero — when the graph is quiet. The caller must
 * handle that; an empty deck is a normal state here, not an error.
 */
export async function loadRun(size: number = RUN_SIZE): Promise<PlayCard[]> {
  let items: any[] = [];
  try {
    const res = await getTopClaims(size * 6, 0);
    items = Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }

  const cards: PlayCard[] = items
    .map((row) => {
      const label = [row?.subject?.label, row?.predicate, row?.object?.label]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (!label || !row?.id) return null;

      const forTrust = num(row.value);
      const againstTrust = num(row.opposeValue);
      const holders = Number(row.holders || 0) + Number(row.opposeHolders || 0);
      const total = forTrust + againstTrust;

      return {
        id: String(row.id),
        counterTermId: row.counterTermId ? String(row.counterTermId) : undefined,
        label,
        image: row?.subject?.image || row?.object?.image,
        monogram: monogramFor(row?.subject?.label || label),
        forTrust,
        againstTrust,
        holders,
        // Same honesty rule as Verdict: on a thin sample a percentage would be theatre.
        pctYes: holders >= THIN_HOLDER_LIMIT && total > 0 ? (forTrust / total) * 100 : null,
      } as PlayCard;
    })
    .filter((c): c is PlayCard => c !== null);

  // Fisher-Yates, so the deck differs run to run.
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards.slice(0, size);
}

/**
 * Score one call. Being wrong still earns — the streak survives, because a game that
 * punishes a wrong guess stops being one people play eight times a day.
 */
export function judge(card: PlayCard, call: Call, correctRunSoFar: number): Judged {
  const agreed = card.pctYes === null ? null : call === 'true' ? card.pctYes >= 50 : card.pctYes < 50;
  const nextCorrect = agreed ? correctRunSoFar + 1 : correctRunSoFar;
  const combo = agreed === true && nextCorrect > 0 && nextCorrect % COMBO_EVERY === 0;
  return {
    card,
    call,
    agreed,
    points: POINTS_PER_CALL + (combo ? COMBO_BONUS : 0),
    combo,
  };
}

/**
 * Pick a game for a card from what its data supports:
 *   too few holders          -> get in early (the only honest question for a thin market)
 *   a real percentage        -> guess the split, or call it
 *   otherwise                -> over / under on the money
 */
export function kindFor(card: PlayCard, i: number): Exclude<GameKind, 'sort'> {
  if (card.holders < THIN_HOLDER_LIMIT) return 'early';
  if (card.pctYes === null) return 'overunder';
  // Alternate so a run has variety rather than eight of the same question.
  return i % 3 === 1 ? 'split' : i % 3 === 2 ? 'overunder' : 'call';
}

/**
 * Build a run of rounds. Four leftover cards become a single sort round at the end, which is
 * the game the design says pays the most because it takes longest.
 */
export function buildRounds(cards: PlayCard[]): Round[] {
  const rounds: Round[] = cards.map((card, i) => {
    const kind = kindFor(card, i);
    return kind === 'overunder'
      ? { kind, card, threshold: niceThreshold((card.forTrust + card.againstTrust) * 0.8) }
      : { kind, card };
  });

  const sortable = cards.filter((c) => c.forTrust + c.againstTrust > 0).slice(0, 4);
  if (sortable.length === 4) {
    rounds.push({
      kind: 'sort',
      id: `sort-${sortable.map((c) => c.id).join('-').slice(0, 24)}`,
      prompt: 'Which of these has the most money behind it?',
      items: sortable,
    });
  }
  return rounds;
}

/** Score a split guess: closer pays more, within five points pays full. */
export function judgeSplit(card: PlayCard, guess: number): { actual: number; off: number; points: number } {
  const actual = card.pctYes ?? 50;
  const off = Math.abs(actual - guess);
  const points = off <= 5 ? POINTS_PER_CALL + 10 : off <= 15 ? POINTS_PER_CALL : Math.max(4, POINTS_PER_CALL - Math.round(off / 4));
  return { actual, off, points };
}

/** Score an over/under call against the real staked total. */
export function judgeOverUnder(card: PlayCard, said: 'over' | 'under', threshold: number) {
  const actual = card.forTrust + card.againstTrust;
  const agreed = said === 'over' ? actual > threshold : actual <= threshold;
  return { actual, agreed, points: agreed ? POINTS_PER_CALL : Math.round(POINTS_PER_CALL / 3) };
}

/** Score a sort: how many landed in the right place. */
export function judgeSort(items: PlayCard[], order: string[]) {
  const truth = [...items].sort((a, b) => b.forTrust + b.againstTrust - (a.forTrust + a.againstTrust)).map((c) => c.id);
  const inPlace = order.filter((id, i) => truth[i] === id).length;
  return { truth, inPlace, points: 10 * inPlace };
}

/** Which vault a queued call should deposit into. Fading goes to the counter-vault. */
export function stakeTermId(card: PlayCard, call: Call): string {
  return call === 'nope' && card.counterTermId ? card.counterTermId : card.id;
}

/** Totals for the cart review sheet. Fee matches Verdict's quote. */
export function queueTotals(queue: QueuedStake[], feePct = 0.005) {
  const stakes = queue.reduce((s, q) => s + q.trust, 0);
  const fee = stakes * feePct;
  return { stakes, fee, total: stakes + fee, count: queue.length };
}
