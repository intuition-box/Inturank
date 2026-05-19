/**
 * Detect a mobile device via user-agent + viewport width.
 * - SSR-safe (returns false during render before mount)
 * - Reactive: updates on resize / orientation change
 * - Width threshold matches Tailwind's `md` (768px) so desktop layout kicks in on tablets+
 */
import { useEffect, useState } from 'react';

const MOBILE_MAX_WIDTH = 768;

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera || '';
  const uaMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
  const narrow = window.innerWidth <= MOBILE_MAX_WIDTH;
  // Treat coarse pointer + narrow viewport as mobile too (Android tablets in portrait, etc.)
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return uaMobile || narrow || (coarse && window.innerWidth <= 900);
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => detectMobile());

  useEffect(() => {
    const handler = () => setIsMobile(detectMobile());
    handler();
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, []);

  return isMobile;
}

export default useIsMobile;
