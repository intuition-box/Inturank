/**
 * Put it up — ask the crowd something. Artboards 2k (mobile) and 4e (desktop).
 *
 * Framed as posing a question, never as "minting a triple"; protocol vocabulary appears
 * only at the review step. Two ways in, both from the design: describe it in a sentence and
 * let the agent split it, or build the three parts yourself.
 *
 * Nothing is created until the final signature, and the screen says so.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sparkles, PencilLine, ChevronLeft } from 'lucide-react';
import {
  proposeClaim,
  resolveParts,
  quoteClaim,
  suggestedOpeningStake,
  type ProposedClaim,
  type ClaimCost,
} from '../services/putItUp';
import { resolveAtomReferenceToTermId, createSemanticTriple, getConnectedAccount, parseProtocolError } from '../services/web3';
import { notifyProtocolXpEarned } from '../services/protocolXp';
import { stack, riser, press, spring } from '../services/motion';
import { toast } from '../components/Toast';

const M = motion;

type Mode = 'describe' | 'manual';
type Step = 'compose' | 'review' | 'signing' | 'done';

const PartRow: React.FC<{ role: string; text: string; exists: boolean }> = ({ role, text, exists }) => (
  <div className="flex items-center gap-3 border-b border-hairline-soft px-3.5 py-3 last:border-b-0">
    <span className="w-[70px] shrink-0 text-[9px] font-bold uppercase tracking-wider text-ink-muted">{role}</span>
    <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">{text}</span>
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 font-display text-[9px] font-black uppercase tracking-wider ${
        exists ? 'bg-surface-2 text-ink-muted' : 'bg-primary-fill text-bg'
      }`}
    >
      {exists ? 'Exists' : 'New'}
    </span>
  </div>
);

const PutItUp: React.FC = () => {
  const [mode, setMode] = useState<Mode>('describe');
  const [step, setStep] = useState<Step>('compose');
  const [sentence, setSentence] = useState('');
  const [manual, setManual] = useState({ subject: '', predicate: '', object: '' });
  const [claim, setClaim] = useState<ProposedClaim | null>(null);
  const [cost, setCost] = useState<ClaimCost | null>(null);
  const [stake, setStake] = useState(1);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    void getConnectedAccount().then(setWallet).catch(() => setWallet(null));
    void suggestedOpeningStake().then(setStake);
  }, []);

  const compose = useCallback(async () => {
    setBusy(true);
    try {
      const proposed =
        mode === 'describe'
          ? await proposeClaim(sentence)
          : await resolveParts(manual.subject, manual.predicate, manual.object, '');
      setClaim(proposed);
      setCost(await quoteClaim(proposed, stake));
      setStep('review');
    } catch (e: any) {
      toast.error(e?.message || 'Could not build that claim.');
    } finally {
      setBusy(false);
    }
  }, [mode, sentence, manual, stake]);

  /** Resolve-or-create each part, then create the claim itself. */
  const sign = useCallback(async () => {
    if (!claim || !wallet) {
      toast.info('Connect a wallet to put this up.');
      return;
    }
    setStep('signing');
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const part of claim.parts) {
        setProgress(part.exists ? `Found ${part.text}` : `Creating ${part.text}…`);
        const { termId } = await resolveAtomReferenceToTermId(
          part.termId ?? part.text,
          String(stake),
          wallet,
        );
        ids.push(termId);
      }
      setProgress('Creating the claim…');
      const res: any = await createSemanticTriple(ids[0], ids[1], ids[2], String(stake), wallet);
      notifyProtocolXpEarned({
        address: wallet,
        reasonKey: 'create_claim',
        txHash: res?.hash,
      });
      toast.success('It is on the graph. People can back it now.');
      setStep('done');
    } catch (e) {
      toast.error(parseProtocolError(e));
      setStep('review');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, [claim, wallet, stake]);

  const canCompose =
    mode === 'describe'
      ? sentence.trim().length > 8
      : manual.subject.trim() && manual.predicate.trim() && manual.object.trim();

  return (
    <M.div
      variants={stack()}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-2xl px-4 pt-6 sm:px-6"
    >
      {step !== 'compose' && (
        <M.button
          variants={riser()}
          onClick={() => setStep('compose')}
          className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" /> Edit the wording
        </M.button>
      )}

      <M.h1 variants={riser()} className="font-display text-[28px] font-black leading-[1.05] tracking-tight text-ink">
        Ask the crowd something.
      </M.h1>
      <M.p variants={riser()} className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-muted">
        Say it plainly. We turn it into a claim the graph can hold and money can move on.
      </M.p>

      <AnimatePresence mode="wait">
        {step === 'compose' && (
          <M.div key="compose" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.card}>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {([
                { m: 'describe' as Mode, label: 'Describe it', icon: Sparkles },
                { m: 'manual' as Mode, label: 'Build it myself', icon: PencilLine },
              ]).map(({ m, label, icon: Icon }) => (
                <M.button
                  key={m}
                  whileTap={press}
                  onClick={() => setMode(m)}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-3 font-display text-sm font-extrabold ${
                    mode === m ? 'border-primary-ink bg-primary-fill text-bg' : 'border-border text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </M.button>
              ))}
            </div>

            {mode === 'describe' ? (
              <div className="mt-4">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  What you want to ask
                </label>
                <textarea
                  value={sentence}
                  onChange={(e) => setSentence(e.target.value)}
                  rows={3}
                  placeholder="the pharmacy on Wells Street actually has stock when the app says it does"
                  className="w-full resize-none rounded-2xl border border-border bg-surface p-3.5 text-[15px] leading-snug text-ink outline-none placeholder:text-ink-muted focus:border-primary-ink"
                />
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                {(['subject', 'predicate', 'object'] as const).map((k) => (
                  <div key={k}>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                      {k}
                    </label>
                    <input
                      value={manual[k]}
                      onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))}
                      placeholder={
                        k === 'subject' ? 'Wells Street Pharmacy' : k === 'predicate' ? 'keeps its stock accurate' : 'in the NHS app'
                      }
                      className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-[14px] text-ink outline-none placeholder:text-ink-muted focus:border-primary-ink"
                    />
                  </div>
                ))}
              </div>
            )}

            <M.button
              whileTap={press}
              onClick={compose}
              disabled={!canCompose || busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-fill py-3.5 font-display text-sm font-extrabold text-bg disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              See what it would create
            </M.button>
          </M.div>
        )}

        {(step === 'review' || step === 'signing') && claim && (
          <M.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.card} className="mt-5">
            {claim.source && (
              <div className="mb-3 rounded-xl border border-border bg-surface-2 px-3.5 py-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-ink-muted">What you typed</p>
                <p className="mt-1 text-[13px] italic text-ink">&ldquo;{claim.source}&rdquo;</p>
              </div>
            )}

            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">Proposed claim</p>
            <div className="rounded-2xl border border-border bg-surface">
              {claim.parts.map((p) => (
                <PartRow key={p.role} role={p.role} text={p.text} exists={p.exists} />
              ))}
            </div>

            {cost && cost.newThings > 0 && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                {cost.newThings === 1 ? 'One part does' : `${cost.newThings} of the three parts do`} not exist yet.
                Creating {cost.newThings === 1 ? 'it puts it' : 'them puts them'} on the graph for everyone.
              </p>
            )}

            {cost && (
              <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">What it costs</p>
                <dl className="flex flex-col gap-1.5 text-[13px]">
                  {cost.newThings > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">
                        {cost.newThings} new {cost.newThings === 1 ? 'thing' : 'things'}
                      </dt>
                      <dd className="tabular-nums text-ink">{cost.newThingsTrust.toFixed(4)} TRUST</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">The claim itself</dt>
                    <dd className="tabular-nums text-ink">{cost.claimTrust.toFixed(4)} TRUST</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-muted">Your opening stake</dt>
                    <dd className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={stake}
                        onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-right text-[13px] tabular-nums text-ink outline-none focus:border-primary-ink"
                      />
                      <span className="text-[11px] text-ink-muted">TRUST</span>
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <dt className="font-display font-extrabold text-ink">Total</dt>
                    <dd className="font-display font-extrabold tabular-nums text-ink">
                      {(cost.newThingsTrust + cost.claimTrust).toFixed(4)} TRUST
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <M.button
              whileTap={press}
              onClick={sign}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-fill py-3.5 font-display text-sm font-extrabold text-bg disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? progress || 'Working…' : 'Review and sign'}
            </M.button>
            <p className="mt-2 text-center text-[11px] text-ink-muted">
              Nothing is created until you sign. You can edit the wording first.
            </p>
          </M.div>
        )}

        {step === 'done' && (
          <M.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring.pop} className="mt-8 text-center">
            <h2 className="font-display text-2xl font-black leading-tight text-ink">It&rsquo;s on the graph.</h2>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-muted">
              You are its first holder. It goes into other people&rsquo;s runs from tomorrow, and you keep
              the opening position.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Link to="/play" className="rounded-xl bg-primary-fill py-3 font-display text-sm font-extrabold text-bg">
                Play today&rsquo;s run
              </Link>
              <button
                type="button"
                onClick={() => {
                  setStep('compose');
                  setSentence('');
                  setManual({ subject: '', predicate: '', object: '' });
                  setClaim(null);
                }}
                className="rounded-xl border border-border py-3 font-display text-sm font-extrabold text-ink"
              >
                Put up another
              </button>
            </div>
          </M.div>
        )}
      </AnimatePresence>
    </M.div>
  );
};

export default PutItUp;
