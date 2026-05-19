import { useCallback, useState } from 'react';
import { playClick, getArenaMusicEnabled, setArenaMusicEnabled } from '../services/audio';

export function useArenaMusicPreference() {
  const [musicOn, setMusicOn] = useState(() => getArenaMusicEnabled());

  const toggleMusic = useCallback(() => {
    playClick();
    const next = !getArenaMusicEnabled();
    setArenaMusicEnabled(next);
    setMusicOn(next);
  }, []);

  return { musicOn, toggleMusic };
}
