/**
 * Day streak — "5 days in a row", and the week strip on Me.
 *
 * Distinct from `arenaPickCredit`'s streak, which counts PICKS inside a rolling 24h window.
 * The design's streak is calendar days played in a row (Mon 19 → Fri 23 is five), which is
 * the thing a person protects, so it needs its own record.
 *
 * Local-first by design, matching how the rest of the economy works: instant on this device,
 * mirrored later. Nothing here is authoritative — the server decides what counts at season end.
 * Days are keyed in UTC so a streak cannot be gamed by changing timezone.
 */

const KEY = 'inturank.daystreak.v1';

type Record = { days: string[] };
type File = Record & { [wallet: string]: any };

/** YYYY-MM-DD in UTC. */
export function dayKey(ts: number = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function load(): { [wallet: string]: Record } {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function save(data: { [wallet: string]: Record }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage blocked — the streak simply does not persist */
  }
}

const norm = (a?: string | null) => (a || '').trim().toLowerCase();

/** Mark today as played. Idempotent — playing twice in a day does not double-count. */
export function recordPlayDay(address: string | null | undefined, ts: number = Date.now()): void {
  const w = norm(address);
  if (!w.startsWith('0x')) return;
  const file = load();
  const rec = file[w] ?? { days: [] };
  const key = dayKey(ts);
  if (!rec.days.includes(key)) {
    // Keep a bounded history — 400 days is more than a season and stays small in storage.
    rec.days = [...rec.days, key].slice(-400);
    file[w] = rec;
    save(file);
  }
}

/** Every day this wallet has played, ascending. */
export function getPlayedDays(address: string | null | undefined): string[] {
  const w = norm(address);
  if (!w.startsWith('0x')) return [];
  return (load()[w]?.days ?? []).slice().sort();
}

/**
 * Consecutive days up to today. A day missed yesterday breaks it; a day missed today does
 * not, because the day is not over yet — that is what keeps the streak worth protecting
 * rather than punishing someone at 00:01.
 */
export function getDayStreak(address: string | null | undefined, now: number = Date.now()): number {
  const played = new Set(getPlayedDays(address));
  if (played.size === 0) return 0;

  const DAY = 86_400_000;
  let count = 0;
  let cursor = now;

  // If today has not been played, start counting from yesterday.
  if (!played.has(dayKey(cursor))) cursor -= DAY;

  while (played.has(dayKey(cursor))) {
    count += 1;
    cursor -= DAY;
  }
  return count;
}

export interface WeekDay {
  key: string;
  label: string;
  date: number;
  played: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * The seven cells of the week strip, Monday first — the calendar the design shows, which
 * reads far better than an abstract row of dashes because it shows what you would break.
 */
export function getWeekStrip(address: string | null | undefined, now: number = Date.now()): WeekDay[] {
  const played = new Set(getPlayedDays(address));
  const today = new Date(now);
  // getUTCDay: 0 = Sunday. Shift so Monday is the first column.
  const offsetToMonday = (today.getUTCDay() + 6) % 7;
  const monday = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() - offsetToMonday,
  );

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayKey = dayKey(now);

  return labels.map((label, i) => {
    const ts = monday + i * 86_400_000;
    const key = dayKey(ts);
    return {
      key,
      label,
      date: new Date(ts).getUTCDate(),
      played: played.has(key),
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });
}
