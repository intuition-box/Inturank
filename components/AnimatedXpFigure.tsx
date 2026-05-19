import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type Props = {
  /** When false, shows the loading placeholder (no numeric guess). */
  ready: boolean;
  value: number;
  /** Shown while `ready` is false. */
  loadingChar?: string;
  className?: string;
};

/**
 * Subtle XP / stat reveal: spring settle on first paint and when the value changes,
 * WITHOUT counting through every intermediate integer (avoids “wrong number” flicker).
 */
export const AnimatedXpFigure: React.FC<Props> = ({
  ready,
  value,
  loadingChar = '—',
  className = '',
}) => {
  const reduceMotion = useReducedMotion();

  return (
    <span className={`inline-flex min-w-[1ch] items-baseline ${className}`.trim()}>
      <AnimatePresence mode="popLayout" initial={false}>
        {!ready ? (
          <motion.span
            key="xp-loading"
            className="inline-block tabular-nums"
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 0.55, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -3, filter: 'blur(3px)' }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {loadingChar}
          </motion.span>
        ) : (
          <motion.span
            key={value}
            className="inline-block tabular-nums"
            initial={
              reduceMotion
                ? false
                : { opacity: 0.35, y: 5, scale: 0.97, filter: 'blur(2px)' }
            }
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 520, damping: 34, mass: 0.55 }
            }
          >
            {value.toLocaleString()}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};

export default AnimatedXpFigure;
