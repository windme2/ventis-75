/** Small browser checks shared by the page and the scene. All of them are safe to call during render on the client only. */

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isTouchScreen = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/** WebGL is available and not switched off with `?nogl` (for testing the fallback). */
export function hasWebGL() {
  if (new URLSearchParams(window.location.search).has('nogl')) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** localStorage that never throws: private windows and blocked storage just forget. */
export const storage = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* nothing to keep it in */
    }
  },
};
