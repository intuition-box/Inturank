import React, { useState, useEffect, useRef } from 'react';
import { X, User, Database, Network, Info, Loader2, Zap, ArrowRight, ShieldCheck, Cpu, Camera, Search, ChevronRight, HelpCircle, UserPlus, CheckCircle2, Globe, Fingerprint, Trash2, Plus, Terminal as TerminalIcon, ExternalLink, RefreshCw, AlertTriangle, Coins, Sparkles } from 'lucide-react';
import { playClick, playHover } from '../services/audio';
import { getConnectedAccount, createIdentityAtom, createSemanticTriple, parseProtocolError, getWalletBalance, publicClient, getAtomCreationCost, estimateAtomGas, getMinClaimDeposit, getTotalTripleCreationCost, getProxyApprovalStatus, grantProxyApproval, markProxyApproved, calculateTripleId } from '../services/web3';
import { searchGlobalAgents, getAllAgents } from '../services/graphql';
import { Account } from '../types';
import { toast } from './Toast';
import { formatEther, parseEther } from 'viem';
import { EXPLORER_URL, CURRENCY_SYMBOL } from '../constants';
import { CurrencySymbol } from './CurrencySymbol';
import { notifyProtocolXpEarned } from '../services/protocolXp';

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalView = 'IDLE' | 'CLAIM_OVERVIEW' | 'SELECTOR' | 'IDENTITY_CREATOR';
type SelectionTarget = 'subject' | 'predicate' | 'object';
type TxStatus = 'IDLE' | 'CALCULATING' | 'SIGNING' | 'BROADCASTING' | 'CONFIRMING' | 'SUCCESS' | 'ERROR';

const TxTerminal = ({ status, txHash, termId, error, onRetry, onClose }: { 
    status: TxStatus, 
    txHash?: string, 
    termId?: string,
    error?: string, 
    onRetry: () => void,
    onClose: () => void
}) => {
    if (status === 'IDLE') return null;

    return (
        <div className="absolute inset-0 z-50 bg-black/95 flex items-center justify-center p-8 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-black border-2 border-intuition-primary/40 clip-path-slant p-8 relative overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none"></div>
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-intuition-primary/10 border border-intuition-primary/40 rounded-xl text-intuition-primary animate-pulse">
                        <TerminalIcon size={24} />
                    </div>
                    <div>
                        <h4 className="text-xl font-black font-display text-white tracking-wide">Transaction</h4>
                        <div className="text-[10px] font-mono text-slate-500">Sending to the network…</div>
                    </div>
                </div>
                <div className="space-y-6 font-mono relative z-10">
                    <div className="flex items-center gap-4 text-xs">
                        <div className={`w-2 h-2 rounded-full ${status !== 'ERROR' ? 'bg-intuition-primary animate-ping' : 'bg-intuition-danger'}`}></div>
                        <span className="text-slate-500 uppercase tracking-widest">Status</span>
                        <span className={`font-black uppercase tracking-widest ${status === 'SUCCESS' ? 'text-intuition-success' : status === 'ERROR' ? 'text-intuition-danger' : 'text-intuition-primary'}`}>
                            {status}
                        </span>
                    </div>
                    <div className="p-6 bg-white/5 border border-white/5 clip-path-slant min-h-[100px] flex flex-col justify-center">
                        {status === 'CALCULATING' && <p className="text-sm text-slate-400 leading-relaxed animate-pulse">Working out cost and gas…</p>}
                        {status === 'SIGNING' && <p className="text-sm text-slate-400 leading-relaxed">Confirm in your wallet.</p>}
                        {status === 'BROADCASTING' && <p className="text-sm text-slate-400 leading-relaxed">Broadcasting transaction…</p>}
                        {status === 'CONFIRMING' && <p className="text-sm text-slate-400 leading-relaxed animate-pulse">Waiting for confirmation…</p>}
                        {status === 'SUCCESS' && (
                            <div className="space-y-2">
                                <p className="text-sm text-intuition-success leading-relaxed font-bold">Done.</p>
                                <p className="text-xs text-slate-400 leading-relaxed">Your transaction is on-chain.</p>
                            </div>
                        )}
                        {status === 'ERROR' && (
                            <div className="space-y-3">
                                <p className="text-sm text-intuition-danger leading-relaxed font-bold">Something went wrong</p>
                                <p className="text-xs text-slate-500">{error || 'Transaction failed.'}</p>
                            </div>
                        )}
                    </div>
                    {txHash && (
                        <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 bg-black border border-white/10 hover:border-intuition-primary transition-all text-[9px] text-slate-400 uppercase group">
                            <span className="truncate mr-4">Hash: {txHash}</span>
                            <ExternalLink size={12} className="shrink-0 group-hover:text-intuition-primary" />
                        </a>
                    )}
                    <div className="pt-4 flex flex-col gap-3">
                        {status === 'SUCCESS' && termId && (
                            <a 
                                href={`/markets/${termId}`}
                                onClick={() => { playClick(); onClose(); }}
                                className="w-full py-4 bg-intuition-primary text-black font-black uppercase text-xs tracking-widest clip-path-slant flex items-center justify-center gap-2 hover:bg-white transition-all shadow-[0_0_20px_rgba(0,243,255,0.3)]"
                            >
                                <ExternalLink size={14} /> Open market page
                            </a>
                        )}
                        <div className="flex gap-3 w-full">
                            {status === 'ERROR' ? (
                                <button onClick={onRetry} className="flex-1 py-4 bg-white text-black font-black uppercase text-[10px] tracking-widest clip-path-slant flex items-center justify-center gap-2">
                                    <RefreshCw size={14} /> Try again
                                </button>
                            ) : status === 'SUCCESS' ? (
                                <button onClick={onClose} className="flex-1 py-4 bg-intuition-success text-black font-black uppercase text-[10px] tracking-widest clip-path-slant">
                                    Close
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CreateModal: React.FC<CreateModalProps> = ({ isOpen, onClose }) => {
  const [view, setView] = useState<ModalView>('IDLE');
  const [target, setTarget] = useState<SelectionTarget>('subject');
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus>('IDLE');
  const [txHash, setTxHash] = useState<string | undefined>();
  const [createdTermId, setCreatedTermId] = useState<string | undefined>();
  const [txError, setTxError] = useState<string | undefined>();
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>('0.00');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [returnTo, setReturnTo] = useState<ModalView>('IDLE');

  const [tripleForm, setTripleForm] = useState({
    subject: null as Account | null,
    predicate: null as Account | null,
    object: null as Account | null,
    deposit: '0.5'
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Account[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedInSearch, setSelectedInSearch] = useState<Account | null>(null);

  const [identityForm, setIdentityForm] = useState({
    name: '',
    description: '',
    image: '',
    type: 'Person' as 'Person' | 'Organization' | 'Thing' | 'Account',
    deposit: '0.5',
    links: [{ label: 'Website', url: '' }]
  });

  const [estCost, setEstCost] = useState<string | null>(null);
  const [estGas, setEstGas] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [minClaimDeposit, setMinClaimDeposit] = useState<string>('0.5');
  const [totalClaimCost, setTotalClaimCost] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const init = async () => {
        const acc = await getConnectedAccount();
        setWallet(acc);
        if (acc) {
          try {
            const bal = await getWalletBalance(acc);
            setWalletBalance(bal);
          } catch (e) {
            console.error("FATAL_WALLET_SYNC:", e);
          }
        }
      };
      init();
      resetModal();
    }
  }, [isOpen]);

  useEffect(() => {
    if (view === 'IDENTITY_CREATOR' && identityForm.name.length >= 2 && wallet) {
        const timer = setTimeout(async () => {
            setIsEstimating(true);
            try {
                const [cost, gas] = await Promise.all([
                    getAtomCreationCost({
                        name: identityForm.name,
                        description: identityForm.description,
                        type: identityForm.type
                    }, identityForm.deposit),
                    estimateAtomGas(wallet!, {
                        name: identityForm.name,
                        description: identityForm.description,
                        type: identityForm.type
                    }, identityForm.deposit)
                ]);
                setEstCost(formatEther(cost));
                setEstGas(formatEther(gas));
            } catch (e) {
                console.error("UI_ESTIMATION_FAILED:", e);
                setEstCost(null);
                setEstGas(null);
            } finally {
                setIsEstimating(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [identityForm.name, identityForm.deposit, identityForm.type, view, wallet]);

  useEffect(() => {
    if (view === 'CLAIM_OVERVIEW') {
      getMinClaimDeposit().then(setMinClaimDeposit).catch(() => setMinClaimDeposit('0.5'));
    }
  }, [view]);

  useEffect(() => {
    if (view === 'CLAIM_OVERVIEW' && tripleForm.deposit && parseFloat(tripleForm.deposit) >= parseFloat(minClaimDeposit)) {
      getTotalTripleCreationCost(tripleForm.deposit).then(setTotalClaimCost).catch(() => setTotalClaimCost(null));
    } else {
      setTotalClaimCost(null);
    }
  }, [view, tripleForm.deposit, minClaimDeposit]);

  useEffect(() => {
    if (view !== 'SELECTOR') return;
    
    if (searchTerm.length === 0) {
      setIsSearching(true);
      getAllAgents(12, 0).then(res => {
        setSearchResults(res.items as unknown as Account[]);
      }).catch(() => {
        setSearchResults([]);
      }).finally(() => {
        setIsSearching(false);
      });
      return;
    }

    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchGlobalAgents(searchTerm);
        setSearchResults(results as unknown as Account[]);
      } catch (e) {
        console.error("AGENT_SEARCH_CRASH:", e);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, view]);

  const resetModal = () => {
    setView('IDLE');
    setTxStatus('IDLE');
    setTxHash(undefined);
    setCreatedTermId(undefined);
    setTxError(undefined);
    setTripleForm({ subject: null, predicate: null, object: null, deposit: '0.5' });
    setSearchTerm('');
    setSelectedInSearch(null);
    setEstCost(null);
    setEstGas(null);
    setIdentityForm({
        name: '',
        description: '',
        image: '',
        type: 'Person',
        deposit: '0.5',
        links: [{ label: 'Website', url: '' }]
    });
  };

  const handleOpenSelector = (target: SelectionTarget) => {
    playClick();
    setTarget(target);
    setSearchTerm('');
    setSelectedInSearch(tripleForm[target]);
    setView('SELECTOR');
  };

  const handleConfirmSelection = () => {
    if (!selectedInSearch) return;
    playClick();
    setTripleForm(prev => ({ ...prev, [target]: selectedInSearch }));
    setView('CLAIM_OVERVIEW');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        toast.error('Image must be under 1 MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdentityForm({ ...identityForm, image: reader.result as string });
        playSuccess();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateIdentity = async () => {
    if (!wallet || !identityForm.name || !identityForm.deposit || parseFloat(identityForm.deposit) < 0.5) return;
    const totalRequired = (parseFloat(estCost || '0.5') + parseFloat(estGas || '0.0008'));
    if (parseFloat(walletBalance) < totalRequired) {
        toast.error(`Not enough ${CURRENCY_SYMBOL}. You have ${parseFloat(walletBalance).toFixed(4)}.`);
        return;
    }
    setTxStatus('CALCULATING');
    setTxError(undefined);
    try {
      const metadata = { name: identityForm.name, description: identityForm.description, image: identityForm.image, type: identityForm.type, links: identityForm.links.filter(l => l.url) };
      await new Promise(r => setTimeout(r, 1000));
      setTxStatus('SIGNING');
      const { hash, termId } = await createIdentityAtom(metadata, identityForm.deposit, wallet);
      markProxyApproved(wallet);
      setTxHash(hash);
      setCreatedTermId(termId);
      setTxStatus('BROADCASTING');
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStatus('CONFIRMING');
      await new Promise(r => setTimeout(r, 1000));
      setTxStatus('SUCCESS');
      notifyProtocolXpEarned({
        address: wallet,
        reasonKey: 'create_atom',
        txHash: hash,
        depositTrustWei: parseEther(identityForm.deposit.trim() || '0'),
      });
    } catch (e: any) {
      setTxError(parseProtocolError(e));
      setTxStatus('ERROR');
    }
  };

  const handleFinalizeTriple = async () => {
    if (!wallet || !tripleForm.subject || !tripleForm.predicate || !tripleForm.object) return;
    const depositNum = parseFloat(tripleForm.deposit || '0');
    const minNum = parseFloat(minClaimDeposit);
    if (depositNum < minNum) {
      toast.error(`Minimum deposit is ${minClaimDeposit} ${CURRENCY_SYMBOL}. You entered ${tripleForm.deposit}.`);
      return;
    }
    setTxStatus('CALCULATING');
    setTxError(undefined);
    try {
      await new Promise(r => setTimeout(r, 800));
      setTxStatus('SIGNING');
      const approved = await getProxyApprovalStatus(wallet);
      if (!approved) await grantProxyApproval(wallet);
      
      // Calculate termId locally for immediate feedback link
      const termId = calculateTripleId(tripleForm.subject.id, tripleForm.predicate.id, tripleForm.object.id);
      
      const hash = await createSemanticTriple(tripleForm.subject.id, tripleForm.predicate.id, tripleForm.object.id, tripleForm.deposit, wallet);
      markProxyApproved(wallet);
      setTxHash(hash);
      setCreatedTermId(termId);
      setTxStatus('BROADCASTING');
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStatus('CONFIRMING');
      await new Promise(r => setTimeout(r, 1000));
      setTxStatus('SUCCESS');
      notifyProtocolXpEarned({
        address: wallet,
        reasonKey: 'create_claim',
        txHash: hash,
        depositTrustWei: parseEther(tripleForm.deposit.trim() || '0'),
      });
    } catch (e: any) {
      setTxError(parseProtocolError(e));
      setTxStatus('ERROR');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300">
      <div className="relative w-full max-w-[95vw] sm:max-w-[850px] bg-[#0c0c0c] border border-white/10 rounded-[32px] shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col max-h-[90vh]">
        <TxTerminal status={txStatus} txHash={txHash} termId={createdTermId} error={txError} onRetry={() => setTxStatus('IDLE')} onClose={onClose} />
        <div className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-4 md:py-6 border-b border-white/5 bg-black/20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-white border border-white/10 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]">
              {view === 'IDLE' ? <Zap size={20} /> : view === 'CLAIM_OVERVIEW' ? <Network size={20} /> : view === 'SELECTOR' ? <Search size={20} /> : <UserPlus size={20} />}
            </div>
            <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                    {view === 'IDLE' && 'Create'}
                    {view === 'CLAIM_OVERVIEW' && 'New claim'}
                    {view === 'SELECTOR' && `Pick ${target}`}
                    {view === 'IDENTITY_CREATOR' && 'New atom'}
                </h2>
                <div className="text-xs text-slate-500">
                    {view === 'IDLE' && 'Atoms are atoms · Claims are claims'}
                    {view === 'CLAIM_OVERVIEW' && 'Subject + predicate + object, then deposit'}
                    {view === 'SELECTOR' && 'Search or create a new atom'}
                    {view === 'IDENTITY_CREATOR' && 'A person, org, thing, or account on the graph'}
                </div>
            </div>
          </div>
          <button onClick={() => { playClick(); onClose(); }} className="min-w-[44px] min-h-[44px] w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-500 hover:text-white transition-all"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {view === 'IDLE' && (
            <div className="p-4 sm:p-6 md:p-8 lg:p-12 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 animate-in fade-in zoom-in-95 duration-500">
                <button onClick={() => { playClick(); setReturnTo('IDLE'); setView('IDENTITY_CREATOR'); }} onMouseEnter={playHover} className="group relative p-6 md:p-8 lg:p-10 bg-[#080a12] border border-white/10 hover:border-intuition-primary rounded-[32px] text-left transition-all overflow-hidden shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-intuition-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="w-16 h-16 bg-black border-2 border-intuition-primary rounded-2xl flex items-center justify-center mb-8 group-hover:bg-intuition-primary group-hover:text-black transition-all shadow-lg"><Database size={32} /></div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Create an atom</h3>
                    <p className="text-sm text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">Mint a single node — a person, a project, a token, anything you want to trade or point at.</p>
                    <div className="mt-8 flex items-center gap-2 text-xs font-bold text-intuition-primary group-hover:translate-x-2 transition-transform">Continue <ArrowRight size={14} /></div>
                </button>
                <button onClick={() => { playClick(); setView('CLAIM_OVERVIEW'); }} onMouseEnter={playHover} className="group relative p-6 md:p-8 lg:p-10 bg-[#080a12] border border-white/10 hover:border-intuition-secondary rounded-[32px] text-left transition-all overflow-hidden shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-intuition-secondary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="w-16 h-16 bg-black border-2 border-intuition-secondary rounded-2xl flex items-center justify-center mb-8 group-hover:bg-intuition-secondary group-hover:text-black transition-all shadow-lg"><Network size={32} /></div>
                    <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Create a claim</h3>
                    <p className="text-sm text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">Link three atoms: subject, predicate, and object. That’s a claim — it gets its own market and leaderboard.</p>
                    <div className="mt-8 flex items-center gap-2 text-xs font-bold text-intuition-secondary group-hover:translate-x-2 transition-transform">Continue <ArrowRight size={14} /></div>
                </button>
            </div>
          )}
          {view === 'SELECTOR' && (
            <div className="p-4 sm:p-6 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center gap-4">
                  <button onClick={() => setView('CLAIM_OVERVIEW')} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-white transition-colors"><ArrowRight size={16} className="rotate-180"/></button>
                  <div className="relative flex-1 group">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-intuition-primary transition-colors" size={18} />
                     <input 
                        autoFocus
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        placeholder={`Search for ${target}...`} 
                        className="w-full bg-black border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-white font-medium focus:border-intuition-primary transition-all outline-none"
                     />
                  </div>
               </div>

               <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {isSearching ? (
                     <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="animate-spin text-intuition-primary" size={32} />
                        <span className="text-sm text-slate-500">Searching…</span>
                     </div>
                  ) : (
                    <>
                      {!searchTerm && searchResults.length > 0 && (
                        <div className="flex items-center gap-2 px-2 mb-4">
                          <Sparkles size={12} className="text-intuition-primary" />
                          <span className="text-[10px] font-black text-intuition-primary uppercase tracking-[0.2em]">Suggested Identities</span>
                        </div>
                      )}
                      {searchResults.length > 0 ? (
                        searchResults.map((a) => (
                          <button 
                              key={a.id} 
                              onClick={() => { setSelectedInSearch(a); handleConfirmSelection(); }}
                              className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${selectedInSearch?.id === a.id ? 'bg-intuition-primary/10 border-intuition-primary shadow-[0_0_20px_rgba(0,243,255,0.1)]' : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/[0.08]'}`}
                          >
                              <div className="w-12 h-12 bg-black border border-white/10 rounded-xl overflow-hidden shrink-0">
                                {a.image ? <img src={a.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-900">{target === 'predicate' ? <Zap size={20}/> : <User size={20}/>}</div>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-white truncate">{a.label}</div>
                                <div className="text-[10px] text-slate-500 font-mono truncate">{a.id.slice(0, 18)}...</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-[10px] font-black text-white uppercase">{target === 'predicate' ? 'Predicate' : 'Atom'}</div>
                                <div className="text-[9px] text-slate-500 font-mono mt-1">{a.positionCount || 0} Holders</div>
                              </div>
                          </button>
                        ))
                      ) : (
                        <div className="text-center py-20">
                           <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No entries found in this sector.</div>
                        </div>
                      )}
                    </>
                  )}
               </div>

               <button 
                  onClick={() => {
                    playClick();
                    setReturnTo('SELECTOR');
                    setIdentityForm({ ...identityForm, name: searchTerm });
                    setView('IDENTITY_CREATOR');
                  }}
                  className="w-full py-4 border-2 border-dashed border-white/10 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:border-intuition-primary/40 hover:text-white transition-all"
               >
                  Create a new atom instead
               </button>
            </div>
          )}
          {view === 'CLAIM_OVERVIEW' && (
            <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 sm:gap-4">
                  <button onClick={() => setView('IDLE')} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-white transition-colors"><ArrowRight size={16} className="rotate-180"/></button>
                  <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-2xl">Pick three atoms to form your claim. You can trade on it and climb the Arena leaderboard.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(['subject', 'predicate', 'object'] as const).map((key) => (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center gap-1.5 px-1"><span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{key}</span></div>
                    <button onClick={() => handleOpenSelector(key)} className={`w-full h-24 flex items-center gap-4 px-6 rounded-[24px] border-2 transition-all group relative overflow-hidden ${tripleForm[key] ? 'bg-white/5 border-white/20' : 'bg-black/40 border-white/5 border-dashed hover:border-intuition-primary/40 hover:bg-white/5'}`}>
                      {tripleForm[key] ? (
                        <>
                          <div className="w-12 h-12 bg-black border border-white/10 rounded-xl overflow-hidden shrink-0">
                            {tripleForm[key]?.image ? <img src={tripleForm[key]?.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-900">{key === 'predicate' ? <Zap size={20}/> : <User size={20}/>}</div>}
                          </div>
                          <div className="text-left min-w-0">
                            <div className="text-sm font-bold text-white truncate">{tripleForm[key]?.label}</div>
                            <div className="text-[10px] text-slate-500 font-mono truncate">{tripleForm[key]?.id.slice(0, 12)}...</div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-4 text-slate-600 group-hover:text-slate-400 transition-colors w-full">
                           <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/5">{key === 'predicate' ? <Plus size={20}/> : <User size={20}/>}</div>
                           <span className="font-bold text-sm uppercase tracking-widest">{key}</span>
                        </div>
                      )}
                    </button>
                  </div>
                ))}
              </div>
              <div className="max-w-xs mx-auto pt-6">
                <div className="flex justify-between items-center mb-3 px-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Initial Deposit</span>
                  <span className="text-[9px] font-mono text-slate-600">Min: {minClaimDeposit} <CurrencySymbol size="sm" /></span>
                </div>
                <div className="relative group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-intuition-primary transition-colors"><Zap size={18}/></div>
                  <input type="number" step="0.01" min={minClaimDeposit} value={tripleForm.deposit} onChange={(e) => setTripleForm({...tripleForm, deposit: e.target.value})} className="w-full bg-black border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-2xl font-bold text-white outline-none focus:border-intuition-primary transition-all text-right shadow-inner" placeholder={minClaimDeposit} />
                </div>
                {totalClaimCost && parseFloat(totalClaimCost) > 0 && (
                  <div className="mt-3 p-3 border border-slate-900 bg-black/40 rounded-xl">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total cost (deposit + fees)</span>
                    <div className="text-lg font-black text-white mt-1">{parseFloat(totalClaimCost).toFixed(4)} <CurrencySymbol size="md" /></div>
                  </div>
                )}
              </div>
              <div className="pt-10">
                <button onClick={handleFinalizeTriple} disabled={loading || !tripleForm.subject || !tripleForm.predicate || !tripleForm.object || parseFloat(tripleForm.deposit || '0') < parseFloat(minClaimDeposit)} className={`w-full py-6 rounded-[24px] text-lg font-black uppercase tracking-widest transition-all ${!tripleForm.subject || !tripleForm.predicate || !tripleForm.object || parseFloat(tripleForm.deposit || '0') < parseFloat(minClaimDeposit) ? 'bg-white/5 text-slate-600 cursor-not-allowed border border-white/5' : 'bg-white text-black hover:scale-[1.01] shadow-[0_20px_50px_rgba(255,255,255,0.1)]'}`}>Create claim</button>
              </div>
            </div>
          )}
          {view === 'IDENTITY_CREATOR' && (
            <div className="p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
                  <div className="md:col-span-4 space-y-6">
                     <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Image</label>
                        <div onClick={() => fileInputRef.current?.click()} className="aspect-square bg-black border-2 border-dashed border-white/10 rounded-[32px] flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-intuition-primary/40 hover:bg-white/5 transition-all group overflow-hidden shadow-2xl">
                           {identityForm.image ? <img src={identityForm.image} className="w-full h-full object-cover" /> : <><div className="p-4 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform"><Camera size={32} className="text-slate-600" /></div><div className="text-center"><div className="text-[10px] font-black text-white uppercase tracking-widest">Upload</div></div></>}
                           <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                        </div>
                     </div>
                  </div>
                  <div className="md:col-span-8 space-y-6">
                     <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Name</label>
                        <input value={identityForm.name} onChange={e => setIdentityForm({...identityForm, name: e.target.value})} placeholder="Name your atom" className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 text-white font-medium focus:border-intuition-primary transition-all outline-none" />
                     </div>
                     <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1 inline-flex items-center gap-1">Initial Deposit (<CurrencySymbol size="sm" />)</label>
                        <div className="relative group">
                          <input type="number" step="0.1" min="0.5" value={identityForm.deposit} onChange={e => setIdentityForm({...identityForm, deposit: e.target.value})} placeholder="0.5" className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 text-white font-medium focus:border-intuition-primary transition-all outline-none" />
                          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-baseline"><CurrencySymbol size="md" className="text-slate-600 font-black" /></div>
                        </div>
                        <div className="mt-4 p-4 border-2 border-slate-900 bg-black clip-path-slant flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Estimated total</span>
                                <span className="text-xl font-black text-white font-display inline-flex items-baseline gap-1">
                                    {(() => {
                                        const c = parseFloat(estCost || '0.5');
                                        const g = parseFloat(estGas || '0.0008');
                                        // Total includes atom cost (fee + deposit) + gas
                                        // Since estCost already has buffer, we just sum them
                                        const sum = c + g;
                                        return sum > 0 ? sum.toFixed(4) : '--';
                                    })()} <CurrencySymbol size="lg" />
                                </span>
                            </div>
                        </div>
                        <p className="text-[11px] text-slate-600 px-1">Includes deposit and fees. Pricing follows the bonding curve.</p>
                     </div>
                     <div className="pt-4 flex gap-4">
                        <button onClick={() => { playClick(); setView(returnTo); }} className="flex-1 py-5 rounded-[24px] border border-white/10 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-white/5 transition-all">Back</button>
                        <button onClick={handleCreateIdentity} disabled={loading || !identityForm.name} className="flex-[2] py-5 bg-intuition-primary text-black rounded-[24px] font-black uppercase text-xs tracking-[0.2em] hover:scale-[1.02] transition-all shadow-[0_20px_50px_rgba(255,255,255,0.2)]">Create atom</button>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
        <div className="bg-black/60 border-t border-white/5 p-5 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-center">
           <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-intuition-success animate-pulse shadow-[0_0_8px_#00ff9d]" />
             <span className="text-xs text-slate-500">Ready to create on IntuRank</span>
           </div>
           <span className="text-[11px] text-slate-600 hidden sm:inline">·</span>
           <span className="text-[11px] text-slate-600">Your wallet signs each transaction</span>
        </div>
      </div>
    </div>
  );
};

export default CreateModal;