// UI audio is disabled — play* exports remain as no-op stubs so call sites stay simple.

/** @deprecated Kept for API compatibility; always false while audio is disabled. */
export function getSoundEnabled(): boolean {
  return false;
}

/** @deprecated No-op while audio is disabled. */
export function setSoundEnabled(_enabled: boolean): void {}

export const playHover = () => {};

export const playClick = () => {};

export const playSuccess = () => {};

export const playXpChime = () => {};

export const playArenaSwipeAgree = () => {};

export const playArenaSwipePass = () => {};

export const playArenaRankSlide = () => {};
