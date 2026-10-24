// Decisions and numbers behind the cinematic entrance. Pure functions (no DOM), so they can be unit tested.
export const INTRO_KEY = 'zhq-intro';            // sessionStorage flag: the intro has been seen in this browser session
export const INTRO_MAX_MS = 8000;                 // hard ceiling: the intro never keeps anyone waiting longer than this
export const VIDEO_STALL_MS = 3500;               // video has not started by now -> use the still portrait instead
export const STATIC_HOLD_MS = 2200;               // how long the still portrait is shown when there is no video
export const FADE_MS = 700;                       // overlay fade into the homepage
export const NAME_REVEAL_MS = 900;

/**
 * Should the entrance run? Only for the first visit of a session that lands on the home page.
 * Deep links (an article, a project) go straight to their content; reduced-motion visitors skip it entirely.
 */
export function shouldShowIntro({ pathname = '/', seen = false, reducedMotion = false } = {}) {
  return pathname === '/' && !seen && !reducedMotion;
}

/** Slow or data-saving connections get the still portrait and never download the video. */
export function wantsVideo({ saveData = false, effectiveType = '' } = {}) {
  return !saveData && !/^(slow-2g|2g)$/.test(String(effectiveType));
}

/** "Muhammad Zeeshan Haider" -> ['MUHAMMAD', 'ZEESHAN HAIDER'] (first word on line one, the rest on line two). */
export function nameLines(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [String(name).trim().toUpperCase(), ''];
  return [parts[0].toUpperCase(), parts.slice(1).join(' ').toUpperCase()];
}

// Weights of the real readiness signals that make up the loading bar (they add up to 1).
const W = { page: 0.15, settings: 0.15, fonts: 0.1, video: 0.6 };

/**
 * @param {{page:boolean, settings:boolean, fonts:boolean, videoWanted:boolean, videoFailed:boolean, duration:number, buffered:number}} s
 * @returns {{determinate:boolean, value:number}} value is 0..1. While the video's length is still unknown the bar is
 *   indeterminate (no percentage is shown) instead of pretending to know how far along it is.
 */
export function introProgress(s) {
  const noVideo = !s.videoWanted || s.videoFailed;
  const known = noVideo || (Number.isFinite(s.duration) && s.duration > 0);
  const video = noVideo ? 1 : known ? Math.max(0, Math.min(1, s.buffered / s.duration)) : 0;
  const value = (s.page ? W.page : 0) + (s.settings ? W.settings : 0) + (s.fonts ? W.fonts : 0) + video * W.video;
  return { determinate: known, value: Math.min(1, value) };
}
