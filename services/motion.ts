// Shared Framer Motion grammar.
//
// Goal: every animation in the app reads from ONE set of curves/springs/durations
// so motion feels coherent. New animations should import from here instead of
// inventing their own values.
//
// Project rule: motion uses `transform` + `opacity` + `box-shadow` only. No
// `filter`, no `layout`/`layoutId` props, no animating `width`/`height`.
//
// Source-of-truth values live in `theme/tokens.ts` — this file shapes them
// into Framer-Motion-ready primitives.

import { motion as tokenMotion } from '../theme/tokens';

const { duration, easing, spring } = tokenMotion;

// ---- Durations (seconds — Framer Motion wants seconds, not ms) -------------

export const dur = {
  tap:  duration.tap  / 1000,   // 0.12s
  fast: duration.fast / 1000,   // 0.18s
  flow: duration.flow / 1000,   // 0.24s
  slow: duration.slow / 1000,   // 0.32s
  epic: duration.epic / 1000,   // 0.60s
} as const;

// ---- Easings (cubic-bezier arrays for Framer Motion) -----------------------

/** Cubic-bezier parsed from the token (which stores a CSS string). */
function parseCubic(css: string): [number, number, number, number] {
  const m = css.match(/cubic-bezier\(([-0-9.]+),\s*([-0-9.]+),\s*([-0-9.]+),\s*([-0-9.]+)\)/);
  if (!m) return [0.22, 1, 0.36, 1];
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
}

export const ease = {
  snap:    parseCubic(easing.snap),     // small overshoot — taps / press-feedback
  glide:   parseCubic(easing.glide),    // smooth landing — page enters, reveals
  inOut:   parseCubic(easing.inOut),    // symmetric — neutral transitions
  stinger: parseCubic(easing.stinger),  // dramatic — modal pops, big reveals
} as const;

// ---- Springs (Framer Motion `type: 'spring'` configs) ----------------------

export const springs = {
  /** XP / number counters / stat reveals — quick settle. */
  xp:   { type: 'spring' as const, stiffness: spring.xp.stiffness,   damping: spring.xp.damping,   mass: 0.55 },
  /** Cards shuffling / reordering — heavier, more deliberate. */
  card: { type: 'spring' as const, stiffness: spring.card.stiffness, damping: spring.card.damping, mass: 0.9 },
  /** Modal / dropdown pop — small overshoot. */
  pop:  { type: 'spring' as const, stiffness: spring.pop.stiffness,  damping: spring.pop.damping,  mass: 0.75 },
} as const;

// ---- Pre-baked variant fragments — drop into motion components -------------

/** Quick fade + lift. transform + opacity only. */
export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
  transition: { duration: dur.flow, ease: ease.glide },
};

/** Quick scale + fade (good for pop-ins like dropdowns). */
export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.98 },
  transition: { duration: dur.fast, ease: ease.glide },
};

/** Slide horizontally — for step-wizards, mobile route transitions. */
export const slideX = (from: 'left' | 'right' = 'right') => ({
  initial: { opacity: 0, x: from === 'right' ? 16 : -16 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: from === 'right' ? -8 : 8 },
  transition: { duration: dur.flow, ease: ease.glide },
});

/** Stagger children with consistent timing. */
export const stagger = (gap = 0.06) => ({
  animate: { transition: { staggerChildren: gap } },
});
