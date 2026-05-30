/**
 * Shared wallet + side-effect shell used by Layout.tsx and MobileLayout.tsx.
 *
 * Encapsulates everything that was duplicated between the two layouts:
 *   - wagmi <-> web3 service sync (live wallet client → setWagmiConnection)
 *   - RainbowKit connect modal exposure for legacy callers
 *   - email failure handler wiring
 *   - daily digest + follows-merge on connect
 *
 * Extracted 2026-05-28 as the Phase E starter so the eventual responsive-layout
 * merge can be a UI-only change (no re-doing all these effects).
 */
import { useCallback, useEffect } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useConfig, useDisconnect } from 'wagmi';
import { getWalletClient } from '@wagmi/core';

import { CHAIN_ID } from '../constants';
import {
  setWagmiConnection,
  setOpenConnectModalRef,
  disconnectWallet,
} from '../services/web3';
import { setEmailFailureHandler, maybeSendDailyDigest } from '../services/emailNotifications';
import { mergeFollowsFromServer } from '../services/follows';
import { toast } from '../components/Toast';
import { playClick } from '../services/audio';

export interface WalletShell {
  walletAddress: `0x${string}` | undefined;
  isConnected: boolean;
  openConnectModal: (() => void) | undefined;
  /** Click handler — disconnects wagmi + clears legacy web3 connection. */
  disconnect: (e?: { stopPropagation?: () => void }) => void;
  /** Imperative variant — same logic, no event. */
  hardDisconnect: () => void;
}

export function useWalletShell(): WalletShell {
  const { openConnectModal } = useConnectModal();
  const { address: walletAddress, isConnected } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const wagmiConfig = useConfig();

  // Sync RainbowKit/wagmi → legacy web3 service.
  useEffect(() => {
    if (!isConnected || !walletAddress) {
      setWagmiConnection(null, null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const wc = await getWalletClient(wagmiConfig, {
          chainId: CHAIN_ID,
          account: walletAddress as `0x${string}`,
          assertChainId: false,
        });
        const eip1193 = {
          request: (args: { method: string; params?: readonly unknown[] | object }) =>
            wc.request(args as Parameters<(typeof wc)['request']>[0]),
        };
        if (!cancelled) {
          setWagmiConnection(walletAddress, eip1193 as unknown as typeof window.ethereum);
        }
      } catch {
        const injected =
          typeof window !== 'undefined'
            ? (window as unknown as { ethereum?: unknown }).ethereum
            : undefined;
        if (!cancelled) {
          setWagmiConnection(walletAddress, (injected as typeof window.ethereum) ?? null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, walletAddress, wagmiConfig]);

  // Expose RainbowKit modal to legacy connectWallet() callers.
  useEffect(() => {
    setOpenConnectModalRef(() => openConnectModal?.());
    return () => setOpenConnectModalRef(null);
  }, [openConnectModal]);

  // Surface email send failures as toasts.
  useEffect(() => {
    setEmailFailureHandler((msg) => toast.error(msg));
    return () => setEmailFailureHandler(null);
  }, []);

  // Send daily digest + merge follows when wallet attaches.
  useEffect(() => {
    if (walletAddress) maybeSendDailyDigest(walletAddress).catch(() => {});
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) mergeFollowsFromServer(walletAddress).catch(() => {});
  }, [walletAddress]);

  const hardDisconnect = useCallback(() => {
    playClick();
    wagmiDisconnect();
    setWagmiConnection(null, null);
    disconnectWallet();
    toast.info('Wallet disconnected');
  }, [wagmiDisconnect]);

  const disconnect = useCallback(
    (e?: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      hardDisconnect();
    },
    [hardDisconnect],
  );

  return {
    walletAddress: walletAddress as `0x${string}` | undefined,
    isConnected,
    openConnectModal,
    disconnect,
    hardDisconnect,
  };
}
