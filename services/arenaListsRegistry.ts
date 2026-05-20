import type { RankItem } from '../pages/RankedList';
import type { ArenaTheme } from '../pages/RankedList';
import { BUILT_ON_INTUITION_PORTAL_LIST_OBJECT_TERM_ID } from '../constants';

const GRAPH_POOL_SIZE = 28;

/**
 * Arena list catalog (`/climb` grid and routing).
 *
 * This file does NOT load Intuition GraphQL by itself. It only declares contests and labels.
 *
 * • `source: 'static'`: In-repo pick list (daily-life onboarding). **Not** on-chain labels by itself;
 *   stakes still go through the protocol when users commit.
 * • `source: 'graphql'`: Pool built in `RankedList.tsx` **only** from the Intuition indexer (GraphQL):
 *   claim-themed lanes use `getTopClaims`; identity/vault lanes use `getAllAgents` via
 *   `fetchArenaLiveAtomsFromGraph`. **No placeholder names** when the indexer returns nothing (empty pool).
 * • `source: 'portal'`: Roster = indexed list triples for `listObjectTermId` (`getListMemberSubjectsForObject`).
 *
 * Prefer `getArenaDataSourceFootprint` in the UI so curated vs indexer vs list is obvious on every card.
 */
/** Filter chips on Arena home (Wispear-style). */
export const ARENA_CATEGORY_PILLS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'daily', label: 'Daily life' },
  { id: 'network', label: 'Network' },
  { id: 'ecosystem', label: 'Ecosystem' },
  { id: 'identities', label: 'Identities' },
  { id: 'graph', label: 'Graph' },
  { id: 'macro', label: 'Macro' },
];

export const PORTAL_LIST_PREFIX = 'portal-';

export function portalListIdFromTermId(termId: string): string {
  return `${PORTAL_LIST_PREFIX}${termId}`;
}

export function parsePortalListTermId(id: string | null | undefined): string | null {
  if (!id || !id.startsWith(PORTAL_LIST_PREFIX)) return null;
  return id.slice(PORTAL_LIST_PREFIX.length) || null;
}

export type ArenaListEntry =
  | {
      id: string;
      title: string;
      description: string;
      tag: string;
      /** Category id for filter pills (see `ARENA_CATEGORY_PILLS`). */
      arenaCategory: 'daily' | 'ecosystem' | 'identities' | 'graph' | 'macro' | 'network';
      /** Center tile on the list card (emoji or short glyph) */
      listGlyph?: string;
      /** Optional hero image on hub tiles (future art pass). */
      coverImage?: string;
      /**
       * Full sentence for the current card, e.g. "Is Sophia the stand-out on this list?"
       * If omitted, `buildArenaItemQuestion` uses a default from title.
       */
      itemQuestion?: (item: RankItem) => string;
      source: 'static';
      items: RankItem[];
    }
  | {
      id: string;
      title: string;
      description: string;
      tag: string;
      arenaCategory: 'daily' | 'ecosystem' | 'identities' | 'graph' | 'macro' | 'network';
      listGlyph?: string;
      itemQuestion?: (item: RankItem) => string;
      coverImage?: string;
      source: 'graphql';
      theme: ArenaTheme;
    }
  | {
      id: string;
      title: string;
      description: string;
      tag: string;
      arenaCategory: 'daily' | 'ecosystem' | 'identities' | 'graph' | 'macro' | 'network';
      listGlyph?: string;
      itemQuestion?: (item: RankItem) => string;
      coverImage?: string;
      /** List object `term_id` (Intuition "list" as object in list triples). */
      source: 'portal';
      listObjectTermId: string;
      totalItems: number;
      previewItemsData: Array<{ termId?: string; label: string; image?: string }>;
    };

function atom(
  id: string,
  label: string,
  subtitle: string,
  pairKind: string
): RankItem {
  return { id, kind: 'atom', label, subtitle, pairKind };
}

/** How lineup data is sourced. Shown as a small badge so Arena never reads as “all mocks”. */
export type ArenaDataSourceFootprintKind = 'curated_static' | 'live_indexer' | 'portal_chain';

export type ArenaDataSourceFootprint = {
  kind: ArenaDataSourceFootprintKind;
  /** Short uppercase-style label for chips (e.g. “Live graph”). */
  badgeShort: string;
  /** One line for humans / tooltips (demo script). */
  detailLine: string;
};

/** Surface on cards and headers: curated lists vs indexer pools vs on-chain lists. */
export function getArenaDataSourceFootprint(entry: ArenaListEntry): ArenaDataSourceFootprint {
  if (entry.source === 'static') {
    return {
      kind: 'curated_static',
      badgeShort: 'Curated',
      detailLine:
        'Lineup edited in-app for onboarding. Connect wallet and staking still use Intuition infra when you commit.',
    };
  }
  if (entry.source === 'portal') {
    return {
      kind: 'portal_chain',
      badgeShort: 'On-chain list',
      detailLine: 'Members loaded from Intuition indexed list triples for this list term.',
    };
  }
  // graphql-backed contests (identities, claims, etc.)
  if (entry.source === 'graphql') {
    const lines: Partial<Record<ArenaTheme, string>> = {
      claims: 'Head-to-head and battle-shaped claims ranked from Intuition (`getTopClaims`).',
      narratives: 'Predictive narrative claims filtered live from indexer pools.',
      passion: 'High-activity claims from vault / holder signals.',
      tokens:
        'Macro/themes lane: vault-ranked identities from the indexer only. Empty if the graph has no rows.',
      atoms: 'Popular identities from the indexer, ranked by vault activity (not a hand-written list).',
      identities:
        'Prefers Account / Person vaults; widens to other vault-ranked identities if that pool is thin.',
    };
    return {
      kind: 'live_indexer',
      badgeShort: 'Live graph',
      detailLine:
        lines[entry.theme] ||
        'Card pool loaded only from live Intuition GraphQL (empty if the indexer returns nothing).',
    };
  }

  throw new Error('getArenaDataSourceFootprint: unsupported entry shape');
}

export function getArenaListConstituents(entry: ArenaListEntry): number {
  if (entry.source === 'static') return entry.items.length;
  if (entry.source === 'portal') return Math.max(1, entry.totalItems);
  return GRAPH_POOL_SIZE;
}

export function getArenaPreviewItems(entry: ArenaListEntry, loadedPool: RankItem[]): RankItem[] {
  if (entry.source === 'static') return entry.items;
  if (entry.source === 'portal') {
    const seeded = entry.previewItemsData.slice(0, 5).map((p, i) => ({
      id: p.termId || `pv-${i}-${(p.label || 'x').slice(0, 8)}`,
      kind: 'atom' as const,
      label: p.label || '…',
      pairKind: 'preview',
      image: p.image,
    }));
    if (seeded.length > 0) return seeded;
    return loadedPool.slice(0, 5);
  }
  return loadedPool.slice(0, 5);
}

export function buildArenaItemQuestion(entry: ArenaListEntry, item: RankItem): string {
  if (entry.itemQuestion) return entry.itemQuestion(item);
  const n = (item.label || 'This').trim();
  return `Is “${n}” a stand-out for “${entry.title}” right now?`;
}

/** Curated arena tiles bundled with IntuRank. Graph-backed arenas use `graphql` or `portal` rows below. */
export const ARENA_LISTS: ArenaListEntry[] = [
  {
    id: 'trust-your-tools',
    title: 'Tools you’d bet your workflow on',
    description:
      'Everyday software people actually live in. No wallet required to browse picks; stake later to put votes on-chain.',
    tag: 'Daily',
    arenaCategory: 'daily',
    listGlyph: '◎',
    itemQuestion: (item) =>
      `If you had to rely on ${item.label} for something important tomorrow, would you trust it? Yes or no.`,
    source: 'static',
    items: [
      atom('arena-tool-cursor', 'Cursor', 'Editor / agent', 'daily-tool'),
      atom('arena-tool-notion', 'Notion', 'Docs & wiki', 'daily-tool'),
      atom('arena-tool-slack', 'Slack', 'Team chat', 'daily-tool'),
      atom('arena-tool-figma', 'Figma', 'Design', 'daily-tool'),
      atom('arena-tool-linear', 'Linear', 'Issues', 'daily-tool'),
      atom('arena-tool-apple-notes', 'Apple Notes', 'Quick capture', 'daily-tool'),
    ],
  },
  {
    id: 'built-on-intuition',
    title: 'Built on Intuition',
    description:
      'Same roster as the portal list: indexed list triples (subject in list) · live subgraph order.',
    tag: 'ecosystem',
    arenaCategory: 'ecosystem',
    listGlyph: '◇',
    itemQuestion: (item) => `Is ${item.label} a project you want highlighted for “Built on Intuition” right now?`,
    source: 'portal',
    listObjectTermId: BUILT_ON_INTUITION_PORTAL_LIST_OBJECT_TERM_ID,
    /** Registry default before live `countListMembersForObject` hydrates the hub. */
    totalItems: 146,
    previewItemsData: [],
  },
  {
    id: 'ict-accounts',
    title: 'ICT · accounts to follow',
    description:
      'Account / Person vaults from graph ranking; widens to other atom vaults if that slice is thin. Empty if the indexer returns nothing.',
    tag: 'ICT',
    arenaCategory: 'identities',
    listGlyph: '@',
    itemQuestion: (item) => `Is ${item.label} an account you’d follow or recommend in this list?`,
    source: 'graphql',
    theme: 'identities',
  },
  {
    id: 'signal-city',
    title: 'Signal City · spotlight',
    description: 'Same indexer path as ICT. Empty deck if the graph has no eligible rows.',
    tag: 'Signal City',
    arenaCategory: 'identities',
    listGlyph: '◎',
    itemQuestion: (item) => `Is ${item.label} worth a spot in your Signal City set?`,
    source: 'graphql',
    theme: 'identities',
  },
  {
    id: 'top-community',
    title: 'Top community members',
    description: 'Identity-first vault crawl from graph order. Empty if the indexer returns nothing.',
    tag: 'community',
    arenaCategory: 'ecosystem',
    listGlyph: '☆',
    itemQuestion: (item) => `Is ${item.label} a top community member for you, yes or no?`,
    source: 'graphql',
    theme: 'identities',
  },
  {
    id: 'open-claims',
    title: 'Open claims (graph)',
    description: 'Battle and head-to-head claims loaded live from Intuition GraphQL.',
    tag: 'claims',
    arenaCategory: 'graph',
    listGlyph: '⚔',
    itemQuestion: (item) => `Do you stand behind this claim on this pass? Yes or no.`,
    source: 'graphql',
    theme: 'claims',
  },
  {
    id: 'narratives',
    title: 'Narratives (graph)',
    description: 'Prediction- and future-shaped lines.',
    tag: 'narratives',
    arenaCategory: 'graph',
    listGlyph: '◆',
    itemQuestion: (item) => `Does this narrative fit what you care about right now?`,
    source: 'graphql',
    theme: 'narratives',
  },
  {
    id: 'heat',
    title: 'High activity (graph)',
    description: 'What’s hot on the graph.',
    tag: 'heat',
    arenaCategory: 'graph',
    listGlyph: '🔥',
    itemQuestion: (item) => `Does this claim deserve the spotlight right now?`,
    source: 'graphql',
    theme: 'passion',
  },
  {
    id: 'ticker-themes',
    title: 'Ticker & themes',
    description:
      'Vault-ranked identities from the indexer only. Empty deck if the graph returns nothing for this scan.',
    tag: 'themes',
    arenaCategory: 'macro',
    listGlyph: '₮',
    itemQuestion: (item) => `Is this a theme you’d highlight for this cycle?`,
    source: 'graphql',
    theme: 'tokens',
  },
];

const runtimePortalLists = new Map<string, Extract<ArenaListEntry, { source: 'portal' }>>();

export function registerPortalListEntries(entries: Extract<ArenaListEntry, { source: 'portal' }>[]) {
  runtimePortalLists.clear();
  for (const e of entries) runtimePortalLists.set(e.id, e);
}

export function getArenaListById(id: string | null | undefined): ArenaListEntry | undefined {
  if (!id) return undefined;
  const fromCurated = ARENA_LISTS.find((l) => l.id === id);
  if (fromCurated) return fromCurated;
  const fromPortal = runtimePortalLists.get(id);
  if (fromPortal) return fromPortal;
  const term = parsePortalListTermId(id);
  if (term) {
    return {
      id,
      source: 'portal',
      listObjectTermId: term,
      title: 'Intuition list',
      description: 'Live list from the Intuition network. Pick who belongs.',
      tag: 'Network',
      arenaCategory: 'network',
      listGlyph: '⬡',
      totalItems: 0,
      previewItemsData: [],
      itemQuestion: (item) =>
        `Does “${(item.label || 'this entry').trim()}” belong on this list for you right now?`,
    };
  }
  return undefined;
}

export function filterArenaListsByCategory(lists: ArenaListEntry[], categoryId: string): ArenaListEntry[] {
  if (categoryId === 'all') return lists;
  return lists.filter((l) => l.arenaCategory === categoryId);
}
