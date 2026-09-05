/**
 * Arena core types — the shared vocabulary for anything rankable.
 *
 * These lived inside `pages/RankedList.tsx` and were imported from there by 16 services and
 * components, which made a page the root of the dependency graph and created a cycle with
 * `arenaListsRegistry`. They are declared here instead so the Arena UI can be replaced
 * without breaking everything that merely needs to describe a rankable item.
 *
 * This module is a LEAF: it imports nothing. Keep it that way.
 */

/** Contest flavour — drives copy, sorting and card treatment for a list. */
export type ArenaTheme = 'claims' | 'narratives' | 'tokens' | 'passion' | 'atoms' | 'identities';

export type RankItemKind = 'claim' | 'atom' | 'token';

/** One rankable card: an atom, a token, or a claim drawn from the graph. */
export interface RankItem {
  id: string;
  kind: RankItemKind;
  label: string;
  subtitle?: string;
  image?: string;
  /** Object / right side of a head-to-head claim (subject image stays in `image`). */
  imageSecondary?: string;
  /** Short labels for vs hero when an image is missing. */
  versusLeftLabel?: string;
  versusRightLabel?: string;
  /** Same-kind pairing: e.g. person vs person, claim-vs vs claim-vs */
  pairKind: string;
}

export type ArenaRound = {
  kind: 'yesno';
  /** Several stance cards at once (prediction-market grid). */
  items: RankItem[];
};
