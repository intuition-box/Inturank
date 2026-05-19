import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { subscribeVisibilityAwareInterval } from '../services/visibility';

type Eip1193Like = {
  request?: (args: { method: string }) => Promise<unknown>;
  on?: (ev: string, fn: (...a: unknown[]) => void) => void;
  removeListener?: (ev: string, fn: (...a: unknown[]) => void) => void;
};

function parseChainIdResult(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? parseInt(trimmed, 16) : Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * MetaMask mobile / in-app browser sometimes returns stale data from `getChainId()` or omits
 * `chainChanged`. Hit `eth_chainId` on the connector provider first, then fall back to
 * `window.ethereum`, so the UI matches what the wallet app shows after a manual network switch.
 */
function getConnectorFn<K extends string>(
  connector: NonNullable<ReturnType<typeof useAccount>['connector']>,
  key: K,
): connector is NonNullable<ReturnType<typeof useAccount>['connector']> & Record<K, (...a: never[]) => unknown> {
  const fn = (connector as Record<string, unknown>)[key];
  return typeof fn === 'function';
}

async function readLiveChainId(
  connector: NonNullable<ReturnType<typeof useAccount>['connector']>,
): Promise<number | undefined> {
  if (getConnectorFn(connector, 'getProvider')) {
    try {
      const raw = await connector.getProvider();
      const p = raw as Eip1193Like | null | undefined;
      if (p?.request) {
        const hex = await p.request({ method: 'eth_chainId' });
        const id = parseChainIdResult(hex);
        if (id !== undefined) return id;
      }
    } catch {
      /* try next */
    }
  }

  if (getConnectorFn(connector, 'getChainId')) {
    try {
      const id = await connector.getChainId();
      if (Number.isFinite(id)) return id;
    } catch {
      /* try next */
    }
  }

  if (typeof window === 'undefined') return undefined;
  try {
    const eth = (window as unknown as { ethereum?: Eip1193Like & { providers?: Eip1193Like[]; isMetaMask?: boolean } })
      .ethereum;
    if (!eth) return undefined;
    const multi = Array.isArray(eth.providers) ? eth.providers : [];
    const pick =
      multi.find((p) => Boolean((p as { isMetaMask?: boolean }).isMetaMask)) ??
      multi[0] ??
      eth;
    if (pick?.request) {
      const hex = await pick.request({ method: 'eth_chainId' });
      return parseChainIdResult(hex);
    }
  } catch {
    /* ignore */
  }

  return undefined;
}

/**
 * Wagmi’s stored chain can lag after a manual wallet network change — MetaMask in
 * particular may skip `chainChanged` while still switching chains (see metamask-extension#24247).
 * Poll `eth_chainId` / connector + listen on the provider so “Wrong network” reflects the wallet.
 */
export function useEffectiveChainId(): number {
  const { chainId: wagmiChainId, connector, isConnected } = useAccount();
  const [polled, setPolled] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!isConnected || !connector) {
      setPolled(undefined);
      return;
    }

    let cancelled = false;

    const refresh = () => {
      void (async () => {
        const id = await readLiveChainId(connector);
        if (!cancelled && id !== undefined) setPolled(id);
      })();
    };

    refresh();

    /**
     * Primary path is the wallet's `chainChanged` event + focus/visibility refresh.
     * The interval is a safety net for MetaMask mobile / in-app browsers that drop the event —
     * 5s + paused-when-tab-hidden keeps idle CPU low without sacrificing correctness.
     */
    const stopInterval = subscribeVisibilityAwareInterval(refresh, 5000);

    const onBecameVisible = () => {
      refresh();
    };
    window.addEventListener('focus', onBecameVisible);
    window.addEventListener('pageshow', onBecameVisible);

    let removeChainListener: (() => void) | undefined;
    if (getConnectorFn(connector, 'getProvider')) {
      void connector
        .getProvider()
        .then((raw) => {
          const provider = raw as Eip1193Like | null | undefined;
          if (cancelled || !provider?.on) return;
          const handler = () => {
            refresh();
          };
          provider.on('chainChanged', handler);
          removeChainListener = () => provider.removeListener?.('chainChanged', handler);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      stopInterval();
      window.removeEventListener('focus', onBecameVisible);
      window.removeEventListener('pageshow', onBecameVisible);
      removeChainListener?.();
    };
  }, [connector, isConnected]);

  return polled ?? wagmiChainId ?? 0;
}
