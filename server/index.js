/**
 * Email + Arena mirror API (Ensend-backed). Persisted JSON: email-subs, follows,
 * arena-leaderboard.json, arena-user-prefs.json (same `EMAIL_DATA_DIR` volume in prod).
 *
 * Env (in project root .env or .env.local):
 *   ENSEND_PROJECT_SECRET  - from Ensend project credentials
 *   ENSEND_SENDER_EMAIL   - sender address (e.g. yourproject@ensend.co or your domain)
 *   ENSEND_SENDER_NAME    - e.g. "IntuRank"
 *   PORT                  - default 3001
 *   EMAIL_DATA_DIR        - optional; JSON store dir (subs, follows, arena-leaderboard, user prefs — use a persistent volume)
 *
 * Run: npm run email-server
 * In dev, Vite proxies /api to this server.
 */

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWelcomeEmailHtml } from './welcomeEmailHtml.mjs';

// Load .env and .env.local from project root (when run as node server/index.js)
dotenv.config();
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

const ENSEND_SEND_URL = 'https://api.ensend.co/send';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.EMAIL_DATA_DIR || __dirname;
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // ignore
}
const SUBS_PATH = path.join(DATA_DIR, 'email-subs.json');
const FOLLOWS_PATH = path.join(DATA_DIR, 'follows.json');
const ARENA_LB_PATH = path.join(DATA_DIR, 'arena-leaderboard.json');
const USER_PREFS_PATH = path.join(DATA_DIR, 'arena-user-prefs.json');

/** @type {Set<string>} */
const PROTOCOL_XP_REASONS = new Set([
  'market_acquire',
  'create_atom',
  'create_claim',
  'add_to_list',
  'send_trust',
  'skill_chat',
  'skill_atom',
  'skill_triple',
]);
/** Single-event ceiling (mirrors ~one protocol action); stops absurd POSTs. */
const MAX_PROTOCOL_XP_EVENT_DELTA = 250;

/**
 * @param {Record<string, unknown>} body
 * @returns {string} empty if unusable
 */
function protocolXpMirrorDedupeKey(body) {
  const tx = typeof body.txHash === 'string' ? body.txHash.trim().toLowerCase() : '';
  if (/^0x[0-9a-f]{64}$/.test(tx)) {
    const r = String(body.reason || '').trim();
    return `tx:${tx}:${r}`;
  }
  const dk = typeof body.dedupeKey === 'string' ? body.dedupeKey.trim() : '';
  if (dk.length >= 6 && dk.length <= 256) return `dk:${dk}`;
  return '';
}

async function loadFollowsStore() {
  try {
    const raw = await fs.readFile(FOLLOWS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveFollowsStore(store) {
  try {
    await fs.writeFile(FOLLOWS_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('[email-api] Failed to persist follows', e);
  }
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

async function saveSubscriptions(subs) {
  try {
    await fs.writeFile(SUBS_PATH, JSON.stringify(subs, null, 2), 'utf8');
  } catch (e) {
    console.error('[email-api] Failed to persist subscriptions', e);
  }
}

function normArenaWallet(v) {
  const s = String(v || '').trim().toLowerCase();
  return s.startsWith('0x') && s.length >= 42 ? s.slice(0, 42) : '';
}

async function loadArenaLbMap() {
  try {
    const raw = await fs.readFile(ARENA_LB_PATH, 'utf8');
    const p = JSON.parse(raw);
    if (p?.rows && typeof p.rows === 'object') return { ...p.rows };
    return {};
  } catch {
    return {};
  }
}

async function saveArenaLbMap(map) {
  try {
    await fs.writeFile(ARENA_LB_PATH, JSON.stringify({ updatedAt: Date.now(), rows: map }, null, 2), 'utf8');
  } catch (e) {
    console.error('[inturank-api] Failed to persist arena-leaderboard', e);
    throw e;
  }
}

function buildLeaderboardPayload(map) {
  const rows = [];
  for (const r of Object.values(map)) {
    const addr = normArenaWallet(r.address);
    if (!addr) continue;
    const arenaXp = Math.max(0, Math.floor(Number(r.arenaXp ?? r.xp ?? 0) || 0));
    const protocolXp = Math.max(0, Math.floor(Number(r.protocolXp ?? r.protocolXpTotal ?? 0) || 0));
    const xp = arenaXp + protocolXp;
    const duels = Math.max(0, Math.floor(Number(r.duels) || 0));
    const atomsRanked = Math.max(0, Math.floor(Number(r.atomsRanked) || 0));
    const listsPlayed = Math.max(0, Math.floor(Number(r.listsPlayed) || 0));
    const updatedAt = Math.floor(Number(r.updatedAt) || 0);
    if (xp <= 0) continue;
    rows.push({
      address: addr,
      xp,
      arenaXp,
      protocolXp,
      duels,
      atomsRanked,
      listsPlayed,
      updatedAt,
    });
  }
  rows.sort((a, b) => b.xp - a.xp || b.updatedAt - a.updatedAt);
  return rows;
}

async function loadUserPrefsWallets() {
  try {
    const raw = await fs.readFile(USER_PREFS_PATH, 'utf8');
    const p = JSON.parse(raw);
    return p?.wallets && typeof p.wallets === 'object' ? { ...p.wallets } : {};
  } catch {
    return {};
  }
}

async function saveUserPrefsWallets(wallets) {
  try {
    await fs.writeFile(USER_PREFS_PATH, JSON.stringify({ updatedAt: Date.now(), wallets }, null, 2), 'utf8');
  } catch (e) {
    console.error('[inturank-api] Failed to persist user preferences', e);
    throw e;
  }
}

/** Ensend send for HTML/plain (same shape as browser /api/send-email non-template path). */
async function sendEnsendHtmlEmail({ to, subject, message, html }) {
  const secret = process.env.ENSEND_PROJECT_SECRET;
  const senderEmail = process.env.ENSEND_SENDER_EMAIL;
  const senderName = process.env.ENSEND_SENDER_NAME || 'IntuRank';
  if (!secret || !senderEmail) return { ok: false, error: 'not_configured' };
  const payload = {
    subject,
    message: html || message || subject,
    sender: { name: senderName, email: senderEmail },
    recipients: to,
  };
  if (html) {
    payload.html = html;
    payload.body = html;
  }
  const response = await fetch(ENSEND_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: data?.message || data?.error || response.statusText, status: response.status };
  }
  return { ok: true };
}

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  const secret = process.env.ENSEND_PROJECT_SECRET;
  const sender = process.env.ENSEND_SENDER_EMAIL;
  res.status(200).json({
    ok: true,
    service: 'inturank-api',
    features: ['email', 'follows', 'arena-leaderboard', 'user-preferences'],
    emailConfigured: !!(secret && sender),
  });
});

// So root URL doesn't show "Cannot GET /" and you can confirm env is set (no secrets exposed)
app.get('/', (_req, res) => {
  const secret = process.env.ENSEND_PROJECT_SECRET;
  const sender = process.env.ENSEND_SENDER_EMAIL;
  res.status(200).json({
    service: 'inturank-api',
    ok: true,
    emailConfigured: !!(secret && sender),
    endpoints: [
      '/api/send-email',
      '/api/email-subscribe',
      '/api/follows',
      '/api/sync-follows',
      '/api/arena-leaderboard',
      '/api/user-preferences',
    ],
  });
});

// Store email subscriptions server-side so worker can send alerts for everyone
app.post('/api/email-subscribe', async (req, res) => {
  const { wallet, email, nickname, alertFrequency } = req.body || {};
  if (!wallet || !email) {
    return res.status(400).json({ error: 'Missing wallet or email' });
  }
  const normalizedWallet = String(wallet).toLowerCase();
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const subs = await loadSubscriptions();
    const idx = subs.findIndex((s) => s.wallet.toLowerCase() === normalizedWallet);
    const prevEmail = idx >= 0 ? String(subs[idx].email || '').trim().toLowerCase() : null;
    const next = {
      wallet: normalizedWallet,
      email: normalizedEmail,
      nickname: nickname?.trim() || undefined,
      alertFrequency: alertFrequency === 'daily' ? 'daily' : 'per_tx',
      subscribedAt: Date.now(),
      follows: req.body?.follows && Array.isArray(req.body.follows) ? req.body.follows : (subs[idx]?.follows || []),
    };
    if (idx >= 0) subs[idx] = { ...subs[idx], ...next };
    else subs.push({ ...next, follows: next.follows || [] });
    await saveSubscriptions(subs);
    const store = await loadFollowsStore();
    store[normalizedWallet] = next.follows || [];
    await saveFollowsStore(store);

    const shouldSendWelcome = !prevEmail || prevEmail !== normalizedEmail;
    if (shouldSendWelcome && process.env.ENSEND_PROJECT_SECRET && process.env.ENSEND_SENDER_EMAIL) {
      try {
        const html = getWelcomeEmailHtml({ email: normalizedEmail, nickname: next.nickname });
        const plain =
          "You're subscribed to IntuRank. We'll email you about activity on your holdings, app updates, and campaigns to earn TRUST (₸) tokens.";
        const result = await sendEnsendHtmlEmail({
          to: normalizedEmail,
          subject: 'Welcome to IntuRank',
          message: plain,
          html,
        });
        if (result.ok) {
          console.log('[email-api] Welcome email sent →', normalizedEmail);
        } else {
          console.warn('[email-api] Welcome email failed:', result.error);
        }
      } catch (we) {
        console.error('[email-api] Welcome email exception', we);
      }
    } else if (shouldSendWelcome) {
      console.warn('[email-api] Welcome skipped: ENSEND_PROJECT_SECRET / ENSEND_SENDER_EMAIL not set');
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[email-api] subscribe error', e);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

app.post('/api/email-unsubscribe', async (req, res) => {
  const { wallet } = req.body || {};
  if (!wallet) return res.status(400).json({ error: 'Missing wallet' });
  const normalizedWallet = String(wallet).toLowerCase();
  try {
    const subs = await loadSubscriptions();
    const filtered = subs.filter((s) => s.wallet.toLowerCase() !== normalizedWallet);
    await saveSubscriptions(filtered);
    res.json({ ok: true });
  } catch (e) {
    console.error('[email-api] unsubscribe error', e);
    res.status(500).json({ error: 'Failed to update subscriptions' });
  }
});

// Get follows for a wallet (so frontend can restore after refresh/new device)
app.get('/api/follows', async (req, res) => {
  const wallet = (req.query.wallet || req.query.w || '').toString().trim();
  if (!wallet) return res.status(400).json({ error: 'Missing wallet' });
  const normalizedWallet = String(wallet).toLowerCase();
  try {
    const store = await loadFollowsStore();
    let list = Array.isArray(store[normalizedWallet]) ? store[normalizedWallet] : [];
    if (list.length === 0) {
      const subs = await loadSubscriptions();
      const sub = subs.find((s) => s.wallet.toLowerCase() === normalizedWallet);
      if (sub && Array.isArray(sub.follows)) list = sub.follows;
    }
    return res.json({ follows: list });
  } catch (e) {
    console.error('[email-api] get follows error', e);
    return res.status(500).json({ error: 'Failed to load follows' });
  }
});

// Sync follows so the email worker can send alerts when people you follow trade.
// Persists for all wallets so we can restore on frontend after refresh/new device.
app.post('/api/sync-follows', async (req, res) => {
  const { wallet, follows } = req.body || {};
  if (!wallet) return res.status(400).json({ error: 'Missing wallet' });
  const normalizedWallet = String(wallet).toLowerCase();
  const list = Array.isArray(follows) ? follows : [];
  try {
    const subs = await loadSubscriptions();
    const idx = subs.findIndex((s) => s.wallet.toLowerCase() === normalizedWallet);
    if (idx >= 0) {
      subs[idx] = { ...subs[idx], follows: list };
      await saveSubscriptions(subs);
    }
    const store = await loadFollowsStore();
    store[normalizedWallet] = list;
    await saveFollowsStore(store);
    res.json({ ok: true });
  } catch (e) {
    console.error('[email-api] sync-follows error', e);
    res.status(500).json({ error: 'Failed to sync follows' });
  }
});

// --- Arena: leaderboard mirror (GET list + POST telemetry + protocol_xp) ---
// Prefer POST kind=protocol_xp_event (additive, idempotent per tx/reason or dedupeKey).
// Legacy kind=protocol_xp overwrites protocolXp from client total — deprecated for untrusted clients.
app.get('/api/arena-leaderboard', async (_req, res) => {
  try {
    const map = await loadArenaLbMap();
    const leaderboard = buildLeaderboardPayload(map);
    res.json({ leaderboard });
  } catch (e) {
    console.error('[inturank-api] arena-leaderboard GET', e);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

app.post('/api/arena-leaderboard', async (req, res) => {
  const body = req.body || {};
  const w = normArenaWallet(body.address);
  if (!w) return res.status(400).json({ error: 'Missing or invalid address' });
  try {
    const map = await loadArenaLbMap();
    const prev = map[w] || {
      address: w,
      arenaXp: 0,
      protocolXp: 0,
      duels: 0,
      atomsRanked: 0,
      listsPlayed: 0,
      updatedAt: 0,
    };

    if (body.kind === 'protocol_xp_event') {
      const reason = String(body.reason || '').trim();
      if (!PROTOCOL_XP_REASONS.has(reason)) {
        return res.status(400).json({ error: 'Invalid protocol XP reason' });
      }
      const dedupeKey = protocolXpMirrorDedupeKey(body);
      if (!dedupeKey) {
        return res.status(400).json({ error: 'protocol_xp_event requires txHash or dedupeKey' });
      }
      const deltaRaw = Number(body.protocolXpDelta ?? body.delta);
      if (!Number.isFinite(deltaRaw) || deltaRaw <= 0) {
        return res.status(400).json({ error: 'Invalid delta' });
      }
      const delta = Math.min(Math.max(0, Math.floor(deltaRaw)), MAX_PROTOCOL_XP_EVENT_DELTA);

      const seenList = Array.isArray(prev.protocolXpSeenKeys) ? [...prev.protocolXpSeenKeys] : [];
      if (seenList.includes(dedupeKey)) {
        return res.json({ ok: true, duplicate: true });
      }
      seenList.push(dedupeKey);
      while (seenList.length > 500) seenList.shift();

      prev.protocolXpSeenKeys = seenList;
      prev.protocolXp = Math.max(0, Math.floor(Number(prev.protocolXp) || 0)) + delta;
      prev.updatedAt = Date.now();
      map[w] = prev;
      await saveArenaLbMap(map);
      return res.json({ ok: true, applied: delta });
    }

    if (body.kind === 'protocol_xp') {
      const t = Number(body.protocolXpTotal);
      if (Number.isFinite(t)) prev.protocolXp = Math.max(0, Math.floor(t));
      prev.updatedAt = Date.now();
      map[w] = prev;
      await saveArenaLbMap(map);
      return res.json({ ok: true });
    }

    const ax = Number(body.xp ?? body.arenaXp);
    if (Number.isFinite(ax)) prev.arenaXp = Math.max(0, Math.floor(ax));
    const duels = Number(body.duels);
    if (Number.isFinite(duels)) prev.duels = Math.max(0, Math.floor(duels));
    const atomsRanked = Number(body.atomsRanked);
    if (Number.isFinite(atomsRanked)) prev.atomsRanked = Math.max(0, Math.floor(atomsRanked));
    const listsPlayed = Number(body.listsPlayed);
    if (Number.isFinite(listsPlayed)) prev.listsPlayed = Math.max(0, Math.floor(listsPlayed));
    prev.updatedAt = Date.now();
    map[w] = prev;
    await saveArenaLbMap(map);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[inturank-api] arena-leaderboard POST', e);
    return res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

// Arena: starred list ids per wallet (syncs across devices when VITE_INTURANK_API_URL is set)
app.get('/api/user-preferences', async (req, res) => {
  const w = normArenaWallet(req.query.wallet);
  if (!w) return res.status(400).json({ error: 'Missing or invalid wallet' });
  try {
    const store = await loadUserPrefsWallets();
    const doc = store[w] || {};
    const arenaFavoriteListIds = Array.isArray(doc.arenaFavoriteListIds)
      ? doc.arenaFavoriteListIds.filter((x) => typeof x === 'string')
      : [];
    res.json({ wallet: w, arenaFavoriteListIds });
  } catch (e) {
    console.error('[inturank-api] user-preferences GET', e);
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

app.post('/api/user-preferences', async (req, res) => {
  const w = normArenaWallet(req.body?.wallet);
  if (!w) return res.status(400).json({ error: 'Missing or invalid wallet' });
  const raw = req.body?.arenaFavoriteListIds;
  const arenaFavoriteListIds = Array.isArray(raw)
    ? [...new Set(raw.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))]
    : [];
  try {
    const store = await loadUserPrefsWallets();
    store[w] = {
      ...store[w],
      wallet: w,
      arenaFavoriteListIds,
      updatedAt: Date.now(),
    };
    await saveUserPrefsWallets(store);
    res.json({ ok: true, arenaFavoriteListIds });
  } catch (e) {
    console.error('[inturank-api] user-preferences POST', e);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

app.post('/api/send-email', async (req, res) => {
  const secret = process.env.ENSEND_PROJECT_SECRET;
  const senderEmail = process.env.ENSEND_SENDER_EMAIL;
  const senderName = process.env.ENSEND_SENDER_NAME || 'IntuRank';

  if (!secret || !senderEmail) {
    return res.status(503).json({
      error: 'Email not configured',
      message: 'Set ENSEND_PROJECT_SECRET and ENSEND_SENDER_EMAIL in .env or .env.local.',
    });
  }

  const { to, subject, message, html, templateId, variables } = req.body || {};
  if (!to) {
    return res.status(400).json({ error: 'Missing to' });
  }

  // Template send: use Ensend template ID + variables (Ensend requires message + subject)
  if (templateId) {
    const fallbackMessage = "You're subscribed to IntuRank email alerts. We'll notify you when there's activity on your holdings.";
    const payload = {
      subject: subject || "You're in — IntuRank Email Alerts",
      message: (typeof message === 'string' && message.trim()) ? message : fallbackMessage,
      sender: { name: senderName, email: senderEmail },
      recipients: to,
      templateId,
      ...(variables && Object.keys(variables).length ? { variables } : {}),
    };

    console.log('[send-email] Sending via template', templateId, 'to', to, 'payload keys:', Object.keys(payload));

    try {
      const response = await fetch(ENSEND_SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('[send-email] Ensend template error', response.status, data);
        return res.status(response.status).json({
          error: 'Send failed',
          details: data?.message || data?.error || response.statusText,
        });
      }
      console.log('[send-email] OK (template) for', to);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[send-email]', err);
      return res.status(500).json({ error: 'Send failed', details: err.message });
    }
  }

  if (!subject) {
    return res.status(400).json({ error: 'Missing subject (required when not using templateId)' });
  }

  console.log('[send-email] Sending to', to, 'subject:', subject);

  try {
    const result = await sendEnsendHtmlEmail({ to, subject, message, html });
    if (!result.ok) {
      if (result.error === 'not_configured') {
        return res.status(503).json({
          error: 'Email not configured',
          message: 'Set ENSEND_PROJECT_SECRET and ENSEND_SENDER_EMAIL in .env or .env.local.',
        });
      }
      console.error('[send-email] Ensend error', result.status, result.error);
      return res.status(result.status || 502).json({
        error: 'Send failed',
        details: result.error,
      });
    }
    console.log('[send-email] OK for', to);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[send-email]', err);
    return res.status(500).json({ error: 'Send failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`IntuRank API running at http://localhost:${PORT}`);
});

// Optionally start the background email worker in the same process.
// Useful in production (Coolify, Railway, etc.) so one always-on service
// serves the API and sends alerts without relying on the user's browser.
// Requires Ensend — otherwise the worker is skipped (see email-worker.js).
const enableEmailWorker = String(process.env.ENABLE_EMAIL_WORKER ?? '').trim() === 'true';
const ensendForWorker =
  process.env.ENSEND_PROJECT_SECRET && process.env.ENSEND_SENDER_EMAIL;
if (enableEmailWorker && ensendForWorker) {
  import('./email-worker.js')
    .then(() => {
      console.log('[email-api] Email worker attached (ENABLE_EMAIL_WORKER=true).');
    })
    .catch((err) => {
      console.error('[email-api] Failed to start email worker', err);
    });
} else if (enableEmailWorker && !ensendForWorker) {
  console.warn(
    '[email-api] ENABLE_EMAIL_WORKER=true but ENSEND_PROJECT_SECRET / ENSEND_SENDER_EMAIL missing — background worker disabled.',
  );
}
