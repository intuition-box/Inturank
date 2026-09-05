/**
 * Motion grammar — the shared vocabulary every surface animates with.
 *
 * Built on the springs and easings in theme/tokens.ts so timing is consistent across the
 * app rather than re-guessed per component.
 *
 * ONE HARD RULE: transform and opacity only. No animated width/height/top/left, no filter,
 * no blur. Those run off the compositor thread and are what makes a swipe deck stutter on a
 * mid-range Android — which is the exact thing this product cannot afford, because the deck
 * IS the product.
 *
 * Everything here degrades to a static end-state when the viewer asks for reduced motion.
 */
import type { Variants, Transition } from 'framer-motion';
import { motion as motionTokens } from '../theme/tokens';

const ms = (n: number) => n / 1000;

/** True when the viewer has asked the OS to keep motion down. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const spring = {
  /** Cards, panels, anything with weight. */
  card: { type: 'spring', ...motionTokens.spring.card } as Transition,
  /** Points, badges, small things that should feel snappy. */
  pop: { type: 'spring', ...motionTokens.spring.pop } as Transition,
  /** XP and counters — the liveliest of the three. */
  xp: { type: 'spring', ...motionTokens.spring.xp } as Transition,
};

export const ease = {
  glide: [0.22, 1, 0.36, 1] as const,
  snap: [0.2, 0.9, 0.1, 1] as const,
  inOut: [0.45, 0, 0.25, 1] as const,
};

/**
 * A container whose children arrive one after another. The stagger is what makes a dense
 * screen feel assembled rather than dumped — Me has eight cards and they should land in
 * reading order.
 */
export const stack = (gap = 0.045, delay = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: gap, delayChildren: delay },
  },
});

/** The child of a `stack`. Rises a few pixels and fades — transform + opacity only. */
export const riser = (distance = 10): Variants => ({
  hidden: { opacity: 0, y: distance },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: ms(motionTokens.duration.flow), ease: ease.glide },
  },
});

/** For a thing that should feel like it landed, not faded — used on reward moments. */
export const land: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: spring.pop },
};

/** Press feedback. Applied as whileTap so it works for mouse and touch alike. */
export const press = { scale: 0.975 };

/** Hover lift for rows and cards on pointer devices. */
export const lift = { y: -2, transition: { duration: ms(motionTokens.duration.fast), ease: ease.glide } };

/**
 * A slow idle float, for a reward object that should feel alive while sitting still —
 * the tier gem. Deliberately tiny: anything larger reads as a distraction on a page
 * someone is trying to read numbers off.
 */
export const idleFloat = {
  y: [0, -5, 0],
  transition: { duration: 4.5, repeat: Infinity, ease: ease.inOut },
};

/**
 * Count a number up to its value. Returns the display value.
 *
 * Uses requestAnimationFrame rather than animating a layout property, and callers should
 * pair it with `tabular-nums` so the digits do not reflow as they change — a counter that
 * shifts its own container is worse than no counter.
 */
export function countUp(
  to: number,
  onFrame: (v: number) => void,
  durationMs = motionTokens.duration.epic,
): () => void {
  if (prefersReducedMotion() || !Number.isFinite(to)) {
    onFrame(to);
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    // easeOutExpo — fast out of the gate, settles gently. Reads as "arriving".
    const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    onFrame(to * eased);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Bar/meter fill, expressed as scaleX so it never triggers layout. */
export const fillX = (pct: number): Variants => ({
  hidden: { scaleX: 0 },
  show: {
    scaleX: Math.max(0, Math.min(1, pct / 100)),
    transition: { duration: ms(motionTokens.duration.epic), ease: ease.glide },
  },
});
