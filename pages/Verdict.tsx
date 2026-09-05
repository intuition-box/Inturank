/**
 * Verdict — the answer page. Artboards 1e (full market), 1f (barely decided),
 * 5a/5b (a thing, not a claim), 4c (desktop) and 7e (light).
 *
 * Three modes, one component:
 *   claim + crowd  → a percentage, a split bar, back or fade
 *   claim + thin   → NO percentage, because on nine holders it would be theatre;
 *                    instead, what your money would make you
 *   thing          → no yes/no at all; how much money holds it, and what people claim about it
 *
 * Colour comes from the semantic tokens (`--primary`, `--ink`, `--surface`…), never the
 * literal `intuition.*` aliases, so this surface follows the light stamp correctly.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Minus, ListPlus, BellRing, Share2, Loader2 } from 'lucide-react';
import { loadVerdict, quoteDeposit, type VerdictModel, type Side } from '../services/verdictData';
import { depositToVault, redeemFromVault, getConnectedAccount, parseProtocolError } from '../services/web3';
import { LINEAR_CURVE_ID } from '../constants';
import { toast } from '../components/Toast';
import { normalizeWebMediaUrl } from '../services/mediaUrl';
import { motion } from 'framer-motion';
import { fillX } from '../services/motion';

const PRESETS = [10, 25, 100, 500];

const fmt = (n: number, dp = 1): string => {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(dp)}k`;
  return n.toFixed(n < 10 ? 2 : 0);
};
const whole = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '0');

/** Stat triplet — three equal columns, the density unit used across every surface. */
const Stats: React.FC<{ items: Array<{ value: string; label: string; tone?: 'ink' | 'primary' | 'danger' }> }> = ({
  items,
}) => (
  <div className="grid grid-cols-3 rounded-2xl border border-border bg-surface">
    {items.map((s, i) => (
      <div key={s.label} className={`px-3 py-3.5 ${i < items.length - 1 ? 'border-r border-border' : ''}`}>
        <div
          className={`font-display text-lg font-extrabold tracking-tight tabular-nums ${
            s.tone === 'primary' ? 'text-primary' : s.tone === 'danger' ? 'text-danger' : 'text-ink'
          }`}
        >
          {s.value}
        </div>
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">{s.label}</div>
      </div>
    ))}
  </div>
);

/** A row that opens to reveal detail — the progressive disclosure from 4c. */
const Disclosure: React.FC<{
  label: string;
  value: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, value, trailing, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</span>
        <span className="font-display text-base font-extrabold tabular-nums text-ink">{value}</span>
        <span className="ml-auto flex items-center gap-2">
          {trailing}
          <ChevronRight
            className={`h-4 w-4 text-ink-dim transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden
          />
        </span>
      </button>
      {open && <div className="border-t border-border px-4 py-3 text-[13px]">{children}</div>}
    </div>
  );
};

const Verdict: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [model, setModel] = useState<VerdictModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('for');
  const [amount, setAmount] = useState(25);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getConnectedAccount().then(setWallet).catch(() => setWallet(null));
  }, []);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setModel(await loadVerdict(id, wallet));
    } catch {
      setModel(null);
    } finally {
      setLoading(false);
    }
  }, [id, wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const quote = useMemo(
    () => quoteDeposit(amount, model?.sharePrice ?? 0),
    [amount, model?.sharePrice],
  );

  /** Where the money actually goes: the claim's own vault, or its counter-vault when fading. */
  const targetTermId = side === 'against' && model?.counterTermId ? model.counterTermId : model?.id;

  const commit = useCallback(async () => {
    if (!model || !targetTermId) return;
    if (!wallet) {
      toast.info('Connect a wallet to put money on this.');
      return;
    }
    setBusy(true);
    try {
      await depositToVault(String(amount), targetTermId, wallet, LINEAR_CURVE_ID);
      toast.success(`${side === 'for' ? 'Backed' : 'Faded'} with ${amount} TRUST.`);
      await refresh();
    } catch (e) {
      toast.error(parseProtocolError(e));
    } finally {
      setBusy(false);
    }
  }, [model, targetTermId, wallet, amount, side, refresh]);

  const sell = useCallback(async () => {
    if (!model || !wallet || model.myShares <= 0) return;
    setBusy(true);
    try {
      await redeemFromVault(String(model.myShares), model.id, wallet, LINEAR_CURVE_ID);
      toast.success('Position sold.');
      await refresh();
    } catch (e) {
      toast.error(parseProtocolError(e));
    } finally {
      setBusy(false);
    }
  }, [model, wallet, refresh]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-2xl font-extrabold text-ink">Nothing has staked a thing on this</h1>
        <p className="max-w-sm text-sm text-ink-muted">
          It isn&rsquo;t in the graph yet. Whoever puts it there first owns the opening position and every point
          that comes with it.
        </p>
        <Link
          to="/create"
          className="rounded-xl bg-primary-fill px-5 py-3 font-display text-sm font-extrabold text-bg"
        >
          Be the first
        </Link>
      </div>
    );
  }

  const isClaim = model.mode === 'claim';
  const showPercentage = isClaim && model.pctYes !== null;

  // ── The action panel: shared by mobile (inline) and desktop (right column) ──
  const actionPanel = (
    <div className="flex flex-col gap-3">
      {model.myShares > 0 && (
        <Disclosure
          label="Your position"
          value={`${fmt(model.myTrust)} TRUST`}
          trailing={
            model.myPnlPct !== null ? (
              <span
                className={`font-display text-sm font-extrabold tabular-nums ${
                  model.myPnlPct >= 0 ? 'text-primary' : 'text-danger'
                }`}
              >
                {model.myPnlPct >= 0 ? '+' : ''}
                {model.myPnlPct.toFixed(1)}%
              </span>
            ) : null
          }
        >
          <div className="grid grid-cols-3 gap-3 text-ink">
            <div>
              <div className="font-display font-extrabold tabular-nums">{whole(model.myShares)}</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-muted">shares</div>
            </div>
            <div>
              <div className="font-display font-extrabold tabular-nums">{model.myAvgPaid.toFixed(4)}</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-muted">avg paid</div>
            </div>
            <div>
              <div className="font-display font-extrabold tabular-nums">{model.sharePrice.toFixed(4)}</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-muted">now</div>
            </div>
          </div>
          <button
            type="button"
            onClick={sell}
            disabled={busy}
            className="mt-3 w-full rounded-xl border border-border py-2.5 font-display text-xs font-extrabold uppercase tracking-wide text-ink disabled:opacity-40"
          >
            Sell the position &middot; {fmt(model.myTrust)} TRUST
          </button>
        </Disclosure>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4">
        {isClaim ? (
          <div className="grid grid-cols-2 gap-2">
            {(['for', 'against'] as Side[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={`rounded-xl border py-3 font-display text-sm font-extrabold uppercase tracking-wide transition-transform active:scale-[0.98] ${
                  side === s
                    ? s === 'for'
                      ? 'border-primary-ink bg-primary-fill text-bg'
                      : 'border-danger bg-danger text-bg'
                    : 'border-border text-ink'
                }`}
              >
                {s === 'for' ? 'Back it' : 'Fade it'}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Holding a thing is a bet it matters, not that it is good.
          </p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            aria-label="Less"
            onClick={() => setAmount((a) => Math.max(1, a - 5))}
            className="rounded-xl border border-border p-2.5 text-ink"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <div className="font-display text-3xl font-black tabular-nums text-ink">{amount}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">TRUST</div>
          </div>
          <button
            type="button"
            aria-label="More"
            onClick={() => setAmount((a) => a + 5)}
            className="rounded-xl border border-border p-2.5 text-ink"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p)}
              className={`rounded-lg border py-2 font-display text-xs font-extrabold tabular-nums ${
                amount === p ? 'border-primary-ink text-primary' : 'border-border text-ink-muted'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <Disclosure label="Quote" value={`${whole(quote.shares)} shares`}>
            <dl className="flex flex-col gap-1.5 text-ink-muted">
              <div className="flex justify-between">
                <dt>You get</dt>
                <dd className="tabular-nums text-ink">{whole(quote.shares)} shares</dd>
              </div>
              <div className="flex justify-between">
                <dt>Price a share</dt>
                <dd className="tabular-nums text-ink">{model.sharePrice.toFixed(4)} TRUST</dd>
              </div>
              <div className="flex justify-between">
                <dt>Protocol fee &middot; 0.5%</dt>
                <dd className="tabular-nums text-ink">{quote.fee.toFixed(2)} TRUST</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5">
                <dt className="text-ink">Total</dt>
                <dd className="font-display font-extrabold tabular-nums text-ink">
                  {quote.total.toFixed(2)} TRUST
                </dd>
              </div>
            </dl>
          </Disclosure>
        </div>

        <button
          type="button"
          onClick={commit}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-fill py-3.5 font-display text-sm font-extrabold text-bg transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {isClaim
            ? `${side === 'for' ? 'Back' : 'Fade'} it with ${amount} TRUST`
            : `Hold ${amount} TRUST of this`}
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-muted">
          Real TRUST leaves your wallet. One signature, reviewable first.
        </p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="rounded-lg p-1.5 text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="ml-auto flex items-center gap-2">
          {[
            { icon: ListPlus, label: 'Add to list' },
            { icon: BellRing, label: 'Alert me' },
            { icon: Share2, label: 'Share' },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:text-ink"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px] lg:items-start lg:gap-6">
        {/* ── Left / main ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2 font-display text-xs font-black text-ink-muted">
              {model.image ? (
                <img src={normalizeWebMediaUrl(model.image)} alt="" className="h-full w-full object-cover" />
              ) : (
                model.monogram
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-extrabold leading-tight tracking-tight text-ink sm:text-2xl">
                {model.label}
              </h1>
              {!isClaim && (
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  A thing {model.listCount > 0 && `· in ${whole(model.listCount)} lists`}
                </p>
              )}
              {model.thin && isClaim && (
                <span className="mt-1 inline-block rounded-md bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
                  Barely decided
                </span>
              )}
            </div>
          </div>

          {/* The headline answer */}
          {showPercentage ? (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-end gap-3">
                <span className="font-display text-5xl font-black leading-none tracking-tighter text-primary tabular-nums">
                  {Math.round(model.pctYes!)}%
                </span>
                <span className="pb-1 text-sm leading-tight text-ink-muted">
                  of the money
                  <br />
                  says yes
                </span>
              </div>
              {/* Split bar fills on entry via scaleX — a transform, so it never triggers layout. */}
              <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-danger-flood">
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={fillX(model.pctYes!)}
                  className="absolute inset-0 origin-left bg-primary-flood"
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] font-bold uppercase tracking-wide">
                <span className="text-primary">{fmt(model.forTrust)} for</span>
                <span className="text-danger">{fmt(model.againstTrust)} against</span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="font-display text-lg font-extrabold leading-snug tracking-tight text-ink">
                {isClaim
                  ? `${whole(model.holders)} people and ${fmt(model.stakedTrust)} TRUST have decided this`
                  : 'There is no yes or no on a thing'}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                {isClaim ? (
                  <>
                    There is no crowd position here yet, so a percentage would be theatre. {amount} TRUST is
                    enough to move where this lands.
                  </>
                ) : (
                  <>
                    There is only how much money is holding it, and what people claim about it.
                  </>
                )}
              </p>
            </div>
          )}

          <Stats
            items={
              isClaim
                ? [
                    { value: fmt(model.stakedTrust), label: 'Staked' },
                    { value: whole(model.holders), label: 'Holders' },
                    { value: model.sharePrice.toFixed(4), label: 'A share' },
                  ]
                : [
                    { value: fmt(model.stakedTrust), label: 'TRUST staked' },
                    { value: whole(model.holders), label: 'Holders' },
                    { value: String(model.claimCount), label: 'Claims' },
                  ]
            }
          />

          {/* Mobile keeps the action inline; desktop moves it to the right column. */}
          <div className="lg:hidden">{actionPanel}</div>

          {model.backers.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                {model.thin ? `All ${whole(model.holders)} holders` : 'Biggest backers'}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {model.backers.map((b) => (
                  <li
                    key={`${b.address}-${b.side}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 font-display text-[10px] font-black text-ink-muted">
                      {(b.label || b.address).slice(0, 2).toUpperCase()}
                    </span>
                    <Link
                      to={`/profile/${b.address}`}
                      className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink hover:text-primary"
                    >
                      {b.label || `${b.address.slice(0, 6)}…${b.address.slice(-4)}`}
                    </Link>
                    <span
                      className={`font-display text-xs font-extrabold tabular-nums ${
                        b.side === 'for' ? 'text-primary' : 'text-danger'
                      }`}
                    >
                      {fmt(b.trust)}
                    </span>
                    <Link
                      to={`/send-trust?to=${b.address}`}
                      className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted hover:text-ink"
                    >
                      Send TRUST
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {model.relatedClaims.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                What people claim about it
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {model.relatedClaims.map((c) => (
                  <Link
                    key={c.id}
                    to={`/verdict/${c.id}`}
                    className="rounded-xl border border-border bg-surface p-3 transition-transform hover:-translate-y-0.5"
                  >
                    <p className="text-[13px] font-semibold leading-snug text-ink">{c.label}</p>
                    <p className="mt-1.5 text-[11px] text-ink-muted">
                      {c.pctYes !== null ? (
                        <span className="font-display font-extrabold text-primary">
                          {Math.round(c.pctYes)}%
                        </span>
                      ) : (
                        <span className="text-ink-dim">too few holders to average</span>
                      )}
                      {'  '}
                      {fmt(c.stakedTrust)} staked &middot; {whole(c.holders)} holders
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Right column, desktop only ───────────────────────────────── */}
        <aside className="hidden lg:block lg:sticky lg:top-6">{actionPanel}</aside>
      </div>
    </div>
  );
};

export default Verdict;
