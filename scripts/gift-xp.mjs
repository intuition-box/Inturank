#!/usr/bin/env node
/**
 * Admin XP gift CLI — grant authoritative XP via POST /api/xp/gift.
 *
 * Auth (one required):
 *   --pk <0xprivkey>     Admin wallet private key — signs the request; its address must be in ARENA_ADMIN_WALLETS.
 *   --api-key <key>      Static admin API key — must match ARENA_ADMIN_API_KEY.
 *   (env fallbacks: ARENA_ADMIN_PK, ARENA_ADMIN_API_KEY)
 *
 * Usage:
 *   node scripts/gift-xp.mjs --address 0xRecipient --amount 500 [--reason quest] \
 *     [--server https://api.yourdomain.com] [--gift-id custom-id] (--pk 0x… | --api-key …)
 *
 * Server URL falls back to $INTURANK_API_URL, then http://localhost:3001.
 * The gift-id is the idempotency key — reusing it is a safe no-op (won't double-grant).
 */
import { privateKeyToAccount } from 'viem/accounts';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log(`Admin XP gift CLI
  --address 0x…      recipient wallet (required)
  --amount  N        XP to grant (required, positive integer)
  --reason  text     gift reason (default: gift)
  --gift-id id       idempotency key (default: auto-generated)
  --server  url      API base (default: $INTURANK_API_URL or http://localhost:3001)
  --pk      0x…      admin private key — signs request (address must be allowlisted)  [or $ARENA_ADMIN_PK]
  --api-key key      admin API key                                                    [or $ARENA_ADMIN_API_KEY]`);
  process.exit(0);
}

const address = String(args.address || '').trim().toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(address)) fail('--address must be a 0x… 40-hex wallet');
const amount = Math.floor(Number(args.amount));
if (!Number.isFinite(amount) || amount <= 0) fail('--amount must be a positive integer');
const reason = (String(args.reason || 'gift').trim().slice(0, 64)) || 'gift';
const giftId = String(args['gift-id'] || `cli-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).trim();
const server = String(args.server || process.env.INTURANK_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const pk = String(args.pk || process.env.ARENA_ADMIN_PK || '').trim();
const apiKey = String(args['api-key'] || process.env.ARENA_ADMIN_API_KEY || '').trim();

if (!pk && !apiKey) fail('provide --pk (admin private key) or --api-key');

const ts = Date.now();
const headers = { 'Content-Type': 'application/json' };

if (pk) {
  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  // Must match the server's canonical, action-bound message exactly (server/index.js).
  const message = `IntuRank|gift|${giftId}|${address}|${amount}|${reason}|${ts}`;
  const signature = await account.signMessage({ message });
  headers['x-admin-address'] = account.address.toLowerCase();
  headers['x-admin-signature'] = signature;
  headers['x-admin-ts'] = String(ts);
  console.log(`• signing as ${account.address}`);
} else {
  headers['x-admin-key'] = apiKey;
  console.log('• using API key');
}

console.log(`• gift ${amount} XP → ${address} (reason="${reason}", giftId=${giftId})`);
console.log(`• POST ${server}/api/xp/gift`);

try {
  const res = await fetch(`${server}/api/xp/gift`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ address, amount, reason, giftId, ts }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`HTTP ${res.status}: ${data.error || JSON.stringify(data)}`);
  if (data.duplicate) console.log(`↺ already applied (idempotent). wallet giftXp=${data.giftXp}`);
  else console.log(`✓ applied +${data.applied} XP. wallet giftXp=${data.giftXp}`);
} catch (e) {
  fail(`request failed: ${e.message}`);
}
