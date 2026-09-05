/**
 * Me — portfolio, rank, badges, lists and notifications in one viewport.
 * Artboards 1g (populated), 1h (nothing yet), 4d (desktop), 5e/5f (someone else's page).
 *
 * Replaces the job previously split across Portfolio, Account and PublicProfile. Pass an
 * `address` in the route to view a stranger; without one it is your own page, and the
 * difference is only which controls appear — the layout is identical, which is what makes
 * "Send TRUST" on a backer mean something.
 *
 * Motion: every animated property here is transform or opacity. Numbers count up via rAF
 * with tabular figures so digits never reflow the container.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, BellRing, BellOff, Loader2, Share2 } from 'lucide-react';
import { getPortfolioPositionsWithValue } from '../services/graphql';
import { fetchArenaPlayerLeaderboard, inturankLeaderboardTotalXp } from '../services/arenaLeaderboard';
import { getUserLeaderboardRanks, BADGE_NAMES, BADGE_TIER_ORDER, type UserBadges } from '../services/badges';
import { getDayStreak, getWeekStrip, type WeekDay } from '../services/dayStreak';
import { getConnectedAccount } from '../services/web3';
import { walletDisplayMeta } from '../services/tns';
import { getPushState, enablePush, disablePush, sendTestPush, type PushState } from '../services/pushNotifications';
import { stack, riser, land, press, lift, idleFloat, countUp, fillX } from '../services/motion';
import { toast } from '../components/Toast';

const M = motion;

const fmtTrust = (n: number) =>
  !Number.isFinite(n) ? '0' : n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(1);

/** A number that counts up on mount. Paired with tabular-nums so digits never shift. */
const Counter: React.FC<{ to: number; format?: (n: number) => string; className?: string }> = ({
  to,
  format = (n) => Math.round(n).toLocaleString('en-US'),
  className = '',
}) => {
  const [v, setV] = useState(0);
  useEffect(() => countUp(to, setV), [to]);
  return <span className={`tabular-nums ${className}`}>{format(v)}</span>;
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <M.div variants={riser()} className={`rounded-2xl border border-border bg-surface ${className}`}>
    {children}
  </M.div>
);

const Me: React.FC = () => {
  const { address: routeAddress } = useParams();
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [positions, setPositions] = useState<any[]>([]);
  const [points, setPoints] = useState(0);
  const [rank, setRank] = useState<number | null>(null);
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [streak, setStreak] = useState(0);
  const [week, setWeek] = useState<WeekDay[]>([]);
  const [push, setPush] = useState<PushState>('off');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    void getConnectedAccount().then(setMe).catch(() => setMe(null));
  }, []);

  /** Whose page this is. A route address wins; otherwise it is the connected wallet. */
  const address = routeAddress ?? me;
  const isSelf = !routeAddress || (!!me && me.toLowerCase() === routeAddress.toLowerCase());

  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setLoading(false);
      return;
    }
    setLoading(true);

    void (async () => {
      // Each source is independently guarded: the page renders with whatever arrives.
      const [pos, board, ranks, meta] = await Promise.all([
        getPortfolioPositionsWithValue(address).catch(() => []),
        fetchArenaPlayerLeaderboard(address).catch(() => []),
        getUserLeaderboardRanks(address).catch(() => null),
        walletDisplayMeta(address).catch(() => null),
      ]);
      if (cancelled) return;

      setPositions(Array.isArray(pos) ? pos : []);
      const row = (board as any[]).find((r) => r.address?.toLowerCase() === address.toLowerCase());
      setPoints(row ? inturankLeaderboardTotalXp(row) : 0);
      setRank(row?.rank ?? null);
      setBadges(ranks);
      // walletDisplayMeta returns { primaryLabel, isNamed } — primaryLabel carries the
      // resolved .trust or ENS name, and is '' when the wallet has neither.
      setName(meta?.isNamed ? meta.primaryLabel : '');
      setStreak(getDayStreak(address));
      setWeek(getWeekStrip(address));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (isSelf) void getPushState().then(setPush);
  }, [isSelf]);

  const portfolio = useMemo(
    () => positions.reduce((sum, p) => sum + (Number(p?.currentValue ?? p?.value ?? 0) || 0), 0),
    [positions],
  );
  const winning = useMemo(() => positions.filter((p) => Number(p?.pnlPct ?? 0) > 0).length, [positions]);
  const down = positions.length - winning;

  const togglePush = useCallback(async () => {
    if (!address) return;
    setPushBusy(true);
    try {
      if (push === 'on') {
        setPush((await disablePush()).state);
      } else {
        const res = await enablePush(address);
        setPush(res.state);
        if (res.reason) toast.info(res.reason);
      }
    } finally {
      setPushBusy(false);
    }
  }, [address, push]);

  const testPush = useCallback(async () => {
    if (!address) return;
    const res = await sendTestPush(address);
    if (res.ok) toast.success('Sent. Check your notifications.');
    else toast.info(res.reason || 'Could not send.');
  }, [address]);

  if (!address) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-2xl font-extrabold text-ink">Nothing here yet</h1>
        <p className="text-sm text-ink-muted">
          Your calls in Play are free and they still earn. Connect when you want them kept.
        </p>
        <Link to="/climb" className="rounded-xl bg-primary-fill px-5 py-3 font-display text-sm font-extrabold text-bg">
          Play today&rsquo;s run
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  const tier = badges?.bestTier ?? 'scout';
  const tierIndex = badges?.tierIndex ?? 1;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <M.div
      variants={stack()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 sm:px-6"
    >
      {/* Identity */}
      <M.div variants={riser()} className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 font-display text-xs font-black text-ink-muted">
          {(name || address).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-extrabold tracking-tight text-ink">
            {name || short}
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
            {BADGE_NAMES[tier]} &middot; tier {tierIndex} of {BADGE_TIER_ORDER.length}
          </p>
        </div>
        {isSelf && (
          <M.button
            whileTap={press}
            type="button"
            className="ml-auto flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-ink-muted"
          >
            <Share2 className="h-3.5 w-3.5" /> Share card
          </M.button>
        )}
      </M.div>

      <div className="grid gap-3 lg:grid-cols-[380px_1fr] lg:items-start">
        {/* ── Left: identity, stats, streak, tier ─────────────────────── */}
        <M.div variants={stack(0.05)} className="flex flex-col gap-3">
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Portfolio</p>
            <div className="mt-1 flex items-end gap-2">
              <span className="font-display text-4xl font-black leading-none tracking-tighter text-ink">
                <Counter to={portfolio} format={fmtTrust} />
              </span>
              <span className="pb-1 text-xs font-bold uppercase tracking-wider text-ink-muted">TRUST</span>
            </div>
            {positions.length === 0 && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                Nothing staked. Your calls in Play are free and they still earn — a position is what
                happens when you decide one of them is worth backing.
              </p>
            )}
          </Card>

          {/* Stat triplet */}
          <M.div variants={riser()} className="grid grid-cols-3 rounded-2xl border border-border bg-surface">
            {[
              { v: positions.length ? Math.round((winning / positions.length) * 100) : 0, suffix: '%', label: 'Calls right' },
              { v: tierIndex, label: 'Tier' },
              { v: streak, label: 'Day streak' },
            ].map((s, i) => (
              <div key={s.label} className={`px-3 py-3.5 ${i < 2 ? 'border-r border-border' : ''}`}>
                <div className="font-display text-xl font-extrabold tracking-tight text-ink">
                  <Counter to={s.v} />
                  {s.suffix}
                </div>
                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  {s.label}
                </div>
              </div>
            ))}
          </M.div>

          {/* Week strip — a calendar you can read, not abstract dashes */}
          <M.div variants={riser()} className="grid grid-cols-7 gap-1 rounded-2xl border border-border bg-surface p-2">
            {week.map((d) => (
              <div
                key={d.key}
                className={`rounded-xl py-2 text-center transition-colors ${
                  d.isToday ? 'border border-primary-ink' : ''
                }`}
              >
                <div className="flex h-1.5 items-center justify-center">
                  {d.played && <M.span variants={land} className="block h-1.5 w-1.5 rounded-full bg-primary" />}
                </div>
                <div
                  className={`mt-1 text-[9px] font-bold uppercase ${
                    d.isFuture ? 'text-ink-dim' : 'text-ink-muted'
                  }`}
                >
                  {d.label}
                </div>
                <div
                  className={`font-display text-xs font-extrabold tabular-nums ${
                    d.isToday ? 'text-primary' : d.isFuture ? 'text-ink-dim' : 'text-ink'
                  }`}
                >
                  {d.date}
                </div>
              </div>
            ))}
          </M.div>

          {/* Tier progress — the gem idles so the reward feels alive while sitting still */}
          <Card className="flex items-center gap-3 p-4">
            <M.div animate={idleFloat} className="shrink-0">
              <div className="h-11 w-11 rotate-45 rounded-md bg-primary-fill/90" aria-hidden />
            </M.div>
            <div className="min-w-0">
              <p className="font-display text-sm font-extrabold text-ink">
                {streak > 0 ? `${streak} ${streak === 1 ? 'day' : 'days'} in a row` : 'Start a streak today'}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                {badges?.nextTier && badges.placesToNextTier !== null
                  ? `${badges.placesToNextTier} places to ${BADGE_NAMES[badges.nextTier]}.`
                  : 'Play a run to put yourself on the board.'}
              </p>
            </div>
          </Card>

          {isSelf && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-ink">Tell me when a position moves</p>
                  <p className="text-[11px] text-ink-muted">
                    {push === 'on'
                      ? 'On for this device'
                      : push === 'denied'
                        ? 'Blocked in your browser settings'
                        : push === 'unsupported'
                          ? 'This browser cannot do it'
                          : push === 'insecure'
                            ? 'Needs a secure connection'
                            : push === 'unconfigured'
                              ? 'Not set up on the server yet'
                              : 'Off'}
                  </p>
                </div>
                <M.button
                  whileTap={press}
                  type="button"
                  onClick={togglePush}
                  disabled={pushBusy || ['unsupported', 'insecure', 'denied', 'unconfigured'].includes(push)}
                  aria-pressed={push === 'on'}
                  className={`ml-auto flex h-8 w-14 shrink-0 items-center rounded-full border px-1 transition-colors disabled:opacity-40 ${
                    push === 'on' ? 'justify-end border-primary-ink bg-primary-fill' : 'justify-start border-border bg-surface-2'
                  }`}
                >
                  <M.span layout={false} className="block h-6 w-6 rounded-full bg-bg">
                    {pushBusy ? (
                      <Loader2 className="h-6 w-6 animate-spin p-1 text-ink-muted" />
                    ) : push === 'on' ? (
                      <BellRing className="h-6 w-6 p-1.5 text-primary" />
                    ) : (
                      <BellOff className="h-6 w-6 p-1.5 text-ink-dim" />
                    )}
                  </M.span>
                </M.button>
              </div>
              {push === 'on' && (
                <button
                  type="button"
                  onClick={testPush}
                  className="mt-2 text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Send a test notification
                </button>
              )}
            </Card>
          )}
        </M.div>

        {/* ── Right: positions and standing ────────────────────────────── */}
        <M.div variants={stack(0.05)} className="flex flex-col gap-3">
          <M.div variants={riser()} className="flex items-baseline gap-3">
            <h2 className="font-display text-sm font-extrabold uppercase tracking-wide text-ink">
              {positions.length} {positions.length === 1 ? 'position' : 'positions'}
            </h2>
            {positions.length > 0 && (
              <span className="text-[11px] text-ink-muted">
                <span className="text-primary">{winning} winning</span>
                {down > 0 && <span className="text-danger"> &middot; {down} down</span>}
              </span>
            )}
          </M.div>

          {positions.length === 0 ? (
            <Card className="p-5 text-center">
              <p className="font-display text-base font-extrabold text-ink">
                You haven&rsquo;t put money on anything yet
              </p>
              <Link
                to="/climb"
                className="mt-3 inline-block rounded-xl bg-primary-fill px-5 py-2.5 font-display text-sm font-extrabold text-bg"
              >
                Find something to back
              </Link>
            </Card>
          ) : (
            <M.ul variants={stack(0.035)} className="flex flex-col gap-1.5">
              {positions.slice(0, 12).map((p, i) => {
                const pnl = Number(p?.pnlPct ?? 0);
                const id = p?.term_id ?? p?.id ?? String(i);
                return (
                  <M.li key={id} variants={riser(8)} whileHover={lift}>
                    <Link
                      to={`/verdict/${id}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                        {p?.label ?? p?.atom?.label ?? p?.triple?.label ?? 'Untitled'}
                      </span>
                      <span className="font-display text-sm font-extrabold tabular-nums text-ink">
                        {fmtTrust(Number(p?.currentValue ?? p?.value ?? 0))}
                      </span>
                      <span
                        className={`w-16 text-right font-display text-xs font-extrabold tabular-nums ${
                          pnl >= 0 ? 'text-primary' : 'text-danger'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}
                        {pnl.toFixed(1)}%
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-dim" aria-hidden />
                    </Link>
                  </M.li>
                );
              })}
            </M.ul>
          )}

          {/* Season standing */}
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Season standing</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-display text-xl font-extrabold tabular-nums text-primary">
                {rank ? `#${rank}` : '—'}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <M.div
                  variants={fillX(badges?.bestPopulation && rank ? 100 - (rank / badges.bestPopulation) * 100 : 8)}
                  className="h-full origin-left bg-primary-flood"
                />
              </div>
              <span className="font-display text-sm font-extrabold tabular-nums text-ink">
                <Counter to={points} />
              </span>
            </div>
            {badges?.nextTier && badges.placesToNextTier ? (
              <p className="mt-2 text-[11px] text-ink-muted">
                {badges.placesToNextTier} places climbs you into {BADGE_NAMES[badges.nextTier]}.
              </p>
            ) : null}
          </Card>
        </M.div>
      </div>
    </M.div>
  );
};

export default Me;
