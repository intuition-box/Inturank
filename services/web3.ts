
import { createPublicClient, createWalletClient, custom, http, parseEther, formatEther, pad, getAddress, isAddress, type Hex, stringToHex, toHex, keccak256, decodeEventLog, slice, encodeFunctionData, parseEventLogs, type TransactionReceipt, UserRejectedRequestError } from 'viem';
import { switchChain as wagmiSwitchChain } from '@wagmi/core';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';
import { CHAIN_ID, NETWORK_NAME, RPC_URL, MULTI_VAULT_ABI, MULTI_VAULT_ADDRESS, EXPLORER_URL, FEE_PROXY_ADDRESS, FEE_PROXY_ABI, LINEAR_CURVE_ID, OFFSET_PROGRESSIVE_CURVE_ID, DISPLAY_DIVISOR, CURRENCY_SYMBOL, CURVE_OFFSET, DISTRUST_ATOM_ID, LIST_PREDICATE_ID, IS_PREDICATE_ID } from '../constants';
import { wagmiConfig } from '../wagmi-config';
import { getSubgraphPositionSharesForTerm, pickEffectiveShareBalance } from './graphql';
import { Transaction } from '../types';
import { toast } from '../components/Toast';
import EthereumProvider from '@walletconnect/ethereum-provider';
import {
  calculateTripleId as intuitionCalculateTripleId,
  calculateCounterTripleId as intuitionCalculateCounterTripleId,
} from '@0xintuition/sdk';

export const intuitionChain = {
  id: CHAIN_ID,
  name: NETWORK_NAME,
  network: 'intuition',
  nativeCurrency: { decimals: 18, name: 'TRUST', symbol: 'TRUST' }, 
  rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: 'Intuition Explorer', url: EXPLORER_URL },
  },
} as const;

export const publicClient = createPublicClient({
  chain: intuitionChain,
  transport: http(RPC_URL),
});

// Active EIP-1193 provider (injected or WalletConnect).
let activeProvider: any | null = null;

// When using RainbowKit/wagmi, Layout syncs the connected address and provider here so the rest of the app (getConnectedAccount, getProvider) works unchanged.
let wagmiAddress: string | null = null;

export function setWagmiConnection(address: string | null, provider: any) {
  wagmiAddress = address;
  activeProvider = provider;
}

// When using RainbowKit, Layout sets this so connectWallet() can open the modal for legacy callers (Account, Portfolio, etc.)
let openConnectModalRef: (() => void) | null = null;
export function setOpenConnectModalRef(fn: (() => void) | null) {
  openConnectModalRef = fn;
}

// Dedicated client for ENS resolution (Ethereum Mainnet) using a more robust public RPC
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth.llamarpc.com'),
});

type InjectedPreference = 'default' | 'metamask' | 'rabby' | 'brave';

const getBrowserProvider = (preference: InjectedPreference = 'default') => {
  if (typeof window === 'undefined') return null;
  const ethereum = (window as any).ethereum;
  if (!ethereum) return null;
  const providers: any[] =
    ethereum.providers && Array.isArray(ethereum.providers)
      ? ethereum.providers
      : [ethereum];

  const pick = (predicate: (p: any) => boolean) =>
    providers.find(predicate) || providers[0];

  switch (preference) {
    case 'metamask':
      return pick((p) => p.isMetaMask);
    case 'rabby':
      return pick((p) => p.isRabby);
    case 'brave':
      return pick((p) => p.isBraveWallet || p.isBrave);
    default:
      return providers[0];
  }
};

export const getProvider = () => {
  return activeProvider || getBrowserProvider('default');
};

/** Send native TRUST to an address. Uses same provider as rest of app so wallet prompts. */
export const sendNativeTransfer = async (
  fromAccount: string,
  to: `0x${string}`,
  valueWei: bigint
): Promise<string> => {
  const provider = getProvider();
  if (!provider) throw new Error('Wallet not connected');
  const account = getAddress(fromAccount);
  
  // Estimate gas properly first to avoid "intrinsic gas too low" errors
  // Then let MetaMask handle gas price estimation to avoid display bugs
  let estimatedGas: bigint;
  try {
    estimatedGas = await publicClient.estimateGas({
      account: account as `0x${string}`,
      to,
      value: valueWei,
    });
    // Add 20% buffer for safety
    estimatedGas = (estimatedGas * 120n) / 100n;
  } catch {
    // Fallback to higher default if estimation fails
    estimatedGas = 100000n; // Higher default for L3s
  }
  
  // Use walletClient but DON'T set gasPrice - let MetaMask estimate it
  // This prevents MetaMask from showing wrong gas fees
  const walletClient = createWalletClient({
    chain: intuitionChain,
    transport: custom(provider),
    account: account as `0x${string}`,
  });
  
  const hash = await walletClient.sendTransaction({
    to,
    value: valueWei,
    account: account as `0x${string}`,
    gas: estimatedGas, // Use properly estimated gas
    // Don't set gasPrice - let MetaMask fetch from network to avoid display bugs
  });
  return hash;
};

/**
 * Broadcasts a generic transaction with data (calldata), value, and recipient.
 * Used primarily by the AI Skill Agent to execute generated intents.
 */
export const broadcastTransaction = async (
  fromAccount: string,
  to: `0x${string}`,
  valueWei: bigint,
  data?: `0x${string}`
): Promise<string> => {
  const provider = getProvider();
  if (!provider) throw new Error('Wallet not connected');
  const account = getAddress(fromAccount);
  
  let estimatedGas: bigint;
  try {
    estimatedGas = await publicClient.estimateGas({
      account: account as `0x${string}`,
      to,
      value: valueWei,
      data,
    });
    estimatedGas = (estimatedGas * 125n) / 100n;
  } catch {
    estimatedGas = 300000n;
  }
  
  const walletClient = createWalletClient({
    chain: intuitionChain,
    transport: custom(provider),
    account: account as `0x${string}`,
  });
  
  const hash = await walletClient.sendTransaction({
    to,
    value: valueWei,
    data,
    account: account as `0x${string}`,
    gas: estimatedGas,
  });
  return hash;
};

/** Normalize term id to bytes32 for protocol hashing (matches MultiVault inputs). */
const padBytes32Term = (id: string): Hex =>
    pad((id.startsWith('0x') ? id : `0x${id}`) as Hex, { size: 32 });

/** MultiVault `isTermCreated` is unreliable for protocol singletons; createTriples still accepts them. */
function isProtocolSingletonTermId(id: string): boolean {
    const k = padBytes32Term(id).toLowerCase();
    return (
        k === padBytes32Term(DISTRUST_ATOM_ID).toLowerCase() ||
        k === padBytes32Term(LIST_PREDICATE_ID).toLowerCase() ||
        k === padBytes32Term(IS_PREDICATE_ID).toLowerCase()
    );
}

/**
 * Canonical triple term id (protocol uses TRIPLE_SALT — must match MultiVault.calculateTripleId).
 */
export const calculateTripleId = (subjectId: string, predicateId: string, objectId: string): Hex => {
    return intuitionCalculateTripleId(
        padBytes32Term(subjectId),
        padBytes32Term(predicateId),
        padBytes32Term(objectId),
    );
};

/**
 * Counter triple id (COUNTER_SALT + triple id).
 */
export const calculateCounterTripleId = (tripleId: string): Hex => {
    return intuitionCalculateCounterTripleId(padBytes32Term(tripleId));
};

const DISCONNECT_FLAG_KEY = 'inturank_wallet_disconnected';

export const getConnectedAccount = async (): Promise<string | null> => {
  if (typeof window !== 'undefined' && localStorage.getItem(DISCONNECT_FLAG_KEY)) return null;
  if (wagmiAddress) return wagmiAddress;
  const provider = getProvider();
  if (!provider) return null;
  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    return accounts[0] ? getAddress(accounts[0]) : null;
  } catch { return null; }
};

function isUserRejectedError(error: unknown): boolean {
  if (error instanceof UserRejectedRequestError) return true;
  if (typeof error === 'object' && error !== null) {
    const e = error as { code?: number; name?: string };
    if (e.code === 4001) return true;
    if (e.name === 'UserRejectedRequestError') return true;
  }
  const msg = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  if (msg.includes('user rejected') || msg.includes('user denied')) return true;
  return false;
}

/** Public alias for batch / Arena flows (MetaMask reject, viem UserRejectedRequestError). */
export function isUserRejectedWalletError(error: unknown): boolean {
  return isUserRejectedError(error);
}

/** MetaMask validates the RPC when adding a chain; Intuition’s JSON-RPC is on `/http` (bare `/` often fails). */
function rpcUrlForWalletChainPrompt(): string {
  const raw = String(RPC_URL ?? '').trim();
  const base = raw.replace(/\/+$/, '');
  if (CHAIN_ID === 1155 || CHAIN_ID === 13579) {
    if (base.toLowerCase().endsWith('/http')) return base;
    return `${base}/http`;
  }
  return raw || base;
}

function walletAddEthereumChainPayload() {
  const chainIdHex = `0x${CHAIN_ID.toString(16)}` as const;
  return {
    chainId: chainIdHex,
    chainName: NETWORK_NAME,
    nativeCurrency: { name: 'TRUST', symbol: 'TRUST', decimals: 18 },
    rpcUrls: [rpcUrlForWalletChainPrompt()] as const,
    blockExplorerUrls: [EXPLORER_URL] as const,
  };
}

async function switchNetworkViaInjectedProvider(provider: NonNullable<ReturnType<typeof getProvider>>) {
  const chainIdHex = `0x${CHAIN_ID.toString(16)}`;
  const addParams = walletAddEthereumChainPayload();

  const attemptSwitch = () =>
    provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });

  try {
    await attemptSwitch();
    return;
  } catch (error: unknown) {
    if (isUserRejectedError(error)) return;
    try {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [addParams],
      });
    } catch (addError: unknown) {
      if (isUserRejectedError(addError)) return;
      // Chain may already be registered; still try switching again.
    }
    try {
      await attemptSwitch();
    } catch (e2: unknown) {
      if (isUserRejectedError(e2)) return;
      console.error('SWITCH_NETWORK_ERROR:', error, e2);
      toast.error('Could not switch network. Try switching to Intuition in your wallet.');
    }
  }
}

/** Prefer Wagmi `switchChain` so RainbowKit’s active connector prompts the wallet (EIP-1193 shim was a no-op in some cases). */
export const switchNetwork = async () => {
  const addEthereumChainParameter = {
    chainName: NETWORK_NAME,
    nativeCurrency: { name: 'TRUST', symbol: 'TRUST', decimals: 18 },
    rpcUrls: [rpcUrlForWalletChainPrompt()],
    blockExplorerUrls: [EXPLORER_URL],
  };

  if (typeof window !== 'undefined') {
    try {
      await wagmiSwitchChain(wagmiConfig, {
        chainId: CHAIN_ID,
        addEthereumChainParameter,
      });
      return;
    } catch (error: unknown) {
      if (isUserRejectedError(error)) return;
      console.warn('wagmi switchChain failed, falling back to injected provider:', error);
    }
  }

  const provider = getProvider();
  if (!provider) {
    toast.error('Wallet not ready. Wait a moment and try again, or switch network in your wallet.');
    return;
  }

  await switchNetworkViaInjectedProvider(provider);
};

export type WalletConnector = 'injected' | 'walletconnect';
export type InjectedWalletPreference = InjectedPreference;

export const connectWallet = async (
  connector: WalletConnector = 'injected',
  injectedPreference: InjectedWalletPreference = 'default',
): Promise<string | null> => {
  // When RainbowKit is used, open its connect modal and return null; connection state is synced via setWagmiConnection in Layout.
  if (openConnectModalRef) {
    openConnectModalRef();
    return null;
  }
  if (connector === 'walletconnect') {
    try {
      const projectId = (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
      if (!projectId) {
        toast.error("MISSING_WC_PROJECT_ID: Set VITE_WALLETCONNECT_PROJECT_ID in .env.local");
        return null;
      }

      const provider = await EthereumProvider.init({
        projectId,
        showQrModal: true,
        chains: [CHAIN_ID],
        rpcMap: {
          [CHAIN_ID]: RPC_URL,
        },
        metadata: {
          name: 'IntuRank',
          description: 'Semantic markets on the Intuition Network',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://inturank.intuition.box',
          icons: [],
        },
      });

      await provider.connect();
      const accounts = (await provider.request({ method: 'eth_accounts' })) as string[] | undefined;
      if (!Array.isArray(accounts) || accounts.length === 0) return null;
      const address = getAddress(accounts[0]);

      activeProvider = provider;
      if (typeof window !== 'undefined') localStorage.removeItem(DISCONNECT_FLAG_KEY);
      return address;
    } catch (error: any) {
      if (error?.code === 4001) toast.error("REJECTED_BY_USER");
      else toast.error(`WALLETCONNECT_ERROR: ${error?.message || 'Failed to connect'}`);
      return null;
    }
  }

  const provider = getBrowserProvider(injectedPreference);
  if (!provider) {
    toast.error("NO_PROVIDER: Install MetaMask.");
    return null;
  }
  
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) return null;
    const address = getAddress(accounts[0]);
    
    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    if (parseInt(chainIdHex, 16) !== CHAIN_ID) {
        await switchNetwork();
    }
    activeProvider = provider;
    if (typeof window !== 'undefined') localStorage.removeItem(DISCONNECT_FLAG_KEY);
    return address;
  } catch (error: any) {
    if (error.code === 4001) toast.error("REJECTED_BY_USER");
    else toast.error(`ERROR: ${error.message}`);
    return null; 
  }
};

export const getWalletBalance = async (address: string): Promise<string> => {
  try {
    const balance = await publicClient.getBalance({ address: address as `0x${string}` });
    return formatEther(balance);
  } catch { return "0.00"; }
};

export const getShareBalance = async (account: string, termId: string, curveId: number = OFFSET_PROGRESSIVE_CURVE_ID) => {
  try {
    const rawTermId = termId.startsWith('0x') ? termId : `0x${termId}`;
    const termIdBytes32 = pad(rawTermId as Hex, { size: 32 });
    const targetCurve = BigInt(curveId);
    const shares = await publicClient.readContract({
      address: MULTI_VAULT_ADDRESS as `0x${string}`,
      abi: MULTI_VAULT_ABI,
      functionName: 'getShares',
      args: [getAddress(account), termIdBytes32, targetCurve]
    } as any);
    return formatEther(shares as bigint);
  } catch { return "0"; }
};

/** Raw `getShares` (wei) — used to enforce protocol's “no counter-stake on the same triple” invariant before deposits. */
export const getRawShareBalance = async (
  account: string,
  termId: string,
  curveId: number = LINEAR_CURVE_ID,
): Promise<bigint> => {
  try {
    const tid = padBytes32Term(termId);
    const shares = await publicClient.readContract({
      address: MULTI_VAULT_ADDRESS as `0x${string}`,
      abi: MULTI_VAULT_ABI,
      functionName: 'getShares',
      args: [getAddress(account), tid, BigInt(curveId)],
    } as any);
    return shares as bigint;
  } catch {
    return 0n;
  }
};

/** RPC getShares merged with subgraph positions — avoids 0 balance when indexer has your deposit but the vault read disagrees. */
export const getShareBalanceEffective = async (account: string, termId: string, curveId: number = OFFSET_PROGRESSIVE_CURVE_ID) => {
  const rpc = await getShareBalance(account, termId, curveId);
  try {
    const sub = await getSubgraphPositionSharesForTerm(account, termId);
    const gqlStr = curveId === LINEAR_CURVE_ID ? sub.linear : sub.exponential;
    return pickEffectiveShareBalance(rpc, gqlStr);
  } catch {
    return rpc;
  }
};

/** Batch getShareBalance via multicall — reduces N RPC calls to 1. Returns map of "termId:curveId" -> shares string. */
const MULTICALL_BATCH_SIZE = 80;
export const getShareBalancesBatch = async (
  account: string,
  items: { termId: string; curveId: number }[]
): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  if (!items.length) return result;
  const checksumAccount = getAddress(account);
  for (let i = 0; i < items.length; i += MULTICALL_BATCH_SIZE) {
    const batch = items.slice(i, i + MULTICALL_BATCH_SIZE);
    const contracts = batch.map(({ termId, curveId }) => {
      const rawTermId = termId.startsWith('0x') ? termId : `0x${termId}`;
      const termIdBytes32 = pad(rawTermId as Hex, { size: 32 });
      return {
        address: MULTI_VAULT_ADDRESS as `0x${string}`,
        abi: MULTI_VAULT_ABI,
        functionName: 'getShares' as const,
        args: [checksumAccount, termIdBytes32, BigInt(curveId)] as const,
      };
    });
    try {
      const results = await publicClient.multicall({ contracts, allowFailure: true });
      batch.forEach(({ termId, curveId }, idx) => {
        const key = `${termId.toLowerCase()}:${curveId}`;
        const r = results[idx];
        result.set(key, r?.status === 'success' && r.result != null ? formatEther(r.result as bigint) : '0');
      });
    } catch {
      batch.forEach(({ termId, curveId }) => result.set(`${termId.toLowerCase()}:${curveId}`, '0'));
    }
  }
  return result;
};

export const getQuoteRedeem = async (sharesAmount: string, termId: string, account: string, curveId: number = LINEAR_CURVE_ID): Promise<string> => {
    try {
        const rawTermId = termId.startsWith('0x') ? termId : `0x${termId}`;
        const termIdBytes32 = pad(rawTermId as Hex, { size: 32 });
        const targetCurve = BigInt(curveId);
        const checksum = getAddress(account);
        let sharesWei = parseEther(sharesAmount || '0');
        const balanceWei = await publicClient.readContract({
            address: MULTI_VAULT_ADDRESS as `0x${string}`,
            abi: MULTI_VAULT_ABI,
            functionName: 'getShares',
            args: [checksum, termIdBytes32, targetCurve],
        } as any) as bigint;
        if (sharesWei > balanceWei) sharesWei = balanceWei;
        if (sharesWei === 0n) return '0';
        const result = await publicClient.readContract({
            address: MULTI_VAULT_ADDRESS as `0x${string}`,
            abi: MULTI_VAULT_ABI,
            functionName: 'previewRedeem',
            args: [termIdBytes32, targetCurve, sharesWei],
        } as any) as [bigint, bigint];
        return formatEther(result[0]);
    } catch {
        return '0';
    }
};

export const depositToVault = async (amount: string, termId: string, receiver: string, curveIdOrOnProgress?: number | ((log: string) => void), onProgress?: (log: string) => void) => {
  const curveId = typeof curveIdOrOnProgress === 'function' ? LINEAR_CURVE_ID : (curveIdOrOnProgress ?? LINEAR_CURVE_ID);
  const progressCb = typeof curveIdOrOnProgress === 'function' ? curveIdOrOnProgress : onProgress;
  const checksumReceiver = getAddress(receiver);
  const termIdBytes32 = pad((termId.startsWith('0x') ? termId : `0x${termId}`) as Hex, { size: 32 });
  const provider = getProvider();
  const walletClient = createWalletClient({ chain: intuitionChain, transport: custom(provider), account: checksumReceiver });
  const assets = parseEther(amount);
  const curveIdBigInt = BigInt(curveId);

  try {
      progressCb?.("Simulating Gas & Total Cost Basis...");
      const totalCost = await publicClient.readContract({
          address: FEE_PROXY_ADDRESS as `0x${string}`,
          abi: FEE_PROXY_ABI,
          functionName: 'getTotalDepositCost',
          args: [assets]
      } as any) as bigint;
      progressCb?.(`Handshake Cost Calculated: ${formatEther(totalCost)} ${CURRENCY_SYMBOL}`);

      progressCb?.("Awaiting Biometric Signature...");
        const { request } = await publicClient.simulateContract({
            address: FEE_PROXY_ADDRESS as `0x${string}`,
            abi: FEE_PROXY_ABI,
            functionName: 'deposit',
            account: checksumReceiver,
            args: [checksumReceiver, termIdBytes32, curveIdBigInt, 0n],
            value: (totalCost * 102n) / 100n, // 2% safety buffer; amount is msg.value (proxy splits fee)
        } as any);

      const hash = await walletClient.writeContract(request);
      progressCb?.(`Broadcasting Packet to Mainnet... Hash: ${hash.slice(0,10)}...`);
      
      let actualShares = 0n;
      try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          progressCb?.("Transaction Reconciled in Block.");
          
          for (const log of receipt.logs) {
              try {
                  const decoded = decodeEventLog({
                      abi: MULTI_VAULT_ABI,
                      data: log.data,
                      topics: (log as any).topics,
                  });
                  if ((decoded as any).eventName === 'Deposit' || (decoded as any).args?.shares) {
                      actualShares = (decoded as any).args.shares;
                  }
              } catch {}
          }
      } catch (waitError: any) {
          // If the RPC cannot look up the hash yet (or returns malformed),
          // fall back to a heuristic and let the indexer reconcile later.
          console.warn("DEPOSIT_RECEIPT_TIMEOUT:", waitError);
          progressCb?.("Indexing delayed on RPC. Local estimate will be used until explorer catches up.");
      }

      if (actualShares === 0n) {
           actualShares = assets / 15n; 
      }

      return { hash, shares: actualShares, assets };
  } catch (error: any) {
      console.error("DEPOSIT_ERROR:", error);
      throw error;
  }
};

/** One leg of FeeProxy.depositBatch (multiple vault deposits in a single tx, one fee lump). */
export type DepositBatchLeg = {
  termId: string;
  assetsWei: bigint;
  curveId?: number;
};

/**
 * FeeProxy depositBatch — matches on-chain fee rule: totalDeposit + calculateDepositFee(count, totalDeposit).
 */
export const depositBatchToVaults = async (
  legs: DepositBatchLeg[],
  receiver: string,
  onProgress?: (log: string) => void,
): Promise<{ hash: `0x${string}` }> => {
  if (!legs.length) throw new Error('No deposits in batch.');
  const checksumReceiver = getAddress(receiver);
  const provider = getProvider();
  if (!provider) throw new Error('Wallet not connected');
  const walletClient = createWalletClient({
    chain: intuitionChain,
    transport: custom(provider),
    account: checksumReceiver,
  });

  const termIds = legs.map((l) =>
    pad((l.termId.startsWith('0x') ? l.termId : `0x${l.termId}`) as Hex, { size: 32 }),
  );
  const curveIds = legs.map((l) => BigInt(l.curveId ?? LINEAR_CURVE_ID));
  const assets = legs.map((l) => l.assetsWei);
  const minShares = legs.map(() => 0n);
  const totalDeposit = assets.reduce((a, b) => a + b, 0n);

  onProgress?.('Calculating batch deposit total (TRUST + fees)…');
  const fee = (await publicClient.readContract({
    address: FEE_PROXY_ADDRESS as `0x${string}`,
    abi: FEE_PROXY_ABI,
    functionName: 'calculateDepositFee',
    args: [BigInt(legs.length), totalDeposit],
  } as any)) as bigint;
  const totalRequired = totalDeposit + fee;
  const value = (totalRequired * 102n) / 100n;

  onProgress?.(`Batch total with fee buffer: ${formatEther(value)} ${CURRENCY_SYMBOL}`);

  let request: any;
  try {
    const simulation = await publicClient.simulateContract({
      address: FEE_PROXY_ADDRESS as `0x${string}`,
      abi: FEE_PROXY_ABI,
      functionName: 'depositBatch',
      account: checksumReceiver,
      args: [checksumReceiver, termIds, curveIds, assets, minShares],
      value,
    } as any);
    request = simulation.request;
  } catch (e: any) {
    console.error('DEPOSIT_BATCH_SIM_ERROR:', e);
    throw e;
  }

  onProgress?.('Confirm batch deposit in wallet…');
  const hash = await walletClient.writeContract(request);
  onProgress?.(`Broadcasting batch… ${hash.slice(0, 10)}…`);
  try {
    await publicClient.waitForTransactionReceipt({ hash });
    onProgress?.('Batch confirmed on-chain.');
  } catch (waitError: any) {
    console.warn('DEPOSIT_BATCH_RECEIPT_TIMEOUT:', waitError);
  }
  window.dispatchEvent(new Event('local-tx-updated'));
  return { hash };
};

export const redeemFromVault = async (sharesAmount: string, termId: string, receiver: string, curveIdOrOnProgress?: number | ((log: string) => void), onProgress?: (log: string) => void) => {
  const curveId = typeof curveIdOrOnProgress === 'function' ? LINEAR_CURVE_ID : (curveIdOrOnProgress ?? LINEAR_CURVE_ID);
  const progressCb = typeof curveIdOrOnProgress === 'function' ? curveIdOrOnProgress : onProgress;
  const checksumReceiver = getAddress(receiver);
  const termIdBytes32 = pad((termId.startsWith('0x') ? termId : `0x${termId}`) as Hex, { size: 32 });
  const provider = getProvider();
  const walletClient = createWalletClient({ chain: intuitionChain, transport: custom(provider), account: checksumReceiver });
  const shares = parseEther(sharesAmount);
  const curveIdBigInt = BigInt(curveId);

  try {
      progressCb?.("Calculating Exit Liquidity...");
      const balanceWei = await publicClient.readContract({
          address: MULTI_VAULT_ADDRESS as `0x${string}`,
          abi: MULTI_VAULT_ABI,
          functionName: 'getShares',
          args: [checksumReceiver, termIdBytes32, curveIdBigInt],
      } as any) as bigint;
      let sharesEffective = shares;
      if (shares > balanceWei) {
          progressCb?.(
              `Requested ${formatEther(shares)} shares; on-chain balance is ${formatEther(balanceWei)}. Using on-chain max.`
          );
          sharesEffective = balanceWei;
      }
      if (sharesEffective === 0n) {
          throw new Error(
              `No shares to redeem on this vault for the selected curve (on-chain balance is 0). If the UI showed a balance from the indexer, pick the other curve or wait for RPC to sync.`
          );
      }
      const preview = await publicClient.readContract({
          address: MULTI_VAULT_ADDRESS as `0x${string}`,
          abi: MULTI_VAULT_ABI,
          functionName: 'previewRedeem',
          args: [termIdBytes32, curveIdBigInt, sharesEffective],
      } as any) as [bigint, bigint];
      progressCb?.(`Projected Proceeds: ${formatEther(preview[0])} ${CURRENCY_SYMBOL}`);

      progressCb?.("Awaiting Exit Signature...");
      const { request } = await publicClient.simulateContract({
          address: MULTI_VAULT_ADDRESS as `0x${string}`,
          abi: MULTI_VAULT_ABI,
          functionName: 'redeemBatch',
          account: checksumReceiver,
          args: [checksumReceiver, [termIdBytes32], [curveIdBigInt], [sharesEffective], [0n]],
      } as any);

      const hash = await walletClient.writeContract(request);
      progressCb?.(`Liquidating Position... Hash: ${hash.slice(0,10)}...`);
      
      let actualAssets = preview[0];
      try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          progressCb?.("Handshake Cleared. Position Terminated.");
          
          for (const log of receipt.logs) {
              try {
                  const decoded = decodeEventLog({
                      abi: MULTI_VAULT_ABI,
                      data: log.data,
                      topics: (log as any).topics,
                  });
                  if ((decoded as any).eventName === 'Withdraw' || (decoded as any).args?.assets) {
                      actualAssets = (decoded as any).args.assets;
                  }
              } catch {}
          }
      } catch (waitError: any) {
          console.warn("REDEEM_RECEIPT_TIMEOUT:", waitError);
          progressCb?.("Indexing delayed on RPC. Local estimate will be used until explorer catches up.");
      }

      return { hash, assets: actualAssets, shares: sharesEffective };
  } catch (error: any) {
      console.error("REDEEM_ERROR:", error);
      throw error;
  }
};

const PROXY_APPROVAL_CACHE_KEY = 'inturank_proxy_approved';

/** Last-known on-chain positive (write-through after readContract or tx). Never used to skip RPC. */
function getProxyApprovalCache(addr: string): boolean {
    try {
        const raw = localStorage.getItem(PROXY_APPROVAL_CACHE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        const entry = data[addr.toLowerCase()];
        return Boolean(entry?.ts);
    } catch {
        return false;
    }
}

function setProxyApprovalCache(addr: string): void {
    try {
        const raw = localStorage.getItem(PROXY_APPROVAL_CACHE_KEY) || '{}';
        const data = JSON.parse(raw);
        data[addr.toLowerCase()] = { ts: Date.now() };
        localStorage.setItem(PROXY_APPROVAL_CACHE_KEY, JSON.stringify(data));
    } catch (_) {}
}

export const markProxyApproved = (walletAddress: string): void => {
    try {
        setProxyApprovalCache(getAddress(walletAddress));
    } catch (_) {}
};

/**
 * True if we recently recorded a successful approve tx or `checkProxyApproval` read.
 * Used as a fallback when `isApproved` reads lag after a mined approval (RPC / view mismatch).
 */
export const hasCachedProxyApproval = (walletAddress: string): boolean =>
    getProxyApprovalCache(getAddress(walletAddress));

/** Reads MultiVault.isApproved(account, FeeProxy, 1) on-chain every time — localStorage is only updated to mirror truth, never a substitute. */
export const checkProxyApproval = async (walletAddress: string): Promise<boolean> => {
    const addr = getAddress(walletAddress);
    try {
        const approved = await publicClient.readContract({
            address: MULTI_VAULT_ADDRESS as `0x${string}`,
            abi: MULTI_VAULT_ABI,
            functionName: 'isApproved',
            args: [addr, getAddress(FEE_PROXY_ADDRESS), 1]
        } as any);
        const ok = Boolean(approved);
        if (ok) {
            setProxyApprovalCache(addr);
        }
        // Do not clear cache on false: reads can fail or lag vs a mined approve tx; `grantProxyApproval` sets cache from receipt.
        return ok;
    } catch (e) {
        return false;
    }
};

/**
 * After a proxy approval tx, RPC reads can briefly lag behind the receipt.
 * Use this before failing a deposit or right after grantProxyApproval.
 */
export const checkProxyApprovalWithRetry = async (
    walletAddress: string,
    opts?: { retries?: number; delayMs?: number }
): Promise<boolean> => {
    const retries = opts?.retries ?? 8;
    const delayMs = opts?.delayMs ?? 400;
    const addr = getAddress(walletAddress);
    for (let i = 0; i < retries; i++) {
        const ok = await checkProxyApproval(addr);
        if (ok) return true;
        if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
};

/**
 * Hybrid gate: try on-chain `isApproved` first (optionally with read retries); if still false, trust localStorage
 * written after a successful enable tx or a prior positive read — avoids re-prompting when RPC/view lags.
 */
export const getProxyApprovalStatus = async (
    walletAddress: string,
    opts?: { readRetries?: number; readDelayMs?: number }
): Promise<boolean> => {
    const addr = getAddress(walletAddress);
    const retries = opts?.readRetries ?? 0;
    const onChain =
        retries > 0
            ? await checkProxyApprovalWithRetry(addr, {
                  retries,
                  delayMs: opts?.readDelayMs ?? 400,
              })
            : await checkProxyApproval(addr);
    if (onChain) return true;
    return hasCachedProxyApproval(addr);
};

/** Emitted by MultiVault when `approve(operator, approvalType)` is processed (matches @0xintuition/protocol). */
const APPROVAL_TYPE_UPDATED_ABI = [
    {
        type: 'event',
        name: 'ApprovalTypeUpdated',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'receiver', type: 'address', indexed: true },
            { name: 'approvalType', type: 'uint8', indexed: false },
        ],
    },
] as const;

/**
 * Confirms FeeProxy approval from receipt logs when `isApproved` reads fail (RPC lag, indexer, or ABI drift).
 */
function didApprovalEventConfirm(
    receipt: TransactionReceipt,
    account: `0x${string}`,
    feeProxy: `0x${string}`
): boolean {
    try {
        const logs = parseEventLogs({
            abi: APPROVAL_TYPE_UPDATED_ABI,
            logs: receipt.logs,
            eventName: 'ApprovalTypeUpdated',
        });
        const u = getAddress(account);
        const f = getAddress(feeProxy);
        for (const l of logs) {
            const s = getAddress(l.args.sender as `0x${string}`);
            const r = getAddress(l.args.receiver as `0x${string}`);
            if ((s === u && r === f) || (s === f && r === u)) return true;
        }
    } catch {
        /* malformed logs */
    }
    return false;
}

const tryGrantWithProvider = async (provider: any, checksumAccount: `0x${string}`): Promise<string> => {
    const walletClient = createWalletClient({
        chain: intuitionChain,
        transport: custom(provider),
        account: checksumAccount,
    });
    const { request } = await publicClient.simulateContract({
        address: MULTI_VAULT_ADDRESS as `0x${string}`,
        abi: MULTI_VAULT_ABI,
        functionName: 'approve',
        account: checksumAccount,
        args: [getAddress(FEE_PROXY_ADDRESS), 1],
    } as any);
    return walletClient.writeContract(request);
};

export const grantProxyApproval = async (walletAddress: string): Promise<void> => {
    const checksumAccount = getAddress(walletAddress) as `0x${string}`;
    const primary = getProvider();
    const metaMask = getBrowserProvider('metamask');
    const fallback = getBrowserProvider('default');
    const providers = [primary, metaMask, fallback].filter(Boolean) as any[];
    if (!providers.length) throw new Error('Wallet not connected. Connect your wallet first.');
    let hash: string | undefined;
    let lastError: any;
    for (const provider of providers) {
        try {
            hash = await tryGrantWithProvider(provider, checksumAccount);
            break;
        } catch (e: any) {
            lastError = e;
        }
    }
    if (!hash) {
        const msg = String(lastError?.message || lastError?.error?.message || lastError?.reason || lastError?.shortMessage || lastError || '');
        const causeMsg = String(lastError?.cause?.message || lastError?.cause || '');
        const combined = msg + ' ' + causeMsg;
        if (/Extension ID|sendMessage|runtime\.sendMessage/i.test(combined)) {
            throw new Error('Wallet extension error. Try: refresh the page, disable other wallet extensions, or use a different browser.');
        }
        if (lastError?.code === 4001 || /reject/i.test(msg)) {
            throw new Error('Wallet not prompting. Try: refresh the page, disable other wallet extensions, or use Chrome with only MetaMask.');
        }
        throw lastError;
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
    if (receipt.status !== 'success') {
        throw new Error('Approval transaction failed on-chain.');
    }

    const fee = getAddress(FEE_PROXY_ADDRESS);
    const fromRead = await checkProxyApprovalWithRetry(checksumAccount, { retries: 8, delayMs: 450 });
    const fromLogs = didApprovalEventConfirm(receipt, checksumAccount, fee);

    if (fromRead || fromLogs) {
        setProxyApprovalCache(checksumAccount);
        toast.success("HANDSHAKE_COMPLETE: Protocol enabled.");
        return;
    }

    // Receipt succeeded — our approve tx was mined. `isApproved` reads can still fail (RPC, contract view drift).
    // Trust the successful receipt so users are not blocked; deposit path still hits the real contract.
    console.warn(
        '[IntuRank] Proxy approval tx confirmed but isApproved read did not return true yet; trusting receipt.',
        { hash }
    );
    setProxyApprovalCache(checksumAccount);
    toast.success("HANDSHAKE_COMPLETE: Protocol enabled.");
};

const LOCAL_TX_KEY = 'inturank_ledger_v3';
export const saveLocalTransaction = (tx: Transaction, account: string) => {
  const key = `${LOCAL_TX_KEY}_${account.toLowerCase()}`;
  const current: Transaction[] = JSON.parse(localStorage.getItem(key) || '[]');
  localStorage.setItem(key, JSON.stringify([tx, ...current].slice(0, 100)));
  window.dispatchEvent(new Event('local-tx-updated'));
};

export const getLocalTransactions = (account: string): Transaction[] => {
  if (!account) return [];
  return JSON.parse(localStorage.getItem(`${LOCAL_TX_KEY}_${account.toLowerCase()}`) || '[]');
};

export const getWatchlist = (account: string): string[] => {
    if (!account) return [];
    return JSON.parse(localStorage.getItem(`inturank_watchlist_v1_${account.toLowerCase()}`) || '[]');
};

export const isInWatchlist = (id: string, account: string): boolean => {
    if (!id || !account) return false;
    return getWatchlist(account).includes(id.toLowerCase());
};

export const toggleWatchlist = (id: string, account: string): boolean => {
    if (!id || !account) return false;
    const list = getWatchlist(account);
    const normalizedId = id.toLowerCase();
    const index = list.indexOf(normalizedId);
    let added = false;
    if (index > -1) { list.splice(index, 1); added = false; }
    else { list.push(normalizedId); added = true; }
    localStorage.setItem(`inturank_watchlist_v1_${account.toLowerCase()}`, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('watchlist-updated', { detail: { account } }));
    return added;
};

/** Pull nested RPC / viem text so we don't collapse everything to a generic revert. */
function collectErrorText(error: unknown, depth = 0): string {
    if (depth > 5 || error == null) return "";
    if (typeof error === "string") return error;
    if (typeof error === "object") {
        const e = error as Record<string, unknown>;
        const parts: string[] = [];
        for (const k of ["details", "shortMessage", "message", "cause"]) {
            const v = e[k];
            if (typeof v === "string" && v.trim()) parts.push(v.trim());
            else if (k === "cause" && v) parts.push(collectErrorText(v, depth + 1));
        }
        return parts.filter(Boolean).join(" | ");
    }
    return String(error);
}

/** Collapses accidental duplicate halves (e.g. nested viem error repeats the same sentence). */
export function collapseAdjacentDuplicateSentences(msg: string): string {
    const t = msg.trim();
    if (t.length < 12) return msg;
    const n = t.length;
    if (n % 2 === 0) {
        const half = n / 2;
        const a = t.slice(0, half);
        const b = t.slice(half);
        if (a === b) return a.trim();
    }
    const dupParagraph = /^([\s\S]+?)\.\s+\1\.?$/;
    const m = t.match(dupParagraph);
    if (m?.[1]) return `${m[1].trim()}.`;
    const sep = '. ';
    const parts = t.split(sep);
    if (parts.length >= 4 && parts.length % 2 === 0) {
        const halfLen = parts.length / 2;
        const firstHalf = parts.slice(0, halfLen).join(sep);
        const secondHalf = parts.slice(halfLen).join(sep);
        if (firstHalf === secondHalf) return `${firstHalf}.`;
    }
    return msg;
}

function parseProtocolErrorRaw(error: any): string {
    const rawMsg = error?.message || error?.toString() || "";
    const combined = `${rawMsg} ${collectErrorText(error)}`.trim();
    const msg = combined.toLowerCase();

    if (msg.includes("0xd76f6ff8"))
        return "PROTOCOL_APPROVAL_REQUIRED: Enable the IntuRank fee proxy first (Skill chat bar or Create flow), then retry.";
    if (msg.includes("minimumdeposit") || /MinimumDeposit/i.test(msg)) {
        return `MINIMUM_DEPOSIT: The protocol requires at least ${formatEther(CURVE_OFFSET)} TRUST as vault deposit (same as claims).`;
    }
    // FeeProxy MultiVault custom errors (human-readable when RPC forwards data)
    if (msg.includes("0x86d94276") || msg.includes("0x22319959") || /MultiVault_TripleExists/i.test(msg) || /TripleExists/i.test(msg)) {
        return "This stance triple already exists on-chain — stake via the existing vault instead of creating it again (retry submit after refreshing).";
    }
    if (msg.includes("0x3f1472eb") || /AtomDoesNotExist/i.test(msg)) {
        return "Triple creation failed: one component is not registered as an on-chain atom yet. Wait for indexer sync or verify TRUST balance.";
    }
    // MultiVault_AtomExists(bytes) — duplicate createAtoms while the atom is already registered (RPC lag or duplicate cart lines).
    if (msg.includes("0xb4856ebc") || /MultiVault_AtomExists/i.test(msg)) {
        return "That atom already exists on-chain. Retry submit — the app now reuses existing atoms. Remove duplicate rows (same tool twice) if this keeps happening.";
    }
    // MultiVault_HasCounterStake() — depositing on a triple while you hold shares on its counter-triple (Arena YES vs NO on the same claim).
    if (msg.includes("0x332c26cd") || /MultiVault_HasCounterStake/i.test(msg)) {
        return "STANCE_CONFLICT: You already hold the opposite side of this claim. Withdraw your existing position from your portfolio before voting the other way.";
    }
    if (msg.includes("insufficient funds") || msg.includes("exceeds the balance")) return "INSUFFICIENT_TRUST_BALANCE";

    // MultiVault_InsufficientBalance() custom error selector
    if (msg.includes("0x7b0a37cf") || /MultiVault_InsufficientBalance/i.test(msg)) {
        const type = msg.includes("createatoms") ? "atom" : msg.includes("createtriples") ? "triple" : "protocol";
        return `INSUFFICIENT_TRUST_BALANCE: Not enough TRUST to cover the deposit plus ${type} creation cost. Reduce the deposit or add more TRUST.`;
    }
    if (msg.includes("user rejected")) return "USER_REJECTED_HANDSHAKE";

    // FeeProxy createTriples revert 0xd335ef46 (custom error: InsufficientDepositAmountToCoverFees)
    if (msg.includes("0xd335ef46") || /InsufficientDepositAmountToCoverFees/i.test(msg)) {
        return "INSUFFICIENT_FEE_COVERAGE: Sent TRUST is below what this calldata requires (fee + deposit). Regenerate JSON so value (wei) matches the assets[] amounts, or add TRUST to the wallet.";
    }

    // Already a clear failure message
    if (msg.includes("creation failed")) return combined.slice(0, 200) + (combined.length > 200 ? "…" : "");

    if (msg.includes("createtriples") || (msg.includes("reverted") && msg.includes("triple"))) {
        const normalized = combined.replace(/\s+/g, " ").trim();
        const concise = normalized.length > 420 ? `${normalized.slice(0, 417)}…` : normalized;
        if (
            concise.length > 56 &&
            !/^execution reverted\.?$/i.test(concise) &&
            !/^contractfunctionexecutionerror:?$/i.test(concise)
        ) {
            return concise;
        }
        return (
            "Triple simulation failed (Arena NO / claim path). Usual fixes: enough TRUST for triple creation + vault deposit, " +
            "fee proxy enabled (Skill bar or Create flow), then retry. RPC detail was empty — open the browser console for the raw error."
        );
    }

    // previewRedeem / redeem — often indexer UI > on-chain getShares, or wrong curve
    if (msg.includes("previewredeem") || msg.includes("redeembatch") || msg.includes("0x36172e8f")) {
        return "REDEEM_PREVIEW_FAILED: On-chain shares for this vault/curve are lower than the amount (or zero). Try the other curve, use Max after it refreshes, or wait for the chain to sync.";
    }

    if (msg.includes("execution reverted") || msg.includes("contractfunctionrevertederror")) {
        // Prefer raw combined message (often includes revert data) over canned text
        const concise = combined.length > 320 ? combined.slice(0, 317) + "…" : combined;
        if (concise.length > 40 && !/^execution reverted$/i.test(concise.trim())) {
            return concise;
        }
        if (msg.includes("createatoms")) {
            return "Atom creation reverted. Check: TRUST balance ≥ value, value matches fee+deposit in calldata, and fee proxy enabled (Enable in Skill chat or Create).";
        }
        return "Transaction reverted. Ensure all 3 atoms exist on-chain and you have enough TRUST.";
    }
    return combined.slice(0, 200) + (combined.length > 200 ? "…" : "");
}

export const parseProtocolError = (error: any): string =>
    collapseAdjacentDuplicateSentences(parseProtocolErrorRaw(error));

/** True when createTriples would revert because the claim triple is already registered — stake via deposit instead. */
export function errorLooksLikeTripleAlreadyExists(error: unknown): boolean {
    const text = `${collectErrorText(error)} ${error instanceof Error ? error.message : String(error)}`.toLowerCase();
    if (
        text.includes('0x86d94276') ||
        text.includes('0x22319959') ||
        /multivault_tripleexists/.test(text) ||
        (/tripleexists/.test(text) && !/atomexists/.test(text))
    ) {
        return true;
    }
    const p = parseProtocolError(error).toLowerCase();
    return p.includes('stance triple already exists') || p.includes('triple already exists on-chain');
}

/**
 * When subject/predicate/object resolve to a claim that already exists on-chain, stake TRUST into that vault
 * (avoids a second createTriples tx that reverts with MultiVault_TripleExists).
 */
export async function stakeVaultOnTripleFromLabels(
    subjectRef: string,
    predicateRef: string,
    objectRef: string,
    depositTrust: string,
    receiver: string,
    onProgress?: (log: string) => void,
): Promise<{ hash: `0x${string}` }> {
    onProgress?.('Existing claim found — staking into vault…');
    const s = await resolveAtomReferenceToTermId(subjectRef, depositTrust, receiver, onProgress);
    const p = await resolveAtomReferenceToTermId(predicateRef, depositTrust, receiver, onProgress);
    const o = await resolveAtomReferenceToTermId(objectRef, depositTrust, receiver, onProgress);
    const tripleTermId = calculateTripleId(s.termId, p.termId, o.termId);
    const exists = await isTermCreatedOnChain(tripleTermId);
    if (!exists) {
        throw new Error(
            'Claim is not registered on-chain yet — wait for indexer sync or refresh, then retry.',
        );
    }
    const dep = await depositToVault(depositTrust, tripleTermId, receiver, onProgress);
    return { hash: dep.hash };
}

/**
 * UX copy when Arena vault stakes succeeded but optional personal-attestation triples failed.
 * Unlike {@link parseProtocolError}, avoids “retry submit” / duplicate-cart wording — the batch is done.
 */
export function arenaPersonalAttestationFootnote(err: unknown): string {
    const rawMsg =
        err != null && typeof err === "object" && "message" in err
            ? String((err as { message?: unknown }).message ?? "")
            : typeof err === "string"
              ? err
              : String(err ?? "");
    const combined = `${rawMsg} ${collectErrorText(err)}`.trim();
    const lower = combined.toLowerCase();

    if (lower.includes("user rejected"))
        return "Wallet declined the optional personal-tags transaction. Arena stakes above still went through.";
    if (lower.includes("0xb4856ebc") || /multivault_atomexists/i.test(combined)) {
        return (
            "Optional personal tags need small on-chain “atoms” for your stance wording. One of those atoms " +
            "was already registered (same text as before, or a brief chain/indexer mismatch). Your list stakes " +
            "and deposits are unaffected — tags are bonus metadata on the graph, not required for Arena."
        );
    }
    if (lower.includes("0x86d94276") || lower.includes("0x22319959") || /multivault_tripleexists/i.test(combined) || /tripleexists/i.test(combined)) {
        return (
            "Optional personal-tags triple already existed on-chain (repeating nearly the same stance text). " +
            "Arena stakes finished normally; duplicate tag lines are harmless."
        );
    }
    if (lower.includes("0x7b0a37cf") || /multivault_insufficientbalance/i.test(lower)) {
        return (
            "Optional personal tags need a bit more TRUST for atom/triple fees on top of your vault deposits. " +
            "Raise balance or retry later — Arena stakes completed."
        );
    }
    const parsed = parseProtocolError(err)?.trim();
    if (parsed) {
        const short = parsed.length > 260 ? `${parsed.slice(0, 257)}…` : parsed;
        return `${short} (Arena stakes still completed; tags are optional.)`;
    }
    return "Personal tags didn’t finalize; Arena stakes still completed.";
}

/** Selectors for FeeProxy functions this app supports (see constants FEE_PROXY_ABI). */
const FEE_PROXY_ALLOWED_SELECTORS = new Set([
    '0x8581c32f', // createAtoms(address,bytes[],uint256[],uint256)
    '0xbc2439e4', // createTriples(...)
    '0x58a19d5e', // deposit(...)
]);

/**
 * When the Skill LLM sends FeeProxy calldata but omits `action`, infer it for review UI and routing.
 */
export function inferFeeProxyActionFromCalldata(data: string | undefined): 'createAtoms' | 'createTriples' | 'deposit' | null {
    if (!data || !data.startsWith('0x') || data.length < 10) return null;
    const sel = data.slice(0, 10).toLowerCase();
    if (sel === '0x8581c32f') return 'createAtoms';
    if (sel === '0xbc2439e4') return 'createTriples';
    if (sel === '0x58a19d5e') return 'deposit';
    return null;
}

const PREFLIGHT_PREFIX =
    "Simulation failed — wallet was not opened because this call would revert on-chain. ";

function preflightFailureMessage(err: unknown): string {
    if (errorLooksLikeTripleAlreadyExists(err)) {
        return (
            'Simulation failed: this claim triple already exists on-chain. Open it in Markets / Portfolio and deposit TRUST there instead of signing another create.'
        );
    }
    if (errorLooksLikeAtomAlreadyExists(err)) {
        return (
            'Simulation failed: FeeProxy would revert because this atom anchor already exists on-chain (duplicate create). ' +
            'Prefer chat **tripleFromLabels** + labels so missing atoms batch into **one** signature, ' +
            'or paste existing `0x…` term ids from Explorer instead of minting again.'
        );
    }
    const parsed = parseProtocolError(err);
    const nested = collectErrorText(err);
    const combined = `${parsed} ${nested}`.trim();
    const avoidGeneric =
        parsed.startsWith("TRANSACTION_REVERTED") ||
        (parsed.includes("protocol rejected") && parsed.length < 120);
    const body =
        avoidGeneric && nested.length > 40
            ? nested
            : combined.length > 30
              ? combined
              : parsed;
    const stripped = body.replace(/\s*\|\s*Version:\s*viem@[\d.]+/gi, "").trim();
    const trimmed = stripped.length > 420 ? stripped.slice(0, 417) + "…" : stripped;
    return PREFLIGHT_PREFIX + trimmed;
}

/**
 * Simulate the Skill Agent tx before opening the wallet.
 * FeeProxy: use raw eth_call only — decodeFunctionData/simulateContract can throw IntegerOutOfRangeError
 * on large uint256 values in viem’s JS number paths; the chain still executes the same bytes correctly.
 */
export async function preflightSkillBroadcast(
    fromAccount: string,
    to: `0x${string}`,
    valueWei: bigint,
    data: `0x${string}`
): Promise<{ ok: true } | { ok: false; message: string }> {
    const account = getAddress(fromAccount);
    const toLc = to.toLowerCase();
    if (toLc === FEE_PROXY_ADDRESS.toLowerCase()) {
        const sel = data.slice(0, 10).toLowerCase();
        if (!FEE_PROXY_ALLOWED_SELECTORS.has(sel)) {
            return {
                ok: false,
                message:
                    PREFLIGHT_PREFIX +
                    `FeeProxy calldata uses unknown selector ${sel}. Regenerate the JSON from the agent (or use Create flow). Supported: createAtoms 0x8581c32f, createTriples 0xbc2439e4, deposit 0x58a19d5e.`,
            };
        }
        const hexBody = data.slice(2);
        if (hexBody.length % 2 !== 0) {
            return {
                ok: false,
                message:
                    PREFLIGHT_PREFIX +
                    "The `data` hex has an odd number of characters (copy/paste error). Ask the agent for a fresh JSON block.",
            };
        }

        // createAtoms(address receiver, ...): receiver is the last 20 bytes of the first 32-byte argument (calldata bytes 16–35).
        if (sel === "0x8581c32f") {
            if (data.length < 2 + 36 * 2) {
                return {
                    ok: false,
                    message:
                        PREFLIGHT_PREFIX +
                        "createAtoms calldata is too short to include a receiver address. Ask the agent for a complete JSON block.",
                };
            }
            const receiver = getAddress(slice(data, 16, 36));
            if (receiver === "0x0000000000000000000000000000000000000000") {
                return {
                    ok: false,
                    message:
                        PREFLIGHT_PREFIX +
                        "Receiver address in the JSON is zero (0x000…000). FeeProxy will always revert. Tell the agent: set `receiver` in createAtoms to your connected wallet address — the same address shown in the app when your wallet is connected.",
                };
            }
            if (receiver.toLowerCase() !== account.toLowerCase()) {
                return {
                    ok: false,
                    message:
                        PREFLIGHT_PREFIX +
                        `Receiver in calldata is ${receiver.slice(0, 6)}…${receiver.slice(-4)} but your connected wallet is ${account.slice(0, 6)}…${account.slice(-4)}. Connect the matching wallet or ask the agent to regenerate with receiver = your address.`,
                };
            }
        }

        try {
            await publicClient.call({
                account,
                to,
                data,
                value: valueWei,
            });
            return { ok: true };
        } catch (err: unknown) {
            return { ok: false, message: preflightFailureMessage(err) };
        }
    }
    try {
        await publicClient.call({
            account,
            to,
            data,
            value: valueWei,
        });
        return { ok: true };
    } catch (err: unknown) {
        return { ok: false, message: preflightFailureMessage(err) };
    }
}

export const publishOpinion = async (text: string, agentId: string, side: string, wallet: string): Promise<string | undefined> => {
    try {
        return keccak256(stringToHex(`${text}-${agentId}-${side}-${Date.now()}`));
    } catch (e) { return undefined; }
};

/** Protocol / UI often paste a full sentence into the name field; long atom bytes make FeeProxy getAtomCost + createAtoms revert. */
const MAX_ATOM_LABEL_UTF8_BYTES = 256;

function truncateUtf8ToMaxBytes(s: string, maxBytes: number): string {
    if (!s) return s;
    const enc = new TextEncoder();
    if (enc.encode(s).length <= maxBytes) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (enc.encode(s.slice(0, mid)).length <= maxBytes) lo = mid;
        else hi = mid - 1;
    }
    const out = s.slice(0, lo).trim();
    return out || 'Atom';
}

/** Remove **bold** / *italic* markers models often put in JSON labels so on-chain names stay clean. */
export function stripMarkdownInlineDecorators(raw: string): string {
    let s = (raw || '').trim();
    for (let i = 0; i < 6; i++) {
        const next = s
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1');
        if (next === s) break;
        s = next;
    }
    s = s.replace(/\*\*/g, '');
    return s.trim();
}

/**
 * Turn pasted prompts ("Create an atom called \"Foo\" with …") or overlong titles into a short on-chain label.
 */
export function normalizeAtomLabel(raw: string): string {
    let s = stripMarkdownInlineDecorators(raw || '');
    if (!s) return 'Atom';

    const q1 = s.match(/\bcalled\s+["']([^"']+)["']/i);
    if (q1?.[1]?.trim()) s = q1[1].trim();
    else {
        const q2 = s.match(/\batom\s+called\s+["']([^"']+)["']/i);
        if (q2?.[1]?.trim()) s = q2[1].trim();
        else {
            const q3 = s.match(/\bnamed\s+["']([^"']+)["']/i);
            if (q3?.[1]?.trim()) s = q3[1].trim();
        }
    }

    s = s.split(/\n/)[0].trim();
    // Unquoted: "… called My Title with 0.5 …"
    if (s.length > 80) {
        const chop = s.split(/\s+with\s+/i)[0].split(/\s+deposit\s+/i)[0].trim();
        if (chop.length < s.length) s = chop;
    }
    // Still a paragraph (pasted prompt into name field) — hard cap
    if (s.length > 120) s = truncateUtf8ToMaxBytes(s, 120);
    s = truncateUtf8ToMaxBytes(s, MAX_ATOM_LABEL_UTF8_BYTES);
    return s || 'Atom';
}

/** Build atom data bytes for FeeProxy. Uses formats the protocol accepts: Account = address hex; Thing/Person/Organization = plain text name (avoids getAtomCost revert on JSON). */
const buildAtomDataHex = (metadata: any): `0x${string}` => {
    let atomStr = '';
    if (metadata?.type === 'Account' && metadata?.address && isAddress(metadata.address)) {
        atomStr = getAddress(metadata.address);
    } else {
        const raw = (metadata?.name && typeof metadata.name === 'string') ? metadata.name.trim() : 'Atom';
        atomStr = normalizeAtomLabel(raw);
    }
    return stringToHex(atomStr || 'Atom');
};

/**
 * FeeProxy.createAtoms: MultiVault gets (atomCost * n) + sum(assets); fees on deposit legs via
 * getTotalCreationCost(depositCount, totalDeposit, multiVaultCost).
 */
/** Used by Skill Chat / tests to align dataHex with on-chain atom id checks. */
export async function getFeeProxyAtomParams(
    metadata: any,
    depositAmount: string
): Promise<{ dataHex: `0x${string}`; depositWei: bigint; valueWei: bigint }> {
    const depositWei = parseEther(depositAmount || '0');
    const dataHex = buildAtomDataHex(metadata);
    let atomCost = parseEther('0.15');
    try {
        const ac = await publicClient.readContract({
            address: FEE_PROXY_ADDRESS as `0x${string}`,
            abi: FEE_PROXY_ABI,
            functionName: 'getAtomCost',
        } as any) as bigint;
        if (ac > 0n) atomCost = ac;
    } catch {
        try {
            const ac = await publicClient.readContract({
                address: MULTI_VAULT_ADDRESS as `0x${string}`,
                abi: MULTI_VAULT_ABI,
                functionName: 'getAtomCost',
            } as any) as bigint;
            if (ac > 0n) atomCost = ac;
        } catch {
            console.warn('getAtomCost failed, using fallback 0.15');
        }
    }
    if (atomCost < parseEther('0.15')) atomCost = parseEther('0.15');
    const multiVaultCost = atomCost + depositWei;
    const depositCount = depositWei > 0n ? 1n : 0n;
    let valueWei: bigint;
    try {
        valueWei = await publicClient.readContract({
            address: FEE_PROXY_ADDRESS as `0x${string}`,
            abi: FEE_PROXY_ABI,
            functionName: 'getTotalCreationCost',
            args: [depositCount, depositWei, multiVaultCost],
        } as any) as bigint;
    } catch (e) {
        console.warn('FeeProxy getTotalCreationCost (atom) failed', e);
        valueWei = (multiVaultCost * 115n) / 100n;
    }
    return { dataHex, depositWei, valueWei };
}

/** MultiVault term id for atom payload bytes (`FeeProxy.createAtoms` data element). Uses `calculateAtomId`, not `keccak256(data)`. */
export async function getProtocolAtomIdFromAtomData(dataHex: `0x${string}`): Promise<`0x${string}`> {
    const id = await publicClient.readContract({
        address: MULTI_VAULT_ADDRESS as `0x${string}`,
        abi: MULTI_VAULT_ABI,
        functionName: 'calculateAtomId',
        args: [dataHex],
    } as any);
    return id as `0x${string}`;
}

/** Read TripleCreated termId from a confirmed triple tx (canonical claim id — not keccak(subject,predicate,object)). */
export async function getTripleTermIdFromTxHash(hash: `0x${string}`): Promise<`0x${string}` | undefined> {
    try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const tripleCreated = parseEventLogs({
            abi: MULTI_VAULT_ABI,
            eventName: 'TripleCreated',
            logs: receipt.logs,
        });
        if (tripleCreated.length === 0) {
            const fromFeeProxy = parseEventLogs({
                abi: FEE_PROXY_ABI,
                eventName: 'TripleCreated',
                logs: receipt.logs,
            });
            if (fromFeeProxy.length > 0) {
                return fromFeeProxy[fromFeeProxy.length - 1].args.termId as `0x${string}`;
            }
            return undefined;
        }
        return tripleCreated[tripleCreated.length - 1].args.termId as `0x${string}`;
    } catch (e) {
        console.warn('getTripleTermIdFromTxHash:', e);
    }
    return undefined;
}

/** Read AtomCreated termId from a confirmed FeeProxy/MultiVault atom tx (Skill Chat, UI). */
export async function getAtomTermIdFromTxHash(
    hash: `0x${string}`,
    dataHexFallback?: `0x${string}`
): Promise<`0x${string}` | undefined> {
    try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const atomCreated = parseEventLogs({
            abi: MULTI_VAULT_ABI,
            eventName: 'AtomCreated',
            logs: receipt.logs,
        });
        if (atomCreated.length > 0) {
            return atomCreated[0].args.termId as `0x${string}`;
        }
        if (dataHexFallback) {
            const candidate = await getProtocolAtomIdFromAtomData(dataHexFallback);
            try {
                const exists = await publicClient.readContract({
                    address: FEE_PROXY_ADDRESS as `0x${string}`,
                    abi: FEE_PROXY_ABI,
                    functionName: 'isTermCreated',
                    args: [candidate],
                } as any);
                if (exists) return candidate;
            } catch {
                /* ignore */
            }
        }
    } catch (e) {
        console.warn('getAtomTermIdFromTxHash:', e);
    }
    return undefined;
}

/** Subject / predicate / object values that look like existing on-chain term ids (bytes32). */
export function looksLikeBytes32TermId(s: string): boolean {
    const t = s.trim();
    return /^0x[0-9a-fA-F]{64}$/.test(t);
}

export async function isTermCreatedOnChain(termId: string): Promise<boolean> {
    const tid = padTermId(termId);
    try {
        const v = await publicClient.readContract({
            address: MULTI_VAULT_ADDRESS as `0x${string}`,
            abi: MULTI_VAULT_ABI,
            functionName: 'isTermCreated',
            args: [tid],
        } as any);
        if (v) return true;
    } catch {
        /* try FeeProxy */
    }
    try {
        const v = await publicClient.readContract({
            address: FEE_PROXY_ADDRESS as `0x${string}`,
            abi: FEE_PROXY_ABI,
            functionName: 'isTermCreated',
            args: [tid],
        } as any);
        return Boolean(v);
    } catch {
        return false;
    }
}

/** Poll until `isTermCreated` reflects a tx mined in the same session (avoids MultiVault_AtomExists on duplicate picks). */
export async function waitUntilTermCreatedOnChain(
    termId: string,
    opts?: { maxAttempts?: number; delayMs?: number },
): Promise<boolean> {
    const maxAttempts = opts?.maxAttempts ?? 12;
    const delayMs = opts?.delayMs ?? 450;
    for (let i = 0; i < maxAttempts; i++) {
        if (await isTermCreatedOnChain(termId)) return true;
        if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
}

function errorLooksLikeAtomAlreadyExists(err: unknown): boolean {
    const text = `${collectErrorText(err)} ${err instanceof Error ? err.message : String(err)}`.toLowerCase();
    if (/multivault_tripleexists|tripleexists/.test(text) && !/atomexists/.test(text)) return false;
    return (
        text.includes('0xb4856ebc') ||
        text.includes('multivault_atomexists') ||
        text.includes('atomexists') ||
        text.includes('atom already exists')
    );
}

/**
 * Inspect one atom ref without sending a tx: either an existing term id or calldata for a batched `createAtoms` leg.
 */
export async function peekAtomTermId(
    ref: string,
    depositTrust: string,
): Promise<
    | { status: 'existing'; termId: `0x${string}` }
    | { status: 'create'; dataHex: `0x${string}`; assetsWei: bigint }
> {
    const trimmed = ref.trim();
    if (!trimmed) throw new Error('Atom reference (label or term id) is required');
    let assetsWei: bigint;
    try {
        assetsWei = parseEther(depositTrust.trim() || '0');
    } catch {
        throw new Error('Invalid TRUST amount for atom resolution');
    }
    if (assetsWei < CURVE_OFFSET) {
        throw new Error(`Minimum deposit is ${formatEther(CURVE_OFFSET)} TRUST for atom anchoring.`);
    }

    if (looksLikeBytes32TermId(trimmed)) {
        const tid = padTermId(trimmed);
        const exists = await isTermCreatedOnChain(trimmed);
        if (exists) return { status: 'existing', termId: tid };
        throw new Error(
            `Term ${trimmed.slice(0, 12)}… is not on-chain. Use a text label so the app can anchor an atom, or pick from search.`,
        );
    }

    if (isAddress(trimmed)) {
        const addr = getAddress(trimmed);
        const metadata = { type: 'Account' as const, address: addr };
        const { dataHex } = await getFeeProxyAtomParams(metadata, depositTrust);
        const candidate = await getProtocolAtomIdFromAtomData(dataHex);
        if (await isTermCreatedOnChain(candidate)) return { status: 'existing', termId: candidate };
        if (await waitUntilTermCreatedOnChain(candidate, { maxAttempts: 4, delayMs: 200 })) {
            return { status: 'existing', termId: candidate };
        }
        return { status: 'create', dataHex, assetsWei };
    }

    const metadata = { name: normalizeAtomLabel(trimmed), type: 'Thing' as const };
    const { dataHex } = await getFeeProxyAtomParams(metadata, depositTrust);
    const candidate = await getProtocolAtomIdFromAtomData(dataHex);
    if (await isTermCreatedOnChain(candidate)) return { status: 'existing', termId: candidate };
    if (await waitUntilTermCreatedOnChain(candidate, { maxAttempts: 4, delayMs: 200 })) {
        return { status: 'existing', termId: candidate };
    }
    return { status: 'create', dataHex, assetsWei };
}

/**
 * Resolve one atom reference: existing bytes32 term id, or a text label (create atom if missing).
 * Multiple wallet signatures may be required when creating new atoms.
 */
export async function resolveAtomReferenceToTermId(
    ref: string,
    depositTrust: string,
    receiver: string,
    onProgress?: (log: string) => void
): Promise<{ termId: `0x${string}`; createdTxHash?: `0x${string}` }> {
    const trimmed = ref.trim();
    if (!trimmed) throw new Error('Atom reference (label or term id) is required');

    if (looksLikeBytes32TermId(trimmed)) {
        const tid = padTermId(trimmed);
        const exists = await isTermCreatedOnChain(trimmed);
        if (exists) return { termId: tid };
        throw new Error(
            `Term ${trimmed.slice(0, 12)}… is not on-chain. Paste a text label (e.g. "Alice") so the agent can create the atom, or create it in Create first.`
        );
    }

    /** Wallet address → Intuition Account atom (deterministic); enables personalized stance triples with subject = you. */
    if (isAddress(trimmed)) {
        const addr = getAddress(trimmed);
        const metadata = { type: 'Account' as const, address: addr };
        const { dataHex } = await getFeeProxyAtomParams(metadata, depositTrust);
        const candidate = await getProtocolAtomIdFromAtomData(dataHex);
        if (await isTermCreatedOnChain(candidate)) {
            return { termId: candidate };
        }
        if (await waitUntilTermCreatedOnChain(candidate)) {
            return { termId: candidate };
        }
        onProgress?.(`Anchoring Account atom for ${addr.slice(0, 8)}…`);
        try {
            const { hash, termId } = await createIdentityAtom(metadata, depositTrust, receiver, onProgress);
            let tid = termId ?? (await getAtomTermIdFromTxHash(hash, dataHex));
            if (!tid) tid = candidate;
            return { termId: tid, createdTxHash: hash };
        } catch (e) {
            if (errorLooksLikeAtomAlreadyExists(e)) {
                const ready =
                    (await isTermCreatedOnChain(candidate)) ||
                    (await waitUntilTermCreatedOnChain(candidate, { maxAttempts: 22, delayMs: 400 }));
                if (ready) {
                    onProgress?.('Account atom already on-chain — reusing it.');
                    return { termId: candidate };
                }
            }
            throw e;
        }
    }

    const metadata = { name: normalizeAtomLabel(trimmed), type: 'Thing' as const };
    const { dataHex } = await getFeeProxyAtomParams(metadata, depositTrust);
    const candidate = await getProtocolAtomIdFromAtomData(dataHex);
    if (await isTermCreatedOnChain(candidate)) {
        return { termId: candidate };
    }
    if (await waitUntilTermCreatedOnChain(candidate)) {
        return { termId: candidate };
    }

    onProgress?.(`Creating atom "${metadata.name}"…`);
    try {
        const { hash, termId } = await createIdentityAtom(metadata, depositTrust, receiver, onProgress);
        let tid = termId ?? (await getAtomTermIdFromTxHash(hash, dataHex));
        if (!tid) tid = candidate;
        return { termId: tid, createdTxHash: hash };
    } catch (e) {
        if (errorLooksLikeAtomAlreadyExists(e)) {
            const ready =
                (await isTermCreatedOnChain(candidate)) ||
                (await waitUntilTermCreatedOnChain(candidate, { maxAttempts: 22, delayMs: 400 }));
            if (ready) {
                onProgress?.(`Atom "${metadata.name}" already exists — reusing it.`);
                return { termId: candidate };
            }
        }
        throw e;
    }
}

/**
 * Create a semantic triple from three text labels (or existing term ids as 0x + 64 hex).
 * Hex ids that exist on-chain reuse those atoms (no creation tx). Text labels resolve/create atoms as needed, then the triple.
 * Missing atoms are anchored via {@link batchEnsureAtomTermIds} — **one** batched createAtoms tx when multiple legs are needed (Skill demo-friendly).
 */
export async function createTripleFromLabels(
    subjectRef: string,
    predicateRef: string,
    objectRef: string,
    depositTrust: string,
    receiver: string,
    onProgress?: (log: string) => void
): Promise<{
    atomTxHashes: `0x${string}`[];
    /** Omitted when the triple was already registered — nothing new to broadcast. */
    tripleHash?: `0x${string}`;
    tripleTermId: Hex;
    subjectId: `0x${string}`;
    predicateId: `0x${string}`;
    objectId: `0x${string}`;
}> {
    const atomTxHashes: `0x${string}`[] = [];

    const jobs: AtomRefJob[] = [
        { ref: subjectRef, depositTrust },
        { ref: predicateRef, depositTrust },
        { ref: objectRef, depositTrust },
    ];
    onProgress?.('Resolving atoms (batched create when needed)…');
    const { termMap, atomBatchTxHash } = await batchEnsureAtomTermIds(jobs, receiver, onProgress);
    if (atomBatchTxHash) atomTxHashes.push(atomBatchTxHash);

    const sk = atomRefJobKey(subjectRef, depositTrust);
    const pk = atomRefJobKey(predicateRef, depositTrust);
    const ok = atomRefJobKey(objectRef, depositTrust);
    const sTerm = termMap.get(sk);
    const pTerm = termMap.get(pk);
    const oTerm = termMap.get(ok);
    if (!sTerm || !pTerm || !oTerm) {
        throw new Error('Could not resolve subject, predicate, and object atoms for this claim.');
    }

    const tripleTermIdCalc = calculateTripleId(sTerm, pTerm, oTerm);
    if (await isTermCreatedOnChain(tripleTermIdCalc)) {
        onProgress?.('Claim already on-chain — skipping duplicate create.');
        return {
            atomTxHashes,
            tripleTermId: tripleTermIdCalc,
            subjectId: sTerm,
            predicateId: pTerm,
            objectId: oTerm,
        };
    }

    onProgress?.('Creating triple (claim)…');
    try {
        const tripleHash = await createSemanticTriple(
            sTerm,
            pTerm,
            oTerm,
            depositTrust,
            receiver,
            onProgress,
            true,
        );
        const fromReceipt = await getTripleTermIdFromTxHash(tripleHash);
        const tripleTermId = (fromReceipt ?? tripleTermIdCalc) as Hex;
        return {
            atomTxHashes,
            tripleHash,
            tripleTermId,
            subjectId: sTerm,
            predicateId: pTerm,
            objectId: oTerm,
        };
    } catch (e) {
        if (errorLooksLikeTripleAlreadyExists(e)) {
            const ready =
                (await isTermCreatedOnChain(tripleTermIdCalc)) ||
                (await waitUntilTermCreatedOnChain(tripleTermIdCalc, { maxAttempts: 22, delayMs: 400 }));
            if (ready) {
                onProgress?.('Claim registered concurrently — treating as success.');
                return {
                    atomTxHashes,
                    tripleTermId: tripleTermIdCalc,
                    subjectId: sTerm,
                    predicateId: pTerm,
                    objectId: oTerm,
                };
            }
        }
        throw e;
    }
}

/**
 * Mint or reuse an identity/list/thing atom. Skips FeeProxy when the term is already registered
 * (retries, partial promotes, duplicate labels).
 */
export async function ensureIdentityAtom(
    metadata: any,
    depositAmount: string,
    receiver: string,
    onProgress?: (log: string) => void,
): Promise<{ hash?: `0x${string}`; termId: `0x${string}` }> {
    const { dataHex } = await getFeeProxyAtomParams(metadata, depositAmount);
    const candidate = await getProtocolAtomIdFromAtomData(dataHex);
    if (await isTermCreatedOnChain(candidate)) {
        onProgress?.('Identity already on-chain — reusing it.');
        return { termId: candidate };
    }
    if (await waitUntilTermCreatedOnChain(candidate, { maxAttempts: 10, delayMs: 280 })) {
        onProgress?.('Identity already on-chain — reusing it.');
        return { termId: candidate };
    }

    try {
        const { hash, termId } = await createIdentityAtom(metadata, depositAmount, receiver, onProgress);
        const tid = termId ?? (hash ? await getAtomTermIdFromTxHash(hash, dataHex) : undefined) ?? candidate;
        return { hash, termId: tid };
    } catch (e) {
        if (errorLooksLikeAtomAlreadyExists(e)) {
            const ready =
                (await isTermCreatedOnChain(candidate)) ||
                (await waitUntilTermCreatedOnChain(candidate, { maxAttempts: 28, delayMs: 320 }));
            if (ready) {
                onProgress?.('Identity already on-chain — reusing it.');
                return { termId: candidate };
            }
        }
        throw e;
    }
}

export const createIdentityAtom = async (metadata: any, depositAmount: string, receiver: string, onProgress?: (log: string) => void): Promise<{ hash: `0x${string}`; termId?: `0x${string}` }> => {
    const checksumReceiver = getAddress(receiver);
    const depositParsed = parseEther(depositAmount);
    if (depositParsed < CURVE_OFFSET) {
        throw new Error(
            `Minimum deposit is ${formatEther(CURVE_OFFSET)} TRUST. You provided ${depositAmount}.`
        );
    }

    const provider = getProvider();
    const walletClient = createWalletClient({ chain: intuitionChain, transport: custom(provider), account: checksumReceiver });

    try {
        const { dataHex, depositWei, valueWei: totalCost } = await getFeeProxyAtomParams(metadata, depositAmount);
        const candidate = await getProtocolAtomIdFromAtomData(dataHex);
        if (await isTermCreatedOnChain(candidate)) {
            onProgress?.('Identity already on-chain — reusing it.');
            return { hash: '0x0000000000000000000000000000000000000000000000000000000000000000', termId: candidate };
        }

        onProgress?.("Verifying Protocol Approval...");
        const approved = await getProxyApprovalStatus(receiver, { readRetries: 2, readDelayMs: 120 });
        if (!approved) {
            onProgress?.("Awaiting Protocol Handshake...");
            await grantProxyApproval(receiver);
        }

        onProgress?.("Simulating atom creation (FeeProxy)...");

        onProgress?.(`Total send: ${formatEther(totalCost)} ${CURRENCY_SYMBOL}`);
        onProgress?.("Awaiting Identity Signature...");

        let request: any;
        try {
            const simulation = await publicClient.simulateContract({
                address: FEE_PROXY_ADDRESS as `0x${string}`,
                abi: FEE_PROXY_ABI,
                functionName: 'createAtoms',
                account: checksumReceiver,
                args: [checksumReceiver, [dataHex], [depositWei], BigInt(LINEAR_CURVE_ID)],
                value: totalCost,
            } as any);
            request = simulation.request;
        } catch (simulationError: any) {
            console.warn("ATOM_SIMULATION_FAILED:", simulationError);
            if (errorLooksLikeAtomAlreadyExists(simulationError)) {
                const ready =
                    (await isTermCreatedOnChain(candidate)) ||
                    (await waitUntilTermCreatedOnChain(candidate, { maxAttempts: 28, delayMs: 320 }));
                if (ready) {
                    onProgress?.('Identity already on-chain — reusing it.');
                    return { hash: '0x0000000000000000000000000000000000000000000000000000000000000000', termId: candidate };
                }
            }
            const parsed = parseProtocolError(simulationError);
            // Search for keywords case-insensitively
            const upper = parsed.toUpperCase();
            if (upper.includes("REVERTED") || upper.includes("BALANCE") || upper.includes("FEE")) {
                throw new Error(parsed);
            }
            throw simulationError;
        }

        const hash = await walletClient.writeContract(request);
        onProgress?.(`Broadcasting Identity... Hash: ${hash.slice(0,10)}...`);

        let termId: `0x${string}` | undefined;
        try {
            onProgress?.("Identity Anchored in Block.");
            termId = await getAtomTermIdFromTxHash(hash, dataHex);
        } catch (e) {
            console.warn("RECEIPT_WAIT_ERROR:", e);
        }

        window.dispatchEvent(new Event('local-tx-updated'));
        return { hash, termId };
    } catch (error: any) {
        console.error('createIdentityAtom failed:', error?.message || error);
        try {
            const { dataHex } = await getFeeProxyAtomParams(metadata, depositAmount);
            const candidate = await getProtocolAtomIdFromAtomData(dataHex);
            if (errorLooksLikeAtomAlreadyExists(error)) {
                const ready =
                    (await isTermCreatedOnChain(candidate)) ||
                    (await waitUntilTermCreatedOnChain(candidate, { maxAttempts: 28, delayMs: 320 }));
                if (ready) {
                    onProgress?.('Identity already on-chain — reusing it.');
                    return { hash: '0x0000000000000000000000000000000000000000000000000000000000000000', termId: candidate };
                }
            }
        } catch {
            /* fall through */
        }
        const parsed = parseProtocolError(error);
        const upper = parsed.toUpperCase();
        if (upper.includes("REVERTED") || upper.includes("BALANCE") || upper.includes("FEE")) {
            throw new Error(parsed);
        }
        throw error;
    }
};

export type CreateAtomBatchLeg = { dataHex: `0x${string}`; assetsWei: bigint };

export type AtomRefJob = { ref: string; depositTrust: string };

export function atomRefJobKey(ref: string, depositTrust: string): string {
    return `${ref.trim()}\0${depositTrust.trim()}`;
}

/**
 * FeeProxy.createAtoms with multiple data payloads — one wallet signature for all new atoms in `legs`.
 */
export async function createIdentityAtomsBatch(
    legs: CreateAtomBatchLeg[],
    receiver: string,
    onProgress?: (log: string) => void,
): Promise<`0x${string}`> {
    if (!legs.length) throw new Error('No atoms to create.');
    const checksumReceiver = getAddress(receiver);
    const provider = getProvider();
    if (!provider) throw new Error('Wallet not connected');
    const walletClient = createWalletClient({
        chain: intuitionChain,
        transport: custom(provider),
        account: checksumReceiver,
    });

    const data = legs.map((l) => l.dataHex);
    const assets = legs.map((l) => l.assetsWei);
    const totalDeposit = assets.reduce((a, b) => a + b, 0n);
    const atomCount = BigInt(legs.length);

    let atomCost: bigint;
    try {
        atomCost = (await publicClient.readContract({
            address: FEE_PROXY_ADDRESS as `0x${string}`,
            abi: FEE_PROXY_ABI,
            functionName: 'getAtomCost',
        } as any)) as bigint;
    } catch {
        atomCost = parseEther('0.15');
    }
    if (atomCost < parseEther('0.15')) atomCost = parseEther('0.15');

    const multiVaultCost = atomCost * atomCount + totalDeposit;
    let totalCost: bigint;
    try {
        totalCost = (await publicClient.readContract({
            address: FEE_PROXY_ADDRESS as `0x${string}`,
            abi: FEE_PROXY_ABI,
            functionName: 'getTotalCreationCost',
            args: [atomCount, totalDeposit, multiVaultCost],
        } as any)) as bigint;
    } catch {
        totalCost = (multiVaultCost * 115n) / 100n;
    }

    onProgress?.(`Preparing ${legs.length} atom anchor(s)…`);
    onProgress?.(`Total value: ${formatEther(totalCost)} ${CURRENCY_SYMBOL}`);

    const proxyOk = await getProxyApprovalStatus(checksumReceiver, { readRetries: 2, readDelayMs: 120 });
    if (!proxyOk) {
        onProgress?.('Approving FeeProxy…');
        await grantProxyApproval(checksumReceiver);
    }

    let request: any;
    try {
        const simulation = await publicClient.simulateContract({
            address: FEE_PROXY_ADDRESS as `0x${string}`,
            abi: FEE_PROXY_ABI,
            functionName: 'createAtoms',
            account: checksumReceiver,
            args: [checksumReceiver, data, assets, BigInt(LINEAR_CURVE_ID)],
            value: totalCost,
        } as any);
        request = simulation.request;
    } catch (e: any) {
        const parsed = parseProtocolError(e);
        throw new Error(parsed || 'Atom batch simulation failed');
    }

    onProgress?.('Confirm atom batch in wallet…');
    const hash = await walletClient.writeContract(request);
    onProgress?.(`Broadcasting atom batch… ${hash.slice(0, 10)}…`);
    window.dispatchEvent(new Event('local-tx-updated'));
    try {
        await publicClient.waitForTransactionReceipt({ hash });
        onProgress?.('Atom batch confirmed.');
    } catch (waitErr: any) {
        console.warn('ATOM_BATCH_RECEIPT_TIMEOUT:', waitErr);
    }
    return hash;
}

export type BatchEnsureAtomTermIdsResult = {
    termMap: Map<string, `0x${string}`>;
    /** Present when at least one new atom leg was submitted in a batched createAtoms tx. */
    atomBatchTxHash?: `0x${string}`;
};

/**
 * Resolve many label/address refs: one batched `createAtoms` for all missing payloads, then a map ref→termId.
 */
export async function batchEnsureAtomTermIds(
    jobs: AtomRefJob[],
    receiver: string,
    onProgress?: (log: string) => void,
): Promise<BatchEnsureAtomTermIdsResult> {
    const out = new Map<string, `0x${string}`>();
    if (!jobs.length) return { termMap: out };

    const seen = new Set<string>();
    const orderedUnique: AtomRefJob[] = [];
    for (const j of jobs) {
        const k = atomRefJobKey(j.ref, j.depositTrust);
        if (seen.has(k)) continue;
        seen.add(k);
        orderedUnique.push(j);
    }

    type Bucket = { dataHex: `0x${string}`; assetsWei: bigint; keys: string[] };
    const byDataHex = new Map<string, Bucket>();

    for (const j of orderedUnique) {
        const k = atomRefJobKey(j.ref, j.depositTrust);
        const peek = await peekAtomTermId(j.ref, j.depositTrust);
        if (peek.status === 'existing') {
            out.set(k, peek.termId);
            continue;
        }
        const dh = peek.dataHex.toLowerCase();
        let bucket = byDataHex.get(dh);
        if (!bucket) {
            bucket = { dataHex: peek.dataHex, assetsWei: peek.assetsWei, keys: [] };
            byDataHex.set(dh, bucket);
        } else if (peek.assetsWei > bucket.assetsWei) {
            bucket.assetsWei = peek.assetsWei;
        }
        bucket.keys.push(k);
    }

    const legs: CreateAtomBatchLeg[] = Array.from(byDataHex.values()).map((b) => ({
        dataHex: b.dataHex,
        assetsWei: b.assetsWei,
    }));

    let atomBatchTxHash: `0x${string}` | undefined;
    if (legs.length > 0) {
        try {
            atomBatchTxHash = await createIdentityAtomsBatch(legs, receiver, onProgress);
        } catch (e) {
            if (!errorLooksLikeAtomAlreadyExists(e)) throw e;
            onProgress?.('Atom batch reported duplicates — confirming anchors on-chain…');
        }
        const jobByKey = new Map(orderedUnique.map((j) => [atomRefJobKey(j.ref, j.depositTrust), j]));
        for (const b of byDataHex.values()) {
            const tid = await getProtocolAtomIdFromAtomData(b.dataHex);
            let ok = await waitUntilTermCreatedOnChain(tid, { maxAttempts: 28, delayMs: 320 });
            if (ok) {
                for (const k of b.keys) out.set(k, tid);
                continue;
            }
            onProgress?.('Confirming member atoms one-by-one…');
            for (const k of b.keys) {
                if (out.has(k)) continue;
                const job = jobByKey.get(k);
                if (!job) continue;
                const resolved = await resolveAtomReferenceToTermId(
                    job.ref,
                    job.depositTrust,
                    receiver,
                    onProgress,
                );
                out.set(k, resolved.termId);
            }
        }
    }

    return { termMap: out, atomBatchTxHash };
}

/** Total TRUST to send: FeeProxy.getTotalCreationCost for one atom + deposit (includes IntuRank fees). */
export const getAtomCreationCost = async (metadata: any, depositAmount: string): Promise<bigint> => {
    const { valueWei } = await getFeeProxyAtomParams(metadata, depositAmount);
    return valueWei;
};

/**
 * Skill Chat: build FeeProxy createAtoms calldata (same as createIdentityAtom; no LLM hex).
 */
export async function buildCreateAtomTxIntent(
    receiver: string,
    label: string,
    depositTrust: string
): Promise<{ to: `0x${string}`; data: `0x${string}`; valueWei: bigint; dataHex: `0x${string}` }> {
    const trimmed = label.trim();
    if (!trimmed) throw new Error('Atom label is required');
    let depositWei: bigint;
    try {
        depositWei = parseEther(depositTrust.trim() || '0');
    } catch {
        throw new Error('Invalid deposit amount (use TRUST as a decimal, e.g. 0.5)');
    }
    if (depositWei <= 0n) throw new Error('Deposit must be greater than zero');
    if (depositWei < CURVE_OFFSET) {
        throw new Error(
            `Minimum deposit is ${formatEther(CURVE_OFFSET)} TRUST (same as claims). You entered ${depositTrust.trim()}.`
        );
    }

    const metadata = { name: trimmed };
    const checksum = getAddress(receiver);
    const { dataHex, depositWei: dep, valueWei } = await getFeeProxyAtomParams(metadata, depositTrust.trim());
    const data = encodeFunctionData({
        abi: FEE_PROXY_ABI,
        functionName: 'createAtoms',
        args: [checksum, [dataHex], [dep], BigInt(LINEAR_CURVE_ID)],
    });
    return {
        to: FEE_PROXY_ADDRESS as `0x${string}`,
        data,
        valueWei,
        dataHex,
    };
}

export const estimateAtomGas = async (account: string, metadata: any, depositAmount: string) => {
    const checksumAccount = getAddress(account);
    try {
        const { dataHex, depositWei, valueWei } = await getFeeProxyAtomParams(metadata, depositAmount);
        const gas = await publicClient.estimateContractGas({
            address: FEE_PROXY_ADDRESS as `0x${string}`,
            abi: FEE_PROXY_ABI,
            functionName: 'createAtoms',
            account: checksumAccount,
            args: [checksumAccount, [dataHex], [depositWei], BigInt(LINEAR_CURVE_ID)],
            value: valueWei,
        } as any);
        const gasPrice = await publicClient.getGasPrice();
        return gas * gasPrice;
    } catch (error) { return parseEther('0.0008'); }
};

/**
 * Returns the minimum deposit (assets) required for claim/triple creation.
 * Uses CURVE_OFFSET (client floor for bonding curve min deposit) as the protocol minimum.
 */
export const getMinClaimDeposit = async (): Promise<string> => {
    return formatEther(CURVE_OFFSET);
};

/**
 * Returns the base protocol triple cost from MultiVault (excluding any IntuRank proxy fee).
 */
export const getTripleCost = async (): Promise<string> => {
    try {
        const tripleCost = await publicClient.readContract({
            address: MULTI_VAULT_ADDRESS as `0x${string}`,
            abi: MULTI_VAULT_ABI,
            functionName: 'getTripleCost',
        } as any) as bigint;
        return formatEther(tripleCost < parseEther('0.15') ? parseEther('0.15') : tripleCost);
    } catch {
        return formatEther(parseEther('0.15'));
    }
};

/**
 * Returns the total cost (deposit + triple cost + proxy fee) for creating a claim.
 * Uses FeeProxy.getTotalCreationCost so the IntuRank fee is included.
 */
export const getTotalTripleCreationCost = async (depositAmount: string): Promise<string> => {
    const assets = parseEther(depositAmount || '0');
    try {
        // Base triple cost (prefer FeeProxy for consistent calculation)
        let tripleCost: bigint;
        try {
            tripleCost = await publicClient.readContract({
                address: FEE_PROXY_ADDRESS as `0x${string}`,
                abi: FEE_PROXY_ABI,
                functionName: 'getTripleCost',
            } as any) as bigint;
        } catch {
            tripleCost = parseEther('0.15');
        }

        if (tripleCost < parseEther('0.15')) tripleCost = parseEther('0.15');

        // multiVaultCost = tripleCost * count + totalDeposit (per FeeProxy template)
        const multiVaultCost = tripleCost + assets;
        const total = await publicClient.readContract({
            address: FEE_PROXY_ADDRESS as `0x${string}`,
            abi: FEE_PROXY_ABI,
            functionName: 'getTotalCreationCost',
            args: [1n, assets, multiVaultCost],
        } as any) as bigint;

        // Include 15% safety buffer in the reported cost
        return formatEther((total * 115n) / 100n);
    } catch {
        // Fallback heuristic: base triple cost (0.15) + deposit + 15% proxy fee + 15% safety buffer
        const tripleCost = parseEther('0.15');
        const raw = (tripleCost + assets) * 115n / 100n;
        const totalWithBuffer = (raw * 115n) / 100n;
        return formatEther(totalWithBuffer);
    }
};

export const padTermId = (id: string): `0x${string}` =>
    pad((id.startsWith('0x') ? id : `0x${id}`) as Hex, { size: 32 }) as `0x${string}`;

export const validateTripleAtomsExist = async (subjectId: string, predicateId: string, objectId: string): Promise<{ ok: boolean; missing: string[] }> => {
    const ids = [
        { id: subjectId, role: 'Subject' },
        { id: predicateId, role: 'Predicate' },
        { id: objectId, role: 'Object' },
    ];
    const missing: string[] = [];
    for (const { id, role } of ids) {
        try {
            if (isProtocolSingletonTermId(id)) continue;
            const termId = padTermId(id);
            let exists = false;
            try {
                exists = await publicClient.readContract({
                    address: MULTI_VAULT_ADDRESS as `0x${string}`,
                    abi: MULTI_VAULT_ABI,
                    functionName: 'isTermCreated',
                    args: [termId],
                } as any) as boolean;
            } catch {
                try {
                    exists = await publicClient.readContract({
                        address: FEE_PROXY_ADDRESS as `0x${string}`,
                        abi: FEE_PROXY_ABI,
                        functionName: 'isTermCreated',
                        args: [termId],
                    } as any) as boolean;
                } catch {}
            }
            if (!exists) missing.push(`${role} (${id.slice(0, 10)}…)`);
        } catch {
            missing.push(`${role} (${id.slice(0, 10)}…)`);
        }
    }
    return { ok: missing.length === 0, missing };
};

export const createSemanticTriple = async (subjectId: string, predicateId: string, objectId: string, depositAmount: string, receiver: string, onProgress?: (log: string) => void, skipValidation?: boolean) => {
    const assets = parseEther(depositAmount);
    if (assets < CURVE_OFFSET) {
        throw new Error(`Minimum deposit is ${formatEther(CURVE_OFFSET)} TRUST. You provided ${depositAmount}.`);
    }
    if (!skipValidation) {
        onProgress?.("Verifying atoms on-chain...");
        const { ok, missing } = await validateTripleAtomsExist(subjectId, predicateId, objectId);
        if (!ok) {
            throw new Error(`Atom(s) not found on-chain: ${missing.join(', ')}. Create them first or pick existing atoms from search.`);
        }
    }
    const checksumReceiver = getAddress(receiver);
    const sId = padTermId(subjectId);
    const pId = padTermId(predicateId);
    const oId = padTermId(objectId);
    const provider = getProvider();
    const walletClient = createWalletClient({ chain: intuitionChain, transport: custom(provider), account: checksumReceiver });

    try {
        onProgress?.("Simulating Synapse Parameters...");

        // 1. Get base triple cost from MultiVault (via FeeProxy or direct)
        let tripleCost: bigint;
        try {
            tripleCost = await publicClient.readContract({
                address: FEE_PROXY_ADDRESS as `0x${string}`,
                abi: FEE_PROXY_ABI,
                functionName: 'getTripleCost',
            } as any) as bigint;
        } catch {
            tripleCost = parseEther('0.15');
        }

        if (tripleCost < parseEther('0.15')) tripleCost = parseEther('0.15');

        const multiVaultCost = tripleCost + assets;

        // 2. Get total cost via FeeProxy (required for direct native token funding)
        let totalCost: bigint;
        try {
            totalCost = await publicClient.readContract({
                address: FEE_PROXY_ADDRESS as `0x${string}`,
                abi: FEE_PROXY_ABI,
                functionName: 'getTotalCreationCost',
                args: [1n, assets, multiVaultCost],
            } as any) as bigint;
        } catch (e) {
            const raw = tripleCost + assets;
            // Use 15% proxy fee fallback if contract call fails
            totalCost = (raw * 115n) / 100n;
        }

        const valueToSend = totalCost; // buffer already included in totalCost from getTotalTripleCreationCost

        onProgress?.(`Handshake Cost: ${formatEther(valueToSend)} ${CURRENCY_SYMBOL}`);

        onProgress?.("Verifying Protocol Approval...");
        const proxyOk = await getProxyApprovalStatus(checksumReceiver, { readRetries: 2, readDelayMs: 120 });
        if (!proxyOk) {
            onProgress?.("Awaiting Protocol Handshake...");
            await grantProxyApproval(checksumReceiver);
        }

        onProgress?.("Awaiting Synapse Signature...");
        
        // 3. Create triple via FeeProxy (handles direct native TRUST funding to user's vault balance)
        let request: any;
        try {
            const simulation = await publicClient.simulateContract({
                address: FEE_PROXY_ADDRESS as `0x${string}`,
                abi: FEE_PROXY_ABI,
                functionName: 'createTriples',
                account: checksumReceiver,
                args: [checksumReceiver, [sId], [pId], [oId], [assets], BigInt(LINEAR_CURVE_ID)],
                value: valueToSend,
            } as any);
            request = simulation.request;
        } catch (simulationError: any) {
            console.warn("SIMULATION_FAILED:", simulationError);
            const parsed = parseProtocolError(simulationError);
            const upper = parsed.toUpperCase();
            if (
                upper.includes("REVERTED") ||
                upper.includes("BALANCE") ||
                upper.includes("FEE") ||
                /already exists on-chain/i.test(parsed)
            ) {
                throw new Error(parsed);
            }
            throw simulationError;
        }

        const hash = await walletClient.writeContract(request);
        
        onProgress?.(`Broadcasting Triple... Hash: ${hash.slice(0,10)}...`);
        window.dispatchEvent(new Event('local-tx-updated'));
        return hash;
    } catch (error: any) {
        console.error('createSemanticTriple failed:', error?.message || error);
        const parsed = parseProtocolError(error);
        const upper = parsed.toUpperCase();
        if (
            upper.includes("REVERTED") ||
            upper.includes("BALANCE") ||
            upper.includes("FEE") ||
            /already exists on-chain/i.test(parsed)
        ) {
            throw new Error(parsed);
        }
        throw error;
    }
};

export type SemanticTripleBatchInput = {
  subjectId: string;
  predicateId: string;
  objectId: string;
  assetsWei: bigint;
};

/**
 * Single-transaction claim write batch via FeeProxy.createTriples.
 * All ids must be valid bytes32 term ids (existing atoms/terms).
 */
const ZERO_TX_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export const createSemanticTriplesBatch = async (
  triples: SemanticTripleBatchInput[],
  receiver: string,
  onProgress?: (log: string) => void
): Promise<`0x${string}`> => {
  if (!triples.length) throw new Error('No triples to submit.');
  const checksumReceiver = getAddress(receiver);
  const provider = getProvider();
  if (!provider) throw new Error('Wallet not connected');

  const pending: SemanticTripleBatchInput[] = [];
  for (const t of triples) {
    const sId = padTermId(t.subjectId);
    const pId = padTermId(t.predicateId);
    const oId = padTermId(t.objectId);
    const tripleId = calculateTripleId(sId, pId, oId);
    if (await isTermCreatedOnChain(tripleId)) {
      onProgress?.('Claim already on-chain — reusing existing vault.');
      continue;
    }
    if (await waitUntilTermCreatedOnChain(tripleId, { maxAttempts: 5, delayMs: 240 })) {
      onProgress?.('Claim registered — reusing existing vault.');
      continue;
    }
    pending.push(t);
  }

  if (!pending.length) {
    onProgress?.(
      triples.length > 1
        ? `All ${triples.length} claims already on-chain — nothing new to create.`
        : 'Claim already on-chain — nothing new to create.',
    );
    return ZERO_TX_HASH;
  }

  const subjectIds = pending.map((t) => padTermId(t.subjectId));
  const predicateIds = pending.map((t) => padTermId(t.predicateId));
  const objectIds = pending.map((t) => padTermId(t.objectId));
  const assets = pending.map((t) => t.assetsWei);
  const totalDeposit = assets.reduce((a, b) => a + b, 0n);
  const tripleCount = BigInt(pending.length);

  for (const a of assets) {
    if (a < CURVE_OFFSET) {
      throw new Error(
        `Minimum deposit per claim is ${formatEther(CURVE_OFFSET)} TRUST. One or more rows are below minimum.`
      );
    }
  }

  const walletClient = createWalletClient({
    chain: intuitionChain,
    transport: custom(provider),
    account: checksumReceiver,
  });

  let tripleCost: bigint;
  try {
    tripleCost = (await publicClient.readContract({
      address: FEE_PROXY_ADDRESS as `0x${string}`,
      abi: FEE_PROXY_ABI,
      functionName: 'getTripleCost',
    } as any)) as bigint;
  } catch {
    tripleCost = parseEther('0.15');
  }
  if (tripleCost < parseEther('0.15')) tripleCost = parseEther('0.15');

  const multiVaultCost = tripleCost * tripleCount + totalDeposit;
  let totalCost: bigint;
  try {
    totalCost = (await publicClient.readContract({
      address: FEE_PROXY_ADDRESS as `0x${string}`,
      abi: FEE_PROXY_ABI,
      functionName: 'getTotalCreationCost',
      args: [tripleCount, totalDeposit, multiVaultCost],
    } as any)) as bigint;
  } catch {
    totalCost = (multiVaultCost * 115n) / 100n;
  }

  onProgress?.(`Preparing ${pending.length} claim write(s)…`);
  onProgress?.(`Total value: ${formatEther(totalCost)} ${CURRENCY_SYMBOL}`);

  for (let i = 0; i < pending.length; i++) {
    const t = pending[i]!;
    const { ok, missing } = await validateTripleAtomsExist(t.subjectId, t.predicateId, t.objectId);
    if (!ok) {
      throw new Error(
        `Triple row ${i + 1}: atom(s) not on-chain yet — ${missing.join(', ')}. Wait for sync or verify IDs.`
      );
    }
  }

  const proxyOk = await getProxyApprovalStatus(checksumReceiver, { readRetries: 2, readDelayMs: 120 });
  if (!proxyOk) {
    onProgress?.('Approving FeeProxy…');
    await grantProxyApproval(checksumReceiver);
  }

  let request: any;
  try {
    const simulation = await publicClient.simulateContract({
      address: FEE_PROXY_ADDRESS as `0x${string}`,
      abi: FEE_PROXY_ABI,
      functionName: 'createTriples',
      account: checksumReceiver,
      args: [checksumReceiver, subjectIds, predicateIds, objectIds, assets, BigInt(LINEAR_CURVE_ID)],
      value: totalCost,
    } as any);
    request = simulation.request;
  } catch (e: any) {
    if (errorLooksLikeTripleAlreadyExists(e)) {
      onProgress?.('Claims reported duplicates — confirming on-chain…');
      for (const t of pending) {
        const tripleId = calculateTripleId(
          padTermId(t.subjectId),
          padTermId(t.predicateId),
          padTermId(t.objectId),
        );
        const ready =
          (await isTermCreatedOnChain(tripleId)) ||
          (await waitUntilTermCreatedOnChain(tripleId, { maxAttempts: 28, delayMs: 320 }));
        if (!ready) {
          throw new Error(
            `Claim ${tripleId.slice(0, 12)}… did not appear on-chain after duplicate — wait and retry.`,
          );
        }
      }
      onProgress?.('Claims already on-chain — reusing existing vaults.');
      window.dispatchEvent(new Event('local-tx-updated'));
      return ZERO_TX_HASH;
    }
    const parsed = parseProtocolError(e);
    throw new Error(parsed || 'Batch simulation failed');
  }

  let hash: `0x${string}`;
  try {
    hash = await walletClient.writeContract(request);
  } catch (e: any) {
    if (errorLooksLikeTripleAlreadyExists(e)) {
      onProgress?.('Claims reported duplicates — confirming on-chain…');
      for (const t of pending) {
        const tripleId = calculateTripleId(
          padTermId(t.subjectId),
          padTermId(t.predicateId),
          padTermId(t.objectId),
        );
        const ready =
          (await isTermCreatedOnChain(tripleId)) ||
          (await waitUntilTermCreatedOnChain(tripleId, { maxAttempts: 28, delayMs: 320 }));
        if (!ready) {
          throw new Error(
            `Claim ${tripleId.slice(0, 12)}… did not appear on-chain after duplicate — wait and retry.`,
          );
        }
      }
      onProgress?.('Claims already on-chain — reusing existing vaults.');
      window.dispatchEvent(new Event('local-tx-updated'));
      return ZERO_TX_HASH;
    }
    const parsed = parseProtocolError(e);
    throw new Error(parsed || 'Batch submit failed');
  }
  window.dispatchEvent(new Event('local-tx-updated'));
  return hash;
};

export const switchNetworkManual = async () => switchNetwork();
export const getClientChainId = async () => CHAIN_ID;
export const fetchAtomNameFromChain = async (id: string) => null;

/**
 * Normalizes an address-like id to a 42-char checksummed address.
 * Handles both 42-char addresses and 66-char padded format (0x0000...0000 + addr).
 * Returns null when the id is not a valid address.
 */
export const toAddress = (id: string | null | undefined): string | null => {
  if (!id || typeof id !== 'string') return null;
  const t = id.trim();
  if (t.length === 42 && t.startsWith('0x') && isAddress(t)) {
    try { return getAddress(t); } catch { return null; }
  }
  if (t.length === 66 && t.startsWith('0x000000000000000000000000')) {
    const unpadded = '0x' + t.slice(26);
    if (isAddress(unpadded)) {
      try { return getAddress(unpadded); } catch { return null; }
    }
  }
  return null;
};

/** True if the id can be used with the subgraph account id / prepareQueryIds (42-char hex or padded form). */
export function isGraphResolvableAddress(id: string | null | undefined): boolean {
  if (!id) return false;
  return toAddress(id) !== null || isAddress(id as `0x${string}`);
}

/**
 * Resolves an ENS name to an Ethereum address using Mainnet.
 */
export const resolveENS = async (name: string): Promise<string | null> => {
    if (!name || !name.endsWith('.eth')) return null;
    try {
        // Use normalized name to satisfy ENS protocol requirements
        const normalizedName = normalize(name.toLowerCase());
        const address = await mainnetClient.getEnsAddress({ name: normalizedName });
        return address || null;
    } catch (e) {
        console.error("ENS_RESOLUTION_FAILURE:", e);
        // Explicit fallback for common "Internal error" from specific RPCs
        return null;
    }
};

/**
 * Reverse resolves an Ethereum address to an ENS name.
 */
export const reverseResolveENS = async (address: string): Promise<string | null> => {
    try {
        const ensName = await mainnetClient.getEnsName({ address: getAddress(address) });
        return ensName;
    } catch (e) {
        return null;
    }
};

export const disconnectWallet = () => {
  wagmiAddress = null;
  activeProvider = null;
  if (typeof window !== 'undefined') localStorage.setItem(DISCONNECT_FLAG_KEY, '1');
};
/**
 * Returns the protocol `minDeposit` (TRUST). For now this mirrors
 * `CURVE_OFFSET` — when we wire the on-chain `getGeneralConfig()` read this
 * function can query the chain. Lowered to 0.1 for testing-friendly stakes.
 */
export const getProtocolConfig = async () => ({ minDeposit: formatEther(CURVE_OFFSET) });
