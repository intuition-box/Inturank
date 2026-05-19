/**
 * IntuRank Arena XP leaderboard — `/stats?tab=rankers`.
 * Rounded glass UI, cyan/magenta/gold gradients (IntuRank brand).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, RefreshCw, Loader2, Sparkles, Zap, HelpCircle } from 'lucide-react';
import { useAccount } from 'wagmi';
import {
  fetchArenaPlayerLeaderboard,
  inturankLeaderboardTotalXp,
  type ArenaPlayerRow,
} from '../services/arenaLeaderboard';
import { ArenaXpToken } from './ArenaXpToken';
import { fetchArenaXpRecordForWallet } from '../services/arenaXp';
import { getProtocolXpTotal, PROTOCOL_XP_UPDATED_EVENT } from '../services/protocolXp';
import { playClick, playHover } from '../services/audio';

function shortAddr(addr: string): string {
  const a = (addr || '').trim();
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function avatarGlyph(label: string): string {
  const t = (label || '').trim();
  if (!t.length) return '?';
  if (/^0x[0-9a-f]+$/i.test(t)) return '?';
  const letter = /[a-z]/i.exec(t);
  return letter ? letter[0].toUpperCase() : '?';
}

const HINT_LISTS = 'Distinct portal lists represented in your finalized indexed claims (Arena + same Intuition predicates).';
const HINT_ATOMS = 'Distinct subjects you have a latest on-chain stance for in those lists.';
const HINT_XP =
  'Ranks by **total IntuRank XP**: Arena (indexed ranks) + Activity (markets, creates, sends). Others’ activity counts when mirrored from the API; yours includes this browser.';


/** Column template: rank · player · lists · atoms · arena XP — match header row to body rows */
const LB_GRID =
  'grid-cols-[minmax(4.25rem,5.25rem)_minmax(9rem,1fr)_minmax(5rem,8rem)_minmax(5rem,8rem)_minmax(11rem,1.2fr)]';

function ColHead({
  children,
  hint,
  align = 'left',
}: {
  children: React.ReactNode;
  hint?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const alignCls =
    align === 'right'
      ? 'justify-end text-right'
      : align === 'center'
        ? 'justify-center text-center'
        : 'justify-start text-left';
  return (
    <span
      className={`flex items-end gap-1 ${alignCls} uppercase tracking-[0.14em] text-slate-300 font-sans font-bold text-[10px] sm:text-[11px] leading-snug`}
      title={hint}
    >
      {children}
      {hint ? (
        <HelpCircle
          className="shrink-0 opacity-55 text-[#c4b5fd]"
          size={12}
          strokeWidth={2}
          aria-hidden
        />
      ) : null}
    </span>
  );
}

const CY = '#00f3ff';
const MG = '#ff1e6d';

const rowAccentBorder = ['#ec4899', '#22d3ee', '#fbbf24', '#a855f7'] as const;

export const IntuRankRankersLeaderboard: React.FC = () => {
  const { address } = useAccount();
  const [players, setPlayers] = useState<ArenaPlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      setPlayers(await fetchArenaPlayerLeaderboard(address ?? undefined));
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  const [myXpRec, setMyXpRec] = useState({
    xp: 0,
    duels: 0,
    atomsRanked: 0,
    listsPlayed: 0,
  });
  const [protoTick, setProtoTick] = useState(0);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const fn = () => setProtoTick((n) => n + 1);
    window.addEventListener(PROTOCOL_XP_UPDATED_EVENT, fn);
    return () => window.removeEventListener(PROTOCOL_XP_UPDATED_EVENT, fn);
  }, []);

  const activityXp = useMemo(
    () => (address ? getProtocolXpTotal(address) : 0),
    [address, protoTick]
  );

  useEffect(() => {
    if (!address) {
      setMyXpRec({ xp: 0, duels: 0, atomsRanked: 0, listsPlayed: 0 });
      return;
    }
    let cancelled = false;
    fetchArenaXpRecordForWallet(address)
      .then((rec) => {
        if (!cancelled) {
          setMyXpRec({
            xp: rec.xp,
            duels: rec.duels,
            atomsRanked: rec.atomsRanked,
            listsPlayed: rec.listsPlayed,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setMyXpRec({ xp: 0, duels: 0, atomsRanked: 0, listsPlayed: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const myLc = address?.toLowerCase();
  const myRow = useMemo(
    () => (myLc ? players.find((p) => p.address === myLc) ?? null : null),
    [players, myLc],
  );

  return (
    <div className="relative w-full min-h-[min(560px,calc(100vh-12rem))] animate-in fade-in duration-500 overflow-hidden rounded-[2rem] shadow-[0_24px_80px_rgba(0,0,0,0.38)]">

      {loading ? (
        <div
          className="relative z-10 flex flex-col items-center justify-center min-h-[min(440px,calc(100vh-16rem))] gap-5 border border-white/[0.09] backdrop-blur-md px-8"
          style={{
            background: 'linear-gradient(145deg, rgba(6,11,26,0.35) 0%, rgba(4,9,22,0.42) 50%, rgba(10,8,26,0.28) 100%)',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00f3ff]/50 to-[#ff1e6d]/40 blur-xl opacity-60 animate-pulse" />
            <Loader2 size={36} className="relative animate-spin text-white drop-shadow-[0_0_12px_rgba(0,243,255,0.8)]" />
          </div>
          <p className="text-sm font-medium text-slate-500">Loading…</p>
        </div>
      ) : (
        <>
          <div
            className="relative z-10 overflow-hidden border border-white/[0.12] backdrop-blur-md backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            style={{
              background:
                'linear-gradient(155deg, rgba(12,18,38,0.34) 0%, rgba(5,8,18,0.4) 45%, rgba(22,10,26,0.32) 100%)',
              boxShadow: 'inset 0 0 80px rgba(0,243,255,0.06)',
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-20%,rgba(0,243,255,0.16),transparent_55%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(255,30,109,0.1),transparent_45%)]" />

            {/* Header */}
            <div className="relative z-10 p-5 sm:p-6 lg:p-7 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5 xl:gap-8 border-b border-white/[0.08]">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div
                  className="shrink-0 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-[#00f3ff]/40 shadow-[0_0_28px_rgba(0,243,255,0.25)]"
                  style={{
                    background: `linear-gradient(135deg, ${CY}25 0%, ${MG}15 55%, rgba(8,12,28,0.9) 100%)`,
                  }}
                >
                  <Trophy
                    size={26}
                    className="text-amber-200 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]"
                  />
                </div>
                <div className="min-w-0">
                  <h3
                    className="text-lg sm:text-2xl font-black font-display tracking-tight leading-none"
                    style={{
                      backgroundImage:
                        'linear-gradient(118deg, #ecfeff 0%, #00f3ff 30%, #fda4c6 58%, #ff1e6d 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    Rankers
                  </h3>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 xl:justify-end shrink-0">
                {address ? (
                  <div
                    className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 backdrop-blur-md border border-[#00f3ff]/25 font-sans min-w-[min(100%,22rem)]"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(0,243,255,0.1), rgba(8,14,26,0.82), rgba(255,30,109,0.05))',
                      boxShadow:
                        '0 0 28px rgba(0,243,255,0.1), inset 0 1px 0 rgba(255,255,255,0.07)',
                    }}
                  >
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 sm:gap-x-10 gap-y-3 text-left items-end">
                      <div title={myRow ? 'Place on this leaderboard table' : 'Shown when your wallet appears in the table below'}>
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 block mb-0.5">
                          Your rank
                        </span>
                        <span className="text-lg sm:text-xl font-black tabular-nums text-white drop-shadow-[0_0_12px_rgba(0,243,255,0.3)]">
                          {myRow ? `${String(myRow.rank).padStart(2, '0')}` : '—'}
                        </span>
                      </div>
                      <div title={HINT_LISTS}>
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-fuchsia-400/95 block mb-0.5">
                          Lists
                        </span>
                        <span className="text-lg sm:text-xl font-black tabular-nums text-fuchsia-100">
                          {myXpRec.listsPlayed.toLocaleString()}
                        </span>
                      </div>
                      <div title={HINT_ATOMS}>
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400/95 block mb-0.5">
                          Atoms
                        </span>
                        <span className="text-lg sm:text-xl font-black tabular-nums text-emerald-100">
                          {myXpRec.atomsRanked.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-end gap-2 col-span-2 lg:col-span-1 justify-start lg:justify-end" title={HINT_XP}>
                        <div title={`Arena (indexer): ${myXpRec.xp.toLocaleString()} · Activity (this browser): ${activityXp.toLocaleString()}`}>
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-400/90 block mb-0.5">
                            Your XP
                          </span>
                          <span className="text-lg sm:text-xl font-black tabular-nums bg-clip-text text-transparent bg-gradient-to-br from-amber-200 via-amber-300 to-orange-400 leading-none">
                            {(myXpRec.xp + activityXp).toLocaleString()}
                          </span>
                        </div>
                        <ArenaXpToken size={26} className="mb-0.5 shrink-0" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 rounded-2xl px-4 py-2.5 border border-white/10 bg-white/[0.03] font-sans">
                    Connect to see rank
                  </p>
                )}

                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-1.5 py-1 pr-2 backdrop-blur-md">
                  <span
                    className="pl-4 pr-2 text-[11px] font-bold tabular-nums text-slate-400 font-sans"
                    title="Players on leaderboard"
                  >
                    {players.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Refresh leaderboard"
                    onClick={() => {
                      playClick();
                      void refresh();
                    }}
                    disabled={refreshing}
                    onMouseEnter={playHover}
                    className="rounded-full p-2.5 text-[#00f3ff]/90 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(0,243,255,0.25)] transition-all disabled:opacity-45 border border-transparent hover:border-[#00f3ff]/30"
                  >
                    <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {players.length === 0 ? (
              <div className="relative z-10 px-6 py-16 sm:py-20 text-center font-sans">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl mb-6 border border-fuchsia-500/30 bg-fuchsia-500/10 shadow-[0_0_40px_rgba(217,70,239,0.15)]">
                  <Sparkles className="text-fuchsia-300" size={30} />
                </div>
                <p className="text-white font-semibold text-lg mb-2">No standings to show yet</p>
                <p className="text-sm text-slate-400 mb-3 max-w-md mx-auto leading-relaxed">
                  When your deployment serves a community leaderboard, ranked players will appear in this table.
                </p>
                <p className="text-xs text-slate-500 mb-8 max-w-lg mx-auto leading-relaxed">
                  The card above still shows your wallet’s Arena-related totals from the Intuition indexer (on-chain
                  history), plus any activity XP recorded in this browser—not this empty table.
                </p>
                <Link
                  to="/climb"
                  onClick={playClick}
                  onMouseEnter={playHover}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-black bg-gradient-to-r from-[#00f3ff] via-cyan-300 to-[#ff1e6d] shadow-[0_8px_32px_rgba(0,243,255,0.35)] hover:brightness-110 hover:scale-[1.02] transition-transform"
                >
                  <Zap size={17} strokeWidth={2.2} />
                  Open Arena
                </Link>
              </div>
            ) : (
              <div className="relative z-10 px-4 sm:px-6 lg:px-8 pb-8 pt-4 w-full">
                <div className="overflow-x-auto pb-1 -mx-1 px-1 w-full">
                  <div className="w-full max-w-none min-w-[880px] xl:max-w-none">
                    <div className={`grid ${LB_GRID} gap-x-3 sm:gap-x-5 px-2 sm:px-4 pb-3 pt-2 font-sans items-end border-b border-white/[0.08]`}>
                      <ColHead align="center">Rank</ColHead>
                      <ColHead>Player</ColHead>
                      <ColHead align="right" hint={HINT_LISTS}>
                        Lists
                      </ColHead>
                      <ColHead align="right" hint={HINT_ATOMS}>
                        Atoms
                      </ColHead>
                      <span
                        className="flex items-center justify-end gap-2 uppercase tracking-[0.14em] text-slate-300 font-bold text-[10px] sm:text-[11px] leading-snug text-right"
                        title={HINT_XP}
                      >
                        Total XP
                        <HelpCircle className="shrink-0 opacity-55 text-[#c4b5fd]" size={12} strokeWidth={2} aria-hidden />
                        <ArenaXpToken size={18} className="opacity-95 shrink-0 ml-0.5" aria-hidden />
                      </span>
                    </div>

                    <ul className="flex flex-col gap-2.5 w-full">
                      {players.map((p, i) => {
                        const isYou = myLc === p.address;
                        const rawLab = (p.label || '').trim();
                        const displayLabel = /^0x[a-f0-9]+$/i.test(rawLab) ? shortAddr(rawLab) : rawLab;
                        const accent = rowAccentBorder[i % rowAccentBorder.length];

                        return (
                          <li key={p.address} className="w-full">
                            <div
                              className={`relative grid ${LB_GRID} gap-x-3 sm:gap-x-5 gap-y-2 items-center rounded-[1.35rem] border backdrop-blur-md px-3 py-3 sm:px-4 sm:py-3 transition-all duration-200 hover:border-white/[0.22] hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)] w-full max-w-none ${
                                isYou
                                  ? 'border-[#00f3ff]/50 bg-gradient-to-br from-[#00f3ff]/[0.14] via-white/[0.05] to-[#ff1e6d]/[0.07] shadow-[0_0_40px_rgba(0,243,255,0.12)]'
                                  : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07]'
                              }`}
                              style={
                                isYou
                                  ? {
                                      boxShadow:
                                        'inset 0 1px 0 rgba(255,255,255,0.1), 0 0 32px rgba(0,243,255,0.15)',
                                    }
                                  : {
                                      borderLeft: `4px solid ${accent}`,
                                      boxShadow: `inset 4px 0 24px ${accent}22`,
                                    }
                              }
                            >
                              <div className="flex justify-center">
                                <span
                                  className={`inline-flex h-10 min-w-[2.65rem] items-center justify-center rounded-2xl text-sm font-black tabular-nums px-2 ${
                                    isYou
                                      ? 'bg-gradient-to-br from-amber-300 to-amber-600 text-black shadow-[0_0_20px_rgba(251,191,36,0.35)]'
                                      : 'border border-white/12 bg-black/35 text-slate-200 shadow-inner'
                                  }`}
                                >
                                  #{p.rank}
                                </span>
                              </div>

                              <div className="flex min-w-0 items-center gap-2.5">
                                <div
                                  className="relative shrink-0 h-11 w-11 sm:h-[50px] sm:w-[50px] rounded-2xl overflow-hidden ring-2 ring-white/15 shadow-lg"
                                  style={{
                                    boxShadow: isYou ? `0 0 18px rgba(0,243,255,0.25)` : '0 4px 16px rgba(0,0,0,0.4)',
                                  }}
                                >
                                  {p.image ? (
                                    <img src={p.image} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <div
                                      className="flex h-full w-full items-center justify-center text-[15px] font-black text-white"
                                      style={{
                                        background:
                                          'linear-gradient(145deg, rgba(0,243,255,0.38), rgba(255,30,109,0.28))',
                                      }}
                                    >
                                      {avatarGlyph(displayLabel)}
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-white text-[13px] sm:text-[15px] truncate tracking-tight leading-tight">
                                    {isYou ? (
                                      <span className="inline rounded-lg bg-[#00f3ff]/20 px-2 py-0.5 text-[11px] font-black text-[#00f3ff] mr-1.5 align-middle">
                                        YOU
                                      </span>
                                    ) : null}
                                    <span className="font-bold">{displayLabel}</span>
                                  </p>
                                  <p className="text-[10px] text-slate-500 truncate font-medium mt-0.5">
                                    {shortAddr(p.address)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-end">
                                <span className="text-base sm:text-lg font-black tabular-nums text-fuchsia-100 drop-shadow-[0_0_8px_rgba(217,70,239,0.3)]">
                                  {p.listsPlayed.toLocaleString()}
                                </span>
                              </div>

                              <div className="flex items-center justify-end">
                                <span className="text-base sm:text-lg font-black tabular-nums text-emerald-100 drop-shadow-[0_0_8px_rgba(52,211,153,0.22)]">
                                  {p.atomsRanked.toLocaleString()}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 min-w-0 tabular-nums">
                                <span
                                  className="text-lg sm:text-[1.35rem] font-black tabular-nums bg-clip-text text-transparent bg-gradient-to-br from-amber-200 via-amber-300 to-orange-400 leading-none"
                                  title={`Arena ${p.arenaXp.toLocaleString()} · Activity ${p.activityXp.toLocaleString()}`}
                                >
                                  {inturankLeaderboardTotalXp(p).toLocaleString()}
                                </span>
                                <ArenaXpToken size={22} className="-mr-1" />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {players.length > 0 ? (
            <p className="sr-only">Leaderboard shows up to thirty players from your configured leaderboard source.</p>
          ) : null}
        </>
      )}
    </div>
  );
};

export default IntuRankRankersLeaderboard;
