import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from './Toast';

/**
 * When landing on Home from Arena nav or redirects, scroll to the contest floor and optionally show the create-game hint.
 */
export const HomeArenaEntryEffects: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const st = location.state as { scrollArenaContests?: boolean; showArenaCreateGameToast?: boolean } | undefined;
    if (!st?.scrollArenaContests && !st?.showArenaCreateGameToast) return;

    if (st.showArenaCreateGameToast) {
      toast.info(
        'Ranking games live on the contest floor below — tap any tile to play. Use “Create” in the nav to add new items to the graph.',
      );
    }
    if (st.scrollArenaContests) {
      requestAnimationFrame(() => {
        document.getElementById('arena-home-contests')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    navigate('.', { replace: true, state: {} });
  }, [location, navigate]);

  return null;
};
