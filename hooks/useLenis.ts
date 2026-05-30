/**
 * useLenis — desktop-only smooth scroll via the Lenis library.
 *
 * Why desktop-only:
 *   - Mobile native scroll is already hardware-accelerated and rubber-bounces
 *     on iOS in a way users expect. Lenis on mobile can feel WORSE than native
 *     and conflict with our Arena card swipe gestures (touch events get
 *     intercepted).
 *   - On desktop, native wheel-scroll is choppy on Windows / non-Apple
 *     trackpads — Lenis is the single biggest "buttery feel" upgrade.
 *
 * Pattern:
 *   - Call useLenis() ONCE near the App root.
 *   - Lenis runs a single RAF loop and listens to wheel/touch on <html>.
 *   - Components that need to opt out (modals, scrollable inner panels,
 *     gesture surfaces) add `data-lenis-prevent` to their scrollable element.
 *   - To programmatically scroll, import { lenis } and call lenis?.scrollTo(...).
 */
import { useEffect, useRef } from 'react';
import Lenis from 'lenis';

/** Singleton instance — exported so any component can call lenis?.scrollTo(...) */
let lenisInstance: Lenis | null = null;

export function getLenis(): Lenis | null {
  return lenisInstance;
}

interface UseLenisOptions {
  /** Override the desktop check (e.g. force on tablet). Default: skip when matchMedia(pointer:coarse) matches. */
  enable?: boolean;
}

export function useLenis(options: UseLenisOptions = {}): void {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Desktop gate: skip touch-primary devices + reduced-motion users.
    // Removed the viewport-width gate (was excluding lots of laptops with
    // sidebars); pointer-coarse is the right signal for "phone/tablet."
    const isTouch =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const enabled = options.enable ?? !(isTouch || reduceMotion);
    if (!enabled) return;

    const lenis = new Lenis({
      // lerp gives a softer "settle" feel than fixed-duration animation —
      // matches the Arcium momentum-glide. Lower = smoother but laggier.
      lerp: 0.08,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1,
      touchMultiplier: 1,
      // Auto-skip Lenis whenever the wheel target lives inside its own
      // scrollable container (modals, panels, dropdowns, the notification
      // sheet, etc.). Without this, the inner container never receives the
      // wheel because Lenis swallows it for the page scroll.
      prevent: (node) => {
        let el: HTMLElement | null = node;
        while (el && el !== document.body && el !== document.documentElement) {
          if (el.dataset.lenisPrevent !== undefined) return true;
          const style = window.getComputedStyle(el);
          const oy = style.overflowY;
          if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
            return true;
          }
          el = el.parentElement;
        }
        return false;
      },
    });
    lenisInstance = lenis;

    const raf = (time: number) => {
      lenis.raf(time);
      rafRef.current = requestAnimationFrame(raf);
    };
    rafRef.current = requestAnimationFrame(raf);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lenis.destroy();
      if (lenisInstance === lenis) lenisInstance = null;
    };
  }, [options.enable]);
}

export default useLenis;
