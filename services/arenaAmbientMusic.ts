/**
 * Looping arcade BGM for `/climb` (Arena hub, Signal, Explorer tabs).
 * Separate from procedural SFX — uses HTMLAudioElement (MP3).
 * Autoplay limits: `resumeArenaAudio()` invokes `tryPlayArenaAmbientFromUserGesture()`,
 * which only runs MP3 playback while `syncArenaAmbientForClimb(true)` is in effect (`RankedList` on `/climb`).
 */

let ambientShellActive = false;

const ARENA_MUSIC_PREF_KEY = 'inturank_arena_music';

export function getArenaMusicEnabled(): boolean {
  try {
    return localStorage.getItem(ARENA_MUSIC_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setArenaMusicEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ARENA_MUSIC_PREF_KEY, String(enabled));
  } catch {
    /* ignore */
  }
  if (!enabled) {
    pauseArenaAmbient();
    return;
  }
  if (!ambientShellActive) return;
  const a = ensureEl();
  if (!a) return;
  void a.play().catch(() => {});
}

/** Base URL-aware path (supports Vite subpath deploys). */
function trackUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}audio/arena-ambient-retro.mp3`;
}

let el: HTMLAudioElement | null = null;

function ensureEl(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!el) {
    el = new Audio(trackUrl());
    el.loop = true;
    el.volume = 0.36;
    el.preload = 'auto';
  }
  return el;
}

/** Pause but keep playback position so returning to Arena resumes smoothly. */
export function pauseArenaAmbient(): void {
  el?.pause();
}

/** After a user gesture, start BGM only if we're still inside the Climb Arena shell (`/climb` + RankedList). */
export function tryPlayArenaAmbientFromUserGesture(): void {
  if (!ambientShellActive || !getArenaMusicEnabled()) return;
  const a = ensureEl();
  if (!a) return;
  void a.play().catch(() => {});
}

/**
 * `RankedList` sets this on mount/off on unmount. Gates MP3 playback so global
 * `playClick()` / other routes never summon the Arcade track outside `/climb`.
 */
export function syncArenaAmbientForClimb(climbActive: boolean): void {
  if (typeof window === 'undefined') return;
  ambientShellActive = climbActive;
  if (!getArenaMusicEnabled()) {
    pauseArenaAmbient();
    return;
  }
  if (!climbActive) {
    pauseArenaAmbient();
    return;
  }
  const a = ensureEl();
  if (!a) return;
  void a.play().catch(() => {});
}
