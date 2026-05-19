/** Hash-router share targets for Arena sessions. */

import { FLAGSHIP_ARENA_LIST_ID } from './intuRankProductSpec';

export function getArenaListShareUrl(listId: string): string {
  if (typeof window === 'undefined') return '';
  const { origin } = window.location;
  const id = encodeURIComponent(listId.trim() || FLAGSHIP_ARENA_LIST_ID);
  return `${origin}${window.location.pathname}${window.location.search}#/climb?list=${id}`;
}

export function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}
