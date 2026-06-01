/**
 * SQLite-backed XP / leaderboard / gift store (node:sqlite — Node 22+, no native deps).
 * Replaces the JSON arena-leaderboard.json + arena-gifts.json with one DB file (arena.db) on EMAIL_DATA_DIR.
 *
 * Model: per-wallet, per-SEASON totals (`wallet_season`) so leaderboards are season-scoped.
 *  - Earned XP events deduped per wallet, forever (`xp_seen`, key = `tx:{hash}:{reason}` or `dk:{key}`).
 *  - Gifts deduped + audited (`gifts`, PK = giftId).
 *  - Active season from ARENA_SEASON env (default 's1'); a legacy arena-leaderboard.json imports into 's1'.
 *
 * Wire shapes returned here match the old JSON server exactly (address/xp/arenaXp/protocolXp/giftXp/…),
 * so the frontend contract is unchanged.
 */
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';

const ACTIVE_SEASON = (String(process.env.ARENA_SEASON || 's1').trim() || 's1').slice(0, 32);

/** @type {InstanceType<typeof DatabaseSync> | null} */
let db = null;

function int(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}
function normWallet(v) {
  const s = String(v || '').trim().toLowerCase();
  return s.startsWith('0x') && s.length >= 42 ? s.slice(0, 42) : '';
}

export function getActiveSeason() {
  return ACTIVE_SEASON;
}

export function initStore(dataDir) {
  if (db) return db;
  db = new DatabaseSync(path.join(dataDir, 'arena.db'));
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_season (
      wallet TEXT NOT NULL,
      season TEXT NOT NULL,
      arena_xp INTEGER NOT NULL DEFAULT 0,
      activity_xp INTEGER NOT NULL DEFAULT 0,
      gift_xp INTEGER NOT NULL DEFAULT 0,
      duels INTEGER NOT NULL DEFAULT 0,
      atoms_ranked INTEGER NOT NULL DEFAULT 0,
      lists_played INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet, season)
    );
    CREATE INDEX IF NOT EXISTS idx_ws_season ON wallet_season(season);
    CREATE TABLE IF NOT EXISTS xp_seen (
      wallet TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet, dedupe_key)
    );
    CREATE TABLE IF NOT EXISTS gifts (
      gift_id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      season TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT,
      granted_by TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  maybeImportLegacyJson(dataDir);
  return db;
}

/** One-time import of the legacy JSON leaderboard into the active season (dev continuity; no-op once populated). */
function maybeImportLegacyJson(dataDir) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM wallet_season').get();
  if (existing && Number(existing.n) > 0) return;
  const lbPath = path.join(dataDir, 'arena-leaderboard.json');
  if (!existsSync(lbPath)) return;
  try {
    const parsed = JSON.parse(readFileSync(lbPath, 'utf8'));
    const rows = parsed?.rows && typeof parsed.rows === 'object' ? parsed.rows : {};
    const ins = db.prepare(
      `INSERT OR IGNORE INTO wallet_season
        (wallet,season,arena_xp,activity_xp,gift_xp,duels,atoms_ranked,lists_played,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    const seen = db.prepare('INSERT OR IGNORE INTO xp_seen(wallet,dedupe_key,created_at) VALUES(?,?,?)');
    const giftMark = db.prepare(
      'INSERT OR IGNORE INTO gifts(gift_id,wallet,season,amount,reason,granted_by,created_at) VALUES(?,?,?,?,?,?,?)',
    );
    db.exec('BEGIN');
    for (const r of Object.values(rows)) {
      const w = normWallet(r.address);
      if (!w) continue;
      ins.run(
        w, ACTIVE_SEASON,
        int(r.arenaXp ?? r.xp), int(r.protocolXp ?? r.protocolXpTotal), int(r.giftXp),
        int(r.duels), int(r.atomsRanked), int(r.listsPlayed), int(r.updatedAt),
      );
      for (const k of Array.isArray(r.protocolXpSeenKeys) ? r.protocolXpSeenKeys : []) {
        if (typeof k === 'string' && k) seen.run(w, k, 0);
      }
      for (const g of Array.isArray(r.giftSeenKeys) ? r.giftSeenKeys : []) {
        if (typeof g === 'string' && g) giftMark.run(g, w, ACTIVE_SEASON, 0, 'imported', 'import', 0);
      }
    }
    db.exec('COMMIT');
    console.log('[store] imported legacy arena-leaderboard.json into season', ACTIVE_SEASON);
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    console.error('[store] legacy import failed', e);
  }
}

const ZERO = { arenaXp: 0, activityXp: 0, giftXp: 0, duels: 0, atomsRanked: 0, listsPlayed: 0, updatedAt: 0 };

export function getRow(wallet, season) {
  const r = db.prepare('SELECT * FROM wallet_season WHERE wallet=? AND season=?').get(wallet, season);
  if (!r) return { ...ZERO };
  return {
    arenaXp: int(r.arena_xp), activityXp: int(r.activity_xp), giftXp: int(r.gift_xp),
    duels: int(r.duels), atomsRanked: int(r.atoms_ranked), listsPlayed: int(r.lists_played),
    updatedAt: int(r.updated_at),
  };
}

function writeRow(wallet, season, v) {
  db.prepare(
    `INSERT INTO wallet_season(wallet,season,arena_xp,activity_xp,gift_xp,duels,atoms_ranked,lists_played,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(wallet,season) DO UPDATE SET
        arena_xp=excluded.arena_xp, activity_xp=excluded.activity_xp, gift_xp=excluded.gift_xp,
        duels=excluded.duels, atoms_ranked=excluded.atoms_ranked, lists_played=excluded.lists_played,
        updated_at=excluded.updated_at`,
  ).run(
    wallet, season, int(v.arenaXp), int(v.activityXp), int(v.giftXp),
    int(v.duels), int(v.atomsRanked), int(v.listsPlayed), Date.now(),
  );
}

/** Default telemetry branch — overwrite the provided fields (arenaXp/duels/atomsRanked/listsPlayed), keep the rest. */
export function upsertArenaTelemetry(wallet, season, fields) {
  const cur = getRow(wallet, season);
  writeRow(wallet, season, {
    ...cur,
    arenaXp: fields.arenaXp != null ? int(fields.arenaXp) : cur.arenaXp,
    duels: fields.duels != null ? int(fields.duels) : cur.duels,
    atomsRanked: fields.atomsRanked != null ? int(fields.atomsRanked) : cur.atomsRanked,
    listsPlayed: fields.listsPlayed != null ? int(fields.listsPlayed) : cur.listsPlayed,
  });
}

/** Legacy `protocol_xp` overwrite branch. */
export function setProtocolXpTotal(wallet, season, total) {
  const cur = getRow(wallet, season);
  writeRow(wallet, season, { ...cur, activityXp: int(total) });
}

/** Additive, idempotent earned-XP event. Returns {duplicate} or {applied}. */
export function addProtocolXpEvent(wallet, season, delta, dedupeKey) {
  const d = int(delta);
  if (db.prepare('SELECT 1 FROM xp_seen WHERE wallet=? AND dedupe_key=?').get(wallet, dedupeKey)) {
    return { duplicate: true };
  }
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO xp_seen(wallet,dedupe_key,created_at) VALUES(?,?,?)').run(wallet, dedupeKey, Date.now());
    db.prepare(
      `INSERT INTO wallet_season(wallet,season,activity_xp,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(wallet,season) DO UPDATE SET activity_xp=activity_xp+excluded.activity_xp, updated_at=excluded.updated_at`,
    ).run(wallet, season, d, Date.now());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { applied: d };
}

/** Authoritative gift — additive, idempotent per giftId, audited. Returns {duplicate,giftXp} or {applied,giftXp}. */
export function addGift(wallet, season, amount, reason, giftId, grantedBy) {
  const amt = int(amount);
  if (db.prepare('SELECT 1 FROM gifts WHERE gift_id=?').get(giftId)) {
    return { duplicate: true, giftXp: getRow(wallet, season).giftXp };
  }
  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO gifts(gift_id,wallet,season,amount,reason,granted_by,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run(giftId, wallet, season, amt, reason, grantedBy, Date.now());
    db.prepare(
      `INSERT INTO wallet_season(wallet,season,gift_xp,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(wallet,season) DO UPDATE SET gift_xp=gift_xp+excluded.gift_xp, updated_at=excluded.updated_at`,
    ).run(wallet, season, amt, Date.now());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { applied: amt, giftXp: getRow(wallet, season).giftXp };
}

/** Sorted leaderboard rows for a season (same shape the old buildLeaderboardPayload returned). */
export function leaderboard(season) {
  const rows = db.prepare('SELECT * FROM wallet_season WHERE season=?').all(season);
  const out = [];
  for (const r of rows) {
    const arenaXp = int(r.arena_xp);
    const protocolXp = int(r.activity_xp);
    const giftXp = int(r.gift_xp);
    const xp = arenaXp + protocolXp + giftXp;
    if (xp <= 0) continue;
    out.push({
      address: r.wallet, xp, arenaXp, protocolXp, giftXp,
      duels: int(r.duels), atomsRanked: int(r.atoms_ranked), listsPlayed: int(r.lists_played),
      updatedAt: int(r.updated_at),
    });
  }
  out.sort((a, b) => b.xp - a.xp || b.updatedAt - a.updatedAt);
  return out;
}

/** Per-wallet summary + live rank within a season. */
export function summary(wallet, season) {
  const board = leaderboard(season);
  const idx = board.findIndex((r) => r.address === wallet);
  const row = idx >= 0 ? board[idx] : null;
  return {
    address: wallet,
    season,
    arenaXp: row?.arenaXp ?? 0,
    activityXp: row?.protocolXp ?? 0,
    giftXp: row?.giftXp ?? 0,
    total: row?.xp ?? 0,
    rank: idx >= 0 ? idx + 1 : null,
    players: board.length,
  };
}
