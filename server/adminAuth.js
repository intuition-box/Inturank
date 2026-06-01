/**
 * Admin auth for privileged XP writes (gifts, manual adjustments).
 *
 * Two accepted credentials — either passing grants access:
 *   A) Static API key — header `x-admin-key` === ARENA_ADMIN_API_KEY (>= 16 chars). For internal tools / CLI.
 *   B) Admin-wallet signature — header `x-admin-address` (must be in the ARENA_ADMIN_WALLETS allowlist) plus
 *      `x-admin-signature` over the route's canonical `expectedMessage`, with a fresh `x-admin-ts` (±5 min).
 *      Verifiable, rotatable, no shared secret — preferred for an on-chain-native app.
 *
 * CLOSED BY DEFAULT: if neither ARENA_ADMIN_API_KEY nor ARENA_ADMIN_WALLETS is configured, every admin
 * write is rejected (see `adminConfigured()` + the 503 guard in the routes).
 *
 * Env:
 *   ARENA_ADMIN_API_KEY   - long random secret for the API-key path (optional)
 *   ARENA_ADMIN_WALLETS   - comma-separated 0x addresses allowed to sign admin actions (optional)
 */
import crypto from 'crypto';
import { recoverMessageAddress } from 'viem';

const ADMIN_API_KEY = String(process.env.ARENA_ADMIN_API_KEY || '').trim();
const ADMIN_WALLETS = new Set(
  String(process.env.ARENA_ADMIN_WALLETS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((a) => /^0x[0-9a-f]{40}$/.test(a)),
);

/** Wallet-signature freshness window (replay bound). */
export const ADMIN_SIG_TTL_MS = 5 * 60 * 1000;

/** True if at least one admin credential is configured. When false, all admin writes must 503. */
export function adminConfigured() {
  return ADMIN_API_KEY.length >= 16 || ADMIN_WALLETS.size > 0;
}

/** Constant-time string compare (avoids timing leaks on the API key). */
function safeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Verify the request carries a valid admin credential.
 * @param {import('express').Request} req
 * @param {string} expectedMessage Canonical, action-bound message the admin wallet must have signed.
 * @returns {Promise<{ ok: boolean, who?: string, error?: string }>}
 */
export async function verifyAdmin(req, expectedMessage) {
  // A) API key
  if (ADMIN_API_KEY.length >= 16) {
    const key = String(req.headers['x-admin-key'] || '');
    if (key && safeEq(key, ADMIN_API_KEY)) return { ok: true, who: 'api-key' };
  }
  // B) Admin-wallet signature (allowlist + recovered signer must match the claimed address)
  const addr = String(req.headers['x-admin-address'] || '').trim().toLowerCase();
  const sig = String(req.headers['x-admin-signature'] || '').trim();
  if (/^0x[0-9a-f]{40}$/.test(addr) && ADMIN_WALLETS.has(addr) && /^0x[0-9a-f]+$/i.test(sig)) {
    try {
      const recovered = (await recoverMessageAddress({ message: expectedMessage, signature: sig })).toLowerCase();
      if (recovered === addr) return { ok: true, who: addr };
    } catch {
      /* invalid signature — fall through to unauthorized */
    }
  }
  return { ok: false, error: 'unauthorized' };
}
