import React, { useState, useEffect, useMemo } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { Account, Triple, Transaction } from '../types';
import { formatEther } from 'viem';
import { formatDisplayedShares } from '../services/analytics';
import { CURRENCY_SYMBOL, getGeminiApiKey, getGroqApiKey, getOpenAiApiKey } from '../constants';
import { generateSimpleLlmCompletion } from '../services/skillLlm';
import {
  buildMarketBriefCacheKey,
  loadAiBriefDeduped,
  readAiBriefCache,
} from '../services/aiBriefCache';
import { buildMarketBriefLlmPrompt, isProtocolCanonLabel, polishMarketBriefOutput } from '../services/marketBriefPrompt';

function heuristicBrief(agent: Account, triples: Triple[], history: Transaction[]): string {
  const label = agent.label || 'This market';
  const kind = agent.type || 'entry';
  const tc = triples?.length ?? 0;
  const hc = history?.length ?? 0;
  const vol = agent.totalAssets ? formatEther(BigInt(agent.totalAssets)) : '0';
  const shares = agent.totalShares ? formatDisplayedShares(agent.totalShares) : '0';
  const claimsWord = tc === 1 ? 'claim' : 'claims';
  const activityWord = hc === 1 ? 'activity' : 'activities';
  const canon = isProtocolCanonLabel(agent.label);
  const protocolLead =
    canon === 'intuition'
      ? 'Intuition is the open protocol: semantic atoms and triples (claims) with TRUST in vaults on Intuition Mainnet. '
      : canon === 'inturank'
        ? 'IntuRank is the explorer and rankings app on Intuition — markets, portfolios, and comparisons. '
        : '';
  const body =
    canon === 'intuition' || canon === 'inturank'
      ? `On this page the vault shows about ${vol} ${CURRENCY_SYMBOL} in assets, ${shares} shares, ${tc} linked ${claimsWord}, and ${hc} recent ${activityWord}. Use alongside price and liquidity—not as financial advice.`
      : `${label} is a ${kind} with ${tc} linked ${claimsWord} and ${hc} recent ${activityWord} on file. About ${vol} ${CURRENCY_SYMBOL} in assets and ${shares} shares are shown here. Use alongside price and liquidity—not as financial advice.`;
  return protocolLead + body;
}

export const AIBriefing: React.FC<{ agent: Account; triples: Triple[]; history: Transaction[] }> = ({ agent, triples, history }) => {
  const [brief, setBrief] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'live' | 'heuristic' | 'no_key'>('live');

  const triplesContext = useMemo(
    () =>
      (triples || [])
        .slice(0, 5)
        .map((t) => `${t.subject?.label || 'Subject'} -> ${t.predicate?.label || 'Link'} -> ${t.object?.label || 'Object'}`)
        .join(', '),
    [triples],
  );

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!agent.id) return;

      const cacheKey = buildMarketBriefCacheKey(
        agent,
        triples?.length ?? 0,
        history?.length ?? 0,
        triplesContext,
      );

      const cached = readAiBriefCache(cacheKey);
      if (cached) {
        setBrief(polishMarketBriefOutput(cached, agent));
        setMode('live');
        setLoading(false);
        return;
      }

      setLoading(true);
      setMode('live');

      if (!getGroqApiKey() && !getGeminiApiKey() && !getOpenAiApiKey()) {
        if (!alive) return;
        setBrief(
          'Live summaries are turned off because no AI key is configured for this build. Add VITE_GROQ_API_KEY (preferred) or Gemini/OpenAI keys — see README.',
        );
        setMode('no_key');
        setLoading(false);
        return;
      }

      const prompt = buildMarketBriefLlmPrompt(agent, triples || [], history || [], triplesContext);

      try {
        const text = await loadAiBriefDeduped(cacheKey, async () => {
          const { text: out } = await generateSimpleLlmCompletion(prompt);
          return out;
        });
        if (!alive) return;
        const cleaned = polishMarketBriefOutput(text, agent);
        if (cleaned) {
          setBrief(cleaned);
          setMode('live');
        } else {
          setBrief(heuristicBrief(agent, triples, history));
          setMode('heuristic');
        }
      } catch (lastError) {
        if (!alive) return;
        setBrief(heuristicBrief(agent, triples, history));
        setMode('heuristic');
        if (import.meta.env.DEV) console.warn('[AIBriefing] LLM failed, using heuristic:', lastError);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [agent.id, agent.label, agent.type, agent.totalAssets, agent.totalShares, triplesContext, triples?.length, history?.length]);

  return (
    <div className="bg-black border border-slate-900 p-4 sm:p-8 clip-path-slant relative overflow-hidden group min-h-[140px] sm:min-h-[160px] shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-colors duration-200">
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-600"
        aria-hidden
      >
        <Brain className="h-[min(6.5rem,32vw)] w-[min(6.5rem,32vw)] opacity-[0.035] sm:h-[min(9rem,42vw)] sm:w-[min(9rem,42vw)] sm:opacity-[0.06]" strokeWidth={1} />
      </div>
      <h3 className="mb-3 sm:mb-5 relative z-10 text-xs sm:text-sm font-semibold text-slate-100 tracking-tight">
        AI summary
      </h3>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-1">
          <Loader2 size={18} className="animate-spin shrink-0 text-intuition-primary/80" aria-hidden />
          <span>Writing summary…</span>
        </div>
      ) : (
        <div className="relative z-10 pl-4 border-l-2 border-intuition-primary/50 py-1">
          <p className="text-sm md:text-base text-slate-200 leading-relaxed tracking-tight group-hover:text-slate-100 transition-colors">
            {brief}
          </p>
          {mode === 'heuristic' && (
            <p className="mt-3 text-xs text-slate-500 leading-snug">
              The AI service didn&apos;t respond, so this text is assembled from the numbers on this page instead.
            </p>
          )}
          {mode === 'no_key' && (
            <p className="mt-3 text-xs text-amber-200/90 leading-snug">
              Turning on live summaries requires setup on the server side.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
