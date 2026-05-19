/**
 * Add identity to list — creates triple (subject=atom, predicate=LIST_PREDICATE, object=list).
 * Mirrors Intuition Portal "Add to List" / "Locked In" flow.
 */
import React, { useState, useCallback } from 'react';
import { X, Plus, Loader2, Lock } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { parseEther } from 'viem';
import { searchGlobalAgents, getAllAgents } from '../services/graphql';
import { createSemanticTriple, getConnectedAccount, getProxyApprovalStatus, grantProxyApproval, markProxyApproved } from '../services/web3';
import { LIST_PREDICATE_ID } from '../constants';
import { notifyProtocolXpEarned } from '../services/protocolXp';
import { playClick, playHover } from '../services/audio';
import { toast } from './Toast';
import TransactionModal from './TransactionModal';

const MIN_DEPOSIT = '0.5'; // Protocol minimum (CURVE_OFFSET)

interface AddToListModalProps {
  isOpen: boolean;
  listId: string;
  listLabel: string;
  onClose: () => void;
  onSuccess: () => void;
}

const AddToListModal: React.FC<AddToListModalProps> = ({ isOpen, listId, listLabel, onClose, onSuccess }) => {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedAtoms, setSelectedAtoms] = useState<{ id: string; label: string; image?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [txStatus, setTxStatus] = useState<string>('idle');
  const [txMessage, setTxMessage] = useState('');
  const [txHash, setTxHash] = useState<string | undefined>();
  const [txLogs, setTxLogs] = useState<string[]>([]);

  const maxAtoms = 5;

  const doSearch = useCallback(async () => {
    const t = searchTerm.trim();
    if (!t) {
      setSearching(true);
      try {
        const res = await getAllAgents(12, 0);
        setSearchResults(res.items);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
      return;
    }
    if (t.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchGlobalAgents(t);
      setSearchResults(results.slice(0, 20));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchTerm]);

  // Fetch suggestions on open
  React.useEffect(() => {
    if (isOpen && !searchTerm) {
      doSearch();
    }
  }, [isOpen, searchTerm, doSearch]);

  const addAtom = (atom: { id: string; label: string; image?: string }) => {
    if (selectedAtoms.length >= maxAtoms) return;
    if (selectedAtoms.some((a) => a.id.toLowerCase() === atom.id.toLowerCase())) return;
    playClick();
    setSelectedAtoms((prev) => [...prev, atom]);
  };

  const removeAtom = (id: string) => {
    playClick();
    setSelectedAtoms((prev) => prev.filter((a) => a.id !== id));
  };

  const handleAddAtoms = async () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    if (selectedAtoms.length === 0) {
      toast.error('Select at least one identity.');
      return;
    }
    const acc = await getConnectedAccount();
    if (!acc) {
      toast.error('Wallet not ready.');
      return;
    }
    setTxStatus('processing');
    setTxMessage('Adding identities to list…');
    setTxLogs([]);
    const addLog = (msg: string) => setTxLogs((prev) => [...prev, msg]);
    try {
      let lastHash: string | undefined;
      const approved = await getProxyApprovalStatus(acc);
      if (!approved) {
        addLog(`Enabling proxy...`);
        await grantProxyApproval(acc);
      }
      for (const atom of selectedAtoms) {
        addLog(`Adding ${atom.label} to ${listLabel}…`);
        const hash = await createSemanticTriple(
          atom.id,
          LIST_PREDICATE_ID,
          listId,
          MIN_DEPOSIT,
          acc,
          addLog
        );
        lastHash = typeof hash === 'string' ? hash : undefined;
        if (lastHash) {
          notifyProtocolXpEarned({
            address: acc,
            reasonKey: 'add_to_list',
            txHash: lastHash,
            depositTrustWei: parseEther(MIN_DEPOSIT),
          });
        }
        addLog(`Triple created: ${String(hash).slice(0, 10)}…`);
      }
      markProxyApproved(acc);
      setTxStatus('success');
      setTxMessage('Identities added to list successfully');
      setTxHash(lastHash);
      setTxLogs((prev) => [...prev, selectedAtoms.length > 1 ? `${selectedAtoms.length} identities added.` : 'Identity added.']);
      playClick();
      onSuccess();
    } catch (err: any) {
      setTxStatus('error');
      setTxMessage(err?.message || 'Transaction failed');
      setTxLogs((prev) => [...prev, `Error: ${err?.message || 'Unknown'}`]);
      toast.error(err?.message || 'Failed to add to list.');
    }
  };

  const handleClose = () => {
    playClick();
    setSelectedAtoms([]);
    setSearchTerm('');
    setSearchResults([]);
    setTxStatus('idle');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-[#020308] border-2 border-intuition-primary/40 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,243,255,0.15)]">
        {txStatus !== 'idle' ? (
          <TransactionModal
            isOpen={txStatus !== 'idle'}
            status={txStatus as any}
            title={txStatus === 'success' ? 'Success' : txStatus === 'error' ? 'Error' : 'Processing'}
            message={txMessage}
            hash={txHash}
            logs={txLogs}
            onClose={handleClose}
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-intuition-primary" />
                <span className="font-black font-mono text-intuition-primary uppercase tracking-wider">Add to list</span>
              </div>
              <button onClick={handleClose} className="p-2 text-slate-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-400 text-sm">
                Tag atoms to add them to <span className="text-white font-semibold">{listLabel}</span>.
              </p>
              <p className="text-slate-500 text-xs">Select up to {maxAtoms} atoms to add to this list.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search identities…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-black/60 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-intuition-primary/50"
                />
                <button
                  onClick={doSearch}
                  disabled={searching}
                  className="px-4 py-2.5 rounded-xl bg-intuition-primary/20 border border-intuition-primary/50 text-intuition-primary font-mono text-xs font-black uppercase tracking-wider hover:bg-intuition-primary/30 disabled:opacity-50"
                >
                  {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 border border-white/5 rounded-xl p-2">
                  {searchResults.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => addAtom(a)}
                      disabled={selectedAtoms.length >= maxAtoms || selectedAtoms.some((x) => x.id.toLowerCase() === a.id.toLowerCase())}
                      onMouseEnter={playHover}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                        {a.image ? <img src={a.image} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] font-bold text-intuition-primary">{a.label?.slice(0, 2)}</span>}
                      </div>
                      <span className="text-sm font-mono text-white truncate flex-1">{a.label || 'Unnamed'}</span>
                      <Plus size={14} className="text-intuition-primary shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {selectedAtoms.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Selected ({selectedAtoms.length}/{maxAtoms})</p>
                  {selectedAtoms.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/40 border border-slate-700">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 overflow-hidden flex items-center justify-center shrink-0">
                        {a.image ? <img src={a.image} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] font-bold text-intuition-primary">{a.label?.slice(0, 2)}</span>}
                      </div>
                      <span className="text-sm font-mono text-white truncate flex-1">{a.label || 'Unnamed'}</span>
                      <button onClick={() => removeAtom(a.id)} className="p-1 text-slate-500 hover:text-red-400 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-500">Estimated fees: ~0.5 TRUST per identity</p>
              <button
                onClick={handleAddAtoms}
                disabled={selectedAtoms.length === 0}
                onMouseEnter={playHover}
                className="w-full py-4 rounded-xl bg-white text-black font-black font-mono text-sm uppercase tracking-wider hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add atoms
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AddToListModal;
