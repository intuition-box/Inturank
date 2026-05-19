import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { ArrowLeft, Terminal, Zap, Loader2, Database, GitBranch, Search, Camera, CheckCircle, ExternalLink, UserPlus, FileText, Sparkles, Info } from 'lucide-react';
import { Hex } from 'viem';
import { createStringAtom } from '../services/intuitionSdk';
import { getConnectedAccount, connectWallet, getWalletBalance, createSemanticTriple, createIdentityAtom, getAtomCreationCost, getProxyApprovalStatus, grantProxyApproval, markProxyApproved, validateTripleAtomsExist, parseProtocolError, getMinClaimDeposit, getTotalTripleCreationCost, getTripleCost, calculateTripleId } from '../services/web3';
import { uploadImageToIpfs, ensureIpfsUploadConfigured } from '../services/ipfs';
import { searchGlobalAgents, getAllAgents } from '../services/graphql';
import { playClick, playHover } from '../services/audio';
import { toast } from '../components/Toast';
import { formatEther, parseEther } from 'viem';
import { APP_VERSION_DISPLAY, CURRENCY_SYMBOL, EXPLORER_URL, PAGE_HERO_TITLE, PAGE_HERO_BODY } from '../constants';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { formatMarketValue } from '../services/analytics';
import { notifyProtocolXpEarned } from '../services/protocolXp';
import { XpEarnHint } from '../components/XpEarnHint';

type View = 'root' | 'identity_choice' | 'identity_manual' | 'identity_review' | 'claim' | 'claim_review' | 'construct_atom' | 'sdk' | 'manual_pathway' | 'establish_synapse' | 'ingress';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

/** IntuRank create flow — glass shell, pills, cyan/violet glow (no sharp “slants”) */
const CREATE_SHELL =
  'relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] md:rounded-[2.25rem] ' +
  'border border-intuition-primary/30 bg-[#03050d]/[0.96] backdrop-blur-2xl backdrop-saturate-150 ' +
  'shadow-[0_28px_90px_rgba(0,0,0,0.55),0_0_48px_rgba(0,243,255,0.1),inset_0_1px_0_rgba(255,255,255,0.07)] ' +
  'ring-1 ring-intuition-primary/20';
const CREATE_SHELL_AURA =
  'pointer-events-none absolute -top-24 left-1/2 h-48 w-[min(100%,42rem)] -translate-x-1/2 rounded-full bg-intuition-primary/[0.12] blur-[80px]';
const CREATE_SHELL_GRID =
  'pointer-events-none absolute inset-0 opacity-[0.45] bg-[linear-gradient(rgba(0,243,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,30,109,0.02)_1px,transparent_1px)] bg-[size:28px_28px]';
const CREATE_BACK =
  'inline-flex items-center gap-2 rounded-full border border-white/12 bg-[#05070c]/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-200 ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all hover:border-intuition-primary/45 hover:bg-intuition-primary/10 hover:text-white hover:shadow-[0_0_24px_rgba(0,243,255,0.18)]';
const CREATE_STEP_CYAN =
  'rounded-full border border-intuition-primary/35 bg-intuition-primary/10 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.35em] text-intuition-primary shadow-[0_0_20px_rgba(0,243,255,0.15)]';
const CREATE_STEP_MUTED =
  'rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.35em] text-slate-400';
const CREATE_STEP_AMBER =
  'rounded-full border border-amber-400/35 bg-amber-500/10 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.35em] text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.12)]';
const CREATE_STEP_VIOLET =
  'rounded-full border border-violet-500/40 bg-violet-500/10 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.35em] text-violet-300 shadow-[0_0_20px_rgba(139,92,246,0.2)]';
const CREATE_INPUT =
  'w-full rounded-2xl border border-white/10 bg-[#05070c]/95 py-3.5 px-4 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition-all placeholder:text-slate-600 ' +
  'hover:border-white/16 focus:border-intuition-primary/60 focus:ring-2 focus:ring-intuition-primary/20';
const CREATE_CHOICE_CYAN =
  'group relative overflow-hidden rounded-[1.75rem] border border-intuition-primary/35 bg-gradient-to-br from-intuition-primary/[0.14] via-[#05070c]/95 to-black/90 p-8 text-left ' +
  'shadow-[0_0_0_1px_rgba(0,243,255,0.08)_inset] transition-all duration-300 hover:-translate-y-1 hover:border-intuition-primary/55 hover:shadow-[0_20px_50px_rgba(0,0,0,0.45),0_0_40px_rgba(0,243,255,0.22)]';
const CREATE_CHOICE_VIOLET =
  'group relative overflow-hidden rounded-[1.75rem] border border-violet-500/40 bg-gradient-to-br from-violet-500/[0.12] via-[#05070c]/95 to-black/90 p-8 text-left ' +
  'shadow-[0_0_0_1px_rgba(139,92,246,0.1)_inset] transition-all duration-300 hover:-translate-y-1 hover:border-violet-400/55 hover:shadow-[0_20px_50px_rgba(0,0,0,0.45),0_0_40px_rgba(139,92,246,0.25)]';
const CREATE_CHOICE_AMBER =
  'group relative overflow-hidden rounded-[1.75rem] border border-amber-400/40 bg-gradient-to-br from-amber-500/[0.1] via-[#05070c]/95 to-black/90 p-8 text-left ' +
  'transition-all duration-300 hover:-translate-y-1 hover:border-amber-400/60 hover:shadow-[0_20px_50px_rgba(0,0,0,0.45),0_0_36px_rgba(251,191,36,0.2)]';
const CREATE_TRIPLE_SLOT =
  'relative flex min-h-[148px] flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-intuition-primary/35 bg-[#04060c]/90 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition-all hover:border-intuition-primary/55 hover:bg-intuition-primary/[0.06] hover:shadow-[0_0_28px_rgba(0,243,255,0.12)]';
const CREATE_BTN_PRIMARY =
  'w-full rounded-full bg-intuition-primary py-3.5 text-sm font-bold uppercase tracking-widest text-black shadow-[0_0_28px_rgba(0,243,255,0.35)] transition-all hover:bg-white hover:shadow-[0_0_40px_rgba(0,243,255,0.45)] disabled:cursor-not-allowed disabled:opacity-50';
const CREATE_TITLE_FORM =
  'text-center text-2xl font-bold leading-tight tracking-tight text-white font-display sm:text-[1.65rem]';
const CREATE_BTN_VIOLET =
  'rounded-full border-2 border-violet-500 bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 px-8 text-sm font-bold text-white shadow-[0_0_28px_rgba(139,92,246,0.4)] transition-all hover:brightness-110 hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] disabled:cursor-not-allowed disabled:opacity-50';

const CreateSignal: React.FC = () => {
  const { address: wagmiAddress } = useAccount();
  const [view, setView] = useState<View>('root');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>('');
  const [identitySchemaType, setIdentitySchemaType] = useState<'Thing' | 'Person' | 'Organization' | 'Account'>('Thing');
  const [identityUrl, setIdentityUrl] = useState('');
  const [accountAddress, setAccountAddress] = useState('');
  const [accountChain, setAccountChain] = useState('Intuition Mainnet');

  // SDK form
  const [payload, setPayload] = useState('');
  const [deposit, setDeposit] = useState('0.01');
  const [creating, setCreating] = useState(false);
  const [lastTermId, setLastTermId] = useState<Hex | null>(null);
  const [successModal, setSuccessModal] = useState<{
    termId: Hex | null;
    type: 'signal' | 'atom' | 'synapse';
    txHash?: Hex | null;
  } | null>(null);

  // Manual CONSTRUCT_ATOM
  const [nodeAlias, setNodeAlias] = useState('');
  const [descriptionPayload, setDescriptionPayload] = useState('');
  const [atomDeposit, setAtomDeposit] = useState('0.5');
  const [imageUrl, setImageUrl] = useState('');
  const [creatingAtom, setCreatingAtom] = useState(false);

  // Manual ESTABLISH_SYNAPSE
  const [subjectId, setSubjectId] = useState('');
  const [subjectLabel, setSubjectLabel] = useState('');
  const [predicateId, setPredicateId] = useState('');
  const [predicateLabel, setPredicateLabel] = useState('');
  const [objectId, setObjectId] = useState('');
  const [objectLabel, setObjectLabel] = useState('');
  const [synapseDeposit, setSynapseDeposit] = useState('0.5');
  const [creatingSynapse, setCreatingSynapse] = useState(false);
  const [nodeSearchOpen, setNodeSearchOpen] = useState<'subject' | 'predicate' | 'object' | null>(null);
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');
  const [nodeSearchResults, setNodeSearchResults] = useState<any[]>([]);
  const [nodeSearching, setNodeSearching] = useState(false);
  const [nodeSearchError, setNodeSearchError] = useState<string | null>(null);
  const [returnToSynapseSlot, setReturnToSynapseSlot] = useState<'subject' | 'predicate' | 'object' | null>(null);
  const [claimReviewApproved, setClaimReviewApproved] = useState<boolean | null>(null);
  const [enablingProtocol, setEnablingProtocol] = useState(false);
  const [minClaimDeposit, setMinClaimDeposit] = useState('0.5');
  const [totalClaimCost, setTotalClaimCost] = useState<string | null>(null);
  const [tripleFee, setTripleFee] = useState<string | null>(null);
  const [totalAtomCost, setTotalAtomCost] = useState<string | null>(null);
  const [atomFee, setAtomFee] = useState<string | null>(null);
  const [identityReviewApproved, setIdentityReviewApproved] = useState<boolean | null>(null);
  const [claimReviewAtomsValid, setClaimReviewAtomsValid] = useState<boolean | null>(null);
  const [claimReviewMissingAtoms, setClaimReviewMissingAtoms] = useState<string[]>([]);
  const [claimReviewBypassValidation, setClaimReviewBypassValidation] = useState(false);
  const nodeSearchInputRef = useRef<HTMLInputElement>(null);
  const prevNodeSearchingRef = useRef(false);

  const ensureWallet = async () => {
    // Prefer wagmi address so we're in sync with header
    let account = wagmiAddress ?? (await getConnectedAccount());
    if (!account) {
      connectWallet(); // opens RainbowKit modal
      account = await getConnectedAccount();
    }
    if (!account) throw new Error('Connect wallet to continue');
    return account;
  };

  const handleBroadcastSdk = async () => {
    playClick();
    if (!payload.trim()) {
      toast.error('Enter claim payload');
      return;
    }
    try {
      await ensureWallet();
      setCreating(true);
      setLastTermId(null);
      const result = await createStringAtom(payload.trim(), deposit || undefined);
      const termId = result.state.termId as Hex;
      const txHash = (result as { transactionHash?: Hex }).transactionHash ?? null;
      setLastTermId(termId);
      setSuccessModal({ termId, type: 'signal', txHash });
      toast.success('Claim created successfully');
    } catch (err: any) {
      toast.error((err?.message || 'Could not create claim').slice(0, 120));
    } finally {
      setCreating(false);
    }
  };

  const handleConstructAtom = async () => {
    playClick();
    if (!nodeAlias.trim()) {
      toast.error('Enter a name for this atom');
      return;
    }
    const dep = atomDeposit || '0.5';
    const minDep = parseFloat(minClaimDeposit || '0.5');
    if (parseFloat(dep) < minDep) {
      toast.error(`Minimum deposit is ${minClaimDeposit} ${CURRENCY_SYMBOL}. You entered ${dep}.`);
      return;
    }
    try {
      const account = await ensureWallet();
      setCreatingAtom(true);
      const approved = await getProxyApprovalStatus(account);
      if (!approved) await grantProxyApproval(account);

      let resolvedImageUrl = imageUrl.trim();

      // If user selected a file and IPFS upload is configured, upload the file and
      // use the returned ipfs:// URL instead of a transient data: URL.
      if (imageFile && (!resolvedImageUrl || resolvedImageUrl.startsWith('data:'))) {
        if (!ensureIpfsUploadConfigured()) {
          // If not configured, fall back to no image; user can paste a URL instead.
          resolvedImageUrl = '';
        } else {
          try {
            const ipfsUrl = await uploadImageToIpfs(imageFile);
            resolvedImageUrl = ipfsUrl;
          } catch (err: any) {
            toast.error(
              (err?.message || 'IPFS_UPLOAD_FAILED').slice(0, 160)
            );
            resolvedImageUrl = '';
          }
        }
      }

      const metadata = {
        name: nodeAlias.trim(),
        description: descriptionPayload.trim() || undefined,
        type: 'Thing',
        ...(resolvedImageUrl && { image: resolvedImageUrl }),
        ...(identityUrl.trim() && { links: [{ label: 'Link', url: identityUrl.trim() }] }),
      };

      const { termId, hash: atomTxHash } = await createIdentityAtom(metadata, atomDeposit || '0.5', account);
      markProxyApproved(account);
      setImageFile(null);
      if (termId) setLastTermId(termId as Hex);
      if (returnToSynapseSlot) {
        const id = termId as string;
        const label = nodeAlias.trim() || 'New atom';
        if (returnToSynapseSlot === 'subject') { setSubjectId(id); setSubjectLabel(label); }
        else if (returnToSynapseSlot === 'predicate') { setPredicateId(id); setPredicateLabel(label); }
        else { setObjectId(id); setObjectLabel(label); }
        setView('claim');
        setReturnToSynapseSlot(null);
      }
      setSuccessModal({ termId: termId ?? null, type: 'atom', txHash: atomTxHash });
      notifyProtocolXpEarned({
        address: account,
        reasonKey: 'create_atom',
        txHash: atomTxHash,
        depositTrustWei: parseEther(atomDeposit || '0.5'),
      });
      toast.success('Atom created');
    } catch (err: any) {
      toast.error((err?.message || 'Could not create atom').slice(0, 120));
    } finally {
      setCreatingAtom(false);
    }
  };

  const handleEstablishSynapse = async () => {
    playClick();
    if (!subjectId || !predicateId || !objectId) {
      toast.error('Choose subject, predicate, and object');
      return;
    }
    const depositAmount = synapseDeposit || '0.5';
    if (parseFloat(depositAmount) < parseFloat(minClaimDeposit || '0.5')) {
      toast.error(`Minimum deposit is ${minClaimDeposit} ${CURRENCY_SYMBOL}.`);
      return;
    }
    try {
      const account = await ensureWallet();
      setCreatingSynapse(true);
      const approved = await getProxyApprovalStatus(account);
      if (!approved) await grantProxyApproval(account);
      
      const termId = calculateTripleId(subjectId, predicateId, objectId);
      const synapseTxHash = await createSemanticTriple(subjectId, predicateId, objectId, depositAmount, account);
      markProxyApproved(account);
      setSuccessModal({ termId: termId as Hex, type: 'synapse', txHash: synapseTxHash });
      notifyProtocolXpEarned({
        address: account,
        reasonKey: 'create_claim',
        txHash: synapseTxHash,
        depositTrustWei: parseEther(depositAmount),
      });
      toast.success('Link created');
      setSubjectId('');
      setSubjectLabel('');
      setPredicateId('');
      setPredicateLabel('');
      setObjectId('');
      setObjectLabel('');
    } catch (err: any) {
      toast.error((err?.message || 'LINKAGE_FAILED').slice(0, 120));
    } finally {
      setCreatingSynapse(false);
    }
  };

  const runNodeSearch = async () => {
    const q = nodeSearchQuery.trim();
    setNodeSearchError(null);
    setNodeSearching(true);
    try {
      if (!q) {
        const res = await getAllAgents(12, 0);
        setNodeSearchResults(Array.isArray(res.items) ? res.items : []);
      } else {
        const res = await searchGlobalAgents(q);
        setNodeSearchResults(Array.isArray(res) ? res : []);
      }
    } catch (e: any) {
      setNodeSearchResults([]);
      setNodeSearchError(e?.message || 'Search failed');
    } finally {
      setNodeSearching(false);
    }
  };

  // Real-time debounced search when query changes (no Enter needed)
  useEffect(() => {
    if (!nodeSearchOpen) return;
    const q = nodeSearchQuery.trim();
    if (!q) {
      runNodeSearch();
      return;
    }
    const t = setTimeout(() => { runNodeSearch(); }, 320);
    return () => clearTimeout(t);
  }, [nodeSearchQuery, nodeSearchOpen]);

    const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Image must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageUrl(dataUrl);
      setImageFile(file);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const pickNode = (role: 'subject' | 'predicate' | 'object', id: string, label: string) => {
    if (role === 'subject') {
      setSubjectId(id);
      setSubjectLabel(label);
    } else if (role === 'predicate') {
      setPredicateId(id);
      setPredicateLabel(label);
    } else {
      setObjectId(id);
      setObjectLabel(label);
    }
    setNodeSearchOpen(null);
    setNodeSearchQuery('');
    setNodeSearchResults([]);
  };

  // Load wallet balance when entering review or identity-manual (Account) screens; use wagmi address so we stay in sync
  useEffect(() => {
    if (view !== 'identity_review' && view !== 'claim_review' && view !== 'identity_manual') return;
    const acc = wagmiAddress ?? null;
    if (!acc) {
      setWalletBalance('0');
      return;
    }
    let cancelled = false;
    getWalletBalance(acc).then((b) => {
      if (!cancelled) setWalletBalance(b || '0');
    });
    return () => { cancelled = true; };
  }, [view, wagmiAddress]);

  // Keep focus in search input: focus when panel opens, restore when search finishes
  useEffect(() => {
    if (nodeSearchOpen) {
      const t = requestAnimationFrame(() => {
        nodeSearchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(t);
    }
  }, [nodeSearchOpen]);

  useEffect(() => {
    if (prevNodeSearchingRef.current && !nodeSearching) {
      nodeSearchInputRef.current?.focus();
    }
    prevNodeSearchingRef.current = nodeSearching;
  }, [nodeSearching]);

  // Clear stale error toasts when opening Review & Confirm so user doesn't see a previous failure
  useEffect(() => {
    if (view === 'claim_review') toast.dismissAll();
  }, [view]);

  useEffect(() => {
    if (view === 'claim' || view === 'claim_review' || view === 'establish_synapse') {
      getMinClaimDeposit().then(setMinClaimDeposit).catch(() => setMinClaimDeposit('0.5'));
    }
  }, [view]);

  useEffect(() => {
    if (view === 'claim_review' && (synapseDeposit || '0') !== '') {
      getTotalTripleCreationCost(synapseDeposit || '0').then(setTotalClaimCost).catch(() => setTotalClaimCost(null));
      getTripleCost().then(setTripleFee).catch(() => setTripleFee(null));
    } else {
      setTotalClaimCost(null);
      setTripleFee(null);
    }
  }, [view, synapseDeposit]);

  useEffect(() => {
    if (view !== 'identity_review') {
      setTotalAtomCost(null);
      setAtomFee(null);
      return;
    }
    const deposit = atomDeposit || '0.5';
    const isAccount = identitySchemaType === 'Account';
    const metadata = isAccount
      ? { type: 'Account', address: accountAddress.trim(), chain: accountChain }
      : {
          name: nodeAlias.trim(),
          description: descriptionPayload.trim() || undefined,
          type: identitySchemaType,
          ...(imageUrl.trim() && { image: imageUrl.trim() }),
          ...(identityUrl.trim() && { links: [{ label: 'Link', url: identityUrl.trim() }] }),
        };
    if (isAccount && !accountAddress.trim()) return;
    if (!isAccount && !nodeAlias.trim()) return;
    getAtomCreationCost(metadata, deposit)
      .then((costBigInt) => {
        setTotalAtomCost(formatEther(costBigInt));
        // Show the standard 0.15 base fee in the "Creation cost" label to match claim UI
        setAtomFee('0.150000');
      })
      .catch(() => {
        const dep = parseFloat(deposit);
        const baseFee = 0.15;
        const raw = baseFee + dep;
        const total = raw * 1.15; // 15% proxy fee fallback
        setTotalAtomCost(total.toFixed(6));
        setAtomFee('0.150000');
      });
  }, [view, atomDeposit, identitySchemaType, accountAddress, accountChain, nodeAlias, descriptionPayload, imageUrl, identityUrl]);

  // Validate proxy approval for claims
  useEffect(() => {
    if (view !== 'claim_review') return;
    const acc = wagmiAddress ?? null;
    if (!acc) {
      setClaimReviewApproved(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const v = await getProxyApprovalStatus(acc);
      if (!cancelled) setClaimReviewApproved(v);
    };
    run();
    return () => { cancelled = true; };
  }, [view, wagmiAddress]);

  // Validate atoms exist on-chain when on claim review
  useEffect(() => {
    if (view !== 'claim_review' || !subjectId || !predicateId || !objectId) {
      setClaimReviewAtomsValid(null);
      setClaimReviewMissingAtoms([]);
      setClaimReviewBypassValidation(false);
      return;
    }
    let cancelled = false;
    validateTripleAtomsExist(subjectId, predicateId, objectId).then(({ ok, missing }) => {
      if (!cancelled) {
        setClaimReviewAtomsValid(ok);
        setClaimReviewMissingAtoms(missing);
      }
    });
    return () => { cancelled = true; };
  }, [view, subjectId, predicateId, objectId]);

  useEffect(() => {
    if (view !== 'identity_review') return;
    const acc = wagmiAddress ?? null;
    if (!acc) {
      setIdentityReviewApproved(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const v = await getProxyApprovalStatus(acc);
      if (!cancelled) setIdentityReviewApproved(v);
    };
    run();
    return () => { cancelled = true; };
  }, [view, wagmiAddress]);

  const handleSubmitIdentityFromReview = async () => {
    playClick();
    const isAccount = identitySchemaType === 'Account';
    if (isAccount && !accountAddress.trim()) {
      toast.error('Enter an address for Account');
      return;
    }
    if (!isAccount && !nodeAlias.trim()) return;
    const deposit = atomDeposit || '0.5';
    const minDep = parseFloat(minClaimDeposit || '0.5');
    if (parseFloat(deposit) < minDep) {
      toast.error(`Minimum deposit is ${minClaimDeposit} ${CURRENCY_SYMBOL}. You entered ${deposit}.`);
      return;
    }
    try {
      const account = await ensureWallet();
      setCreatingAtom(true);
      const approved = await getProxyApprovalStatus(account);
      if (!approved) await grantProxyApproval(account);

      const metadata = isAccount
        ? { type: 'Account', address: accountAddress.trim(), chain: accountChain }
        : {
            name: nodeAlias.trim(),
            description: descriptionPayload.trim() || undefined,
            type: identitySchemaType,
            ...(imageUrl.trim() && { image: imageUrl.trim() }),
            ...(identityUrl.trim() && { links: [{ label: 'Link', url: identityUrl.trim() }] }),
          };
      const { termId, hash: atomTxHash } = await createIdentityAtom(metadata, deposit, account);
      markProxyApproved(account);
      setImageFile(null);
      if (termId) setLastTermId(termId as Hex);
      setSuccessModal({ termId: termId ?? null, type: 'atom', txHash: atomTxHash });
      notifyProtocolXpEarned({
        address: account,
        reasonKey: 'create_atom',
        txHash: atomTxHash,
        depositTrustWei: parseEther(deposit),
      });
      toast.success('Atom created');
    } catch (err: any) {
      toast.error((err?.message || 'Could not create atom').slice(0, 120));
    } finally {
      setCreatingAtom(false);
    }
  };

  const handleSubmitClaimFromReview = async () => {
    playClick();
    if (!subjectId || !predicateId || !objectId) return;
    const depositAmount = synapseDeposit || '0.5';
    const minDep = parseFloat(minClaimDeposit || '0.5');
    if (parseFloat(depositAmount) < minDep) {
      toast.error(`Minimum deposit is ${minClaimDeposit} ${CURRENCY_SYMBOL}. You entered ${depositAmount}.`);
      return;
    }
    if (claimReviewApproved !== true) {
      toast.error('Enable protocol first, then Submit.');
      return;
    }
    try {
      const account = await ensureWallet();
      setCreatingSynapse(true);
      const approved = await getProxyApprovalStatus(account);
      if (!approved) await grantProxyApproval(account);

      const termId = calculateTripleId(subjectId, predicateId, objectId);
      const synapseTxHash = await createSemanticTriple(subjectId, predicateId, objectId, depositAmount, account, undefined, claimReviewBypassValidation);
      markProxyApproved(account);
      setSuccessModal({ termId: termId as Hex, type: 'synapse', txHash: synapseTxHash });
      notifyProtocolXpEarned({
        address: account,
        reasonKey: 'create_claim',
        txHash: synapseTxHash,
        depositTrustWei: parseEther(depositAmount),
      });
      toast.success('Link created');
      setSubjectId('');
      setSubjectLabel('');
      setPredicateId('');
      setPredicateLabel('');
      setObjectId('');
      setObjectLabel('');
      setView('root');
    } catch (err: any) {
      const msg = parseProtocolError(err) || err?.message || 'LINKAGE_FAILED';
      toast.error(msg.length > 100 ? msg.slice(0, 97) + '…' : msg);
    } finally {
      setCreatingSynapse(false);
    }
  };

  const frameHeader = (
    <>
      <div className="absolute top-6 left-1/2 -translate-x-1/2 rounded-full border border-intuition-success/40 bg-intuition-success/10 px-6 py-1.5 text-[9px] font-black uppercase tracking-[0.4em] text-intuition-success shadow-[0_0_20px_rgba(0,255,157,0.15)]">
        ACTIVE
      </div>
      <div className="relative mb-6 mt-4">
        <div className="absolute -inset-8 bg-intuition-primary/20 blur-3xl rounded-full animate-pulse"></div>
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-intuition-primary bg-black/60 text-intuition-primary shadow-[0_0_40px_rgba(0,243,255,0.35)]">
          <Zap size={40} className="animate-pulse" />
        </div>
      </div>
    </>
  );

  const footer = (
    <div className="mt-6 flex w-full items-center justify-center gap-3 border-t border-white/[0.06] pt-5 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600">
      <span className="font-black text-slate-500">S05_CREATE</span>
      <span className="text-intuition-primary/35" aria-hidden>
        ·
      </span>
      <span className="font-black text-intuition-success text-glow-success">Sync active</span>
    </div>
  );

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-8 sm:py-10 relative overflow-hidden font-mono bg-[#020308]">
      <div className="fixed inset-0 pointer-events-none z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>
      <div className="absolute inset-0 pointer-events-none opacity-[0.06] retro-grid" aria-hidden />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-intuition-primary/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Success modal — shown when transaction is confirmed */}
      {successModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setSuccessModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="success-modal-title"
        >
          <div
            className="relative w-full max-w-md rounded-[1.75rem] border border-intuition-success/40 bg-[#03050d]/[0.97] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_40px_rgba(34,197,94,0.15)] ring-1 ring-intuition-success/25 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-full bg-intuition-success/20 flex items-center justify-center">
                <CheckCircle size={36} className="text-intuition-success" />
              </div>
              <div>
                <h2 id="success-modal-title" className="text-lg font-black text-white uppercase tracking-widest mb-1">Success! Transaction Confirmed</h2>
                <p className="text-[10px] font-black text-intuition-success uppercase tracking-[0.2em]">
                  {successModal.type === 'signal' && 'Claim Created! Check the protocol graph.'}
                  {successModal.type === 'atom' && 'Identity Established! Explore your node.'}
                  {successModal.type === 'synapse' && 'Synapse Linked! View the claim portal.'}
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-4 w-full max-w-sm">
                {successModal.txHash && (
                  <div className="flex flex-col gap-2 w-full text-left">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Transaction hash</span>
                    <p
                      className="text-[10px] font-mono text-slate-300 text-center leading-relaxed"
                      title={successModal.txHash}
                    >
                      {successModal.txHash.slice(0, 12)}…{successModal.txHash.slice(-10)}
                    </p>
                    <a
                      href={`${EXPLORER_URL}/tx/${successModal.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => { playClick(); }}
                      className="flex items-center justify-center gap-2 rounded-full border border-intuition-primary/45 px-6 py-3 font-black text-xs uppercase tracking-widest text-intuition-primary transition-all hover:border-intuition-primary hover:bg-intuition-primary/10 hover:shadow-[0_0_24px_rgba(0,243,255,0.2)]"
                    >
                      <ExternalLink size={14} /> View in explorer
                    </a>
                  </div>
                )}
                {successModal.termId && (
                  <Link
                    to={`/markets/${successModal.termId}`}
                    onClick={() => { playClick(); setSuccessModal(null); }}
                    className="flex items-center justify-center gap-2 rounded-full bg-intuition-primary px-6 py-3 font-black text-xs uppercase tracking-widest text-black shadow-[0_0_28px_rgba(0,243,255,0.4)] transition-all hover:bg-white hover:shadow-[0_0_40px_rgba(0,243,255,0.5)]"
                  >
                    <ExternalLink size={14} />{' '}
                    {successModal.type === 'atom' ? 'View atom' : 'View claim'}
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => { playClick(); setSuccessModal(null); }}
                className="text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto w-full max-w-4xl px-2 sm:px-4">
        <div className={`${CREATE_SHELL} flex flex-col items-center p-5 sm:p-6 md:p-8`}>
          <div className={CREATE_SHELL_AURA} aria-hidden />
          <div className={CREATE_SHELL_GRID} aria-hidden />

          {/* ----- ROOT: Create identity or claim ----- */}
          {view === 'root' && (
            <div className="w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-both">
            <>
              <div className="flex w-full items-center justify-between mb-8">
                <Link
                  to="/markets"
                  onClick={playClick}
                  onMouseEnter={playHover}
                  className={CREATE_BACK}
                >
                  <ArrowLeft size={16} /> Back to claims
                </Link>
                <span className={CREATE_STEP_CYAN}>Create</span>
              </div>
              <h1 className={`${PAGE_HERO_TITLE} text-center mb-3`}>Create identity or claim</h1>
              <p className={`${PAGE_HERO_BODY} text-center mb-10 max-w-lg mx-auto`}>
                Anchor a new identity on the graph or attest a semantic claim (triple).
              </p>
              <XpEarnHint variant="create_hub" className="mb-8 max-w-lg mx-auto justify-center text-center" />
              <div className="w-full grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
                <button
                  type="button"
                  onClick={() => { playClick(); setView('identity_choice'); }}
                  onMouseEnter={playHover}
                  className={CREATE_CHOICE_CYAN}
                >
                  <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-intuition-primary/20 blur-2xl transition-opacity group-hover:opacity-100" />
                  <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-intuition-primary/30 bg-black/40 text-intuition-primary shadow-[0_0_24px_rgba(0,243,255,0.25)] transition-transform group-hover:scale-105">
                    <UserPlus size={28} strokeWidth={2} />
                  </div>
                  <div className="relative mb-2 font-black text-sm uppercase tracking-widest text-white">Create identity</div>
                  <div className="relative text-[11px] leading-relaxed text-slate-400">Generate with AI or create manually. Things, persons, organizations, accounts.</div>
                  <div className="relative mt-5 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-intuition-primary">
                    Continue <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { playClick(); setView('claim'); }}
                  onMouseEnter={playHover}
                  className={CREATE_CHOICE_VIOLET}
                >
                  <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-500/25 blur-2xl transition-opacity group-hover:opacity-100" />
                  <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/35 bg-black/40 text-violet-300 shadow-[0_0_24px_rgba(139,92,246,0.3)] transition-transform group-hover:scale-105">
                    <FileText size={28} strokeWidth={2} />
                  </div>
                  <div className="relative mb-2 font-black text-sm uppercase tracking-widest text-white">Create claim</div>
                  <div className="relative text-[11px] leading-relaxed text-slate-400">Claim anything about anything. Subject — predicate — object (semantic triple).</div>
                  <div className="relative mt-5 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-violet-300">
                    Continue <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </button>
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- IDENTITY CHOICE: Generate with AI | Create Manually ----- */}
          {view === 'identity_choice' && (
            <div className="w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              <div className="flex w-full items-center justify-between mb-8">
                <button type="button" onClick={() => { playClick(); setView('root'); }} onMouseEnter={playHover} className={`${CREATE_BACK} z-10`}>
                  <ArrowLeft size={14} /> Back
                </button>
                <span className={CREATE_STEP_MUTED}>Create identity</span>
              </div>
              <h1 className={`${PAGE_HERO_TITLE} text-center mb-8`}>Choose how to create</h1>
              <div className="w-full grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
                <Link
                  to="/skill-playground"
                  onClick={playClick}
                  onMouseEnter={playHover}
                  className={`${CREATE_CHOICE_CYAN} block`}
                >
                  <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-intuition-primary/35 bg-black/40 text-intuition-primary shadow-[0_0_28px_rgba(0,243,255,0.3)] transition-transform group-hover:scale-105">
                    <Sparkles size={28} strokeWidth={2} />
                  </div>
                  <div className="mb-2 font-black text-sm uppercase tracking-widest text-white">Generate identity with AI</div>
                  <div className="text-[11px] leading-relaxed text-slate-400">Neural-assisted creation. Describe your node and let AI handle the parameters.</div>
                  <div className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-intuition-primary">Launch agent →</div>
                </Link>
                <button
                  type="button"
                  onClick={() => { playClick(); setView('identity_manual'); }}
                  onMouseEnter={playHover}
                  className={CREATE_CHOICE_AMBER}
                >
                  <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/40 bg-black/40 text-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.2)] transition-transform group-hover:scale-105">
                    <UserPlus size={28} strokeWidth={2} />
                  </div>
                  <div className="mb-2 font-black text-sm uppercase tracking-widest text-white">Create identity manually</div>
                  <div className="text-[11px] leading-relaxed text-slate-400">Schema type, image, name, description, URL, initial deposit.</div>
                  <div className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">Continue →</div>
                </button>
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- IDENTITY MANUAL: Create New Identity form ----- */}
          {view === 'identity_manual' && (
            <div className="w-full max-w-md mx-auto animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              <div className="mb-4 flex w-full items-center justify-between">
                <button type="button" onClick={() => { playClick(); setView('identity_choice'); }} onMouseEnter={playHover} className={`${CREATE_BACK} !py-2 !px-4 text-[11px] z-10`}>
                  <ArrowLeft size={14} /> Back
                </button>
              </div>
              <h1 className={`${CREATE_TITLE_FORM} mb-5`}>New identity</h1>
              <div className="w-full space-y-3 text-left">
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Type</label>
                  <select value={identitySchemaType} onChange={(e) => setIdentitySchemaType(e.target.value as any)} className={`${CREATE_INPUT} !py-2.5 font-sans`}>
                    <option value="Thing">Thing</option>
                    <option value="Person">Person</option>
                    <option value="Organization">Organization</option>
                    <option value="Account">Account</option>
                  </select>
                </div>
                {identitySchemaType === 'Account' ? (
                  <>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Address</label>
                      <input value={accountAddress} onChange={(e) => setAccountAddress(e.target.value)} placeholder="0x…" className={`${CREATE_INPUT} !py-2.5 font-mono text-sm`} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Chain</label>
                      <select value={accountChain} onChange={(e) => setAccountChain(e.target.value)} className={`${CREATE_INPUT} !py-2.5 font-mono`}>
                        <option value="Intuition Mainnet">Intuition Mainnet</option>
                        <option value="Base">Base</option>
                        <option value="Ethereum">Ethereum</option>
                        <option value="Polygon">Polygon</option>
                        <option value="Arbitrum">Arbitrum</option>
                        <option value="Optimism">Optimism</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Deposit</label>
                        <input type="number" min="0" step="0.01" value={atomDeposit} onChange={(e) => setAtomDeposit(e.target.value)} className={`w-28 ${CREATE_INPUT} !py-2.5 font-mono`} />
                      </div>
                      <CurrencySymbol size="md" className="mb-2.5 text-intuition-primary/90" />
                      {walletBalance ? (
                        <span className="mb-2 text-[10px] text-slate-500">
                          {walletBalance} <CurrencySymbol size="sm" /> balance
                        </span>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => { playClick(); setView('identity_review'); }} disabled={!accountAddress.trim()} className={`${CREATE_BTN_PRIMARY} !py-3 disabled:opacity-50`}>
                      Continue
                    </button>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-dashed border-white/12 bg-[#04060c]/95 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/50 text-slate-500">
                            <Camera size={18} />
                          </div>
                          <label className="cursor-pointer rounded-full border border-intuition-primary/40 bg-intuition-primary/10 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-intuition-primary transition-all hover:bg-intuition-primary/20">
                            <input type="file" accept="image/png,image/jpeg,image/jpg,image/gif" onChange={handleImageFileChange} className="sr-only" />
                            Upload
                          </label>
                          {imageFile ? <span className="max-w-[10rem] truncate text-[10px] text-intuition-primary">{imageFile.name}</span> : null}
                        </div>
                      </div>
                      <input
                        type="url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://…"
                        className={`mt-3 w-full ${CREATE_INPUT} !py-2 text-[12px] font-mono`}
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Name</label>
                      <input value={nodeAlias} onChange={(e) => setNodeAlias(e.target.value)} placeholder="Display name" className={`${CREATE_INPUT} !py-2.5 font-mono`} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Description</label>
                      <textarea value={descriptionPayload} onChange={(e) => setDescriptionPayload(e.target.value)} placeholder="Optional" rows={2} className={`${CREATE_INPUT} resize-none font-mono !py-2.5`} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Link</label>
                      <input type="url" value={identityUrl} onChange={(e) => setIdentityUrl(e.target.value)} placeholder="https://…" className={`${CREATE_INPUT} !py-2.5 font-mono`} />
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Deposit</label>
                        <input type="number" min="0" step="0.01" value={atomDeposit} onChange={(e) => setAtomDeposit(e.target.value)} className={`w-28 ${CREATE_INPUT} !py-2.5 font-mono`} />
                      </div>
                      <CurrencySymbol size="md" className="mb-2.5 text-intuition-primary/90" />
                    </div>
                    <button type="button" onClick={() => { playClick(); setView('identity_review'); }} disabled={!nodeAlias.trim()} className={`${CREATE_BTN_PRIMARY} !py-3 disabled:opacity-50`}>
                      Continue
                    </button>
                  </>
                )}
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- IDENTITY REVIEW & CONFIRM ----- */}
          {view === 'identity_review' && (
            <div className="w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              <div className="flex w-full items-center justify-between mb-8">
                <button type="button" onClick={() => { playClick(); setView('identity_manual'); }} onMouseEnter={playHover} className={`${CREATE_BACK} z-10`}>
                  <ArrowLeft size={14} /> Back
                </button>
                <span className={CREATE_STEP_CYAN}>Create identity</span>
              </div>
              <h1 className={`${PAGE_HERO_TITLE} text-center mb-8`}>Review & confirm</h1>
              <div className="w-full max-w-md space-y-5 text-left">
                <div className="rounded-[1.25rem] border border-intuition-primary/35 bg-[#04060c]/95 p-5 shadow-[0_0_32px_rgba(0,243,255,0.12),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Identity</div>
                  <div className="text-white font-mono">
                    {identitySchemaType === 'Account' ? `Account: ${accountAddress.trim().slice(0, 10)}… (${accountChain})` : `Create: ${nodeAlias.trim() || '—'}`}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 inline-flex items-baseline gap-1">Initial deposit: {atomDeposit || '0'} <CurrencySymbol size="sm" /></div>
                </div>
                {atomFee != null && parseFloat(atomFee) > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-400">Creation cost</span>
                    <span className="text-intuition-primary font-mono inline-flex items-baseline gap-1">{atomFee} <CurrencySymbol size="md" className="text-intuition-primary/90" /></span>
                  </div>
                )}
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">Total cost</span>
                  <span className="text-white font-mono inline-flex items-baseline gap-1">{totalAtomCost ?? (atomDeposit || '0')} <CurrencySymbol size="md" className="text-white/90" /></span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">Available balance</span>
                  <span className="text-white font-mono inline-flex items-baseline gap-1">{walletBalance || '—'} <CurrencySymbol size="md" className="text-white/90" /></span>
                </div>
                {identityReviewApproved === false && (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/40 rounded">
                    <Info size={14} className="text-amber-400 shrink-0" />
                    <p className="text-[10px] text-amber-200">
                      IntuRank needs you to approve its proxy so it can deposit in your name. This is a one-time approval.{' '}
                      <a href="https://docs.intuition.systems" target="_blank" rel="noopener noreferrer" className="text-intuition-primary hover:underline inline-flex items-center gap-1" onClick={playClick}>
                        Read more <ExternalLink size={10} />
                      </a>
                    </p>
                    <button type="button" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); playClick(); try { const acc = await ensureWallet(); setEnablingProtocol(true); await grantProxyApproval(acc); setIdentityReviewApproved(true); toast.success('Protocol enabled.'); } catch (err: any) { toast.error(err?.message || err?.error?.message || 'Enable failed.'); } finally { setEnablingProtocol(false); } }} disabled={enablingProtocol} className="ml-auto py-2 px-4 bg-amber-500 text-black font-black text-[9px] uppercase tracking-widest rounded">
                      {enablingProtocol ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                )}
                <div className="flex items-start gap-2 p-3 bg-white/5 border border-white/10">
                  <Info size={14} className="text-intuition-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-slate-400">You will be prompted to approve the transaction in your wallet.</p>
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setView('identity_manual')} className="flex-1 rounded-full border border-intuition-primary/45 py-3.5 font-black text-[10px] uppercase tracking-widest text-intuition-primary transition-all hover:bg-intuition-primary/10 hover:shadow-[0_0_24px_rgba(0,243,255,0.15)]">
                    Back
                  </button>
                  <button type="button" onClick={handleSubmitIdentityFromReview} disabled={creatingAtom || identityReviewApproved !== true} className="flex-1 rounded-full bg-intuition-primary py-3.5 font-black text-[10px] uppercase tracking-widest text-black shadow-[0_0_24px_rgba(0,243,255,0.35)] transition-all hover:bg-white hover:text-intuition-primary hover:shadow-[0_0_36px_rgba(0,243,255,0.45)] disabled:cursor-not-allowed disabled:opacity-60">
                    {creatingAtom ? <><Loader2 size={14} className="animate-spin inline mr-2" /> Submitting…</> : 'Submit transactions'}
                  </button>
                </div>
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- INGRESS: Choose SDK vs Manual ----- */}
          {view === 'ingress' && (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              {frameHeader}
              <h1 className={`${PAGE_HERO_TITLE} text-center mb-3`}>Create claim</h1>
              <p className={`${PAGE_HERO_BODY} text-center mb-10 max-w-lg mx-auto`}>
                Choose how to create a new claim on the Intuition trust graph.
              </p>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
                <button
                  type="button"
                  onClick={() => { playClick(); setView('sdk'); }}
                  onMouseEnter={playHover}
                  className={CREATE_CHOICE_CYAN}
                >
                  <Terminal size={30} className="mb-4 text-intuition-primary transition-transform group-hover:scale-105" />
                  <div className="mb-2 font-semibold text-sm text-white">Use SDK</div>
                  <div className="text-[11px] leading-relaxed text-slate-400">Quick broadcast. Payload + deposit; SDK handles creation on-chain.</div>
                  <div className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-intuition-primary">Create claim →</div>
                </button>
                <button
                  type="button"
                  onClick={() => { playClick(); setView('manual_pathway'); }}
                  onMouseEnter={playHover}
                  className={CREATE_CHOICE_AMBER}
                >
                  <Database size={30} className="mb-4 text-amber-300 transition-transform group-hover:scale-105" />
                  <div className="mb-2 font-semibold text-sm text-white">Manual</div>
                  <div className="text-[11px] leading-relaxed text-slate-400">Full control. Construct an atom or define a synapse (triple) step by step.</div>
                  <div className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">Choose pathway →</div>
                </button>
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- SDK: Simple form ----- */}
          {view === 'sdk' && (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              {frameHeader}
              <h1 className={`${PAGE_HERO_TITLE} text-center mb-3`}>Create with SDK</h1>
              <p className={`${PAGE_HERO_BODY} text-center mb-8 max-w-md mx-auto`}>
                On-chain creation via SDK. Enter your claim and optional deposit below.
              </p>
              <div className="w-full max-w-md space-y-4 mb-8 text-left">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1 block">Claim payload</label>
                  <input
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    placeholder="e.g. IntuRank, Prediction Markets, DeFi"
                    className={`${CREATE_INPUT} font-mono`}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1 block">OPTIONAL_DEPOSIT (TRUST)</label>
                  <input type="number" min="0" step="0.001" value={deposit} onChange={(e) => setDeposit(e.target.value)} className={`w-40 ${CREATE_INPUT} py-2.5 font-mono`} />
                </div>
                <button type="button" onClick={handleBroadcastSdk} disabled={creating} className={`${CREATE_BTN_PRIMARY} flex items-center justify-center gap-3 disabled:opacity-60`}>
                  {creating ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : <>Create claim</>}
                </button>
                {lastTermId && (
                  <div className="pt-4 border-t border-white/10 space-y-1">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">Term ID</div>
                    <Link to={`/markets/${lastTermId}`} className="block text-intuition-primary font-mono text-xs break-all hover:underline">{lastTermId}</Link>
                    <Link to={`/markets/${lastTermId}`} className="inline-block mt-2 text-[10px] font-black text-white uppercase tracking-widest hover:text-intuition-primary">→ Open claim</Link>
                  </div>
                )}
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- MANUAL: CHOOSE_PATHWAY ----- */}
          {view === 'manual_pathway' && (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              <h1 className={`${PAGE_HERO_TITLE} text-center mb-6`}>Manual creation</h1>
              <div className="w-full mb-8">
                <p className={`${PAGE_HERO_BODY} text-center mb-8 max-w-lg mx-auto`}>
                  Select the type of claim to create on the Intuition trust graph. All creations use the linear curve for initial predictable liquidity.
                </p>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
                  <button type="button" onClick={() => { playClick(); setView('construct_atom'); }} onMouseEnter={playHover} className={CREATE_CHOICE_CYAN}>
                    <Database size={28} className="mb-4 text-intuition-primary" />
                    <div className="mb-2 font-semibold text-sm text-white">Create atom</div>
                    <div className="mb-4 text-[11px] leading-relaxed text-slate-400">Create a new atom (identity). Add metadata, image, and initial liquidity.</div>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-intuition-primary">Initialize →</span>
                  </button>
                  <button type="button" onClick={() => { playClick(); setView('establish_synapse'); }} onMouseEnter={playHover} className={CREATE_CHOICE_VIOLET}>
                    <GitBranch size={28} className="mb-4 text-violet-300" />
                    <div className="mb-2 font-semibold text-sm text-white">Define claim</div>
                    <div className="mb-4 text-[11px] leading-relaxed text-slate-400">Connect atoms via semantic claims. Build bridges between nodes.</div>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-300">Establish linkage →</span>
                  </button>
                </div>
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- CONSTRUCT_ATOM (manual / or from claim "Create atom") ----- */}
          {view === 'construct_atom' && (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              <button
                type="button"
                onClick={() => { playClick(); setReturnToSynapseSlot(null); setView(returnToSynapseSlot ? 'claim' : 'manual_pathway'); }}
                onMouseEnter={playHover}
                className={`absolute left-6 top-6 z-10 ${CREATE_BACK}`}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <h1 className={`${PAGE_HERO_TITLE} mb-8 text-center`}>Create atom</h1>
              <div className="w-full max-w-lg space-y-6 text-left">
                <div className="flex flex-col items-center justify-center gap-3 rounded-[1.35rem] border border-dashed border-white/15 bg-[#04060c]/90 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
                  <Camera size={28} className="text-slate-500" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Upload image</span>
                  <span className="text-[8px] text-slate-600">PNG / JPG · max 5MB</span>
                  <label className="mt-1 cursor-pointer rounded-full border border-intuition-primary/40 bg-intuition-primary/10 px-5 py-2.5 text-[10px] font-black uppercase text-intuition-primary transition-all hover:bg-intuition-primary/20">
                    <input type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleImageFileChange} className="sr-only" />
                    Choose file
                  </label>
                  {imageFile && <span className="max-w-full truncate text-[9px] text-intuition-primary">{imageFile.name}</span>}
                  <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Or paste image URL" className={`mt-1 w-full ${CREATE_INPUT} py-2.5 text-[11px] font-mono`} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1 block">Node name</label>
                  <input value={nodeAlias} onChange={(e) => setNodeAlias(e.target.value)} placeholder="Entity name…" className={`${CREATE_INPUT} font-mono`} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1 block">Description</label>
                  <textarea value={descriptionPayload} onChange={(e) => setDescriptionPayload(e.target.value)} placeholder="Short description…" rows={3} className={`${CREATE_INPUT} resize-none font-mono`} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1 block">Deposit (TRUST)</label>
                  <input type="number" min="0" step="0.01" value={atomDeposit} onChange={(e) => setAtomDeposit(e.target.value)} className={`w-40 ${CREATE_INPUT} py-2.5 font-mono`} />
                </div>
                <div className="flex flex-wrap gap-4 text-[9px] text-slate-500">
                  <div><span className="mb-1 block uppercase tracking-widest">Protocol cost</span><span>—</span></div>
                  <div><span className="mb-1 block uppercase tracking-widest">Gas (est.)</span><span>—</span></div>
                  <div><span className="mb-1 block uppercase tracking-widest">Net required</span><span className="inline-flex items-baseline gap-1 text-white">{atomDeposit || '0'} <CurrencySymbol size="md" /></span></div>
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => { setReturnToSynapseSlot(null); setView(returnToSynapseSlot ? 'claim' : 'manual_pathway'); }} className="flex-1 rounded-full border border-white/12 bg-white/[0.04] py-3.5 font-black text-[10px] uppercase tracking-widest text-white transition-all hover:border-white/25 hover:bg-white/10">
                    Cancel
                  </button>
                  <button type="button" onClick={handleConstructAtom} disabled={creatingAtom} className="flex-1 rounded-full bg-intuition-primary py-3.5 font-black text-[10px] uppercase tracking-widest text-black shadow-[0_0_24px_rgba(0,243,255,0.35)] transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">
                    {creatingAtom ? <Loader2 size={14} className="mr-2 inline animate-spin" /> : null} Create atom
                  </button>
                </div>
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- CREATE CLAIM (main flow) ----- */}
          {view === 'claim' && (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              <div className="mb-8 flex w-full items-center justify-between">
                <button type="button" onClick={() => { playClick(); setView('root'); }} onMouseEnter={playHover} className={`${CREATE_BACK} z-10`}>
                  <ArrowLeft size={14} /> Back
                </button>
                <span className={CREATE_STEP_VIOLET}>Create claim</span>
              </div>
              <h1 className={`${PAGE_HERO_TITLE} text-center mb-3`}>Create claim</h1>
              <p className="text-base text-slate-200 text-center mb-8 max-w-lg mx-auto leading-relaxed font-medium">
                Claim anything about anything. Claims in Intuition (also called triples) are structured as a semantic triple — like a sentence. For example:{' '}
                <span className="text-intuition-primary font-bold">[Alice]</span>{' '}
                <span className="text-white font-bold">[is]</span>{' '}
                <span className="text-intuition-primary font-bold">[trustworthy]</span>.
              </p>
              <div className="mx-auto mb-8 flex w-full max-w-2xl flex-col gap-4 rounded-[1.35rem] border border-intuition-primary/30 bg-gradient-to-r from-intuition-primary/[0.08] via-[#04060c]/95 to-[#04060c]/95 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:text-left">
                <div className="flex items-start gap-3 text-[11px] leading-relaxed text-slate-300">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-intuition-primary/35 bg-black/40 text-intuition-primary">
                    <Sparkles size={18} />
                  </div>
                  <span>
                    Want AI-assisted calldata and fees? Open the{' '}
                    <span className="font-semibold text-white">Intuition Skill Playground</span>
                    , then return here to wire nodes manually if you prefer.
                  </span>
                </div>
                <Link
                  to="/skill-playground"
                  onClick={playClick}
                  onMouseEnter={playHover}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-intuition-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-black shadow-[0_0_24px_rgba(0,243,255,0.35)] transition-all hover:bg-white"
                >
                  Open playground
                </Link>
              </div>
              <div className="w-full max-w-2xl mx-auto space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
                  {(['subject', 'predicate', 'object'] as const).map((role) => (
                    <div key={role} className={CREATE_TRIPLE_SLOT}>
                      <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">{role === 'subject' ? 'Subject' : role === 'predicate' ? 'Predicate' : 'Object'}</div>
                      {role === 'subject' && subjectId ? (
                        <div className="text-center">
                          <div className="text-white font-semibold text-sm truncate max-w-full" title={subjectId}>{subjectLabel || subjectId.slice(0, 12)}…</div>
                          <button type="button" onClick={() => { setSubjectId(''); setSubjectLabel(''); }} className="text-slate-300 text-xs font-medium mt-2 hover:text-white underline underline-offset-2">Clear</button>
                        </div>
                      ) : null}
                      {role === 'predicate' && predicateId ? (
                        <div className="text-center">
                          <div className="text-white font-semibold text-sm truncate max-w-full">{predicateLabel || predicateId.slice(0, 12)}…</div>
                          <button type="button" onClick={() => { setPredicateId(''); setPredicateLabel(''); }} className="text-slate-300 text-xs font-medium mt-2 hover:text-white underline underline-offset-2">Clear</button>
                        </div>
                      ) : null}
                      {role === 'object' && objectId ? (
                        <div className="text-center">
                          <div className="text-white font-semibold text-sm truncate max-w-full">{objectLabel || objectId.slice(0, 12)}…</div>
                          <button type="button" onClick={() => { setObjectId(''); setObjectLabel(''); }} className="text-slate-300 text-xs font-medium mt-2 hover:text-white underline underline-offset-2">Clear</button>
                        </div>
                      ) : null}
                      {((role === 'subject' && !subjectId) || (role === 'predicate' && !predicateId) || (role === 'object' && !objectId)) && (
                        <button type="button" onClick={() => setNodeSearchOpen(role)} className="group/btn flex flex-col items-center gap-2 text-white transition-colors hover:text-intuition-primary">
                          <Search size={28} className="text-intuition-primary transition-transform group-hover/btn:scale-105" />
                          <span className="text-sm font-bold uppercase">Connect node</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {nodeSearchOpen && (
                  <div className="space-y-4 rounded-[1.35rem] border border-intuition-primary/30 bg-[#03050d]/95 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                    <div className="flex gap-2">
                      <input
                        ref={nodeSearchInputRef}
                        value={nodeSearchQuery}
                        onChange={(e) => { setNodeSearchQuery(e.target.value); setNodeSearchError(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && runNodeSearch()}
                        placeholder="Search by label or term id..."
                        className={`flex-1 ${CREATE_INPUT} py-2.5 font-sans`}
                        autoComplete="off"
                        aria-label="Search atoms by label or term id"
                      />
                      <button type="button" onClick={runNodeSearch} disabled={nodeSearching} className="rounded-full bg-intuition-primary px-4 py-2.5 font-black text-[10px] uppercase text-black shadow-[0_0_16px_rgba(0,243,255,0.25)] transition-all hover:bg-white disabled:opacity-60">
                        {nodeSearching ? <Loader2 size={14} className="inline animate-spin" /> : 'Search'}
                      </button>
                      <button type="button" onClick={() => { setNodeSearchOpen(null); setNodeSearchResults([]); setNodeSearchError(null); }} className="rounded-full border border-white/15 px-4 py-2.5 text-[10px] text-slate-400 transition-colors hover:border-white/30 hover:text-white">Cancel</button>
                    </div>
                    {nodeSearchError && <p className="text-[10px] text-red-400">{nodeSearchError}</p>}
                    <div className="max-h-64 overflow-auto space-y-2">
                      {nodeSearching && <p className="text-[10px] text-slate-500 py-2">Searching the network…</p>}
                      {!nodeSearching && !nodeSearchQuery.trim() && nodeSearchResults.length > 0 && (
                        <p className="text-[10px] text-intuition-primary font-black uppercase tracking-widest mb-3 px-1 flex items-center gap-2">
                          <Sparkles size={10} /> Suggested for you
                        </p>
                      )}
                      {!nodeSearching && nodeSearchResults.map((a: any) => (
                        <button key={a.id} type="button" onClick={() => pickNode(nodeSearchOpen!, a.id, a.label)} className="w-full text-left p-3 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 hover:border-intuition-primary/40 flex items-center gap-3 transition-all">
                          <div className="shrink-0 w-10 h-10 rounded-xl bg-white/10 overflow-hidden flex items-center justify-center">
                            {a.image ? (
                              <img src={a.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-lg font-black text-intuition-primary/60">{String(a.label || '?')[0]}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-white truncate">{a.label || a.id}</div>
                            <div className="text-xs text-slate-400 font-mono truncate">{String(a.id).slice(0, 14)}…</div>
                            {a.description && <div className="text-[11px] text-slate-500 truncate mt-0.5">{a.description}</div>}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs font-semibold text-intuition-primary">{formatMarketValue(a.marketCap || '0')} {CURRENCY_SYMBOL}</div>
                            {a.positionCount != null && a.positionCount > 0 && <div className="text-[10px] text-slate-500">{a.positionCount} positions</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                    {!nodeSearching && nodeSearchResults.length === 0 && nodeSearchQuery.trim() && (
                      <p className="text-[10px] text-slate-500">No atoms found for “{nodeSearchQuery.trim()}”.</p>
                    )}
                    <div className="pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          setReturnToSynapseSlot(nodeSearchOpen);
                          setNodeAlias(nodeSearchQuery.trim() || 'New atom');
                          setNodeSearchOpen(null);
                          setNodeSearchQuery('');
                          setNodeSearchResults([]);
                          setNodeSearchError(null);
                          setView('construct_atom');
                        }}
                        className="w-full py-2 px-3 border border-dashed border-intuition-primary/50 text-intuition-primary hover:bg-intuition-primary/10 text-[10px] font-black uppercase tracking-widest transition-colors"
                      >
                        Create an atom (not on the network?)
                      </button>
                    </div>
                  </div>
                )}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 sm:justify-start">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <label className="shrink-0 text-sm font-semibold text-white">Initial deposit</label>
                    <input type="number" min={minClaimDeposit} step="0.01" value={synapseDeposit} onChange={(e) => setSynapseDeposit(e.target.value)} placeholder={minClaimDeposit} className={`w-28 ${CREATE_INPUT} py-2.5 font-mono text-sm`} />
                    <span className="ml-1"><CurrencySymbol size="md" className="text-intuition-primary/90" /></span>
                    <span className="text-xs text-slate-500">(min {minClaimDeposit})</span>
                  </div>
                  <button type="button" onClick={() => { playClick(); setView('claim_review'); }} disabled={!subjectId || !predicateId || !objectId} className={`${CREATE_BTN_VIOLET} ml-auto disabled:opacity-50`}>
                    Review
                  </button>
                </div>
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- CLAIM REVIEW & CONFIRM ----- */}
          {view === 'claim_review' && (
            <div className="w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              <div className="mb-8 flex w-full items-center justify-between">
                <button type="button" onClick={() => { playClick(); setView('claim'); }} onMouseEnter={playHover} className={`${CREATE_BACK} z-10`}>
                  <ArrowLeft size={14} /> Back
                </button>
                <span className={CREATE_STEP_VIOLET}>Create claim</span>
              </div>
              <h1 className={`${PAGE_HERO_TITLE} text-center mb-8`}>Review & confirm</h1>
              <div className="w-full max-w-md mx-auto space-y-5 text-left">
                <div className="rounded-[1.35rem] border border-violet-500/40 bg-[#04060c]/95 p-5 shadow-[0_0_36px_rgba(139,92,246,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
                  <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">Claim (triple)</div>
                  <div className="text-white font-mono text-[10px]">[{subjectLabel || subjectId?.slice(0, 10)}…] [{predicateLabel || predicateId?.slice(0, 10)}…] [{objectLabel || objectId?.slice(0, 10)}…]</div>
                  <div className="text-[10px] text-slate-400 mt-1 inline-flex items-baseline gap-1">Initial deposit: {synapseDeposit || '0'} <CurrencySymbol size="sm" /></div>
                </div>
                {tripleFee != null && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-400">Creation cost</span>
                    <span className="text-[#a855f7] font-mono inline-flex items-baseline gap-1">{tripleFee} <CurrencySymbol size="md" className="text-[#a855f7]/90" /></span>
                  </div>
                )}
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">Total cost</span>
                  <span className="text-white font-mono inline-flex items-baseline gap-1">{totalClaimCost ?? (synapseDeposit || '0')} <CurrencySymbol size="md" className="text-white/90" /></span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">Available balance</span>
                  <span className="text-white font-mono inline-flex items-baseline gap-1">{walletBalance || '—'} <CurrencySymbol size="md" className="text-white/90" /></span>
                </div>
                {claimReviewApproved === false && (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/40 rounded">
                    <Info size={14} className="text-amber-400 shrink-0" />
                    <p className="text-[10px] text-amber-200">
                      IntuRank needs you to approve its proxy so it can deposit in your name. This is a one-time approval.{' '}
                      <a href="https://docs.intuition.systems" target="_blank" rel="noopener noreferrer" className="text-intuition-primary hover:underline inline-flex items-center gap-1" onClick={playClick}>
                        Read more <ExternalLink size={10} />
                      </a>
                    </p>
                    <button type="button" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); playClick(); try { const acc = await ensureWallet(); setEnablingProtocol(true); await grantProxyApproval(acc); setClaimReviewApproved(true); toast.success('Protocol enabled.'); } catch (err: any) { toast.error(err?.message || err?.error?.message || 'Enable failed.'); } finally { setEnablingProtocol(false); } }} disabled={enablingProtocol} className="ml-auto py-2 px-4 bg-amber-500 text-black font-black text-[9px] uppercase tracking-widest rounded">
                      {enablingProtocol ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                )}
                <div className="flex items-start gap-2 p-3 bg-white/5 border-2 border-white/10">
                  <Info size={14} className="text-[#a855f7] shrink-0 mt-0.5" />
                  <p className="text-[10px] text-slate-400">You will be prompted to approve the transaction in your wallet. The total includes the protocol creation cost.</p>
                </div>
                {claimReviewAtomsValid === false && claimReviewMissingAtoms.length > 0 && (
                  <div className="p-3 border border-red-500/40 bg-red-500/10 rounded space-y-2">
                    <p className="text-[10px] text-red-200">
                      Atom(s) not found on-chain: {claimReviewMissingAtoms.join(', ')}. Create them first or pick existing atoms from search.
                    </p>
                    <p className="text-[10px] text-slate-400">If you&apos;re sure they exist on-chain, you can try anyway:</p>
                    <button
                      type="button"
                      onClick={() => { playClick(); setClaimReviewBypassValidation(true); }}
                      className="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2"
                    >
                      Try anyway
                    </button>
                  </div>
                )}
                {parseFloat(synapseDeposit || '0') < parseFloat(minClaimDeposit || '0.5') && (
                  <div className="p-3 border border-amber-500/40 bg-amber-500/10 rounded">
                    <p className="text-[10px] text-amber-200">Deposit below minimum. Increase to at least {minClaimDeposit} {CURRENCY_SYMBOL} to create the claim.</p>
                  </div>
                )}
                <div className="flex gap-4">
                  <button type="button" onClick={() => setView('claim')} className="flex-1 rounded-full border border-intuition-primary/45 py-3.5 font-semibold text-sm text-intuition-primary transition-all hover:bg-intuition-primary/10 hover:shadow-[0_0_20px_rgba(0,243,255,0.12)]">
                    Back
                  </button>
                  <button type="button" onClick={handleSubmitClaimFromReview} disabled={creatingSynapse || claimReviewApproved !== true || (claimReviewAtomsValid === false && !claimReviewBypassValidation) || parseFloat(synapseDeposit || '0') < parseFloat(minClaimDeposit || '0.5')} className="flex-1 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 font-bold text-sm text-white shadow-[0_0_28px_rgba(139,92,246,0.4)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                    {creatingSynapse ? <><Loader2 size={14} className="mr-2 inline animate-spin" /> Submitting…</> : 'Submit transactions'}
                  </button>
                </div>
              </div>
              {footer}
            </>
            </div>
          )}

          {/* ----- ESTABLISH_SYNAPSE (manual / legacy) ----- */}
          {view === 'establish_synapse' && (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300 fill-mode-both">
            <>
              <button type="button" onClick={() => setView('manual_pathway')} className={`absolute left-6 top-6 z-10 ${CREATE_BACK}`}>
                <ArrowLeft size={14} /> Back
              </button>
              <h1 className={`${PAGE_HERO_TITLE} mb-8 text-center`}>Create claim</h1>
              <div className="w-full max-w-2xl space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
                  {(['subject', 'predicate', 'object'] as const).map((role) => (
                    <div key={role} className={CREATE_TRIPLE_SLOT}>
                      <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">{role === 'subject' ? 'Subject' : role === 'predicate' ? 'Predicate' : 'Object'}</div>
                      {role === 'subject' && subjectId ? (
                        <div className="text-center">
                          <div className="text-white font-semibold text-sm truncate max-w-full" title={subjectId}>{subjectLabel || subjectId.slice(0, 12)}...</div>
                          <button type="button" onClick={() => { setSubjectId(''); setSubjectLabel(''); }} className="text-slate-300 text-xs font-medium mt-2 hover:text-white underline underline-offset-2">Clear</button>
                        </div>
                      ) : null}
                      {role === 'predicate' && predicateId ? (
                        <div className="text-center">
                          <div className="text-white font-semibold text-sm truncate max-w-full">{predicateLabel || predicateId.slice(0, 12)}...</div>
                          <button type="button" onClick={() => { setPredicateId(''); setPredicateLabel(''); }} className="text-slate-300 text-xs font-medium mt-2 hover:text-white underline underline-offset-2">Clear</button>
                        </div>
                      ) : null}
                      {role === 'object' && objectId ? (
                        <div className="text-center">
                          <div className="text-white font-semibold text-sm truncate max-w-full">{objectLabel || objectId.slice(0, 12)}...</div>
                          <button type="button" onClick={() => { setObjectId(''); setObjectLabel(''); }} className="text-slate-300 text-xs font-medium mt-2 hover:text-white underline underline-offset-2">Clear</button>
                        </div>
                      ) : null}
                      {((role === 'subject' && !subjectId) || (role === 'predicate' && !predicateId) || (role === 'object' && !objectId)) && (
                        <button type="button" onClick={() => setNodeSearchOpen(role)} className="group/btn flex flex-col items-center gap-2 text-white transition-colors hover:text-intuition-primary">
                          <Search size={28} className="text-intuition-primary transition-transform group-hover/btn:scale-105" />
                          <span className="text-sm font-bold uppercase">Connect node</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {nodeSearchOpen && (
                  <div className="space-y-3 rounded-[1.35rem] border border-intuition-primary/30 bg-[#03050d]/95 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                    <div className="flex gap-2">
                      <input
                        ref={nodeSearchInputRef}
                        value={nodeSearchQuery}
                        onChange={(e) => { setNodeSearchQuery(e.target.value); setNodeSearchError(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && runNodeSearch()}
                        placeholder="Search by label or term id..."
                        className={`flex-1 ${CREATE_INPUT} py-2.5 font-mono text-sm`}
                        autoComplete="off"
                        aria-label="Search atoms by label or term id"
                      />
                      <button type="button" onClick={runNodeSearch} disabled={nodeSearching} className="rounded-full bg-intuition-primary px-4 py-2.5 font-black text-[10px] uppercase text-black shadow-[0_0_16px_rgba(0,243,255,0.25)] transition-all hover:bg-white disabled:opacity-60">
                        {nodeSearching ? <Loader2 size={14} className="inline animate-spin" /> : 'Search'}
                      </button>
                      <button type="button" onClick={() => { setNodeSearchOpen(null); setNodeSearchResults([]); setNodeSearchError(null); }} className="rounded-full border border-white/15 px-4 py-2.5 text-[10px] text-slate-400 transition-colors hover:border-white/30 hover:text-white">Cancel</button>
                    </div>
                    {nodeSearchError && <p className="text-[10px] text-red-400">{nodeSearchError}</p>}
                    <div className="max-h-64 overflow-auto space-y-2">
                      {nodeSearching && <p className="text-[10px] text-slate-500 py-2">Searching the network…</p>}
                      {!nodeSearching && !nodeSearchQuery.trim() && nodeSearchResults.length > 0 && (
                        <p className="text-[10px] text-intuition-primary font-black uppercase tracking-widest mb-3 px-1 flex items-center gap-2">
                          <Sparkles size={10} /> Suggested for you
                        </p>
                      )}
                      {!nodeSearching && nodeSearchResults.map((a: any) => (
                        <button key={a.id} type="button" onClick={() => pickNode(nodeSearchOpen!, a.id, a.label)} className="w-full text-left p-3 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 hover:border-intuition-primary/40 flex items-center gap-3 transition-all">
                          <div className="shrink-0 w-10 h-10 rounded-xl bg-white/10 overflow-hidden flex items-center justify-center">
                            {a.image ? (
                              <img src={a.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-lg font-black text-intuition-primary/60">{String(a.label || '?')[0]}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-white truncate">{a.label || a.id}</div>
                            <div className="text-xs text-slate-400 font-mono truncate">{String(a.id).slice(0, 14)}…</div>
                            {a.description && <div className="text-[11px] text-slate-500 truncate mt-0.5">{a.description}</div>}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs font-semibold text-intuition-primary">{formatMarketValue(a.marketCap || '0')} {CURRENCY_SYMBOL}</div>
                            {a.positionCount != null && a.positionCount > 0 && <div className="text-[10px] text-slate-500">{a.positionCount} positions</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                    {!nodeSearching && nodeSearchResults.length === 0 && nodeSearchQuery.trim() && (
                      <p className="text-[10px] text-slate-500">No atoms found for “{nodeSearchQuery.trim()}”.</p>
                    )}
                    <div className="pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          playClick();
                          setReturnToSynapseSlot(nodeSearchOpen);
                          setNodeAlias(nodeSearchQuery.trim() || 'New atom');
                          setNodeSearchOpen(null);
                          setNodeSearchQuery('');
                          setNodeSearchResults([]);
                          setNodeSearchError(null);
                          setView('construct_atom');
                        }}
                        className="w-full py-2 px-3 border border-dashed border-intuition-primary/50 text-intuition-primary hover:bg-intuition-primary/10 text-[10px] font-black uppercase tracking-widest transition-colors"
                      >
                        Create an atom (not on the network?)
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">Initial deposit</label>
                    <input type="number" min="0" step="0.01" value={synapseDeposit} onChange={(e) => setSynapseDeposit(e.target.value)} className={`w-36 ${CREATE_INPUT} py-2.5 font-mono`} />
                  </div>
                  <div className="inline-flex items-baseline gap-1 text-[10px] text-slate-500">Min: {minClaimDeposit} <CurrencySymbol size="sm" /></div>
                  <button type="button" onClick={handleEstablishSynapse} disabled={creatingSynapse || !subjectId || !predicateId || !objectId || parseFloat(synapseDeposit || '0') < parseFloat(minClaimDeposit || '0.5')} className={`${CREATE_BTN_VIOLET} disabled:cursor-not-allowed disabled:opacity-50`}>
                    {creatingSynapse ? <Loader2 size={14} className="mr-2 inline animate-spin" /> : null} Establish claim
                  </button>
                </div>
              </div>
              {footer}
            </>
            </div>
          )}
        </div>
        <div className="mt-6 flex items-center justify-center gap-3 text-slate-700 text-[8px] font-black uppercase tracking-[0.4em] opacity-40">
          <Terminal size={10} /> HANDSHAKE_SECURE // {APP_VERSION_DISPLAY} INTURANK_PROTOCOL_ACTIVE
        </div>
      </div>
    </div>
  );
};

export default CreateSignal;
