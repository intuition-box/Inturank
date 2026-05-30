import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type Variant = 'mobile-slide' | 'desktop-fade';

/** Smooth ease-out-quint ,  long settle, no bounce. */
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Buttery cross-fade between routes.
 *
 * Both desktop and mobile use the same gentle opacity + micro-scale enter/exit.
 * No horizontal or vertical slide ,  the previous "fly in from the right" /
 * "jump up" feel comes from large translate values, which read as motion rather
 * than transition. Pure opacity + 1% scale gives a fluid dissolve.
 *
 * Transform + opacity only (project rule: no `filter`, no layout animations).
 * Honors `prefers-reduced-motion`.
 *
 * Variant kept in the signature for backward compat ,  both variants currently
 * resolve to the same animation since the slide-in pattern was the source of
 * the "flying in" complaint.
 */
export const RouteTransition: React.FC<{
  children: React.ReactNode;
  routeKey: string;
  variant: Variant;
  'data-lenis-prevent'?: boolean;
}> = ({ children, routeKey, ...rest }) => {
  const reduceMotion = useReducedMotion();

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
          {...rest}
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
        initial={{ opacity: 0, scale: 0.992 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.996 }}
        transition={{ duration: 0.42, ease: EASE }}
        className="min-w-0 w-full"
        style={{ willChange: 'transform, opacity', transformOrigin: '50% 30%' }}
        {...rest}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
