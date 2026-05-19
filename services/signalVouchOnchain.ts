/**
 * Phase D — flush queued Signal vouches as one FeeProxy `createTriples` batch.
 * Triple shape: (your Account atom) — vouches for → (target Account or Thing atom).
 */
import { getAddress, isAddress, parseEther } from 'viem';
import type { SignalVouchPick } from './signalPendingBatch';
import {
    createSemanticTriplesBatch,
    isTermCreatedOnChain,
    looksLikeBytes32TermId,
    padTermId,
    resolveAtomReferenceToTermId,
    type SemanticTripleBatchInput,
} from './web3';

const VOUCH_PREDICATE = 'vouches for';

export async function submitSignalVouchesOnChain(
    wallet: string,
    picks: SignalVouchPick[],
    depositTrust: string,
    onProgress?: (m: string) => void,
): Promise<`0x${string}`> {
    if (!picks.length) throw new Error('No vouches to submit.');

    const receiver = getAddress(String(wallet).trim() as `0x${string}`);
    const dep = parseEther(depositTrust.trim());

    onProgress?.('Resolving your account atom…');
    const subj = await resolveAtomReferenceToTermId(receiver, depositTrust, receiver, onProgress);

    onProgress?.('Resolving predicate atom…');
    const pred = await resolveAtomReferenceToTermId(VOUCH_PREDICATE, depositTrust, receiver, onProgress);

    const triples: SemanticTripleBatchInput[] = [];
    const objectResolved = new Map<string, `0x${string}`>();

    for (let i = 0; i < picks.length; i++) {
        const p = picks[i]!;
        onProgress?.(`Resolving vouch ${i + 1} / ${picks.length} — ${p.label.slice(0, 32)}…`);

        let cacheKey: string;
        if (p.objectTermId && looksLikeBytes32TermId(p.objectTermId.trim())) {
            cacheKey = `t:${padTermId(p.objectTermId.trim()).toLowerCase()}`;
        } else if (p.objectWalletRef && isAddress(p.objectWalletRef.trim())) {
            cacheKey = `w:${getAddress(p.objectWalletRef.trim() as `0x${string}`).toLowerCase()}`;
        } else {
            cacheKey = `l:${p.label.trim().toLowerCase()}`;
        }

        const cached = objectResolved.get(cacheKey);
        let objectTermId: `0x${string}`;
        if (cached) {
            objectTermId = cached;
        } else if (p.objectTermId && looksLikeBytes32TermId(p.objectTermId.trim())) {
            const tid = padTermId(p.objectTermId.trim());
            if (!(await isTermCreatedOnChain(tid))) {
                throw new Error(
                    `${p.label} — atom not on-chain yet. Open the market page or wait for indexer sync.`,
                );
            }
            objectTermId = tid;
            objectResolved.set(cacheKey, objectTermId);
        } else if (p.objectWalletRef && isAddress(p.objectWalletRef.trim())) {
            const o = await resolveAtomReferenceToTermId(
                getAddress(p.objectWalletRef.trim() as `0x${string}`),
                depositTrust,
                receiver,
                onProgress,
            );
            objectTermId = o.termId;
            objectResolved.set(cacheKey, objectTermId);
        } else {
            const o = await resolveAtomReferenceToTermId(p.label.trim(), depositTrust, receiver, onProgress);
            objectTermId = o.termId;
            objectResolved.set(cacheKey, objectTermId);
        }

        triples.push({
            subjectId: subj.termId,
            predicateId: pred.termId,
            objectId: objectTermId,
            assetsWei: dep,
        });
    }

    onProgress?.(`Broadcasting ${triples.length} vouch claim${triples.length === 1 ? '' : 's'}…`);
    return createSemanticTriplesBatch(triples, receiver, onProgress);
}
