import React, { ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { purgeLegacyArenaXpLocalStorage } from './services/arenaXp';

purgeLegacyArenaXpLocalStorage();

// Suppress known third-party errors that can break the app (e.g. TronLink extension
// setting tronlinkParams on a proxy that rejects it). Log but do not throw.
if (typeof window !== 'undefined') {
  const originalOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    const msg = typeof message === 'string' ? message : '';
    if (msg.includes("'set' on proxy") && msg.includes('tronlinkParams')) {
      console.warn('[IntuRank] Suppressed TronLink proxy error. If you don’t use TronLink, try disabling the extension for this site.');
      return true; // prevent default handling
    }
    if (originalOnError) return originalOnError.call(this, message, source, lineno, colno, error);
    return false;
  };
  window.addEventListener('unhandledrejection', (ev) => {
    const msg = ev.reason?.message ?? String(ev.reason ?? '');
    if (msg.includes("'set' on proxy") && msg.includes('tronlinkParams')) {
      ev.preventDefault();
      ev.stopPropagation();
      console.warn('[IntuRank] Suppressed TronLink proxy error (promise). If you don’t use TronLink, try disabling the extension for this site.');
    }
  });
}

// SYSTEM ERROR BOUNDARY
// Catches crashes to prevent "White Screen of Death"
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    const msg = error?.message ?? String(error ?? '');
    if (msg.includes("'set' on proxy") && msg.includes('tronlinkParams')) {
      if (typeof console !== 'undefined') console.warn('[IntuRank] Suppressed TronLink proxy error (Error Boundary). If you don’t use TronLink, try disabling the extension for this site.');
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    const msg = error?.message ?? String(error ?? '');
    if (msg.includes("'set' on proxy") && msg.includes('tronlinkParams')) return;
    console.error("CRITICAL_SYSTEM_FAILURE:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          height: '100vh', 
          width: '100vw', 
          backgroundColor: '#02040a', 
          color: '#ff0055', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          fontFamily: '"Fira Code", monospace',
          textAlign: 'center',
          padding: '20px'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem', textShadow: '0 0 10px #ff0055' }}>SYSTEM_CRITICAL_FAILURE</h1>
          <div style={{ border: '1px solid #ff0055', padding: '20px', backgroundColor: 'rgba(255,0,85,0.1)', maxWidth: '800px', overflow: 'auto' }}>
            <p style={{ margin: 0, fontSize: '0.8rem' }}>{this.state.error?.toString()}</p>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            style={{ 
              marginTop: '30px', 
              padding: '12px 30px', 
              background: '#00f3ff', 
              color: '#000', 
              border: 'none', 
              fontWeight: 'bold', 
              cursor: 'pointer',
              clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'
            }}
          >
            INITIATE_SYSTEM_REBOOT
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Reuse existing root when module re-runs (e.g. HMR / strict mode) to avoid "createRoot() on a container that has already been passed to createRoot()"
declare global {
  interface Window {
    __INTRANK_ROOT__?: ReturnType<typeof ReactDOM.createRoot>;
  }
}
const root = window.__INTRANK_ROOT__ ?? ReactDOM.createRoot(rootElement);
if (!window.__INTRANK_ROOT__) window.__INTRANK_ROOT__ = root;

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);