/**
 * Persisted desktop sidebar collapse state.
 * Mirrors the simple localStorage getter/setter pattern in services/arenaAudio.ts.
 * Default is expanded (false) so first-time visitors see the full labeled nav.
 */
const SIDEBAR_COLLAPSED_KEY = 'inturank_sidebar_collapsed';

export function getSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    /* ignore */
  }
}
