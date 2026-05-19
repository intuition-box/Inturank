/** Dispatches a one-frame visual “tap” flash (listened to by `ArenaTapOptic`). */
export const ARENA_TAP_OPTIC_EVENT = 'inturank-arena-tap-optic';

export function pulseArenaTapOptic(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(ARENA_TAP_OPTIC_EVENT));
  } catch {
    /* ignore */
  }
}
