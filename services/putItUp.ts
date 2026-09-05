/**
 * Put it up — turn a plain sentence into a claim the graph can hold.
 *
 * Artboards 2k and 4e. The framing is deliberate: a person is asking the crowd something,
 * not "minting a triple". The protocol vocabulary never appears before the review step.
 *
 * A claim is subject → predicate → object, and each of the three is itself an atom that may
 * or may not already exist. Telling someone which parts are new — and that creating them
 * puts them on the graph for everyone — is what makes the cost line make sense.
 */
import { parseEther } from 'viem';
import { generateSimpleLlmCompletion } from './skillLlm';
import { searchGlobalAgents } from './graphql';
import { getAtomCreationCost, getTotalTripleCreationCost, getMinClaimDeposit } from './web3';

export type PartRole = 'subject' | 'predicate' | 'object';

export interface ClaimPart {
  role: PartRole;
  text: string;
  /** Term id when this part already exists on the graph. */
  termId?: string;
  exists: boolean;
}

export interface ProposedClaim {
  parts: ClaimPart[];
  /** The original sentence, kept so the review step can show what was typed. */
  source: string;
}

export interface ClaimCost {
  newThings: number;
  newThingsTrust: number;
  claimTrust: number;
  openingStake: number;
  total: number;
}

/**
 * Ask the model to split a sentence into the three parts. Kept deliberately strict: it is a
 * parsing job, not a creative one, and anything it invents becomes something a person pays
 * real TRUST to put on a public graph.
 */
const PROMPT = (sentence: string) => `Split this statement into exactly three parts for a subject-predicate-object claim.

Statement: "${sentence}"

Rules:
- subject: the thing the statement is about, as a short proper noun phrase.
- predicate: the relationship, as a short verb phrase. No leading or trailing articles.
- object: what the subject relates to.
- Keep the wording close to the original. Do not add facts, qualifiers or opinions.
- Reply with ONLY minified JSON: {"subject":"...","predicate":"...","object":"..."}`;

function extractJson(text: string): { subject?: string; predicate?: string; object?: string } | null {
  // Models like to wrap JSON in prose or fences; take the first balanced object.
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** Does an atom with this exact label already exist? Case-insensitive, most-backed wins. */
async function findExisting(label: string): Promise<string | undefined> {
  const t = label.trim();
  if (!t) return undefined;
  try {
    const hits = await searchGlobalAgents(t);
    const exact = (hits ?? []).filter((h) => (h.label ?? '').trim().toLowerCase() === t.toLowerCase());
    if (exact.length === 0) return undefined;
    // Prefer the one the crowd has actually backed, not just the first row.
    exact.sort((a, b) => Number(b.marketCap ?? 0) - Number(a.marketCap ?? 0));
    return exact[0].id;
  } catch {
    return undefined;
  }
}

/** Resolve which of the three parts already exist on the graph. */
export async function resolveParts(
  subject: string,
  predicate: string,
  object: string,
  source = '',
): Promise<ProposedClaim> {
  const entries: Array<[PartRole, string]> = [
    ['subject', subject],
    ['predicate', predicate],
    ['object', object],
  ];
  const parts = await Promise.all(
    entries.map(async ([role, text]) => {
      const termId = await findExisting(text);
      return { role, text: text.trim(), termId, exists: !!termId } as ClaimPart;
    }),
  );
  return { parts, source };
}

/**
 * Parse a sentence into a proposed claim. Throws with a readable message when no model is
 * configured or the reply cannot be parsed — the caller falls back to the manual path,
 * which the design already offers as "Build it myself".
 */
export async function proposeClaim(sentence: string): Promise<ProposedClaim> {
  const s = sentence.trim();
  if (!s) throw new Error('Say what you want to ask the crowd.');

  const { text } = await generateSimpleLlmCompletion(PROMPT(s));
  const parsed = extractJson(text);
  if (!parsed?.subject || !parsed?.predicate || !parsed?.object) {
    throw new Error('Could not split that into a claim. Try building it yourself.');
  }
  return resolveParts(parsed.subject, parsed.predicate, parsed.object, s);
}

/**
 * What this will cost, in TRUST. Every figure comes from the protocol rather than a
 * constant, because atom and triple creation costs are chain state and quoting a stale
 * number on a screen that spends real money is worse than showing nothing.
 */
export async function quoteClaim(claim: ProposedClaim, openingStake: number): Promise<ClaimCost> {
  const newParts = claim.parts.filter((p) => !p.exists);

  let newThingsTrust = 0;
  if (newParts.length > 0) {
    try {
      const minDeposit = await getMinClaimDeposit();
      const each = await getAtomCreationCost({ name: newParts[0].text }, minDeposit);
      newThingsTrust = Number(each) / 1e18 * newParts.length;
    } catch {
      newThingsTrust = 0;
    }
  }

  let claimTrust = 0;
  try {
    claimTrust = Number(await getTotalTripleCreationCost(String(openingStake)));
  } catch {
    claimTrust = 0;
  }

  return {
    newThings: newParts.length,
    newThingsTrust,
    claimTrust,
    openingStake,
    total: newThingsTrust + claimTrust,
  };
}

/** Suggested opening stake, taken from the protocol floor rather than guessed. */
export async function suggestedOpeningStake(): Promise<number> {
  try {
    return Math.max(1, Number(await getMinClaimDeposit()));
  } catch {
    return 1;
  }
}

/** Wei helper so callers do not repeat the conversion. */
export const toWei = (trust: number) => parseEther(String(trust));
