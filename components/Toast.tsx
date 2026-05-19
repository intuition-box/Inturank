
import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertTriangle, Info, Terminal } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

let toastListeners: ((toast: ToastMessage) => void)[] = [];
let clearListeners: (() => void)[] = [];

export const toast = {
  success: (msg: string) => emitToast('success', msg),
  error: (msg: string) => emitToast('error', msg),
  info: (msg: string) => emitToast('info', msg),
  dismissAll: () => {
    queueMicrotask(() => {
      clearListeners.forEach((fn) => fn());
    });
  },
};

const emitToast = (type: ToastType, message: string) => {
  const id = Math.random().toString(36).substring(2, 9);
  const payload: ToastMessage = { id, type, message };
  // Defer so we never call ToastContainer#setState synchronously from another component's render path.
  queueMicrotask(() => {
    toastListeners.forEach((listener) => listener(payload));
  });
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (t: ToastMessage) => {
      setToasts((prev) => {
        // Dedupe: don't add a second error toast with the same message (avoids double toasts)
        if (t.type === 'error' && prev.some((x) => x.type === 'error' && x.message === t.message))
          return prev;
        return [t, ...prev];
      });
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 5000);
    };
    const handleClear = () => setToasts([]);

    toastListeners.push(handleToast);
    clearListeners.push(handleClear);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== handleToast);
      clearListeners = clearListeners.filter((l) => l !== handleClear);
    };
  }, []);

  return (
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-4 pointer-events-none">
      {toasts.map((t) => (
        <div 
          key={t.id}
          className={`
            pointer-events-auto relative overflow-hidden w-80 p-4 
            bg-black/90 backdrop-blur-md border-l-4 shadow-[0_0_20px_rgba(0,0,0,0.5)]
            animate-toast-slide-fluid
            ${t.type === 'success' ? 'border-intuition-success text-intuition-success' : ''}
            ${t.type === 'error' ? 'border-intuition-danger text-intuition-danger' : ''}
            ${t.type === 'info' ? 'border-intuition-primary text-intuition-primary' : ''}
            rounded-2xl
          `}
        >
          {/* Scanline overlay */}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
          
          <div className="flex items-start gap-3 relative z-10">
            <div className="mt-1">
              {t.type === 'success' && <CheckCircle size={18} />}
              {t.type === 'error' && <AlertTriangle size={18} />}
              {t.type === 'info' && <Terminal size={18} />}
            </div>
            <div className="flex-1">
              <h4 className="font-bold font-mono text-xs uppercase tracking-wider mb-1">
                {t.type === 'success' ? 'SYSTEM_CONFIRMED' : t.type === 'error' ? 'SYSTEM_ERROR' : 'SYSTEM_MSG'}
              </h4>
              <p className="font-mono text-xs text-slate-300 leading-relaxed">
                {t.message}
              </p>
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
