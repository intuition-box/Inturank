import { useEffect, useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { TRUST_DISPLAY_UPDATED_EVENT, walletDisplayMeta } from '../services/tns';

/**
 * Resolved wallet headline (TNS / ENS / hex) for header chrome; refetches when TNS session hints update.
 */
export function useWalletDisplayMeta(walletAddress: string | null | undefined): {
  primaryLabel: string;
  isNamed: boolean;
} | null {
  const [meta, setMeta] = useState<{ primaryLabel: string; isNamed: boolean } | null>(null);

  useEffect(() => {
    if (!walletAddress?.trim()) {
      setMeta(null);
      return;
    }

    const addr = walletAddress.trim();
    let cancelled = false;

    const load = () => {
      walletDisplayMeta(addr)
        .then((m) => {
          if (!cancelled) setMeta(m);
        })
        .catch(() => {
          if (!cancelled) {
            let fallback = addr;
            try {
              if (isAddress(addr as `0x${string}`)) fallback = getAddress(addr as `0x${string}`);
            } catch {
              /* keep raw */
            }
            setMeta({ primaryLabel: fallback, isNamed: false });
          }
        });
    };

    load();

    if (typeof window === 'undefined') {
      return () => {
        cancelled = true;
      };
    }

    const onTrustHint = (ev: Event) => {
      const d = (ev as CustomEvent<{ address?: string }>).detail;
      if (d?.address && d.address.toLowerCase() === addr.toLowerCase()) load();
    };

    window.addEventListener(TRUST_DISPLAY_UPDATED_EVENT, onTrustHint);
    return () => {
      cancelled = true;
      window.removeEventListener(TRUST_DISPLAY_UPDATED_EVENT, onTrustHint);
    };
  }, [walletAddress]);

  return meta;
}
