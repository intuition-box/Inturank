/** Maintenance page — `VITE_MAINTENANCE` is canonical; `VITE_MAINTENANCE_MODE` kept for older `.env` / CI parity. */
export const MAINTENANCE_MODE =
  String(import.meta.env.VITE_MAINTENANCE ?? '').trim() === 'true' ||
  String(import.meta.env.VITE_MAINTENANCE_MODE ?? '').trim() === 'true';

/** `VITE_ARENA_ENABLED=true` → Arena route can render the real UI (see `ARENA_PLACEHOLDER`). */
export const ARENA_ENABLED = import.meta.env.VITE_ARENA_ENABLED === 'true';

/**
 * `VITE_ARENA_PLACEHOLDER=true` → `/climb` always shows the public “coming soon” card (hides in-progress Arena UI).
 * Omit or `false` → with `VITE_ARENA_ENABLED=true`, `/climb` renders the full Arena (`RankedList`).
 */
export const ARENA_PLACEHOLDER = import.meta.env.VITE_ARENA_PLACEHOLDER === 'true';

/** True when `/climb` renders the full Arena (`RankedList`), not the public coming-soon card. */
export const ARENA_UI_VISIBLE = ARENA_ENABLED && !ARENA_PLACEHOLDER;

/**
 * `VITE_ARENA_BATCH_MODE=false` → send TRUST on every yes/no (legacy).
 * Omitted or any other value → curate in-app first, then one transfer when you submit the batch.
 */
export const ARENA_BATCH_MODE = import.meta.env.VITE_ARENA_BATCH_MODE !== 'false';

/**
 * Portal Arena economic txs (vault deposit / list triples) do not always put *your* wallet as triple `creator`
 * on the membership triple itself. When `true`, after a successful portal batch submit we also mint one stance
 * triple per row: `(your Account atom —predicate phrase→ member atom)` so the graph reads who spoke.
 * Adds wallet signatures (predicate atoms + triples). See `.env.example`.
 */
export const ARENA_PERSONAL_ATTESTATION_TRIPLES =
  import.meta.env.VITE_ARENA_PERSONAL_ATTESTATION_TRIPLES === 'true';

/** Minimum Arena XP per ranking gesture; awards scale with stake but never dip below this. */
export const ARENA_XP_PER_RANK_PICK = 15;

/**
 * Portal lists merged into Arena browse (`RankedList` live lists). The Arena explorer feed uses the same cap and
 * sort so rankings shown there match lists IntuRank surfaces — not unrelated portal lists from a wider indexer scrape.
 */
export const ARENA_PORTAL_LISTS_FETCH_LIMIT = 48;

/**
 * Signal Pulse homepage — identity atom cards in this order. Each entry is resolved on the subgraph
 * by label (`atoms.label` ilike); exact / closest label match wins.
 */
export const SIGNAL_PULSE_HERO_ATOM_LABELS: readonly string[] = [
  'INTURANK',
  'USDC',
  'USDT',
  'INTUITION',
  'INTUITIONBILLY.ETH',
  '0XBILLY.ETH',
  'Dogecoin',
  'ELON MUSK',
  'ZET.BOX',
  'BLUERESEARCHER.ETH',
  'CBCRYPTO.ETH',
  'FUNGBILL.ETH',
  'OPENSEA',
  'RCHRIS.ETH',
];

/**
 * Signal Pulse **Crowd** rail — portal shop identities in display order (full curated list).
 * Overlap with **Hot** is allowed: both rails may intentionally surface the same label.
 * Each label resolves on the subgraph with **highest total vault assets** when multiple atoms share a name.
 */
const SIGNAL_PULSE_CROWD_ATOM_LABELS_RAW: readonly string[] = [
  'STARCRAFT',
  'DAPPESTDEV',
  'TRUST NAME SERVICE',
  'NEXURA',
  'THE OVERMIND GALLERY',
  'TRUST CARD',
  'INTUITION BOX',
  'AGENT SCORE',
  'SAULO',
  'JEBLINSKY.ETH',
  'SOFIA',
  'WOODS.ETH',
  'X.COM',
  'SMILINGKYLAN.ETH',
  'AVOTOINTUITION.ETH',
  'PIXI3.ETH',
  'IRONGATE.ETH',
  'THE HACKING PROJECT',
  '0XVITAL.ETH',
  'RCHRIS.ETH',
  'NOVASKO.ETH',
  'THE DOGE POUND NFT',
  'ZET.BOX',
  'WATCHER.GURU',
  'METAMASK',
  'JOLAD.ETH',
  'COINDESK',
  'ARKHAM',
  'OPENSEA',
  'CALEBNFTGOD.ETH',
  'INTURANK',
];

export const SIGNAL_PULSE_CROWD_ATOM_LABELS: readonly string[] = SIGNAL_PULSE_CROWD_ATOM_LABELS_RAW;

/** On-device “activity” XP mirrors via `getArenaLeaderboardMirrorUrl()` (same IntuRank API as Arena POST). */
export const PROTOCOL_XP_MARKET_ACQUIRE = 50;
export const PROTOCOL_XP_CREATE_ATOM = 45;
export const PROTOCOL_XP_CREATE_CLAIM = 45;
/** List-triple (add atom to list) — still a proxy triple, slightly below a free-form claim. */
export const PROTOCOL_XP_ADD_TO_LIST = 30;
/** Activity XP for qualifying native TRUST sends (see minimum amount below). */
export const PROTOCOL_XP_SEND_TRUST = 5;
/** Sends below this many whole TRUST tokens do not award Send TRUST activity XP in the app. */
export const PROTOCOL_XP_SEND_TRUST_MIN_TRUST_UNITS = 100;
/**
 * Skill agent: each qualifying assistant reply (wallet connected, deduped per message).
 * 2 XP hits a sweet spot vs 1 XP — noticeable without opening huge spam incentive; daily cap still applies.
 */
export const PROTOCOL_XP_SKILL_CHAT = 2;
/** Max Skill chat XP per UTC day (anti-spam). */
export const PROTOCOL_XP_DAILY_CAP_SKILL_CHAT = 200;
/** Max activity XP for a Skill-signed atom (FeeProxy createAtoms from /skill-playground); scales with deposit. */
export const PROTOCOL_XP_SKILL_ATOM = 30;
/** Max activity XP for a Skill-signed triple (label pipeline or FeeProxy createTriples); scales with deposit — higher than atom. */
export const PROTOCOL_XP_SKILL_TRIPLE = 45;

/**
 * Anti-farming: activity XP scales with how much TRUST you commit on that tx, between a floor and a reference.
 * Below `MIN_*` TRUST → 0 XP for that category (use MIN = 0 to allow any positive deposit, still scaled). At `REFERENCE_*` TRUST or above → full base XP (PROTOCOL_XP_* cap).
 * Between → linear: floor(base × depositWei / referenceWei).
 */
export const PROTOCOL_XP_MARKET_ACQUIRE_MIN_DEPOSIT_TRUST_UNITS = 10;
export const PROTOCOL_XP_MARKET_ACQUIRE_REFERENCE_DEPOSIT_TRUST_UNITS = 50;

export const PROTOCOL_XP_CREATE_ATOM_MIN_DEPOSIT_TRUST_UNITS = 5;
export const PROTOCOL_XP_CREATE_ATOM_REFERENCE_DEPOSIT_TRUST_UNITS = 25;

export const PROTOCOL_XP_CREATE_CLAIM_MIN_DEPOSIT_TRUST_UNITS = 5;
export const PROTOCOL_XP_CREATE_CLAIM_REFERENCE_DEPOSIT_TRUST_UNITS = 25;

/** 0 = any on-chain deposit counts; XP still scales (protocol floor deposits stay tiny). */
export const PROTOCOL_XP_ADD_TO_LIST_MIN_DEPOSIT_TRUST_UNITS = 0;
/**
 * TRUST at or above this (whole units) earns full `PROTOCOL_XP_ADD_TO_LIST`; below → linear vs deposit (anti-farm).
 * Raised from 1 → 2 so typical ~0.5 TRUST Arena stakes earn less deposit-side XP than before.
 */
export const PROTOCOL_XP_ADD_TO_LIST_REFERENCE_DEPOSIT_TRUST_UNITS = 2;

/**
 * Arena ranking batches earn Arena pick XP and `add_to_list` activity XP on the same vault deposit.
 * Apply this to deposit-side gross only (values below 1 soften double-count); other add_to_list flows use default 1.
 */
export const PROTOCOL_XP_ARENA_RANK_ADD_TO_LIST_MULT = 0.85;

/** Match triple Skill deposits — min 0 scales everything sub-reference (raise deposit for meaningful XP). */
export const PROTOCOL_XP_SKILL_ONCHAIN_MIN_DEPOSIT_TRUST_UNITS = 0;
export const PROTOCOL_XP_SKILL_ONCHAIN_REFERENCE_DEPOSIT_TRUST_UNITS = 15;

/**
 * Max activity XP creditable per UTC calendar day per bucket — anti-spam ceiling.
 * Tuned so a normal Arena/markets day never silently zero-outs; daily buckets remain generous for real usage.
 */
export const PROTOCOL_XP_DAILY_CAP_MARKET_ACQUIRE = 1000;
export const PROTOCOL_XP_DAILY_CAP_CREATE_ATOM = 600;
export const PROTOCOL_XP_DAILY_CAP_CREATE_CLAIM = 600;
export const PROTOCOL_XP_DAILY_CAP_ADD_TO_LIST = 1000;
export const PROTOCOL_XP_DAILY_CAP_SKILL_ONCHAIN = 600;
export const PROTOCOL_XP_DAILY_CAP_SEND_TRUST = 250;
/**
 * When set (positive integer chain block), portfolio + personal Arena XP ignore triples older than this `block_number`.
 * Cuts unrelated Intuition list activity that predates your Arena rollout (predicates match other apps too).
 */
export const ARENA_ATTRIBUTION_MIN_BLOCK: number | null = (() => {
  const s = String(import.meta.env.VITE_ARENA_ATTRIBUTION_MIN_BLOCK ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
})();

/**
 * When true, leaderboard scans all portal-shaped list triples on the indexer → every Intuition portal user qualifies.
 * Default OFF — use GET leaderboard mirror (`getArenaLeaderboardMirrorUrl` / explicit env) for an IntuRank-only board.
 */
export const ARENA_USE_GLOBAL_GRAPH_LEADERBOARD =
  String(import.meta.env.VITE_ARENA_USE_GLOBAL_GRAPH_LEADERBOARD ?? '').trim() === 'true';

/** Unified IntuRank backend (email, leaderboard mirror, wallet prefs). Prefer this over email-only naming. */
export function getInturankApiOrigin(): string {
  const u =
    String(import.meta.env.VITE_INTURANK_API_URL ?? '').trim() ||
    String(import.meta.env.VITE_EMAIL_API_URL ?? '').trim();
  return u.replace(/\/$/, '');
}

/**
 * Arena leaderboard mirror (GET list + POST telemetry). Explicit `VITE_ARENA_LEADERBOARD_URL` overrides.
 * Otherwise defaults to `${getInturankApiOrigin()}/api/arena-leaderboard` when an API origin is set.
 */
export function getArenaLeaderboardMirrorUrl(): string {
  const explicit = String(import.meta.env.VITE_ARENA_LEADERBOARD_URL ?? '').trim();
  if (explicit) return explicit;
  const origin = getInturankApiOrigin();
  return origin ? `${origin}/api/arena-leaderboard` : '';
}

/** Parse VITE_GEMINI_API_KEY (single key or comma-separated keys) and return one. Picks randomly when multiple. */
export const getGeminiApiKey = (): string => {
  const raw = String(import.meta.env.VITE_GEMINI_API_KEY ?? '').trim();
  if (!raw) return '';
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return '';
  return keys[Math.floor(Math.random() * keys.length)];
};

/**
 * Gemini model when Groq fails and Gemini fallback runs (`generateContent`).
 * Set `VITE_GEMINI_MODEL` in `.env.local` to pin a model ID (e.g. `gemini-2.0-flash`) if the default is unavailable for your key.
 */
export const GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || 'gemini-2.5-flash';

/** OpenAI API key — fallback after Groq/Gemini (platform.openai.com — ChatGPT Plus does not include API access). */
export const getOpenAiApiKey = (): string => {
  const raw = String(import.meta.env.VITE_OPENAI_API_KEY ?? '').trim();
  if (!raw) return '';
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return '';
  return keys[Math.floor(Math.random() * keys.length)];
};

/** Model for OpenAI fallback (`gpt-4o-mini` is cost-effective). */
export const OPENAI_MODEL =
  (import.meta.env.VITE_OPENAI_MODEL as string | undefined)?.trim() || 'gpt-4o-mini';

/** Groq (console.groq.com) — primary LLM for Skill + in-app AI; OpenAI-compatible, fast free tier. */
export const getGroqApiKey = (): string => {
  const raw = String(import.meta.env.VITE_GROQ_API_KEY ?? '').trim();
  if (!raw) return '';
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return '';
  return keys[Math.floor(Math.random() * keys.length)];
};

/** Groq chat model id (see https://console.groq.com/docs/models). */
export const GROQ_MODEL =
  (import.meta.env.VITE_GROQ_MODEL as string | undefined)?.trim() || 'llama-3.3-70b-versatile';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/** `mainnet` | `testnet` — set `VITE_INTUITION_NETWORK` (Vite exposes only `VITE_*` to the client). */
export type IntuitionNetworkId = 'mainnet' | 'testnet';

function normalizeIntuitionNetworkId(raw: string | undefined): IntuitionNetworkId {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'testnet' ? 'testnet' : 'mainnet';
}

function envStr(key: string): string {
  return String((import.meta.env as Record<string, string | undefined>)[key] ?? '').trim();
}

function intFromEnv(key: string, fallback: number): number {
  const raw = envStr(key);
  // `Number('') === 0` — without this guard, a missing VITE_* chain id made CHAIN_ID 0 and wagmi targeted chain 0 vs wallet 1155.
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i <= 0) return fallback;
  return i;
}

/** Which Intuition deployment the SPA targets (RPC, chain id, Graph defaults, explorer). */
export const INTUITION_ACTIVE_NETWORK: IntuitionNetworkId = normalizeIntuitionNetworkId(
  import.meta.env.VITE_INTUITION_NETWORK as string | undefined
);

const INTUITION_MAINNET_DEFAULTS = {
  chainId: 1155,
  rpc: 'https://rpc.intuition.systems/http',
  graphql: 'https://mainnet.intuition.sh/v1/graphql',
  explorer: 'https://explorer.intuition.systems',
  name: 'Intuition Mainnet',
} as const;

const INTUITION_TESTNET_DEFAULTS = {
  chainId: 13579,
  rpc: 'https://testnet.rpc.intuition.systems/',
  graphql: 'https://testnet.intuition.sh/v1/graphql',
  explorer: 'https://testnet.explorer.intuition.systems',
  name: 'Intuition Testnet',
} as const;

const intuitionProfile =
  INTUITION_ACTIVE_NETWORK === 'testnet' ? INTUITION_TESTNET_DEFAULTS : INTUITION_MAINNET_DEFAULTS;

export const CHAIN_ID = intFromEnv(
  INTUITION_ACTIVE_NETWORK === 'testnet'
    ? 'VITE_INTUITION_TESTNET_CHAIN_ID'
    : 'VITE_INTUITION_MAINNET_CHAIN_ID',
  intuitionProfile.chainId
);

export const RPC_URL =
  envStr(INTUITION_ACTIVE_NETWORK === 'testnet' ? 'VITE_INTUITION_TESTNET_RPC_URL' : 'VITE_INTUITION_MAINNET_RPC_URL') ||
  intuitionProfile.rpc;

export const NETWORK_NAME = intuitionProfile.name;

export const EXPLORER_URL = (
  envStr(
    INTUITION_ACTIVE_NETWORK === 'testnet'
      ? 'VITE_INTUITION_TESTNET_EXPLORER_URL'
      : 'VITE_INTUITION_MAINNET_EXPLORER_URL'
  ) || intuitionProfile.explorer
).replace(/\/$/, '');

const activeGraphqlUrl = intuitionProfile.graphql;

/**
 * Core Intuition Graph endpoint.
 * In dev, use `/v1/graphql` so Vite proxies to the active network (see `vite.config.ts`).
 * In production: `VITE_GRAPHQL_URL` overrides; otherwise the URL for `INTUITION_ACTIVE_NETWORK`.
 */
export const GRAPHQL_URL = import.meta.env.DEV
  ? '/v1/graphql'
  : envStr('VITE_GRAPHQL_URL') || activeGraphqlUrl;

/** MultiVault / FeeProxy / atom IDs below are mainnet values; for `VITE_INTUITION_NETWORK=testnet` update those constants for signing or keep mainnet for on-chain flows. */

/** Fallback avatar when no on-chain / IPFS image — IntuRank branded placeholder (`public/avatars/default-profile-trust.png`). */
export const DEFAULT_PROFILE_AVATAR_URL = "/avatars/default-profile-trust.png";
export const CURRENCY_SYMBOL = "₸";

/** Semantic app release; keep `package.json` `"version"` in sync. */
export const APP_VERSION = '2.0.0';
/** Short label for UI chrome (sidebar wordmark, certification strings). */
export const APP_VERSION_DISPLAY = 'V.2.0';

/** Shared page hero typography (matches Markets and Documentation). */
export const PAGE_HERO_EYEBROW = 'text-sm text-slate-500 font-sans';
export const PAGE_HERO_TITLE =
  'text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-white font-display tracking-tight leading-[1.12]';
export const PAGE_HERO_BODY = 'text-[15px] text-slate-400 leading-relaxed font-sans';

/** Season 2 / fallback epoch id when no window matches (keep aligned with latest shipped epoch) */
export const SEASON_2_EPOCH_ID = 13;

/** Human-readable date range for Epoch 8 (Season 2 current period) — matches Intuition portal */
export const SEASON_2_EPOCH_8_DATE_RANGE = 'Feb 24, 4:00 PM – Mar 10, 4:00 PM';

/** ISO date strings for Epoch 8 — required by get_pnl_leaderboard_period (p_start_date, p_end_date) */
export const SEASON_2_EPOCH_8_START = '2026-02-24T16:00:00Z';
export const SEASON_2_EPOCH_8_END = '2026-03-10T16:00:00Z';

export type Season2EpochDef = {
  id: number;
  label: string;
  range: string;
  start: string;
  end: string;
  /** Manual override; if unset, `computeSeason2DefaultEpochId()` uses date windows + env */
  isCurrent?: boolean;
};

/** Season 2 Epoch schedule for homepage / stats selectors. Approximate 14-day epochs. New epochs: add at top, set `isCurrent` or rely on date range. */
export const SEASON_2_EPOCHS: Season2EpochDef[] = [
  {
    id: 13,
    label: 'Epoch 13',
    /** Contiguous with Epoch 12 end (portal 15:00 UTC). */
    range: 'May 5, 3:00 PM UTC – May 19, 3:00 PM UTC',
    start: '2026-05-05T15:00:00Z',
    end: '2026-05-19T15:00:00Z',
  },
  {
    id: 12,
    label: 'Epoch 12',
    /** Must match Intuition portal `p_start_date` / `p_end_date` (network tab uses 15:00 UTC). */
    range: 'Apr 21, 3:00 PM UTC – May 5, 3:00 PM UTC',
    start: '2026-04-21T15:00:00Z',
    end: '2026-05-05T15:00:00Z',
  },
  {
    id: 11,
    label: 'Epoch 11',
    range: 'Apr 7, 3:00 PM UTC – Apr 21, 3:00 PM UTC',
    start: '2026-04-07T15:00:00Z',
    end: '2026-04-21T15:00:00Z',
  },
  {
    id: 10,
    label: 'Epoch 10',
    range: 'Mar 24, 3:00 PM UTC – Apr 7, 3:00 PM UTC',
    start: '2026-03-24T15:00:00Z',
    end: '2026-04-07T15:00:00Z',
  },
  {
    id: 9,
    label: 'Epoch 9',
    range: 'Mar 10, 3:00 PM UTC – Mar 24, 3:00 PM UTC',
    start: '2026-03-10T15:00:00Z',
    end: '2026-03-24T15:00:00Z',
  },
  {
    id: 8,
    label: 'Epoch 8',
    range: SEASON_2_EPOCH_8_DATE_RANGE,
    start: SEASON_2_EPOCH_8_START,
    end: SEASON_2_EPOCH_8_END,
  },
  {
    id: 7,
    label: 'Epoch 7',
    range: 'Feb 10, 4:00 PM – Feb 24, 4:00 PM',
    start: '2026-02-10T16:00:00Z',
    end: '2026-02-24T16:00:00Z',
  },
  {
    id: 6,
    label: 'Epoch 6',
    range: 'Jan 27, 4:00 PM – Feb 10, 4:00 PM',
    start: '2026-01-27T16:00:00Z',
    end: '2026-02-10T16:00:00Z',
  },
  {
    id: 5,
    label: 'Epoch 5',
    range: 'Jan 13, 4:00 PM – Jan 27, 4:00 PM',
    start: '2026-01-13T16:00:00Z',
    end: '2026-01-27T16:00:00Z',
  },
  {
    id: 4,
    label: 'Epoch 4',
    range: 'Dec 30, 4:00 PM – Jan 13, 4:00 PM',
    start: '2025-12-30T16:00:00Z',
    end: '2026-01-13T16:00:00Z',
  },
  {
    id: 3,
    label: 'Epoch 3',
    range: 'Dec 16, 4:00 PM – Dec 30, 4:00 PM',
    start: '2025-12-16T16:00:00Z',
    end: '2025-12-30T16:00:00Z',
  },
  {
    id: 2,
    label: 'Epoch 2',
    range: 'Dec 2, 4:00 PM – Dec 16, 4:00 PM',
    start: '2025-12-02T16:00:00Z',
    end: '2025-12-16T16:00:00Z',
  },
  {
    id: 1,
    label: 'Epoch 1',
    range: 'Nov 18, 4:00 PM – Dec 2, 4:00 PM',
    start: '2025-11-18T16:00:00Z',
    end: '2025-12-02T16:00:00Z',
  },
];

/**
 * Default selected epoch in Season 2 UIs.
 * 1) `VITE_SEASON2_CURRENT_EPOCH_ID` if set and valid
 * 2) Epoch whose [start,end] contains `now` (auto-updates when calendar crosses)
 * 3) Any entry with `isCurrent: true`
 * 4) Latest epoch that has already started (by highest id)
 */
export function computeSeason2DefaultEpochId(nowMs: number = Date.now()): number {
  const envRaw = import.meta.env.VITE_SEASON2_CURRENT_EPOCH_ID as string | undefined;
  if (envRaw) {
    const n = Number(String(envRaw).trim());
    if (Number.isFinite(n) && SEASON_2_EPOCHS.some((e) => e.id === n)) return n;
  }
  const now = nowMs;
  const byDesc = [...SEASON_2_EPOCHS].sort((a, b) => b.id - a.id);
  for (const e of byDesc) {
    const s = new Date(e.start).getTime();
    const end = new Date(e.end).getTime();
    if (now >= s && now <= end) return e.id;
  }
  for (const e of byDesc) {
    if (e.isCurrent) return e.id;
  }
  for (const e of byDesc) {
    const s = new Date(e.start).getTime();
    if (now >= s) return e.id;
  }
  return byDesc[0]?.id ?? SEASON_2_EPOCH_ID;
}

/** Resolved epoch row for “current” Season 2 period (badges, copy). */
export function getResolvedSeason2EpochForNow(nowMs?: number): Season2EpochDef {
  const id = computeSeason2DefaultEpochId(nowMs);
  return SEASON_2_EPOCHS.find((e) => e.id === id) ?? SEASON_2_EPOCHS[0];
}

export const MULTI_VAULT_ADDRESS = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e";
/** IntuitionFeeProxy (intuition-box template) — update when redeploying. */
export const FEE_PROXY_ADDRESS = "0x1a13606A0a3C392214527c896b4cD0E9C0af82E8";
export const OFFSET_PROGRESSIVE_CURVE_ADDRESS = "0x23afF95153aa88D28B9B97Ba97629E05D5fD335d";
/** Curve ID 1 = Linear (stable). Curve ID 2 = Offset Progressive (exponential). */
export const LINEAR_CURVE_ID = 1;
export const OFFSET_PROGRESSIVE_CURVE_ID = 2;

// Standard Semantic Predicates & Objects
export const IS_PREDICATE_ID = "0x0000000000000000000000000000000000000000000000000000000000000001";
export const DISTRUST_ATOM_ID = "0x0000000000000000000000000000000000000000000000000000000000003a74";
/** List predicate — used for "add identity to list" (triple: subject=atom, predicate=this, object=list) */
export const LIST_PREDICATE_ID = "0x7ec36d201c842dc787b45cb5bb753bea4cf849be3908fb1b0a7d067c3c3cc1f5";

// Protocol Pricing Constants
export const CURVE_SLOPE = 30000000000000000000n; // 3 * 10^19
/**
 * Client-side floor for per-row deposits (the FeeProxy enforces an on-chain
 * `minDeposit` from `getGeneralConfig()`). Lowered from 0.5 → 0.1 TRUST for
 * testing — the real chain config still wins via simulation if it's higher.
 */
export const CURVE_OFFSET = 100000000000000000n; // 1 * 10^17 = 0.1 TRUST
export const DISPLAY_DIVISOR = 100000;

export const FEE_PROXY_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "receiver", "type": "address" },
      { "internalType": "bytes[]", "name": "data", "type": "bytes[]" },
      { "internalType": "uint256[]", "name": "assets", "type": "uint256[]" },
      { "internalType": "uint256", "name": "curveId", "type": "uint256" }
    ],
    "name": "createAtoms",
    "outputs": [{ "internalType": "bytes32[]", "name": "atomIds", "type": "bytes32[]" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "receiver", "type": "address" },
      { "internalType": "bytes32[]", "name": "subjectIds", "type": "bytes32[]" },
      { "internalType": "bytes32[]", "name": "predicateIds", "type": "bytes32[]" },
      { "internalType": "bytes32[]", "name": "objectIds", "type": "bytes32[]" },
      { "internalType": "uint256[]", "name": "assets", "type": "uint256[]" },
      { "internalType": "uint256", "name": "curveId", "type": "uint256" }
    ],
    "name": "createTriples",
    "outputs": [{ "internalType": "bytes32[]", "name": "tripleIds", "type": "bytes32[]" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "receiver", "type": "address" },
      { "internalType": "bytes32", "name": "termId", "type": "bytes32" },
      { "internalType": "uint256", "name": "curveId", "type": "uint256" },
      { "internalType": "uint256", "name": "minShares", "type": "uint256" }
    ],
    "name": "deposit",
    "outputs": [{ "internalType": "uint256", "name": "shares", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "receiver", "type": "address" },
      { "internalType": "bytes32[]", "name": "termIds", "type": "bytes32[]" },
      { "internalType": "uint256[]", "name": "curveIds", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "assets", "type": "uint256[]" },
      { "internalType": "uint256[]", "name": "minShares", "type": "uint256[]" }
    ],
    "name": "depositBatch",
    "outputs": [{ "internalType": "uint256[]", "name": "shares", "type": "uint256[]" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "depositCount", "type": "uint256" },
      { "internalType": "uint256", "name": "totalDeposit", "type": "uint256" }
    ],
    "name": "calculateDepositFee",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "depositAmount", "type": "uint256" }
    ],
    "name": "getTotalDepositCost",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "depositCount", "type": "uint256" },
      { "internalType": "uint256", "name": "totalDeposit", "type": "uint256" },
      { "internalType": "uint256", "name": "multiVaultCost", "type": "uint256" }
    ],
    "name": "getTotalCreationCost",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAtomCost",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTripleCost",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "id", "type": "bytes32" }
    ],
    "name": "isTermCreated",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "creator", "type": "address" },
      { "indexed": true, "internalType": "bytes32", "name": "termId", "type": "bytes32" },
      { "indexed": false, "internalType": "bytes", "name": "atomData", "type": "bytes" },
      { "indexed": false, "internalType": "address", "name": "atomWallet", "type": "address" }
    ],
    "name": "AtomCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "creator", "type": "address" },
      { "indexed": true, "internalType": "bytes32", "name": "termId", "type": "bytes32" },
      { "indexed": false, "internalType": "bytes32", "name": "subjectId", "type": "bytes32" },
      { "indexed": false, "internalType": "bytes32", "name": "predicateId", "type": "bytes32" },
      { "indexed": false, "internalType": "bytes32", "name": "objectId", "type": "bytes32" }
    ],
    "name": "TripleCreated",
    "type": "event"
  },
  // Custom errors for createTriples revert decoding (0xd335ef46 and related)
  { "type": "error", "name": "InsufficientDepositAmountToCoverFees", "inputs": [] },
  { "type": "error", "name": "AtomDoesNotExist", "inputs": [{ "name": "atomId", "type": "bytes32" }] },
  /** Legacy / alternate wiring — selector 0x86d94276 */
  { "type": "error", "name": "TripleExists", "inputs": [{ "name": "s", "type": "bytes32" }, { "name": "p", "type": "bytes32" }, { "name": "o", "type": "bytes32" }] },
  /** Current MultiVault — selector 0x22319959 (FeeProxy createTriples simulation) */
  {
    "type": "error",
    "name": "MultiVault_TripleExists",
    "inputs": [
      { "name": "termId", "type": "bytes32" },
      { "name": "subjectId", "type": "bytes32" },
      { "name": "predicateId", "type": "bytes32" },
      { "name": "objectId", "type": "bytes32" }
    ]
  },
  /** Selector 0x332c26cd — deposit blocked because the user already holds shares on the counter-triple of the target. */
  { "type": "error", "name": "MultiVault_HasCounterStake", "inputs": [] },
  { "type": "error", "name": "MinimumDeposit", "inputs": [] },
  /** Forwarded from MultiVault — selector 0xb4856ebc; enables viem to decode createAtoms simulation reverts. */
  { "type": "error", "name": "MultiVault_AtomExists", "inputs": [{ "name": "atomData", "type": "bytes" }] }
] as const;

export const MULTI_VAULT_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "address", "name": "operator", "type": "address" },
      { "internalType": "uint8", "name": "approvalType", "type": "uint8" }
    ],
    "name": "isApproved",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "operator", "type": "address" },
      { "internalType": "uint8", "name": "approvalType", "type": "uint8" }
    ],
    "name": "approve",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "bytes32", "name": "termId", "type": "bytes32" },
      { "internalType": "uint256", "name": "curveId", "type": "uint256" }
    ],
    "name": "getShares",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "termId", "type": "bytes32" },
      { "internalType": "uint256", "name": "curveId", "type": "uint256" },
      { "internalType": "uint256", "name": "shares", "type": "uint256" }
    ],
    "name": "previewRedeem",
    "outputs": [
      { "internalType": "uint256", "name": "assetsAfterFees", "type": "uint256" },
      { "internalType": "uint256", "name": "sharesUsed", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
        { "internalType": "address", "name": "receiver", "type": "address" },
        { "internalType": "bytes32[]", "name": "termIds", "type": "bytes32[]" },
        { "internalType": "uint256[]", "name": "curveIds", "type": "uint256[]" },
        { "internalType": "uint256[]", "name": "shares", "type": "uint256[]" },
        { "internalType": "uint256[]", "name": "minAssets", "type": "uint256[]" }
    ],
    "name": "redeemBatch",
    "outputs": [{ "internalType": "uint256[]", "name": "received", "type": "uint256[]" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes32", "name": "id", "type": "bytes32" }],
    "name": "isTermCreated",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes[]", "name": "data", "type": "bytes[]" },
      { "internalType": "uint256[]", "name": "assets", "type": "uint256[]" }
    ],
    "name": "createAtoms",
    "outputs": [{ "internalType": "bytes32[]", "name": "", "type": "bytes32[]" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32[]", "name": "subjectIds", "type": "bytes32[]" },
      { "internalType": "bytes32[]", "name": "predicateIds", "type": "bytes32[]" },
      { "internalType": "bytes32[]", "name": "objectIds", "type": "bytes32[]" },
      { "internalType": "uint256[]", "name": "assets", "type": "uint256[]" }
    ],
    "name": "createTriples",
    "outputs": [{ "internalType": "bytes32[]", "name": "", "type": "bytes32[]" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTripleCost",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAtomCost",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes", "name": "atomData", "type": "bytes" }],
    "name": "calculateAtomId",
    "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "creator", "type": "address" },
      { "indexed": true, "internalType": "bytes32", "name": "termId", "type": "bytes32" },
      { "indexed": false, "internalType": "bytes", "name": "atomData", "type": "bytes" },
      { "indexed": false, "internalType": "address", "name": "atomWallet", "type": "address" }
    ],
    "name": "AtomCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "creator", "type": "address" },
      { "indexed": true, "internalType": "bytes32", "name": "termId", "type": "bytes32" },
      { "indexed": false, "internalType": "bytes32", "name": "subjectId", "type": "bytes32" },
      { "indexed": false, "internalType": "bytes32", "name": "predicateId", "type": "bytes32" },
      { "indexed": false, "internalType": "bytes32", "name": "objectId", "type": "bytes32" }
    ],
    "name": "TripleCreated",
    "type": "event"
  },
  { "type": "error", "name": "MultiVault_AtomExists", "inputs": [{ "name": "atomData", "type": "bytes" }] },
  {
    "type": "error",
    "name": "MultiVault_TripleExists",
    "inputs": [
      { "name": "termId", "type": "bytes32" },
      { "name": "subjectId", "type": "bytes32" },
      { "name": "predicateId", "type": "bytes32" },
      { "name": "objectId", "type": "bytes32" }
    ]
  },
  { "type": "error", "name": "MultiVault_HasCounterStake", "inputs": [] }
] as const;
