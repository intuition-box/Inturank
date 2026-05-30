/**
 * <Reveal> ,  opt-in scroll-triggered fade-in + slide-up for any block.
 *
 * Wraps children in a div that's invisible + offset by 24px on mount, then
 * fades + lifts into place when it enters the viewport. Uses CSS transitions
 * (transform + opacity only) per project motion rules.
 *
 * Usage:
 *   <Reveal>...content...</Reveal>
 *   <Reveal delay={120}>...</Reveal>          // ms ,  stagger consecutive blocks
 *   <Reveal as="section" data-theme="light">...</Reveal>
 *
 * Honors `prefers-reduced-motion` (renders content immediately via useInView).
 */
import React, { type ElementType, type ReactNode } from 'react';
import { useInView } from '../hooks/useInView';

export interface RevealProps {
  children: ReactNode;
  /** Polymorphic ,  render as a div, section, article, etc. Default: 'div'. */
  as?: ElementType;
  /** Delay in ms before the transition starts. Useful for staggers. */
  delay?: number;
  /** Custom className appended after `.reveal-on-scroll`. */
  className?: string;
  /** Pass through any other DOM attributes (e.g. id, data-*, aria-*). */
  [prop: string]: unknown;
}

export const Reveal: React.FC<RevealProps> = ({
  children,
  as: As = 'div',
  delay = 0,
  className = '',
  ...rest
}) => {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <As
      ref={ref as React.Ref<HTMLDivElement>}
      className={`reveal-on-scroll ${inView ? 'is-in-view' : ''} ${className}`.trim()}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </As>
  );
};

export default Reveal;
