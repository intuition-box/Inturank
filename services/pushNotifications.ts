/**
 * Web push, client side — the return trigger from the design ("you were right about
 * Marlow Lettings"). Pairs with server/push.js and public/sw.js.
 *
 * Degrades quietly at every step, because push has more ways to be unavailable than to
 * work: no service worker (older browsers, iOS Safari before 16.4 and only when installed
 * to the home screen), an insecure origin, permission denied, or no API origin configured.
 * Every entry point returns a reason rather than throwing.
 */
import { getInturankApiOrigin } from '../constants';

export type PushState =
  | 'unsupported'      // browser cannot do this
  | 'insecure'         // needs HTTPS (localhost is exempt)
  | 'unconfigured'     // no API origin, or the server has no VAPID keys
  | 'denied'           // the user said no; only they can undo it, in site settings
  | 'off'              // available, not yet enabled
  | 'on';              // subscribed

const SW_PATH = '/sw.js';

/** Push needs a secure context. localhost counts as secure, which is what makes dev possible. */
function isSecure(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * VAPID keys arrive base64url-encoded and the subscribe call wants raw bytes.
 * Backed by an explicit ArrayBuffer so the result satisfies `BufferSource` — a bare
 * `new Uint8Array(n)` is typed over ArrayBufferLike and will not narrow.
 */
function urlBase64ToBytes(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Current state, without prompting for anything. Safe to call on render. */
export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (!isSecure()) return 'insecure';
  if (!getInturankApiOrigin()) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/**
 * Ask for permission, subscribe, and register the device against `address`.
 * Returns the resulting state plus a human-readable reason when it did not turn on.
 */
export async function enablePush(address: string): Promise<{ state: PushState; reason?: string }> {
  if (!isPushSupported()) return { state: 'unsupported', reason: 'This browser cannot do push notifications.' };
  if (!isSecure()) return { state: 'insecure', reason: 'Push needs a secure connection (https).' };

  const origin = getInturankApiOrigin();
  if (!origin) return { state: 'unconfigured', reason: 'No IntuRank API is configured for this build.' };

  // Fetch the server's public key first — if push is not configured there, stop before
  // prompting, so the user is never asked for permission we cannot use.
  let publicKey = '';
  try {
    const res = await fetch(`${origin}/api/push/public-key`);
    if (!res.ok) return { state: 'unconfigured', reason: 'The server has no push keys set up yet.' };
    publicKey = (await res.json())?.publicKey || '';
  } catch {
    return { state: 'unconfigured', reason: 'Could not reach the IntuRank API.' };
  }
  if (!publicKey) return { state: 'unconfigured', reason: 'The server has no push keys set up yet.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      state: permission === 'denied' ? 'denied' : 'off',
      reason: 'Notifications were not allowed.',
    };
  }

  try {
    const reg = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;
    // Re-use an existing subscription when there is one; endpoints are stable per browser.
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(publicKey),
      }));

    const res = await fetch(`${origin}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, subscription: sub.toJSON() }),
    });
    if (!res.ok) return { state: 'off', reason: 'The server refused the subscription.' };
    return { state: 'on' };
  } catch (e: any) {
    return { state: 'off', reason: e?.message || 'Could not subscribe on this device.' };
  }
}

/** Turn push off for this device. The browser permission itself stays granted. */
export async function disablePush(): Promise<{ state: PushState }> {
  const origin = getInturankApiOrigin();
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      if (origin) {
        // Best effort — the local unsubscribe already stopped delivery.
        void fetch(`${origin}/api/push/unsubscribe`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
    }
  } catch {
    /* already gone */
  }
  return { state: 'off' };
}

/** Fire a test notification at this wallet's devices, to prove the chain end to end. */
export async function sendTestPush(address: string): Promise<{ ok: boolean; reason?: string }> {
  const origin = getInturankApiOrigin();
  if (!origin) return { ok: false, reason: 'No IntuRank API is configured for this build.' };
  try {
    const res = await fetch(`${origin}/api/push/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) return { ok: false, reason: (await res.json())?.message || 'The server could not send it.' };
    const out = await res.json();
    if (!out?.sent) return { ok: false, reason: 'No devices are registered for this wallet yet.' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not reach the IntuRank API.' };
  }
}
