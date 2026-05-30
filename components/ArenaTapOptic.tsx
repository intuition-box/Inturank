import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ARENA_TAP_OPTIC_EVENT } from '../services/arenaTapOptic';

/**
 * Full-viewport subtle cyan/magenta pulse on Arena UI taps ,  pairs with `playArenaUiClick`.
 */
const ArenaTapOptic: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const [burst, setBurst] = useState<number | null>(null);

  const bump = useCallback(() => {
    if (reduceMotion) return;
    setBurst(Date.now());
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    window.addEventListener(ARENA_TAP_OPTIC_EVENT, bump);
    return () => window.removeEventListener(ARENA_TAP_OPTIC_EVENT, bump);
  }, [bump, reduceMotion]);

  if (reduceMotion) return null;

  return (
    <AnimatePresence>
      {burst != null ? (
        <motion.div
          key={burst}
          className="pointer-events-none fixed inset-0 z-[240]"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 85% 55% at 50% 42%, rgba(255,80,57,0.16) 0%, rgba(239,68,68,0.07) 40%, transparent 72%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1], times: [0, 0.18, 1] }}
          onAnimationComplete={() => setBurst(null)}
        />
      ) : null}
    </AnimatePresence>
  );
};

export default ArenaTapOptic;
