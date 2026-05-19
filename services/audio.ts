// Arena / Climb procedural SFX + shared UI aliases (`playClick` routes here so Signal, etc. hear taps).

import {
  resumeArenaAudio,
  playArenaUiClick,
  playArenaUiHover,
  playArenaCelebrateMini,
} from './arenaAudio';

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

export {
  pauseArenaAmbient,
  syncArenaAmbientForClimb,
  tryPlayArenaAmbientFromUserGesture,
  getArenaMusicEnabled,
  setArenaMusicEnabled,
} from './arenaAmbientMusic';

/** Maps legacy/global UI hooks to Arena Web Audio (Signal tab, Explorer, etc.). */
export function playClick(): void {
  resumeArenaAudio();
  playArenaUiClick();
}

/** @deprecated Non-Arena pages; shimmer uses Arena hover patch. */
export function playHover(): void {
  resumeArenaAudio();
  playArenaUiHover();
}

/** @deprecated Success moments — mini celebration chord. */
export function playSuccess(): void {
  resumeArenaAudio();
  playArenaCelebrateMini();
}

/** @deprecated Non-Arena; always false. */
export function getSoundEnabled(): boolean {
  return false;
}

/** @deprecated Non-Arena; no-op. */
export function setSoundEnabled(_enabled: boolean): void {}

export const playXpChime = () => {};
