/**
 * Backend email worker: sends alerts even when the browser is closed.
 *
 * Reads subscribed wallets from a JSON store and periodically:
 * - Fetches their active positions
 * - Looks for other users buying/selling in those claims
 * - Sends summary emails via Ensend
 *
 * Env:
 *   ENSEND_PROJECT_SECRET - Ensend project secret
 *   ENSEND_SENDER_EMAIL   - From address
 *   ENSEND_SENDER_NAME    - From name (optional, default "IntuRank")
 *   INTUITION_GRAPH_URL   - (optional) override GraphQL URL, defaults to API_URL_PROD
 *   EMAIL_DATA_DIR        - (optional) same directory as email API uses for email-subs.json
 *   FEE_PROXY_ADDRESS     - (optional) must match app constants; default mainnet FeeProxy
 *   MULTI_VAULT_ADDRESS   - (optional) must match app; used with FeeProxy to resolve deposit sender
 *
 * Run locally:
 *   npm run email-worker
 */

import dotenv from 'dotenv';
import { API_URL_PROD } from '@0xintuition/graphql';
import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAddress, isAddress } from 'viem';

dotenv.config();
dotenv.config({ path: '.env.local' });

const GRAPH_URL = process.env.INTUITION_GRAPH_URL || API_URL_PROD;
const ENSEND_SEND_URL = 'https://api.ensend.co/send';

/** Must match IntuRank `constants.ts` — deposits often show sender as proxy; override via env if redeployed. */
const FEE_PROXY_ADDRESS = (process.env.FEE_PROXY_ADDRESS || '0x1a13606A0a3C392214527c896b4cD0E9C0af82E8').toLowerCase();
const MULTI_VAULT_ADDRESS = (process.env.MULTI_VAULT_ADDRESS || '0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e').toLowerCase();

function isDepositSenderProxy(senderIdNorm) {
  if (!senderIdNorm) return false;
  const s = senderIdNorm.toLowerCase();
  return s === FEE_PROXY_ADDRESS || s === MULTI_VAULT_ADDRESS;
}

const ENSEND_PROJECT_SECRET = process.env.ENSEND_PROJECT_SECRET;
const ENSEND_SENDER_EMAIL = process.env.ENSEND_SENDER_EMAIL;
const ENSEND_SENDER_NAME = process.env.ENSEND_SENDER_NAME || 'IntuRank';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ensendConfigured = !!(ENSEND_PROJECT_SECRET && ENSEND_SENDER_EMAIL);
/** Standalone `node server/email-worker.js` — exit on misconfig. When imported from `index.js`, never kill the API. */
const isStandaloneWorker =
  typeof process.argv[1] === 'string' && path.resolve(process.argv[1]) === __filename;

if (!ensendConfigured) {
  const msg =
    '[email-worker] ENSEND_PROJECT_SECRET / ENSEND_SENDER_EMAIL not configured.';
  if (isStandaloneWorker) {
    console.error(msg + ' Exiting.');
    process.exit(1);
  }
  console.warn(msg + ' Skipping background worker (API server continues).');
}
const DATA_DIR = process.env.EMAIL_DATA_DIR || __dirname;
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // ignore
}
const SUBS_PATH = path.join(DATA_DIR, 'email-subs.json');

const state = new Map(); // wallet -> ISO timestamp of last successful poll
const followState = new Map(); // "wallet:identityId" -> Set of event ids we already emailed
/** Queued bodies for subscribers with `daily` holdings digest. */
const digestLines = new Map();
const digestLastFlushMsByWallet = new Map();
const DAILY_DIGEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function appendDailyDigest(wallet, block) {
  const w = String(wallet || '').toLowerCase();
  if (!w || typeof block !== 'string' || !block.trim()) return;
  if (!digestLines.has(w)) digestLines.set(w, []);
  digestLines.get(w).push(block.trim());
}

async function flushDailyDigests() {
  const subs = await loadSubscriptions();
  const now = Date.now();
  for (const sub of subs) {
    const freq = String(sub.alertFrequency || 'per_tx').toLowerCase();
    if (freq !== 'daily' || !sub.email) continue;
    const wallet = String(sub.wallet || '').toLowerCase();
    const lines = digestLines.get(wallet);
    if (!lines?.length) continue;
    const last = digestLastFlushMsByWallet.get(wallet) ?? 0;
    if (now - last < DAILY_DIGEST_COOLDOWN_MS) continue;

    digestLastFlushMsByWallet.set(wallet, now);
    digestLines.delete(wallet);

    const body = lines.join('\n\n— — —\n\n');
    const subject =
      lines.length === 1
        ? 'IntuRank: Daily digest — 1 update'
        : `IntuRank: Daily digest — ${lines.length} updates`;
    await sendEmail({ to: sub.email, subject, message: body });
  }
}

function toAddress(id) {
  if (!id || typeof id !== 'string') return null;
  const t = id.trim();
  if (t.length === 42 && t.startsWith('0x') && isAddress(t)) {
    try { return getAddress(t); } catch { return null; }
  }
  if (t.length === 66 && t.startsWith('0x000000000000000000000000')) {
    const unpadded = '0x' + t.slice(26);
    if (isAddress(unpadded)) {
      try { return getAddress(unpadded); } catch { return null; }
    }
  }
  return null;
}

function prepareQueryIds(id) {
  if (!id) return [];
  const base = String(id).trim();
  const out = new Set([base, base.toLowerCase()]);
  const addr = toAddress(base);
  if (addr) out.add(addr);
  if (base.startsWith('0x') && base.length === 42) {
    out.add('0x' + '0'.repeat(24) + base.slice(2));
    out.add(('0x' + '0'.repeat(24) + base.slice(2)).toLowerCase());
  }
  return Array.from(out);
}

async function loadSubscriptions() {
  try {
    const raw = await fs.readFile(SUBS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchGraph(query, variables) {
  const res = await fetch(GRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error('[email-worker] GraphQL errors:', JSON.stringify(json.errors));
    throw new Error('GraphQL error');
  }
  return json.data;
}

async function sendEmail({ to, subject, message }) {
  const payload = {
    subject,
    message,
    sender: { name: ENSEND_SENDER_NAME, email: ENSEND_SENDER_EMAIL },
    recipients: to,
  };

  const res = await fetch(ENSEND_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ENSEND_PROJECT_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[email-worker] Ensend error', res.status, err);
  } else {
    console.log('[email-worker] Email OK →', to, subject);
  }
}

async function pollWallet(sub) {
  const wallet = String(sub.wallet || '').toLowerCase();
  const to = sub.email;
  if (!wallet || !to) return;
  const daily = String(sub.alertFrequency || 'per_tx').toLowerCase() === 'daily';
  const now = new Date();
  const since =
    state.get(wallet) ||
    new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // last 2h on first run

  try {
    // 1) Positions (what this wallet is holding)
    const positionsQ = `
      query WorkerPositions($addr: String!) {
        positions(
          where: { account: { id: { _eq: $addr } }, shares: { _gt: "0" } }
          limit: 1000
        ) {
          vault { term_id }
        }
      }
    `;
    const posData = await fetchGraph(positionsQ, { addr: wallet });
    const termIds =
      (posData?.positions || [])
        .map((p) => p.vault?.term_id)
        .filter(Boolean);
    if (!termIds.length) {
      state.set(wallet, now.toISOString());
      return;
    }

    // 2) Activity on those holdings since last check (others trading; exclude user's own trades)
    const actQ = `
      query WorkerHoldingsActivity($addr: String!, $ids: [String!]!, $since: timestamptz!) {
        events(
          where: {
            _and: [
              { created_at: { _gt: $since } },
              { type: { _in: ["Deposited", "Redeemed"] } },
              { _or: [
                { atom: { term_id: { _in: $ids } } },
                { triple: { term_id: { _in: $ids } } }
              ] },
              { _not: {
                _or: [
                  { deposit: { _or: [ { sender_id: { _eq: $addr } }, { receiver_id: { _eq: $addr } } ] } },
                  { redemption: { _or: [ { sender_id: { _eq: $addr } }, { receiver_id: { _eq: $addr } } ] } }
                ]
              } }
            ]
          },
          order_by: { created_at: asc },
          limit: 50
        ) {
          id created_at type transaction_hash
          atom { term_id label }
          triple { term_id subject { label } predicate { label } object { label } }
          deposit { shares assets_after_fees sender { id label } }
          redemption { shares assets sender { id label } }
        }
      }
    `;
    const actData = await fetchGraph(actQ, {
      addr: wallet,
      ids: termIds,
      since,
    });
    const events = actData?.events || [];
    if (!events.length) {
      state.set(wallet, now.toISOString());
      return;
    }

    for (const ev of events) {
      const deposit = ev.deposit;
      const redemption = ev.redemption;
      const sender = deposit?.sender || redemption?.sender;
      if (!sender) continue;

      const marketLabel =
        ev.atom?.label ||
        (ev.triple
          ? `${ev.triple.subject?.label || 'Subject'} ${
              ev.triple.predicate?.label || 'LINK'
            } ${ev.triple.object?.label || 'Object'}`
          : 'Unknown market');

      const typeLabel = ev.type === 'Redeemed' ? 'liquidated' : 'acquired';
      const shares = deposit?.shares || redemption?.shares || '0';
      const subject = `Holdings alert: ${sender.label || sender.id.slice(0, 8)} ${typeLabel} in ${marketLabel}`;
      const message = `${sender.label || sender.id} ${typeLabel} ${shares} shares in ${marketLabel}.\nTx: ${
        ev.transaction_hash || ev.id
      }`;

      if (daily) {
        appendDailyDigest(wallet, `${subject}\n${message}`);
        continue;
      }
      await sendEmail({ to, subject: `IntuRank: ${sender.label || sender.id.slice(0, 8)} ${typeLabel} in ${marketLabel}`, message });
    }

    state.set(wallet, now.toISOString());
  } catch (e) {
    console.error('[email-worker] Error polling wallet', wallet, e);
  }
}

async function pollFollowActivity(sub) {
  const wallet = String(sub.wallet || '').toLowerCase();
  const to = sub.email;
  const follows = Array.isArray(sub.follows) ? sub.follows.filter((f) => f.emailAlerts !== false) : [];
  if (!wallet || !to || !follows.length) return;
  const daily = String(sub.alertFrequency || 'per_tx').toLowerCase() === 'daily';

  const identityIds = follows.map((f) => f.identityId).filter(Boolean);
  const allIds = identityIds.flatMap((id) => prepareQueryIds(id));
  const uniqueIds = [...new Set(allIds)].slice(0, 100);
  if (!uniqueIds.length) return;

  const stateKey = (evId) => `follow:${wallet}:${evId}`;
  const getNotified = () => {
    if (!followState.has(wallet)) followState.set(wallet, new Set());
    return followState.get(wallet);
  };

  try {
    const followQ = `
      query WorkerFollowActivity($ids: [String!]!, $limit: Int!) {
        events(
          where: {
            _and: [
              { type: { _in: ["Deposited", "Redeemed"] } },
              { _or: [
                { deposit: { _or: [ { sender_id: { _in: $ids } }, { receiver_id: { _in: $ids } } ] } },
                { redemption: { _or: [ { sender_id: { _in: $ids } }, { receiver_id: { _in: $ids } } ] } }
              ] }
            ]
          },
          order_by: { created_at: desc },
          limit: $limit
        ) {
          id created_at type transaction_hash
          atom { term_id label }
          triple { term_id subject { label } predicate { label } object { label } }
          deposit { shares assets_after_fees sender_id receiver_id sender { id label } receiver { id label } }
          redemption { shares assets sender_id receiver_id sender { id label } receiver { id label } }
        }
      }
    `;
    const data = await fetchGraph(followQ, { ids: uniqueIds, limit: 30 });
    const events = data?.events || [];
    const idsSet = new Set(uniqueIds.map((i) => i.toLowerCase()));
    const notified = getNotified();

    for (const ev of events) {
      if (notified.has(ev.id)) continue;
      const deposit = ev.deposit;
      const redemption = ev.redemption;
      const sender = deposit?.sender || redemption?.sender;
      const receiver = deposit?.receiver || redemption?.receiver;
      const senderIdNorm = sender ? String(sender.id).toLowerCase() : '';
      const receiverIdNorm = receiver ? String(receiver.id).toLowerCase() : '';
      const isSenderProxy = isDepositSenderProxy(senderIdNorm);
      const isReceiverInIds = receiverIdNorm && idsSet.has(receiverIdNorm);
      const isSenderInIds = senderIdNorm && idsSet.has(senderIdNorm);
      const accountToShow =
        isReceiverInIds && isSenderProxy ? receiver
        : isSenderInIds && !isSenderProxy ? sender
        : isReceiverInIds ? receiver
        : isSenderInIds ? sender
        : null;
      if (!accountToShow) continue;

      const followEntry = follows.find((f) => {
        const fid = toAddress(f.identityId) || f.identityId;
        const anorm = String(accountToShow.id).toLowerCase();
        return fid && (fid.toLowerCase() === anorm || prepareQueryIds(f.identityId).some((v) => v.toLowerCase() === anorm));
      });
      const label = followEntry?.label || accountToShow.label || `${accountToShow.id.slice(0, 6)}...${accountToShow.id.slice(-4)}`;

      const marketLabel =
        ev.atom?.label ||
        (ev.triple
          ? `${ev.triple.subject?.label || 'Subject'} ${ev.triple.predicate?.label || 'LINK'} ${ev.triple.object?.label || 'Object'}`
          : 'Unknown market');
      const typeLabel = ev.type === 'Redeemed' ? 'liquidated' : 'acquired';
      const shares = deposit?.shares || redemption?.shares || '0';
      const subject = `IntuRank: ${label} ${typeLabel} in ${marketLabel}`;
      const message = `${label} ${typeLabel} ${shares} shares in ${marketLabel}.\nTx: ${ev.transaction_hash || ev.id}`;

      if (daily) {
        appendDailyDigest(wallet, `${subject}\n${message}`);
      } else {
        await sendEmail({ to, subject, message });
      }
      notified.add(ev.id);
      if (notified.size > 500) {
        const arr = Array.from(notified);
        notified.clear();
        arr.slice(-300).forEach((x) => notified.add(x));
      }
    }
  } catch (e) {
    console.error('[email-worker] Error polling follow activity', wallet, e);
  }
}

async function tick() {
  const subs = await loadSubscriptions();
  if (!subs.length) {
    console.log('[email-worker] No subscriptions yet.');
    return;
  }
  await Promise.all(subs.map((sub) => pollWallet(sub)));
  await Promise.all(subs.map((sub) => pollFollowActivity(sub)));
  await flushDailyDigests();
}

if (ensendConfigured) {
  console.log('[email-worker] Started email worker.');
  tick();
  setInterval(tick, 60_000);
}

