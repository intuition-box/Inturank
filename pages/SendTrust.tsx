import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useBalance } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { Send, Coins, ArrowLeft, Loader2, AlertTriangle, User, CheckCircle2, ExternalLink, Copy, Sparkles } from 'lucide-react';
import { sendNativeTransfer } from '../services/web3';
import { resolveSendTrustRecipient } from '../services/tns';
import { notifyProtocolXpEarned } from '../services/protocolXp';
import { playClick, playHover } from '../services/audio';
import { toast } from '../components/Toast';
import {
  CHAIN_ID,
  EXPLORER_URL,
  PAGE_HERO_EYEBROW,
  PAGE_HERO_TITLE,
  PAGE_HERO_BODY,
  PROTOCOL_XP_SEND_TRUST,
  PROTOCOL_XP_SEND_TRUST_MIN_TRUST_UNITS,
} from '../constants';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { XpEarnHint } from '../components/XpEarnHint';
import { useEffectiveChainId } from '../hooks/useEffectiveChainId';

const SendTrust: React.FC = () => {
  const { address: walletAddress, isConnected } = useAccount();
  const chainId = useEffectiveChainId();
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: walletAddress,
  });

  const [recipientInput, setRecipientInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [confirmedTxHash, setConfirmedTxHash] = useState<string | null>(null);
  /** Amount sent in the tx that produced `confirmedTxHash` (shown in success modal). */
  const [confirmedAmountTrust, setConfirmedAmountTrust] = useState<string | null>(null);

  const balance = balanceData?.value ?? 0n;
  const balanceFormatted = balanceData ? formatEther(balance) : '0';

  const resolveRecipient = useCallback(async () => {
    const raw = recipientInput.trim();
    if (!raw) {
      setResolvedAddress(null);
      setResolveError(null);
      setResolving(false);
      return;
    }
    setResolving(true);
    try {
      const { address: addr, error } = await resolveSendTrustRecipient(raw);
      if (addr) {
        setResolvedAddress(addr);
        setResolveError(null);
      } else {
        setResolvedAddress(null);
        setResolveError(error?.trim() || 'Could not resolve name');
      }
    } catch {
      setResolvedAddress(null);
      setResolveError('Resolution failed — try again');
    } finally {
      setResolving(false);
    }
  }, [recipientInput]);

  React.useEffect(() => {
    const t = setTimeout(resolveRecipient, 420);
    return () => clearTimeout(t);
  }, [recipientInput, resolveRecipient]);

  const setMaxAmount = () => {
    playClick();
    if (!balanceData) return;
    const reserve = parseEther('0.001');
    const max = balance > reserve ? balance - reserve : 0n;
    setAmountInput(formatEther(max));
  };

  const handleSend = async () => {
    if (!walletAddress || !resolvedAddress) {
      toast.error('Enter a valid recipient (address, name.trust, or name.eth)');
      return;
    }
    if (walletAddress.toLowerCase() === resolvedAddress.toLowerCase()) {
      toast.error('Cannot send to yourself');
      return;
    }
    let value: bigint;
    try {
      value = parseEther(amountInput.trim() || '0');
    } catch {
      toast.error('Enter a valid amount');
      return;
    }
    if (value <= 0n) {
      toast.error('Amount must be greater than 0');
      return;
    }
    if (value > balance) {
      toast.error('Insufficient TRUST balance');
      return;
    }
    playClick();
    setIsSending(true);
    try {
      const hash = await sendNativeTransfer(
        walletAddress,
        resolvedAddress as `0x${string}`,
        value
      );
      const minXpWei = parseEther(String(PROTOCOL_XP_SEND_TRUST_MIN_TRUST_UNITS));
      if (value >= minXpWei) {
        notifyProtocolXpEarned({
          address: walletAddress,
          reasonKey: 'send_trust',
          txHash: hash,
          sendTrustFixedAmount: PROTOCOL_XP_SEND_TRUST,
        });
      }
      setConfirmedAmountTrust(formatEther(value));
      setAmountInput('');
      refetchBalance();
      setConfirmedTxHash(hash);
    } catch (err: any) {
      const msg = err?.shortMessage ?? err?.message ?? 'Transaction failed';
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  const wrongNetwork = isConnected && chainId !== CHAIN_ID;
  let amountWei = 0n;
  try {
    amountWei = parseEther(amountInput.trim() || '0');
  } catch {
    amountWei = 0n;
  }
  const canSend =
    isConnected &&
    !wrongNetwork &&
    resolvedAddress &&
    amountInput &&
    amountWei > 0n &&
    amountWei <= balance &&
    !isSending &&
    !resolving;

  const copyHash = () => {
    if (!confirmedTxHash) return;
    playClick();
    navigator.clipboard.writeText(confirmedTxHash);
    toast.success('Hash copied');
  };

  return (
    <div className="relative min-h-[75vh] overflow-hidden flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-22 bg-[#060608]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(240,193,75,0.14), transparent 50%), radial-gradient(ellipse 70% 50% at 100% 60%, rgba(139,92,246,0.08), transparent 45%), radial-gradient(ellipse 60% 40% at 0% 80%, rgba(34,211,238,0.06), transparent 40%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.04%22/%3E%3C/svg%3E')] opacity-40 mix-blend-overlay" aria-hidden />

      {confirmedTxHash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-[1.35rem] border border-[#F0C14B]/35 bg-[#0a0a0c]/95 shadow-[0_0_80px_rgba(240,193,75,0.12)] p-6 sm:p-8 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#F0C14B]/25 to-[#F0C14B]/5 border border-[#F0C14B]/45 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-9 h-9 text-[#F0C14B]" strokeWidth={2} />
              </div>
              <h2 className="text-xl font-black font-mono text-white uppercase tracking-wide mb-1">
                Transaction confirmed
              </h2>
              <div className="mb-5">
                <p className="text-slate-400 font-mono text-sm mb-2">Your TRUST transfer was successful</p>
                {confirmedAmountTrust && (
                  <div className="flex items-center justify-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#F0C14B]/45 bg-gradient-to-b from-[#F0C14B]/22 to-[#F0C14B]/08 shadow-[0_0_14px_rgba(240,193,75,0.12)]"
                      aria-hidden
                    >
                      <CurrencySymbol
                        size="md"
                        className="!m-0 text-[#F0C14B] drop-shadow-[0_0_4px_rgba(240,193,75,0.35)]"
                      />
                    </span>
                    <div
                      className="flex items-center gap-2 whitespace-nowrap font-mono text-[#F0C14B] leading-none [&>span]:leading-none"
                      role="status"
                    >
                      <span className="text-xl font-bold tabular-nums tracking-tight">{confirmedAmountTrust}</span>
                      <span className="text-xl font-bold tracking-tight">TRUST</span>
                      <span className="text-xl font-bold opacity-90">sent</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="w-full rounded-xl bg-black/50 border border-[#F0C14B]/20 px-4 py-3 mb-4 flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-slate-300 truncate">
                  {confirmedTxHash.slice(0, 10)}...{confirmedTxHash.slice(-8)}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={copyHash}
                    onMouseEnter={playHover}
                    className="p-2 rounded-lg border border-[#F0C14B]/40 text-[#F0C14B] hover:bg-[#F0C14B]/10 transition-colors"
                    title="Copy hash"
                  >
                    <Copy size={14} />
                  </button>
                  <a
                    href={`${EXPLORER_URL}/tx/${confirmedTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={playClick}
                    onMouseEnter={playHover}
                    className="p-2 rounded-lg border border-[#F0C14B]/40 text-[#F0C14B] hover:bg-[#F0C14B]/10 transition-colors"
                    title="View on explorer"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
              <a
                href={`${EXPLORER_URL}/tx/${confirmedTxHash}`}
                target="_blank"
                rel="noreferrer"
                onClick={playClick}
                className="text-[#F0C14B] font-mono text-xs hover:underline mb-6"
              >
                View on Intuition Explorer →
              </a>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setConfirmedTxHash(null);
                  setConfirmedAmountTrust(null);
                }}
                onMouseEnter={playHover}
                className="w-full py-3.5 rounded-xl bg-[#F0C14B] text-black font-black font-mono text-sm uppercase tracking-widest hover:bg-[#FFD54F] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-lg relative z-10">
        <div className="mb-8">
          <Link
            to="/"
            onMouseEnter={playHover}
            onClick={playClick}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-[#F0C14B] text-sm font-sans transition-colors"
          >
            <ArrowLeft size={12} /> Back
          </Link>
        </div>

        <div className="mb-9 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#F0C14B]/35 bg-[#F0C14B]/10 backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-[#F0C14B]" strokeWidth={2.2} aria-hidden />
            <span className="text-sm font-sans font-semibold text-[#F0C14B]/95 tracking-tight">Send TRUST</span>
          </div>
          <p className={PAGE_HERO_EYEBROW}>Native transfer</p>
          <h1 className={PAGE_HERO_TITLE}>Send to any address</h1>
          <p className={`${PAGE_HERO_BODY} max-w-md`}>
            Paste a full checksummed address, or a complete <strong className="text-slate-200 font-semibold">name.trust</strong> /{' '}
            <strong className="text-slate-200 font-semibold">name.eth</strong>. We don&apos;t guess from partial names.
          </p>
          <XpEarnHint variant="send_trust" className="mt-3 max-w-md" />
        </div>

        <div className="rounded-2xl border border-[#F0C14B]/22 bg-[#0c0c10]/80 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.45)] p-6 sm:p-10 ring-1 ring-white/[0.04]">
          {!isConnected ? (
            <div className="text-center py-8">
              <User className="w-14 h-14 text-slate-600 mx-auto mb-6" />
              <p className="text-slate-400 font-mono text-sm mb-8">Connect your wallet to send TRUST</p>
              <Link
                to="/"
                onClick={playClick}
                className="inline-flex items-center gap-2 px-6 py-4 bg-[#F0C14B] text-black font-black font-mono text-xs uppercase tracking-widest rounded-xl hover:bg-[#FFD54F] transition-colors shadow-[0_0_35px_rgba(240,193,75,0.28)]"
              >
                Connect wallet
              </Link>
            </div>
          ) : wrongNetwork ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-14 h-14 text-red-400 mx-auto mb-6" />
              <p className="text-slate-300 font-mono text-sm">Switch to Intuition Mainnet to send TRUST</p>
            </div>
          ) : (
            <div className="space-y-8">
              <div>
                <label className="block text-[10px] font-black font-mono text-[#F0C14B]/90 uppercase tracking-[0.2em] mb-3">
                  Recipient
                </label>
                <input
                  type="text"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  placeholder="0x… · alice.trust · name.eth (complete names only)"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-4 py-4 rounded-xl bg-black/55 border border-[#F0C14B]/28 text-white font-mono text-sm placeholder:text-slate-600 focus:border-[#F0C14B]/55 focus:ring-2 focus:ring-[#F0C14B]/15 focus:outline-none transition-all"
                />
                <div className="min-h-[28px] mt-2">
                  {resolving ? (
                    <p className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
                      Resolving…
                    </p>
                  ) : resolveError ? (
                    <p className="text-xs text-rose-400/95 font-mono">{resolveError}</p>
                  ) : resolvedAddress ? (
                    <p className="text-xs text-emerald-400/95 font-mono truncate" title={resolvedAddress}>
                      ✓ {resolvedAddress}
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black font-mono text-[#F0C14B]/90 uppercase tracking-[0.2em] mb-3">
                  Amount (TRUST)
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 px-4 py-4 rounded-xl bg-black/55 border border-[#F0C14B]/28 text-white font-mono text-sm placeholder:text-slate-600 focus:border-[#F0C14B]/55 focus:ring-2 focus:ring-[#F0C14B]/15 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={setMaxAmount}
                    onMouseEnter={playHover}
                    className="px-5 py-4 rounded-xl border border-[#F0C14B]/45 text-[#F0C14B] font-mono text-[10px] font-black uppercase hover:bg-[#F0C14B]/10 transition-colors shrink-0"
                  >
                    Max
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                  <Coins size={12} className="text-[#F0C14B]/80 shrink-0" /> Balance: {balanceFormatted} TRUST
                  <span className="text-[#8B5CF6]/80">· Live</span>
                </p>
              </div>

              <button
                type="button"
                disabled={!canSend}
                onClick={handleSend}
                onMouseEnter={canSend ? playHover : undefined}
                className="w-full flex items-center justify-center gap-3 py-5 rounded-xl font-black font-mono text-sm uppercase tracking-widest bg-gradient-to-br from-[#F5CA4D] to-[#c9a032] text-black hover:from-[#FFD54F] hover:to-[#F0C14B] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:from-[#F5CA4D] disabled:hover:to-[#c9a032] transition-all shadow-[0_8px_40px_rgba(240,193,75,0.22)] active:scale-[0.99]"
              >
                {isSending ? (
                  <>
                    <Loader2 size={20} className="animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send size={20} /> Send TRUST
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="mt-14 flex justify-center">
          <div className="h-px w-40 bg-gradient-to-r from-transparent via-[#8B5CF6]/45 to-transparent" />
        </div>
      </div>
    </div>
  );
};

export default SendTrust;
