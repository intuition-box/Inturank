
import React, { useEffect, useState } from 'react';
import { normalizeWebMediaUrl } from '../services/mediaUrl';
import { useAccount } from 'wagmi';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { connectWallet, getConnectedAccount, getWalletBalance, getLocalTransactions, getShareBalance, getQuoteRedeem } from '../services/web3';
import { getUserPositions, getUserHistory, getVaultsByIds } from '../services/graphql';
import { Wallet, User, Zap, Activity, Clock, AlertTriangle, RefreshCw, Loader2, ExternalLink, UserCircle } from 'lucide-react';
import { formatEther } from 'viem';
import { Transaction } from '../types';
import { toast } from '../components/Toast';
import { playHover, playClick } from '../services/audio';
import { Link } from 'react-router-dom';
import { CURRENCY_SYMBOL, DISTRUST_ATOM_ID } from '../constants';
import { CurrencySymbol } from '../components/CurrencySymbol';
import { formatDisplayedShares } from '../services/analytics';

const Dashboard: React.FC = () => {
  const { address: wagmiAddress } = useAccount();
  const [account, setAccount] = useState<string | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<string>('0.00');
  const [portfolioValue, setPortfolioValue] = useState('0.00');
  const [netPnL, setNetPnL] = useState<number>(0);
  const [chartData, setChartData] = useState<any[]>([]);

  // Sync from wagmi so we show content when user is connected (header already shows connected)
  useEffect(() => {
    if (wagmiAddress) {
      setAccount(wagmiAddress);
      fetchUserData(wagmiAddress);
    } else {
      setAccount(null);
      setLoading(false);
    }
  }, [wagmiAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUserData = async (address: string) => {
    setLoading(true);
    try {
      const bal = await getWalletBalance(address);
      setBalance(Number(bal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

      const chainHistory = await getUserHistory(address).catch(e => []);
      const localHistory = getLocalTransactions(address);

      const chainHashes = new Set(chainHistory.map(tx => tx.id.split('-')[0].toLowerCase()));
      const uniqueLocal = localHistory.filter(tx => !chainHashes.has(tx.id.toLowerCase()));

      const mergedHistory = [...uniqueLocal, ...chainHistory]
        .sort((a, b) => (a.timestamp || 0) - (a.timestamp || 0)); 
      
      setHistory(mergedHistory.slice().reverse());

      let runningDeposit = 0;
      let runningRedeem = 0;
      
      const historyPoints = mergedHistory.map(tx => {
          try {
              const val = parseFloat(formatEther(BigInt(tx.assets || '0')));
              if (tx.type === 'DEPOSIT') runningDeposit += val;
              else if (tx.type === 'REDEEM') runningRedeem += val;
          } catch {}
          return {
              name: tx.timestamp,
              val: runningDeposit - runningRedeem
          };
      });
      if (historyPoints.length > 0) historyPoints.unshift({ name: 0, val: 0 });
      setChartData(historyPoints);

      const graphPositions = await getUserPositions(address).catch(() => []);

      const DUST = 1e-8; // only show positions with real on-chain balance (exclude sold / dust)
      const livePositionsData = await Promise.all(
        graphPositions.map(async (p: any) => {
          try {
            const atom = p.vault?.term?.atom;
            const triple = p.vault?.term?.triple;
            const id = (p.vault?.term_id || atom?.term_id || triple?.term_id)?.toString?.()?.toLowerCase?.();
            if (!id) return null;

            const rawCurve = p.vault?.curve_id;
            const curveId = rawCurve != null ? Number(rawCurve) || 1 : 1;
            
            const sharesStr = await getShareBalance(address, id, curveId);
            const shares = typeof sharesStr === 'string' ? parseFloat(sharesStr) : Number(sharesStr ?? 0);
            if (!Number.isFinite(shares) || shares <= DUST) return null;

            const valueStr = await getQuoteRedeem(sharesStr, id, address, curveId);
            const value = parseFloat(valueStr);

            if (value <= 0.000001) return null;

            let label = `Node ${id.slice(0, 6)}`;
            let image = null;

            // Reconcile Opposition
            const isCounter = triple?.counter_term_id?.toLowerCase() === id.toLowerCase();
            const pointsToDistrust = triple?.object?.term_id?.toLowerCase().includes(DISTRUST_ATOM_ID.toLowerCase().slice(2));

            if (isCounter || pointsToDistrust) {
                const subjectLabel = triple?.subject?.label || triple?.subject?.id?.slice(0, 6) || 'NODE';
                label = `OPPOSING_${subjectLabel}`.toUpperCase();
                image = triple?.subject?.image;
            } else if (atom) {
              label = atom.label || label;
              image = atom.image;
            } else if (triple) {
              const s = triple.subject?.label || '...';
              const pred = triple.predicate?.label || 'LINK';
              const o = triple.object?.label || '...';
              label = `${s} ${pred} ${o}`;
              image = triple.subject?.image;
            }

            return { 
                id, 
                shares, 
                value, 
                label, 
                image 
            };
          } catch (e) {
            return null;
          }
        })
      );

      const activePositions = (livePositionsData.filter(Boolean) as any[]);

      const finalPositions = activePositions.map(item => {
          return {
            id: item.id,
            shares: item.shares,
            value: item.value,
            atom: { 
                label: item.label, 
                image: item.image 
            },
            isPending: false,
          };
      });

      setPositions(finalPositions);

      const currentVal = finalPositions.reduce((acc, cur) => acc + (cur.value || 0), 0);
      setPortfolioValue(currentVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
      setNetPnL((currentVal + runningRedeem) - runningDeposit);

    } catch (e) {
      console.error('Dashboard Sync Error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    playClick();
    const acc = await connectWallet();
    if (acc) {
      setAccount(acc);
      fetchUserData(acc);
    }
  };

  const handleRefresh = () => {
    playClick();
    toast.info('VERIFYING ON-CHAIN...');
    if (account) fetchUserData(account);
  };

  if (!account) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 font-mono">
        <div className="w-24 h-24 border-2 border-dashed border-intuition-border rounded-full flex items-center justify-center mb-8 animate-spin-slow">
          <Wallet size={40} className="text-intuition-primary" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2 font-display tracking-tight">Sign in required</h1>
        <p className="text-slate-400 text-sm font-sans mb-6 max-w-sm">Connect your wallet to view this dashboard.</p>
        <button 
          onClick={handleConnect}
          onMouseEnter={playHover}
          className="px-8 py-3 bg-intuition-primary text-black font-semibold font-sans rounded-xl hover:bg-white transition-colors"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pt-10 pb-20">
      <div className="mb-12 p-1 bg-gradient-to-r from-intuition-primary via-intuition-secondary to-intuition-primary rounded-none clip-path-slant">
        <div className="bg-black p-8 flex flex-col md:flex-row items-center gap-8 clip-path-slant relative">
          <button 
            onClick={handleRefresh}
            onMouseEnter={playHover}
            className="absolute top-4 right-4 text-intuition-primary hover:text-white transition-colors hover:rotate-180 duration-500 z-20" title="FORCE SYNC">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>

          <div className="w-24 h-24 bg-intuition-dark border-2 border-intuition-primary flex items-center justify-center shadow-[0_0_20px_rgba(255,80,57,0.3)] transition-shadow">
            <User size={48} className="text-intuition-primary" />
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                <span className="text-intuition-primary font-mono text-xs">PLAYER_ID</span>
                <Link 
                    to={`/profile/${account}`} 
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/10 text-white hover:bg-intuition-primary hover:text-black text-[10px] font-bold font-mono rounded transition-colors"
                >
                    <UserCircle size={12} /> VIEW PUBLIC PROFILE
                </Link>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white font-display tracking-tight mb-2">{account.slice(0, 6)}...{account.slice(-4)}</h1>
            <div className="flex flex-wrap gap-4 justify-center md:justify-start font-mono text-xs">
              <span className="bg-intuition-success/10 text-intuition-success px-2 py-1 border border-intuition-success/30">LEVEL: {positions.length > 0 ? 'TRADER' : 'NOVICE'}</span>
              <span className="bg-intuition-warning/10 text-intuition-warning px-2 py-1 border border-intuition-warning/30">POSITIONS: {positions.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full md:w-auto">
            <div className="bg-intuition-dark border border-intuition-border p-4 min-w-[140px] hover:border-intuition-primary/50 transition-colors group">
              <div className="text-[10px] text-slate-500 font-mono uppercase group-hover:text-intuition-primary transition-colors">Wallet Balance</div>
              <div className="text-xl font-bold text-white font-display inline-flex items-baseline gap-1"><CurrencySymbol size="lg" leading />{balance}</div>
            </div>

            <div className="bg-intuition-dark border border-intuition-border p-4 min-w-[140px] hover:border-intuition-success/50 transition-colors group">
              <div className="text-[10px] text-slate-500 font-mono uppercase group-hover:text-intuition-success transition-colors">Portfolio Value</div>
              <div className="text-xl font-bold text-intuition-success font-display inline-flex items-baseline gap-1"><CurrencySymbol size="lg" leading />{portfolioValue}</div>
            </div>

            <div className="bg-intuition-dark border border-intuition-border p-4 min-w-[140px] hover:border-intuition-secondary/50 transition-colors group hidden md:block">
              <div className="text-[10px] text-slate-500 font-mono uppercase group-hover:text-intuition-secondary transition-colors">Est. PnL</div>
              <div className={`text-xl font-bold font-display inline-flex items-baseline gap-1 ${netPnL >= -0.0001 ? 'text-emerald-400' : 'text-rose-400'}`}><CurrencySymbol size="lg" leading className="text-slate-500" />{netPnL > 0 ? '+' : ''}{netPnL.toFixed(4)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 px-2">
        <AlertTriangle size={14} className="text-yellow-500" />
        <p className="text-[10px] font-mono text-yellow-500/70">POSITIONS ARE VERIFIED DIRECTLY ON-CHAIN. IF YOU SOLD, HIT REFRESH TO CLEAR.</p>
      </div>

      <div className="border border-intuition-border bg-black mb-8 relative clip-path-slant">
        <div className="px-6 py-4 border-b border-intuition-border flex items-center justify-between bg-intuition-card">
          <h3 className="font-bold text-white font-display tracking-wider flex items-center gap-2"><Zap size={18} className="text-intuition-warning animate-pulse" /> ACTIVE_POSITIONS</h3>
          {loading && <span className="text-xs font-mono text-intuition-primary animate-pulse flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> VERIFYING...</span>}
        </div>
        <div className="overflow-x-auto min-h-[100px]">
          <table className="w-full text-left text-sm font-mono">
            <thead>
              <tr className="bg-intuition-dark text-slate-500 uppercase text-xs tracking-wider border-b border-intuition-border">
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Shares Held</th>
                <th className="px-6 py-4">Est. Value</th>
                <th className="px-6 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-intuition-border/30">
              {positions.length > 0 ? positions.map(pos => {
                const isOpposition = pos.atom?.label?.includes('OPPOSING');
                return (
                <tr 
                  key={pos.id} 
                  onMouseEnter={playHover}
                  className="hover:bg-intuition-primary/10 transition-colors group hover:shadow-[inset_0_0_10px_rgba(255,80,57,0.1)]"
                >
                  <td className="px-6 py-4">
                    <Link to={`/markets/${pos.id}`} className="flex items-center gap-3">
                      {pos.atom?.image && <img src={normalizeWebMediaUrl(pos.atom.image)} className="w-8 h-8 rounded-sm object-cover border border-intuition-primary/30" alt="" />}
                      <div className={`font-bold group-hover:text-intuition-primary transition-colors text-glow ${isOpposition ? 'text-intuition-danger' : 'text-white'}`}>{pos.atom?.label}</div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-[10px] text-slate-500 font-mono">{pos.id.slice(0, 8)}...</td>
                  <td className="px-6 py-4 text-white font-bold font-display text-lg">{formatDisplayedShares(pos.shares)}</td>
                  <td className="px-6 py-4 text-intuition-success inline-flex items-baseline gap-1">{(pos.value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} <CurrencySymbol size="md" className="text-intuition-success/90" /></td>
                  <td className="px-6 py-4 text-right"><span className="text-intuition-success text-xs font-bold border border-intuition-success/30 px-2 py-1 bg-intuition-success/10 rounded flex items-center justify-end gap-1"><ExternalLink size={10} /> ON-CHAIN</span></td>
                </tr>
              )}) : (!loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">NO ACTIVE POSITIONS. (Chain verified: 0)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="border border-intuition-border bg-black p-6 min-h-[300px] clip-path-slant">
          <h3 className="font-bold text-white font-display mb-4 flex items-center gap-2"><Clock size={18} className="text-intuition-secondary" /> TRANSACTION_LOGS</h3>
          <div className="space-y-2 font-mono text-xs overflow-y-auto max-h-[300px] custom-scrollbar">
            {history.length > 0 ? history.map((tx, idx) => (
              <div 
                key={tx.id + '-' + idx} 
                onMouseEnter={playHover}
                className="flex justify-between items-center p-3 border-b border-white/5 hover:bg-white/5 transition-colors relative overflow-hidden"
              >
                {/* Visual indicator for off-chain vs on-chain */}
                {tx.id && !tx.id.toString().startsWith('0x') && <div className="absolute left-0 top-0 h-full w-1 bg-yellow-500 animate-pulse"></div>}
                <div className="flex flex-col pl-2">
                  <span className={`font-bold ${tx.type === 'DEPOSIT' ? 'text-intuition-success' : 'text-intuition-danger'}`}>{tx.type === 'DEPOSIT' ? 'ACQUIRED' : 'LIQUIDATE'} {tx.assetLabel || 'Unknown'}</span>
                  <span className="text-slate-600">ID: {tx.vaultId ? tx.vaultId.toString().slice(0, 8) : '0x00'}...</span>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">
                    {(() => {
                        try {
                            const raw = tx.assets ? tx.assets.toString() : '0';
                            const val = raw.includes('.') ? parseFloat(raw) : parseFloat(formatEther(BigInt(raw)));
                            return val.toFixed(4);
                        } catch { return '0.0000'; }
                    })()} <CurrencySymbol size="md" className="text-intuition-primary/90" />
                  </div>
                  <div className="text-slate-500">{tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString() : 'Block #'}</div>
                </div>
              </div>
            )) : (<div className="text-slate-600 text-center py-4 border border-dashed border-slate-800">[NO HISTORY FOUND]</div>)}
          </div>
        </div>

        <div className="border border-intuition-border bg-black p-6 min-h-[300px] flex flex-col clip-path-slant hover:shadow-[0_0_20px_rgba(255,80,57,0.1)] transition-shadow">
          <h3 className="font-bold text-white font-display mb-4 flex items-center gap-2"><Activity size={18} className="text-intuition-primary animate-pulse" /> CAPITAL_DEPLOYMENT</h3>
          <div className="flex-1 w-full h-full min-h-[200px] flex items-center justify-center text-slate-600 font-mono text-xs">
            {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                          <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ff5039" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#ff5039" stopOpacity={0}/>
                          </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                      <XAxis dataKey="name" hide />
                      <YAxis hide />
                      <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }} />
                      <Area type="stepAfter" dataKey="val" stroke="#ff5039" fillOpacity={1} fill="url(#colorVal)" />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <span>INSUFFICIENT DATA FOR TELEMETRY</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
