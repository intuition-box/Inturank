/**
 * Ask — the home. Artboards 1a (default), 1b (nothing found), 1c (quiet pulse),
 * 5c/5d (results and browse), 4a (desktop).
 *
 * Search first, then what the graph is deciding right now. A first-time visitor should know
 * what this app is for before scrolling, which is why the headline states the value prop
 * outright and the search box is the first thing under it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X, Loader2, ChevronRight } from 'lucide-react';
import { loadPulse, searchGraph, type PulseItem, type SearchHit } from '../services/askPulse';
import { RUN_SIZE, POINTS_PER_CALL } from '../services/playDeck';
import { stack, riser, press, lift, fillX, spring } from '../services/motion';

const M = motion;

const CHIPS = ['a token', 'a wallet', 'a link', 'a person', 'a tool'];

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString('en-US'));

const toneClass: Record<PulseItem['tone'], string> = {
  contested: 'text-danger',
  early: 'text-primary',
  settled: 'text-ink-dim',
  neutral: 'text-ink-muted',
};

/** Split bar. Fills via scaleX so it can never trigger layout. */
const Split: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="relative h-1.5 overflow-hidden rounded-full bg-danger-flood">
    <M.div initial="hidden" animate="show" variants={fillX(pct)} className="absolute inset-0 origin-left bg-primary-flood" />
  </div>
);

const Monogram: React.FC<{ item: { image?: string; monogram: string } }> = ({ item }) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 font-display text-[10px] font-black text-ink-muted">
    {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : item.monogram}
  </span>
);

const Ask: React.FC = () => {
  const [pulse, setPulse] = useState<PulseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await loadPulse();
      if (!cancelled) {
        setPulse(p);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, []);

  const runSearch = useCallback((value: string) => {
    setTerm(value);
    if (debounce.current) window.clearTimeout(debounce.current);
    if (!value.trim()) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    // Debounced so a fast typist does not fire a query per keystroke at the indexer.
    debounce.current = window.setTimeout(async () => {
      const res = await searchGraph(value).catch(() => []);
      setHits(res);
      setSearching(false);
    }, 280);
  }, []);

  const [lead, ...rest] = pulse;
  const quiet = !loading && pulse.length === 0;
  const searchMode = hits !== null;

  const runPoints = useMemo(() => RUN_SIZE * POINTS_PER_CALL, []);

  return (
    <M.div
      variants={stack()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 lg:max-w-5xl"
    >
      {/* Headline + search */}
      <M.h1
        variants={riser()}
        className="font-display text-[30px] font-black leading-[1.05] tracking-tight text-ink sm:text-4xl"
      >
        Find out what money
        <br />
        says about anything.
      </M.h1>

      <M.div variants={riser()} className="relative mt-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={term}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="What do you want to check?"
          aria-label="Search the graph"
          className="w-full rounded-2xl border border-border bg-surface py-3.5 pl-11 pr-11 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary-ink"
        />
        {term && (
          <button
            type="button"
            onClick={() => runSearch('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </M.div>

      {!searchMode && (
        <M.div variants={riser()} className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-ink-muted"
            >
              {c}
            </span>
          ))}
        </M.div>
      )}

      <AnimatePresence mode="wait">
        {searchMode ? (
          /* ── Results ─────────────────────────────────────────────── */
          <M.section
            key="results"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.card}
            className="mt-6"
          >
            {searching ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Searching" />
              </div>
            ) : hits.length === 0 ? (
              <div className="py-8 text-center">
                <h2 className="font-display text-xl font-black leading-snug text-ink">
                  Nobody has staked a thing on {term}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-muted">
                  It isn&rsquo;t in the graph yet. Whoever puts it there first owns the opening position
                  and every point that comes with it.
                </p>
                <Link
                  to="/create"
                  className="mt-4 inline-block rounded-xl bg-primary-fill px-5 py-3 font-display text-sm font-extrabold text-bg"
                >
                  Be the first
                </Link>
              </div>
            ) : (
              <>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  {hits.length} {hits.length === 1 ? 'result' : 'results'}
                </p>
                <M.ul variants={stack(0.03)} initial="hidden" animate="show" className="flex flex-col gap-1.5">
                  {hits.map((h) => (
                    <M.li key={`${h.kind}-${h.id}`} variants={riser(6)} whileHover={lift}>
                      <Link
                        to={`/verdict/${h.id}`}
                        className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3"
                      >
                        <Monogram item={h} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-ink">{h.label}</span>
                          <span className="text-[11px] text-ink-muted">
                            {h.kind === 'thing' ? 'A thing' : 'A claim'}
                            {h.holders > 0 && ` · ${h.holders} holders`}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-dim" aria-hidden />
                      </Link>
                    </M.li>
                  ))}
                </M.ul>
              </>
            )}
          </M.section>
        ) : (
          /* ── Live pulse ──────────────────────────────────────────── */
          <M.section key="pulse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-7">
            <div className="mb-2 flex items-center">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Deciding right now
              </h2>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${quiet ? 'bg-ink-dim' : 'bg-primary'}`}
                  aria-hidden
                />
                {quiet ? 'Quiet' : 'Live'}
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Loading" />
              </div>
            ) : quiet ? (
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h3 className="font-display text-lg font-black leading-snug text-ink">
                  Nothing has enough money on it yet
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                  A quiet graph is where positions are cheapest to take. Whatever you put up now sets
                  the answer everyone else sees.
                </p>
                <Link
                  to="/create"
                  className="mt-4 inline-block rounded-xl bg-primary-fill px-5 py-2.5 font-display text-sm font-extrabold text-bg"
                >
                  Put something up
                </Link>
              </div>
            ) : (
              <M.div variants={stack(0.045)} initial="hidden" animate="show" className="flex flex-col gap-2">
                {/* Lead card */}
                {lead && (
                  <M.div variants={riser()} whileHover={lift}>
                    <Link
                      to={`/verdict/${lead.id}`}
                      className="block rounded-2xl border border-border bg-surface p-4"
                    >
                      <div className="flex items-start gap-3">
                        <Monogram item={lead} />
                        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink">
                          {lead.label}
                        </p>
                        {lead.chip && (
                          <span
                            className={`shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                              lead.tone === 'contested'
                                ? 'border-danger text-danger'
                                : 'border-primary-ink text-primary'
                            }`}
                          >
                            {lead.chip}
                          </span>
                        )}
                      </div>
                      {lead.pctYes !== null && (
                        <div className="mt-3">
                          <Split pct={lead.pctYes} />
                        </div>
                      )}
                      <div className="mt-2.5 grid grid-cols-3 gap-2">
                        {[
                          { v: fmt(lead.stakedTrust), l: 'Staked' },
                          { v: fmt(lead.holders), l: 'Holders' },
                          {
                            v: lead.pctYes !== null ? `${Math.round(lead.pctYes)}/${100 - Math.round(lead.pctYes)}` : '—',
                            l: 'For / against',
                          },
                        ].map((s) => (
                          <div key={s.l}>
                            <div className="font-display text-base font-extrabold tabular-nums text-ink">{s.v}</div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-ink-muted">{s.l}</div>
                          </div>
                        ))}
                      </div>
                    </Link>
                  </M.div>
                )}

                {/* 2-column pairs */}
                <div className="grid gap-2 sm:grid-cols-2">
                  {rest.map((p) => (
                    <M.div key={p.id} variants={riser()} whileHover={lift}>
                      <Link
                        to={`/verdict/${p.id}`}
                        className="flex h-full flex-col rounded-2xl border border-border bg-surface p-3.5"
                      >
                        <div className="flex items-start gap-2.5">
                          <Monogram item={p} />
                          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-ink">
                            {p.label}
                          </p>
                        </div>
                        {p.pctYes !== null && (
                          <div className="mt-2.5">
                            <Split pct={p.pctYes} />
                          </div>
                        )}
                        <p className={`mt-2 text-[11px] leading-snug ${toneClass[p.tone]}`}>{p.note}</p>
                      </Link>
                    </M.div>
                  ))}
                </div>
              </M.div>
            )}

            {/* Run CTA */}
            <M.div variants={riser()} className="mt-3">
              <M.div whileTap={press}>
                <Link
                  to="/play"
                  className="flex items-center gap-3 rounded-2xl border border-primary-ink bg-surface px-4 py-3.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-extrabold text-ink">
                      Play today&rsquo;s run
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      {RUN_SIZE} cards · about 90 seconds · +{runPoints} points
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                </Link>
              </M.div>
            </M.div>
          </M.section>
        )}
      </AnimatePresence>
    </M.div>
  );
};

export default Ask;
