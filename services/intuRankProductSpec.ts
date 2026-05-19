/**
 * Product spec: Arena excellence checklist, flagship hub, retention hypotheses, phased roadmap.
 * Single source for Billy/Zed-aligned direction (daily-life framing + graph-native loops).
 */

/** Checklist vs `RankedList` — use when reviewing regressions or planning Arena work. */
export const ARENA_UX_EXCELLENCE_CHECKLIST = [
  {
    area: 'clarity',
    bar: 'In ~5 seconds, a new visitor knows: pick a lane → open a list → yes/no.',
    surfaces: ['RankedList picker strip', 'header subtitle', '/hub/trust-tools onboarding funnel'],
  },
  {
    area: 'performance_perceived',
    bar: 'Pool load never feels stalled; show structured placeholders, not infinite spinners.',
    surfaces: ['`loadArenaListPool` path', 'loading skeleton lanes'],
  },
  {
    area: 'trust_copy',
    bar: 'Guest vs wallet: plain language first; jargon only after connect. XP ≠ objective truth.',
    surfaces: ['sidebar controls', 'ArenaLaneCard', 'batch modal'],
  },
  {
    area: 'batch_flow',
    bar: 'Batch reads as “conviction cart” — queue stances, then one on-chain submit.',
    surfaces: ['ArenaBatchReviewModal', 'FAB / batch CTA'],
  },
  {
    area: 'bridge_to_markets',
    bar: 'Every rankable vault-backed item exposes a visible path to `/markets/:id`.',
    surfaces: ['ArenaLaneCard market link'],
  },
] as const;

/** Billy filter: sharp outcome sentence + north-star KPI. */
export const BILLY_VALUE_PROP = 'IntuRank helps you settle who or what deserves trust—fast—then proves it with the crowd and the graph.';

export const FLAGSHIP_ARENA_LIST_ID = 'trust-your-tools' as const;

export const FLAGSHIP_ONE_LINER =
  'Not star ratings — quick pairwise picks on everyday tools people actually rely on.';

/** Retention: one shipped artifact + one return trigger (spec for Iteration beyond raw XP). */
export const RETENTION_SPEC = {
  /** Shareable URL (HashRouter → `/#/climb?list=…`). */
  artifact: 'stance_session_link',
  artifactDescription: 'Copy a link that reopens the same Arena list so friends land in the same flow.',
  /** Product intent: correlate return with graph movement + cohort pressure (implement as seasons / copy / email later). */
  returnTrigger: 'graph_and_cohort',
  returnTriggerDescription:
    'Nudge repeats when stakes or list membership shift on-chain, or when a weekly cohort leaderboard resets.',
} as const;

export type ProductPhaseId = 'P0' | 'P1' | 'P2' | 'P3';

/** Ordered roadmap from team plan — priorities P0→P3. */
export const PRODUCT_PHASES: Array<{
  id: ProductPhaseId;
  goal: string;
  outcomes: readonly string[];
}> = [
  {
    id: 'P0',
    goal: 'Arena vertical slice polish + mainstream list copy (daily-life proofs).',
    outcomes: ['Time-to-first-pick', 'Guest comprehension (informal qualitative)', 'Scroll depth on `/climb`'],
  },
  {
    id: 'P1',
    goal: 'One intent hub: guided journey Arena → Explain (markets/triples) → optional stake.',
    outcomes: ['Hub CTR', 'Markets visits from Arena', 'Wallet connects after N picks'],
  },
  {
    id: 'P2',
    goal: 'Artifacts — lightweight share (“stance session” link already; extend to stance cards/images).',
    outcomes: ['Copy-link usage', 'Return visits attributed to shares'],
  },
  {
    id: 'P3',
    goal: 'Graph serendipity — “you might duel next…” from neighboring triples.',
    outcomes: ['Arena rounds per session', 'Cross-market navigation'],
  },
];
