import React, { useMemo, useState } from 'react';
import { ChevronDown, Copy, Loader2, Users } from 'lucide-react';
import type { ArenaComparePeer } from '../../services/arenaSimilarity';
import { communityRankingsFromPeers, peerDisplayLabel } from '../../services/arenaRankingRemix';
import { enrichPeersWithPool } from '../../services/arenaRankingEnrich';
import type { RankItem } from '../../services/arenaTypes';
import { playArenaUiClick, playArenaUiHover } from '../../services/audio';
import { CURRENCY_SYMBOL } from '../../constants';
import { deckPalette, type DeckPaletteEntry } from '../../services/arenaCardDesign';
import { ArenaPortraitImg } from './ArenaPortraitImg';

type Props = {
  listTitle: string;
  listCategory?: string;
  peers: ArenaComparePeer[];
  loading: boolean;
  myAddress?: string | null;
  onAdopt: (peer: ArenaComparePeer) => void;
  /** List pool for portraits / labels on ranking rows. */
  previewPool?: RankItem[];
  /** Compact strip above curate; full panel on rank/compare. */
  variant?: 'curate' | 'panel';
};

export const ArenaCommunityDecks: React.FC<Props> = ({
  listTitle,
  listCategory,
  peers,
  loading,
  myAddress,
  onAdopt,
  previewPool = [],
  variant = 'panel',
}) => {
  const deck = useMemo(() => deckPalette(listCategory), [listCategory]);
  const community = useMemo(
    () => communityRankingsFromPeers(enrichPeersWithPool(peers, previewPool)),
    [peers, previewPool],
  );
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [previewPeer, setPreviewPeer] = useState<ArenaComparePeer | null>(null);

  const isCurate = variant === 'curate';

  if (loading && community.length === 0) {
    return (
      <div
        className={`rounded-2xl border px-4 py-5 ${isCurate ? 'mb-4' : 'mb-6'}`}
        style={{ borderColor: `${deck.hex}33`, background: `${deck.hex}08` }}
      >
        <div className="flex items-center gap-3 text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin shrink-0" style={{ color: deck.hex }} />
          <p className="text-sm font-medium">Loading community rankings from the graph…</p>
        </div>
      </div>
    );
  }

  if (community.length === 0) {
    if (isCurate) {
      return (
        <div
          className="mb-4 rounded-xl border border-dashed border-white/10 bg-black/25 px-4 py-3 text-center"
        >
          <p className="text-xs text-slate-500">
            No published community rankings on this list yet — curate your own deck, or check back later.
          </p>
        </div>
      );
    }
    return (
      <div
        className="mb-6 rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-5 text-center"
      >
        <p className="text-sm text-slate-400">No published rankings on this list yet. Be the first to rank.</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border ${isCurate ? 'mb-4' : 'mb-6'}`}
      style={{
        borderColor: `${deck.hex}40`,
        background: `linear-gradient(165deg, ${deck.hex}12 0%, rgba(0,0,0,0.45) 55%)`,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08] px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <p
            className="font-mono text-[10px] font-black uppercase tracking-[0.22em]"
            style={{ color: deck.hex }}
          >
            Community decks
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            Browse rankings before you play
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Remix someone&apos;s stack on <span className="text-slate-200">{listTitle}</span>, then edit stakes.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-slate-300">
          <Users className="h-3.5 w-3.5 opacity-80" />
          {community.length} live
        </span>
      </div>

      <ul className={`divide-y divide-white/[0.06] ${isCurate ? 'max-h-[280px] overflow-y-auto' : ''}`}>
        {community.slice(0, isCurate ? 6 : 12).map((peer) => (
          <CommunityRow
            key={peer.player.address}
            peer={peer}
            deck={deck}
            expanded={expandedWallet === peer.player.address}
            onToggle={() => {
              playArenaUiClick();
              setExpandedWallet((w) =>
                w === peer.player.address ? null : peer.player.address,
              );
            }}
            onPreview={() => {
              playArenaUiClick();
              setPreviewPeer(peer);
              setExpandedWallet(peer.player.address);
            }}
            onAdopt={() => {
              playArenaUiClick();
              onAdopt(peer);
            }}
            isSelf={
              Boolean(myAddress) &&
              peer.player.address.toLowerCase() === myAddress!.toLowerCase()
            }
          />
        ))}
      </ul>

      {previewPeer ? (
        <PreviewStrip peer={previewPeer} deck={deck} onClose={() => setPreviewPeer(null)} />
      ) : null}
    </div>
  );
};

const CommunityRow: React.FC<{
  peer: ArenaComparePeer;
  deck: DeckPaletteEntry;
  expanded: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onAdopt: () => void;
  isSelf: boolean;
}> = ({ peer, deck, expanded, onToggle, onPreview, onAdopt, isSelf }) => {
  const name = peerDisplayLabel(peer.player);
  const top = peer.listRanking.slice(0, 4);

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 bg-[#070a10]"
          style={{ borderColor: deck.line }}
        >
          <ArenaPortraitImg src={undefined} className="h-full w-full object-cover" loading="lazy">
            <span className="font-display text-sm font-black text-slate-400">
              {name.slice(0, 1).toUpperCase()}
            </span>
          </ArenaPortraitImg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{name}</p>
          <p className="text-[11px] text-slate-400">
            {peer.listRanking.length} picks ranked on-chain
          </p>
        </div>
        {!isSelf ? (
          <button
            type="button"
            onClick={onAdopt}
            onMouseEnter={() => playArenaUiHover()}
            className="shrink-0 rounded-xl px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wide transition-[filter] hover:brightness-110"
            style={{ background: deck.hex, color: deck.contrastText }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              Adopt
            </span>
          </button>
        ) : (
          <span className="text-[10px] font-mono uppercase text-slate-500">You</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/35 p-3">
          <ol className="space-y-1.5">
            {peer.listRanking.map((row) => (
              <li key={row.subjectId} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-slate-200">
                  <span className="font-mono text-xs font-bold tabular-nums" style={{ color: deck.hex }}>
                    #{row.rank}
                  </span>{' '}
                  {row.label}
                </span>
                <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-slate-300">
                  {row.trustLabel !== '—' ? (
                    <>
                      {row.trustLabel} {CURRENCY_SYMBOL}
                    </>
                  ) : row.support ? (
                    'Yes'
                  ) : (
                    'Pass'
                  )}
                </span>
              </li>
            ))}
          </ol>
          {!isSelf ? (
            <button
              type="button"
              onClick={onAdopt}
              className="mt-3 w-full rounded-lg border border-dashed py-2 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-slate-300 hover:text-white"
              style={{ borderColor: `${deck.hex}55` }}
            >
              Adopt this ranking
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {top.map((row) => (
            <span
              key={row.subjectId}
              className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-slate-300"
            >
              #{row.rank} {row.label}
            </span>
          ))}
          {peer.listRanking.length > 4 ? (
            <button
              type="button"
              onClick={onPreview}
              className="text-[10px] font-mono text-slate-500 underline"
            >
              +{peer.listRanking.length - 4} more
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
};

const PreviewStrip: React.FC<{
  peer: ArenaComparePeer;
  deck: DeckPaletteEntry;
  onClose: () => void;
}> = ({ peer, onClose }) => (
  <div className="border-t border-white/[0.08] px-4 py-2 text-center">
    <button type="button" onClick={onClose} className="text-[10px] font-mono text-slate-500 hover:text-slate-300">
      Close preview · {peerDisplayLabel(peer)}
    </button>
  </div>
);
