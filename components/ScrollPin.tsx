/**
 * <ScrollPin> ,  pin a section in view while the next section scrolls past it.
 *
 * Pure CSS via `position: sticky` ,  no JS, no scroll listeners, plays
 * perfectly with Lenis. Mimics the Arcium hero-cover effect (the hero stays
 * fixed while the page below scrolls up over it).
 *
 * Usage:
 *   <ScrollPin offset="top-0">
 *     <BigHero />
 *   </ScrollPin>
 *   <NextSection />        // scrolls up over the pinned hero
 *
 * Notes:
 *   - The parent of <ScrollPin> establishes the pin's "track" (the area in
 *     which it remains pinned). Put each ScrollPin inside its own tall
 *     section if you want a long pin duration.
 *   - iOS Safari sometimes glitches sticky at the very top of the page ,  keep
 *     a small offset (top-1, not top-0) on hero pins.
 *   - Honors `prefers-reduced-motion` by collapsing to static positioning.
 */
import React, { type ElementType, type ReactNode } from 'react';

export interface ScrollPinProps {
  children: ReactNode;
  /** Tailwind position class for the pin point. Default: 'top-0'. */
  offset?: string;
  /** Polymorphic element. Default: 'div'. */
  as?: ElementType;
  /** Extra className. */
  className?: string;
  /** When true, pin is disabled (static positioning). */
  disabled?: boolean;
}

export const ScrollPin: React.FC<ScrollPinProps> = ({
  children,
  offset = 'top-0',
  as: As = 'div',
  className = '',
  disabled = false,
}) => {
  if (disabled) {
    return <As className={className}>{children}</As>;
  }
  return (
    <As className={`sticky ${offset} motion-reduce:static ${className}`.trim()}>
      {children}
    </As>
  );
};

export default ScrollPin;
