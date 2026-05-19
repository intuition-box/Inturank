
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
/* Added Activity to imports */
import { Loader2, CheckCircle, XCircle, ExternalLink, X, ArrowRight, AlertTriangle, Terminal, ShieldAlert, Activity } from 'lucide-react';
import { playClick } from '../services/audio';
import { EXPLORER_URL } from '../constants';

interface TransactionModalProps {
  isOpen: boolean;
  status: 'idle' | 'processing' | 'success' | 'error';
  title: string;
  message: string;
  hash?: string;
  logs?: string[];
  onClose: () => void;
}

/**
 * Derive a concise upper-case heading from the parsed protocol message.
 * Recognises codes prefixed by `parseProtocolError` (e.g. `STANCE_CONFLICT:`,
 * `MINIMUM_DEPOSIT:`, `INSUFFICIENT_TRUST_BALANCE`) so users see exactly why
 * the wallet step failed instead of a generic "ACCESS_DENIED".
 */
function deriveErrorHeading(rawMessage: string | undefined | null): string {
  const m = (rawMessage ?? '').trim();
  if (!m) return 'ACCESS_DENIED';
  const codeMatch = m.match(/^([A-Z][A-Z0-9_]{3,})(?=[:\s]|$)/);
  if (codeMatch) return codeMatch[1]!;
  const lower = m.toLowerCase();
  if (lower.includes('user rejected')) return 'USER_REJECTED_HANDSHAKE';
  if (lower.includes('insufficient') && lower.includes('trust')) return 'INSUFFICIENT_TRUST_BALANCE';
  if (lower.includes('counter') && lower.includes('stake')) return 'STANCE_CONFLICT';
  return 'ACCESS_DENIED';
}

const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, status, title, message, hash, logs = [], onClose }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  // Use overflow-only scroll lock (no position:fixed) to avoid scroll jump on large viewports (e.g. 16" MacBook)
  useEffect(() => {
    if (isOpen) {
      const prevHtmlOverflow = document.documentElement.style.overflow;
      const prevBodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      return () => {
        document.documentElement.style.overflow = prevHtmlOverflow;
        document.body.style.overflow = prevBodyOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isSuccess = status === 'success';
  const isError = status === 'error';
  const isProcessing = status === 'processing';
  const explorerBase = EXPLORER_URL || "https://explorer.intuition.systems";

  const themeColor = isSuccess ? '#00ff9d' : isError ? '#ff0055' : '#00f3ff';
  const shadowColor = isSuccess ? 'rgba(0,255,157,0.2)' : isError ? 'rgba(255,0,85,0.3)' : 'rgba(0,243,255,0.2)';

  const modalContent = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-backdrop-fade-fluid font-mono">
      <div
        className="relative w-full max-w-lg bg-[#020308] border shadow-[0_0_80px_rgba(0,0,0,1)] rounded-3xl overflow-hidden animate-modal-pop-fluid transition-all duration-500"
        style={{
          borderColor: themeColor,
          boxShadow: `0 0 50px ${shadowColor}`,
        }}
      >
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none" />
        
        {!isProcessing && (
          <button
            onClick={() => { playClick(); onClose(); }}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors z-20 p-2 animate-tx-modal-item-in"
            style={{ animationDelay: '0.25s' }}
          >
            <X size={20} />
          </button>
        )}

        <div className="p-6 sm:p-8 flex flex-col items-center relative z-10 overflow-y-auto min-h-0 flex-1">
          <div className="mb-6 relative">
            {isProcessing && (
              <div className="relative flex items-center justify-center animate-tx-modal-item-in" style={{ animationDelay: '0.15s' }}>
                <div className="w-16 h-16 border-2 border-intuition-primary/20 border-t-intuition-primary rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Terminal className="text-intuition-primary animate-pulse" size={20} />
                </div>
              </div>
            )}
            {isSuccess && (
              <div className="relative animate-tx-modal-success-pop" style={{ animationDelay: '0.1s' }}>
                <div className="w-20 h-20 bg-intuition-success/5 rounded-2xl flex items-center justify-center border-2 border-intuition-success shadow-[0_0_30px_rgba(0,255,157,0.3)]">
                  <CheckCircle className="text-intuition-success" size={40} />
                </div>
              </div>
            )}
            {isError && (
              <div className="relative animate-tx-modal-item-in" style={{ animationDelay: '0.05s' }}>
                <div className="w-20 h-20 bg-intuition-danger/10 rounded-2xl flex items-center justify-center border-2 border-intuition-danger shadow-[0_0_30px_rgba(255,0,85,0.4)]">
                  <ShieldAlert className="text-intuition-danger" size={40} />
                </div>
              </div>
            )}
          </div>

          <h2
            className={`text-xl font-black font-display uppercase tracking-widest mb-2 animate-tx-modal-item-in ${isSuccess ? 'text-intuition-success' : isError ? 'text-intuition-danger' : 'text-intuition-primary'}`}
            style={{ textShadow: `0 0 15px ${themeColor}88`, animationDelay: '0.22s' }}
          >
            {isError ? deriveErrorHeading(message) : title}
          </h2>
          
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-6 animate-tx-modal-item-in" style={{ animationDelay: '0.28s' }}>
            {message}
          </p>

          {/* VERBOSE HANDSHAKE LOG */}
          <div
            ref={logContainerRef}
            className="w-full bg-black/60 border border-white/5 p-4 mb-6 min-h-[140px] max-h-[140px] overflow-y-auto custom-scrollbar rounded-2xl flex flex-col animate-tx-modal-item-in"
            style={{ animationDelay: '0.34s' }}
          >
            <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
              <Activity size={10} className="text-intuition-primary animate-pulse" />
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Protocol_Audit_Log</span>
            </div>
            <div className="space-y-1.5">
              {logs.map((log, i) => (
                <div key={i} className="text-[9px] text-slate-400 flex items-start gap-2 animate-tx-modal-log-in" style={{ animationDelay: `${0.42 + i * 0.05}s` }}>
                  <span className="text-intuition-primary opacity-40">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                  <span className="uppercase font-bold tracking-tighter leading-tight">{log}</span>
                </div>
              ))}
              {isProcessing && (
                <div className="text-[9px] text-intuition-primary flex items-center gap-2 animate-pulse">
                  <span className="opacity-40">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                  <span className="uppercase font-bold tracking-tighter">AWAITING_NEXT_SIGNAL...</span>
                </div>
              )}
            </div>
          </div>

          {hash && (
            <a
              href={`${explorerBase}/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playClick()}
              className="w-full relative z-20 bg-white/5 border border-white/10 p-3 mb-6 flex items-center justify-between group hover:border-intuition-primary transition-all no-underline rounded-2xl animate-tx-modal-item-in"
              style={{ animationDelay: '0.5s' }}
            >
              <div className="text-left overflow-hidden">
                <div className="text-[8px] text-slate-500 uppercase font-black mb-1 tracking-widest">Protocol_Hash</div>
                <div className="text-[9px] text-white font-black truncate max-w-full">{hash}</div>
              </div>
              <div className="h-8 w-8 border border-white/10 flex items-center justify-center group-hover:bg-intuition-primary group-hover:text-black transition-all shrink-0">
                <ExternalLink size={14} />
              </div>
            </a>
          )}

          {!isProcessing && (
            <button
              onClick={() => { playClick(); onClose(); }}
              className={`w-full py-4 font-black font-display tracking-[0.3em] rounded-2xl transition-all flex items-center justify-center gap-3 relative z-20 text-[10px] shadow-xl animate-tx-modal-item-in ${
                isSuccess
                  ? 'bg-intuition-success text-black hover:bg-white'
                  : 'bg-intuition-danger text-white hover:bg-white hover:text-black'
              }`}
              style={{ animationDelay: '0.55s' }}
            >
              {isSuccess ? 'TRANSFER_COMPLETE' : 'RETRY_HANDSHAKE'} <ArrowRight size={16} />
            </button>
          )}
        </div>
        
        <div className={`h-1.5 w-full transition-colors duration-500 ${isProcessing ? 'bg-intuition-primary animate-pulse shadow-[0_0_10px_#00f3ff]' : isSuccess ? 'bg-intuition-success shadow-[0_0_10px_#00ff9d]' : 'bg-intuition-danger shadow-[0_0_10px_#ff0055]'}`} />
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default TransactionModal;
