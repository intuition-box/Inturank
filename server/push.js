/**
 * Web push — the return trigger the design leans on ("you were right about Marlow Lettings").
 *
 * CLOSED BY DEFAULT, exactly like admin auth: with no VAPID keys configured every send is a
 * no-op and `pushConfigured()` is false, so the API still boots and the routes explain
 * themselves instead of throwing.
 *
 * Generate a keypair once with:  npx web-push generate-vapid-keys
 * then set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT in the server env.
 *
 * Note for whoever deploys this: browsers only allow push from a secure origin, so the app
 * must be served over HTTPS (localhost is exempt) and the API must be reachable from it.
 */
import webpush from 'web-push';
import { getPushSubs, removePushSub } from './store.js';

const PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
/** Must be a mailto: or https: URL — push services reject anything else. */
const SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:hello@inturank.app').trim();

let ready = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    ready = true;
  } catch (e) {
    console.error('[inturank-push] VAPID keys rejected:', e?.message || e);
  }
}

/** True only when a usable keypair is configured. */
export function pushConfigured() {
  return ready;
}

/** The public key the browser needs in order to subscribe. Safe to serve openly. */
export function getPushPublicKey() {
  return PUBLIC_KEY;
}

/**
 * Send one notification to every device a wallet has registered.
 * Subscriptions the push service reports as gone (404/410) are pruned, which is the only
 * way a subscription list stays healthy over time.
 *
 * @returns {Promise<{sent: number, pruned: number, failed: number}>}
 */
export async function sendPushToWallet(wallet, payload) {
  if (!ready) return { sent: 0, pruned: 0, failed: 0 };

  const subs = getPushSubs(wallet);
  if (subs.length === 0) return { sent: 0, pruned: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload?.title || 'IntuRank',
    body: payload?.body || '',
    url: payload?.url || '/',
    tag: payload?.tag || 'inturank',
  });

  let sent = 0;
  let pruned = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, body);
        sent += 1;
      } catch (e) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          removePushSub(sub.endpoint);
          pruned += 1;
        } else {
          failed += 1;
          console.error('[inturank-push] send failed', code || e?.message || e);
        }
      }
    }),
  );

  return { sent, pruned, failed };
}
