import React from 'react';
import { Wrench, RefreshCw } from 'lucide-react';

const Maintenance: React.FC = () => {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center bg-intuition-dark text-white px-6"
      style={{ fontFamily: '"Fira Code", "JetBrains Mono", monospace' }}
    >
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="p-4 rounded-2xl bg-intuition-card border border-intuition-border">
            <Wrench className="w-16 h-16 text-intuition-primary" strokeWidth={1.5} />
          </div>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white font-display mb-2 tracking-tight">
            Under maintenance
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            We're performing critical updates. IntuRank will be back shortly.
          </p>
        </div>

        <div className="pt-4">
          <p className="text-slate-500 text-xs">
            Thank you for your patience.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-intuition-primary text-black font-bold rounded-lg hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-4 h-4" />
            Check again
          </button>
        </div>
      </div>
    </div>
  );
};

export default Maintenance;
