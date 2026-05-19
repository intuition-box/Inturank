import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type Variant = 'mobile-slide' | 'desktop-fade';

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Wraps route tree so each navigation plays enter/exit (mobile: horizontal slide;
 * desktop: soft fade + small vertical shift). Respects `prefers-reduced-motion`.
 */
export const RouteTransition: React.FC<{
  children: React.ReactNode;
  routeKey: string;
  variant: Variant;
}> = ({ children, routeKey, variant }) => {
  const reduceMotion = useReducedMotion();
  const mobile = variant === 'mobile-slide';

  if (reduceMotion) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={routeKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="min-w-0 w-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    );
  }

  if (mobile) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={routeKey}
          initial={{ opacity: 0, x: 36 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 }}
          transition={{ duration: 0.29, ease }}
          className="min-w-0 w-full"
          style={{ willChange: 'transform, opacity' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22, ease }}
        className="min-w-0 w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
