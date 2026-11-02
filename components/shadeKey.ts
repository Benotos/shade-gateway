// The user's SHADE key lives only in their browser (localStorage). Shared by nav, chat and purchase pages.
export const KEY_STORE = 'shade_key';

export function getKey(): string | null {
  try { return window.localStorage.getItem(KEY_STORE); } catch { return null; }
}

const EVENT = 'shade:balance';
export function emitBalance(credits: number) {
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: credits })); } catch { /* no window */ }
}
export function onBalance(cb: (credits: number) => void) {
  const h = (e: Event) => cb((e as CustomEvent<number>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
