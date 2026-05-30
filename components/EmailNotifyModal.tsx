import React, { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { X, Mail, User, Loader2, CheckCircle } from 'lucide-react';
import { getConnectedAccount, connectWallet } from '../services/web3';
import { setEmailSubscription, getEmailSubscription, sendWelcomeEmail, type EmailAlertFrequency } from '../services/emailNotifications';
import { getFollowedIdentities } from '../services/follows';
import { useEmailNotify } from '../contexts/EmailNotifyContext';
import { playClick, playHover } from '../services/audio';
import { toast } from './Toast';

const EmailNotifyModal: React.FC = () => {
  const { address: wagmiAddress } = useAccount();
  const { isEmailNotifyOpen, closeEmailNotify } = useEmailNotify();
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [alertFrequency, setAlertFrequency] = useState<EmailAlertFrequency>('per_tx');
  const [connecting, setConnecting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isEmailNotifyOpen) {
      setShowSuccess(false);
      return;
    }
    // Use wagmi address first so we show connected when user connected in header
    const addr = wagmiAddress ?? null;
    const resolve = (a: string | null) => {
      setWallet(a);
      if (a) {
        const sub = getEmailSubscription(a);
        if (sub) {
          setEmail(sub.email);
          setNickname(sub.nickname || '');
          setAlertFrequency(sub.alertFrequency ?? 'per_tx');
        } else {
          setEmail('');
          setNickname('');
          setAlertFrequency('per_tx');
        }
      } else {
        setEmail('');
        setNickname('');
      }
    };
    if (addr) resolve(addr);
    else getConnectedAccount().then(resolve);
  }, [isEmailNotifyOpen, wagmiAddress]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  const handleConnect = async () => {
    playClick();
    setConnecting(true);
    try {
      const addr = await connectWallet();
      setWallet(addr || null);
      if (!addr) toast.error('Connect your wallet first');
    } finally {
      setConnecting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error('Please enter your email');
      return;
    }
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(trimmedEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (!wallet) {
      toast.error('Connect your wallet first');
      return;
    }
    setLoading(true);
    try {
      // Subscription is stored by wallet address so alerts are tied to the connected wallet. Include follows so worker can email when people you follow trade.
      const follows = getFollowedIdentities(wallet).map((f) => ({
        identityId: f.identityId,
        label: f.label,
        emailAlerts: f.emailAlerts ?? true,
      }));
      const subscribedOk = await setEmailSubscription(
        wallet,
        trimmedEmail,
        nickname.trim() || undefined,
        alertFrequency,
        follows
      );
      // Welcome is sent by the email API on subscribe when Ensend is configured; only call client send if API failed.
      if (!subscribedOk) {
        const welcomeOk = await sendWelcomeEmail(trimmedEmail, nickname.trim() || undefined);
        if (!welcomeOk) {
          toast.error('Saved locally, but email API is unreachable ,  check npm run email-server or VITE_EMAIL_API_URL.');
        }
      }
      setShowSuccess(true);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = setTimeout(() => {
        closeEmailNotify();
        setEmail('');
        setNickname('');
        setShowSuccess(false);
      }, 2800);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    playClick();
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    setShowSuccess(false);
    closeEmailNotify();
  };

  if (!isEmailNotifyOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-notify-title"
    >
      <div
        className="w-full max-w-md bg-[#02040a] border-2 border-amber-400/60 shadow-[0_0_50px_rgba(251,191,36,0.2),0_0_0_1px_rgba(168,85,247,0.15)] clip-path-slant p-6 sm:p-8 relative animate-email-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          onMouseEnter={playHover}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors duration-200 rounded-sm"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {showSuccess ? (
          <div className="py-6 text-center animate-email-success-in" aria-live="polite">
            <div className="w-16 h-16 mx-auto mb-5 flex items-center justify-center rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.3)]">
              <CheckCircle size={36} strokeWidth={2.5} />
            </div>
            <h3 className="text-xl font-black font-display text-white uppercase tracking-tight mb-2 text-glow-white">
              You’re subscribed!
            </h3>
            <p className="text-sm font-mono text-slate-300 mb-6 max-w-xs mx-auto">
              We’ll email you when there’s activity on your claims.
            </p>
            <button
              type="button"
              onClick={handleClose}
              onMouseEnter={playHover}
              className="btn-cyber px-6 py-2.5 bg-amber-400 text-black font-black text-[10px] uppercase tracking-widest border-2 border-amber-400 hover:bg-amber-300 hover:border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.4)] active:scale-[0.98] transition-all"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 border-2 border-amber-400 flex items-center justify-center text-amber-300 clip-path-slant shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                <Mail size={24} />
              </div>
              <div>
                <h2 id="email-notify-title" className="text-lg font-black font-mono text-amber-300 uppercase tracking-[0.25em] text-glow-gold">
                  EMAIL ALERTS
                </h2>
                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mt-0.5">
                  Get notified about activity on your claims and when people you follow buy or sell
                </p>
              </div>
            </div>

            {!wallet ? (
              <div className="space-y-4">
                <p className="text-[11px] font-mono text-slate-300 leading-relaxed">
                  Connect your wallet so we can tie email alerts to your address. When others buy or sell in claims you hold, or when people you follow trade, you’ll get an in-app notification and an email.
                </p>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting}
                  onMouseEnter={playHover}
                  className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-black font-black text-[10px] uppercase tracking-widest clip-path-slant border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.35)] hover:shadow-[0_0_28px_rgba(251,191,36,0.45)] disabled:opacity-60 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  {connecting ? <><Loader2 size={16} className="animate-spin" /> Connecting…</> : 'Connect wallet'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-[10px] font-mono text-slate-400 mb-2">
                  Wallet: <span className="text-slate-300 font-bold">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
                </p>
                <div>
                  <label htmlFor="email-notify-email" className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                    EMAIL
                  </label>
                  <div className="relative group/input">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/input:text-amber-400 transition-colors" />
                    <input
                      id="email-notify-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full bg-black border-2 border-white/15 py-2.5 pl-9 pr-3 text-sm text-white font-mono focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(251,191,36,0.25)] outline-none placeholder-slate-600 transition-all duration-200"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="email-notify-nickname" className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                    NICKNAME <span className="text-slate-600 font-normal">(optional)</span>
                  </label>
                  <div className="relative group/input">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/input:text-amber-400 transition-colors" />
                    <input
                      id="email-notify-nickname"
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="How we should address you"
                      className="w-full bg-black border-2 border-white/15 py-2.5 pl-9 pr-3 text-sm text-white font-mono focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(251,191,36,0.25)] outline-none placeholder-slate-600 transition-all duration-200"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Alert frequency</span>
                  <p className="text-[9px] text-slate-500 mb-2">Your receipts and activity on your holdings. People you follow: always one email per trade.</p>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="modal-alertFrequency"
                        checked={alertFrequency === 'per_tx'}
                        onChange={() => setAlertFrequency('per_tx')}
                        className="sr-only"
                      />
                      <span className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center ${alertFrequency === 'per_tx' ? 'border-amber-400 bg-amber-400' : 'border-slate-600 bg-transparent'}`}>
                        {alertFrequency === 'per_tx' && <span className="w-1.5 h-1.5 bg-black rounded-sm" />}
                      </span>
                      <span className="text-slate-300 font-mono text-xs">After every buy/sell</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="modal-alertFrequency"
                        checked={alertFrequency === 'daily'}
                        onChange={() => setAlertFrequency('daily')}
                        className="sr-only"
                      />
                      <span className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center ${alertFrequency === 'daily' ? 'border-amber-400 bg-amber-400' : 'border-slate-600 bg-transparent'}`}>
                        {alertFrequency === 'daily' && <span className="w-1.5 h-1.5 bg-black rounded-sm" />}
                      </span>
                      <span className="text-slate-300 font-mono text-xs">Daily summary</span>
                    </label>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  onMouseEnter={playHover}
                  className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-black font-black text-[10px] uppercase tracking-[0.2em] clip-path-slant border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.35)] hover:shadow-[0_0_28px_rgba(251,191,36,0.5),0_0_0_1px_rgba(239,68,68,0.2)] disabled:opacity-60 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Subscribe to email alerts'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EmailNotifyModal;
