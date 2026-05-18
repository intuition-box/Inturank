// Global UI audio (non-Arena) remains off — most of the app uses these no-ops.
// Arena / Climb uses `playArena*` from the re-exports below (real Web Audio).

export {
  resumeArenaAudio,
  getArenaSoundEnabled,
  setArenaSoundEnabled,
  playArenaFloorEnter,
  playArenaUiClick,
  playArenaUiHover,
  playArenaSwipeAgree,
  playArenaSwipePass,
  playArenaRankSlide,
  playArenaCelebrateMini,
} from './arenaAudio';

/** @deprecated Non-Arena; always false. */
export function getSoundEnabled(): boolean {
  return false;
}

/** @deprecated Non-Arena; no-op. */
export function setSoundEnabled(_enabled: boolean): void {}

export const playHover = () => {};

export const playClick = () => {};

export const playSuccess = () => {};

export const playXpChime = () => {};
