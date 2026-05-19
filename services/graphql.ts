
import {
  GRAPHQL_URL,
  IS_PREDICATE_ID,
  DISTRUST_ATOM_ID,
  LIST_PREDICATE_ID,
  FEE_PROXY_ADDRESS,
  MULTI_VAULT_ADDRESS,
  LINEAR_CURVE_ID,
  OFFSET_PROGRESSIVE_CURVE_ID,
  ARENA_ATTRIBUTION_MIN_BLOCK,
  ARENA_XP_PER_RANK_PICK,
  ARENA_PORTAL_LISTS_FETCH_LIMIT,
  SIGNAL_PULSE_HERO_ATOM_LABELS,
} from '../constants';
import { Account, Transaction, Claim, Triple } from '../types';
import { hexToString, formatEther, parseEther, getAddress, isAddress } from 'viem';
import { safeWeiToEther, safeParseUnits } from './analytics';
import { normalizeWebMediaUrl } from './mediaUrl';
import { publicClient } from './web3';

function graphCachedImageUrl(ci: { url?: string; safe?: boolean } | null | undefined): string | undefined {
  if (!ci?.url) return undefined;
  if (ci.safe === false) return undefined;
  return ci.url;
}

// Request guard to prevent parallel overlapping global claims fetches
let isGlobalClaimsFetching = false;

/** In-flight dedupe + optional TTL cache to cut duplicate requests (React strict mode, LB panels, navigation). */
const gqlInflight = new Map<string, Promise<any>>();
const gqlResponseCache = new Map<string, { exp: number; data: any }>();
const GQL_CACHE_MAX_ENTRIES = 96;

function gqlRequestKey(query: string, variables: any): string {
  let vs: string;
  try {
    vs = JSON.stringify(variables ?? {});
  } catch {
    vs = String(variables);
  }
  return `${query}\n${vs}`;
}

function gqlCacheSet(key: string, data: any, ttlMs: number) {
  if (ttlMs <= 0) return;
  while (gqlResponseCache.size >= GQL_CACHE_MAX_ENTRIES) {
    const first = gqlResponseCache.keys().next().value;
    if (first === undefined) break;
    gqlResponseCache.delete(first);
  }
  gqlResponseCache.set(key, { exp: Date.now() + ttlMs, data });
}

/**
 * @param ttlMs Optional cache TTL for successful responses (same query+variables). Skipped on retries.
 */
const fetchGraphQL = async (query: string, variables: any = {}, retries = 2, ttlMs?: number): Promise<any> => {
  const key = gqlRequestKey(query, variables);

  if (retries === 2 && ttlMs != null && ttlMs > 0) {
    const hit = gqlResponseCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.data;
  }

  if (retries === 2) {
    const pending = gqlInflight.get(key);
    if (pending) return pending;
  }

  const exec = (async (): Promise<any> => {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if ((response.status === 429 || response.status >= 500) && retries > 0) {
      await new Promise((r) => setTimeout(r, 1500 * (3 - retries)));
      return fetchGraphQL(query, variables, retries - 1, undefined);
    }
    const result = await response.json();
    if (result.errors) {
      const msg = result.errors.map((e: any) => e.message || JSON.stringify(e)).join("; ");
      console.warn("GraphQL Query Error:", msg, result.errors);
      throw new Error(msg || "GraphQL error");
    }
    const data = result.data;
    if (retries === 2 && ttlMs != null && ttlMs > 0) {
      gqlCacheSet(key, data, ttlMs);
    }
    return data;
  })();

  if (retries === 2) {
    gqlInflight.set(key, exec);
    exec.finally(() => gqlInflight.delete(key));
  }

  return exec;
};

const normalize = (x: string) => x ? x.toLowerCase() : '';

/**
 * Parse TRUST notional for a claim side from `total_market_cap` (often wei as string) or `total_assets` wei fallback.
 */
function parseClaimVaultSideTrust(marketCap: unknown, assetsWei: unknown): number {
  if (marketCap != null && marketCap !== '') {
    const str = String(marketCap).trim();
    if (str && str !== '0') {
      if (/^\d+$/.test(str)) {
        try {
          const w = BigInt(str);
          if (w > 0n) return parseFloat(formatEther(w));
        } catch {
          /* fall through */
        }
      }
      const n = Number(str);
      if (!isNaN(n) && n > 0) {
        return n > 1e15 ? safeWeiToEther(str) : n;
      }
    }
  }
  const a = assetsWei != null && String(assetsWei) !== '' ? String(assetsWei) : '0';
  try {
    if (a === '0') return 0;
    return parseFloat(formatEther(BigInt(a)));
  } catch {
    return 0;
  }
}

/**
 * IntuRank routes deposits/redemptions through FeeProxy; the subgraph often sets `sender` to the proxy.
 * The EOA user is typically on `receiver` for deposits (and similarly when sender is proxy on redemptions).
 */
function resolveProxyActivityAccount(dep: {
  sender?: { id?: string; label?: string; image?: string } | null;
  receiver?: { id?: string; label?: string; image?: string } | null;
} | null | undefined): { id: string; label?: string; image?: string } | null {
  if (!dep) return null;
  const sender = dep.sender;
  const receiver = dep.receiver;
  const sId = sender?.id ? normalize(sender.id) : '';
  const isProxy = sId === normalize(FEE_PROXY_ADDRESS) || sId === normalize(MULTI_VAULT_ADDRESS);
  if (isProxy && receiver?.id) return receiver as { id: string; label?: string; image?: string };
  return (sender ?? receiver) ?? null;
}

/** Graph `account.id` variants for contracts that route IntuRank traffic in the indexer. */
function feeProxyRoutedSenderGraphIds(): string[] {
  const s = new Set<string>();
  for (const addr of [FEE_PROXY_ADDRESS, MULTI_VAULT_ADDRESS]) {
    for (const id of prepareQueryIds(addr)) {
      if (id) s.add(id);
    }
  }
  return Array.from(s);
}

export const prepareQueryIds = (id: string) => {
    if (!id) return [];
    const base = id.trim();
    const variants = new Set<string>([base, base.toLowerCase()]);
    if (base.startsWith('0x')) {
        if (base.length === 42 && isAddress(base)) {
            try {
                variants.add(getAddress(base));
            } catch { /* use base as-is */ }
            const padded = '0x' + '0'.repeat(24) + base.slice(2);
            variants.add(padded);
            variants.add(padded.toLowerCase());
        }
        if (base.length === 66 && base.startsWith('0x000000000000000000000000')) {
            const unpadded = '0x' + base.slice(26);
            variants.add(unpadded);
            variants.add(unpadded.toLowerCase());
            if (isAddress(unpadded)) {
                try { variants.add(getAddress(unpadded)); } catch { /* ok */ }
            }
        }
    }
    return Array.from(variants);
};

export const resolveMetadata = (atom: any) => {
    if (!atom) return { label: 'Unknown', description: '', type: 'ATOM', image: undefined, links: [] };
    
    let label = atom.label;
    let description = '';
    let image: string | undefined = atom.image || graphCachedImageUrl(atom.cached_image);
    let links = [];

    // Attempt to decode primary hex data payload for enriched metadata
    if (atom.data && atom.data !== '0x') {
        try {
            const decoded = JSON.parse(hexToString(atom.data as `0x${string}`));
            if (decoded.name && (!label || label.startsWith('0x'))) label = decoded.name;
            if (decoded.description) description = decoded.description;
            if (decoded.image) image = decoded.image;
            if (decoded.links && Array.isArray(decoded.links)) links = decoded.links;
            // Single "url" field (e.g. from CreateSignal thing flow) → treat as creation link
            if (links.length === 0 && decoded.url && typeof decoded.url === 'string') {
                links = [{ label: 'Link', url: decoded.url }];
            }
        } catch (e) {
            // Data field might not be JSON, skip
        }
    }
    
    if (atom.value) {
        const v = atom.value;
        const meta = v.person || v.thing || v.organization || v.account;
        if (meta) {
            if (!label || label.startsWith('0x')) label = meta.name || meta.label;
            if (!description) description = meta.description || '';
            if (!image) image = (meta.image || graphCachedImageUrl(meta.cached_image)) as string | undefined;
            // Some indexers expose url/links on the parsed value
            if (links.length === 0 && meta.links && Array.isArray(meta.links)) links = meta.links;
            if (links.length === 0 && meta.url && typeof meta.url === 'string') links = [{ label: 'Link', url: meta.url }];
        }
    }

    if (atom.triple && atom.triple.object_id?.toLowerCase().includes(DISTRUST_ATOM_ID.toLowerCase().slice(26))) {
        const subjectLabel = atom.triple.subject?.label || atom.triple.subject_id?.slice(0, 8);
        const subMeta = atom.triple.subject ? resolveMetadata(atom.triple.subject) : { image: undefined };
        return {
            label: `OPPOSING_${subjectLabel}`.toUpperCase(),
            description: `A directional signal of distrust against ${subjectLabel} on the Intuition Network.`,
            type: 'CLAIM',
            image: subMeta.image,
            links: []
        };
    }

    return { 
        label: (label && label !== '0x' && !label.startsWith('0x00')) ? label : `${atom.term_id?.slice(0, 8)}...`, 
        description,
        type: atom.type || 'ATOM',
        image: normalizeWebMediaUrl(image),
        links
    };
};

const aggregateVaultData = (allVaults: any[]) => {
  const atomGroups = new Map<string, any>();
  allVaults.forEach(v => {
    const id = normalize(v.term_id);
    const existing = atomGroups.get(id) || { total_assets: 0n, total_shares: 0n, computed_mcap: 0, current_share_price: '0', has_linear: false, position_count: 0 };
    const assets = BigInt(v.total_assets || '0');
    const shares = BigInt(v.total_shares || '0');
    const priceRaw = v.current_share_price || '0';
    const sharesNum = parseFloat(formatEther(shares));
    const priceNum = parseFloat(formatEther(BigInt(priceRaw))) || (sharesNum > 0 ? parseFloat(formatEther(assets)) / sharesNum : 0.1);
    atomGroups.set(id, { term_id: v.term_id, total_assets: existing.total_assets + assets, total_shares: existing.total_shares + shares, computed_mcap: existing.computed_mcap + (sharesNum * priceNum), current_share_price: v.curve_id?.toString() === '1' ? priceRaw : existing.current_share_price || priceRaw, has_linear: v.curve_id?.toString() === '1', position_count: existing.position_count + Number(v.position_count || 0) });
  });
  return Array.from(atomGroups.values());
};

export type GetAllAgentsOptions = {
  /** When set, only vaults with total_assets ≥ this (wei) are returned — use with ascending order for “smallest non-dust” lists. */
  minTotalAssetsWei?: bigint;
};

export const getAllAgents = async (
  limit = 40,
  offset = 0,
  order: 'asc' | 'desc' = 'desc',
  options?: GetAllAgentsOptions
) => {
  const minWei = options?.minTotalAssetsWei;
  const wherePart =
    minWei !== undefined && minWei > 0n
      ? `where: { total_assets: { _gte: "${minWei.toString()}" } }, `
      : '';
  const query = `query GetAgents($limit: Int!, $offset: Int!) { vaults(${wherePart}order_by: { total_assets: ${order} }, limit: $limit, offset: $offset) { term_id total_assets total_shares current_share_price curve_id position_count } }`;
  try {
    const vaultData = await fetchGraphQL(query, { limit, offset }, 2, 28_000);
    const allVaults = vaultData?.vaults ?? [];
    if (allVaults.length === 0) return { items: [], hasMore: false };

    const aggregated = aggregateVaultData(allVaults);
    const termIds = aggregated.map(v => v.term_id);
    const dataQuery = `query GetAgentsData ($ids: [String!]!) {
        atoms(where: { term_id: { _in: $ids } }) { term_id label data image type creator { id label image } value { person { name } organization { name } thing { name } } }
        triples(where: { term_id: { _in: $ids } }) { term_id counter_term_id creator { id label image } subject { label term_id data image type } predicate { label } object { label term_id data image type } }
    }`;

    const res = await fetchGraphQL(dataQuery, { ids: termIds }, 2, 28_000);
    const atoms = res?.atoms || [];
    const triples = res?.triples || [];

    const items = aggregated.map(v => {
      const a = atoms.find((x: any) => normalize(x.term_id) === normalize(v.term_id));
      const t = triples.find((x: any) => normalize(x.term_id) === normalize(v.term_id));
      const meta = a ? resolveMetadata(a) : { label: v.term_id, description: '', type: 'ATOM', image: undefined, links: [] };
      let label = meta.label, type = (meta.type || "ATOM").toUpperCase(), image = a?.image, links = meta.links;

      if (t) {
          const sMeta = resolveMetadata(t.subject), oMeta = resolveMetadata(t.object);
          label = `${sMeta.label} ${t.predicate?.label || 'LINK'} ${oMeta.label}`;
          type = "CLAIM";
          image = t.subject?.image || t.object?.image;
          links = []; // Claims usually don't have direct external links on the triple itself
      }

      return {
        id: v.term_id,
        counterTermId: t?.counter_term_id,
        label,
        description: meta.description,
        image,
        type,
        links,
        creator: a?.creator || t?.creator,
        totalAssets: v.total_assets.toString(), 
        totalShares: v.total_shares.toString(),
        currentSharePrice: v.current_share_price,
        marketCap: v.computed_mcap.toString(),
        positionCount: v.position_count
      };
    });

    return { items, hasMore: allVaults.length === limit };
  } catch (e) { return { items: [], hasMore: false }; }
};

/** Full Account rows for specific term IDs (e.g. Arena duel pair → compare modal). Order matches input `ids`; null if no vault. */
export async function getAccountsByTermIds(ids: string[]): Promise<(Account | null)[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids.map((x) => normalize(x)).filter(Boolean))];
  if (unique.length === 0) return ids.map(() => null);

  const vaultQ = `query ArenaPairVaults($ids: [String!]!) { vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count } }`;
  try {
    const vaultData = await fetchGraphQL(vaultQ, { ids: unique }, 2, 22_000);
    const allVaults = vaultData?.vaults ?? [];
    if (allVaults.length === 0) return ids.map(() => null);

    const aggregated = aggregateVaultData(allVaults);
    const dataQuery = `query GetAgentsData ($ids: [String!]!) {
        atoms(where: { term_id: { _in: $ids } }) { term_id label data image type creator { id label image } value { person { name } organization { name } thing { name } } }
        triples(where: { term_id: { _in: $ids } }) { term_id counter_term_id creator { id label image } subject { label term_id data image type } predicate { label } object { label term_id data image type } }
    }`;

    const res = await fetchGraphQL(dataQuery, { ids: unique }, 2, 22_000);
    const atoms = res?.atoms || [];
    const triples = res?.triples || [];

    const items: Account[] = aggregated.map((v: any) => {
      const a = atoms.find((x: any) => normalize(x.term_id) === normalize(v.term_id));
      const t = triples.find((x: any) => normalize(x.term_id) === normalize(v.term_id));
      const meta = a ? resolveMetadata(a) : { label: v.term_id, description: '', type: 'ATOM', image: undefined, links: [] };
      let label = meta.label;
      let type = (meta.type || 'ATOM').toUpperCase();
      let image = a?.image;
      let links = meta.links;

      if (t) {
        const sMeta = resolveMetadata(t.subject);
        const oMeta = resolveMetadata(t.object);
        label = `${sMeta.label} ${t.predicate?.label || 'LINK'} ${oMeta.label}`;
        type = 'CLAIM';
        image = t.subject?.image || t.object?.image;
        links = [];
      }

      return {
        id: v.term_id,
        counterTermId: t?.counter_term_id,
        label,
        description: meta.description,
        image,
        type,
        links,
        creator: a?.creator || t?.creator,
        totalAssets: v.total_assets.toString(),
        totalShares: v.total_shares.toString(),
        currentSharePrice: v.current_share_price,
        marketCap: v.computed_mcap.toString(),
        positionCount: v.position_count,
      };
    });

    const byId = new Map(items.map((i) => [normalize(i.id), i]));
    return ids.map((id) => byId.get(normalize(id)) ?? null);
  } catch {
    return ids.map(() => null);
  }
}

/** Fetches ALL newly created atoms/claims: Identity atoms (PERSON, ORG, ACCOUNT), Things, and Claims (TripleCreated). */
export const getNewlyCreatedAtoms = async (limit = 20) => {
  const q = `query GetNewlyCreated($limit: Int!) {
    events(
      where: { type: { _in: ["AtomCreated", "TripleCreated"] } },
      limit: $limit,
      order_by: { created_at: desc }
    ) {
      type
      created_at
      atom { term_id label data image type creator { id label image } value { person { name } organization { name } thing { name } account { id label } } }
      triple { term_id counter_term_id creator { id label image } subject { label term_id data image type } predicate { label } object { label term_id data image type } }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { limit }, 2, 4_000);
    const events = res?.events ?? [];
    const seen = new Set<string>();
    const items: { id: string; termId: string; label: string; type: string; image?: string; creator?: any; createdAt: number }[] = [];

    for (const ev of events) {
      let termId = '';
      let meta: { label: string; type: string; image?: string };
      if (ev.type === 'AtomCreated' && ev.atom?.term_id) {
        termId = ev.atom.term_id;
        meta = resolveMetadata(ev.atom);
      } else if (ev.type === 'TripleCreated' && ev.triple?.term_id) {
        termId = ev.triple.term_id;
        const sMeta = resolveMetadata(ev.triple.subject);
        const oMeta = resolveMetadata(ev.triple.object);
        meta = {
          label: `${sMeta.label} ${ev.triple.predicate?.label || 'LINK'} ${oMeta.label}`,
          type: 'CLAIM',
          image: ev.triple.subject?.image || ev.triple.object?.image
        };
      } else continue;

      const id = normalize(termId);
      if (seen.has(id)) continue;
      seen.add(id);

      const createdAt = ev.created_at ? new Date(ev.created_at).getTime() : Date.now();
      items.push({
        id: termId,
        termId,
        label: meta.label,
        type: meta.type,
        image: meta.image,
        creator: ev.atom?.creator || ev.triple?.creator,
        createdAt
      });
    }

    const termIds = items.map(i => i.termId);
    const ids = Array.from(new Set(termIds)).flatMap(id => prepareQueryIds(id)).slice(0, 200);

    let vaults: any[] = [];
    if (ids.length > 0) {
      const vq = `query GetNewlyCreatedVaults($ids: [String!]!) {
        vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count }
      }`;
      const vRes = await fetchGraphQL(vq, { ids }, 2, 12_000);
      vaults = aggregateVaultData(vRes?.vaults ?? []);
    }

    const vaultByTerm = new Map<string, any>();
    vaults.forEach((v: any) => vaultByTerm.set(normalize(v.term_id), v));

    return items.map(item => {
      const v = vaultByTerm.get(normalize(item.termId));
      const mcap = v?.computed_mcap ?? 0;

      return {
        id: item.id,
        counterTermId: undefined,
        label: item.label,
        description: '',
        image: item.image,
        type: item.type,
        links: [],
        creator: item.creator,
        totalAssets: v?.total_assets?.toString() || '0',
        totalShares: v?.total_shares?.toString() || '0',
        currentSharePrice: v?.current_share_price || '0',
        marketCap: String(mcap),
        positionCount: v?.position_count ?? 0,
        createdAt: item.createdAt
      };
    });
  } catch (e) {
    return [];
  }
};

/** Pure split of Home trending columns — use with `getAllAgents` + `getNewlyCreatedAtoms` fetched in parallel. */
export const buildHomeAtomSectionsFrom = (
  allItems: any[],
  newlyCreatedRaw: any[],
  limitPerSection: number
) => {
  const byMarketcap = [...allItems].sort((a, b) => {
    const ma = parseFloat(a.marketCap || '0');
    const mb = parseFloat(b.marketCap || '0');
    return mb - ma;
  }).slice(0, limitPerSection);
  const roiDaily = [...allItems].sort((a, b) => (b.positionCount || 0) - (a.positionCount || 0)).slice(0, limitPerSection);

  let newlyCreated = newlyCreatedRaw;
  if (newlyCreated.length === 0 && allItems.length > 0) {
    newlyCreated = [...allItems]
      .sort((a, b) => (a.positionCount || 0) - (b.positionCount || 0))
      .slice(0, limitPerSection)
      .map((item) => ({ ...item, createdAt: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000 }));
  }

  return { roiDaily, byMarketcap, newlyCreated };
};

/** For Home: three sections — ROI daily (by activity), by marketcap, newly created (from events, fallback to low-position atoms). */
export const getHomeAtomSections = async (limitPerSection = 12) => {
  const [allItems, newlyCreatedRaw] = await Promise.all([
    getAllAgents(limitPerSection * 4, 0).then(r => r.items),
    getNewlyCreatedAtoms(limitPerSection)
  ]);
  return buildHomeAtomSectionsFrom(allItems, newlyCreatedRaw, limitPerSection);
};

/** Subgraph often attributes atom/triple creator as FeeProxy when creation routes through IntuRank — resolve real wallet from first deposit sender. */
const PROTOCOL_ROUTER_ADDRESSES = new Set(
  [FEE_PROXY_ADDRESS, MULTI_VAULT_ADDRESS].map((a) => a.toLowerCase())
);

async function resolveCreatorIfProxyRouter(
  termId: string,
  creator: { id?: string; label?: string; image?: string } | null | undefined
): Promise<{ id?: string; label?: string; image?: string } | null | undefined> {
  const cid = (creator?.id || '').toLowerCase();
  if (!termId || !cid || !PROTOCOL_ROUTER_ADDRESSES.has(cid)) return creator;

  const ids = prepareQueryIds(termId);
  const q = `query ($ids: [String!]!) {
    events(limit: 40, order_by: {created_at: asc}, where: {
      type: {_eq: "Deposited"},
      deposit: { vault: { term_id: { _in: $ids } } }
    }) {
      deposit { sender { id label image } receiver { id label image } }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { ids });
    for (const ev of res?.events ?? []) {
      const s = resolveProxyActivityAccount(ev?.deposit);
      const sid = (s?.id || '').toLowerCase();
      if (sid && !PROTOCOL_ROUTER_ADDRESSES.has(sid) && isAddress(sid)) {
        try {
          return { id: getAddress(sid), label: s?.label || undefined, image: s?.image || undefined };
        } catch {
          return { id: s!.id, label: s?.label, image: s?.image };
        }
      }
    }
  } catch (e) {
    console.warn('resolveCreatorIfProxyRouter', e);
  }
  // Do not surface router contract as a "person"; UI can fall back to Activity / deposits.
  return {
    id: undefined,
    label: 'Wallet (creation routed via FeeProxy)',
    image: undefined,
  };
}

/** Prefer the EOA that signed the AtomCreated / TripleCreated tx — subgraph creator may be a router or proxy (not the user). */
async function resolveCreatorFromCreationTx(
  termId: string,
  creator: { id?: string; label?: string; image?: string } | null | undefined,
  isTriple: boolean
): Promise<{ id?: string; label?: string; image?: string } | null | undefined> {
  if (!termId) return creator;
  const ids = prepareQueryIds(termId);
  const q = isTriple
    ? `query ($ids: [String!]!) {
        events(limit: 1, order_by: {created_at: asc}, where: {
          type: {_eq: "TripleCreated"},
          triple: { term_id: {_in: $ids} }
        }) { transaction_hash }
      }`
    : `query ($ids: [String!]!) {
        events(limit: 1, order_by: {created_at: asc}, where: {
          type: {_eq: "AtomCreated"},
          atom: { term_id: {_in: $ids} }
        }) { transaction_hash }
      }`;
  try {
    const res = await fetchGraphQL(q, { ids });
    let hash = res?.events?.[0]?.transaction_hash as string | undefined;
    if (!hash || typeof hash !== 'string') return creator;
    if (!hash.startsWith('0x')) hash = `0x${hash}`;
    const tx = await publicClient.getTransaction({ hash: hash as `0x${string}` });
    const from = tx?.from;
    if (!from || !isAddress(from)) return creator;
    let nextId: string;
    try {
      nextId = getAddress(from);
    } catch {
      nextId = from;
    }
    const prevId = (creator?.id || '').toLowerCase();
    const same = prevId === nextId.toLowerCase();
    return {
      id: nextId,
      label: same ? creator?.label : undefined,
      image: same ? creator?.image : undefined,
    };
  } catch (e) {
    console.warn('resolveCreatorFromCreationTx', e);
    return creator;
  }
}

/** Route `id` vs `vault.term_id` from Graph (same logical term, different string padding). */
export function vaultTermMatchesRoute(routeTermId: string, vaultTermId: string | undefined | null): boolean {
  if (!routeTermId || !vaultTermId) return false;
  const routeSet = new Set(prepareQueryIds(routeTermId).map(normalize));
  for (const v of prepareQueryIds(String(vaultTermId))) {
    if (routeSet.has(normalize(v))) return true;
  }
  return false;
}

/** Address variants for Graph account_id / account.id (checksum + lowercase + padded ids from prepareQueryIds). */
function accountVariantsForGraph(account: string): string[] {
  const out = new Set<string>();
  const t = (account || '').trim();
  if (!t) return [];
  out.add(t.toLowerCase());
  try {
    if (isAddress(t)) out.add(getAddress(t));
  } catch {
    /* ignore */
  }
  for (const v of prepareQueryIds(t)) out.add(v);
  return Array.from(out);
}

export type GraphAccountRow = { id: string; label: string | null; image: string | null };

/** Batch-fetch Intuition `accounts` rows for wallet id variants (checksum, lowercase, padded). */
export async function getAccountsByIds(addresses: string[]): Promise<Map<string, GraphAccountRow>> {
  const uniq = new Set<string>();
  for (const a of addresses) {
    for (const v of accountVariantsForGraph(a)) uniq.add(v);
  }
  const ids = Array.from(uniq).slice(0, 100);
  if (!ids.length) return new Map();

  const q = `query GetAccountsByIds($ids: [String!]!) {
    accounts(where: { id: { _in: $ids } }) {
      id
      label
      image
    }
  }`;

  try {
    const res = await fetchGraphQL(q, { ids });
    const rows = res?.accounts || [];
    const map = new Map<string, GraphAccountRow>();
    for (const r of rows) {
      const id = String(r.id);
      map.set(id.toLowerCase(), { id, label: r.label ?? null, image: r.image ?? null });
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Prefer indexer rows whose label ends with `.trust` for this wallet (badges when reverse / addr records are unset). */
export async function getAccountTrustNameLabelForWallet(walletAddress: string): Promise<string | null> {
  const ids = accountVariantsForGraph(walletAddress).slice(0, 24);
  if (!ids.length) return null;
  const q = `query AccountTrustLabel($ids: [String!]!) {
    accounts(where: { id: { _in: $ids }, label: { _ilike: "%.trust" } }, limit: 6) {
      label
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { ids });
    const rows = (res?.accounts || []) as { label?: string | null }[];
    const labels = rows.map((r) => String(r.label ?? '').trim()).filter(Boolean);
    if (!labels.length) return null;
    labels.sort((a, b) => a.length - b.length);
    return labels[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * When `accounts` is slow or the row shape differs, active positions still nest `account.label`
 * — some indexers populate `.trust` there first.
 */
export async function getAccountTrustNameLabelFromPositions(walletAddress: string): Promise<string | null> {
  const addrs = accountVariantsForGraph(walletAddress).slice(0, 24);
  if (!addrs.length) return null;
  const want = new Set(addrs.map((a) => a.toLowerCase()));
  const q = `query AccountTrustViaPositions($addrs: [String!]!) {
    positions(
      where: {
        shares: { _gt: "0" },
        _or: [
          { account_id: { _in: $addrs } },
          { account: { id: { _in: $addrs } } }
        ]
      },
      limit: 120,
      order_by: [{ shares: desc }]
    ) {
      account { id label }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { addrs }, 2, 14_000);
    const rows = (res?.positions || []) as { account?: { id?: string; label?: string | null } | null }[];
    const labels: string[] = [];
    for (const p of rows) {
      const acc = p?.account;
      if (!acc) continue;
      const aid = String(acc.id || '').toLowerCase();
      if (!want.has(aid)) continue;
      const lab = String(acc.label ?? '').trim();
      if (lab.toLowerCase().endsWith('.trust')) labels.push(lab);
    }
    if (!labels.length) return null;
    labels.sort((a, b) => a.length - b.length);
    return labels[0] ?? null;
  } catch {
    return null;
  }
}

/** Account-type `.trust` atoms the wallet created (indexer often links display name here before `accounts` updates). */
export async function getAccountTrustNameFromCreatorAtoms(walletAddress: string): Promise<string | null> {
  const addrs = accountVariantsForGraph(walletAddress).slice(0, 20);
  if (!addrs.length) return null;
  const q = `query TrustAtomsByCreator($addrs: [String!]!) {
    atoms(
      where: {
        _and: [
          { label: { _ilike: "%.trust" } },
          { creator: { id: { _in: $addrs } } }
        ]
      },
      limit: 24
    ) {
      label
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { addrs }, 2, 12_000);
    const rows = (res?.atoms || []) as { label?: string | null }[];
    const labels = rows
      .map((r) => String(r.label ?? '').trim())
      .filter((l) => l.toLowerCase().endsWith('.trust'));
    if (!labels.length) return null;
    labels.sort((a, b) => a.length - b.length);
    return labels[0] ?? null;
  } catch {
    return null;
  }
}

/** Wallet is tied to Intuition when `accounts` returns a row for an id variant; label falls back to short address. */
export function resolveIntuitionAccountForWallet(
  walletAddress: string,
  map: Map<string, GraphAccountRow>
): { label: string; image?: string } | null {
  const w = (walletAddress || '').trim();
  const short = w.length >= 10 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w || '?';
  for (const v of accountVariantsForGraph(walletAddress)) {
    const row = map.get(v.toLowerCase());
    if (row) {
      const lab = row.label && String(row.label).trim();
      return { label: lab || short, image: row.image || undefined };
    }
  }
  return null;
}

/** Subgraph position shares for a wallet + term. Uses safeParseUnits (wei or decimal strings). Prefer when MultiVault getShares disagrees with the indexer. */
export async function getSubgraphPositionSharesForTerm(
  account: string,
  termId: string
): Promise<{ linear: string; exponential: string }> {
  const ids = prepareQueryIds(termId);
  const addrs = accountVariantsForGraph(account);
  if (!ids.length || !addrs.length) return { linear: '0', exponential: '0' };

  const sumRows = (rows: any[] | undefined) => {
    let linear = 0;
    let exponential = 0;
    for (const p of rows ?? []) {
      const cid = Number(p?.vault?.curve_id);
      const sh = safeParseUnits(p?.shares != null ? String(p.shares) : '0');
      if (!Number.isFinite(sh) || sh <= 0) continue;
      if (cid === LINEAR_CURVE_ID) linear += sh;
      else if (cid === OFFSET_PROGRESSIVE_CURVE_ID) exponential += sh;
    }
    return { linear, exponential };
  };

  /** Portal-style: vaults(term) → positions(account_id) — matches Intuition GetAccountProfile / term.vaults.userPosition. */
  const sumVaultNested = (vaults: any[] | undefined) => {
    let linear = 0;
    let exponential = 0;
    for (const v of vaults ?? []) {
      const cid = Number(v?.curve_id);
      for (const p of v?.positions ?? []) {
        const sh = safeParseUnits(p?.shares != null ? String(p.shares) : '0');
        if (!Number.isFinite(sh) || sh <= 0) continue;
        if (cid === LINEAR_CURVE_ID) linear += sh;
        else if (cid === OFFSET_PROGRESSIVE_CURVE_ID) exponential += sh;
      }
    }
    return { linear, exponential };
  };

  const formatPair = (linear: number, exponential: number) => {
    const fmt = (n: number) => {
      if (n <= 0) return '0';
      return n.toFixed(n < 0.01 ? 6 : 4);
    };
    return { linear: fmt(linear), exponential: fmt(exponential) };
  };

  const qPositions = `query ($ids: [String!]!, $addrs: [String!]!) {
    positions(where: {
      _and: [
        { vault: { term_id: { _in: $ids } } },
        { _or: [
          { account_id: { _in: $addrs } },
          { account: { id: { _in: $addrs } } }
        ]}
      ]
    }) {
      shares
      vault { curve_id term_id }
    }
  }`;

  const qPwv = `query ($ids: [String!]!, $addrs: [String!]!) {
    positions_with_value(where: {
      _and: [
        { vault: { term_id: { _in: $ids } } },
        { _or: [
          { account_id: { _in: $addrs } },
          { account: { id: { _in: $addrs } } }
        ]}
      ]
    }) {
      shares
      vault { curve_id term_id }
    }
  }`;

  const qVaultsWithPositions = `query ($ids: [String!]!, $addrs: [String!]!) {
    vaults(
      where: { term_id: { _in: $ids } },
      order_by: { curve_id: asc }
    ) {
      curve_id
      term_id
      positions(where: {
        _or: [
          { account_id: { _in: $addrs } },
          { account: { id: { _in: $addrs } } }
        ]
      }) {
        shares
        account_id
      }
    }
  }`;

  const qBroad = `query ($addrs: [String!]!) {
    positions(
      where: {
        _or: [
          { account_id: { _in: $addrs } },
          { account: { id: { _in: $addrs } } }
        ]
      },
      limit: 5000,
      order_by: { shares: desc }
    ) {
      shares
      vault { curve_id term_id }
    }
  }`;

  try {
    const [resPos, resPwv, resVault] = await Promise.all([
      fetchGraphQL(qPositions, { ids, addrs }).catch(() => ({})),
      fetchGraphQL(qPwv, { ids, addrs }).catch(() => ({})),
      fetchGraphQL(qVaultsWithPositions, { ids, addrs }).catch(() => ({})),
    ]);
    const fromPos = sumRows(resPos?.positions);
    const fromPwv = sumRows(resPwv?.positions_with_value);
    const fromVault = sumVaultNested(resVault?.vaults);
    let preL = Math.max(fromPos.linear, fromPwv.linear, fromVault.linear);
    let preE = Math.max(fromPos.exponential, fromPwv.exponential, fromVault.exponential);

    // Term-scoped GraphQL filters can miss rows when term_id string form ≠ route id; Portfolio loads by account then filters — mirror that.
    if (preL < 1e-18 && preE < 1e-18) {
      const resBroad = await fetchGraphQL(qBroad, { addrs }).catch(() => ({}));
      const filtered = (resBroad?.positions ?? []).filter((p: any) => vaultTermMatchesRoute(termId, p?.vault?.term_id));
      const fromBroad = sumRows(filtered);
      preL = Math.max(preL, fromBroad.linear);
      preE = Math.max(preE, fromBroad.exponential);
    }

    return formatPair(preL, preE);
  } catch {
    return { linear: '0', exponential: '0' };
  }
}

/** Prefer the larger of RPC MultiVault balance vs subgraph-indexed position (display / UX when they disagree). */
export function pickEffectiveShareBalance(rpcStr: string, gqlStr: string): string {
  const r = parseFloat(rpcStr) || 0;
  const g = parseFloat(gqlStr) || 0;
  const m = Math.max(r, g);
  if (m <= 0) return '0.00';
  return m.toFixed(m < 0.01 ? 6 : 4);
}

export const getAgentById = async (termId: string) => {
  const ids = prepareQueryIds(termId);
  const q = `query ($ids: [String!]!) { 
      atoms(where: { term_id: { _in: $ids } }) { term_id label data image type creator { id label image } value { person { name } thing { name } } }
      vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count }
      triples(where: { term_id: { _in: $ids } }) { term_id counter_term_id creator { id label image } subject { label term_id data image type } predicate { label } object { label term_id data image type } }
  }`;
  try {
    const res = await fetchGraphQL(q, { ids });
    const aggregated = aggregateVaultData(res?.vaults || []);
    const v = aggregated[0], a = res?.atoms?.[0], t = res?.triples?.[0];
    if (!v && !a && !t) return { id: termId, label: 'Unknown', description: '', totalAssets: "0", totalShares: "0", type: 'ATOM', links: [] };

    const meta = a ? resolveMetadata(a) : { label: termId, description: '', type: 'ATOM', image: undefined, links: [] };
    let label = meta.label, type = (meta.type || "ATOM").toUpperCase(), links = meta.links;
    if (t) {
        label = `${resolveMetadata(t.subject).label} ${t.predicate?.label} ${resolveMetadata(t.object).label}`;
        type = "CLAIM";
        links = [];
    }

    let rawCreator = a?.creator || t?.creator;
    rawCreator = await resolveCreatorIfProxyRouter(termId, rawCreator);
    rawCreator = await resolveCreatorFromCreationTx(termId, rawCreator, !!t);

    return {
      id: termId, 
      counterTermId: t?.counter_term_id,
      label, description: meta.description, image: a?.image, type, links, creator: rawCreator,
      totalAssets: v?.total_assets.toString() || "0",
      totalShares: v?.total_shares.toString() || "0",
      currentSharePrice: v?.current_share_price || "0",
      marketCap: v?.computed_mcap.toString() || "0",
      positionCount: v?.position_count || 0
    };
  } catch (e) { return { id: termId, label: 'Offline', totalAssets: "0", totalShares: "0", type: 'ATOM', links: [] }; }
};

/** Per-curve vault data for a term (Linear = 1, Offset Progressive / Exponential = 2). Used for curve switching in market detail. */
export interface VaultByCurve {
  term_id: string;
  total_assets: string;
  total_shares: string;
  current_share_price: string;
  curve_id: number;
  position_count: number;
}

export const getVaultsForTerm = async (termId: string): Promise<VaultByCurve[]> => {
  const ids = prepareQueryIds(termId);
  const q = `query ($ids: [String!]!) { vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count } }`;
  try {
    const res = await fetchGraphQL(q, { ids });
    const vaults = res?.vaults ?? [];
    return vaults.map((v: any) => ({
      term_id: v.term_id,
      total_assets: v.total_assets ?? '0',
      total_shares: v.total_shares ?? '0',
      current_share_price: v.current_share_price ?? '0',
      curve_id: v.curve_id != null ? (typeof v.curve_id === 'string' ? parseInt(v.curve_id, 10) : v.curve_id) : 1,
      position_count: Number(v.position_count ?? 0),
    }));
  } catch (e) {
    return [];
  }
};

export const getUserHistory = async (userAddress: string): Promise<Transaction[]> => {
  const ids = prepareQueryIds(userAddress);
  if (!ids.length) return [];
  const q = `query ($ids: [String!]!) {
      events(limit: 500, order_by: {created_at: desc}, where: {
          _and: [{type: {_neq: "FeesTransfered"}}, {_not: {_and: [{type: {_eq: "Deposited"}}, {deposit: {assets_after_fees: {_eq: 0}}}]}}, 
          {_or: [{_and: [{type: {_eq: "AtomCreated"}}, {atom: {creator: {id: {_in: $ids}}}}]}, 
          {_and: [{type: {_eq: "TripleCreated"}}, {triple: {creator: {id: {_in: $ids}}}}]}, 
          {_and: [{type: {_eq: "Deposited"}}, {deposit: {_or: [{sender_id: {_in: $ids}}, {receiver_id: {_in: $ids}}]}}]}, 
          {_and: [{type: {_eq: "Redeemed"}}, {redemption: {_or: [{sender_id: {_in: $ids}}, {receiver_id: {_in: $ids}}]}}]}]}]
      }) {
        id created_at type transaction_hash atom { term_id label data type }
        triple { term_id subject { label term_id data } predicate { label term_id } object { label term_id data } creator { id label image } }
        deposit { shares assets_after_fees vault { term_id curve_id } } redemption { assets shares vault { term_id curve_id } }
      }
  }`;
  try {
    const data = await fetchGraphQL(q, { ids });
    const events = data?.events ?? [];
    return events.map((ev: any) => {
        let label = 'Unknown Node', vaultId = '0x', shares = '0', assets = '0', type: 'DEPOSIT' | 'REDEEM' = 'DEPOSIT', curveId: number | undefined;
        if (ev.type === 'AtomCreated' && ev.atom) { label = resolveMetadata(ev.atom).label; vaultId = ev.atom.term_id; }
        else if (ev.type === 'TripleCreated' && ev.triple) { label = `${resolveMetadata(ev.triple.subject).label} ${ev.triple.predicate?.label || 'LINK'} ${resolveMetadata(ev.triple.object).label}`; vaultId = ev.triple.term_id; }
        else if (ev.type === 'Deposited' && ev.deposit) { assets = ev.deposit.assets_after_fees || '0'; shares = ev.deposit.shares || '0'; const v = ev.deposit.vault; const rawCurve = v?.curve_id ?? (ev.deposit as any).curve_id; if (rawCurve != null) curveId = typeof rawCurve === 'string' ? parseInt(rawCurve, 10) : rawCurve; if (v?.term_id) vaultId = v.term_id;
            if (ev.atom) { label = resolveMetadata(ev.atom).label; if (!vaultId || vaultId === '0x') vaultId = ev.atom.term_id; } 
            else if (ev.triple) { label = `${resolveMetadata(ev.triple.subject).label} ${resolveMetadata(ev.triple.predicate).label} ${resolveMetadata(ev.triple.object).label}`; if (!vaultId || vaultId === '0x') vaultId = ev.triple.term_id; }
        } else if (ev.type === 'Redeemed' && ev.redemption) { assets = ev.redemption.assets || '0'; shares = ev.redemption.shares || '0'; type = 'REDEEM'; const v = ev.redemption.vault; const rawCurve = v?.curve_id ?? (ev.redemption as any).curve_id; if (rawCurve != null) curveId = typeof rawCurve === 'string' ? parseInt(rawCurve, 10) : rawCurve; if (v?.term_id) vaultId = v.term_id;
            if (ev.atom) { label = resolveMetadata(ev.atom).label; if (!vaultId || vaultId === '0x') vaultId = ev.atom.term_id; }
            else if (ev.triple) { label = `${resolveMetadata(ev.triple.subject).label} ${resolveMetadata(ev.triple.predicate).label} ${resolveMetadata(ev.triple.object).label}`; if (!vaultId || vaultId === '0x') vaultId = ev.triple.term_id; }
        }
        return { id: ev.transaction_hash || ev.id, type, shares, assets, timestamp: ev.created_at ? new Date(ev.created_at).getTime() : Date.now(), vaultId, curveId, assetLabel: label };
    });
  } catch (e) { return []; }
};

export const getGlobalActivity = async (limit: number = 40, offset: number = 0) => {
  const q = `query GetGlobalActivity($limit: Int!, $offset: Int!) {
    events(limit: $limit, offset: $offset, order_by: {created_at: desc}, where: {
      _and: [
        {type: {_in: ["Deposited", "Redeemed", "AtomCreated", "TripleCreated"]}},
        {_not: {deposit: {assets_after_fees: {_eq: "0"}}}}
      ]
    }) {
      id created_at type transaction_hash 
      atom { term_id label data image type creator { id label image } }
      triple { term_id counter_term_id subject { label term_id data image type } predicate { label } object { label term_id data image type } creator { id label image } }
      deposit { assets_after_fees shares sender { id label image } receiver { id label image } vault { curve_id } } 
      redemption { assets shares sender { id label image } receiver { id label image } vault { curve_id } }
    }
  }`;
  try {
    const data = await fetchGraphQL(q, { limit, offset });
    const events = data?.events ?? [];
    return {
        items: events.map((ev: any) => {
            let label = 'Unknown Node', vaultId = '0x', shares = '0', assets = '0', curveId = '0', sender = null, target = null;
            
            if (ev.type === 'AtomCreated' && ev.atom) { 
                const meta = resolveMetadata(ev.atom);
                label = meta.label; 
                vaultId = ev.atom.term_id; 
                sender = ev.atom.creator;
                target = { ...meta, id: ev.atom.term_id };
            }
            else if (ev.type === 'TripleCreated' && ev.triple) { 
                const sMeta = resolveMetadata(ev.triple.subject);
                const oMeta = resolveMetadata(ev.triple.object);
                label = `${sMeta.label} ${ev.triple.predicate?.label || 'LINK'} ${oMeta.label}`; 
                vaultId = ev.triple.term_id; 
                sender = ev.triple.creator;
                target = { label, id: ev.triple.term_id, type: 'CLAIM', subject: sMeta, predicate: ev.triple.predicate?.label, object: oMeta };
            }
            else if (ev.type === 'Deposited' && ev.deposit) { 
                assets = ev.deposit.assets_after_fees || '0'; 
                shares = ev.deposit.shares || '0'; 
                curveId = ev.deposit.vault?.curve_id;
                sender = resolveProxyActivityAccount(ev.deposit);
                if (ev.atom) { 
                    const meta = resolveMetadata(ev.atom);
                    label = meta.label; vaultId = ev.atom.term_id; 
                    target = { ...meta, id: ev.atom.term_id };
                } 
                else if (ev.triple) { 
                    const sMeta = resolveMetadata(ev.triple.subject);
                    const oMeta = resolveMetadata(ev.triple.object);
                    label = `${sMeta.label} ${ev.triple.predicate?.label || 'LINK'} ${oMeta.label}`; vaultId = ev.triple.term_id; 
                    target = { label, id: ev.triple.term_id, type: 'CLAIM', subject: sMeta, predicate: ev.triple.predicate?.label, object: oMeta };
                }
            } else if (ev.type === 'Redeemed' && ev.redemption) { 
                assets = ev.redemption.assets || '0'; 
                shares = ev.redemption.shares || '0'; 
                curveId = ev.redemption.vault?.curve_id;
                sender = resolveProxyActivityAccount(ev.redemption);
                if (ev.atom) { 
                    const meta = resolveMetadata(ev.atom);
                    label = meta.label; vaultId = ev.atom.term_id; 
                    target = { ...meta, id: ev.atom.term_id };
                }
                else if (ev.triple) { 
                    const sMeta = resolveMetadata(ev.triple.subject);
                    const oMeta = resolveMetadata(ev.triple.object);
                    label = `${sMeta.label} ${ev.triple.predicate?.label || 'LINK'} ${oMeta.label}`; vaultId = ev.triple.term_id; 
                    target = { label, id: ev.triple.term_id, type: 'CLAIM', subject: sMeta, predicate: ev.triple.predicate?.label, object: oMeta };
                }
            }

            return {
                id: ev.transaction_hash || ev.id,
                type: ev.type,
                timestamp: new Date(ev.created_at).getTime(),
                sender,
                target,
                assets,
                shares,
                curveId,
                vaultId
            };
        }),
        hasMore: events.length === limit
    };
  } catch (e) { return { items: [], hasMore: false }; }
};

/**
 * Global activity where deposits/redemptions were initiated through the IntuRank
 * routing layer (FeeProxy / MultiVault as `sender` in the subgraph). Same row
 * shape as {@link getGlobalActivity} so `ActivityRow` keeps working.
 */
export const getIntuRankNetworkActivity = async (limit: number = 40, offset: number = 0) => {
  const proxyIds = feeProxyRoutedSenderGraphIds();
  const q = `query GetIntuRankActivity($limit: Int!, $offset: Int!, $proxyIds: [String!]!) {
    events(limit: $limit, offset: $offset, order_by: {created_at: desc}, where: {
      _and: [
        { type: { _in: ["Deposited", "Redeemed"] } },
        { _not: { deposit: { assets_after_fees: { _eq: "0" } } } },
        { _or: [
          { deposit: { sender_id: { _in: $proxyIds } } },
          { redemption: { sender_id: { _in: $proxyIds } } }
        ] }
      ]
    }) {
      id created_at type transaction_hash
      atom { term_id label data image type creator { id label image } }
      triple { term_id counter_term_id subject { label term_id data image type } predicate { label } object { label term_id data image type } creator { id label image } }
      deposit { assets_after_fees shares sender { id label image } receiver { id label image } vault { curve_id } }
      redemption { assets shares sender { id label image } receiver { id label image } vault { curve_id } }
    }
  }`;
  try {
    const data = await fetchGraphQL(q, { limit, offset, proxyIds });
    const events = data?.events ?? [];
    return {
      items: events.map((ev: any) => {
        let label = 'Unknown Node',
          vaultId = '0x',
          shares = '0',
          assets = '0',
          curveId = '0',
          sender = null,
          target = null;

        if (ev.type === 'Deposited' && ev.deposit) {
          assets = ev.deposit.assets_after_fees || '0';
          shares = ev.deposit.shares || '0';
          curveId = ev.deposit.vault?.curve_id;
          sender = resolveProxyActivityAccount(ev.deposit);
          if (ev.atom) {
            const meta = resolveMetadata(ev.atom);
            label = meta.label;
            vaultId = ev.atom.term_id;
            target = { ...meta, id: ev.atom.term_id };
          } else if (ev.triple) {
            const sMeta = resolveMetadata(ev.triple.subject);
            const oMeta = resolveMetadata(ev.triple.object);
            label = `${sMeta.label} ${ev.triple.predicate?.label || 'LINK'} ${oMeta.label}`;
            vaultId = ev.triple.term_id;
            target = {
              label,
              id: ev.triple.term_id,
              type: 'CLAIM',
              subject: sMeta,
              predicate: ev.triple.predicate?.label,
              object: oMeta,
            };
          }
        } else if (ev.type === 'Redeemed' && ev.redemption) {
          assets = ev.redemption.assets || '0';
          shares = ev.redemption.shares || '0';
          curveId = ev.redemption.vault?.curve_id;
          sender = resolveProxyActivityAccount(ev.redemption);
          if (ev.atom) {
            const meta = resolveMetadata(ev.atom);
            label = meta.label;
            vaultId = ev.atom.term_id;
            target = { ...meta, id: ev.atom.term_id };
          } else if (ev.triple) {
            const sMeta = resolveMetadata(ev.triple.subject);
            const oMeta = resolveMetadata(ev.triple.object);
            label = `${sMeta.label} ${ev.triple.predicate?.label || 'LINK'} ${oMeta.label}`;
            vaultId = ev.triple.term_id;
            target = {
              label,
              id: ev.triple.term_id,
              type: 'CLAIM',
              subject: sMeta,
              predicate: ev.triple.predicate?.label,
              object: oMeta,
            };
          }
        }

        return {
          id: ev.transaction_hash || ev.id,
          type: ev.type,
          timestamp: new Date(ev.created_at).getTime(),
          sender,
          target,
          assets,
          shares,
          curveId,
          vaultId,
        };
      }),
      hasMore: events.length === limit,
    };
  } catch (e) {
    return { items: [], hasMore: false };
  }
};

/** Wallet history: only deposits/redemptions routed through FeeProxy/MultiVault with the wallet as receiver. */
export const getUserIntuRankRoutedHistory = async (userAddress: string): Promise<Transaction[]> => {
  const userIds = prepareQueryIds(userAddress);
  if (!userIds.length) return [];
  const proxyIds = feeProxyRoutedSenderGraphIds();
  const q = `query ($userIds: [String!]!, $proxyIds: [String!]!) {
    events(limit: 500, order_by: {created_at: desc}, where: {
      _and: [
        { type: { _in: ["Deposited", "Redeemed"] } },
        { _not: { deposit: { assets_after_fees: { _eq: "0" } } } },
        { _or: [
          { _and: [
            { type: { _eq: "Deposited" } },
            { deposit: { _and: [{ sender_id: { _in: $proxyIds } }, { receiver_id: { _in: $userIds } }] } }
          ] },
          { _and: [
            { type: { _eq: "Redeemed" } },
            { redemption: { _and: [{ sender_id: { _in: $proxyIds } }, { receiver_id: { _in: $userIds } }] } }
          ] }
        ] }
      ]
    }) {
      id created_at type transaction_hash
      atom { term_id label data type }
      triple { term_id subject { label term_id data } predicate { label term_id } object { label term_id data } }
      deposit { shares assets_after_fees vault { term_id curve_id } }
      redemption { assets shares vault { term_id curve_id } }
    }
  }`;
  try {
    const data = await fetchGraphQL(q, { userIds, proxyIds });
    const events = data?.events ?? [];
    return events.map((ev: any) => {
      let label = 'Unknown Node',
        vaultId = '0x',
        shares = '0',
        assets = '0',
        type: 'DEPOSIT' | 'REDEEM' = 'DEPOSIT',
        curveId: number | undefined;
      if (ev.type === 'Deposited' && ev.deposit) {
        assets = ev.deposit.assets_after_fees || '0';
        shares = ev.deposit.shares || '0';
        const v = ev.deposit.vault;
        const rawCurve = v?.curve_id ?? (ev.deposit as any).curve_id;
        if (rawCurve != null) curveId = typeof rawCurve === 'string' ? parseInt(rawCurve, 10) : rawCurve;
        if (v?.term_id) vaultId = v.term_id;
        if (ev.atom) {
          label = resolveMetadata(ev.atom).label;
          if (!vaultId || vaultId === '0x') vaultId = ev.atom.term_id;
        } else if (ev.triple) {
          label = `${resolveMetadata(ev.triple.subject).label} ${ev.triple.predicate?.label || 'LINK'} ${resolveMetadata(ev.triple.object).label}`;
          if (!vaultId || vaultId === '0x') vaultId = ev.triple.term_id;
        }
      } else if (ev.type === 'Redeemed' && ev.redemption) {
        assets = ev.redemption.assets || '0';
        shares = ev.redemption.shares || '0';
        type = 'REDEEM';
        const v = ev.redemption.vault;
        const rawCurve = v?.curve_id ?? (ev.redemption as any).curve_id;
        if (rawCurve != null) curveId = typeof rawCurve === 'string' ? parseInt(rawCurve, 10) : rawCurve;
        if (v?.term_id) vaultId = v.term_id;
        if (ev.atom) {
          label = resolveMetadata(ev.atom).label;
          if (!vaultId || vaultId === '0x') vaultId = ev.atom.term_id;
        } else if (ev.triple) {
          label = `${resolveMetadata(ev.triple.subject).label} ${ev.triple.predicate?.label || 'LINK'} ${resolveMetadata(ev.triple.object).label}`;
          if (!vaultId || vaultId === '0x') vaultId = ev.triple.term_id;
        }
      }
      return {
        id: ev.transaction_hash || ev.id,
        type,
        shares,
        assets,
        timestamp: ev.created_at ? new Date(ev.created_at).getTime() : Date.now(),
        vaultId,
        curveId,
        assetLabel: label,
      };
    });
  } catch {
    return [];
  }
};

/** Fetches all user positions (linear and exponential curves). No curve_id filter — both curve 1 and 2 are included. */
export const getUserPositions = async (address: string) => {
  const addrs = accountVariantsForGraph(address);
  const q = `query ($addrs: [String!]!) {
      positions(where: {
        _and: [
          { shares: { _gt: "0" } },
          { _or: [
            { account_id: { _in: $addrs } },
            { account: { id: { _in: $addrs } } }
          ]}
        ]
      }, limit: 5000, order_by: { shares: desc }) {
        id shares account_id account { id label image }
        vault { term_id curve_id total_assets total_shares current_share_price term { atom { term_id label data image type creator { id label image } } triple { term_id subject { label term_id data type image } predicate { label } object { label term_id data type image } counter_term_id creator { id label image } } } }
      }
  }`;
  try {
    const data = await fetchGraphQL(q, { addrs });
    return data?.positions ?? [];
  } catch (e) { return []; }
};

/** Fetches user positions with theoretical_value, sorted by value desc server-side. Returns [] if schema does not support positions_with_value. */
export const getPortfolioPositionsWithValue = async (address: string): Promise<any[]> => {
  const addr = address.toLowerCase();
  const addrVariants = [addr];
  try {
    const checksummed = (await import('viem')).getAddress(address);
    if (checksummed !== addr) addrVariants.push(checksummed);
  } catch { /* ignore */ }
  const q = `query GetPortfolioPositionsWithValue($where: positions_with_value_bool_exp!, $orderBy: [positions_with_value_order_by!], $limit: Int!) {
    positions_with_value(where: $where, order_by: $orderBy, limit: $limit) {
      id shares theoretical_value pnl pnl_pct
      account_id
      vault { term_id curve_id total_assets total_shares current_share_price term { atom { term_id label data image type } triple { term_id subject { label term_id data image type } predicate { label } object { label term_id data image type } counter_term_id } } }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, {
      where: { shares: { _gt: '0' }, account_id: { _in: addrVariants } },
      orderBy: [{ theoretical_value: 'desc' }],
      limit: 5000,
    });
    const rows = res?.positions_with_value ?? [];
    if (rows.length > 0) return rows;
    // Fallback: try account relation if account_id returned nothing
    const qAlt = `query GetPortfolioPositionsWithValueAlt($ids: [String!]!, $orderBy: [positions_with_value_order_by!], $limit: Int!) {
      positions_with_value(where: { shares: { _gt: "0" }, account: { id: { _in: $ids } } }, order_by: $orderBy, limit: $limit) {
        id shares theoretical_value pnl pnl_pct
        account_id
        vault { term_id curve_id total_assets total_shares current_share_price term { atom { term_id label data image type } triple { term_id subject { label term_id data image type } predicate { label } object { label term_id data image type } counter_term_id } } }
      }
    }`;
    const resAlt = await fetchGraphQL(qAlt, { ids: addrVariants, orderBy: [{ theoretical_value: 'desc' }], limit: 5000 });
    return resAlt?.positions_with_value ?? [];
  } catch (e) {
    return [];
  }
};

/** User's total transaction count from the Intuition graph (same semantics as getUserHistory: Deposited, Redeemed, AtomCreated, TripleCreated). */
export const getUserIdTransactionCount = async (userAddress: string): Promise<number> => {
  const addr = userAddress.toLowerCase();
  const q = `query GetUserIdTransactionCount($userAddress: String!) {
    events_aggregate(
      where: {
        _and: [
          { type: { _neq: "FeesTransfered" } },
          { _not: { _and: [{ type: { _eq: "Deposited" } }, { deposit: { assets_after_fees: { _eq: 0 } } }] } },
          { _or: [
            { _and: [{ type: { _eq: "AtomCreated" } }, { atom: { creator: { id: { _eq: $userAddress } } } }] },
            { _and: [{ type: { _eq: "TripleCreated" } }, { triple: { creator: { id: { _eq: $userAddress } } } }] },
            { _and: [{ type: { _eq: "Deposited" } }, { deposit: { sender: { id: { _eq: $userAddress } } } }] },
            { _and: [{ type: { _eq: "Redeemed" } }, { redemption: { sender: { id: { _eq: $userAddress } } } }] }
          ]}
        ]
      }
    ) { aggregate { count } }
  }`;
  try {
    const data = await fetchGraphQL(q, { userAddress: addr });
    const count = data?.events_aggregate?.aggregate?.count;
    return typeof count === 'number' ? count : 0;
  } catch (e) {
    return 0;
  }
};

export const getUserActivityStats = async (address: string) => {
  const addr = address.toLowerCase();
  // NOTE: Some Hasura deployments apply row caps to *_aggregate,
  // so we fetch explicit lists with a high limit and count client-side
  const q = `query GetUserActivityStats($addr: String!) {
      events(
        where: {
          _and: [
            { type: { _in: ["Deposited", "Redeemed", "AtomCreated", "TripleCreated"] } },
            { _or: [
                { deposit: { sender: { id: { _eq: $addr } } } },
                { redemption: { sender: { id: { _eq: $addr } } } },
                { atom: { creator: { id: { _eq: $addr } } } },
                { triple: { creator: { id: { _eq: $addr } } } }
            ] }
          ]
        },
        limit: 10000
      ) {
        id
      }
      positions(where: { account: { id: { _eq: $addr } }, shares: { _gt: "0" } }, limit: 10000) {
        id
      }
  }`;

  try {
    const data = await fetchGraphQL(q, { addr });
    const txCount = (data?.events || []).length;
    const holdingsCount = (data?.positions || []).length;
    return { txCount, holdingsCount };
  } catch (e) {
    return { txCount: 0, holdingsCount: 0 };
  }
};

/** Identities and claims created by the user (My Created section). Uses events (AtomCreated/TripleCreated) which reliably filter by creator. */
export const getMyCreated = async (address: string): Promise<{ identities: any[]; claims: any[] }> => {
  const addr = address.toLowerCase();
  const addrVariants = [addr];
  try {
    const checksummed = (await import('viem')).getAddress(address);
    if (checksummed !== addr) addrVariants.push(checksummed);
  } catch { /* use lowercase only if invalid */ }
  const q = `query GetMyCreatedEvents($addrVariants: [String!]!) {
    events(
      where: {
        _or: [
          { _and: [{ type: { _eq: "AtomCreated" } }, { atom: { creator: { id: { _in: $addrVariants } } } }] },
          { _and: [{ type: { _eq: "TripleCreated" } }, { triple: { creator: { id: { _in: $addrVariants } } } }] }
        ]
      },
      limit: 200,
      order_by: { created_at: desc }
    ) {
      type
      atom { term_id label data image type }
      triple { term_id counter_term_id subject { label term_id data image type } predicate { label } object { label term_id data image type } }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { addrVariants });
    const events = res?.events ?? [];

    const identities: any[] = [];
    const claims: any[] = [];
    const seenAtomIds = new Set<string>();
    const seenTripleIds = new Set<string>();

    for (const ev of events) {
      if (ev.type === 'AtomCreated' && ev.atom?.term_id) {
        const id = normalize(ev.atom.term_id);
        if (!seenAtomIds.has(id)) {
          seenAtomIds.add(id);
          identities.push(ev.atom);
        }
      } else if (ev.type === 'TripleCreated' && ev.triple?.term_id) {
        const id = normalize(ev.triple.term_id);
        if (!seenTripleIds.has(id)) {
          seenTripleIds.add(id);
          claims.push(ev.triple);
        }
      }
    }

    const allTermIds = [...identities.map((a: any) => a.term_id), ...claims.map((t: any) => t.term_id)].filter(Boolean);
    const ids = Array.from(new Set(allTermIds)).flatMap((id: string) => prepareQueryIds(id)).slice(0, 300);

    let vaults: any[] = [];
    if (ids.length > 0) {
      const vq = `query GetMyCreatedVaults($ids: [String!]!) {
        vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count }
      }`;
      const vRes = await fetchGraphQL(vq, { ids });
      vaults = aggregateVaultData(vRes?.vaults ?? []);
    }

    const vaultByTerm = new Map<string, any>();
    vaults.forEach((v: any) => vaultByTerm.set(normalize(v.term_id), v));

    const identityItems = identities.map((a: any) => {
      const meta = resolveMetadata(a);
      const v = vaultByTerm.get(normalize(a.term_id));
      const mcap = v ? (v.computed_mcap ?? parseFloat(formatEther(BigInt(v.total_assets || '0')))) : 0;
      return {
        id: a.term_id,
        label: meta.label,
        type: (a.type || 'ATOM').toUpperCase(),
        image: a.image || meta.image,
        marketCap: mcap,
        positionCount: v?.position_count ?? 0,
      };
    }).sort((a: any, b: any) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

    const claimItems = claims.map((t: any) => {
      const sMeta = resolveMetadata(t.subject);
      const oMeta = resolveMetadata(t.object);
      const label = `${sMeta.label} ${t.predicate?.label || 'LINK'} ${oMeta.label}`;
      const v = vaultByTerm.get(normalize(t.term_id));
      const mcap = v ? (v.computed_mcap ?? parseFloat(formatEther(BigInt(v.total_assets || '0')))) : 0;
      return {
        id: t.term_id,
        counterTermId: t.counter_term_id,
        label,
        type: 'CLAIM',
        image: t.subject?.image || t.object?.image,
        marketCap: mcap,
        positionCount: v?.position_count ?? 0,
      };
    }).sort((a: any, b: any) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

    return { identities: identityItems, claims: claimItems };
  } catch (e) {
    return { identities: [], claims: [] };
  }
};

export const getAccountPnlCurrent = async (address: string) => {
  const q = `query GetAccountPnlCurrent($input: GetAccountPnlCurrentInput!) {
    getAccountPnlCurrent(input: $input) {
      account_id
      timestamp
      equity_value
      total_assets_in
      total_assets_out
      net_invested
      total_pnl
      pnl_pct
      unrealized_pnl
    }
  }`;

  try {
    const res = await fetchGraphQL(q, { input: { account_id: address } }, 2, 18_000);
    return res?.getAccountPnlCurrent ?? null;
  } catch (e) {
    return null;
  }
};

/** PnL leaderboard with pagination. p_offset: start index (0, 10, 20...), p_limit: page size */
export const getPnlLeaderboard = async (p_offset: number = 0, p_limit: number = 50) => {
  const q = `query Get_pnl_leaderboard($args: get_pnl_leaderboard_args) {
    get_pnl_leaderboard(args: $args) {
      rank
      account_id
      account_label
      total_pnl_raw
      pnl_pct
      win_rate
      total_volume_raw
    }
  }`;

  try {
    const res = await fetchGraphQL(q, { args: { p_offset, p_limit } }, 2, 36_000);
    return res?.get_pnl_leaderboard ?? [];
  } catch (e) {
    return [];
  }
};

/** Normalize epoch boundaries to full ISO-8601 UTC (`…T…Z` → `…T….000Z`) so they match GraphQL playground payloads. */
export const normalizeGraphqlIsoDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString();
};

/** Build args for get_pnl_leaderboard_period. Schema requires p_start_date and p_end_date (ISO strings). */
export const buildPnlLeaderboardPeriodArgs = (
  startDate: string,
  endDate: string,
  options?: { limit?: number; offset?: number; sortBy?: string; sortOrder?: string }
) => {
  const args: Record<string, unknown> = { p_start_date: startDate, p_end_date: endDate };
  if (options?.limit != null) args.p_limit = options.limit;
  if (options?.offset != null) args.p_offset = options.offset;
  if (options?.sortBy != null) args.p_sort_by = options.sortBy;
  if (options?.sortOrder != null) args.p_sort_order = options.sortOrder;
  return args;
};

/** Build args for get_pnl_leaderboard_period_min_threshold (same optional paging/sort keys as period). */
export const buildPnlLeaderboardPeriodMinThresholdArgs = (
  startDate: string,
  endDate: string,
  options?: {
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: string;
    excludeProtocolAccounts?: boolean;
    minDeposit?: number;
    minPositions?: number;
    minVolume?: number;
    termId?: string;
  }
) => {
  const args: Record<string, unknown> = { p_start_date: startDate, p_end_date: endDate };
  if (options?.limit != null) args.p_limit = options.limit;
  if (options?.offset != null) args.p_offset = options.offset;
  if (options?.sortBy != null) args.p_sort_by = options.sortBy;
  if (options?.sortOrder != null) args.p_sort_order = options.sortOrder;
  if (options?.excludeProtocolAccounts != null) args.p_exclude_protocol_accounts = options.excludeProtocolAccounts;
  if (options?.minDeposit != null) args.p_min_deposit = options.minDeposit;
  if (options?.minPositions != null) args.p_min_positions = options.minPositions;
  if (options?.minVolume != null) args.p_min_volume = options.minVolume;
  if (options?.termId != null) args.p_term_id = options.termId;
  return args;
};

/** Season 2 / epoch-based PnL leaderboard. Uses get_pnl_leaderboard_period for epoch date range (e.g. Epoch 8 = Feb 24 - Mar 10). */
export const getPnlLeaderboardPeriod = async (args: Record<string, unknown> = {}, limit?: number) => {
  const q = `query GetPnlLeaderboardPeriod($args: get_pnl_leaderboard_period_args!) {
    get_pnl_leaderboard_period(args: $args) {
      rank
      account_id
      account_label
      account_image
      total_pnl_raw
      pnl_pct
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { args: args || {} }, 2, 42_000);
    const arr = res?.get_pnl_leaderboard_period ?? [];
    return limit != null ? arr.slice(0, limit) : arr;
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[graphql] getPnlLeaderboardPeriod failed', e);
    return [];
  }
};

/** Epoch-based PnL leaderboard with minimum threshold filtering and realized PnL fields. */
export const getPnlLeaderboardPeriodMinThreshold = async (args: Record<string, unknown> = {}, limit?: number) => {
  /** Field set aligned with Intuition portal (no extra columns — avoids divergent indexer behavior). */
  const q = `query GetPnlLeaderboardPeriodMinThreshold($args: get_pnl_leaderboard_period_min_threshold_args!) {
    get_pnl_leaderboard_period_min_threshold(args: $args) {
      rank
      account_id
      account_label
      account_image
      realized_pnl_pct
      unrealized_pnl_pct
      realized_pnl_formatted
      unrealized_pnl_formatted
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { args: args || {} }, 2, 42_000);
    const arr = res?.get_pnl_leaderboard_period_min_threshold ?? [];
    return limit != null ? arr.slice(0, limit) : arr;
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[graphql] getPnlLeaderboardPeriodMinThreshold failed', e);
    return [];
  }
};

/** User's position on Season 2 / epoch-based PnL leaderboard */
export const getPnlLeaderboardPeriodAccount = async (accountId: string, args: Record<string, unknown> = {}) => {
  const q = `query GetPnlLeaderboardPeriodAccount($args: get_pnl_leaderboard_period_args!) {
    get_pnl_leaderboard_period(args: $args) {
      rank
      account_id
      account_label
      account_image
      total_pnl_raw
      pnl_pct
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { args: args || {} }, 2, 22_000);
    const arr = res?.get_pnl_leaderboard_period ?? [];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.find((row: any) => String(row.account_id).toLowerCase() === accountId.toLowerCase()) ?? null;
  } catch {
    return null;
  }
};

export const getVaultsByIds = async (ids: string[]) => {
  if (!ids || ids.length === 0) return [];
  const q = `query GetVaultsByIds($ids: [String!]!) {
      atoms(where: { term_id: { _in: $ids } }) { term_id label data image type creator { id label image } value { person { name } organization { name } } }
      vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count }
      triples(where: { term_id: { _in: $ids } }) { term_id counter_term_id creator { id label image } subject { label term_id data image type } predicate { label } object { label term_id data image type } }
  }`;
  try {
    const res = await fetchGraphQL(q, { ids }, 2, 24_000);
    const aggregated = aggregateVaultData(res?.vaults || []);
    const atoms = res?.atoms || [];
    const triples = res?.triples || [];
    return aggregated.map(v => {
      const a = atoms.find((x: any) => normalize(x.term_id) === normalize(v.term_id));
      const t = triples.find((x: any) => normalize(x.term_id) === normalize(v.term_id));
      const meta = a ? resolveMetadata(a) : { label: v.term_id, description: '', type: 'ATOM', image: undefined, links: [] };
      let label = meta.label, type = (meta.type || "ATOM").toUpperCase(), image = a?.image, links = meta.links;
      if (t) { label = `${resolveMetadata(t.subject).label} ${t.predicate?.label || 'LINK'} ${resolveMetadata(t.object).label}`; type = "CLAIM"; image = t.subject?.image || t.object?.image; links = []; }
      return { id: v.term_id, counterTermId: t?.counter_term_id, label, description: meta.description, image, type, links, creator: a?.creator || t?.creator, totalAssets: v.total_assets.toString(), totalShares: v.total_shares.toString(), currentSharePrice: v.current_share_price, marketCap: v.computed_mcap.toString(), positionCount: v.position_count, curveId: v.curve_id };
    });
  } catch (e) { return []; }
};

export const getNetworkStats = async () => {
  const q = `query {
    vaults_aggregate { aggregate { sum { total_assets } } }
    atoms_aggregate { aggregate { count } }
    triples_aggregate { aggregate { count } }
    positions_aggregate(where: { shares: { _gt: "0" } }) { aggregate { count } }
  }`;
  try {
    const data = await fetchGraphQL(q, {}, 2, 50_000);
    const positionCount = data?.positions_aggregate?.aggregate?.count ?? 0;
    return {
      tvl: data?.vaults_aggregate?.aggregate?.sum?.total_assets || "0",
      atoms: data?.atoms_aggregate?.aggregate?.count || 0,
      signals: data?.triples_aggregate?.aggregate?.count || 0,
      positions: typeof positionCount === 'number' ? positionCount : 0
    };
  } catch (e) { return { tvl: "0", atoms: 0, signals: 0, positions: 0 }; }
};

export const getNetworkKPIs = async () => {
  const proxyVariants = prepareQueryIds(FEE_PROXY_ADDRESS);
  
  // High-fidelity aggregate reconciliation query
  const q = `query IntuRankSovereignKPIs($proxyVariants: [String!]!) {
    proxy_deposits: deposits(
        where: { sender_id: { _in: $proxyVariants } }, 
        limit: 1000, 
        order_by: { created_at: desc }
    ) {
      assets_after_fees 
      receiver { id label image }
      created_at
      transaction_hash
    }
    proxy_volume_aggregate: deposits_aggregate(
        where: { sender_id: { _in: $proxyVariants } }
    ) {
      aggregate {
        sum {
          assets_after_fees
        }
      }
    }
    proxy_redemptions_count: redemptions_aggregate(
        where: { sender_id: { _in: $proxyVariants } }
    ) {
      aggregate { count }
    }
    proxy_deposits_count: deposits_aggregate(
        where: { sender_id: { _in: $proxyVariants } }
    ) {
      aggregate { count }
    }
    global_vaults: vaults_aggregate { aggregate { sum { total_assets } } }
    global_atoms: atoms_aggregate { aggregate { count } }
    global_triples: triples_aggregate { aggregate { count } }
  }`;

  try {
    const data = await fetchGraphQL(q, { proxyVariants });
    
    // Use the aggregate sum for proxy volume to ensure absolute accuracy
    const totalProxyVolumeWei = BigInt(data?.proxy_volume_aggregate?.aggregate?.sum?.assets_after_fees || '0');
    const totalDepositsCount = data?.proxy_deposits_count?.aggregate?.count || 0;
    const totalRedemptionsCount = data?.proxy_redemptions_count?.aggregate?.count || 0;
    
    // User map logic for the ledger (limited to top recent for table UX)
    const userMap = new Map();
    const deposits = data?.proxy_deposits || [];
    deposits.forEach((d: any) => {
        const userId = d.receiver?.id;
        if (userId) {
            const existing = userMap.get(userId) || { id: userId, label: d.receiver.label, image: d.receiver.image, volume: 0, txCount: 0 };
            userMap.set(userId, { 
                ...existing, 
                volume: existing.volume + parseFloat(formatEther(BigInt(d.assets_after_fees || '0'))),
                txCount: existing.txCount + 1
            });
        }
    });

    const globalTVLStr = data?.global_vaults?.aggregate?.sum?.total_assets || "0";
    const globalTVLBig = BigInt(globalTVLStr);
    
    // Higher precision market share calculation
    const marketShare = globalTVLBig > 0n 
        ? (Number(totalProxyVolumeWei * 1000000n / globalTVLBig) / 10000) 
        : 0;

    return {
      proxyTVL: totalProxyVolumeWei.toString(),
      globalTVL: globalTVLStr,
      marketShare: marketShare, // Returns a number for frontend formatting
      userCount: userMap.size,
      txCount: totalDepositsCount + totalRedemptionsCount,
      atomCount: data?.global_atoms?.aggregate?.count || 0,
      signalCount: data?.global_triples?.aggregate?.count || 0,
      userLedger: Array.from(userMap.values())
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 50)
    };
  } catch (e) {
    console.error("SOVEREIGN_KPI_FETCH_FAILURE", e);
    return { proxyTVL: "0", globalTVL: "0", marketShare: 0, userCount: 0, txCount: 0, atomCount: 0, signalCount: 0, userLedger: [] };
  }
};

/** Rows for the system health "Activity log" (deposits/redemptions with fee proxy as `sender`). */
export type FeeProxyActivityLine = {
  id: string;
  timestampMs: number;
  kind: 'DEP' | 'RED';
  amountFormatted: string;
  /** Resolved EOA (for /profile/:id) */
  actorId: string;
  actorLabel: string;
  marketLabel: string;
  transactionHash: string;
};

function formatFeeProxyActorLabel(a: { id: string; label?: string } | null): string {
  if (!a?.id) return 'unknown';
  if (a.label && a.label !== '0x' && !a.label.startsWith('0x00')) return a.label;
  return `${a.id.slice(0, 6)}…${a.id.slice(-4)}`;
}

function truncateFeeProxyLabel(s: string, n: number) {
  if (!s) return '…';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/** Latest indexed deposits/redemptions where the IntuRank fee proxy is the on-chain `sender` (routed flow). */
export const getRecentFeeProxyActivity = async (limit: number = 20): Promise<FeeProxyActivityLine[]> => {
  const proxyVariants = prepareQueryIds(FEE_PROXY_ADDRESS);
  const q = `query RecentFeeProxyEvents($proxyVariants: [String!]!, $limit: Int!) {
    events(
      where: {
        _and: [
          { type: { _in: ["Deposited", "Redeemed"] } },
          { _or: [
            { deposit: { sender_id: { _in: $proxyVariants } } },
            { redemption: { sender_id: { _in: $proxyVariants } } }
          ] }
        ]
      }
      order_by: { created_at: desc }
      limit: $limit
    ) {
      id
      created_at
      type
      transaction_hash
      atom { term_id label data type }
      triple { term_id subject { label term_id data type } predicate { label } object { label term_id data type } }
      deposit { shares assets_after_fees sender { id label } receiver { id label } vault { term_id curve_id } }
      redemption { shares assets sender { id label } receiver { id label } vault { term_id curve_id } }
    }
  }`;
  try {
    const data = await fetchGraphQL(q, { proxyVariants, limit });
    const rows = data?.events ?? [];
    return (rows as any[]).map((ev) => {
      const dep = ev.deposit || ev.redemption;
      const actor = resolveProxyActivityAccount(dep);
      let market = '…';
      if (ev.atom) {
        market = resolveMetadata(ev.atom).label;
      } else if (ev.triple) {
        const s = resolveMetadata(ev.triple.subject);
        const o = resolveMetadata(ev.triple.object);
        market = `${s.label} ${ev.triple.predicate?.label || '·'} ${o.label}`;
      }
      const rawAssets = ev.type === 'Deposited' ? ev.deposit?.assets_after_fees : ev.redemption?.assets;
      let amt = '0.00';
      try {
        amt = parseFloat(formatEther(BigInt(String(rawAssets || '0')))).toFixed(2);
      } catch {
        /* keep default */
      }
      const kind: 'DEP' | 'RED' = ev.type === 'Deposited' ? 'DEP' : 'RED';
      const t = ev.created_at ? new Date(ev.created_at).getTime() : Date.now();
      return {
        id: String(ev.id ?? ev.transaction_hash ?? t),
        timestampMs: t,
        kind,
        amountFormatted: amt,
        actorId: String(actor?.id || ''),
        actorLabel: formatFeeProxyActorLabel(actor),
        marketLabel: truncateFeeProxyLabel(market, 96),
        transactionHash: String(ev.transaction_hash || ''),
      };
    });
  } catch (e) {
    console.warn('[getRecentFeeProxyActivity]', e);
    return [];
  }
};

/**
 * --- ADDED MISSING EXPORTS TO RESOLVE IMPORT ERRORS ---
 */

export const getAgentTriples = async (termId: string): Promise<Triple[]> => {
  const ids = prepareQueryIds(termId);
  const q = `query ($ids: [String!]!) {
      triples(where: { _or: [{ subject_id: { _in: $ids } }, { object_id: { _in: $ids } }] }, order_by: { block_number: desc }) {
        term_id counter_term_id subject { label term_id data image type } predicate { label term_id } object { label term_id data image type } block_number transaction_hash creator { id label image }
      }
  }`;
  try {
    const res = await fetchGraphQL(q, { ids });
    return (res?.triples || []).map((t: any) => ({
        ...t,
        subject: { ...t.subject, label: resolveMetadata(t.subject).label },
        predicate: { ...t.predicate, label: t.predicate?.label || 'LINK' },
        object: { ...t.object, label: resolveMetadata(t.object).label }
    }));
  } catch (e) { return []; }
};

/** Triples involving this term, enriched with support/oppose vault stats for the claims table. */
export const getAgentTriplesWithVaults = async (termId: string): Promise<Array<{
  id: string;
  counterTermId?: string;
  subject: { term_id: string; label: string; image?: string };
  predicate: { label: string };
  object: { term_id: string; label: string; image?: string };
  creator?: { id: string; label?: string; image?: string };
  transaction_hash?: string;
  supportTotalAssets: string;
  supportPositionCount: number;
  opposeTotalAssets: string;
  opposePositionCount: number;
}>> => {
  const ids = prepareQueryIds(termId);
  const tripleTermsQ = `query GetAtomClaimsView($where: triple_term_bool_exp, $orderBy: [triple_term_order_by!], $limit: Int, $offset: Int) {
    triple_terms(where: $where, order_by: $orderBy, limit: $limit, offset: $offset) {
      term_id
      counter_term_id
      total_assets
      total_market_cap
      total_position_count
      term {
        triple {
          term_id
          subject { term_id label data image type }
          predicate { label term_id }
          object { term_id label data image type }
          creator { id label image }
        }
      }
      counter_term {
        total_assets
        total_market_cap
        positions_aggregate { aggregate { count } }
      }
    }
  }`;
  try {
    const ttRes = await fetchGraphQL(tripleTermsQ, {
      where: { term: { triple: { _or: [{ subject_id: { _in: ids } }, { object_id: { _in: ids } }] } } },
      orderBy: [{ total_market_cap: 'desc' }],
      limit: 100,
      offset: 0,
    });
    const tt = ttRes?.triple_terms;
    if (Array.isArray(tt) && tt.length > 0) {
      return tt.map((row: any) => {
        const t = row.term?.triple;
        const ct = row.counter_term;
        const supportAssets = row.total_assets ?? row.term?.total_assets ?? '0';
        const opposeAssets = ct?.total_assets ?? '0';
        const supportCount = row.total_position_count ?? row.term?.positions_aggregate?.aggregate?.count ?? 0;
        const opposeCount = ct?.positions_aggregate?.aggregate?.count ?? 0;
        return {
          id: row.term_id,
          counterTermId: row.counter_term_id,
          subject: { ...t?.subject, label: t?.subject ? resolveMetadata(t.subject).label : 'Unknown' },
          predicate: { label: t?.predicate?.label || 'LINK' },
          object: { ...t?.object, label: t?.object ? resolveMetadata(t.object).label : 'Unknown' },
          creator: t?.creator,
          transaction_hash: undefined,
          supportTotalAssets: String(supportAssets),
          supportPositionCount: Number(supportCount),
          opposeTotalAssets: String(opposeAssets),
          opposePositionCount: Number(opposeCount),
        };
      });
    }
  } catch (_) { /* triple_terms not available, fall through */ }
  const q = `query ($ids: [String!]!) {
      triples(where: { _or: [{ subject_id: { _in: $ids } }, { object_id: { _in: $ids } }] }, order_by: { block_number: desc }, limit: 100) {
        term_id counter_term_id subject { label term_id data image type } predicate { label term_id } object { label term_id data image type } block_number transaction_hash creator { id label image }
      }
  }`;
  try {
    const res = await fetchGraphQL(q, { ids });
    const triples = res?.triples || [];
    if (triples.length === 0) return [];
    const termIds = triples.map((t: any) => t.term_id).filter(Boolean);
    const counterIds = triples.map((t: any) => t.counter_term_id).filter(Boolean);
    const allIds = [...termIds, ...counterIds];
    const idsForVault = Array.from(new Set(allIds.flatMap((id: string) => prepareQueryIds(id)))).slice(0, 200);
    const vaultQ = `query GetClaimVaults($ids: [String!]!) {
      vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count }
    }`;
    const [vaultRes, posRes] = await Promise.all([
      fetchGraphQL(vaultQ, { ids: idsForVault }),
      (() => {
        const holderIds = Array.from(new Set(allIds.flatMap((id: string) => prepareQueryIds(id)))).slice(0, 200);
        if (holderIds.length === 0) return Promise.resolve({ positions: [] });
        return fetchGraphQL(`query GetPositionsForHolders($ids: [String!]!) {
          positions(where: { vault: { term_id: { _in: $ids } }, shares: { _gt: "0" } }, limit: 10000) {
            account_id
            account { id }
            vault { term_id }
          }
        }`, { ids: holderIds });
      })()
    ]);
    const agg = aggregateVaultData(vaultRes?.vaults || []);
    const supportMap = new Map(agg.map((v: any) => [normalize(v.term_id), v]));
    const counterIdsForQuery = Array.from(new Set(counterIds.flatMap((id: string) => prepareQueryIds(id)))).slice(0, 100);
    let opposeMap: Record<string, { total_assets: string; position_count: number }> = {};
    if (counterIdsForQuery.length > 0) {
      const counterRes = await fetchGraphQL(vaultQ, { ids: counterIdsForQuery });
      aggregateVaultData(counterRes?.vaults || []).forEach((v: any) => {
        opposeMap[normalize(v.term_id)] = { total_assets: v.total_assets?.toString() ?? '0', position_count: v.position_count ?? 0 };
      });
    }
    const byTermAccounts = new Map<string, Set<string>>();
    (posRes?.positions || []).forEach((p: any) => {
      const tid = normalize(p.vault?.term_id);
      if (!tid) return;
      const accId = ((p.account_id || p.account?.id) || '').toLowerCase();
      if (!accId) return;
      if (!byTermAccounts.has(tid)) byTermAccounts.set(tid, new Set());
      byTermAccounts.get(tid)!.add(accId);
    });
    const holderCountByTerm = new Map<string, number>();
    byTermAccounts.forEach((accounts, tid) => holderCountByTerm.set(tid, accounts.size));
    return triples.map((t: any) => {
      const v = supportMap.get(normalize(t.term_id));
      const oppose = t.counter_term_id ? opposeMap[normalize(t.counter_term_id)] : null;
      const supportHolders = holderCountByTerm.get(normalize(t.term_id)) ?? v?.position_count ?? 0;
      const opposeHolders = t.counter_term_id ? (holderCountByTerm.get(normalize(t.counter_term_id)) ?? oppose?.position_count ?? 0) : 0;
      return {
        id: t.term_id,
        counterTermId: t.counter_term_id,
        subject: { ...t.subject, label: resolveMetadata(t.subject).label },
        predicate: { label: t.predicate?.label || 'LINK' },
        object: { ...t.object, label: resolveMetadata(t.object).label },
        creator: t.creator,
        transaction_hash: t.transaction_hash,
        supportTotalAssets: v?.total_assets != null ? String(v.total_assets) : '0',
        supportPositionCount: supportHolders,
        opposeTotalAssets: oppose?.total_assets ?? '0',
        opposePositionCount: opposeHolders,
      };
    });
  } catch (e) {
    console.warn('getAgentTriplesWithVaults error', e);
    return [];
  }
};

export const getTopPositions = async (limit: number = 2500) => {
  const q = `query GetTopPositions($limit: Int!) {
      positions(order_by: { shares: desc }, limit: $limit, where: { shares: { _gt: "0" } }) {
        id 
        shares 
        account_id
        account {
          id
          label
          image
        }
        vault { 
          term_id 
          total_assets 
          total_shares 
          curve_id
        }
      }
  }`;
  try {
    const res = await fetchGraphQL(q, { limit });
    return res?.positions || [];
  } catch (e) { return []; }
};

export const getTopClaims = async (limit: number = 40, offset: number = 0) => {
  // Primary: triple_terms — canonical claims API, most complete
  const tripleTermsQ = `query GetTopClaimsTripleTerms($limit: Int!, $offset: Int!) {
    triple_terms(where: {}, order_by: { total_market_cap: desc }, limit: $limit, offset: $offset) {
      term_id
      counter_term_id
      total_assets
      total_market_cap
      total_position_count
      term {
        total_market_cap
        total_assets
        positions_aggregate { aggregate { count } }
        triple {
          term_id
          counter_term_id
          subject { term_id label data image type }
          predicate { label term_id }
          object { term_id label data image type }
        }
      }
      counter_term {
        total_assets
        total_market_cap
        positions_aggregate { aggregate { count } }
      }
    }
  }`;
  try {
    const ttRes = await fetchGraphQL(tripleTermsQ, { limit, offset });
    const tt = ttRes?.triple_terms;
    if (Array.isArray(tt) && tt.length > 0) {
      const items = tt.map((row: any) => {
        const t = row.term?.triple;
        const ct = row.counter_term;
        if (!t) return null;
        const supportMcap = row.total_market_cap ?? row.term?.total_market_cap;
        const opposeMcap = ct?.total_market_cap;
        const supportAssets = row.total_assets ?? row.term?.total_assets ?? '0';
        const opposeAssets = ct?.total_assets ?? '0';
        const supportVal = parseClaimVaultSideTrust(supportMcap, supportAssets);
        const opposeHolders = ct?.positions_aggregate?.aggregate?.count ?? 0;
        /** With zero opposers, vault `total_assets` fallback is often misleading (shows bogus TVL); show 0 TRUST. */
        const opposeVal = opposeHolders <= 0 ? 0 : parseClaimVaultSideTrust(opposeMcap, opposeAssets);
        return {
          id: row.term_id,
          counterTermId: row.counter_term_id,
          subject: { ...t.subject, label: resolveMetadata(t.subject).label },
          predicate: t.predicate?.label || 'LINK',
          object: { ...t.object, label: resolveMetadata(t.object).label },
          value: supportVal,
          holders: row.total_position_count ?? row.term?.positions_aggregate?.aggregate?.count ?? 0,
          opposeValue: opposeVal,
          opposeHolders
        };
      }).filter(Boolean);
      return { items, hasMore: tt.length >= limit };
    }
  } catch (_) { /* triple_terms not available, fall through */ }

  // Fallback: vaults-based (legacy)
  const fetchLimit = Math.max(limit * 10, 1000);
  const q = `query GetTopClaims($limit: Int!, $offset: Int!) {
      vaults(where: { term: { triple: { term_id: { _is_null: false } } } }, limit: $limit, offset: $offset, order_by: { total_assets: desc }) {
        term_id total_assets total_shares current_share_price curve_id position_count
        term { triple { counter_term_id subject { label term_id data image type } predicate { label term_id } object { label term_id data image type } } }
      }
  }`;
  try {
    const [res, res2] = await Promise.all([
      fetchGraphQL(q, { limit: fetchLimit, offset: 0 }),
      fetchGraphQL(q, { limit: 500, offset: fetchLimit }),
    ]);
    const vaults = [...(res?.vaults || []), ...(res2?.vaults || [])];
    const supportIdsForQuery = Array.from(new Set(vaults.flatMap((v: any) => prepareQueryIds(v.term_id)))).slice(0, 800);
    let supportVaults = vaults;
    if (supportIdsForQuery.length > 0) {
      const fullQ = `query GetSupportVaultsFull($ids: [String!]!) {
        vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count }
      }`;
      const fullRes = await fetchGraphQL(fullQ, { ids: supportIdsForQuery });
      const allSupportVaults = fullRes?.vaults || [];
      supportVaults = allSupportVaults.length > 0 ? allSupportVaults : vaults;
    }
    const supportAggregated = aggregateVaultData(supportVaults);
    supportAggregated.sort((a: any, b: any) => {
      const aVal = (a.computed_mcap ?? 0) > 0 ? a.computed_mcap : parseFloat(formatEther(BigInt(a.total_assets)));
      const bVal = (b.computed_mcap ?? 0) > 0 ? b.computed_mcap : parseFloat(formatEther(BigInt(b.total_assets)));
      return bVal - aVal;
    });
    const paginated = supportAggregated.slice(offset, offset + limit);
    const counterTermIds = paginated
      .map((v: any) => {
        const v0 = vaults.find((x: any) => normalize(x.term_id) === normalize(v.term_id));
        return v0?.term?.triple?.counter_term_id;
      })
      .filter((id: string | null | undefined) => id && id.trim() !== '');
    const idsForQuery = Array.from(new Set(counterTermIds.flatMap((id: string) => prepareQueryIds(id)))).slice(0, 400);
    let opposeMap: Record<string, { total_assets: string; computed_mcap: number; position_count: number }> = {};
    if (idsForQuery.length > 0) {
      const counterQ = `query GetOpposeVaults($ids: [String!]!) {
        vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count }
      }`;
      const counterRes = await fetchGraphQL(counterQ, { ids: idsForQuery });
      const counterVaults = counterRes?.vaults || [];
      const opposeAggregated = aggregateVaultData(counterVaults);
      opposeAggregated.forEach((v: any) => {
        const id = normalize(v.term_id);
        opposeMap[id] = { total_assets: v.total_assets.toString(), computed_mcap: v.computed_mcap ?? 0, position_count: v.position_count || 0 };
      });
    }
    const allTermIdsForHolders = [
      ...paginated.map((v: any) => v.term_id),
      ...counterTermIds
    ];
    const holderIdsForQuery = Array.from(new Set(allTermIdsForHolders.flatMap((id: string) => prepareQueryIds(id)))).slice(0, 400);
    let supportHolderMap: Record<string, number> = {};
    let opposeHolderMap: Record<string, number> = {};
    if (holderIdsForQuery.length > 0) {
      const posQ = `query GetPositionsForHolders($ids: [String!]!) {
        positions(where: { vault: { term_id: { _in: $ids } }, shares: { _gt: "0" } }, limit: 15000) {
          account_id
          account { id }
          vault { term_id }
        }
      }`;
      const posRes = await fetchGraphQL(posQ, { ids: holderIdsForQuery });
      const positions = posRes?.positions || [];
      const supportTermIdSet = new Set(paginated.map((v: any) => normalize(v.term_id)));
      const opposeTermIdSet = new Set(counterTermIds.filter(Boolean).map((id: string) => normalize(id)));
      const byTerm = new Map<string, Set<string>>();
      positions.forEach((p: any) => {
        const tid = normalize(p.vault?.term_id);
        if (!tid) return;
        if (!byTerm.has(tid)) byTerm.set(tid, new Set());
        const accId = ((p.account_id || p.account?.id) || '').toLowerCase();
        if (accId) byTerm.get(tid)!.add(accId);
      });
      byTerm.forEach((accounts, tid) => {
        const count = accounts.size;
        if (supportTermIdSet.has(tid)) supportHolderMap[tid] = count;
        if (opposeTermIdSet.has(tid)) opposeHolderMap[tid] = count;
      });
    }
    const items = paginated.map((v: any) => {
        const v0 = vaults.find((x: any) => normalize(x.term_id) === normalize(v.term_id));
        const t = v0?.term?.triple;
        if (!t) return null;
        const counterId = t?.counter_term_id ? normalize(t.counter_term_id) : null;
        const oppose = counterId ? opposeMap[counterId] : null;
        const supportHolders = supportHolderMap[normalize(v.term_id)] ?? v.position_count ?? 0;
        const opposeHolders = counterId ? (opposeHolderMap[counterId] ?? oppose?.position_count ?? 0) : 0;
        const supportVal = (v.computed_mcap ?? 0) > 0 ? v.computed_mcap : parseFloat(formatEther(BigInt(v.total_assets)));
        const rawOppose = oppose ? parseClaimVaultSideTrust(oppose.computed_mcap, oppose.total_assets) : 0;
        return {
            id: v.term_id,
            counterTermId: t.counter_term_id,
            subject: { ...t.subject, label: resolveMetadata(t.subject).label },
            predicate: t.predicate?.label || 'LINK',
            object: { ...t.object, label: resolveMetadata(t.object).label },
            value: supportVal,
            holders: supportHolders,
            opposeValue: opposeHolders <= 0 ? 0 : rawOppose,
            opposeHolders
        };
    }).filter(Boolean);
    return { items, hasMore: supportAggregated.length > offset + limit };
  } catch (e) { return { items: [], hasMore: false }; }
};

export const searchClaims = async (term: string): Promise<any[]> => {
  const t = term.trim();
  if (!t || t.length < 2) return [];
  const pattern = `%${t}%`;
  const q = `query SearchClaims($subj: String!, $obj: String!) {
    triples(where: { _or: [
      { subject: { label: { _ilike: $subj } } },
      { subject: { label: { _ilike: $obj } } },
      { object: { label: { _ilike: $subj } } },
      { object: { label: { _ilike: $obj } } }
    ] }, limit: 30) {
      term_id counter_term_id subject { label term_id data image type } predicate { label term_id } object { label term_id data image type }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { subj: pattern, obj: pattern });
    const triples = res?.triples || [];
    if (triples.length === 0) return [];
    const termIds = triples.map((x: any) => x.term_id);
    const idsForVault = Array.from(new Set(termIds.flatMap((id: string) => prepareQueryIds(id)))).slice(0, 100);
    const vaultQ = `query GetClaimVaults($ids: [String!]!) {
      vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count }
    }`;
    const vaultRes = await fetchGraphQL(vaultQ, { ids: idsForVault });
    const allVaults = vaultRes?.vaults || [];
    const agg = aggregateVaultData(allVaults);
    const aggMap = new Map(agg.map((v: any) => [normalize(v.term_id), v]));
    const counterIds = triples.map((t: any) => t.counter_term_id).filter(Boolean);
    const counterIdsForQuery = Array.from(new Set(counterIds.flatMap((id: string) => prepareQueryIds(id)))).slice(0, 100);
    let opposeMap: Record<string, { total_assets: string; computed_mcap: number; position_count: number }> = {};
    if (counterIdsForQuery.length > 0) {
      const counterRes = await fetchGraphQL(vaultQ, { ids: counterIdsForQuery });
      const counterVaults = counterRes?.vaults || [];
      aggregateVaultData(counterVaults).forEach((v: any) => {
        opposeMap[normalize(v.term_id)] = { total_assets: v.total_assets.toString(), computed_mcap: v.computed_mcap ?? 0, position_count: v.position_count || 0 };
      });
    }
    return triples.map((t: any) => {
      const v = aggMap.get(normalize(t.term_id));
      const oppose = t.counter_term_id ? opposeMap[normalize(t.counter_term_id)] : null;
      const opposeHolders = oppose?.position_count ?? 0;
      const rawOppose = oppose ? parseClaimVaultSideTrust(oppose.computed_mcap, oppose.total_assets) : 0;
      return {
        id: t.term_id,
        subject: { ...t.subject, label: resolveMetadata(t.subject).label },
        predicate: t.predicate?.label || 'LINK',
        object: { ...t.object, label: resolveMetadata(t.object).label },
        value: v ? ((v.computed_mcap ?? 0) > 0 ? v.computed_mcap : parseFloat(formatEther(BigInt(v.total_assets)))) : 0,
        holders: v?.position_count ?? 0,
        opposeValue: opposeHolders <= 0 ? 0 : rawOppose,
        opposeHolders,
      };
    });
  } catch (e) {
    console.warn('searchClaims error', e);
    return [];
  }
};

export const searchGlobalAgents = async (term: string): Promise<{ id: string; label: string; image?: string; type?: string; description?: string; marketCap?: string; positionCount?: number }[]> => {
  const t = term.trim();
  if (!t) return [];
  const pattern = `%${t}%`;
  const q = `query SearchAgents($term: String!) {
      atoms(where: { _or: [{ label: { _ilike: $term } }, { term_id: { _ilike: $term } }] }, limit: 25) {
        term_id label data image type creator { id label image }
      }
  }`;
  try {
    const res = await fetchGraphQL(q, { term: pattern });
    const atoms = res?.atoms ?? res?.data?.atoms ?? [];
    if (!Array.isArray(atoms)) return [];
    const termIds = atoms.map((a: any) => a.term_id);
    if (termIds.length === 0) return [];
    const vq = `query SearchAgentsVaults($ids: [String!]!) {
      vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count }
    }`;
    const vRes = await fetchGraphQL(vq, { ids: termIds });
    const aggregated = aggregateVaultData(vRes?.vaults || []);
    const vaultByTerm = new Map<string, any>();
    aggregated.forEach((v: any) => vaultByTerm.set(normalize(v.term_id), v));
    const items = atoms.map((a: any) => {
      const meta = resolveMetadata(a);
      const v = vaultByTerm.get(normalize(a.term_id));
      const mcap = v ? (v.computed_mcap ?? parseFloat(formatEther(BigInt(v.total_assets || '0')))) : 0;
      const totalAssets = v ? BigInt(v.total_assets || '0') : 0n;
      return {
        id: a.term_id,
        label: meta.label,
        image: a.image || meta.image,
        type: a.type || 'ATOM',
        description: meta.description,
        marketCap: v ? formatEther(BigInt(v.total_assets || '0')) : '0',
        positionCount: v?.position_count ?? 0,
        _sortMcap: mcap,
        _sortAssets: totalAssets,
      };
    });
    items.sort((a, b) => {
      const ma = a._sortMcap ?? 0;
      const mb = b._sortMcap ?? 0;
      if (mb !== ma) return mb - ma;
      return Number((b._sortAssets ?? 0n) - (a._sortAssets ?? 0n));
    });
    return items.map(({ _sortMcap, _sortAssets, ...rest }) => rest);
  } catch (e) {
    console.warn('searchGlobalAgents error', e);
    return [];
  }
};

export const searchAccountsByLabel = async (term: string) => {
  const q = `query SearchAccounts($term: String!) {
      accounts(where: { label: { _ilike: $term } }, limit: 10) {
        id
        label
        image
      }
  }`;

  try {
    const res = await fetchGraphQL(q, { term: `%${term}%` });
    return (res?.accounts || []) as { id: string; label: string | null; image: string | null }[];
  } catch (e) {
    return [];
  }
};

/** Rank `.trust` / label rows so prefix matches beat incidental substring hits after widening ILIKE (see below). */
function rankTrustLabelStemMatch(label: string | null, stem: string): number {
  if (!label || !stem) return 500;
  const l = label.toLowerCase();
  const base = l.endsWith('.trust') ? l.slice(0, -'.trust'.length) : l;
  const s = stem.toLowerCase();
  if (base === s) return 0;
  if (base.startsWith(s)) return 4 + base.length * 0.001;
  const idx = base.indexOf(s);
  if (idx >= 0) return 40 + idx + base.length * 0.001;
  if (l.includes(s)) return 80;
  return 200;
}

/**
 * Leaderboard profile search: plain `%term%` misses names where typing diverges before the full label
 * (e.g. `dappes` vs `dappestdev.trust`). We OR several truncated-prefix `%…%` clauses, then rank client-side.
 */
export const searchAccountsByLabelSuggest = async (term: string) => {
  const raw = term.trim();
  if (!raw) return [];
  if (isAddress(raw)) return [];

  const lower = raw.toLowerCase();
  if (lower.includes('.eth')) {
    return searchAccountsByLabel(raw);
  }

  const withoutTrust = lower.endsWith('.trust') ? lower.slice(0, -'.trust'.length) : lower;
  const stem = withoutTrust.replace(/[^a-z0-9-]/g, '');
  if (!stem) return [];

  const MIN_PREFIX_LEN = stem.length <= 2 ? stem.length : 3;
  const MAX_OR_CLAUSES = 8;
  const ilikes: string[] = [];
  for (let len = stem.length; len >= MIN_PREFIX_LEN && ilikes.length < MAX_OR_CLAUSES; len--) {
    ilikes.push(`%${stem.slice(0, len)}%`);
  }

  const where = { _or: ilikes.map((pat) => ({ label: { _ilike: pat } })) };

  const q = `query SearchAccountsSuggest($where: accounts_bool_exp!) {
      accounts(where: $where, limit: 24, order_by: [{ label: asc }]) {
        id
        label
        image
      }
    }`;

  try {
    const res = await fetchGraphQL(q, { where });
    const rows = (res?.accounts || []) as { id: string; label: string | null; image: string | null }[];

    const ranked = [...rows].sort((a, b) => {
      const ra = rankTrustLabelStemMatch(a.label, stem);
      const rb = rankTrustLabelStemMatch(b.label, stem);
      if (ra !== rb) return ra - rb;
      return (a.label || '').localeCompare(b.label || '');
    });

    const seen = new Set<string>();
    const deduped: typeof rows = [];
    for (const r of ranked) {
      const k = r.id.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(r);
    }
    return deduped.slice(0, 12);
  } catch (e) {
    console.warn('searchAccountsByLabelSuggest error', e);
    return [];
  }
};

export const getLists = async (limit: number = 40, offset: number = 0, orderBy?: { total_market_cap?: 'asc' | 'desc'; triple_count?: 'asc' | 'desc'; total_position_count?: 'asc' | 'desc' }[]) => {
  const orderByArg = orderBy || [{ total_market_cap: 'desc' as const }];
  const q = `query GetLists($limit: Int, $offset: Int, $where: predicate_objects_bool_exp = {}, $orderBy: [predicate_objects_order_by!] = {}) {
    predicate_objects(
      limit: $limit
      offset: $offset
      where: $where
      order_by: $orderBy
    ) {
      predicate { term_id label image }
      object { term_id label image }
      triples(limit: 8) {
        subject { term_id label image }
      }
      triple_count
      total_market_cap
      total_position_count
    }
  }`;
  try {
    const where = { predicate_id: { _eq: LIST_PREDICATE_ID } };
    const res = await fetchGraphQL(q, { limit, offset, where, orderBy: orderByArg });
    const rows = res?.predicate_objects || [];
    const items = rows.map((po: any) => {
      const obj = po.object || {};
      const img = obj.image || obj.cached_image?.url;
      const subjects = (po.triples || []).map((t: any) => ({
        termId: t.subject?.term_id,
        label: t.subject?.label,
        image: t.subject?.image || t.subject?.cached_image?.url,
      }));
      return {
        id: obj.term_id,
        label: obj.label || po.predicate?.label || 'Untitled list',
        image: img || po.predicate?.image,
        totalItems: po.triple_count ?? subjects.length,
        items: subjects,
        totalMarketCap: po.total_market_cap,
        totalPositionCount: po.total_position_count,
      };
    });
    return { items, hasMore: items.length === limit };
  } catch (e) {
    console.warn("[getLists] predicate_objects failed, falling back to triples", e);
    const fallback = `query GetListsFallback($limit: Int!, $offset: Int!) {
      triples(where: { predicate_id: { _eq: "${LIST_PREDICATE_ID}" } }, limit: $limit, offset: $offset) {
        term_id object { term_id label image } subject { label image }
      }
    }`;
    try {
      const res = await fetchGraphQL(fallback, { limit, offset });
      const seen = new Map<string, any>();
      (res?.triples || []).forEach((t: any) => {
        const obj = t.object;
        if (!obj?.term_id) return;
        const key = obj.term_id.toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, { id: obj.term_id, label: obj.label, image: obj.image, totalItems: 0, items: [] });
        }
        const rec = seen.get(key);
        rec.totalItems += 1;
        if (rec.items.length < 8) rec.items.push({ label: t.subject?.label, image: t.subject?.image });
      });
      const items = Array.from(seen.values());
      return { items, hasMore: items.length === limit };
    } catch (e2) {
      return { items: [], hasMore: false };
    }
  }
};

/**
 * List members: triples (list predicate) whose **object** is the list — **subject** is a member to rank in Arena.
 * Leaderboard / Compare use `registerArenaPortalListTermsForIndexing` ∪ indexer portal lists (`getLists`).
 * Portfolio “My ranked lists” narrows to **extras only** (`fetchPortfolioArenaRankingClaims`) so the UI starts clean until you open lists in Arena.
 */

const arenaRankingAllowlistExtras = new Set<string>();

/** Persist extras across reloads so leaderboard/explorer retain remembered portal list ids without re-opening Arena. */
const ARENA_RANKING_ALLOWLIST_EXTRAS_STORAGE_KEY = 'inturank-arena-ranking-extras-v2';

let arenaRankingAllowlistExtrasHydrated = false;

function ensureArenaRankingAllowlistExtrasHydrated() {
  if (arenaRankingAllowlistExtrasHydrated) return;
  arenaRankingAllowlistExtrasHydrated = true;
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(ARENA_RANKING_ALLOWLIST_EXTRAS_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return;
    for (const x of arr) {
      const n = normalize(String(x ?? ''));
      if (n) arenaRankingAllowlistExtras.add(n);
    }
  } catch {
    /* ignore corrupt storage */
  }
}

function persistArenaRankingAllowlistExtras() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ARENA_RANKING_ALLOWLIST_EXTRAS_STORAGE_KEY,
      JSON.stringify(Array.from(arenaRankingAllowlistExtras)),
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * Drops persisted + in-memory portal list term registrations for this browser (Portfolio “fresh slate”).
 * Leaderboard/compare still use the full indexer portal merge via `getArenaPortalRankingAllowlist`.
 */
export function clearArenaPortalListIndexingExtras() {
  arenaRankingAllowlistExtras.clear();
  arenaRankingAllowlistExtrasHydrated = false;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(ARENA_RANKING_ALLOWLIST_EXTRAS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Register list object term ids Arena can write to — e.g. current portal batch + URL-opened portal lists — so portfolio stays accurate without waiting for pagination. */
export function registerArenaPortalListTermsForIndexing(termIds: string[]) {
  ensureArenaRankingAllowlistExtrasHydrated();
  for (const raw of termIds) {
    const n = normalize(raw);
    if (n) arenaRankingAllowlistExtras.add(n);
  }
  persistArenaRankingAllowlistExtras();
}

async function getArenaPortalRankingAllowlist(): Promise<Set<string>> {
  ensureArenaRankingAllowlistExtrasHydrated();
  const s = new Set<string>(arenaRankingAllowlistExtras);
  try {
    const { items } = await getLists(260, 0, [{ total_position_count: 'desc' }]);
    for (const it of items || []) {
      const id = (it as any)?.id;
      if (id) s.add(normalize(id));
    }
  } catch {
    /* extras-only fallback */
  }
  return s;
}

/**
 * Portal lists merged into Arena browse (same query as `/climb`) plus URL/session-indexed list terms.
 * Explorer feed only — keeps rankings scoped to IntuRank-surfaced portal lists, not a broad portal scrape.
 */
async function getArenaExplorerFeedAllowlist(): Promise<Set<string>> {
  ensureArenaRankingAllowlistExtrasHydrated();
  const s = new Set<string>(arenaRankingAllowlistExtras);
  try {
    const { items } = await getLists(ARENA_PORTAL_LISTS_FETCH_LIMIT, 0, [{ total_position_count: 'desc' }]);
    for (const it of items || []) {
      const id = (it as any)?.id;
      if (id) s.add(normalize(id));
    }
  } catch {
    /* extras-only */
  }
  return s;
}

export interface ArenaXpRecord {
  xp: number;
  duels: number;
  atomsRanked: number;
  listsPlayed: number;
  updatedAt: number;
}

function emptyArenaXpRecord(): ArenaXpRecord {
  return { xp: 0, duels: 0, atomsRanked: 0, listsPlayed: 0, updatedAt: 0 };
}

/** Portal-list allowlist with id variants (padded ↔ unpadded). */
function arenaListIdMatchesAllowlist(allow: Set<string>, listTermId: string): boolean {
  if (allow.size === 0) return false;
  for (const v of prepareQueryIds(String(listTermId || ''))) {
    if (allow.has(normalize(v))) return true;
  }
  return false;
}

/**
 * One Arena slot per list+subject. Uses the smallest normalized id variant so subgraph rows do not
 * split a single rank across padded vs unpadded bytes32 strings.
 */
function arenaRankSlotKey(listTermId: string, subjectId: string): string | null {
  const lists = prepareQueryIds(String(listTermId || ''))
    .map(normalize)
    .filter(Boolean)
    .sort();
  const subs = prepareQueryIds(String(subjectId || ''))
    .map(normalize)
    .filter(Boolean)
    .sort();
  const lk = lists[0];
  const sk = subs[0];
  if (!lk || !sk) return null;
  return `${lk}:${sk}`;
}

/** Vault stance `listTermId` vs portal list object id (handles id padding variants). */
function portalListStanceMatchesListObject(listTermIdFromStance: string, portalListObjectTermId: string): boolean {
  const want = new Set(
    prepareQueryIds(String(portalListObjectTermId || ''))
      .map(normalize)
      .filter(Boolean),
  );
  if (want.size === 0) return false;
  for (const v of prepareQueryIds(String(listTermIdFromStance || ''))) {
    if (want.has(normalize(v))) return true;
  }
  return false;
}

type ArenaGraphTripleStanceRow = {
  creatorId: string;
  claimTermId: string;
  subjectId: string;
  subjectLabel: string;
  subjectImage?: string;
  listTermId: string;
  listLabel: string;
  support: boolean;
  blockNumber: number;
};

function arenaTriplesResponseToPortalStances(triples: any[]): ArenaGraphTripleStanceRow[] {
  const listPredLc = LIST_PREDICATE_ID.toLowerCase();
  const distLc = DISTRUST_ATOM_ID.toLowerCase();
  const rows: ArenaGraphTripleStanceRow[] = [];

  for (const t of triples || []) {
    const cid = normalize(t?.creator?.id || '');
    if (!cid) continue;

    const pred = normalize(t?.predicate?.term_id || '');
    const obj = normalize(t?.object?.term_id || '');
    const sub = t?.subject;
    if (!sub?.term_id) continue;

    const sImg = sub.image || sub.cached_image?.url;
    const bn =
      typeof t.block_number === 'number'
        ? t.block_number
        : typeof t.block_number === 'string'
          ? parseInt(t.block_number, 10) || 0
          : 0;

    if (pred === listPredLc) {
      const listTermId = t.object?.term_id || '';
      if (!listTermId) continue;
      rows.push({
        creatorId: cid,
        claimTermId: t.term_id,
        subjectId: sub.term_id,
        subjectLabel: resolveMetadata(sub).label || sub.label || sub.term_id.slice(0, 10),
        subjectImage: (resolveMetadata(sub).image || sImg) as string | undefined,
        listTermId,
        listLabel: resolveMetadata(t.object).label || t.object?.label || 'List',
        support: true,
        blockNumber: bn,
      });
      continue;
    }
    if (obj === distLc && t?.predicate?.term_id) {
      rows.push({
        creatorId: cid,
        claimTermId: t.term_id,
        subjectId: sub.term_id,
        subjectLabel: resolveMetadata(sub).label || sub.label || sub.term_id.slice(0, 10),
        subjectImage: (resolveMetadata(sub).image || sImg) as string | undefined,
        listTermId: t.predicate.term_id,
        listLabel: resolveMetadata(t.predicate).label || t.predicate.label || 'List',
        support: false,
        blockNumber: bn,
      });
    }
  }
  return rows;
}

export async function getListMemberSubjectsForObject(
  listObjectTermId: string,
  limit: number = 200
): Promise<Array<{ id: string; label: string; image?: string }>> {
  const ids = prepareQueryIds(listObjectTermId);
  if (ids.length === 0) return [];
  const q = `query ListMemberSubjects($ids: [String!]!, $pred: String!, $limit: Int!) {
    triples(
      where: { object_id: { _in: $ids }, predicate_id: { _eq: $pred } }
      order_by: { block_number: desc }
      limit: $limit
    ) {
      subject {
        term_id
        label
        image
        data
        type
        cached_image {
          url
          safe
        }
        value {
          person {
            name
            label
            image
            url
            cached_image {
              url
              safe
            }
          }
          thing {
            name
            label
            image
            url
            cached_image {
              url
              safe
            }
          }
          organization {
            name
            label
            image
            url
            cached_image {
              url
              safe
            }
          }
          account {
            id
            label
            image
            cached_image {
              url
              safe
            }
          }
        }
      }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { ids, pred: LIST_PREDICATE_ID, limit });
    const seen = new Set<string>();
    const out: Array<{ id: string; label: string; image?: string }> = [];
    for (const t of res?.triples || []) {
      const sub = t?.subject;
      if (!sub?.term_id) continue;
      const key = normalize(sub.term_id);
      if (seen.has(key)) continue;
      seen.add(key);
      const m = resolveMetadata(sub);
      out.push({
        id: sub.term_id,
        label: m.label || sub.label || sub.term_id.slice(0, 10),
        image: m.image,
      });
    }
    return out;
  } catch (e) {
    console.warn('[getListMemberSubjectsForObject]', e);
    return [];
  }
}

/**
 * Wallets that have an indexed YES membership triple on this portal list — used to discover Compare
 * peers beyond the global Arena XP leaderboard (popular lists often have many rankers who are not top‑XP globally).
 */
export async function fetchDistinctRankingCreatorsForPortalList(
  listObjectTermId: string,
  excludeWallet: string | undefined,
  maxCreators: number,
): Promise<string[]> {
  const ids = prepareQueryIds(listObjectTermId);
  if (!ids.length || maxCreators <= 0) return [];

  const exclude = new Set((excludeWallet ? prepareQueryIds(excludeWallet) : []).map((x) => normalize(x)));
  const operators = protocolOperatorCreatorIdsNormalized();

  const q = `query RankingCreatorsForList($ids: [String!]!, $pred: String!, $limit: Int!) {
    triples(
      where: { object_id: { _in: $ids }, predicate_id: { _eq: $pred } }
      order_by: { block_number: desc }
      limit: $limit
    ) {
      creator { id }
    }
  }`;

  const scanLimit = Math.min(Math.max(maxCreators * 45, 120), 720);

  try {
    const res = await fetchGraphQL(q, { ids, pred: LIST_PREDICATE_ID, limit: scanLimit });
    const out: string[] = [];
    const seen = new Set<string>();

    for (const t of res?.triples || []) {
      const raw = t?.creator?.id as string | undefined;
      if (!raw || !isAddress(raw)) continue;
      let chk: string;
      try {
        chk = getAddress(raw);
      } catch {
        continue;
      }
      const lc = normalize(chk);
      if (exclude.has(lc) || operators.has(lc)) continue;
      if (seen.has(lc)) continue;
      seen.add(lc);
      out.push(chk);
      if (out.length >= maxCreators) break;
    }
    return out;
  } catch (e) {
    console.warn('[fetchDistinctRankingCreatorsForPortalList]', e);
    return [];
  }
}

/**
 * Wallets that ranked this portal list through IntuRank FeeProxy/MultiVault (deposit `receiver`), derived from
 * vault → triple stance — fixes under-counting when `triple.creator` is the operator, not the human ranker.
 */
export async function fetchDistinctReceiversForPortalListFromProxyDeposits(
  listObjectTermId: string,
  excludeWallet: string | undefined,
  maxWallets: number,
): Promise<string[]> {
  const ids = prepareQueryIds(listObjectTermId.trim());
  if (!ids.length || maxWallets <= 0) return [];

  const exclude = new Set((excludeWallet ? prepareQueryIds(excludeWallet) : []).map((x) => normalize(x)));
  const operators = protocolOperatorCreatorIdsNormalized();
  const minBnLb = ARENA_ATTRIBUTION_MIN_BLOCK;

  const depLimit = Math.min(5200, Math.max(1800, maxWallets * 80));
  try {
    const deposits = await fetchProxyArenaRankDeposits(depLimit);
    if (!deposits.length) return [];

    const vaultIds = Array.from(new Set(deposits.map((d) => d.vaultTermId)));
    const stanceByVault = await fetchArenaVaultStanceMap(vaultIds);
    if (!stanceByVault.size) return [];

    const out: string[] = [];
    const seenRecv = new Set<string>();

    for (const dep of deposits) {
      const stance = stanceByVault.get(dep.vaultTermId);
      if (!stance) continue;
      if (minBnLb != null && stance.stance.blockNumber > 0 && stance.stance.blockNumber < minBnLb) continue;
      if (!portalListStanceMatchesListObject(stance.stance.listTermId, listObjectTermId)) continue;

      let recv: string;
      try {
        recv = getAddress(dep.receiverId as `0x${string}`);
      } catch {
        continue;
      }
      const lc = recv.toLowerCase();
      if (exclude.has(lc) || operators.has(lc)) continue;
      if (seenRecv.has(lc)) continue;
      seenRecv.add(lc);
      out.push(recv);
      if (out.length >= maxWallets) break;
    }
    return out;
  } catch (e) {
    console.warn('[fetchDistinctReceiversForPortalListFromProxyDeposits]', e);
    return [];
  }
}

/**
 * Approximate distinct rankers on one portal list: merges deposit receivers + LIST_PREDICATE triple creators (legacy/direct).
 */
export async function fetchApproxDistinctPortalListRankerCount(
  listObjectTermId: string,
  excludeWallet?: string | null,
): Promise<number> {
  const ex = excludeWallet?.trim();
  const [fromDeposits, fromTriples] = await Promise.all([
    fetchDistinctReceiversForPortalListFromProxyDeposits(listObjectTermId, ex || undefined, 2400),
    fetchDistinctRankingCreatorsForPortalList(listObjectTermId, ex || undefined, 2400),
  ]);
  const s = new Set<string>();
  for (const w of fromDeposits) {
    try {
      s.add(getAddress(w as `0x${string}`).toLowerCase());
    } catch {
      /* skip */
    }
  }
  for (const w of fromTriples) {
    try {
      s.add(getAddress(w as `0x${string}`).toLowerCase());
    } catch {
      /* skip */
    }
  }
  return s.size;
}

/**
 * Canonical vault triple id for “subject belongs on list” (LIST_PREDICATE → list object).
 * Portal Arena members are sourced from this triple; staking YES must deposit here, not createTriples again.
 */
export async function getListMembershipTripleTermId(
  memberSubjectTermId: string,
  listObjectTermId: string
): Promise<string | null> {
  const subs = prepareQueryIds(memberSubjectTermId);
  const objs = prepareQueryIds(listObjectTermId);
  if (!subs.length || !objs.length) return null;
  const q = `query ListMembershipTriple($subs: [String!]!, $pred: String!, $objs: [String!]!) {
    triples(
      where: {
        subject_id: { _in: $subs }
        predicate_id: { _eq: $pred }
        object_id: { _in: $objs }
      }
      limit: 1
    ) {
      term_id
    }
  }`;
  try {
    const res = await fetchGraphQL(q, {
      subs,
      pred: LIST_PREDICATE_ID,
      objs,
    });
    const tid = res?.triples?.[0]?.term_id;
    return typeof tid === 'string' && tid.trim() ? tid.trim() : null;
  } catch (e) {
    console.warn('[getListMembershipTripleTermId]', e);
    return null;
  }
}

/**
 * Vault triple id for “subject rejects list” shape indexed as (subject, predicate=list term, object=distrust).
 * When present, NO should deposit here instead of createTriples (avoids TripleExists revert).
 */
export async function getListNegativeStanceTripleTermId(
  memberSubjectTermId: string,
  listObjectTermId: string
): Promise<string | null> {
  const subs = prepareQueryIds(memberSubjectTermId);
  const preds = prepareQueryIds(listObjectTermId);
  const objs = prepareQueryIds(DISTRUST_ATOM_ID);
  if (!subs.length || !preds.length || !objs.length) return null;
  const q = `query ListNegativeTriple($subs: [String!]!, $preds: [String!]!, $objs: [String!]!) {
    triples(
      where: {
        subject_id: { _in: $subs }
        predicate_id: { _in: $preds }
        object_id: { _in: $objs }
      }
      limit: 1
    ) {
      term_id
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { subs, preds, objs });
    const tid = res?.triples?.[0]?.term_id;
    return typeof tid === 'string' && tid.trim() ? tid.trim() : null;
  } catch (e) {
    console.warn('[getListNegativeStanceTripleTermId]', e);
    return null;
  }
}

/** One portal-list stance row after resolving FeeProxy vault → triple (YES vs NO vault side). */
export type UserArenaRankingClaim = {
  claimTermId: string;
  subjectId: string;
  subjectLabel: string;
  subjectImage?: string;
  listTermId: string;
  listLabel: string;
  support: boolean;
  blockNumber: number;
};

/**
 * Compare / XP fallback: full portal allowlist (extras ∪ indexer lists). Same FeeProxy receiver attribution as Portfolio.
 */
export async function fetchUserArenaRankingClaims(wallet: string): Promise<UserArenaRankingClaim[]> {
  try {
    const allow = await getArenaPortalRankingAllowlist();
    return fetchUserArenaRankingClaimsWithAllowlist(wallet, allow);
  } catch (e) {
    console.warn('[fetchUserArenaRankingClaims]', e);
    return [];
  }
}

/**
 * Portfolio only: ranks on portal lists this browser has explicitly surfaced in Arena (`registerArenaPortalListTermsForIndexing`),
 * **not** every portal list from the indexer — avoids stale “noise” rows while you rebuild testers’ flows.
 */
export async function fetchPortfolioArenaRankingClaims(wallet: string): Promise<UserArenaRankingClaim[]> {
  ensureArenaRankingAllowlistExtrasHydrated();
  const allow = new Set(arenaRankingAllowlistExtras);
  return fetchUserArenaRankingClaimsWithAllowlist(wallet, allow);
}

async function fetchUserArenaRankingClaimsWithAllowlist(
  wallet: string,
  allow: Set<string>,
): Promise<UserArenaRankingClaim[]> {
  const recvVariants = prepareQueryIds(wallet.trim());
  if (!recvVariants.length) return [];
  const recvSet = new Set(recvVariants.map(normalize));

  try {
    if (allow.size === 0) return [];

    const operatorCreators = protocolOperatorCreatorIdsNormalized();
    const minBnLb = ARENA_ATTRIBUTION_MIN_BLOCK;

    const depositsAll = await fetchProxyArenaRankDeposits(4200);
    const userDeps = depositsAll.filter((d) => {
      const recvLc = normalize(d.receiverId);
      return recvLc && recvSet.has(recvLc) && !operatorCreators.has(recvLc);
    });
    if (userDeps.length === 0) return [];

    const vaultIds = Array.from(new Set(userDeps.map((d) => d.vaultTermId)));
    const stanceByVault = await fetchArenaVaultStanceMap(vaultIds);
    if (stanceByVault.size === 0) return [];

    const seenWalletStake = new Set<string>();
    const rawStakes: ArenaGraphTripleStanceRow[] = [];

    for (const dep of userDeps) {
      const stance = stanceByVault.get(dep.vaultTermId);
      if (!stance) continue;
      if (minBnLb != null && stance.stance.blockNumber > 0 && stance.stance.blockNumber < minBnLb) continue;
      if (!arenaListIdMatchesAllowlist(allow, stance.stance.listTermId)) continue;

      const recvLc = normalize(dep.receiverId);
      const stakeKey = `${recvLc}:${dep.vaultTermId}:${stance.support ? 'y' : 'n'}`;
      if (seenWalletStake.has(stakeKey)) continue;
      seenWalletStake.add(stakeKey);

      rawStakes.push({ ...stance.stance, creatorId: recvLc, support: stance.support });
    }

    const bySlot = new Map<string, UserArenaRankingClaim>();
    for (const s of rawStakes) {
      const slotKey = arenaRankSlotKey(s.listTermId, s.subjectId);
      if (!slotKey) continue;
      const prev = bySlot.get(slotKey);
      const row: UserArenaRankingClaim = {
        claimTermId: s.claimTermId,
        subjectId: s.subjectId,
        subjectLabel: s.subjectLabel,
        subjectImage: s.subjectImage,
        listTermId: s.listTermId,
        listLabel: s.listLabel,
        support: s.support,
        blockNumber: s.blockNumber,
      };
      if (!prev || row.blockNumber >= prev.blockNumber) bySlot.set(slotKey, row);
    }

    return Array.from(bySlot.values()).sort((a, b) => b.blockNumber - a.blockNumber);
  } catch (e) {
    console.warn('[fetchUserArenaRankingClaimsWithAllowlist]', e);
    return [];
  }
}

/** XP derived from FeeProxy-routed ranks (same aggregation as the live leaderboard). */
export async function fetchArenaXpRecordForWallet(address: string | null | undefined): Promise<ArenaXpRecord> {
  const raw = (address ?? '').trim();
  if (!raw) return emptyArenaXpRecord();

  try {
    const rows = await fetchArenaLeaderboardXpRowsFromGraph(4200);
    const hit = rows.find((r) => normalize(r.address) === normalize(raw));
    if (hit && hit.xp > 0) {
      return {
        xp: hit.xp,
        duels: hit.duels,
        atomsRanked: hit.atomsRanked,
        listsPlayed: hit.listsPlayed,
        updatedAt: hit.updatedAt,
      };
    }
  } catch {
    /* fall back below */
  }

  const claims = await fetchUserArenaRankingClaims(raw);
  if (claims.length === 0) return emptyArenaXpRecord();
  const listsPlayed = new Set(claims.map((c) => normalize(c.listTermId))).size;
  const atomsRanked = new Set(claims.map((c) => normalize(c.subjectId))).size;
  const n = claims.length;
  const lastBlock = claims.reduce((m, c) => Math.max(m, c.blockNumber), 0);
  return {
    xp: n * ARENA_XP_PER_RANK_PICK,
    duels: n,
    atomsRanked,
    listsPlayed,
    updatedAt: lastBlock || 0,
  };
}

/** Bounded scan of recent portal-list stakes; leaderboard is approximate vs full chain history. */
export async function fetchArenaLeaderboardXpRowsFromGraph(maxTriples = 4200): Promise<
  Array<{
    address: string;
    xp: number;
    duels: number;
    atomsRanked: number;
    listsPlayed: number;
    updatedAt: number;
  }>
> {
  /**
   * "Ranked through IntuRank" = a deposit whose `sender` is our FeeProxy/MultiVault contract.
   * We aggregate those deposits by receiver (the actual ranker) and join each deposit's vault
   * onto the corresponding triple (member or counter) so we can derive listsPlayed / atomsRanked
   * for the leaderboard. Direct stakes from other apps using portals are excluded.
   */
  const operatorCreators = protocolOperatorCreatorIdsNormalized();
  const minBnLb = ARENA_ATTRIBUTION_MIN_BLOCK;

  try {
    const allow = await getArenaPortalRankingAllowlist();
    const deposits = await fetchProxyArenaRankDeposits(Math.max(maxTriples, 1500));
    if (deposits.length === 0) return [];

    const vaultIds = Array.from(new Set(deposits.map((d) => d.vaultTermId)));
    const stanceByVault = await fetchArenaVaultStanceMap(vaultIds);
    if (stanceByVault.size === 0) return [];

    /**
     * Collapse stakes to **one slot per (list, subject)** — same rule as `fetchUserArenaRankingClaims`
     * (latest block wins). Without this, the same rank can appear twice when balances moved across
     * the member vault vs counter vault, multiple curve vaults, or YES→NO history — inflating Arena
     * XP on the leaderboard (e.g. 425 vs 175) while the profile shows the deduped total.
     *
     * Only counts stakes on **portal lists IntuRank surfaces** (`getArenaPortalRankingAllowlist`), so
     * unrelated FeeProxy activity does not inflate Arena XP.
     */
    const byWallet = new Map<string, ArenaGraphTripleStanceRow[]>();

    const seenWalletStake = new Set<string>();
    for (const dep of deposits) {
      const stance = stanceByVault.get(dep.vaultTermId);
      if (!stance) continue;
      if (minBnLb != null && stance.stance.blockNumber > 0 && stance.stance.blockNumber < minBnLb) continue;
      if (!arenaListIdMatchesAllowlist(allow, stance.stance.listTermId)) continue;

      const recvLc = normalize(dep.receiverId);
      if (!recvLc || operatorCreators.has(recvLc)) continue;

      const stakeKey = `${recvLc}:${dep.vaultTermId}:${stance.support ? 'y' : 'n'}`;
      if (seenWalletStake.has(stakeKey)) continue;
      seenWalletStake.add(stakeKey);

      let arr = byWallet.get(recvLc);
      if (!arr) {
        arr = [];
        byWallet.set(recvLc, arr);
      }
      arr.push({ ...stance.stance, creatorId: recvLc, support: stance.support });
    }

    const out: Array<{
      address: string;
      xp: number;
      duels: number;
      atomsRanked: number;
      listsPlayed: number;
      updatedAt: number;
    }> = [];

    for (const [walletAddr, rawStakes] of byWallet.entries()) {
      const bySlot = new Map<string, ArenaGraphTripleStanceRow>();
      for (const s of rawStakes) {
        const slotKey = arenaRankSlotKey(s.listTermId, s.subjectId);
        if (!slotKey) continue;
        const prev = bySlot.get(slotKey);
        if (!prev || s.blockNumber >= prev.blockNumber) bySlot.set(slotKey, s);
      }
      const stakes = Array.from(bySlot.values());
      const n = stakes.length;
      if (n === 0) continue;
      const listsPlayed = new Set(
        stakes.map((s) => arenaRankSlotKey(s.listTermId, s.subjectId)!.split(':')[0]),
      ).size;
      const distinctSubjects = new Set(
        stakes.map((s) => arenaRankSlotKey(s.listTermId, s.subjectId)!.split(':')[1]),
      ).size;
      const maxBn = stakes.reduce((m, s) => Math.max(m, s.blockNumber || 0), 0);
      out.push({
        address: walletAddr,
        xp: n * ARENA_XP_PER_RANK_PICK,
        duels: n,
        atomsRanked: distinctSubjects,
        listsPlayed,
        updatedAt: maxBn || 0,
      });
    }
    out.sort((a, b) => b.xp - a.xp);
    return out;
  } catch (e) {
    console.warn('[fetchArenaLeaderboardXpRowsFromGraph]', e);
    return [];
  }
}

/** One ranking event from Intuition index (portal list YES / NO vault semantics). */
export type ArenaPortalRankingFeedItem = {
  claimTermId: string;
  creatorId: string;
  creatorLabel: string;
  subjectLabel: string;
  listTermId: string;
  listLabel: string;
  support: boolean;
  blockNumber: number;
  /** Intuition deposit tx when rank flowed through FeeProxy (for local XP lookup). */
  transactionHash?: string;
};

function arenaFeedCreatorLabel(triple: any, creatorId: string): string {
  const raw = typeof triple?.creator?.label === 'string' ? triple.creator.label.trim() : '';
  if (raw && raw !== '0x' && !/^0x[0-9a-fA-F]{40}$/.test(raw)) return raw;
  const id = creatorId.trim();
  if (id.length >= 12) return `${id.slice(0, 6)}…${id.slice(-4)}`;
  return id || 'Unknown';
}

/** Triple rows created via FeeProxy/MultiVault index `creator` as the operator, not the user wallet. */
function protocolOperatorCreatorIdsNormalized(): Set<string> {
  const s = new Set<string>();
  for (const a of [FEE_PROXY_ADDRESS, MULTI_VAULT_ADDRESS]) {
    for (const v of prepareQueryIds(a)) s.add(normalize(v));
  }
  return s;
}

type ArenaProxyDepositRow = {
  vaultTermId: string;
  receiverId: string;
  receiverLabel?: string;
  receiverImage?: string;
  createdAt: number;
  transactionHash?: string;
};

/**
 * Recent deposits routed through IntuRank's FeeProxy/MultiVault — the canonical "ranked through IntuRank" signal.
 * `sender_id` on the deposit row pins us as the originator regardless of when/who first created the triple.
 */
async function fetchProxyArenaRankDeposits(limit = 800): Promise<ArenaProxyDepositRow[]> {
  const proxyIds = Array.from(
    new Set([FEE_PROXY_ADDRESS, MULTI_VAULT_ADDRESS].flatMap((a) => prepareQueryIds(a))),
  );
  const q = `query ArenaProxyDeposits($proxyIds: [String!]!, $limit: Int!) {
    deposits(
      where: { sender_id: { _in: $proxyIds } }
      order_by: { created_at: desc }
      limit: $limit
    ) {
      created_at
      transaction_hash
      receiver { id label image }
      vault { term_id }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { proxyIds, limit });
    const out: ArenaProxyDepositRow[] = [];
    for (const d of res?.deposits ?? []) {
      const tid = d?.vault?.term_id ? normalize(d.vault.term_id) : '';
      const recv = d?.receiver?.id ? String(d.receiver.id) : '';
      if (!tid || !recv) continue;
      const createdAt = (() => {
        const v = d?.created_at;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') return parseInt(v, 10) || 0;
        return 0;
      })();
      out.push({
        vaultTermId: tid,
        receiverId: recv,
        receiverLabel: d?.receiver?.label || undefined,
        receiverImage: d?.receiver?.image || undefined,
        createdAt,
        transactionHash: d?.transaction_hash || undefined,
      });
    }
    return out;
  } catch (e) {
    console.warn('[fetchProxyArenaRankDeposits]', e);
    return [];
  }
}

type ArenaVaultStance = {
  stance: ArenaGraphTripleStanceRow;
  /** True when the deposit hit the membership triple vault (YES); false for counter-triple (NO). */
  support: boolean;
};

/**
 * Map vault term-id → triple stance for ANY triple a FeeProxy deposit landed on. We deliberately
 * accept all predicates because IntuRank's legacy / portal / batch paths all produce different
 * predicate atoms (canonical `LIST_PREDICATE`, custom `belongs in <list>`, freeform claims, etc.) —
 * the deposit's `sender = FeeProxy` is what proves it was an IntuRank rank, so the explorer should
 * surface every one regardless of predicate shape. We still surface YES (member) and NO (counter)
 * vault sides distinctly.
 */
async function fetchArenaVaultStanceMap(
  vaultTermIds: string[],
): Promise<Map<string, ArenaVaultStance>> {
  const ids = Array.from(new Set(vaultTermIds.flatMap((id) => prepareQueryIds(id).map(normalize)))).slice(0, 480);
  if (ids.length === 0) return new Map();
  const idSet = new Set(ids);
  const q = `query ArenaVaultTriples($ids: [String!]!) {
    triples(
      where: { _or: [{ term_id: { _in: $ids } }, { counter_term_id: { _in: $ids } }] }
      limit: 1000
    ) {
      term_id
      counter_term_id
      block_number
      creator { id label }
      subject { term_id label image }
      predicate { term_id label }
      object { term_id label image }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { ids });
    const triples = res?.triples ?? [];
    const distLc = DISTRUST_ATOM_ID.toLowerCase();
    const map = new Map<string, ArenaVaultStance>();
    for (const t of triples) {
      const sub = t?.subject;
      const obj = t?.object;
      const pred = t?.predicate;
      if (!sub?.term_id) continue;
      // Pull a sentence-friendly stance row regardless of predicate shape.
      const subjectLabel =
        resolveMetadata(sub).label || sub.label || String(sub.term_id).slice(0, 10);
      const subjectImage = resolveMetadata(sub).image || sub.image || sub.cached_image?.url;
      // Prefer the object atom as the "list / context"; fall back to predicate label when the
      // triple is shaped like (subject, "is", listLabel) without a list-style object.
      const isDistrustObj = normalize(obj?.term_id || '') === distLc;
      const listAtom = isDistrustObj ? pred : obj;
      const listTermId = listAtom?.term_id || obj?.term_id || '';
      const listLabel =
        resolveMetadata(listAtom).label || listAtom?.label || obj?.label || pred?.label || 'Claim';
      const bn = (() => {
        const v = t?.block_number;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') return parseInt(v, 10) || 0;
        return 0;
      })();

      const memberTid = normalize(t.term_id || '');
      const counterTid = normalize(t.counter_term_id || '');

      const baseStance: ArenaGraphTripleStanceRow = {
        creatorId: normalize(t?.creator?.id || ''),
        claimTermId: t.term_id,
        subjectId: sub.term_id,
        subjectLabel,
        subjectImage: subjectImage as string | undefined,
        listTermId,
        listLabel,
        support: true,
        blockNumber: bn,
      };

      if (memberTid && idSet.has(memberTid)) {
        map.set(memberTid, { stance: { ...baseStance, support: true }, support: true });
      }
      if (counterTid && idSet.has(counterTid)) {
        map.set(counterTid, { stance: { ...baseStance, support: false }, support: false });
      }
    }
    return map;
  } catch (e) {
    console.warn('[fetchArenaVaultStanceMap]', e);
    return new Map();
  }
}

/**
 * Recent Arena rankings done **through IntuRank** — anchored to deposits where our FeeProxy is the
 * `sender`, then mapped onto either the membership triple (YES) or its counter-triple (NO) for the
 * Arena allowlisted lists. Receiver is the actual ranker; their label / TNS resolves client-side.
 *
 * @param opts.onlyCreators "My rankings" filter — narrow to a single wallet (still requires the
 *   deposit to have flowed through IntuRank's FeeProxy).
 */
export async function fetchRecentArenaPortalRankingFeed(
  limit = 28,
  opts?: { onlyCreators?: string[] },
): Promise<ArenaPortalRankingFeedItem[]> {
  let viewerAllow: Set<string> | null = null;
  const rawCreators = opts?.onlyCreators?.map((c) => c.trim()).filter(Boolean) ?? [];
  if (rawCreators.length > 0) {
    const variants = rawCreators.flatMap((w) => prepareQueryIds(w));
    viewerAllow = new Set(variants.map((v) => normalize(v)));
  }

  const minBn = ARENA_ATTRIBUTION_MIN_BLOCK;
  const operatorCreators = protocolOperatorCreatorIdsNormalized();

  const deposits = await fetchProxyArenaRankDeposits(Math.max(limit * 12, 600));
  if (deposits.length === 0) return [];

  const vaultIds = Array.from(new Set(deposits.map((d) => d.vaultTermId)));
  const stanceByVault = await fetchArenaVaultStanceMap(vaultIds);
  if (stanceByVault.size === 0) return [];

  const out: ArenaPortalRankingFeedItem[] = [];
  const seen = new Set<string>();
  for (const dep of deposits) {
    const stance = stanceByVault.get(dep.vaultTermId);
    if (!stance) continue;
    if (minBn != null && stance.stance.blockNumber > 0 && stance.stance.blockNumber < minBn) continue;

    const recvLc = normalize(dep.receiverId);
    if (operatorCreators.has(recvLc)) continue;
    if (viewerAllow && !viewerAllow.has(recvLc)) continue;

    const key = `${dep.vaultTermId}|${recvLc}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let receiverDisplayId = dep.receiverId;
    try {
      receiverDisplayId = getAddress(dep.receiverId as `0x${string}`);
    } catch {
      /* leave as-is for non-checksum identifiers */
    }
    const cleanedLabel = dep.receiverLabel?.trim();
    const fallbackShort = receiverDisplayId.length >= 12
      ? `${receiverDisplayId.slice(0, 6)}…${receiverDisplayId.slice(-4)}`
      : receiverDisplayId;
    const label = cleanedLabel && cleanedLabel.length > 0 && cleanedLabel.length <= 64
      ? cleanedLabel
      : fallbackShort;

    out.push({
      claimTermId: stance.stance.claimTermId,
      creatorId: receiverDisplayId,
      creatorLabel: label,
      subjectLabel: stance.stance.subjectLabel,
      listTermId: stance.stance.listTermId,
      listLabel: stance.stance.listLabel,
      support: stance.support,
      blockNumber: stance.stance.blockNumber || dep.createdAt,
      transactionHash: dep.transactionHash?.startsWith('0x') ? dep.transactionHash : undefined,
    });

    if (out.length >= limit) break;
  }

  return out;
}

/** Prefer ENS / account name; avoid showing subgraph hex snippets or duplicate address as "label". */
function pickDisplayLabel(
  label: string | undefined,
  resolvedUser: string | undefined
): string | undefined {
  const lab = label?.trim();
  if (!lab || lab === '0x') return undefined;
  // Truncated address chips from indexers (e.g. 0xab…cd12)
  if (lab.includes('\u2026') || lab.includes('...')) return undefined;
  const lower = lab.toLowerCase();
  if (lower.startsWith('0x00') && lab.length >= 10) return undefined;
  if (resolvedUser && /^0x[0-9a-f]{40}$/i.test(lab)) {
    try {
      if (getAddress(lab as `0x${string}`).toLowerCase() === resolvedUser.toLowerCase()) return undefined;
    } catch {
      /* ignore */
    }
  }
  if (resolvedUser && /^0x[0-9a-f]+$/i.test(lab)) {
    try {
      const asAddr =
        lab.length === 42 && isAddress(lab)
          ? getAddress(lab as `0x${string}`)
          : lab.length === 66 && lab.startsWith('0x')
            ? getAddress(('0x' + lab.slice(26)) as `0x${string}`)
            : null;
      if (asAddr && asAddr.toLowerCase() === resolvedUser.toLowerCase()) return undefined;
    } catch {
      /* keep label if parse fails */
    }
  }
  return lab;
}

function resolveActivityUserFields(ev: any): { user?: string; userLabel?: string } {
  const dep = ev?.type === 'Deposited' ? ev?.deposit : ev?.redemption;
  const actor = resolveProxyActivityAccount(dep);
  if (!actor?.id) return {};
  const raw = String(actor.id);
  let user: string | undefined;
  try {
    if (isAddress(raw)) user = getAddress(raw);
    else if (raw.length === 66 && raw.startsWith('0x')) {
      const tail = ('0x' + raw.slice(26)) as `0x${string}`;
      if (isAddress(tail)) user = getAddress(tail);
    }
  } catch {
    /* ignore */
  }
  if (!user && raw.startsWith('0x') && raw.length >= 42) {
    try {
      user = getAddress(raw.slice(0, 42) as `0x${string}`);
    } catch {
      /* ignore */
    }
  }
  const userLabel = pickDisplayLabel(actor.label, user);
  return { user, userLabel };
}

export const getMarketActivity = async (termId: string): Promise<Transaction[]> => {
  const ids = prepareQueryIds(termId);
  const q = `query GetMarketActivity($ids: [String!]!) {
      events(where: { _or: [{ atom: { term_id: { _in: $ids } } }, { triple: { term_id: { _in: $ids } } }], _and: [{ type: { _in: ["Deposited", "Redeemed"] } }] }, order_by: { created_at: desc }, limit: 50) {
        transaction_hash created_at type
        deposit { shares assets_after_fees sender { id label } receiver { id label } }
        redemption { shares assets sender { id label } receiver { id label } }
      }
  }`;
  try {
    const data = await fetchGraphQL(q, { ids });
    return (data?.events || []).map((ev: any) => {
      const { user, userLabel } = resolveActivityUserFields(ev);
      return {
        id: ev.transaction_hash,
        type: ev.type === 'Deposited' ? 'DEPOSIT' : 'REDEEM',
        shares: (ev.deposit?.shares || ev.redemption?.shares || '0').toString(),
        assets: (ev.deposit?.assets_after_fees || ev.redemption?.assets || '0').toString(),
        timestamp: new Date(ev.created_at).getTime(),
        vaultId: termId,
        user,
        userLabel,
      };
    });
  } catch (e) {
    return [];
  }
};

/** Count redemption (exit/sell) events for a vault — for comparison "sellers" metric. */
export const getRedemptionCountForVault = async (termId: string): Promise<number> => {
  const ids = prepareQueryIds(termId);
  const q = `query GetRedemptionCount($ids: [String!]!) {
    events_aggregate(
      where: {
        _and: [
          { type: { _eq: "Redeemed" } },
          { _or: [{ atom: { term_id: { _in: $ids } } }, { triple: { term_id: { _in: $ids } } }] }
        ]
      }
    ) { aggregate { count } }
  }`;
  try {
    const data = await fetchGraphQL(q, { ids });
    return data?.events_aggregate?.aggregate?.count ?? 0;
  } catch (e) { return 0; }
};

/** Activity on markets the user holds — other users buying/selling in those claims. For notification bar. */
export interface PositionActivityNotification {
  id: string;
  type: 'acquired' | 'liquidated';
  senderLabel: string;
  senderId: string;
  marketLabel: string;
  vaultId: string;
  timestamp: number;
  txHash?: string;
  /** Shares in wei (raw) */
  shares?: string;
  /** Assets/value in wei (raw) — ₸ amount for deposit, proceeds for redeem */
  assets?: string;
  /** Curve used: 1 = Linear, 2 = Offset Progressive (exponential) */
  curveId?: number | string;
}

/** Human-readable curve label for UI / notifications. */
export function getCurveLabel(curveId: number | string | undefined): string {
  if (curveId === undefined || curveId === null) return 'Linear';
  const id = typeof curveId === 'string' ? parseInt(curveId, 10) : curveId;
  // Protocol semantics: curve_id 1 = Linear, 2 = Offset Progressive
  if (id === 1) return 'Linear';
  if (id === 2) return 'Progressive';
  return 'Linear';
}

export const getActivityOnMyMarkets = async (
  userAddress: string,
  vaultIds: string[],
  limit: number = 30,
  options?: { onlyIntuRankRouted?: boolean },
): Promise<PositionActivityNotification[]> => {
  if (!vaultIds.length) return [];
  const ids = Array.from(new Set(vaultIds.map(normalize).filter(Boolean)));
  if (!ids.length) return [];
  const userAddr = userAddress.toLowerCase();
  const proxyIds = options?.onlyIntuRankRouted ? feeProxyRoutedSenderGraphIds() : null;
  const proxyFilter = proxyIds?.length
    ? `,
          { _or: [
            { deposit: { sender_id: { _in: $proxyIds } } },
            { redemption: { sender_id: { _in: $proxyIds } } }
          ] }`
    : '';
  // Fetch activity on both Linear and Offset Progressive (exponential) curves — filter by term_id only so all curve types are included
  const q = `query GetActivityOnMyMarkets($ids: [String!]!, $limit: Int!${proxyIds ? ', $proxyIds: [String!]!' : ''}) {
    events(
      where: {
        _and: [
          { type: { _in: ["Deposited", "Redeemed"] } },
          { _or: [{ atom: { term_id: { _in: $ids } } }, { triple: { term_id: { _in: $ids } } }] }
          ${proxyFilter}
        ]
      },
      order_by: { created_at: desc },
      limit: $limit
    ) {
      id created_at type transaction_hash
      atom { term_id label data image type }
      triple { term_id subject { label term_id data image type } predicate { label } object { label term_id data image type } }
      deposit { shares assets_after_fees sender { id label image } receiver { id label image } vault { term_id curve_id } }
      redemption { shares assets sender { id label image } receiver { id label image } vault { term_id curve_id } }
    }
  }`;
  try {
    const vars: Record<string, unknown> = { ids, limit };
    if (proxyIds?.length) vars.proxyIds = proxyIds;
    const data = await fetchGraphQL(q, vars);
    const rawEvents = data?.events ?? [];
    // Dedupe by event id so the same activity never appears or triggers email twice
    const seenEventIds = new Set<string>();
    const events = rawEvents.filter((ev: any) => {
      const eid = ev?.id ?? ev?.transaction_hash;
      if (!eid || seenEventIds.has(eid)) return false;
      seenEventIds.add(eid);
      return true;
    });
    const out: PositionActivityNotification[] = [];
    for (const ev of events) {
      const dep = ev.deposit || ev.redemption;
      const sender = resolveProxyActivityAccount(dep);
      if (!sender || normalize(sender.id) === userAddr) continue;
      let label = 'Unknown';
      const vaultId = ev.atom?.term_id || ev.triple?.term_id || '';
      if (ev.atom) {
        const meta = resolveMetadata(ev.atom);
        label = meta.label;
      } else if (ev.triple) {
        const sMeta = resolveMetadata(ev.triple.subject);
        const oMeta = resolveMetadata(ev.triple.object);
        label = `${sMeta.label} ${ev.triple.predicate?.label || 'LINK'} ${oMeta.label}`;
      }
      const senderIdNorm = normalize(sender.id);
      const isProxy = senderIdNorm === normalize(FEE_PROXY_ADDRESS) || senderIdNorm === normalize(MULTI_VAULT_ADDRESS);
      const senderLabel = (sender.label && sender.label !== '0x' && !sender.label.startsWith('0x00'))
        ? sender.label
        : isProxy
          ? 'IntuRank routing contract'
          : `${sender.id.slice(0, 6)}...${sender.id.slice(-4)}`;
      const vault = ev.deposit?.vault || ev.redemption?.vault;
      const curveId = vault?.curve_id != null ? (typeof vault.curve_id === 'string' ? parseInt(vault.curve_id, 10) : vault.curve_id) : undefined;
      // Use event id so one event = one notification; tx_hash alone can repeat for multiple events in same tx
      const notificationId = ev.id ? `${ev.id}` : (ev.transaction_hash || `ev-${vaultId}-${ev.created_at}`);
      out.push({
        id: notificationId,
        type: ev.type === 'Redeemed' ? 'liquidated' : 'acquired',
        senderLabel,
        senderId: sender.id,
        marketLabel: label,
        vaultId,
        timestamp: new Date(ev.created_at).getTime(),
        txHash: ev.transaction_hash,
        shares: (ev.deposit?.shares || ev.redemption?.shares || '0')?.toString(),
        assets: (ev.deposit?.assets_after_fees || ev.redemption?.assets || '0')?.toString(),
        curveId,
      });
    }
    return out;
  } catch (e) {
    return [];
  }
};

/**
 * Activity (deposits/redemptions) by a list of account identities — for "follow" feed and email alerts.
 * Matches both sender AND receiver: when users trade through the proxy, deposit.sender=proxy but deposit.receiver=user.
 */
export const getActivityBySenderIds = async (
  senderIds: string[],
  limit: number = 40,
  options?: { onlyIntuRankRouted?: boolean },
): Promise<PositionActivityNotification[]> => {
  if (!senderIds?.length) return [];
  const ids = Array.from(new Set(senderIds.flatMap((s) => prepareQueryIds(s)).filter(Boolean)));
  if (!ids.length) return [];
  const proxyIds = options?.onlyIntuRankRouted ? feeProxyRoutedSenderGraphIds() : null;
  const proxyFilter = proxyIds?.length
    ? `,
          { _or: [
            { deposit: { sender_id: { _in: $proxyIds } } },
            { redemption: { sender_id: { _in: $proxyIds } } }
          ] }`
    : '';
  const q = `query GetActivityBySenders($ids: [String!]!, $limit: Int!${proxyIds ? ', $proxyIds: [String!]!' : ''}) {
    events(
      where: {
        _and: [
          { type: { _in: ["Deposited", "Redeemed"] } },
          { _or: [
            { deposit: { _or: [{ sender_id: { _in: $ids } }, { receiver_id: { _in: $ids } }] } },
            { redemption: { _or: [{ sender_id: { _in: $ids } }, { receiver_id: { _in: $ids } }] } }
          ] }
          ${proxyFilter}
        ]
      },
      order_by: { created_at: desc },
      limit: $limit
    ) {
      id created_at type transaction_hash
      atom { term_id label data image type }
      triple { term_id subject { label term_id data image type } predicate { label } object { label term_id data image type } }
      deposit { shares assets_after_fees sender { id label image } receiver { id label image } vault { term_id curve_id } }
      redemption { shares assets sender { id label image } receiver { id label image } vault { term_id curve_id } }
    }
  }`;
  try {
    const vars: Record<string, unknown> = { ids, limit };
    if (proxyIds?.length) vars.proxyIds = proxyIds;
    const data = await fetchGraphQL(q, vars);
    const rawEvents = data?.events ?? [];
    const seenEventIds = new Set<string>();
    const events = rawEvents.filter((ev: any) => {
      const eid = ev?.id ?? ev?.transaction_hash;
      if (!eid || seenEventIds.has(eid)) return false;
      seenEventIds.add(eid);
      return true;
    });
    const idsSet = new Set(ids.map((i) => i.toLowerCase()));
    const out: PositionActivityNotification[] = [];
    for (const ev of events) {
      const deposit = ev.deposit;
      const redemption = ev.redemption;
      const sender = deposit?.sender || redemption?.sender;
      const receiver = deposit?.receiver || redemption?.receiver;
      const senderIdNorm = sender ? normalize(sender.id) : '';
      const receiverIdNorm = receiver ? normalize(receiver.id) : '';
      const isSenderProxy = senderIdNorm === normalize(FEE_PROXY_ADDRESS) || senderIdNorm === normalize(MULTI_VAULT_ADDRESS);
      const isSenderInFollowList = idsSet.has(senderIdNorm);
      const isReceiverInFollowList = receiverIdNorm && idsSet.has(receiverIdNorm);
      const accountToShow =
        isReceiverInFollowList && isSenderProxy ? receiver
        : isSenderInFollowList && !isSenderProxy ? sender
        : isReceiverInFollowList ? receiver
        : isSenderInFollowList ? sender
        : null;
      if (!accountToShow) continue;
      let label = 'Unknown';
      const vaultId = ev.atom?.term_id || ev.triple?.term_id || '';
      if (ev.atom) {
        const meta = resolveMetadata(ev.atom);
        label = meta.label;
      } else if (ev.triple) {
        const sMeta = resolveMetadata(ev.triple.subject);
        const oMeta = resolveMetadata(ev.triple.object);
        label = `${sMeta.label} ${ev.triple.predicate?.label || 'LINK'} ${oMeta.label}`;
      }
      const accountIdNorm = normalize(accountToShow.id);
      const isProxy = accountIdNorm === normalize(FEE_PROXY_ADDRESS) || accountIdNorm === normalize(MULTI_VAULT_ADDRESS);
      const senderLabel = (accountToShow.label && accountToShow.label !== '0x' && !accountToShow.label.startsWith('0x00'))
        ? accountToShow.label
        : isProxy
          ? 'IntuRank routing contract'
          : `${accountToShow.id.slice(0, 6)}...${accountToShow.id.slice(-4)}`;
      const vault = ev.deposit?.vault || ev.redemption?.vault;
      const curveId = vault?.curve_id != null ? (typeof vault.curve_id === 'string' ? parseInt(vault.curve_id, 10) : vault.curve_id) : undefined;
      const notificationId = ev.id ? `${ev.id}` : (ev.transaction_hash || `ev-${vaultId}-${ev.created_at}`);
      out.push({
        id: notificationId,
        type: ev.type === 'Redeemed' ? 'liquidated' : 'acquired',
        senderLabel,
        senderId: accountToShow.id,
        marketLabel: label,
        vaultId,
        timestamp: new Date(ev.created_at).getTime(),
        txHash: ev.transaction_hash,
        shares: (ev.deposit?.shares || ev.redemption?.shares || '0')?.toString(),
        assets: (ev.deposit?.assets_after_fees || ev.redemption?.assets || '0')?.toString(),
        curveId,
      });
    }
    return out;
  } catch (e) {
    return [];
  }
};

export const getHoldersForVault = async (termId: string) => {
  const ids = prepareQueryIds(termId);
  const q = `query GetHolders($ids: [String!]!) {
      positions(where: { vault: { term_id: { _in: $ids } }, shares: { _gt: "0" } }, order_by: { shares: desc }, limit: 100) {
        shares
        account { id label image }
        vault { curve_id term_id }
      }
  }`;
  try {
    const data = await fetchGraphQL(q, { ids });
    const holders = data?.positions || [];
    const uniqueAccounts = new Set((holders as any[]).map((h: any) => normalize(h?.account?.id || '')).filter(Boolean));
    return { holders, totalCount: uniqueAccounts.size };
  } catch (e) { return { holders: [], totalCount: 0 }; }
};

/**
 * Positions for multiple vault term_ids — for user leaderboard per list (Climb leaderboard).
 * Fetches vaults separately for accurate total_assets/total_shares.
 *
 * DATA ACCURACY: Each position's stake value = shares * (total_assets / total_shares).
 * We aggregate by account: sum of asset value across all atoms in the list.
 * Ranking: descending by total stake, then by atom count (tiebreaker).
 * Only positions with shares > 0 are included. Vault IDs use prepareQueryIds for format variants.
 */
export const getPositionsForVaults = async (vaultTermIds: string[]): Promise<any[]> => {
  const ids = Array.from(new Set(vaultTermIds.flatMap((id) => prepareQueryIds(id)))).slice(0, 300);
  if (ids.length === 0) return [];
  try {
  const [posRes, vaultRes] = await Promise.all([
    fetchGraphQL(`query GetPositionsForVaults($ids: [String!]!) {
      positions(where: { vault: { term_id: { _in: $ids } }, shares: { _gt: "0" } }, limit: 5000) {
        shares account_id account { id label image }
        vault { term_id }
      }
    }`, { ids }),
    fetchGraphQL(`query GetVaultsForPositions($ids: [String!]!) {
      vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares }
    }`, { ids }),
  ]);
  const positions = posRes?.positions ?? [];
  const rawVaults = vaultRes?.vaults ?? [];
  const aggregated = aggregateVaultData(rawVaults);
  const vaultByTerm = new Map<string, { total_assets: string; total_shares: string }>();
  aggregated.forEach((v: any) => vaultByTerm.set(normalize(v.term_id), { total_assets: String(v.total_assets ?? '0'), total_shares: String(v.total_shares ?? '1') }));
  return positions.map((p: any) => {
    const v = p.vault?.term_id ? vaultByTerm.get(normalize(p.vault.term_id)) : null;
    return {
      ...p,
      vault: {
        ...p.vault,
        total_assets: v?.total_assets ?? p.vault?.total_assets ?? '0',
        total_shares: v?.total_shares ?? p.vault?.total_shares ?? '1',
      },
    };
  });
  } catch (e) { return []; }
};

/** Lists containing this term (when term is object) OR identities in this list (when term is list object). Returns entries with subject id for linking to identity markets. */
export const getAtomInclusionLists = async (termId: string, agentType?: string) => {
  const ids = prepareQueryIds(termId);
  const isList = (agentType || '').toUpperCase() === 'LIST';
  const q = isList
    ? `query GetAtomInclusionLists($ids: [String!]!, $predicateId: String!, $limit: Int) {
      triples(where: { subject_id: { _in: $ids }, predicate_id: { _eq: $predicateId } }, limit: $limit) {
        term_id subject { label term_id data image } object { label term_id data image }
      }
  }`
    : `query GetAtomInclusionLists($ids: [String!]!, $predicateId: String!, $limit: Int) {
      triples(where: { _or: [{ subject_id: { _in: $ids } }, { object_id: { _in: $ids } }], predicate_id: { _eq: $predicateId } }, limit: $limit) {
        term_id subject { label term_id data image } object { label term_id data image }
      }
  }`;
  try {
    const data = await fetchGraphQL(q, { ids, predicateId: LIST_PREDICATE_ID, limit: 500 });
    const seen = new Set<string>();
    return (data?.triples || []).map((t: any) => {
      const list = isList ? t.object : (ids.some((id: string) => normalize(id) === normalize(t.object?.term_id || '')) ? t.subject : t.object);
      if (!list?.term_id || seen.has(normalize(list.term_id))) return null;
      seen.add(normalize(list.term_id));
      return {
        id: list.term_id,
        tripleId: t.term_id,
        label: resolveMetadata(list).label,
        image: list?.image,
      };
    }).filter(Boolean);
  } catch (e) { return []; }
};

/** Try predicate_objects first (has triple_count, total_market_cap, total_position_count). Fallback to triples+vaults. */
export const getAtomInclusionListsWithVaults = async (termId: string, agentType?: string) => {
  const ids = prepareQueryIds(termId);
  const isList = (agentType || '').toUpperCase() === 'LIST';
  const predObjQ = `query SavedLists($where: predicate_objects_bool_exp, $limit: Int, $offset: Int, $orderBy: [predicate_objects_order_by!]) {
    predicate_objects(where: $where, limit: $limit, offset: $offset, order_by: $orderBy) {
      predicate { term_id label image }
      object { term_id label image }
      triples(limit: 200) {
        subject { term_id label image }
      }
      triple_count
      total_market_cap
      total_position_count
    }
  }`;
  try {
    const where = isList
      ? { predicate_id: { _in: ids } }
      : { object_id: { _in: ids }, predicate_id: { _eq: LIST_PREDICATE_ID } };
    const poRes = await fetchGraphQL(predObjQ, {
      where,
      limit: 100,
      offset: 0,
      orderBy: [{ triple_count: 'desc' }],
    });
    const po = poRes?.predicate_objects;
    if (Array.isArray(po) && po.length > 0) {
      if (isList) {
        return po.map((row: any) => {
          const entry = row.object;
          return {
            id: entry?.term_id,
            tripleId: undefined,
            label: resolveMetadata(entry).label,
            image: entry?.image,
            supportTotalAssets: row.total_market_cap != null ? String(row.total_market_cap) : '0',
            supportPositionCount: row.total_position_count ?? row.triple_count ?? 0,
            opposeTotalAssets: '0',
            opposePositionCount: 0,
          };
        });
      }
      const out: any[] = [];
      const seen = new Set<string>();
      for (const row of po) {
        const triples = row.triples || [];
        const rowCap = row.total_market_cap;
        const rowPos = row.total_position_count ?? row.triple_count ?? 0;
        for (const t of triples) {
          const objId = t.object?.term_id ? normalize(t.object.term_id) : '';
          const list = ids.some((id: string) => normalize(id) === objId) ? t.subject : t.object;
          if (list?.term_id && !seen.has(normalize(list.term_id))) {
            seen.add(normalize(list.term_id));
            out.push({
              id: list.term_id,
              tripleId: undefined,
              label: resolveMetadata(list).label,
              image: list.image,
              supportTotalAssets: rowCap != null ? String(rowCap) : '0',
              supportPositionCount: rowPos,
              opposeTotalAssets: '0',
              opposePositionCount: 0,
            });
          }
        }
        if (triples.length === 0 && row.predicate?.term_id && !seen.has(normalize(row.predicate.term_id))) {
          seen.add(normalize(row.predicate.term_id));
          out.push({
            id: row.predicate.term_id,
            tripleId: undefined,
            label: resolveMetadata(row.predicate).label,
            image: row.predicate.image,
            supportTotalAssets: rowCap != null ? String(rowCap) : '0',
            supportPositionCount: rowPos,
            opposeTotalAssets: '0',
            opposePositionCount: 0,
          });
        }
      }
      if (out.length > 0) {
        const listIds = out.map((e) => e.id).filter(Boolean);
        const idsForVault = Array.from(new Set(listIds.flatMap((id) => prepareQueryIds(id)))).slice(0, 500);
        try {
          const vaultRes = await fetchGraphQL(`query GetListVaults($ids: [String!]!) { vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count } }`, { ids: idsForVault });
          const vaults = vaultRes?.vaults || [];
          const agg = aggregateVaultData(vaults);
          const vaultByTerm = new Map<string, { total_assets: string; position_count: number }>();
          agg.forEach((v: any) => vaultByTerm.set(normalize(v.term_id), { total_assets: v.total_assets?.toString() ?? '0', position_count: v.position_count ?? 0 }));
          return out.map((e) => {
            const v = vaultByTerm.get(normalize(e.id));
            return {
              ...e,
              supportTotalAssets: v?.total_assets ?? e.supportTotalAssets,
              supportPositionCount: v?.position_count ?? e.supportPositionCount,
            };
          });
        } catch (_) { /* vault fetch failed, use row aggregates */ }
        return out;
      }
    }
  } catch (_) { /* predicate_objects not available */ }
  const entries = await getAtomInclusionLists(termId, agentType);
  if (entries.length === 0) return [];
  const entryIds = Array.from(new Set(entries.map((e) => e.id).filter(Boolean)));
  const idsForQuery = entryIds.flatMap((id) => prepareQueryIds(id)).slice(0, 500);
  const vaultQ = `query GetListEntryVaults($ids: [String!]!) { vaults(where: { term_id: { _in: $ids } }) { term_id total_assets total_shares current_share_price curve_id position_count } }`;
  try {
    const vaultRes = await fetchGraphQL(vaultQ, { ids: idsForQuery });
    const vaults = vaultRes?.vaults || [];
    const agg = aggregateVaultData(vaults);
    const vaultByTerm = new Map<string, any>();
    agg.forEach((v: any) => vaultByTerm.set(normalize(v.term_id), v));
    return entries.map((e) => {
      const v = vaultByTerm.get(normalize(e.id));
      const supportAssets = v?.total_assets ?? '0';
      const supportCount = v?.position_count ?? 0;
      return {
        ...e,
        supportTotalAssets: v?.total_assets != null ? String(v.total_assets) : '0',
        supportPositionCount: supportCount,
        opposeTotalAssets: '0',
        opposePositionCount: 0,
      };
    });
  } catch (e) {
    return entries;
  }
};

export const getIdentitiesEngaged = async (termId: string) => {
  const ids = prepareQueryIds(termId);
  const q = `query GetEngaged($ids: [String!]!) {
      triples(where: { _or: [{ subject_id: { _in: $ids } }, { object_id: { _in: $ids } }] }, limit: 20) {
        subject { label term_id data image } predicate { label } object { label term_id data image }
      }
  }`;
  try {
    const data = await fetchGraphQL(q, { ids });
    return (data?.triples || []).map((t: any) => {
        const isSubject = ids.includes(t.subject.term_id.toLowerCase());
        const peer = isSubject ? t.object : t.subject;
        return {
            term_id: peer.term_id,
            label: resolveMetadata(peer).label,
            image: peer.image,
            predicate: t.predicate.label
        };
    });
  } catch (e) { return []; }
};

export const getIncomingTriplesForStats = async (termId: string) => {
  const ids = prepareQueryIds(termId);
  const q = `query GetIncoming($ids: [String!]!) {
      triples_aggregate(where: { object_id: { _in: $ids } }) { aggregate { count } }
  }`;
  try {
    const data = await fetchGraphQL(q, { ids });
    return { totalCount: data?.triples_aggregate?.aggregate?.count || 0 };
  } catch (e) { return { totalCount: 0 }; }
};

export const getOppositionTriple = async (termId: string) => {
    const ids = prepareQueryIds(termId);
    const q = `query GetOpposition($ids: [String!]!) {
        triples(where: { counter_term_id: { _in: $ids } }, limit: 1) {
            term_id subject { label term_id data image } predicate { label } object { label term_id data image }
        }
    }`;
    try {
        const data = await fetchGraphQL(q, { ids });
        return data?.triples?.[0] ? { id: data.triples[0].term_id, ...data.triples[0] } : null;
    } catch (e) { return null; }
};

export const getGlobalClaims = async (limit: number = 40, offset: number = 0) => {
    const q = `query GetGlobalClaims($limit: Int!, $offset: Int!) {
        triples(limit: $limit, offset: $offset, order_by: { block_number: desc }) {
            term_id subject { label term_id data image type } predicate { label term_id } object { label term_id data image type } block_number transaction_hash created_at creator { id label image }
        }
    }`;
    try {
        const data = await fetchGraphQL(q, { limit, offset });
        const items = (data?.triples || []).map((t: any) => ({
            id: t.term_id,
            subject: { ...t.subject, label: resolveMetadata(t.subject).label },
            predicate: t.predicate?.label || 'LINK',
            object: { ...t.object, label: resolveMetadata(t.object).label },
            timestamp: new Date(t.created_at).getTime(),
            txHash: t.transaction_hash,
            block: t.block_number,
            creator: t.creator
        }));
        return { items, hasMore: items.length === limit };
    } catch (e) { return { items: [], hasMore: false }; }
};

export const getAgentOpinions = async (termId: string) => {
    return []; 
};

/** Sum market cap (wei) across all vaults for a term — linear + exponential curves. Uses market_cap when set; otherwise total_assets. */
export function sumVaultMarketCapWei(vaults: any[] | undefined): bigint {
    if (!vaults?.length) return 0n;
    let sum = 0n;
    for (const v of vaults) {
        const mc = v?.market_cap;
        const ta = v?.total_assets ?? '0';
        const raw = mc != null && mc !== '' ? mc : ta;
        try {
            sum += BigInt(typeof raw === 'string' ? raw : String(raw));
        } catch {
            /* skip malformed */
        }
    }
    return sum;
}

/** Total position count across all vaults (both curves) for a term. */
export function sumVaultPositionCount(vaults: any[] | undefined): number {
    if (!vaults?.length) return 0;
    return vaults.reduce((n, v) => n + Number(v?.position_count ?? 0), 0);
}

/** Category filters for The Arena (`/climb`) — predicate label heuristics on `triples`. */
export type ArenaCategory = 'head-to-head' | 'hot-takes' | 'prediction-markets';

/**
 * After fetching triples with `%vs%`, keep rows that look like real battles.
 * Filters out common false positives (e.g. "vscode" containing "vs" as letters only inside a word).
 */
export function predicateLooksLikeBattlePredicate(pred: string): boolean {
    const p = pred.trim();
    if (!p) return false;
    if (/\bvscode\b/i.test(p)) return false;
    if (/\bvs\s*code\b/i.test(p)) return false;
    if (/\bversus\b/i.test(p)) return true;
    if (/\s+vs\.?\s/i.test(p)) return true;
    if (/\s+vs,?\s/i.test(p)) return true;
    if (/\s+vs\s+/i.test(p)) return true;
    if (/\bvs\b/i.test(p)) return true;
    return false;
}

/** Looser battle signal when strict filter yields zero rows: any `vs` / `versus`, excluding vscode false positives. */
export function predicateLooksLikeBattlePredicateLoose(pred: string): boolean {
    const p = pred.trim();
    if (!p) return false;
    const lower = p.toLowerCase();
    if (lower.includes('vscode')) return false;
    if (/\bversus\b/i.test(p)) return true;
    return lower.includes('vs');
}

/**
 * Social / badge predicates (e.g. "has tag") — high volume but not "debate" claims.
 * Portal-style claim leaderboards typically surface semantic claims; exclude these from Arena Hot Takes.
 */
export function predicateIsSocialTagNoise(pred: string): boolean {
    const p = (pred || '').trim().toLowerCase().replace(/_/g, ' ');
    if (!p) return false;
    if (p === 'has tag' || p === 'has a tag') return true;
    if (/^has\s+tag\b/.test(p)) return true;
    return false;
}

/**
 * Signal lane predicate quality gate. The Pulse feed needs *stanceable* third-person
 * relations (e.g. "uses", "is a", "trusts", "competes with") — not first-person diary
 * entries like "i visit for work" or rambling sentences.
 *
 * Two-stage: any predicate in the curated allow-list passes immediately, otherwise
 * a strict shape check (length, word count, no first-person, alphabetic words only).
 */
const SIGNAL_STANCEABLE_ALLOW = new Set<string>([
    'is', 'is a', 'is an', 'is the',
    'uses', 'used by', 'used for',
    'trusts', 'vouches for', 'follows', 'recommends', 'endorses', 'supports',
    'competes with', 'rivals', 'beats',
    'made by', 'created by', 'authored by', 'built by', 'invented by',
    'owned by', 'belongs to', 'part of',
    'works at', 'works for', 'works with', 'partnered with',
    'tagged as', 'tagged with', 'has tag',
    'votes for', 'opposes',
    'knows', 'respects',
    'similar to', 'related to',
    'contains', 'depends on',
    'married to', 'parent of', 'child of',
    'vs', 'versus',
    'is trustworthy', 'trustworthy',
    'is credible', 'credible',
]);
const SIGNAL_STANCEABLE_FIRST_PERSON = /\b(?:i|my|we|you|me|us|our|im|i'?m|i'?ve|i'?d|i'?ll)\b/;

export function predicateIsStanceableForSignal(pred: string): boolean {
    const raw = (pred || '').trim();
    if (!raw) return false;
    const lower = raw.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (!lower) return false;

    // Curated allow-list always wins.
    if (SIGNAL_STANCEABLE_ALLOW.has(lower)) return true;

    if (lower.length < 2 || lower.length > 20) return false;
    if (predicateIsSocialTagNoise(lower)) return false;

    // Reject URLs, paths, identifiers, addresses.
    if (/[:\/\\#@?<>{}\[\]()"|]/.test(lower)) return false;
    if (/^https?\b/.test(lower)) return false;
    if (/^0x/.test(lower)) return false;

    // Reject any first-person token anywhere (kills "i visit for fun", "i trust for learning").
    if (SIGNAL_STANCEABLE_FIRST_PERSON.test(lower)) return false;

    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 3) return false;
    if (lower === 'tag' || lower === 'tags') return false;

    // Each word must be alphabetic (letters/dashes/apostrophes only). Single-letter words
    // are allowed only for a tiny set of common English connectors.
    const SHORT_OK = new Set(['a', 'is', 'in', 'of', 'by', 'to', 'on', 'at', 'or']);
    for (const w of words) {
        if (w.length < 2 && !SHORT_OK.has(w)) return false;
        if (!/^[a-z'][a-z'-]*$/.test(w)) return false;
    }

    return true;
}

export type SignalIdentityAccountTld = '.eth' | '.trust';

/** @deprecated Prefer {@link SignalNamedIdentityRow} */
export type SignalIdentityAccount = {
    id: string;
    label: string;
    image: string | null;
    tld: SignalIdentityAccountTld;
};

function inferNamedTldFromLabel(label: string): SignalIdentityAccountTld | null {
    const l = (label || '').trim().toLowerCase();
    if (l.endsWith('.trust')) return '.trust';
    if (l.endsWith('.eth')) return '.eth';
    return null;
}

function namedStemLooksLikeJunk(stem: string): boolean {
    if (!stem.length) return true;
    return /^[._-]+$/.test(stem);
}

/**
 * Vault-backed + account-index **named identities** (`.eth` / `.trust`) as they appear
 * on Intuition — same atom sourcing as Markets, not a thin `accounts` scrape alone.
 */
export type SignalNamedIdentityRow = {
    /** Canonical key: vault `term_id` when present, else wallet id. */
    rowKey: string;
    label: string;
    image: string | null;
    tld: SignalIdentityAccountTld;
    walletId?: string;
    termId?: string;
    totalAssetsWei: bigint;
    positionCount: number;
    source: 'vault' | 'account';
};

export async function fetchSignalNamedIdentityRows(opts?: {
    vaultLimit?: number;
    accountLimit?: number;
}): Promise<SignalNamedIdentityRow[]> {
    const vaultLimit = Math.max(40, Math.min(360, opts?.vaultLimit ?? 260));
    const accountLimit = Math.max(20, Math.min(200, opts?.accountLimit ?? 96));

    const vaultQ = `query SignalNamedVaults($limit: Int!) {
      vaults(order_by: { total_assets: desc }, limit: $limit, offset: 0) {
        term_id
        total_assets
        position_count
      }
    }`;

    try {
        const vRes = await fetchGraphQL(vaultQ, { limit: vaultLimit }, 2, 22_000);
        const rawVaults = (vRes?.vaults || []) as {
            term_id: string;
            total_assets: string;
            position_count?: number;
        }[];

        const aggregated = aggregateVaultData(rawVaults);
        const termIds = aggregated.map((v: any) => v.term_id).filter(Boolean);
        if (!termIds.length) return fetchSignalNamedAccountsOnly(accountLimit);

        const dataQ = `query SignalNamedAtoms($ids: [String!]!) {
          atoms(where: { term_id: { _in: $ids } }) {
            term_id
            label
            data
            image
            type
            creator { id label image }
            value { person { name } organization { name } thing { name } }
          }
        }`;

        const aRes = await fetchGraphQL(dataQ, { ids: termIds }, 2, 26_000);
        const atoms = (aRes?.atoms || []) as any[];

        const byLabel = new Map<string, SignalNamedIdentityRow>();

        for (const atom of atoms) {
            const tid = String(atom?.term_id ?? '').trim();
            if (!tid) continue;
            const meta = resolveMetadata(atom);
            const lab = (meta.label || '').trim();
            const tld = inferNamedTldFromLabel(lab);
            if (!tld) continue;
            const stem = lab.slice(0, -(tld.length)).trim().toLowerCase();
            if (namedStemLooksLikeJunk(stem)) continue;

            const agg = aggregated.find((v: any) => normalize(v.term_id) === normalize(tid));
            const ta = agg ? BigInt(String(agg.total_assets ?? '0')) : 0n;
            const pc = agg ? Number(agg.position_count ?? 0) : 0;

            const row: SignalNamedIdentityRow = {
                rowKey: tid.toLowerCase(),
                label: lab,
                image: (atom.image as string | null) ?? meta.image ?? null,
                tld,
                termId: tid,
                walletId: atom.creator?.id ? String(atom.creator.id) : undefined,
                totalAssetsWei: ta,
                positionCount: pc,
                source: 'vault',
            };

            const lk = lab.toLowerCase();
            const prev = byLabel.get(lk);
            if (!prev || row.totalAssetsWei > prev.totalAssetsWei) byLabel.set(lk, row);
        }

        const fromVaults = [...byLabel.values()];
        const acctRows = await fetchSignalAccountIndexRows(accountLimit);
        const outMap = new Map<string, SignalNamedIdentityRow>();
        for (const r of fromVaults) outMap.set(r.label.toLowerCase(), r);
        for (const r of acctRows) {
            const k = r.label.toLowerCase();
            if (!outMap.has(k)) outMap.set(k, r);
            else {
                const v = outMap.get(k)!;
                if (!v.walletId && r.walletId) v.walletId = r.walletId;
            }
        }

        return [...outMap.values()].sort((a, b) => {
            if (a.totalAssetsWei > b.totalAssetsWei) return -1;
            if (a.totalAssetsWei < b.totalAssetsWei) return 1;
            return a.label.localeCompare(b.label);
        });
    } catch {
        return fetchSignalNamedAccountsOnly(accountLimit);
    }
}

/* -------------------------------------------------------------------------- */
/* Signal · Identity atom rail — same claim data path as MarketDetail Claims    */
/*                                                                              */
/* Each row is built from getAgentTriplesWithVaults(termId): vault aggregates   */
/* and predicate / object labels come from the graph (not a LIST scan). Seeds   */
/* are portal list members + spotlight picks (e.g. USDC from «Stablecoin»).   */
/* -------------------------------------------------------------------------- */

export type SignalAtomTagRow = {
  tripleTermId: string;
  counterTermId?: string;
  /** Predicate label from the triple (e.g. "has tag"). */
  predicateLabel: string;
  /** Object atom label for this row (tag / claim object). */
  objectLabel: string;
  subjectLabel: string;
  subjectImage?: string;
  forCount: number;
  againstCount: number;
  totalAssetsForLabel: string;
  totalAssetsAgainstLabel: string;
  /** Sum of positive + counter vault assets, used for sorting only. */
  weight: bigint;
};

export type SignalAtomTagCard = {
  subjectTermId: string;
  subjectLabel: string;
  subjectImage?: string;
  /** On-graph claims for this identity (MarketDetail-style vault enrichment). */
  tags: SignalAtomTagRow[];
  /** Sum of activity across rows (positions). */
  totalPositions: number;
  /** Index in `SIGNAL_PULSE_HERO_ATOM_LABELS` when this card came from the homepage whitelist. */
  heroIndex?: number;
  /** When set, this card was seeded from a named portal list (pin + label in UI). */
  spotlightSourceListLabel?: string;
  /**
   * Crowd rail: graph miss or atom resolved but no vault claims yet — UI shows a slot instead of hiding the row.
   */
  pulseSlotKind?: 'unresolved' | 'empty_claims';
};

function fmtTrustFromAssetsBig(total: bigint): string {
  if (total <= 0n) return '0';
  const whole = total / 10n ** 18n;
  if (whole >= 1000n) return `${(Number(whole) / 1000).toFixed(1)}k`;
  if (whole > 0n) return whole.toString();
  const milli = (total / 10n ** 16n).toString();
  if (milli === '0') return '0';
  const padded = milli.padStart(3, '0');
  return `0.${padded.slice(0, 2)}`;
}

/** Drop URL-shaped / path junk atoms from the Pulse hero rail (e.g. x.com/… links indexed as “atoms”). */
function isJunkSignalAtomLabel(label: string): boolean {
  const s = label.trim().toLowerCase();
  if (!s) return true;
  if (s === 'x.com') return false;
  if (/^https?:\/\//.test(s)) return true;
  if (s.includes('://')) return true;
  if (/\bx\.com\b|twitter\.com|t\.co\//.test(s)) return true;
  // Path-like labels "domain/foo/bar" from bad imports
  if (/^[a-z0-9.-]+\.[a-z]{2,}\/[^\s]+$/i.test(s)) return true;
  if ((s.match(/\//g) || []).length >= 2 && /\w+\/\w+/.test(s)) return true;
  return false;
}

type ClaimWithVaults = Awaited<ReturnType<typeof getAgentTriplesWithVaults>>[number];

function predicateLooksLikeHasTag(label: string | undefined): boolean {
  const n = String(label ?? '').replace(/_/g, ' ').trim().toLowerCase();
  return n === 'has tag' || n.includes('has tag');
}

type PulseIdentitySeed = {
  termId: string;
  label: string;
  image?: string;
  spotlightSourceListLabel?: string;
  /** Position in `SIGNAL_PULSE_HERO_ATOM_LABELS` (stable Hot ordering). */
  whitelistIndex?: number;
  /** False when the whitelist label did not resolve to a subgraph atom (Crowd slot mode). */
  graphResolved?: boolean;
};

async function resolvePulseHeroAtomByLabel(displayLabel: string): Promise<PulseIdentitySeed | null> {
  const raw = displayLabel.trim();
  if (!raw) return null;
  const needle = raw.toLowerCase();
  const pattern = `%${raw.replace(/[%_]/g, (ch) => `\\${ch}`)}%`;
  const q = `query PulseHeroAtoms($pat: String!, $limit: Int!) {
    atoms(
      where: {
        _or: [{ label: { _ilike: $pat } }, { term_id: { _ilike: $pat } }]
      }
      limit: $limit
    ) {
      term_id
      label
      data
      image
      type
      value { person { name } thing { name } organization { name } }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { pat: pattern, limit: 48 });
    const atoms = res?.atoms ?? [];
    if (!Array.isArray(atoms) || atoms.length === 0) return null;
    const scored = atoms.map((a: any) => {
      const meta = resolveMetadata(a);
      const lab = String(meta.label || a.label || '').trim();
      const ll = lab.toLowerCase();
      const tid = String(a.term_id ?? '').toLowerCase();
      let score = 0;
      if (isJunkSignalAtomLabel(lab)) score -= 5000;
      if (ll === needle) score += 200;
      else if (ll.replace(/\s+/g, '') === needle.replace(/\s+/g, '')) score += 190;
      else if (ll.startsWith(needle) || needle.startsWith(ll)) score += 80;
      else if (ll.includes(needle)) score += 40;
      if (tid.includes(needle.replace(/^0x/, '')) && needle.startsWith('0x')) score += 60;
      const lenPenalty = Math.min(lab.length, 48);
      return { a, meta, lab, score: score * 1000 - lenPenalty };
    });
    const termIds = [...new Set(scored.map((x) => String(x.a.term_id ?? '').trim()).filter(Boolean))];
    const assetsByKey = new Map<string, bigint>();
    if (termIds.length > 0) {
      const vq = `query PulseHeroVaults($ids: [String!]!) {
        vaults(where: { term_id: { _in: $ids } }) {
          term_id
          total_assets
        }
      }`;
      const vRes = await fetchGraphQL(vq, { ids: termIds }, 2, 22_000);
      const vs = (vRes?.vaults ?? []) as { term_id?: string; total_assets?: string }[];
      for (const v of vs) {
        const tid = String(v.term_id ?? '').trim();
        if (!tid) continue;
        const key = normalize(tid);
        let w = 0n;
        try {
          w = BigInt(String(v.total_assets ?? '0'));
        } catch {
          w = 0n;
        }
        assetsByKey.set(key, (assetsByKey.get(key) || 0n) + w);
      }
    }
    scored.sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      const ax = assetsByKey.get(normalize(String(x.a.term_id ?? ''))) || 0n;
      const ay = assetsByKey.get(normalize(String(y.a.term_id ?? ''))) || 0n;
      if (ay > ax) return 1;
      if (ay < ax) return -1;
      return 0;
    });
    const best = scored[0];
    if (!best || best.score < -1000) return null;
    return {
      termId: best.a.term_id,
      label: best.lab,
      image: (best.meta.image || best.a.image) as string | undefined,
    };
  } catch {
    return null;
  }
}

/** Bounded parallel map — avoids firing dozens of subgraph + vault calls at once on Pulse Crowd. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const lim = Math.max(1, Math.min(limit, items.length));
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: lim }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) break;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function discoverSignalPulseIdentitySeedsFromLabels(
  labels: readonly string[],
  maxCards: number,
  opts?: { slotPerLabel?: boolean; labelResolveConcurrency?: number },
): Promise<PulseIdentitySeed[]> {
  const cap = Math.min(48, Math.max(1, maxCards));
  const lim = Math.max(
    1,
    Math.min(opts?.labelResolveConcurrency ?? 12, labels.length || 1),
  );
  const resolved = await mapWithConcurrency(labels, lim, async (label, wi) => {
    const seed = await resolvePulseHeroAtomByLabel(label);
    return { seed, wi, label } as const;
  });

  if (opts?.slotPerLabel) {
    const out: PulseIdentitySeed[] = [];
    for (const { seed, wi, label } of resolved) {
      if (out.length >= cap) break;
      const displayLabel = String(label ?? '').trim() || '—';
      if (!seed) {
        console.warn('[discoverSignalPulseIdentitySeedsFromLabels] No graph match for label:', label);
        out.push({
          termId: '',
          label: displayLabel,
          whitelistIndex: wi,
          graphResolved: false,
        });
        continue;
      }
      if (isJunkSignalAtomLabel(seed.label)) {
        out.push({
          termId: '',
          label: displayLabel,
          whitelistIndex: wi,
          graphResolved: false,
        });
        continue;
      }
      const k = normalize(seed.termId);
      if (!k) {
        out.push({
          termId: '',
          label: displayLabel,
          whitelistIndex: wi,
          graphResolved: false,
        });
        continue;
      }
      out.push({ ...seed, whitelistIndex: wi, graphResolved: true });
    }
    return out;
  }

  const seen = new Set<string>();
  const out: PulseIdentitySeed[] = [];
  for (const { seed, wi, label } of resolved) {
    if (out.length >= cap) break;
    if (!seed) {
      console.warn('[discoverSignalPulseIdentitySeedsFromLabels] No graph match for label:', label);
      continue;
    }
    const k = normalize(seed.termId);
    if (!k || seen.has(k)) continue;
    if (isJunkSignalAtomLabel(seed.label)) continue;
    seen.add(k);
    out.push({ ...seed, whitelistIndex: wi });
  }
  return out;
}

async function fetchPulseIdentitySeedForTermId(termId: string): Promise<PulseIdentitySeed | null> {
  const raw = termId.trim();
  if (!raw) return null;
  const ids = prepareQueryIds(raw);
  if (ids.length === 0) return null;
  const q = `query PulseSeedByTermId($ids: [String!]!) {
    atoms(where: { term_id: { _in: $ids } }, limit: 1) {
      term_id
      label
      data
      image
      type
      value { person { name } thing { name } organization { name } }
    }
  }`;
  try {
    const res = await fetchGraphQL(q, { ids });
    const a = res?.atoms?.[0];
    if (!a?.term_id) return null;
    const meta = resolveMetadata(a);
    const lab = String(meta.label || a.label || '').trim();
    if (!lab || isJunkSignalAtomLabel(lab)) return null;
    return {
      termId: a.term_id,
      label: lab,
      image: (meta.image || a.image) as string | undefined,
    };
  } catch {
    return null;
  }
}

function claimWithVaultsToTagRow(c: ClaimWithVaults): SignalAtomTagRow {
  let sw = 0n;
  let ow = 0n;
  try {
    sw = BigInt(String(c.supportTotalAssets || '0'));
  } catch {
    /* ignore */
  }
  try {
    ow = BigInt(String(c.opposeTotalAssets || '0'));
  } catch {
    /* ignore */
  }
  const pred = String(c.predicate?.label || 'LINK').replace(/_/g, ' ').trim();
  return {
    tripleTermId: c.id,
    counterTermId: c.counterTermId,
    predicateLabel: pred,
    objectLabel: c.object?.label ?? '—',
    subjectLabel: c.subject?.label ?? '—',
    subjectImage: c.subject?.image,
    forCount: c.supportPositionCount,
    againstCount: c.opposePositionCount,
    totalAssetsForLabel: fmtTrustFromAssetsBig(sw),
    totalAssetsAgainstLabel: fmtTrustFromAssetsBig(ow),
    weight: sw + ow,
  };
}

async function buildSignalAtomTagCardFromVaultClaims(
  seed: PulseIdentitySeed,
  maxClaims: number,
  opts?: { allowEmptyClaims?: boolean },
): Promise<SignalAtomTagCard | null> {
  if (seed.graphResolved === false || !String(seed.termId ?? '').trim()) {
    const wi = seed.whitelistIndex ?? 0;
    const slug = encodeURIComponent(seed.label.trim() || 'slot');
    return {
      subjectTermId: `__pulse_unresolved__:${wi}:${slug}`,
      subjectLabel: seed.label,
      subjectImage: seed.image,
      tags: [],
      totalPositions: 0,
      heroIndex: seed.whitelistIndex,
      spotlightSourceListLabel: seed.spotlightSourceListLabel,
      pulseSlotKind: 'unresolved',
    };
  }

  const claims = await getAgentTriplesWithVaults(seed.termId);
  if (!claims.length) {
    if (!opts?.allowEmptyClaims) return null;
    return {
      subjectTermId: seed.termId,
      subjectLabel: seed.label,
      subjectImage: seed.image,
      tags: [],
      totalPositions: 0,
      heroIndex: seed.whitelistIndex,
      spotlightSourceListLabel: seed.spotlightSourceListLabel,
      pulseSlotKind: 'empty_claims',
    };
  }

  let pool = claims.filter((c) => normalize(c.subject.term_id) === normalize(seed.termId));
  if (pool.length === 0) pool = claims;

  const tagPref = pool.filter((c) => predicateLooksLikeHasTag(c.predicate?.label));
  pool = tagPref.length > 0 ? tagPref : pool;

  const slice = pool.slice(0, maxClaims);
  const tags = slice.map(claimWithVaultsToTagRow);
  const totalPositions = tags.reduce((s, t) => s + t.forCount + t.againstCount, 0);

  tags.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight > a.weight ? 1 : -1;
    return b.forCount + b.againstCount - (a.forCount + a.againstCount);
  });

  return {
    subjectTermId: seed.termId,
    subjectLabel: seed.label,
    subjectImage: seed.image,
    tags,
    totalPositions,
    spotlightSourceListLabel: seed.spotlightSourceListLabel,
  };
}

/**
 * Identity atoms for the Pulse rail: ordered whitelist in `SIGNAL_PULSE_HERO_ATOM_LABELS`, resolved on the
 * subgraph by label; each card’s rows from `getAgentTriplesWithVaults` (MarketDetail-style vault enrichment).
 */
export async function fetchSignalPulseIdentityCards(opts?: {
  maxIdentityCards?: number;
  maxClaimsPerCard?: number;
  /** When set, resolve this list instead of `SIGNAL_PULSE_HERO_ATOM_LABELS` (e.g. Crowd rail). */
  identityLabels?: readonly string[];
  /** Cap concurrent `getAgentTriplesWithVaults` fan-out (default 6). */
  buildConcurrency?: number;
}): Promise<SignalAtomTagCard[]> {
  const labels = opts?.identityLabels ?? SIGNAL_PULSE_HERO_ATOM_LABELS;
  const slotPerLabel = opts?.identityLabels != null;
  const defaultMax =
    opts?.identityLabels != null ? labels.length : Math.min(24, labels.length);
  const maxCards = Math.min(48, Math.max(1, opts?.maxIdentityCards ?? defaultMax));
  const maxCardsClamped = Math.min(maxCards, labels.length);
  const maxClaims = Math.min(100, Math.max(4, opts?.maxClaimsPerCard ?? 48));
  const buildConcurrency = Math.max(
    1,
    Math.min(
      12,
      Number.isFinite(opts?.buildConcurrency as number) ? Number(opts?.buildConcurrency) : slotPerLabel ? 8 : 6,
    ),
  );
  try {
    const seeds = await discoverSignalPulseIdentitySeedsFromLabels(labels, maxCardsClamped, {
      slotPerLabel,
      labelResolveConcurrency: slotPerLabel ? 16 : 12,
    });
    const built = await mapWithConcurrency(seeds, buildConcurrency, (seed) =>
      buildSignalAtomTagCardFromVaultClaims(seed, maxClaims, { allowEmptyClaims: slotPerLabel }),
    );
    const cards: SignalAtomTagCard[] = [];
    for (let i = 0; i < seeds.length; i++) {
      const card = built[i];
      const seed = seeds[i];
      if (!card) continue;
      if (!slotPerLabel && card.tags.length === 0) continue;
      const hi = seed.whitelistIndex;
      cards.push(hi === undefined ? card : { ...card, heroIndex: hi });
    }
    return cards;
  } catch (e) {
    console.warn('[fetchSignalPulseIdentityCards]', e);
    return [];
  }
}

/**
 * Load Pulse-style tag cards for arbitrary atom `term_id`s (Yours rail), preserving caller order.
 */
export async function fetchSignalPulseIdentityCardsForTermIds(
  termIds: string[],
  opts?: { maxClaimsPerCard?: number; buildConcurrency?: number },
): Promise<SignalAtomTagCard[]> {
  const maxClaims = Math.min(100, Math.max(4, opts?.maxClaimsPerCard ?? 48));
  const buildConcurrency = Math.max(
    1,
    Math.min(12, Number.isFinite(opts?.buildConcurrency as number) ? Number(opts?.buildConcurrency) : 6),
  );
  const seen = new Set<string>();
  const uniqueOrdered: string[] = [];
  for (const tid of termIds) {
    const raw = tid?.trim();
    if (!raw) continue;
    const k = normalize(raw);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniqueOrdered.push(raw);
  }
  const pairs = await mapWithConcurrency(uniqueOrdered, buildConcurrency, async (raw) => {
    const seed = await fetchPulseIdentitySeedForTermId(raw);
    if (!seed) return null;
    const card = await buildSignalAtomTagCardFromVaultClaims(seed, maxClaims);
    return card && card.tags.length > 0 ? { card, raw } : null;
  });
  const byRaw = new Map(pairs.filter(Boolean).map((p) => [p!.raw.trim().toLowerCase(), p!.card]));
  const cards: SignalAtomTagCard[] = [];
  let order = 0;
  for (const raw of uniqueOrdered) {
    const c = byRaw.get(raw.trim().toLowerCase());
    if (c) {
      cards.push({ ...c, heroIndex: order });
      order += 1;
    }
  }
  return cards;
}

/* -------------------------------------------------------------------------- */
/* Signal · "Me" — every stance the viewer has staked on a triple              */
/* -------------------------------------------------------------------------- */

export type UserStanceRow = {
  /** Triple `term_id` — the positive vault. */
  tripleTermId: string;
  counterTermId?: string;
  subjectLabel: string;
  subjectImage?: string;
  predicateLabel: string;
  objectLabel: string;
  objectImage?: string;
  /** true = staked on the positive vault (Stand / Agreed); false = staked on the counter (Oppose / Disagreed). */
  support: boolean;
  /** TRUST notional from the matched vault (computed from shares × current_share_price). */
  trustAmount: number;
  /** Raw share balance in wei-units (string for safety). */
  shares: string;
  /** Block-ish ordering field. Falls back to created_at when block isn't on the row. */
  ordering: number;
};

function pickAtomLabel(node: any): string {
  const label =
    node?.label ||
    node?.value?.person?.name ||
    node?.value?.thing?.name ||
    node?.value?.organization?.name ||
    '';
  const trimmed = String(label || '').trim();
  if (trimmed) return trimmed.length > 96 ? `${trimmed.slice(0, 94)}…` : trimmed;
  return '—';
}

function pickAtomImage(node: any): string | undefined {
  const raw =
    node?.cached_image?.url ||
    node?.image ||
    node?.value?.person?.cached_image?.url ||
    node?.value?.person?.image ||
    node?.value?.thing?.cached_image?.url ||
    node?.value?.thing?.image ||
    node?.value?.organization?.image ||
    undefined;
  return normalizeWebMediaUrl(raw);
}

/** Convert a vault's `userPosition[].shares` × `current_share_price` into a TRUST decimal. Returns 0 if nothing. */
function computeUserTrust(vault: any): { trust: number; sharesStr: string } {
  const positions = Array.isArray(vault?.userPosition) ? vault.userPosition : [];
  let totalShares = 0;
  for (const p of positions) {
    const s = Number(p?.shares ?? 0);
    if (Number.isFinite(s) && s > 0) totalShares += s;
  }
  if (totalShares <= 0) return { trust: 0, sharesStr: '0' };
  const price = Number(vault?.current_share_price ?? 0);
  const trust = Number.isFinite(price) && price > 0 ? (totalShares * price) / 1e36 : totalShares / 1e18;
  return { trust, sharesStr: String(totalShares) };
}

function vaultsHaveUserPosition(vaults: any[] | undefined): boolean {
  if (!Array.isArray(vaults)) return false;
  for (const v of vaults) {
    const positions = Array.isArray(v?.userPosition) ? v.userPosition : [];
    for (const p of positions) {
      const s = Number(p?.shares ?? 0);
      if (Number.isFinite(s) && s > 0) return true;
    }
  }
  return false;
}

function sumVaultsUserTrust(vaults: any[] | undefined): { trust: number; sharesStr: string } {
  let trust = 0;
  let shares = 0;
  for (const v of vaults ?? []) {
    const r = computeUserTrust(v);
    trust += r.trust;
    shares += Number(r.sharesStr) || 0;
  }
  return { trust, sharesStr: String(shares) };
}

/**
 * Triples where the connected wallet has staked TRUST on either the positive vault (Stand) or the
 * counter vault (Oppose). Sorted newest-first; capped at `limit`.
 */
export async function fetchUserStanceHistory(
  walletAddress: string,
  limit = 80,
): Promise<UserStanceRow[]> {
  const variants = accountVariantsForGraph(walletAddress);
  if (variants.length === 0) return [];

  const where = {
    _or: [
      { term: { vaults: { positions: { account_id: { _in: variants } } } } },
      { counter_term: { vaults: { positions: { account_id: { _in: variants } } } } },
    ],
  };

  try {
    const triples = await getTriplesWithPositions(
      Math.min(120, Math.max(20, limit)),
      0,
      [{ created_at: 'desc' }],
      where,
      walletAddress,
    );

    const out: UserStanceRow[] = [];
    for (const t of triples ?? []) {
      const tripleTermId = String(t?.term_id ?? '').trim();
      if (!tripleTermId) continue;

      const positiveVaults = t?.term?.vaults ?? [];
      const counterVaults = t?.counter_term?.vaults ?? [];

      const onPositive = vaultsHaveUserPosition(positiveVaults);
      const onCounter = vaultsHaveUserPosition(counterVaults);
      if (!onPositive && !onCounter) continue;

      const subjectLabel = pickAtomLabel(t?.subject);
      const objectLabel = pickAtomLabel(t?.object);
      if (subjectLabel === '—' || objectLabel === '—') continue;

      // If user is on both sides (rare), show the heavier one.
      const matched = onPositive && onCounter
        ? (sumVaultsUserTrust(positiveVaults).trust >= sumVaultsUserTrust(counterVaults).trust)
        : onPositive;

      const { trust, sharesStr } = matched
        ? sumVaultsUserTrust(positiveVaults)
        : sumVaultsUserTrust(counterVaults);

      out.push({
        tripleTermId,
        counterTermId: t?.counter_term_id ? String(t.counter_term_id) : undefined,
        subjectLabel,
        subjectImage: pickAtomImage(t?.subject),
        predicateLabel: String(t?.predicate?.label ?? '').trim(),
        objectLabel,
        objectImage: pickAtomImage(t?.object),
        support: matched,
        trustAmount: trust,
        shares: sharesStr,
        ordering: Number(t?.created_at ?? 0) || 0,
      });
    }

    out.sort((a, b) => (b.trustAmount - a.trustAmount) || (b.ordering - a.ordering));
    return out.slice(0, limit);
  } catch (e) {
    console.warn('[fetchUserStanceHistory]', e);
    return [];
  }
}

/** Top named vault atoms by TRUST locked — Frontier lane. */
export async function fetchSignalNamedFrontierRows(limit = 48): Promise<SignalNamedIdentityRow[]> {
    const rows = await fetchSignalNamedIdentityRows({ vaultLimit: 280, accountLimit: 48 });
    return [...rows]
        .filter((r) => r.source === 'vault' && r.termId)
        .sort((a, b) => {
            if (a.totalAssetsWei > b.totalAssetsWei) return -1;
            if (a.totalAssetsWei < b.totalAssetsWei) return 1;
            if (b.positionCount !== a.positionCount) return b.positionCount - a.positionCount;
            return a.label.localeCompare(b.label);
        })
        .slice(0, Math.max(8, Math.min(96, limit)));
}

async function fetchSignalNamedAccountsOnly(accountLimit: number): Promise<SignalNamedIdentityRow[]> {
    const rows = await fetchSignalAccountIndexRows(accountLimit);
    return rows.sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchSignalAccountIndexRows(accountLimit: number): Promise<SignalNamedIdentityRow[]> {
    const lim = Math.max(1, accountLimit);
    const q = `query SignalAccountIndex($lim: Int!) {
      eth: accounts(where: { label: { _ilike: "%.eth" } }, limit: $lim, order_by: [{ id: desc }]) {
        id label image
      }
      trust: accounts(where: { label: { _ilike: "%.trust" } }, limit: $lim, order_by: [{ id: desc }]) {
        id label image
      }
    }`;
    try {
        const res = await fetchGraphQL(q, { lim }, 2, 18_000);
        const out: SignalNamedIdentityRow[] = [];
        const push = (rows: any[] | undefined, tld: SignalIdentityAccountTld) => {
            for (const r of rows || []) {
                const walletId = String(r?.id ?? '').trim();
                const label = String(r?.label ?? '').trim();
                if (!walletId || !label) continue;
                const lower = label.toLowerCase();
                if (!lower.endsWith(tld)) continue;
                const stem = lower.slice(0, -tld.length);
                if (namedStemLooksLikeJunk(stem)) continue;
                out.push({
                    rowKey: walletId.toLowerCase(),
                    label,
                    image: r?.image ?? null,
                    tld,
                    walletId,
                    totalAssetsWei: 0n,
                    positionCount: 0,
                    source: 'account',
                });
            }
        };
        push(res?.trust, '.trust');
        push(res?.eth, '.eth');
        return out;
    } catch {
        return [];
    }
}

/**
 * @deprecated Use {@link fetchSignalNamedIdentityRows}.
 */
export async function fetchSignalIdentityAccounts(perTldLimit = 50): Promise<SignalIdentityAccount[]> {
    const rows = await fetchSignalNamedIdentityRows({
        vaultLimit: 220,
        accountLimit: Math.max(24, perTldLimit),
    });
    return rows.map((r) => ({
        id: r.rowKey,
        label: r.label,
        image: r.image,
        tld: r.tld,
    }));
}

/**
 * Head-to-head: broad GraphQL match on `vs` / `versus`, then client-side
 * `predicateLooksLikeBattlePredicate` removes false positives (e.g. "vscode").
 */
export function buildArenaTriplesWhere(tab: ArenaCategory): Record<string, unknown> {
    if (tab === 'head-to-head') {
        return {
            _or: [
                { predicate: { label: { _ilike: '%vs%' } } },
                { predicate: { label: { _ilike: '% vs %' } } },
                { predicate: { label: { _ilike: '%versus%' } } },
                { predicate: { label: { _ilike: '% vs.%' } } },
                { predicate: { label: { _ilike: '% vs,%' } } },
            ],
        };
    }
    if (tab === 'prediction-markets') {
        return {
            _or: [
                { predicate: { label: { _ilike: '%predict%' } } },
                { predicate: { label: { _ilike: '%forecast%' } } },
                { predicate: { label: { _ilike: '%will %' } } },
            ],
        };
    }
    return {};
}

export async function getTriplesWithPositions(limit = 10, offset = 0, orderBy: any[] = [], where: any = {}, address?: string) {
  const accountIds = address?.trim() ? accountVariantsForGraph(address).slice(0, 24) : [];
  if (accountIds.length === 0) return [];

  const query = `
    query GetTriplesWithPositions($limit: Int, $offset: Int, $orderBy: [triples_order_by!], $where: triples_bool_exp, $accountIds: [String!]) {
      triples(limit: $limit, offset: $offset, order_by: $orderBy, where: $where) {
        term_id
        counter_term_id
        created_at
        positions_aggregate {
          aggregate {
            count
          }
        }
        subject {
          term_id
          wallet_id
          label
          image
          cached_image {
            ...CachedImageFields
          }
          data
          type
          value {
            ...AtomValueLight
          }
        }
        predicate {
          term_id
          wallet_id
          label
          image
          cached_image {
            ...CachedImageFields
          }
          data
          type
          value {
            ...AtomValueLight
          }
        }
        object {
          term_id
          wallet_id
          label
          image
          cached_image {
            ...CachedImageFields
          }
          data
          type
          value {
            ...AtomValue
          }
        }
        subject_term {
          ...TermElement
        }
        predicate_term {
          ...TermElement
        }
        object_term {
          ...TermElementFull
        }
        term {
          ...Term
          vaults(order_by: {curve_id: asc}) {
            term_id
            curve_id
            current_share_price
            market_cap
            total_assets
            total_shares
            position_count
            market_cap
            userPosition: positions(where: {account_id: {_in: $accountIds}}) {
              account {
                id
                label
                image
                cached_image {
                  ...CachedImageFields
                }
              }
              shares
            }
          }
        }
        counter_term {
          ...CounterTerm
          vaults(order_by: {curve_id: asc}) {
            term_id
            curve_id
            current_share_price
            market_cap
            total_assets
            total_shares
            position_count
            market_cap
            userPosition: positions(where: {account_id: {_in: $accountIds}}) {
              account {
                id
                label
                image
                cached_image {
                  ...CachedImageFields
                }
              }
              shares
            }
          }
        }
        creator {
          id
          atom_id
          label
          image
          cached_image {
            ...CachedImageFields
          }
        }
      }
    }
    
    fragment CachedImageFields on cached_images_cached_image {
      url
      safe
    }
    
    fragment AtomValueLight on atom_values {
      person {
        name
        image
        cached_image {
          ...CachedImageFields
        }
        url
      }
      thing {
        name
        image
        cached_image {
          ...CachedImageFields
        }
        url
      }
      organization {
        name
        image
        url
      }
      account {
        id
        label
        image
        cached_image {
          ...CachedImageFields
        }
      }
    }
    
    fragment AtomValue on atom_values {
      ...AtomValueLight
      json_object {
        description: data(path: "description")
      }
    }
    
    fragment TermElement on terms {
      id
      type
      atom {
        term_id
        data
        image
        cached_image {
          ...CachedImageFields
        }
        label
        emoji
        type
        wallet_id
        value {
          ...AtomValueLight
        }
      }
      triple {
        term_id
        subject {
          label
        }
        predicate {
          label
        }
        object {
          label
        }
      }
    }
    
    fragment TermElementFull on terms {
      id
      type
      atom {
        term_id
        data
        image
        cached_image {
          ...CachedImageFields
        }
        label
        emoji
        type
        wallet_id
        value {
          ...AtomValue
        }
        creator {
          ...AccountMetadata
        }
      }
      triple {
        term_id
        subject {
          label
        }
        predicate {
          label
        }
        object {
          label
        }
      }
    }
    
    fragment AccountMetadata on accounts {
      label
      image
      cached_image {
        ...CachedImageFields
      }
      id
      atom_id
      type
    }
    
    fragment Term on terms {
      total_market_cap
      positions_aggregate {
        aggregate {
          count
        }
      }
    }
    
    fragment CounterTerm on terms {
      total_market_cap
      positions_aggregate {
        aggregate {
          count
        }
      }
    }
  `;

  const variables = { limit, offset, orderBy, where, accountIds };
  const data = await fetchGraphQL(query, variables);
  return data?.triples || [];
}
