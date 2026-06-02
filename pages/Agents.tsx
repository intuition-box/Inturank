import React, { useEffect, useState } from 'react';
import { normalizeWebMediaUrl } from '../services/mediaUrl';
import { Link } from 'react-router-dom';
import { Search, ExternalLink, User, Shield } from 'lucide-react';
import { getAllAgents } from '../services/graphql';
import { PAGE_HERO_EYEBROW, PAGE_HERO_TITLE, PAGE_HERO_BODY } from '../constants';
import { Account } from '../types';

const Agents: React.FC = () => {
  const [agents, setAgents] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getAllAgents();
        /* FIXED: getAllAgents returns an object { items, hasMore }, need to set items array */
        setAgents(data.items);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredAgents = agents.filter(agent => 
    (agent.label?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (agent.id.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="space-y-2 min-w-0">
          <p className={PAGE_HERO_EYEBROW}>Directory</p>
          <h1 className={PAGE_HERO_TITLE}>Active agents</h1>
          <p className={`${PAGE_HERO_BODY} max-w-xl`}>Browse and search atoms on the graph by label or term id.</p>
        </div>
        
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search agents by ID or Label..." 
            className="w-full md:w-80 bg-slate-900/50 border border-intuition-border rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-intuition-primary transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-white/5 animate-pulse border border-white/5"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgents.map((agent) => (
            <Link 
              key={agent.id} 
              to={`/agents/${agent.id}`}
              className="group relative overflow-hidden rounded-xl glass-panel p-6 transition-all hover:border-intuition-primary/50 hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center border border-white/10 text-intuition-primary overflow-hidden">
                    {agent.image ? (
                      <img src={normalizeWebMediaUrl(agent.image)} alt={agent.label} className="w-full h-full object-cover" />
                    ) : (
                      <User size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg truncate max-w-[150px]">
                      {agent.label || 'Unknown Agent'}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono truncate max-w-[150px]">
                      {agent.id.slice(0, 8)}...{agent.id.slice(-6)}
                    </p>
                  </div>
                </div>
                <div className="p-2 rounded-full bg-white/5 group-hover:bg-intuition-primary group-hover:text-black transition-colors">
                  <ExternalLink size={16} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Type</span>
                  <span className="text-slate-300 flex items-center gap-1">
                    <Shield size={12} className="text-intuition-primary" />
                    {agent.type || 'Atom'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                   {agent.creator && (
                      <>
                        <span className="text-slate-500">Creator</span>
                        <span className="text-slate-300">{agent.creator.label || '...'}</span>
                      </>
                   )}
                </div>
              </div>

              <div className="mt-6 w-full py-2 rounded bg-slate-800/50 border border-slate-700 text-center text-sm text-slate-300 font-medium group-hover:bg-intuition-primary/10 group-hover:text-intuition-primary group-hover:border-intuition-primary/30 transition-colors">
                View Profile
              </div>
            </Link>
          ))}
        </div>
      )}
      
      {!loading && filteredAgents.length === 0 && (
        <div className="text-center py-20">
          <p className="text-slate-500 text-lg">No agents found matching your criteria.</p>
        </div>
      )}
    </div>
  );
};

export default Agents;