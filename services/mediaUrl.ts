/** Default gateways — browser-friendly `https` equivalents for decentralized schemes. */

const CLOUDFLARE_IPFS_GATEWAY = 'https://cloudflare-ipfs.com/ipfs/';

/** Turn protocol-native / bare media URLs into something `<img>` can load. */
export function normalizeWebMediaUrl(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const u = typeof raw === 'string' ? raw.trim() : '';
  if (!u) return undefined;
  if (u.startsWith('data:image/') || u.startsWith('blob:')) return u;

  try {
    if (u.startsWith('ipfs://')) {
      const path = u.slice('ipfs://'.length).replace(/^\/+/, '').replace(/^ipfs\//, '');
      if (!path) return undefined;
      return `${CLOUDFLARE_IPFS_GATEWAY}${path}`;
    }

    const lowerProto = /^([a-z+.-]+):\/\//i.exec(u)?.[1]?.toLowerCase();
    if (lowerProto === 'ipfs') {
      const rest = u.replace(/^ipfs:\/\//i, '').replace(/^\/+/, '');
      if (!rest) return undefined;
      return `${CLOUDFLARE_IPFS_GATEWAY}${rest.replace(/^ipfs\//, '')}`;
    }

    if (lowerProto === 'ar' || u.startsWith('ar://')) {
      const tid = u.replace(/^ar:\/\//i, '').replace(/^\/+/, '').split('/')[0];
      return tid ? `https://arweave.net/${tid}` : undefined;
    }

    if (/^https?:\/\//i.test(u)) return u;

    ///ipfs/Qm… or /ipfs/bafy…
    const slashIpfs = u.match(/^\/ipfs\/(.+)/i)?.[1];
    if (slashIpfs) return `${CLOUDFLARE_IPFS_GATEWAY}${slashIpfs.replace(/^ipfs\//, '')}`;

    // Bare CIDv0 / v1 (common in metadata payloads)
    if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(u) || /^baf[a-z2-7]{50,}$/i.test(u)) {
      return `${CLOUDFLARE_IPFS_GATEWAY}${u}`;
    }

    // Relative-ish paths when gateway host already implied (rare)
    if (/^ipfs\//i.test(u)) return `${CLOUDFLARE_IPFS_GATEWAY}${u.replace(/^ipfs\//i, '')}`;

    return u;
  } catch {
    return u;
  }
}
