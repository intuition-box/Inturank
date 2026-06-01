/**
 * Compact Arena leaderboard glance — top 3 + your rank + CTA to full board.
 *
 * Designed to live in the Arena sidebar without competing for attention with
 * the ranking flow. Links out to the full leaderboard at /stats?tab=rankers.
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Trophy, Crown, ArrowUpRight, Award, Sparkles, Loader2 } from 'lucide-react';
import { inturankLeaderboardTotalXp, type ArenaPlayerRow } from '../services/arenaLeaderboard';
import { playArenaUiClick, playArenaUiHover } from '../services/audio';
import { ARENA_THEME } from '../services/arenaUiTheme';

const CY = ARENA_THEME.cyan;
const GOLD = ARENA_THEME.gold;
const RED = ARENA_THEME.red;
const SILVER = '#cbd5e1';
const BRONZE = '#fb923c';

type Props = {
  players: ArenaPlayerRow[];
  loading: boolean;
  myAddress?: string;
  /** Indexed Arena XP (graph / leaderboard mirror). */
  myArenaXp: number;
  /** Protocol activity XP ledger on this browser only. */
  myActivityXp: number;
  /** `light` matches Climb contest blueprint shell; default keeps legacy Arena sidebar. */
  tone?: 'dark' | 'light';
};

function avatarGlyph(label: string): string {
  const t = (label || '').trim();
  const m = /[a-zA-Z0-9]/.exec(t);
  return m ? m[0].toUpperCase() : '?';
}

const ArenaLeaderboardGlance: React.FC<Props> = ({
  players,
  loading,
  myAddress,
  myArenaXp,
  myActivityXp,
  tone = 'dark',
}) => {
  const reduceMotion = useReducedMotion();
  const myAddrLc = myAddress?.toLowerCase();
  const isLight = tone === 'light';

  /**
   * Subgraph attribution lags real-time Arena stakes (and FeeProxy batches need re-attribution).
   * Inject an optimistic "you" row whenever the viewer has earned Arena XP locally so the board
   * reflects the just-completed batch instead of the empty "Be the first ranker" splash.
   */
  const augmentedPlayers = useMemo<ArenaPlayerRow[]>(() => {
    const sortRanked = (rows: ArenaPlayerRow[]) =>
      [...rows]
        .sort((a, b) => inturankLeaderboardTotalXp(b) - inturankLeaderboardTotalXp(a))
        .map((m, i) => ({ ...m, rank: i + 1 }));

    const bridgeViewer = (rows: ArenaPlayerRow[]) => {
      if (!myAddrLc) return rows;
      return rows.map((p) =>
        p.address === myAddrLc
          ? {
              ...p,
              arenaXp: Math.max(p.arenaXp, myArenaXp),
              activityXp: Math.max(p.activityXp, myActivityXp),
            }
          : p,
      );
    };

    const myTotal = inturankLeaderboardTotalXp({ arenaXp: myArenaXp, activityXp: myActivityXp, giftXp: 0 });
    if (!myAddrLc) return players;

    const exists = players.some((p) => p.address === myAddrLc);
    if (exists) return sortRanked(bridgeViewer(players));

    if (myTotal <= 0) return players;

    const synthetic: ArenaPlayerRow = {
      rank: 0,
      address: myAddrLc,
      label: 'You',
      arenaXp: myArenaXp,
      activityXp: myActivityXp,
      giftXp: 0,
      duels: 0,
      atomsRanked: 0,
      listsPlayed: 0,
      updatedAt: 0,
    };
    return sortRanked(bridgeViewer([...players, synthetic]));
  }, [players, myAddrLc, myArenaXp, myActivityXp]);

  const myRow = useMemo(
    () => (myAddrLc ? augmentedPlayers.find((p) => p.address === myAddrLc) ?? null : null),
    [augmentedPlayers, myAddrLc],
  );
  /** Same totals as Climb uplink badge (`max(indexer, device pick credit)` + activity). */
  const youArenaXp = myArenaXp;
  const youActivityXp = myActivityXp;
  const top3 = augmentedPlayers.slice(0, 3);

  return (
    <Link
      to="/stats?tab=rankers"
      onClick={playArenaUiClick}
      onMouseEnter={playArenaUiHover}
      className={`group block rounded-3xl border overflow-hidden transition-all duration-300 ${
        isLight
          ? 'border-slate-200/90 bg-white shadow-sm hover:border-intuition-primary/80 hover:shadow-md hover:-translate-y-0.5'
          : 'border-white/[0.1] hover:border-intuition-warning/40 hover:shadow-[0_0_28px_rgba(251,191,36,0.12),0_0_32px_rgba(248,113,113,0.1)] hover:-translate-y-0.5'
      }`}
      style={
        isLight
          ? undefined
          : {
              background:
                'linear-gradient(165deg, rgba(14,12,10,0.97) 0%, rgba(5,6,8,0.99) 48%, rgba(20,12,18,0.94) 100%)',
              boxShadow:
                '0 0 0 1px rgba(251,191,36,0.08), 0 16px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 36px rgba(56,232,255,0.05), 0 0 32px rgba(248,113,113,0.05)',
            }
      }
    >
      {/* Header */}
      <div
        className={`relative px-3.5 pt-3 pb-2.5 border-b ${isLight ? 'border-slate-100 bg-intuition-primary/60' : 'border-white/[0.06]'}`}
      >
        {!isLight ? (
          <div
            className="absolute inset-0 opacity-[0.4] pointer-events-none"
            style={{
              background: `linear-gradient(135deg, ${GOLD}14 0%, transparent 45%, ${RED}08 100%)`,
            }}
            aria-hidden
          />
        ) : null}
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border ${
                isLight ? 'border-intuition-primary bg-white' : ''
              }`}
              style={
                isLight
                  ? undefined
                  : { borderColor: `${CY}55`, background: `linear-gradient(135deg, ${CY}22, ${ARENA_THEME.gold}18)` }
              }
            >
              <Trophy size={14} style={{ color: isLight ? '#0369a1' : CY }} strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <p
                className={`text-[9px] font-mono uppercase tracking-[0.28em] font-bold leading-none ${
                  isLight ? 'text-intuition-primary/90' : 'text-intuition-warning/90'
                }`}
              >
                IntuRank �/ Rankers
              </p>
              <p
                className={`text-[11px] font-bold leading-tight mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}
              >
                Live leaderboard
              </p>
            </div>
          </div>
          <ArrowUpRight
            size={15}
            className={`shrink-0 transition-all ${
              isLight
                ? 'text-slate-400 group-hover:text-intuition-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5'
                : 'text-slate-500 group-hover:text-intuition-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5'
            }`}
          />
        </div>
      </div>

      {/* Top 3 horizontal strip */}
      <div className="px-3.5 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-6 gap-2">
            <Loader2 size={14} className={`animate-spin ${isLight ? 'text-intuition-primary' : 'text-intuition-warning'}`} />
            <span className={`text-[10px] font-mono uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              Loading
            </span>
          </div>
        ) : top3.length === 0 ? (
          <div className="text-center py-4 px-2">
            <Sparkles size={18} style={{ color: isLight ? '#0369a1' : CY }} className="mx-auto mb-1.5" />
            <p className={`text-[11px] font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Be the first ranker</p>
            <p className={`text-[10px] mt-0.5 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
              Vote on a list to enter the board.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {[1, 0, 2].map((idx, slotI) => {
              const p = top3[idx];
              if (!p) return <div key={idx} aria-hidden />;
              const isFirst = idx === 0;
              const slotColor = idx === 0 ? GOLD : idx === 1 ? SILVER : BRONZE;
              const isYou = myAddrLc && p.address === myAddrLc;

              return (
                <motion.div
                  key={p.address}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: slotI * 0.05 }}
                  className={`flex flex-col items-center min-w-0 ${isFirst ? '-mt-1' : 'mt-1.5'}`}
                >
                  <div className="relative mb-1">
                    {isFirst && (
                      <Crown
                        size={11}
                        className="absolute -top-3 left-1/2 -translate-x-1/2"
                        style={{ color: GOLD, filter: `drop-shadow(0 0 6px ${GOLD}80)` }}
                      />
                    )}
                    <div
                      className="rounded-full p-[2px]"
                      style={{
                        background: `linear-gradient(135deg, ${slotColor}, ${slotColor}88)`,
                        boxShadow: `0 0 12px ${slotColor}45`,
                      }}
                    >
                      <div className={`${isFirst ? 'w-10 h-10' : 'w-8 h-8'} rounded-full overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-[#040810]'}`}>
                        {p.image ? (
                          <img src={p.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div
                            className={`w-full h-full flex items-center justify-center text-xs font-black ${isLight ? 'text-intuition-primary' : 'text-intuition-primary/90'}`}
                          >
                            {avatarGlyph(p.label)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                      style={{
                        background: slotColor,
                        color: '#020308',
                        boxShadow: `0 0 0 1.5px #020308`,
                      }}
                    >
                      {idx + 1}
                    </div>
                  </div>
                  <p
                    className="text-[10px] font-bold truncate w-full text-center"
                    style={{ color: isYou ? CY : isLight ? '#0f172a' : '#e2e8f0' }}
                    title={p.label}
                  >
                    {p.label}
                  </p>
                  <span
                    className="text-[10px] font-black tabular-nums leading-none mt-0.5"
                    style={{
                      color: slotColor,
                      textShadow: isLight ? 'none' : `0 0 8px ${slotColor}50`,
                    }}
                  >
                    {inturankLeaderboardTotalXp(p).toLocaleString()}
                  </span>
                  <span className={`text-[7px] font-mono font-bold uppercase tracking-wider mt-1 leading-none ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                    Total XP
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* You row */}
      {myAddrLc && (
        <div className="px-3.5 pb-3">
          <div
            className="rounded-xl border px-3 py-2 flex items-center justify-between gap-2"
            style={
              myRow
                ? isLight
                  ? {
                      borderColor: `${CY}35`,
                      background: `linear-gradient(135deg, ${CY}08, #f8fafc)`,
                      boxShadow: `0 0 12px ${CY}10`,
                    }
                  : {
                      borderColor: `${CY}40`,
                      background: `linear-gradient(135deg, ${CY}10, rgba(8,12,22,0.95))`,
                      boxShadow: `0 0 16px ${CY}14`,
                    }
                : isLight
                  ? {
                      borderColor: 'rgba(148,163,184,0.35)',
                      background: 'rgba(248,250,252,0.9)',
                    }
                  : {
                      borderColor: 'rgba(148,163,184,0.20)',
                      background: 'rgba(255,255,255,0.02)',
                    }
            }
          >
            <div className="min-w-0">
              <p
                className={`text-[9px] font-mono uppercase tracking-[0.25em] font-bold ${isLight ? 'text-intuition-primary' : 'text-intuition-primary/90'}`}
              >
                You
              </p>
              {myRow ? (
                  <p className={`text-[12px] font-bold leading-tight mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Rank{' '}
                    <span
                      className="text-base font-black tabular-nums ml-0.5"
                      style={{ color: CY, textShadow: isLight ? 'none' : `0 0 10px ${CY}40` }}
                    >
                      #{myRow.rank}
                    </span>
                    <span className={`font-normal text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}> �/ {augmentedPlayers.length}</span>
                  </p>
              ) : (
                <p className={`text-[11px] leading-tight mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                  {youArenaXp > 0 || youActivityXp > 0 ? 'Not on board yet' : 'Vote to enter'}
                </p>
              )}
            </div>
            <div className="text-right shrink-0 space-y-1.5 tabular-nums">
              <div title="Arena XP — indexer plus device pick credit until the graph catches up (matches Climb uplink).">
                <p className={`text-[8px] font-mono uppercase tracking-wider font-bold leading-none ${isLight ? 'text-intuition-primary/90' : 'text-intuition-primary/85'}`}>Arena</p>
                <p
                  className="text-base font-black leading-none mt-0.5"
                  style={{ color: GOLD, textShadow: isLight ? 'none' : `0 0 8px ${GOLD}40` }}
                >
                  {youArenaXp.toLocaleString()}
                </p>
              </div>
              <div title="Activity XP — this browser for you; others from API mirror when deployed.">
                <p className={`text-[8px] font-mono uppercase tracking-wider font-bold leading-none ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Activity</p>
                <p className={`text-sm font-black leading-none mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{youActivityXp.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer CTA */}
      <div
        className={`px-3.5 py-2.5 border-t flex items-center justify-between gap-2 ${
          isLight ? 'border-slate-100 bg-slate-50/80' : 'border-white/[0.06]'
        }`}
        style={isLight ? undefined : { background: `linear-gradient(90deg, ${ARENA_THEME.gold}08, ${CY}06)` }}
      >
        <span className={`text-[10px] font-bold inline-flex items-center gap-1.5 ${isLight ? 'text-intuition-primary' : 'text-intuition-primary'}`}>
          <Award size={11} />
          Full board �/ stats �/ streaks
        </span>
        <span
          className={`text-[10px] font-black uppercase tracking-widest transition-colors inline-flex items-center gap-1 ${
            isLight ? 'text-intuition-primary group-hover:text-slate-900' : 'text-intuition-primary group-hover:text-white'
          }`}
        >
          Open
          <ArrowUpRight size={11} className="group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </Link>
  );
};

export default ArenaLeaderboardGlance;
