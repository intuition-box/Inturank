import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Share2, Layers, ArrowUpRight, CheckCircle, User, AlertCircle, RefreshCw } from 'lucide-react';
import { getAgentById, getAgentTriples } from '../services/graphql';
import { depositToVault, connectWallet, getProtocolConfig, getWalletBalance, parseProtocolError } from '../services/web3';
import { Account, Triple } from '../types';
import TransactionModal from '../components/TransactionModal';
import { playClick } from '../services/audio';
import { CURRENCY_SYMBOL } from '../constants';
import { notifyProtocolXpEarned } from '../services/protocolXp';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { sendTransactionReceiptEmail } from '../services/emailNotifications';
import { formatDisplayedShares, formatMarketValue } from '../services/analytics';
import { formatEther, parseEther } from 'viem';

const AgentProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Account | null>(null);
  const [triples, setTriples] = useState<Triple[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [minDeposit, setMinDeposit] = useState('0.001');
  
  // Modal State
  const [txModal, setTxModal] = useState<{ isOpen: boolean; status: 'idle' | 'processing' | 'success' | 'error'; title: string; message: string; hash?: string }>({
    isOpen: false,
    status: 'idle',
    title: '',
    message: ''
  });

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [agentData, triplesData, config] = await Promise.all([
          getAgentById(id),
          getAgentTriples(id),
          getProtocolConfig()
        ]);
        
        if (!agentData) throw new Error("Agent Not Found");
        
        setAgent(agentData);
        setTriples(triplesData || []);
        setMinDeposit(config?.minDeposit || '0.001');
      } catch (err: any) {
        console.error("Profile Fetch Error:", err);
        setError("Unable to retrieve agent data. ID may be invalid or indexer is lagging.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleStake = async () => {
    if (!stakeAmount || !id) return;

    if (parseFloat(stakeAmount) < parseFloat(minDeposit)) {
        setTxModal({ isOpen: true, status: 'error', title: 'INVALID AMOUNT', message: `The protocol requires a minimum deposit of ${minDeposit} ${CURRENCY_SYMBOL}.` });
        return;
    }
    
    playClick();
    setTxModal({ isOpen: true, status: 'processing', title: 'PROCESSING PURCHASE', message: 'Initiating protocol handshake. Please confirm the transaction in your wallet...' });

    try {
      const wallet = await connectWallet();
      if (!wallet) {
        setTxModal({ isOpen: true, status: 'error', title: 'WALLET ERROR', message: 'Please connect your wallet first.' });
        return;
      }

      const balance = await getWalletBalance(wallet);
      if (parseFloat(stakeAmount) >= parseFloat(balance)) {
         setTxModal({ isOpen: true, status: 'error', title: 'INSUFFICIENT FUNDS', message: `You do not have enough ${CURRENCY_SYMBOL} to cover the deposit plus fees (0.5 ${CURRENCY_SYMBOL} + 5%).` });
         return;
      }
      
      const { hash, shares, assets } = await depositToVault(stakeAmount, id, wallet);
      notifyProtocolXpEarned({
        address: wallet,
        reasonKey: 'market_acquire',
        txHash: hash,
        depositTrustWei: parseEther(stakeAmount.trim() || '0'),
      });

      sendTransactionReceiptEmail(wallet, {
        txHash: hash,
        type: 'acquired',
        side: 'trust',
        marketLabel: agent?.label || 'Claim',
        sharesFormatted: formatDisplayedShares(shares),
        assetsFormatted: assets ? `${CURRENCY_SYMBOL}${formatMarketValue(parseFloat(formatEther(assets)))}` : `${CURRENCY_SYMBOL}${formatMarketValue(parseFloat(stakeAmount))}`,
      });

      setTxModal({ 
        isOpen: true, 
        status: 'success', 
        title: 'PURCHASE SUCCESSFUL', 
        message: 'The signal has been recorded. Your conviction is now reflected in the trust graph.',
        hash: hash
      });
      setStakeAmount('');
    } catch (e: any) {
      console.error(e);
      const friendlyMsg = parseProtocolError(e);
      setTxModal({ isOpen: true, status: 'error', title: 'TRANSACTION FAILED', message: friendlyMsg });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCw className="text-intuition-primary animate-spin" size={32} />
        <div className="text-intuition-primary animate-pulse font-mono tracking-widest text-xs uppercase">Decrypting_Global_Matrix...</div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <AlertCircle className="text-intuition-danger" size={48} />
        <div>
          <h2 className="text-xl font-bold text-white mb-2 font-display">CONNECTION INTERRUPTED</h2>
          <p className="text-slate-400 font-mono text-sm max-w-md uppercase tracking-tighter">{error || "Agent not found."}</p>
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="px-6 py-2 border border-intuition-primary text-intuition-primary font-mono text-xs hover:bg-intuition-primary hover:text-black transition-colors clip-path-slant"
        >
          RETRY UPLINK
        </button>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pt-10 pb-20">
      <TransactionModal 
         isOpen={txModal.isOpen} 
         status={txModal.status} 
         title={txModal.title} 
         message={txModal.message} 
         hash={txModal.hash} 
         onClose={() => setTxModal(prev => ({ ...prev, isOpen: false }))} 
      />

      <div className="glass-panel rounded-none border border-intuition-border p-8 mb-8 relative overflow-hidden clip-path-slant">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Shield size={200} />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start">
          <div className="w-32 h-32 bg-black border-2 border-intuition-primary flex items-center justify-center text-4xl font-bold text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] overflow-hidden clip-path-slant group">
            {agent.image ? (
                <img src={agent.image} alt={agent.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
            ) : (
                <User size={48} className="text-slate-700"/>
            )}
          </div>
          
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl sm:text-4xl font-bold text-white font-display tracking-tight leading-tight mb-2 break-words">
              {agent.label || 'Anonymous atom'}
            </h1>
            <div className="flex flex-col md:flex-row gap-4 text-[10px] text-slate-500 font-mono mb-6 uppercase">
              <span className="bg-black/30 px-3 py-1 border border-slate-800 break-all">UID: {agent.id}</span>
              {agent.block_number && (
                <span className="bg-black/30 px-3 py-1 border border-slate-800">Block: {agent.block_number}</span>
              )}
            </div>
            
            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
               <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs flex items-center gap-2 font-bold uppercase tracking-widest">
                 <CheckCircle size={14} /> {agent.type || 'Atom'}
               </div>
               <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-xs flex items-center gap-2 font-bold uppercase tracking-widest">
                 <Layers size={14} /> {triples.length} Semantic Links
               </div>
            </div>
          </div>

          <div className="w-full md:w-80 bg-black/40 border border-intuition-primary/30 p-6 clip-path-slant shadow-2xl relative group hover:border-intuition-primary transition-all duration-300">
            <div className="absolute inset-0 bg-intuition-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <h3 className="text-xs font-black font-display text-white uppercase tracking-widest mb-6 border-b border-white/10 pb-2">Acquire_Signals</h3>
            <div className="space-y-5 relative z-10">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-mono text-slate-500 uppercase font-black">Market_Price</span>
                <span className="text-white font-bold font-mono inline-flex items-baseline gap-1">1.2 <CurrencySymbol size="md" /></span>
              </div>
              <div className="relative group/input">
                <input 
                  type="number" 
                  placeholder={`Min: ${minDeposit}`}
                  className="w-full bg-black border border-slate-800 p-4 text-white font-mono text-xl focus:outline-none focus:border-intuition-primary transition-all clip-path-slant text-right"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-600 uppercase tracking-widest pointer-events-none group-focus-within/input:text-intuition-primary">Value_Input</div>
              </div>
              <button 
                onClick={handleStake}
                disabled={txModal.status === 'processing'}
                className="btn-cyber btn-cyber-cyan w-full py-4 text-sm font-black tracking-[0.2em]"
              >
                {txModal.status === 'processing' ? 'EXECUTING...' : 'CONFIRM_STAKE'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <h2 className="text-2xl font-black font-display text-white mb-6 flex items-center gap-3 uppercase tracking-tighter text-glow">
            <Share2 className="text-intuition-primary" />
            Semantic_Ingress_Logs
          </h2>
          
          <div className="space-y-2">
            {triples.length === 0 ? (
              <div className="p-20 text-center text-slate-700 font-mono border border-dashed border-slate-900 clip-path-slant bg-black/20 uppercase tracking-widest text-xs">
                NULL_SIGNAL_DETECTED
              </div>
            ) : (
              triples.map((triple, index) => (
                <div key={index} className="p-4 bg-[#05080f] border border-white/5 hover:border-intuition-primary/20 transition-all flex items-center justify-between group clip-path-slant">
                  <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono font-black uppercase tracking-tight">
                    <span className="px-3 py-1.5 bg-black border border-blue-500/20 text-blue-400 group-hover:border-blue-400 transition-colors">
                      {triple.subject?.label || triple.subject?.term_id?.slice(0,8) || 'Unknown'}
                    </span>
                    <ArrowUpRight size={14} className="text-slate-800 group-hover:text-intuition-primary transition-colors" />
                    <span className="px-3 py-1.5 bg-black border border-purple-500/20 text-purple-400 group-hover:border-purple-400 transition-colors italic">
                      {triple.predicate?.label || triple.predicate?.term_id?.slice(0,8) || 'Unknown'}
                    </span>
                    <ArrowUpRight size={14} className="text-slate-800 group-hover:text-intuition-primary transition-colors" />
                    <span className="px-3 py-1.5 bg-black border border-emerald-500/20 text-emerald-400 group-hover:border-emerald-400 transition-colors">
                      {triple.object?.label || triple.object?.term_id?.slice(0,8) || 'Unknown'}
                    </span>
                  </div>
                  <div className="text-[8px] text-slate-700 hidden sm:block font-mono group-hover:text-slate-400 transition-colors">
                    INDEX_ID: {triple.block_number || 'SYNCED'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
           <h2 className="text-2xl font-black font-display text-white mb-6 uppercase tracking-tighter">Market_Telemetry</h2>
           <div className="bg-[#05080f] border border-intuition-border p-8 space-y-8 clip-path-slant shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none"></div>
              
              <div className="group/stat">
                <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-2 font-black group-hover/stat:text-intuition-primary transition-colors">Total_Global_Stake</div>
                <div className="text-3xl font-black font-mono text-white tracking-tighter inline-flex items-baseline gap-2">-- <CurrencySymbol size="lg" className="text-slate-600" /></div>
              </div>

              <div className="group/stat">
                <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-2 font-black group-hover/stat:text-intuition-primary transition-colors">Node_Validators</div>
                <div className="text-3xl font-black font-mono text-white tracking-tighter">--</div>
              </div>

              <div className="group/stat">
                <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-2 font-black group-hover/stat:text-intuition-primary transition-colors">Capital_Concentration</div>
                <div className="text-3xl font-black font-mono text-white tracking-tighter">--</div>
              </div>

              <div className="pt-6 border-t border-white/5">
                <p className="text-[9px] text-slate-600 italic font-mono leading-relaxed uppercase">
                  * Sector Analytics pending Indexer L3 neural convergence. Standby for real-time telemetry.
                </p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AgentProfile;