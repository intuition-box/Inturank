import type { RankItem } from '../pages/RankedList';
import type { ArenaTheme } from '../pages/RankedList';

const GRAPH_POOL_SIZE = 28;

/**
 * Curated “lists” in the Intuition / IntuRank sense: user picks a list, sees one yes/no
 * question per item, then batches TRUST. Question copy should match the list.
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

export function getArenaListConstituents(entry: ArenaListEntry): number {
  if (entry.source === 'static') return entry.items.length;
  if (entry.source === 'portal') return Math.max(1, entry.totalItems);
  return GRAPH_POOL_SIZE;
}

export function getArenaPreviewItems(entry: ArenaListEntry, loadedPool: RankItem[]): RankItem[] {
  if (entry.source === 'static') return entry.items;
  if (entry.source === 'portal') {
    return entry.previewItemsData.slice(0, 5).map((p, i) => ({
      id: p.termId || `pv-${i}-${(p.label || 'x').slice(0, 8)}`,
      kind: 'atom' as const,
      label: p.label || '—',
      pairKind: 'preview',
      image: p.image,
    }));
  }
  return loadedPool.slice(0, 5);
}

export function buildArenaItemQuestion(entry: ArenaListEntry, item: RankItem): string {
  if (entry.itemQuestion) return entry.itemQuestion(item);
  const n = (item.label || 'This').trim();
  return `Is “${n}” a stand-out for “${entry.title}” right now?`;
}

/** Intuition ecosystem & community-style lists (extend with real term ids later). */
export const ARENA_LISTS: ArenaListEntry[] = [
  {
    id: 'trust-your-tools',
    title: 'Tools you’d bet your workflow on',
    description:
      'Everyday software people actually live in — no wallet required to browse picks. Stake later if you want your vote on-chain.',
    tag: 'Daily',
    arenaCategory: 'daily',
    listGlyph: '◎',
    itemQuestion: (item) =>
      `If you had to rely on ${item.label} for something important tomorrow, would you trust it — yes or no?`,
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
    description: 'Teams and products shipping on the Intuition graph.',
    tag: 'ecosystem',
    arenaCategory: 'ecosystem',
    listGlyph: '◇',
    itemQuestion: (item) => `Is ${item.label} a project you want highlighted for “Built on Intuition” right now?`,
    source: 'static',
    items: [
      atom('arena-sophia', 'Sophia', 'Ecosystem', 'project'),
      atom('arena-nexora', 'Nexora', 'Ecosystem', 'project'),
      atom('arena-overmind', 'Overmind Gallery', 'Ecosystem', 'project'),
      atom('arena-inturank', 'IntuRank', 'Ecosystem', 'project'),
      atom('arena-intuition', 'Intuition', 'Ecosystem', 'project'),
    ],
  },
  {
    id: 'ict-accounts',
    title: 'ICT — accounts to follow',
    description: 'Signal-bearing identities on Intuition.',
    tag: 'ICT',
    arenaCategory: 'identities',
    listGlyph: '@',
    itemQuestion: (item) => `Is ${item.label} an account you’d follow or recommend in this list?`,
    source: 'static',
    items: [
      atom('arena-mac-also', 'mac.also.eth', 'Identity', 'ict'),
      atom('arena-noyan', 'noyantrk', 'Identity', 'ict'),
      atom('arena-intu-official', 'intuition', 'Identity', 'ict'),
    ],
  },
  {
    id: 'signal-city',
    title: 'Signal City — accounts',
    description: 'High-signal city accounts to surface.',
    tag: 'Signal City',
    arenaCategory: 'identities',
    listGlyph: '◎',
    itemQuestion: (item) => `Is ${item.label} worth a spot in your Signal City set?`,
    source: 'static',
    items: [
      atom('arena-sc-1', 'Curator A', 'Signal', 'signal-city'),
      atom('arena-sc-2', 'Curator B', 'Signal', 'signal-city'),
      atom('arena-sc-3', 'Node C', 'Signal', 'signal-city'),
    ],
  },
  {
    id: 'top-community',
    title: 'Top community members',
    description: 'Who belongs in the set?',
    tag: 'community',
    arenaCategory: 'ecosystem',
    listGlyph: '☆',
    itemQuestion: (item) => `Is ${item.label} a top community member for you, yes or no?`,
    source: 'static',
    items: [
      atom('arena-mem-1', 'Caleb', 'Member', 'community'),
      atom('arena-mem-2', 'Blocky', 'Member', 'community'),
      atom('arena-mem-3', 'Zet', 'Member', 'community'),
    ],
  },
  {
    id: 'open-claims',
    title: 'Open claims (graph)',
    description: 'Battle and head-to-head claims from the indexer.',
    tag: 'claims',
    arenaCategory: 'graph',
    listGlyph: '⚔',
    itemQuestion: (item) => `Do you stand behind this claim on this pass — yes or no?`,
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
    description: 'Macro themes and tickers.',
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
      description: 'Live list from the Intuition network — pick who belongs.',
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
