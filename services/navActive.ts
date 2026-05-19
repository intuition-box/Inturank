/**
 * Active-route matching for sidebar / dock navigation.
 * HashRouter `pathname` has no query string; nav targets may use `?…` or `#…`.
 */
export function isNavPathActive(navPath: string, pathname: string): boolean {
  const raw = navPath.trim();
  let base = raw.split('?')[0]?.split('#')[0] ?? raw;
  base = base.trim();
  if (!base) return false;
  if (base.startsWith('http://') || base.startsWith('https://')) return false;

  if (base === '/') return pathname === '/';

  if (base === '/account') {
    return pathname === '/account' || pathname.startsWith('/profile/');
  }

  return pathname === base || pathname.startsWith(`${base}/`);
}
