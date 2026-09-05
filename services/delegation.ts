/**
 * Delegated Arena — "sign once to play" (MetaMask Smart Accounts / ERC-7710, EIP-7702).
 *
 * ─── M09 tutorial engine (Option A: embedded/local wallet) ───────────────────────────────
 * This module teaches the FULL delegation lifecycle explicitly, one verified step at a time:
 *   1. generate an embedded delegator wallet (a local key the app controls, in memory)
 *   2. EIP-7702 upgrade that EOA to a Stateless7702 MetaMask smart account (SAME address)
 *   3. build a scoped delegation to an ephemeral session key — caveats (enforcers):
 *        • native-token spend CAP  (auto-added by the `scope`, NativeTokenTransferAmountEnforcer)
 *        • hard EXPIRY             (TimestampEnforcer)
 *        • optional CUSTOM enforcers (LimitedCalls / Redeemer) hand-built via `createCaveat`
 *   4. sign the delegation ONCE (smartAccount.signDelegation)
 *   5. redeem each pick with the session key as a NORMAL tx (sendTransactionWithDelegation) —
 *      no bundler (Intuition has no ERC-4337), no popup. The DELEGATOR pays the stake; the
 *      session key pays only gas.
 *   6. revoke on-chain (DelegationManager.disableDelegation) — instant hard kill.
 *
 * Why Option A (embedded key) and not Option B (ERC-7715 / `requestExecutionPermissions`):
 *   injected MetaMask BLOCKS `signAuthorization`/`signDelegation` for an EOA, so the explicit
 *   lifecycle can only be shown with a local key the app owns. Option B hides every step inside
 *   MetaMask (one opaque call) and needs Flask — great for prod, useless for a tutorial.
 *
 * ISOLATED + FLAG-GATED: reachable only at /climb/delegated when VITE_DELEGATION_ENABLED=true.
 * The live Arena (/climb) and the on-chain mint path are never touched by this file. Targets the
 * app's ACTIVE Intuition network (mainnet 1155 for this deploy). ⚠️ MAINNET = REAL TRUST — caps
 * are kept small and every write waits for its receipt.
 *
 * Every kit/viem symbol below is verified against @metamask/smart-accounts-kit@1.6.0 and
 * viem@2.46.2 installed types (no `as any` guesses).
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseEther,
  formatEther,
  pad,
  numberToHex,
  concat,
  type Address,
  type Hex,
  type WalletClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  getSmartAccountsEnvironment,
  toMetaMaskSmartAccount,
  Implementation,
  createDelegation,
  createCaveat,
} from '@metamask/smart-accounts-kit';
import { createCaveatBuilder } from '@metamask/smart-accounts-kit/utils';
import { erc7710WalletActions } from '@metamask/smart-accounts-kit/actions';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';
import { CHAIN_ID, RPC_URL } from '../constants';
import { intuitionChain } from '../wagmi-config';

/** Off by default. Set VITE_DELEGATION_ENABLED=true to expose the lane (active Intuition network). */
export const DELEGATION_ENABLED =
  String((import.meta as any).env?.VITE_DELEGATION_ENABLED ?? '').toLowerCase() === 'true';

/** The lane targets the app's ACTIVE Intuition network (mainnet 1155 for this deployment). */
export const DELEGATION_CHAIN_ID = CHAIN_ID;

/**
 * Session scope. ⚠️ MAINNET = REAL TRUST. The cap is the max total the session key can move on the
 * delegator's behalf, enforced on-chain by the native-transfer enforcer; the timestamp enforcer
 * expires it after TTL. Both are revocable at any time.
 */
export const SESSION_CAP_TRUST = '1';
export const SESSION_TTL_SECONDS = 2 * 60 * 60;
/** Per-pick stake redeemed by the session key (real TRUST, small on purpose). */
export const PICK_STAKE_TRUST = '0.01';
/** Gas drip from delegator → session key so the session key can send redeem txs itself. */
export const SESSION_GAS_TRUST = '0.02';
/** Suggested amount to fund the embedded delegator with (covers 7702 gas + a gas drip + a few picks). */
export const SUGGESTED_FUNDING_TRUST = '0.1';

/** A locally-generated keypair we hold only in memory (delegator or session key). */
export type Keypair = { privateKey: Hex; address: Address };
/** A delegation created + signed by the delegator's smart account, ready to redeem/revoke. */
export type SignedDelegation = ReturnType<typeof createDelegation>;
/** Which optional "roll your own caveat" enforcers to attach (the M09 custom-enforcer step). */
export type CustomEnforcers = { limitedCalls?: number; lockRedeemer?: boolean };

/** Resolve the Delegation Framework environment (contract addresses) for the active chain. */
export function getDelegationEnvironment() {
  return getSmartAccountsEnvironment(CHAIN_ID);
}

/** True only when the kit knows the active chain AND the lane is enabled. */
export function isDelegationAvailable(): boolean {
  if (!DELEGATION_ENABLED) return false;
  try {
    getSmartAccountsEnvironment(CHAIN_ID);
    return true;
  } catch {
    return false;
  }
}

/** The deployed enforcer / framework addresses on the active chain — surfaced for the tutorial UI. */
export function getEnforcerAddresses() {
  const env = getDelegationEnvironment();
  return {
    delegationManager: env.DelegationManager as Address,
    stateless7702Impl: env.implementations.EIP7702StatelessDeleGatorImpl as Address,
    timestamp: env.caveatEnforcers.TimestampEnforcer as Address,
    nativeTokenTransferAmount: env.caveatEnforcers.NativeTokenTransferAmountEnforcer as Address,
    limitedCalls: env.caveatEnforcers.LimitedCallsEnforcer as Address,
    redeemer: env.caveatEnforcers.RedeemerEnforcer as Address,
  };
}

const publicClient = createPublicClient({ chain: intuitionChain, transport: http(RPC_URL) });

/** Wallet client backed by the user's injected provider — used only for the optional "fund from wallet" step. */
export function getInjectedWalletClient(): WalletClient | null {
  const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
  if (!eth) return null;
  return createWalletClient({ chain: intuitionChain, transport: custom(eth) });
}

/** Generate an ephemeral, in-memory keypair. Never persisted; dies on refresh. */
export function generateKeypair(): Keypair {
  const privateKey = generatePrivateKey();
  return { privateKey, address: privateKeyToAccount(privateKey).address };
}

/** Native TRUST balance of an address, as a decimal string. */
export async function getBalanceTrust(address: Address): Promise<string> {
  const wei = await publicClient.getBalance({ address });
  return formatEther(wei);
}

/**
 * Optional convenience: fund the embedded delegator from the user's connected MetaMask (a normal
 * transfer — MetaMask allows it). Returns the tx hash; the caller polls the delegator balance.
 */
export async function fundAddressFromInjected(
  walletClient: WalletClient,
  to: Address,
  amountTrust: string,
): Promise<Hex> {
  const [from] = await walletClient.getAddresses();
  return walletClient.sendTransaction({
    account: from,
    chain: intuitionChain,
    to,
    value: parseEther(amountTrust),
  });
}

/**
 * Detect an existing EIP-7702 upgrade. A 7702-delegated EOA has code `0xef0100 || <impl address>`.
 * Lets the upgrade step be idempotent (re-running a live session won't double-upgrade).
 */
export async function is7702Upgraded(address: Address): Promise<boolean> {
  const code = await publicClient.getCode({ address });
  if (!code || code === '0x') return false;
  const impl = getDelegationEnvironment().implementations.EIP7702StatelessDeleGatorImpl.toLowerCase();
  return code.toLowerCase() === `0xef0100${impl.slice(2)}`;
}

/**
 * STEP 2 — EIP-7702 upgrade the embedded delegator EOA to a Stateless7702 smart account (SAME
 * address). `executor: 'self'` makes viem bump the authorization nonce by 1 (the signer is also the
 * tx sender). Omitting a custom `to` (we self-call `account.address`) installs the delegated code.
 * Also empirically proves the chain accepts the 7702 tx type.
 */
export async function upgradeDelegatorTo7702(
  delegatorPk: Hex,
): Promise<{ hash: Hex | null; impl: Address; alreadyUpgraded: boolean }> {
  const account = privateKeyToAccount(delegatorPk);
  const impl = getDelegationEnvironment().implementations.EIP7702StatelessDeleGatorImpl as Address;
  if (await is7702Upgraded(account.address)) return { hash: null, impl, alreadyUpgraded: true };

  const walletClient = createWalletClient({ account, chain: intuitionChain, transport: http(RPC_URL) });
  const authorization = await walletClient.signAuthorization({ account, contractAddress: impl, executor: 'self' });

  // Arbitrum Nitro under-counts the type-4 authorization's intrinsic cost (~25k) in gas estimation
  // (both the wallet auto-estimate AND estimateGas-with-authorizationList can return the bare
  // self-call cost), so a % buffer can still land below the real floor → "gas too low". Add FIXED
  // headroom that always clears it. Gas here is ~0.01 gwei, so the extra limit is effectively free
  // (the limit is a ceiling — you pay only for gas actually used).
  const estimate = await publicClient
    .estimateGas({ account, to: account.address, data: '0x', authorizationList: [authorization] })
    .catch(() => 0n);
  const gasLimit = (estimate > 21000n ? estimate : 47000n) + 120000n;

  const hash = await walletClient.sendTransaction({
    authorizationList: [authorization],
    to: account.address,
    data: '0x',
    gas: gasLimit,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash, impl, alreadyUpgraded: false };
}

/** The delegator's Stateless7702 smart-account handle (used to sign the delegation). */
export async function getDelegatorSmartAccount(delegatorPk: Hex) {
  const account = privateKeyToAccount(delegatorPk);
  return toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Stateless7702,
    address: account.address,
    signer: { account }, // AccountSignerConfig — the local-key path (no injected provider needed)
  });
}

/**
 * Build the caveat set for a session. The native-transfer CAP is added automatically by the
 * `scope` in {@link buildAndSignDelegation}; here we add the always-on EXPIRY (timestamp) plus any
 * optional CUSTOM enforcers, hand-built with `createCaveat` (the M09 "roll your own caveat" step):
 *   • LimitedCalls — cap the number of redeems to N (terms = uint256 limit, 32-byte big-endian).
 *   • Redeemer     — lock redemption to the session key (terms = packed 20-byte address).
 */
export function buildSessionCaveats(sessionAddress: Address, expiry: number, custom?: CustomEnforcers) {
  const env = getDelegationEnvironment();
  const caveats = createCaveatBuilder(env)
    .addCaveat('timestamp', { afterThreshold: 0, beforeThreshold: expiry })
    .build();

  if (custom?.limitedCalls && custom.limitedCalls > 0) {
    // createCaveat is POSITIONAL: (enforcer, terms, args?). Terms = the uint256 limit, 32 bytes.
    caveats.push(createCaveat(env.caveatEnforcers.LimitedCallsEnforcer as Hex, pad(numberToHex(custom.limitedCalls), { size: 32 })));
  }
  if (custom?.lockRedeemer) {
    // Redeemer terms are addresses tight-packed (20 bytes each), no ABI padding.
    caveats.push(createCaveat(env.caveatEnforcers.RedeemerEnforcer as Hex, concat([sessionAddress])));
  }
  return caveats;
}

/**
 * STEPS 3 + 4 — create the scoped delegation (native cap + expiry + optional custom enforcers) and
 * sign it ONCE with the delegator's smart account. Returns the ready-to-redeem signed delegation.
 */
export async function buildAndSignDelegation(args: {
  delegatorPk: Hex;
  sessionAddress: Address;
  capTrust?: string;
  ttlSeconds?: number;
  custom?: CustomEnforcers;
}): Promise<{ signed: SignedDelegation; expiry: number; capTrust: string; caveatCount: number }> {
  const capTrust = args.capTrust ?? SESSION_CAP_TRUST;
  const ttl = args.ttlSeconds ?? SESSION_TTL_SECONDS;
  const account = privateKeyToAccount(args.delegatorPk);
  const env = getDelegationEnvironment();
  const expiry = Math.floor(Date.now() / 1000) + ttl;

  const caveats = buildSessionCaveats(args.sessionAddress, expiry, args.custom);
  const delegation = createDelegation({
    environment: env,
    from: account.address,
    to: args.sessionAddress,
    scope: { type: 'nativeTokenTransferAmount', maxAmount: parseEther(capTrust) },
    caveats,
  });

  const smartAccount = await getDelegatorSmartAccount(args.delegatorPk);
  const signature = await smartAccount.signDelegation({ delegation });
  return { signed: { ...delegation, signature }, expiry, capTrust, caveatCount: delegation.caveats.length };
}

/** Drip gas from the delegator to the session key so the session key can send its own redeem txs. */
export async function fundSessionKey(
  delegatorPk: Hex,
  sessionAddress: Address,
  amountTrust: string = SESSION_GAS_TRUST,
): Promise<Hex> {
  const account = privateKeyToAccount(delegatorPk);
  const walletClient = createWalletClient({ account, chain: intuitionChain, transport: http(RPC_URL) });
  const hash = await walletClient.sendTransaction({ to: sessionAddress, value: parseEther(amountTrust) });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * STEP 5 — redeem ONE Arena pick with the session key. A normal tx to the DelegationManager (no
 * bundler, no popup): the kit encodes the execution and the DelegationManager makes the DELEGATOR's
 * smart account transfer `valueTrust` to `target`. The session key pays only gas.
 */
export async function redeemPick(args: {
  signedDelegation: SignedDelegation;
  sessionPrivateKey: Hex;
  target: Address;
  valueTrust: string;
}): Promise<Hex> {
  const env = getDelegationEnvironment();
  const sessionAccount = privateKeyToAccount(args.sessionPrivateKey);
  const sessionWallet = createWalletClient({
    account: sessionAccount,
    chain: intuitionChain,
    transport: http(RPC_URL),
  }).extend(erc7710WalletActions());

  return sessionWallet.sendTransactionWithDelegation({
    account: sessionAccount,
    chain: intuitionChain,
    to: args.target,
    value: parseEther(args.valueTrust),
    permissionContext: [args.signedDelegation], // PermissionContext = Delegation[]
    delegationManager: env.DelegationManager,
  });
}

/**
 * Reclaim an embedded key's remaining balance back to `to` (the user's real wallet) — the escape
 * hatch so leftover TRUST isn't stranded when the in-memory keys are discarded. Sends the full
 * balance minus a gas reserve; returns null if there's nothing worth reclaiming. Works for both the
 * plain session key and the 7702-upgraded delegator (an outbound transfer doesn't invoke its code).
 */
export async function reclaimBalance(fromPk: Hex, to: Address): Promise<Hex | null> {
  const account = privateKeyToAccount(fromPk);
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) return null;

  const gasPrice = await publicClient.getGasPrice();
  const estGas = await publicClient.estimateGas({ account, to, value: 1n }).catch(() => 60000n);
  const gasLimit = estGas * 2n; // headroom for Arbitrum L1-fee variance
  const feeReserve = gasPrice * gasLimit * 2n;
  if (balance <= feeReserve) return null; // dust — not worth a tx

  const walletClient = createWalletClient({ account, chain: intuitionChain, transport: http(RPC_URL) });
  const hash = await walletClient.sendTransaction({ to, value: balance - feeReserve, gas: gasLimit });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * STEP 6 — revoke on-chain. Calls DelegationManager.disableDelegation FROM the delegator's own
 * wallet client (after 7702 the EOA == the smart account, and the contract requires
 * msg.sender == delegation.delegator). Instant hard kill on top of the cap + expiry caveats.
 */
export async function revokeDelegation(args: {
  delegatorPk: Hex;
  signedDelegation: SignedDelegation;
}): Promise<Hex> {
  const account = privateKeyToAccount(args.delegatorPk);
  const env = getDelegationEnvironment();
  const walletClient = createWalletClient({ account, chain: intuitionChain, transport: http(RPC_URL) });
  const hash = await DelegationManager.execute.disableDelegation({
    client: walletClient,
    delegationManagerAddress: env.DelegationManager,
    delegation: args.signedDelegation,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
