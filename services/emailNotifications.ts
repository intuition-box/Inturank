/**
 * Email notification subscriptions and delivery.
 * Subscriptions are stored locally and tied to wallet address.
 * Actual email sending is stubbed until SMTP is configured.
 */

import type { PositionActivityNotification } from './graphql';
import { formatEther } from 'viem';
import { formatMarketValue, formatDisplayedShares } from './analytics';
import type { TransactionReceiptData, TransferReceiptData } from './emailTemplates';
import { getInturankApiOrigin } from '../constants';

const STORAGE_KEY = 'inturank_email_subscriptions';
const NOTIFIED_IDS_KEY_PREFIX = 'inturank_notified_activity_';
const NOTIFIED_FOLLOW_KEY_PREFIX = 'inturank_notified_follow_';
const MAX_NOTIFIED_IDS = 2000;
const DIGEST_QUEUE_KEY_PREFIX = 'inturank_digest_queue_';
const DIGEST_LAST_SENT_KEY_PREFIX = 'inturank_digest_last_sent_';
const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_DIGEST_ITEMS = 100;
/** Only send follow-activity emails for events within this window (avoids spamming 30 emails on first load). */
const RECENT_FOLLOW_ACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 hours

export type EmailAlertFrequency = 'per_tx' | 'daily';

export interface EmailSubscription {
  email: string;
  nickname?: string;
  subscribedAt: number;
  /** Applies to: (1) your transaction receipts, (2) activity on your holdings. Follow alerts are always every transaction. */
  alertFrequency?: EmailAlertFrequency;
}

function normalizeWallet(addr: string): string {
  return (addr || '').toLowerCase();
}

function loadSubscriptions(): Record<string, EmailSubscription> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveSubscriptions(subs: Record<string, EmailSubscription>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  } catch (_) {}
}

/** Get email subscription for a wallet, if any. */
export function getEmailSubscription(walletAddress: string): EmailSubscription | null {
  const key = normalizeWallet(walletAddress);
  const subs = loadSubscriptions();
  const sub = subs[key];
  return sub?.email ? sub : null;
}

/** Register or update email subscription for a wallet. Returns true if the email API saved (welcome is sent server-side when configured). */
export async function setEmailSubscription(
  walletAddress: string,
  email: string,
  nickname?: string,
  alertFrequency?: EmailAlertFrequency,
  follows?: Array<{ identityId: string; label?: string; emailAlerts: boolean }>
): Promise<boolean> {
  const key = normalizeWallet(walletAddress);
  const subs = loadSubscriptions();
  const existing = subs[key];
  const trimmedEmail = email.trim().toLowerCase();
  subs[key] = {
    email: trimmedEmail,
    nickname: nickname?.trim() || undefined,
    subscribedAt: existing?.subscribedAt ?? Date.now(),
    alertFrequency: alertFrequency ?? existing?.alertFrequency ?? 'per_tx',
  };
  saveSubscriptions(subs);

  const followList = Array.isArray(follows) ? follows : [];
  try {
    const res = await fetch(getEmailSubscribeUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: walletAddress,
        email: trimmedEmail,
        nickname: nickname?.trim() || undefined,
        alertFrequency: alertFrequency ?? existing?.alertFrequency ?? 'per_tx',
        follows: followList,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Update only the alert frequency for an existing subscription. */
export function setEmailAlertFrequency(walletAddress: string, alertFrequency: EmailAlertFrequency): void {
  const key = normalizeWallet(walletAddress);
  const subs = loadSubscriptions();
  const sub = subs[key];
  if (!sub?.email) return;
  subs[key] = { ...sub, alertFrequency };
  saveSubscriptions(subs);
}

/** Remove email subscription for a wallet. */
export function removeEmailSubscription(walletAddress: string): void {
  const key = normalizeWallet(walletAddress);
  const subs = loadSubscriptions();
  delete subs[key];
  saveSubscriptions(subs);

  try {
    fetch(getEmailUnsubscribeUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: walletAddress }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/** Persisted set of activity notification IDs we already emailed (per wallet) so we never send duplicates or re-send old activities. */
function loadNotifiedIds(walletAddress: string): Set<string> {
  try {
    const key = NOTIFIED_IDS_KEY_PREFIX + normalizeWallet(walletAddress);
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.slice(-MAX_NOTIFIED_IDS)) : new Set();
  } catch {
    return new Set();
  }
}

function saveNotifiedIds(walletAddress: string, ids: Set<string>): void {
  try {
    const key = NOTIFIED_IDS_KEY_PREFIX + normalizeWallet(walletAddress);
    const arr = Array.from(ids).slice(-MAX_NOTIFIED_IDS);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (_) {}
}

function loadNotifiedFollowIds(walletAddress: string): Set<string> {
  try {
    const key = NOTIFIED_FOLLOW_KEY_PREFIX + normalizeWallet(walletAddress);
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.slice(-MAX_NOTIFIED_IDS)) : new Set();
  } catch {
    return new Set();
  }
}

function saveNotifiedFollowIds(walletAddress: string, ids: Set<string>): void {
  try {
    const key = NOTIFIED_FOLLOW_KEY_PREFIX + normalizeWallet(walletAddress);
    const arr = Array.from(ids).slice(-MAX_NOTIFIED_IDS);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (_) {}
}

/** Digest queue: receipts and activity-on-holdings when frequency is daily. */
export type DigestQueueItem =
  | {
      kind: 'receipt';
      receipt: TransactionReceiptData;
    }
  | {
      kind: 'activity';
      notification: PositionActivityNotification;
    };

function loadDigestQueue(walletAddress: string): DigestQueueItem[] {
  try {
    const key = DIGEST_QUEUE_KEY_PREFIX + normalizeWallet(walletAddress);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-MAX_DIGEST_ITEMS) : [];
  } catch {
    return [];
  }
}

function saveDigestQueue(walletAddress: string, items: DigestQueueItem[]): void {
  try {
    const key = DIGEST_QUEUE_KEY_PREFIX + normalizeWallet(walletAddress);
    localStorage.setItem(key, JSON.stringify(items.slice(-MAX_DIGEST_ITEMS)));
  } catch (_) {}
}

function loadDigestLastSent(walletAddress: string): number {
  try {
    const key = DIGEST_LAST_SENT_KEY_PREFIX + normalizeWallet(walletAddress);
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    return parseInt(raw, 10) || 0;
  } catch {
    return 0;
  }
}

function saveDigestLastSent(walletAddress: string, ts: number): void {
  try {
    const key = DIGEST_LAST_SENT_KEY_PREFIX + normalizeWallet(walletAddress);
    localStorage.setItem(key, String(ts));
  } catch (_) {}
}

/**
 * Called when there's activity on a claim the user holds (someone else bought/sold).
 * Respects alert frequency: per_tx = email now; daily = add to digest queue.
 */
export async function requestEmailNotification(
  walletAddress: string,
  notification: PositionActivityNotification
): Promise<void> {
  const sub = getEmailSubscription(walletAddress);
  if (!sub?.email) return;

  const notified = loadNotifiedIds(walletAddress);
  if (notified.has(notification.id)) return;
  notified.add(notification.id);
  saveNotifiedIds(walletAddress, notified);

  if (sub.alertFrequency === 'daily') {
    const queue = loadDigestQueue(walletAddress);
    queue.push({ kind: 'activity', notification });
    saveDigestQueue(walletAddress, queue);
    return;
  }

  const sharesFormatted = notification.shares ? formatDisplayedShares(notification.shares) : '—';
  const assetsNum = notification.assets ? parseFloat(formatEther(BigInt(notification.assets))) : 0;
  const assetsFormatted = assetsNum > 0 ? `₸${formatMarketValue(assetsNum)}` : '—';

  const subject = `IntuRank: ${notification.type === 'liquidated' ? 'Liquidation' : 'New activity'} in ${notification.marketLabel}`;
  const plainBody = [
    `${notification.senderLabel} ${notification.type === 'liquidated' ? 'liquidated' : 'acquired'}${notification.shares ? ` ${sharesFormatted} shares` : ''}${assetsNum > 0 ? ` (₸${formatMarketValue(assetsNum)})` : ''} in ${notification.marketLabel}.`,
    notification.txHash ? `Tx: ${notification.txHash}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const { getActivityNotificationHtml } = await import('./emailTemplates');
  const html = getActivityNotificationHtml({
    marketLabel: notification.marketLabel,
    senderLabel: notification.senderLabel,
    type: notification.type,
    sharesFormatted,
    assetsFormatted,
    txHash: notification.txHash,
  });

  await sendEmailWithHtml({
    to: sub.email,
    subject,
    message: plainBody,
    html,
  });
}

/**
 * Send email when someone you follow buys or sells (activity by followed identity).
 * Uses a separate "notified follow" set per wallet so we don't duplicate.
 * Only sends for activity within RECENT_FOLLOW_ACTIVITY_MS so we don't spam on first load.
 */
export async function requestFollowedActivityEmail(
  walletAddress: string,
  followedLabel: string,
  notification: PositionActivityNotification
): Promise<void> {
  const sub = getEmailSubscription(walletAddress);
  if (!sub?.email) return;

  const notified = loadNotifiedFollowIds(walletAddress);
  if (notified.has(notification.id)) return;
  // Only email for recent activity (same as activity-on-my-markets); avoids 30 emails on first load
  const now = Date.now();
  if (notification.timestamp && now - notification.timestamp > RECENT_FOLLOW_ACTIVITY_MS) {
    notified.add(notification.id);
    saveNotifiedFollowIds(walletAddress, notified);
    return;
  }
  notified.add(notification.id);
  saveNotifiedFollowIds(walletAddress, notified);

  const sharesFormatted = notification.shares ? formatDisplayedShares(notification.shares) : '—';
  const assetsNum = notification.assets ? parseFloat(formatEther(BigInt(notification.assets))) : 0;
  const assetsFormatted = assetsNum > 0 ? `₸${formatMarketValue(assetsNum)}` : '—';

  const subject = `IntuRank: ${followedLabel} ${notification.type === 'liquidated' ? 'liquidated' : 'acquired'} in ${notification.marketLabel}`;
  const plainBody = [
    `${followedLabel} ${notification.type === 'liquidated' ? 'liquidated' : 'acquired'}${notification.shares ? ` ${sharesFormatted} shares` : ''}${assetsNum > 0 ? ` (₸${formatMarketValue(assetsNum)})` : ''} in ${notification.marketLabel}.`,
    notification.txHash ? `Tx: ${notification.txHash}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const { getActivityNotificationHtml } = await import('./emailTemplates');
  const html = getActivityNotificationHtml({
    marketLabel: notification.marketLabel,
    senderLabel: followedLabel,
    type: notification.type,
    sharesFormatted,
    assetsFormatted,
    txHash: notification.txHash,
  });

  await sendEmailWithHtml({
    to: sub.email,
    subject,
    message: plainBody,
    html,
  });
}

/**
 * Send transaction receipt email when the user buys or sells shares.
 * Respects alert frequency: per_tx = email now; daily = add to digest queue.
 */
export async function sendTransactionReceiptEmail(
  walletAddress: string,
  receipt: TransactionReceiptData
): Promise<void> {
  const sub = getEmailSubscription(walletAddress);
  if (!sub?.email) return;

  if (sub.alertFrequency === 'daily') {
    const queue = loadDigestQueue(walletAddress);
    queue.push({ kind: 'receipt', receipt });
    saveDigestQueue(walletAddress, queue);
    return;
  }

  const subject = `IntuRank: ${receipt.type === 'acquired' ? 'Acquired' : 'Liquidated'} — ${receipt.marketLabel}`;
  const plainMessage = [
    `You ${receipt.type === 'acquired' ? 'acquired' : 'liquidated'} ${receipt.sharesFormatted} shares (${receipt.side}) in ${receipt.marketLabel}.`,
    receipt.assetsFormatted ? `Amount: ${receipt.assetsFormatted}` : '',
    receipt.txHash ? `Tx: ${receipt.txHash}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const { getTransactionReceiptHtml } = await import('./emailTemplates');
  const html = getTransactionReceiptHtml(receipt);

  await sendEmailWithHtml({ to: sub.email, subject, message: plainMessage, html });
}

/**
 * Send transfer receipt email when the user sends native TRUST to another address.
 * Only sends when user has email connected; per_tx = send now, daily = skip (digest does not include transfer receipts yet).
 */
export async function sendTransferReceiptEmail(
  walletAddress: string,
  data: TransferReceiptData
): Promise<void> {
  const sub = getEmailSubscription(walletAddress);
  if (!sub?.email) return;
  if (sub.alertFrequency === 'daily') return;

  const subject = `IntuRank: Transfer confirmed — ${data.amountFormatted} TRUST sent`;
  const plainMessage = `You sent ${data.amountFormatted} TRUST to ${data.toAddress.slice(0, 10)}…${data.toAddress.slice(-8)}. Tx: ${data.txHash}`;
  const { getTransferReceiptHtml } = await import('./emailTemplates');
  const html = getTransferReceiptHtml(data);
  await sendEmailWithHtml({ to: sub.email, subject, message: plainMessage, html });
}

/**
 * If user has daily digest and queue has items and 24h have passed since last digest, send one digest email and clear queue.
 * Call when app loads (e.g. Layout when wallet is set).
 */
export async function maybeSendDailyDigest(walletAddress: string): Promise<void> {
  const sub = getEmailSubscription(walletAddress);
  if (!sub?.email || sub.alertFrequency !== 'daily') return;

  const queue = loadDigestQueue(walletAddress);
  if (queue.length === 0) return;

  const lastSent = loadDigestLastSent(walletAddress);
  if (Date.now() - lastSent < DIGEST_INTERVAL_MS) return;

  const receipts: TransactionReceiptData[] = [];
  const activities: Array<{ marketLabel: string; senderLabel: string; type: 'acquired' | 'liquidated'; sharesFormatted: string; assetsFormatted: string; txHash?: string }> = [];

  for (const item of queue) {
    if (item.kind === 'receipt') receipts.push(item.receipt);
    else {
      const n = item.notification;
      const sharesFormatted = n.shares ? formatDisplayedShares(n.shares) : '—';
      const assetsNum = n.assets ? parseFloat(formatEther(BigInt(n.assets))) : 0;
      const assetsFormatted = assetsNum > 0 ? `₸${formatMarketValue(assetsNum)}` : '—';
      activities.push({
        marketLabel: n.marketLabel,
        senderLabel: n.senderLabel,
        type: n.type,
        sharesFormatted,
        assetsFormatted,
        txHash: n.txHash,
      });
    }
  }

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  const { getDailyDigestHtml } = await import('./emailTemplates');
  const html = getDailyDigestHtml({ receipts, activities, dateLabel });
  const subject = `IntuRank: Daily digest — ${receipts.length + activities.length} update${receipts.length + activities.length === 1 ? '' : 's'}`;
  const plainMessage = `Your IntuRank daily digest: ${receipts.length} transaction(s), ${activities.length} activity update(s) on your holdings.`;

  await sendEmailWithHtml({ to: sub.email, subject, message: plainMessage, html });
  saveDigestQueue(walletAddress, []);
  saveDigestLastSent(walletAddress, Date.now());
}

function getEmailApiBase(): string {
  return getInturankApiOrigin();
}

function getEmailApiUrl(): string {
  const base = getEmailApiBase();
  return base ? `${base}/api/send-email` : '/api/send-email';
}

function getEmailSubscribeUrl(): string {
  const base = getEmailApiBase();
  return base ? `${base}/api/email-subscribe` : '/api/email-subscribe';
}

function getEmailUnsubscribeUrl(): string {
  const base = getEmailApiBase();
  return base ? `${base}/api/email-unsubscribe` : '/api/email-unsubscribe';
}

function getEmailSyncFollowsUrl(): string {
  const base = getEmailApiBase();
  return base ? `${base}/api/sync-follows` : '/api/sync-follows';
}

/** Sync follows to the server so the email worker can send alerts when people you follow trade. Call when user has email subscription. */
export function syncFollowsToServer(
  walletAddress: string,
  follows: Array<{ identityId: string; label?: string; emailAlerts: boolean }>
): void {
  if (!walletAddress) return;
  try {
    fetch(getEmailSyncFollowsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: walletAddress, follows }),
    }).catch(() => {});
  } catch {
    // best-effort
  }
}

/** Optional: set from app to surface email delivery failures (e.g. toast). */
let onEmailFailure: ((message: string) => void) | null = null;
export function setEmailFailureHandler(handler: ((message: string) => void) | null): void {
  onEmailFailure = handler;
}

/**
 * Send the welcome email as full HTML (logo, card, CTA) so it displays correctly in clients.
 * No-op on failure so the UI still shows success.
 */
/** Fallback when /api/email-subscribe could not be reached; same payload as server welcome. */
export async function sendWelcomeEmail(to: string, _nickname?: string): Promise<boolean> {
  const { getWelcomeEmailHtml } = await import('./emailTemplates');
  const subject = 'Welcome to IntuRank';
  const plainMessage = "You're subscribed to IntuRank. We'll email you about activity on your holdings, app updates, and campaigns to earn TRUST (₸) tokens.";
  const html = getWelcomeEmailHtml({ email: to, nickname: _nickname });
  try {
    const url = getEmailApiUrl();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, message: plainMessage, html }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[Welcome email send failed]', res.status, url, err);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Welcome email error]', getEmailApiUrl(), e);
    return false;
  }
}

/** Send email with optional HTML via our backend (Ensend). No-op on failure. */
async function sendEmailWithHtml(payload: {
  to: string;
  subject: string;
  message: string;
  html?: string;
}): Promise<void> {
  try {
    const body: Record<string, string> = {
      to: payload.to,
      subject: payload.subject,
      message: payload.message,
    };
    if (payload.html) body.html = payload.html;
    const url = getEmailApiUrl();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.message || err?.error || res.statusText;
      console.warn('[Email send failed]', res.status, url, err);
      if (onEmailFailure) {
        if (res.status === 503) onEmailFailure('Email is not configured. Contact support.');
        else onEmailFailure('Email delivery failed. Try again later.');
      }
    }
  } catch (e) {
    console.warn('[Email send error]', getEmailApiUrl(), e);
    if (onEmailFailure) onEmailFailure('Email delivery failed. Check your connection.');
  }
}
