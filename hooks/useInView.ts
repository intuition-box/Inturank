/**
 * useInView — minimal IntersectionObserver hook for scroll-triggered reveals.
 *
 * Returns a `ref` to attach to the element + an `inView` boolean. Once an
 * element enters the viewport (>=15% by default) the hook flips `inView` to
 * true and STOPS observing — reveals are one-shot, not toggleable. This is
 * intentional: re-animating on scroll-out is visually noisy and against the
 * Arcium-style "land and stay" motion grammar.
 *
 * Pairs with `.reveal-on-scroll` + `.is-in-view` in index.css.
 *
 * Honors `prefers-reduced-motion` by returning `inView: true` immediately so
 * content is never hidden behind a never-firing animation.
 */
import { useEffect, useRef, useState } from 'react';

export interface UseInViewOptions {
  /** Fraction of element that must be visible before it counts as in-view. */
  threshold?: number;
  /** Margin around the root, e.g. '0px 0px -10% 0px' to fire before reaching the bottom of viewport. */
  rootMargin?: string;
  /** If true, never observe — element is treated as in-view from mount. */
  disabled?: boolean;
}

export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {},
): [React.RefObject<T>, boolean] {
  const { threshold = 0.15, rootMargin = '0px 0px -8% 0px', disabled = false } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    if (disabled) return true;
    // Respect reduced motion — show immediately.
    if (typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (disabled || inView) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            return;
          }
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [disabled, inView, threshold, rootMargin]);

  return [ref, inView];
}

export default useInView;
