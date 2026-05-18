/**
 * Looping arcade BGM for the Arena tab on `/climb`.
 * Separate from procedural SFX — uses HTMLAudioElement (MP3).
 * Autoplay limits: `resumeArenaAudio()` triggers `tryPlayArenaAmbientFromUserGesture()`.
 */

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
  if (!enabled) pauseArenaAmbient();
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

/** After first user gesture anywhere we wire `resumeArenaAudio`, try starting BGM. */
export function tryPlayArenaAmbientFromUserGesture(): void {
  if (!getArenaMusicEnabled()) return;
  const a = ensureEl();
  if (!a) return;
  void a.play().catch(() => {});
}

/**
 * Toggle BGM against Climb routing: playing only while Arena tab (`view` default) is active.
 */
export function syncArenaAmbientForClimb(arenaTabActive: boolean): void {
  if (typeof window === 'undefined') return;
  if (!getArenaMusicEnabled()) {
    pauseArenaAmbient();
    return;
  }
  if (!arenaTabActive) {
    pauseArenaAmbient();
    return;
  }
  const a = ensureEl();
  if (!a) return;
  void a.play().catch(() => {});
}
