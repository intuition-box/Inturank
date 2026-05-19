import type { ArenaListEntry } from './arenaListsRegistry';

/**
 * Contest hub buckets — thematic lanes (not identical to Arena filter pills).
 * Portal lists (`source: 'portal'`, `arenaCategory: 'network'`) use keyword scoring plus
 * priors so traffic spreads across lanes instead of one mega row.
 *
 * Static lists anchor **Daily life**, **On-graph**, **Ecosystem (Web3)**, etc. Portals split
 * into Gaming / AI / Culture / Markets as signals allow. Singleton lanes remain visible —
 * collapsing them into Topics hides browse variety.
 */
export type HubLaneId =
  | 'daily'
  | 'graphs'
  | 'web3'
  | 'gaming'
  | 'ai'
  | 'people'
  | 'markets'
  | 'topics';

export type ContestHubSectionId = HubLaneId;

export type ContestHubSection = {
  id: ContestHubSectionId;
  title: string;
  subtitle: string;
  lane: string;
  accent: string;
  lists: ArenaListEntry[];
};

const SECTION_ORDER: ContestHubSectionId[] = [
  'daily',
  'graphs',
  'web3',
  'gaming',
  'ai',
  'people',
  'markets',
  'topics',
];

/**
 * Optionally fold lone lists into Topics to reduce row count — **empty** keeps every
 * thematic lane visible (users asked for richer category browse).
 */
const LANES_MERGE_SINGLETON_INTO_TOPICS: readonly Exclude<ContestHubSectionId, 'topics'>[] = [];

/** Soft prior — Intuition lists skew crypto-native unless another lane dominates. */
const PORTAL_WEB3_PRIOR = 2;

/** UI copy helpers */
export function pluralizeArenaListCount(count: number): 'list' | 'lists' {
  return count === 1 ? 'list' : 'lists';
}

const SECTION_META: Record<
  ContestHubSectionId,
  { title: string; subtitle: string; accent: string; lane: string }
> = {
  daily: {
    lane: 'Daily life',
    title: 'Daily & tools',
    subtitle:
      'Workflow staples, vibes, evergreen daily lists — builders and normal tools people actually rely on.',
    accent: '#fb7185',
  },
  graphs: {
    lane: 'On-graph',
    title: 'Claims · heat · narratives',
    subtitle: 'Indexer-native lists — what’s debated, trending, or narratively loaded on Intuition.',
    accent: '#e879f9',
  },
  web3: {
    lane: 'Web3',
    title: 'Web3 & ecosystems',
    subtitle:
      'Protocols, portals, infra, and staking-shaped lists — on-chain primitives without crowding indexer-native rows.',
    accent: '#00f3ff',
  },
  gaming: {
    lane: 'Games',
    title: 'Games & worlds',
    subtitle: 'Studios, engines, IPs, creators, and play-shaped lists pulled from portal metadata.',
    accent: '#fb923c',
  },
  ai: {
    lane: 'AI',
    title: 'AI & tooling',
    subtitle: 'Agents, models, builders, productivity — and tooling lists from the graph.',
    accent: '#a78bfa',
  },
  people: {
    lane: 'Culture',
    title: 'People & narratives',
    subtitle:
      'Leaders, founders, creators, DAOs — and community-facing lists surfaced from portal data.',
    accent: '#c084fc',
  },
  markets: {
    lane: 'Markets',
    title: 'Macro & themes',
    subtitle: 'Markets language, regimes, narratives — treasury, liquidity, cycles.',
    accent: '#38bdf8',
  },
  topics: {
    lane: 'Topics',
    title: 'More to explore',
    subtitle:
      'Smaller or mixed lanes grouped here — every list is still one tap. Big lanes stay broken out above.',
    accent: '#94a3b8',
  },
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** +1 per token (word-boundary); +2 for spaced tokens inline; phrases +3 substring */
function keywordScore(fullLower: string, words: readonly string[], phrases: readonly string[]): number {
  let n = 0;
  for (const w of words) {
    if (/\s/.test(w)) {
      if (fullLower.includes(w)) n += 2;
      continue;
    }
    try {
      const re = new RegExp(`\\b${escapeRe(w)}\\b`, 'i');
      if (re.test(fullLower)) n += 1;
    } catch {
      /* ignore */
    }
  }
  for (const ph of phrases) {
    if (fullLower.includes(ph)) n += 3;
  }
  return n;
}

/** Short crypto / infra tokens that break \b semantics if combined */
function tallyShortTokens(fullLower: string, tokens: readonly string[]): number {
  let n = 0;
  const pad = ` ${fullLower.replace(/\s+/g, ' ')} `;
  for (const t of tokens) {
    if (pad.includes(` ${t} `) || pad.startsWith(`${t} `) || pad.endsWith(` ${t}`)) n += 1;
  }
  return n;
}

/**
 * Where a curated list lands in the **browse hub** UI.
 */
export function hubLaneForList(entry: ArenaListEntry): ContestHubSectionId {
  /** Curated primitives — deterministic rows so hubs don’t devolve into a single mega-lane. */
  switch (entry.arenaCategory) {
    case 'graph':
      return 'graphs';
    case 'daily':
      return 'daily';
    case 'ecosystem':
      return 'web3';
    case 'identities':
      return 'people';
    case 'macro':
      return 'markets';
    case 'network':
      return inferPortalHubLane(entry);
  }
}

/**
 * Portal lists — heuristic lane. Web3 baseline prior keeps crypto-native ambiguity landing
 * safely; Gaming / AI / Culture / Markets win on stronger keyword matches.
 */
export function inferPortalHubLane(entry: ArenaListEntry): ContestHubSectionId {
  const titleRaw = `${entry.title || ''}`;
  const descRaw = `${entry.description || ''}`;
  const hay = `${titleRaw} ${descRaw}`.toLowerCase();

  /** Clear Web3-leading title */
  if (/^web3\b/i.test(titleRaw.trim())) return 'web3';

  const web3Words = [
    'web3',
    'blockchain',
    'crypto',
    'cryptocurrency',
    'bitcoin',
    'ethereum',
    'defi',
    'nft',
    'nfts',
    'dao',
    'daos',
    'dapp',
    'dapps',
    'rollup',
    'rollups',
    'staking',
    'solidity',
    'validator',
    'validators',
    'sequencer',
    'evm',
    'dex',
    'cex',
    'bridge',
    'bridging',
    'metamask',
    'opensea',
    'custody',
    'onchain',
    'memecoin',
    'cryptography',
    'zk',
    'oracle',
    'oracles',
    'subgraph',
    '/ipfs',
    ' rwa ',
    'mev ',
    'farcaster',
    'lens',
    'soulbound',
    'vesting',
    'airdrop',
    'multisig',
    'cold',
    'hot',
    'ledger',
    'trezor',
    'smart',
    // chains (avoid "base"/"polygon" substring issues via phrases + short tokens below)
    'arbitrum',
    'optimism',
    'solana',
    'cosmos',
    'avalanche',
    'hyperliquid',
  ] as const;

  const web3Phrases = [
    'smart contract',
    'layer 2',
    'layer-2',
    'l2 ',
    'zero knowledge',
    'zkevm',
    'account abstraction',
    'on-chain',
    'cross-chain',
    'auditing company',
    'analytics tool',
    'block explorer',
    'validator set',
    ' mempool ',
    'roll-up',
    'optimistic',
    'intuition list',
    'members indexed',
  ] as const;

  const aiWords = [
    'llm',
    'llms',
    'gpt',
    'gpt-4',
    'gpt4',
    'chatgpt',
    'openai',
    'anthropic',
    'claude',
    'gemini',
    'mistral',
    'perplexity',
    'groq',
    'copilot',
    'coding',
    'codegen',
    'neural',
    'multimodal',
    'embeddings',
    'embedding ',
    'inference',
    'tokenizer',
    'langchain',
    'llama',
    'mixtral',
    'jupyter',
    'notebook',
    'rag ',
    'vector',
    'latent',
    'diffusion',
    'stable',
    'midjourney',
    'devtools',
    'ide ',
    'cursor',
    'automation',
    'workflow',
    'workflows',
    'plugin',
    'plugins',
    'extension',
    'vscode',
    'saas',
    'software',
    'machine',
  ] as const;

  const aiPhrases = [
    'machine learning',
    'language model',
    'foundation model',
    'fine tuning',
    'fine-tuning',
    'vector db',
    'semantic search',
    'text generation',
    'speech to text',
    'speech-to-text',
    'image generation',
    'text to image',
    'text-to-image',
    'function calling',
    'tool use',
    'agentic',
    'best ai ',
    'what is the best ',
    'which ',
    '? ', // heuristic: many question-style lists compare tools
    'vs ',
    ' versus ',
    'devtools',
    'developer tool',
    'productivity ',
  ] as const;

  const peopleWords = [
    'ceo',
    'cto',
    'cfo',
    'founder',
    'co-founder',
    'cofounder',
    'chairman',
    'investor',
    'angel ',
    'influencer',
    'speaker',
    'curator',
    'curators',
    'moderator',
    'ambassador',
    'evangelist',
    'journalist',
    'executive',
    'leader',
    'leadership',
    'community ',
    'community-',
    'guild',
    'kol ',
    'public',
    'profile',
    'talent',
    'creator',
    'creators',
    'builder',
    'builders',
    'podcast ',
    'youtube',
    'twitter',
    'substack',
    'researcher',
    'economist ',
    'analyst ',
    'host ',
    'whale ',
    'whales',
    'vc ',
    'venture',
    'angel',
    'person',
    'people',
    'founders',
    'mentor ',
    'hero ',
    'icon ',
    'legend ',
  ] as const;

  const peoplePhrases = [
    'thought leader',
    'public figure',
    'chief executive',
    'key opinion',
    'kols',
    'to follow ',
    'must follow ',
    'people to ',
    'who is ',
    'who should ',
    'biggest ',
    'most influential ',
    'influential ',
    'best founder',
    'best ceo',
    'top influencers',
    'top founders',
    'top thinkers',
    'top creators',
    'top builders',
    'crypto ceo',
    'web3 ceo',
    'builders to ',
    'builders who ',
    'builders you ',
    'builders i ',
    'creators ',
  ] as const;

  const marketsWords = [
    'macro',
    'micro',
    'ticker',
    'equities',
    'equity',
    'bond ',
    'bonds',
    'treasury',
    'forex',
    'commodities',
    'gold ',
    'silver ',
    'inflation',
    'deflation',
    'stagflation',
    'recession',
    'soft landing',
    'etf',
    'etfs ',
    's&p ',
    'trading ',
    'traders',
    'trader ',
    'nasdaq ',
    'dow ',
    'sp500',
    'bitcoin etf',
    'fed ',
    'fomc ',
    'ecb ',
    'rates ',
    'rate ',
    'hike',
    'cut ',
    'cuts ',
    'cuts.',
    'dovish',
    'hawkish',
    'cpi ',
    'gdp ',
    'liquidity ',
    'liquid ',
    'funding ',
    'perpetual ',
    'perps ',
    'basis ',
    'carry ',
    'arb ',
    'arbitrage',
    'options ',
    'puts ',
    'calls ',
    'strike',
    'tokenomics ',
    'emissions',
    'unlock ',
    'unlocks',
    'vesting ',
    'bull ',
    'bear ',
    'cycle ',
    'halving',
    'ath ',
    'atl ',
    'drawdown ',
    'correction ',
    'bubble ',
    'valuation ',
    'market cap ',
    'marketcap',
    'fdv ',
    'tvl ',
  ] as const;

  const marketsPhrases = [
    'market cap ',
    'interest rate ',
    'rate hikes',
    'rate cuts',
    'yield curve',
    'risk on',
    'risk-off',
    'risk off',
    'risk-on',
    'business cycle ',
    'recession playbook',
    'fed meeting',
    'forward guidance',
    'quantitative tightening',
    'quantitative easing',
    'risk asset',
    'flight to ',
    'depeg',
    'de-peg ',
  ] as const;

  const gamingWords = [
    'game',
    'games',
    'gaming',
    'gamer',
    'gamers',
    'gameplay',
    'esports',
    'minecraft',
    'fortnite',
    'valorant',
    'dota',
    'league ',
    'overwatch',
    'roblox',
    'nintend',
    'playstation',
    'playstation ',
    'xbox',
    'steam',
    'twitch ',
    'streamer',
    'streamers',
    'speedrun',
    'pokemon',
    'zelda',
    'mario ',
    'roguelike',
    'mmo',
    'mmorpg',
    'rpg ',
    'fps ',
    'unity ',
    'unreal ',
    'gamefi',
    'metaverse ',
    'pixel ',
    'skins ',
    'level design',
    'game studio',
    'anim ',
    'mocap ',
  ] as const;

  const gamingPhrases = [
    'video game',
    'video games',
    'gaming industry',
    'game developer',
    'game design',
    'game engine',
    'player base',
    'season pass',
    'patch notes',
    'play to earn',
    'play-to-earn',
    'virtual world',
    'open world ',
    'tabletop ',
    'card game ',
    'battle royale ',
  ] as const;

  const aiWordHits: readonly string[] = [...aiWords, 'ai'];

  type InferLaneKey = 'gaming' | 'web3' | 'ai' | 'people' | 'markets';
  const scores: Record<InferLaneKey, number> = {
    gaming: keywordScore(hay, gamingWords as unknown as readonly string[], gamingPhrases as unknown as readonly string[]),
    web3:
      PORTAL_WEB3_PRIOR +
      keywordScore(hay, web3Words as unknown as readonly string[], web3Phrases as unknown as readonly string[]),
    ai:
      keywordScore(hay, aiWordHits, aiPhrases as unknown as readonly string[]) +
      (/\bai\b|\bllms?\b|\bgpt\b|\bagent(s)?\b/i.test(titleRaw) &&
      /\b(best|greater|favorite|popular|better|versus|rank|leading|worst|coolest|fastest)\b/i.test(titleRaw)
        ? 5
        : 0),
    people:
      keywordScore(hay, peopleWords as unknown as readonly string[], peoplePhrases as unknown as readonly string[]),
    markets: keywordScore(
      hay,
      marketsWords as unknown as readonly string[],
      marketsPhrases as unknown as readonly string[],
    ),
  };

  /** Short ticker-style tokens → Web3 infra */
  scores.web3 +=
    tallyShortTokens(hay, [
      'eth',
      'btc',
      'bnb',
      'sol',
      'arb',
      'op',
      'matic',
      'avax',
      'atom',
      'zk',
      'rwa',
      'defi',
      'nft',
      'dao',
    ]) * 2;

  scores.web3 += /\b(base|polygon|hyperevm|linea|scroll|mantle)\b/i.test(hay) ? 3 : 0;
  scores.web3 += /\b(wallet|custody|bridge|staking|nft|dex|cex|validators?|chain|protocol|infra)\b/i.test(hay)
    ? 1
    : 0;

  scores.ai += /\b(prompt|gpt-?\d+|openai|claude|llama)\b/i.test(hay) ? 2 : 0;
  scores.ai +=
    /\b(tool|devtools|developer tool|tooling|workspace|slack|discord bot|vscode|extension)\b/i.test(hay) ? 1 : 0;

  scores.people += /\bfounder(s)?\b|\bceo\b|\bcto\b|\bcfo\b/i.test(titleRaw) ? 3 : 0;
  scores.people += /\bcommunity\b|\bcreator\b|\binfluencer\b|\bleader\b|\bthought\b/i.test(hay) ? 2 : 0;
  scores.people += /\bcrypto\b.*\bceo\b|\bceo\b.*\bcrypto\b/i.test(hay) ? 4 : 0;

  scores.markets += /\b(bull|bear|macro|rates|yield|liquidity|cyclic|cyclical|liquidation)\b/i.test(hay) ? 2 : 0;

  scores.gaming += /\b(playstation|gog\.com|epic games|bungie|riot games|blizzard|ubisoft)\b/i.test(hay) ? 5 : 0;
  scores.gaming +=
    /\b(best|favorite|popular|top \d|worst|greatest|underrated)\b/i.test(titleRaw) &&
    /\bgames?\b|\bgaming\b|\besports\b|\bplayers?\b/i.test(hay)
      ? 4
      : 0;
  /** NFT + game language often means gamefi / virtual goods — lean Gaming over raw Web3 unless DeFi-dominant */
  if (
    /\bnft\b|\bnfts\b/i.test(hay) &&
    /\bgames?\b|\bgaming\b|\bplayer(s)?\b|\bmetaverse\b/i.test(hay) &&
    !/\bdefi\b|\bstaking\b|\bdex\b|\blayer 2\b|\bl2\b|\brollup\b/i.test(hay)
  ) {
    scores.gaming += 3;
  }

  /** Infra overlaps — boosts Web3 for protocol / chain language */
  if (/\binfrastructure\b|\bscaling\b|\bsecurity\s+audit\b|\bnode\s+operators?\b|\bsequencer\b/i.test(hay))
    scores.web3 += 2;

  const maxScore = Math.max(scores.gaming, scores.web3, scores.ai, scores.people, scores.markets);

  /** Strongest lane wins — ties bias toward more specific intents before the Web3 prior. */
  const tieOrder: InferLaneKey[] = ['gaming', 'ai', 'people', 'markets', 'web3'];

  if (
    /\bai\b|\bllms?\b|\bagent(s)?\b/i.test(titleRaw) &&
    /\b(best|better|favorite|popular|versus|greater|worst|coolest|fastest)\b/i.test(titleRaw)
  ) {
    if (scores.ai >= scores.web3) return 'ai';
  }

  if (
    /\bgames?\b|\bgaming\b|\bplayer(s)?\b|\besports\b/i.test(titleRaw) &&
    /\b(best|better|favorite|popular|versus|worst|coolest|top \d|greatest)\b/i.test(titleRaw)
  ) {
    if (scores.gaming >= scores.web3) return 'gaming';
  }

  for (const id of tieOrder) {
    if (scores[id] === maxScore) return id;
  }

  return 'topics';
}

export type HubRowId = 'web3' | 'ai';

/** @deprecated */
export function hubRowForEntry(e: ArenaListEntry): HubRowId {
  const lane = hubLaneForList(e);
  if (lane === 'people' || lane === 'topics' || lane === 'markets') return 'ai';
  return 'web3';
}

export function buildContestHubSections(lists: ArenaListEntry[]): ContestHubSection[] {
  const buckets = new Map<ContestHubSectionId, ArenaListEntry[]>();
  for (const id of SECTION_ORDER) buckets.set(id, []);

  for (const L of lists) {
    buckets.get(hubLaneForList(L))!.push(L);
  }

  /** Optional: fold configured singleton lanes into Topics (`LANES_MERGE_SINGLETON_INTO_TOPICS`). */
  const topicsBucket = buckets.get('topics')!;
  for (const id of LANES_MERGE_SINGLETON_INTO_TOPICS) {
    const arr = buckets.get(id)!;
    if (arr.length === 1) {
      topicsBucket.push(...arr);
      buckets.set(id, []);
    }
  }

  for (const id of SECTION_ORDER) {
    const arr = buckets.get(id)!;
    arr.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
  }

  const out: ContestHubSection[] = [];
  for (const id of SECTION_ORDER) {
    const listsIn = buckets.get(id)!;
    if (!listsIn.length) continue;
    const m = SECTION_META[id];
    out.push({
      id,
      title: m.title,
      subtitle: m.subtitle,
      lane: m.lane,
      accent: m.accent,
      lists: listsIn,
    });
  }
  return out;
}
