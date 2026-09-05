/**
 * Headless validation of the M09 "sign once to play" flow on Intuition MAINNET (1155).
 * ⚠️ Spends a SMALL amount of REAL TRUST (gas + a ~0.001 self-transfer). Use a THROWAWAY key.
 *
 * Proves the full lifecycle end-to-end with throwaway keys and tiny value, mirroring the in-app
 * services/delegation.ts engine (Option A, embedded local key):
 *   7702 upgrade → sign delegation (cap + expiry + custom enforcers) → fund session → redeem → revoke.
 * It also empirically answers whether the chain accepts the EIP-7702 tx type (step 2 sends one).
 *
 * No bundler is used: the session key redeems via sendTransactionWithDelegation — a normal tx to
 * the DelegationManager (erc7710WalletActions), exactly like the app.
 *
 * USAGE (needs a funded, THROWAWAY mainnet key with a little TRUST for gas + transfers):
 *   DELEGATOR_PK=0xabc... npm run delegation:smoke
 *
 * Optional overrides: INTUITION_RPC=https://...  INTUITION_CHAIN_ID=13579  (e.g. to use testnet)
 *
 * Each step is logged and wrapped so a failure prints the EXACT error/shape.
 */

import { createPublicClient, createWalletClient, http, parseEther, formatEther, pad, numberToHex, concat } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
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

// Defaults to Intuition MAINNET (1155). Override via env to point elsewhere.
const CHAIN_ID = Number(process.env.INTUITION_CHAIN_ID || 1155);
const RPC = process.env.INTUITION_RPC || 'https://rpc.intuition.systems/http';
const EXPLORER = (process.env.INTUITION_EXPLORER || 'https://explorer.intuition.systems').replace(/\/+$/, '') + '/tx/';

const chain = {
  id: CHAIN_ID,
  name: 'Intuition',
  nativeCurrency: { name: 'TRUST', symbol: 'TRUST', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const info = (m) => console.log(`  ${m}`);
const fail = (step, e) => {
  console.log(`\x1b[31m✗ ${step}\x1b[0m`);
  console.log('  error:', e?.shortMessage || e?.message || e);
  if (e?.metaMessages) console.log('  detail:', e.metaMessages.join('\n  '));
  process.exit(1);
};

const pk = process.env.DELEGATOR_PK;
if (!pk || !pk.startsWith('0x')) {
  console.error('Set DELEGATOR_PK=0x... — a funded, THROWAWAY Intuition key (a little TRUST for gas + transfers).');
  process.exit(1);
}

const main = async () => {
  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const walletClient = createWalletClient({ account, chain, transport: http(RPC) });

  console.log('\x1b[33m⚠ MAINNET — this spends a small amount of REAL TRUST. Use a throwaway key.\x1b[0m');
  info(`chain: ${CHAIN_ID} · delegator (EOA): ${account.address}`);
  const bal = await publicClient.getBalance({ address: account.address }).catch(() => 0n);
  info(`balance: ${formatEther(bal)} TRUST`);
  if (bal < parseEther('0.02')) fail('precheck', new Error('Fund the delegator with ≥0.02 TRUST first.'));

  // --- Step 1: resolve the Delegation Framework environment ---------------------------
  let env;
  try {
    env = getSmartAccountsEnvironment(CHAIN_ID);
    ok(`env resolved · DelegationManager ${env.DelegationManager}`);
  } catch (e) { fail('getSmartAccountsEnvironment', e); }

  // --- Step 2: EIP-7702 upgrade the local EOA (THIS also proves chain 7702 support) ---
  let smartAccount;
  try {
    const impl = env.implementations.EIP7702StatelessDeleGatorImpl;
    info(`7702 impl: ${impl}`);
    const authorization = await walletClient.signAuthorization({ account, contractAddress: impl, executor: 'self' });
    // Estimate WITH the authorizationList — Arbitrum's wallet auto-estimate omits the ~25k auth cost
    // and would send a limit below the floor ("gas too low"). Buffer +50% (gas is ~0.01 gwei here).
    const gas = await publicClient.estimateGas({ account, to: account.address, data: '0x', authorizationList: [authorization] });
    // Self-call the EOA's own address (executor:'self' bumps the auth nonce by 1). Do NOT send to 0x0.
    const upgradeHash = await walletClient.sendTransaction({ authorizationList: [authorization], to: account.address, data: '0x', gas: (gas * 3n) / 2n });
    info(`7702 upgrade tx: ${EXPLORER}${upgradeHash}`);
    await publicClient.waitForTransactionReceipt({ hash: upgradeHash });
    ok('EIP-7702 upgrade mined — chain ACCEPTS the 7702 tx type');
  } catch (e) {
    console.log('\x1b[33m! EIP-7702 step failed — chain may not accept the 7702 tx type.\x1b[0m');
    console.log('  → fall back to Implementation.Hybrid (new smart-account address).');
    fail('eip7702-upgrade', e);
  }

  // --- Step 3: smart-account instance for the (now upgraded) EOA — LOCAL-key signer ---
  try {
    smartAccount = await toMetaMaskSmartAccount({
      client: publicClient,
      implementation: Implementation.Stateless7702,
      address: account.address,
      signer: { account }, // AccountSignerConfig — the embedded local-key path
    });
    ok('smart account instantiated');
  } catch (e) { fail('toMetaMaskSmartAccount', e); }

  // --- Step 4: ephemeral session key + scoped delegation (cap + expiry + custom enforcers) ---
  const sessionPk = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPk);
  info(`session key: ${sessionAccount.address}`);
  let signed;
  try {
    const expiry = Math.floor(Date.now() / 1000) + 7200;
    const caveats = createCaveatBuilder(env)
      .addCaveat('timestamp', { afterThreshold: 0, beforeThreshold: expiry })
      .build();
    // M09 "roll your own caveat": hand-built custom enforcers via createCaveat (positional: enforcer, terms).
    caveats.push(createCaveat(env.caveatEnforcers.LimitedCallsEnforcer, pad(numberToHex(5), { size: 32 })));   // ≤5 redeems
    caveats.push(createCaveat(env.caveatEnforcers.RedeemerEnforcer, concat([sessionAccount.address])));         // lock redeemer
    const delegation = createDelegation({
      environment: env,
      from: account.address,
      to: sessionAccount.address,
      scope: { type: 'nativeTokenTransferAmount', maxAmount: parseEther('1') },
      caveats,
    });
    ok(`delegation built (1 TRUST cap + expiry + LimitedCalls + Redeemer · ${delegation.caveats.length} caveats)`);

    // --- Step 5: user signs the delegation ONCE -------------------------------------
    const signature = await smartAccount.signDelegation({ delegation });
    signed = { ...delegation, signature };
    ok('delegation signed');
  } catch (e) { fail('create/sign delegation', e); }

  // --- Step 6: fund the session key for gas, then redeem a tiny transfer ---------------
  try {
    const fundHash = await walletClient.sendTransaction({ to: sessionAccount.address, value: parseEther('0.005') });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });
    ok(`session key funded for gas (${EXPLORER}${fundHash})`);

    const sessionWallet = createWalletClient({ account: sessionAccount, chain, transport: http(RPC) }).extend(
      erc7710WalletActions(),
    );

    // No redeemDelegations in kit@1.6.0 — sendTransactionWithDelegation is the plain-tx (no-bundler) redeem.
    const redeemHash = await sessionWallet.sendTransactionWithDelegation({
      account: sessionAccount,
      chain,
      to: account.address,
      value: parseEther('0.001'),
      permissionContext: [signed],
      delegationManager: env.DelegationManager,
    });
    info(`redeem tx: ${EXPLORER}${redeemHash}`);
    await publicClient.waitForTransactionReceipt({ hash: redeemHash });
    ok('REDEEM SUCCEEDED — sign-once → popup-free redeem path works on Intuition 🎉');
  } catch (e) { fail('sendTransactionWithDelegation', e); }

  // --- Step 7: revoke on-chain (disableDelegation) -------------------------------------
  try {
    const revokeHash = await DelegationManager.execute.disableDelegation({
      client: walletClient,
      delegationManagerAddress: env.DelegationManager,
      delegation: signed,
    });
    info(`revoke tx: ${EXPLORER}${revokeHash}`);
    await publicClient.waitForTransactionReceipt({ hash: revokeHash });
    ok('REVOKED on-chain — full M09 lifecycle validated end-to-end ✅');
  } catch (e) { fail('disableDelegation', e); }
};

main().catch((e) => fail('unexpected', e));
