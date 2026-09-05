/**
 * Delegated Arena — M09 tutorial: the FULL ERC-7710 / EIP-7702 delegation lifecycle, one
 * explicit step at a time (Option A: embedded/local wallet).
 *
 *   1. generate embedded wallets → 2. EIP-7702 upgrade → 3. sign delegation (caveats + custom
 *   enforcers) → 4. fund session key → 5. redeem picks (popup-free) → 6. revoke on-chain.
 *
 * ISOLATED + FLAG-GATED: reachable only at /climb/delegated when VITE_DELEGATION_ENABLED=true.
 * The live Arena (/climb) and the on-chain mint path are never touched by this file.
 *
 * ⚠️ MAINNET = REAL TRUST. Picks self-send (stake returns to your embedded wallet — only gas is
 * spent), caps are small, and every write waits for its receipt. The delegation is validated by
 * the services/delegation.ts engine, which is verified against the installed kit/viem types.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import type { Address, Hex } from 'viem';
import {
  Loader2,
  ShieldCheck,
  Zap,
  Ban,
  ExternalLink,
  Wallet,
  KeyRound,
  PenLine,
  Fuel,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  isDelegationAvailable,
  DELEGATION_CHAIN_ID,
  SESSION_CAP_TRUST,
  SESSION_TTL_SECONDS,
  PICK_STAKE_TRUST,
  SESSION_GAS_TRUST,
  SUGGESTED_FUNDING_TRUST,
  generateKeypair,
  getBalanceTrust,
  fundAddressFromInjected,
  upgradeDelegatorTo7702,
  buildAndSignDelegation,
  fundSessionKey,
  redeemPick,
  revokeDelegation,
  reclaimBalance,
  getEnforcerAddresses,
  type Keypair,
  type SignedDelegation,
  type CustomEnforcers,
} from '../services/delegation';
import { EXPLORER_URL } from '../constants';

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const txUrl = (hash: string) => `${EXPLORER_URL.replace(/\/+$/, '')}/tx/${hash}`;

/**
 * Persist the embedded wallets in sessionStorage so a page REFRESH doesn't strand their TRUST
 * (survives F5, auto-clears when the tab closes). ⚠️ These are throwaway keys holding small amounts;
 * still, use the reset/reclaim before closing the tab. Mid-flow step state is intentionally NOT
 * persisted — after a refresh the on-chain state (e.g. already-upgraded) is re-derived.
 */
const WALLETS_KEY = 'inturank.delegated.wallets';
const loadWallets = (): Wallets | null => {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(WALLETS_KEY) : null;
    return raw ? (JSON.parse(raw) as Wallets) : null;
  } catch {
    return null;
  }
};

interface Wallets {
  delegator: Keypair;
  session: Keypair;
}

interface Delegation {
  signed: SignedDelegation;
  expiry: number; // unix seconds
  capTrust: string;
  caveatCount: number;
}

const DelegatedArena: React.FC = () => {
  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [wallets, setWallets] = useState<Wallets | null>(loadWallets);
  const [delegatorBalance, setDelegatorBalance] = useState('0');
  const [sessionBalance, setSessionBalance] = useState('0');

  const [upgradeHash, setUpgradeHash] = useState<Hex | null>(null);
  const [upgradeNote, setUpgradeNote] = useState<string | null>(null);

  const [custom, setCustom] = useState<CustomEnforcers>({ limitedCalls: undefined, lockRedeemer: false });
  const [delegation, setDelegation] = useState<Delegation | null>(null);

  const [sessionFundHash, setSessionFundHash] = useState<Hex | null>(null);
  const [picks, setPicks] = useState<Hex[]>([]);
  const [spentTrust, setSpentTrust] = useState(0);
  const [revokeHash, setRevokeHash] = useState<Hex | null>(null);
  const [reclaimNote, setReclaimNote] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ step: string; msg: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const enforcers = useMemo(() => (isDelegationAvailable() ? getEnforcerAddresses() : null), []);

  // Persist / clear the embedded wallets so a refresh keeps them (and their funds) alive.
  useEffect(() => {
    try {
      if (wallets) window.sessionStorage.setItem(WALLETS_KEY, JSON.stringify(wallets));
      else window.sessionStorage.removeItem(WALLETS_KEY);
    } catch {
      /* storage blocked (private mode) — wallets stay in memory only */
    }
  }, [wallets]);

  // Expiry / balance tick while a session is live.
  useEffect(() => {
    if (!wallets) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [wallets]);

  const refreshBalances = useCallback(async () => {
    if (!wallets) return;
    try {
      const [d, s] = await Promise.all([
        getBalanceTrust(wallets.delegator.address),
        getBalanceTrust(wallets.session.address),
      ]);
      setDelegatorBalance(d);
      setSessionBalance(s);
    } catch {
      /* transient RPC — ignore, next tick retries */
    }
  }, [wallets]);

  // Poll balances every 4s once wallets exist (so "fund this address" reflects incoming TRUST).
  useEffect(() => {
    if (!wallets) return;
    void refreshBalances();
    const id = window.setInterval(() => void refreshBalances(), 4000);
    return () => window.clearInterval(id);
  }, [wallets, refreshBalances]);

  const run = useCallback(async (step: string, fn: () => Promise<void>) => {
    setError(null);
    setBusy(step);
    try {
      await fn();
    } catch (e: any) {
      setError({ step, msg: e?.shortMessage || e?.message || String(e) });
    } finally {
      setBusy(null);
    }
  }, []);

  // ── Derived gating ───────────────────────────────────────────────────────
  const wrongChain = isConnected && chain && chain.id !== DELEGATION_CHAIN_ID;
  const funded = Number(delegatorBalance) > 0;
  const upgraded = !!upgradeHash || upgradeNote === 'already';
  const signed = !!delegation;
  const sessionReady = !!sessionFundHash;
  const revoked = !!revokeHash;
  const cap = delegation ? Number(delegation.capTrust) : Number(SESSION_CAP_TRUST);
  const capRemaining = Math.max(0, cap - spentTrust);
  const secsLeft = delegation ? Math.max(0, Math.floor((delegation.expiry * 1000 - now) / 1000)) : 0;
  const expired = signed && secsLeft <= 0;
  const canPick = signed && sessionReady && !revoked && !expired && capRemaining >= Number(PICK_STAKE_TRUST);
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');

  // ── Actions ──────────────────────────────────────────────────────────────
  const doGenerate = () =>
    run('generate', async () => {
      setWallets({ delegator: generateKeypair(), session: generateKeypair() });
      setUpgradeHash(null);
      setUpgradeNote(null);
      setDelegation(null);
      setSessionFundHash(null);
      setPicks([]);
      setSpentTrust(0);
      setRevokeHash(null);
    });

  const doFundFromWallet = () =>
    run('fund-delegator', async () => {
      if (!walletClient || !wallets) throw new Error('Connect a wallet to fund from it (or send TRUST manually).');
      await fundAddressFromInjected(walletClient as any, wallets.delegator.address, SUGGESTED_FUNDING_TRUST);
      // The transfer tx is submitted; the 4s balance poll will reflect it once mined.
    });

  const doUpgrade = () =>
    run('upgrade', async () => {
      if (!wallets) return;
      const res = await upgradeDelegatorTo7702(wallets.delegator.privateKey);
      setUpgradeHash(res.hash);
      setUpgradeNote(res.alreadyUpgraded ? 'already' : 'fresh');
    });

  const doSign = () =>
    run('sign', async () => {
      if (!wallets) return;
      const res = await buildAndSignDelegation({
        delegatorPk: wallets.delegator.privateKey,
        sessionAddress: wallets.session.address,
        custom: {
          limitedCalls: custom.limitedCalls && custom.limitedCalls > 0 ? custom.limitedCalls : undefined,
          lockRedeemer: custom.lockRedeemer,
        },
      });
      setDelegation(res);
    });

  const doFundSession = () =>
    run('fund-session', async () => {
      if (!wallets) return;
      const hash = await fundSessionKey(wallets.delegator.privateKey, wallets.session.address);
      setSessionFundHash(hash);
      void refreshBalances();
    });

  const doPick = () =>
    run('pick', async () => {
      if (!wallets || !delegation) return;
      const hash = await redeemPick({
        signedDelegation: delegation.signed,
        sessionPrivateKey: wallets.session.privateKey,
        target: wallets.delegator.address, // self-send: stake returns to the embedded wallet, only gas spent
        valueTrust: PICK_STAKE_TRUST,
      });
      setPicks((p) => [hash, ...p]);
      setSpentTrust((v) => v + Number(PICK_STAKE_TRUST));
      void refreshBalances();
    });

  const doRevoke = () =>
    run('revoke', async () => {
      if (!wallets || !delegation) return;
      const hash = await revokeDelegation({
        delegatorPk: wallets.delegator.privateKey,
        signedDelegation: delegation.signed,
      });
      setRevokeHash(hash);
    });

  const doReclaim = () =>
    run('reclaim', async () => {
      if (!wallets || !address) throw new Error('Connect the wallet you want the TRUST returned to.');
      const dest = address as Address;
      const out: string[] = [];
      const d = await reclaimBalance(wallets.delegator.privateKey, dest);
      if (d) out.push(`delegator ${short(d)}`);
      const s = await reclaimBalance(wallets.session.privateKey, dest);
      if (s) out.push(`session ${short(s)}`);
      setReclaimNote(out.length ? `Returned → ${out.join(' · ')}` : 'Nothing to reclaim (only dust left).');
      void refreshBalances();
    });

  const copyAddr = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  };

  // ── Gate: lane off ─────────────────────────────────────────────────────────
  if (!isDelegationAvailable()) {
    return (
      <Centered>
        <p className="text-sm text-slate-400">
          Delegated sessions are off. Set{' '}
          <code className="text-intuition-primary">VITE_DELEGATION_ENABLED=true</code> to enable the lane on the active
          Intuition network (chainId {DELEGATION_CHAIN_ID}).
        </p>
      </Centered>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-10">
      {/* Header */}
      <header className="text-center">
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-white">Delegated Arena</h1>
        <p className="mt-1 text-xs font-medium text-slate-500">
          M09 · the full delegation lifecycle · sign once, play popup-free, revoke anytime
        </p>
      </header>

      {/* Mainnet warning */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-[11px] leading-relaxed text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <b>Mainnet — real TRUST.</b> This runs a real EIP-7702 upgrade + on-chain redeems on Intuition (chainId{' '}
          {DELEGATION_CHAIN_ID}). Picks self-send, so only gas is spent. The embedded keys live in memory and die on
          refresh — fund them with small amounts only.
        </span>
      </div>

      {wrongChain && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300">
          Your connected wallet is on chain {chain?.id}. Switch to Intuition (chainId {DELEGATION_CHAIN_ID}) to fund the
          embedded wallet from it.
        </div>
      )}

      {/* Step 1 — Generate embedded wallets */}
      <StepCard
        n={1}
        icon={<Wallet className="h-4 w-4" />}
        title="Generate embedded wallets"
        teaches="Option A uses two local keys the app controls — a delegator (gets upgraded + signs) and an ephemeral session key (redeems). Injected MetaMask can't sign 7702/delegations, so we hold our own keys."
        done={!!wallets}
        error={error && (error.step === 'generate' || error.step === 'fund-delegator') ? error.msg : undefined}
      >
        <Code>{`const delegator = generateKeypair()   // EOA → smart account\nconst session   = generateKeypair()   // redeems picks, popup-free`}</Code>

        {!wallets ? (
          <ActionButton onClick={doGenerate} busy={busy === 'generate'} icon={<KeyRound className="h-4 w-4" />}>
            Generate wallets
          </ActionButton>
        ) : (
          <div className="mt-3 space-y-3">
            <AddressRow label="Delegator (EOA)" addr={wallets.delegator.address} onCopy={copyAddr} copied={copied} />
            <AddressRow label="Session key" addr={wallets.session.address} sub="ephemeral" />

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold uppercase tracking-wide text-slate-400">Delegator balance</span>
                <span className={`font-display font-black ${funded ? 'text-intuition-success' : 'text-slate-500'}`}>
                  {Number(delegatorBalance).toFixed(4)} TRUST
                </span>
              </div>
              {!funded && (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Fund the delegator with ~{SUGGESTED_FUNDING_TRUST} TRUST (covers 7702 gas + a gas drip + a few picks).
                  Copy the address and send from anywhere, or:
                </p>
              )}
              {!funded && isConnected && (
                <ActionButton
                  onClick={doFundFromWallet}
                  busy={busy === 'fund-delegator'}
                  icon={<Fuel className="h-4 w-4" />}
                  subtle
                >
                  Fund {SUGGESTED_FUNDING_TRUST} TRUST from connected wallet
                </ActionButton>
              )}
              {funded && (
                <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-intuition-success">
                  <Check className="h-3 w-3" /> Funded — ready to upgrade.
                </p>
              )}
            </div>
          </div>
        )}
      </StepCard>

      {/* Step 2 — EIP-7702 upgrade */}
      <StepCard
        n={2}
        icon={<ShieldCheck className="h-4 w-4" />}
        title="EIP-7702 upgrade"
        teaches="Sign an EIP-7702 authorization pointing the delegator EOA at the Stateless7702 implementation, then send it. Same address, now a MetaMask smart account. This also proves the chain accepts the 7702 tx type."
        done={upgraded}
        locked={!funded}
        lockedHint="Fund the delegator first."
        error={error?.step === 'upgrade' ? error.msg : undefined}
      >
        <Code>{`const auth = await wallet.signAuthorization({ account, contractAddress: impl, executor: 'self' })\nawait wallet.sendTransaction({ authorizationList: [auth], to: account.address, data: '0x' })`}</Code>

        {enforcers && <MetaRow label="Impl" value={short(enforcers.stateless7702Impl)} full={enforcers.stateless7702Impl} />}

        {!upgraded ? (
          <ActionButton onClick={doUpgrade} busy={busy === 'upgrade'} icon={<ShieldCheck className="h-4 w-4" />}>
            Upgrade to smart account
          </ActionButton>
        ) : (
          <div className="mt-3 space-y-1.5">
            <p className="flex items-center gap-1 text-[11px] font-bold text-intuition-success">
              <Check className="h-3 w-3" />
              {upgradeNote === 'already' ? 'Already upgraded (idempotent).' : 'Upgraded — chain accepts EIP-7702 ✓'}
            </p>
            {upgradeHash && <TxLink hash={upgradeHash} label="upgrade tx" />}
          </div>
        )}
      </StepCard>

      {/* Step 3 — Sign delegation (caveats + custom enforcers) */}
      <StepCard
        n={3}
        icon={<PenLine className="h-4 w-4" />}
        title="Sign delegation — caveats & custom enforcers"
        teaches="Create a delegation to the session key with a native-spend CAP (scope) + hard EXPIRY (timestamp enforcer), then sign it ONCE. Optionally attach custom enforcers hand-built with createCaveat."
        done={signed}
        locked={!upgraded}
        lockedHint="Upgrade the delegator first."
        error={error?.step === 'sign' ? error.msg : undefined}
      >
        <Code>{`createDelegation({ from: delegator, to: session,\n  scope: { type: 'nativeTokenTransferAmount', maxAmount: parseEther('${SESSION_CAP_TRUST}') },\n  caveats })  →  smartAccount.signDelegation({ delegation })`}</Code>

        {!signed && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
              Custom enforcers (roll your own caveat)
            </p>
            <label className="flex items-center justify-between gap-2 py-1.5 text-[11px] text-slate-300">
              <span>
                Limit redeems (LimitedCallsEnforcer)
                {enforcers && <span className="ml-1 font-mono text-slate-600">{short(enforcers.limitedCalls)}</span>}
              </span>
              <input
                type="number"
                min={0}
                placeholder="off"
                value={custom.limitedCalls ?? ''}
                onChange={(e) =>
                  setCustom((c) => ({ ...c, limitedCalls: e.target.value ? Math.max(0, Number(e.target.value)) : undefined }))
                }
                className="w-16 rounded border border-white/10 bg-black/40 px-2 py-1 text-right font-mono text-white outline-none focus:border-intuition-primary/60"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2 py-1.5 text-[11px] text-slate-300">
              <span>
                Lock redeemer to session key (RedeemerEnforcer)
                {enforcers && <span className="ml-1 font-mono text-slate-600">{short(enforcers.redeemer)}</span>}
              </span>
              <input
                type="checkbox"
                checked={!!custom.lockRedeemer}
                onChange={(e) => setCustom((c) => ({ ...c, lockRedeemer: e.target.checked }))}
                className="h-4 w-4 accent-intuition-primary"
              />
            </label>
          </div>
        )}

        {!signed ? (
          <ActionButton onClick={doSign} busy={busy === 'sign'} icon={<PenLine className="h-4 w-4" />}>
            Create &amp; sign delegation
          </ActionButton>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Stat label="Spend cap" value={delegation!.capTrust} sub="TRUST" />
            <Stat label="Expires" value={`${SESSION_TTL_SECONDS / 3600}h`} sub="timestamp" />
            <Stat label="Caveats" value={String(delegation!.caveatCount)} sub="enforcers" />
          </div>
        )}
        {signed && (
          <p className="mt-3 flex items-center gap-1 break-all font-mono text-[10px] text-slate-500">
            <Check className="h-3 w-3 shrink-0 text-intuition-success" /> signed · {short(delegation!.signed.signature)}
          </p>
        )}
      </StepCard>

      {/* Step 4 — Fund session key */}
      <StepCard
        n={4}
        icon={<Fuel className="h-4 w-4" />}
        title="Fund the session key (gas)"
        teaches="The session key redeems picks as its own txs, so it needs a little gas. The delegator drips it. (No bundler — Intuition has no ERC-4337; redeems are plain transactions.)"
        done={sessionReady}
        locked={!signed}
        lockedHint="Sign the delegation first."
        error={error?.step === 'fund-session' ? error.msg : undefined}
      >
        <Code>{`await fundSessionKey(delegator, session, '${SESSION_GAS_TRUST}')  // gas drip`}</Code>
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="font-bold uppercase tracking-wide text-slate-400">Session balance</span>
          <span className="font-display font-black text-slate-300">{Number(sessionBalance).toFixed(4)} TRUST</span>
        </div>
        {!sessionReady ? (
          <ActionButton onClick={doFundSession} busy={busy === 'fund-session'} icon={<Fuel className="h-4 w-4" />}>
            Drip {SESSION_GAS_TRUST} TRUST for gas
          </ActionButton>
        ) : (
          <div className="mt-3 space-y-1.5">
            <p className="flex items-center gap-1 text-[11px] font-bold text-intuition-success">
              <Check className="h-3 w-3" /> Session key funded.
            </p>
            <TxLink hash={sessionFundHash!} label="fund tx" />
          </div>
        )}
      </StepCard>

      {/* Step 5 — Redeem picks */}
      <StepCard
        n={5}
        icon={<Zap className="h-4 w-4" />}
        title="Make picks — popup-free"
        teaches="Each pick is redeemed by the session key via sendTransactionWithDelegation: a normal tx to the DelegationManager. Zero popups. The delegator's smart account pays the stake; the session key pays gas. The cap + expiry are enforced on-chain."
        done={picks.length > 0}
        locked={!sessionReady}
        lockedHint="Fund the session key first."
        error={error?.step === 'pick' ? error.msg : undefined}
      >
        <Code>{`sessionWallet.sendTransactionWithDelegation({\n  to: target, value: parseEther('${PICK_STAKE_TRUST}'),\n  permissionContext: [signed], delegationManager })`}</Code>

        {signed && (
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Stat label="Cap left" value={capRemaining.toFixed(2)} sub="TRUST" />
            <Stat label={expired ? 'Expired' : 'Expires in'} value={expired ? '—' : `${mm}:${ss}`} sub="mm:ss" />
            <Stat label="Picks" value={String(picks.length)} sub="redeemed" />
          </div>
        )}

        <ActionButton onClick={doPick} busy={busy === 'pick'} icon={<Zap className="h-4 w-4 text-intuition-primary" />} disabled={!canPick}>
          {revoked
            ? 'Revoked'
            : expired
              ? 'Session expired'
              : capRemaining < Number(PICK_STAKE_TRUST)
                ? 'Cap reached'
                : `Make a pick · stake ${PICK_STAKE_TRUST} TRUST (no popup)`}
        </ActionButton>

        {picks.length > 0 && (
          <div className="mt-3 space-y-1">
            {picks.slice(0, 4).map((h, i) => (
              <TxLink key={h} hash={h} label={`redeem #${picks.length - i}`} />
            ))}
          </div>
        )}
      </StepCard>

      {/* Step 6 — Revoke */}
      <StepCard
        n={6}
        icon={<Ban className="h-4 w-4" />}
        title="Revoke on-chain"
        teaches="A hard kill on top of the cap + expiry: DelegationManager.disableDelegation, sent from the delegator (msg.sender must equal the delegator). After this, redeems revert on-chain."
        done={revoked}
        locked={!signed}
        lockedHint="Sign the delegation first."
        error={error?.step === 'revoke' ? error.msg : undefined}
      >
        <Code>{`DelegationManager.execute.disableDelegation({ client: delegator, delegation: signed })`}</Code>
        {!revoked ? (
          <ActionButton onClick={doRevoke} busy={busy === 'revoke'} icon={<Ban className="h-4 w-4" />} destructive>
            Revoke delegation
          </ActionButton>
        ) : (
          <div className="mt-3 space-y-1.5">
            <p className="flex items-center gap-1 text-[11px] font-bold text-intuition-success">
              <Check className="h-3 w-3" /> Revoked on-chain — the session key can no longer redeem.
            </p>
            <TxLink hash={revokeHash!} label="revoke tx" />
          </div>
        )}
      </StepCard>

      {wallets && (
        <div className="flex flex-col items-center gap-2">
          {isConnected && (
            <button
              onClick={doReclaim}
              disabled={busy === 'reclaim'}
              className="flex items-center gap-2 rounded-xl border border-intuition-primary/40 bg-intuition-primary/10 px-4 py-2 font-display text-[11px] font-black uppercase tracking-wide text-intuition-primary transition hover:bg-intuition-primary/20 disabled:opacity-40"
            >
              {busy === 'reclaim' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Return remaining TRUST to my wallet
            </button>
          )}
          {reclaimNote && <p className="font-mono text-[10px] text-intuition-success">{reclaimNote}</p>}
          {error?.step === 'reclaim' && <p className="font-mono text-[10px] text-red-400">{error.msg}</p>}
          <button
            onClick={doGenerate}
            className="text-[11px] font-bold uppercase tracking-wide text-slate-500 transition hover:text-intuition-primary"
          >
            Reset · new wallets
          </button>
          <p className="max-w-sm text-center text-[10px] leading-relaxed text-slate-600">
            Reclaim your TRUST before closing the tab — the embedded keys clear on close.
          </p>
        </div>
      )}
    </div>
  );
};

// ── Presentational bits ──────────────────────────────────────────────────────

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4">
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-6 py-8 text-center">{children}</div>
  </div>
);

const StepCard: React.FC<{
  n: number;
  icon: React.ReactNode;
  title: string;
  teaches: string;
  children: React.ReactNode;
  done?: boolean;
  locked?: boolean;
  lockedHint?: string;
  error?: string;
}> = ({ n, icon, title, teaches, children, done, locked, lockedHint, error }) => (
  <section
    className={`rounded-2xl border p-5 transition ${
      error
        ? 'border-red-500/40 bg-red-500/[0.04]'
        : done
          ? 'border-intuition-success/30 bg-intuition-success/[0.04]'
          : locked
            ? 'border-white/5 bg-white/[0.01] opacity-60'
            : 'border-intuition-primary/25 bg-white/[0.03]'
    }`}
  >
    <div className="flex items-center gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-xs font-black ${
          done ? 'bg-intuition-success/20 text-intuition-success' : 'bg-white/5 text-slate-300'
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="flex items-center gap-2 text-slate-200">
        {icon}
        <h2 className="font-display text-sm font-black uppercase tracking-wide">{title}</h2>
      </div>
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{teaches}</p>
    {locked ? (
      <p className="mt-3 text-[11px] italic text-slate-600">{lockedHint}</p>
    ) : (
      <div className="mt-3">{children}</div>
    )}
    {error && !locked && (
      <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-left">
        <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Error</p>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-red-300">
          {error}
        </pre>
      </div>
    )}
  </section>
);

const Code: React.FC<{ children: string }> = ({ children }) => (
  <pre className="overflow-x-auto rounded-lg border border-white/5 bg-black/30 p-3 font-mono text-[10px] leading-relaxed text-slate-400">
    {children}
  </pre>
);

const ActionButton: React.FC<{
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  subtle?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}> = ({ onClick, busy, disabled, icon, subtle, destructive, children }) => (
  <button
    onClick={onClick}
    disabled={busy || disabled}
    className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-display text-xs font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${
      destructive
        ? 'border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
        : subtle
          ? 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
          : 'bg-intuition-primary text-black hover:brightness-110'
    }`}
  >
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    {children}
  </button>
);

const Stat: React.FC<{ label: string; value: string; sub: string }> = ({ label, value, sub }) => (
  <div className="rounded-lg border border-white/5 bg-black/20 py-2">
    <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className="mt-0.5 font-display text-base font-black text-white">{value}</div>
    <div className="text-[9px] uppercase tracking-wide text-slate-600">{sub}</div>
  </div>
);

const AddressRow: React.FC<{
  label: string;
  addr: string;
  sub?: string;
  onCopy?: (a: string) => void;
  copied?: boolean;
}> = ({ label, addr, sub, onCopy, copied }) => (
  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</div>
      <div className="font-mono text-[11px] text-slate-300">{short(addr)}</div>
    </div>
    {onCopy ? (
      <button
        onClick={() => onCopy(addr)}
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 hover:text-intuition-primary"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'copied' : 'copy'}
      </button>
    ) : (
      sub && <span className="text-[9px] uppercase tracking-wide text-slate-600">{sub}</span>
    )}
  </div>
);

const MetaRow: React.FC<{ label: string; value: string; full?: string }> = ({ label, value, full }) => (
  <div className="mt-2 flex items-center justify-between text-[10px]">
    <span className="font-black uppercase tracking-widest text-slate-500">{label}</span>
    <span className="font-mono text-slate-400" title={full}>
      {value}
    </span>
  </div>
);

const TxLink: React.FC<{ hash: string; label: string }> = ({ hash, label }) => (
  <a
    href={txUrl(hash)}
    target="_blank"
    rel="noreferrer"
    className="flex items-center gap-1 font-mono text-[10px] text-slate-500 hover:text-intuition-primary"
  >
    {label}: {short(hash)} <ExternalLink className="h-3 w-3" />
  </a>
);

export default DelegatedArena;
