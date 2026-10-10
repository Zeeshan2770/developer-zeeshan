import { useEffect, useRef, useState } from 'react';
import { safeUrl } from '../lib/validate';

// A short screen recording shown as a muted, looping clip.
//   * plays only while it is on screen, and pauses when scrolled away (saves battery and data)
//   * stays on its still poster image for visitors who prefer reduced motion or have Data Saver on
//   * the poster is found by naming convention: clip.mp4 -> clip-poster.webp (the admin upload creates it)
const VIDEO_EXT = /\.(mp4|webm)(\?.*)?$/i;

export const isVideoUrl = (u) => VIDEO_EXT.test(String(u || ''));
export const posterOf = (u) => String(u || '').replace(VIDEO_EXT, '-poster.webp');

// First video in a project's media list (used for the card preview), or null.
export const firstVideo = (p) =>
  (Array.isArray(p?.media) ? p.media : []).find((m) => m && (m.type === 'video' || isVideoUrl(m.url)) && safeUrl(m.url)) || null;

const motionAllowed = () => {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const c = navigator.connection;
  return !(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
};

// fade: start invisible and fade in over the still image once the clip is actually playing (used on cards).
export default function ProjectVideo({ src, poster, label, controls = false, fade = false, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [canPlay] = useState(motionAllowed);
  const [ready, setReady] = useState(false);
  const url = safeUrl(src);
  const posterUrl = safeUrl(poster) || (url ? safeUrl(posterOf(url)) : null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !canPlay) return;
    if (visible) el.play().catch(() => { /* autoplay blocked: the poster and controls remain */ });
    else el.pause();
  }, [visible, canPlay]);

  if (!url) return null;
  return (
    <video
      ref={ref}
      className={`pvideo${fade ? ' fade' : ''}${ready ? ' ready' : ''} ${className}`}
      onPlaying={() => setReady(true)}
      src={url}
      poster={posterUrl || undefined}
      muted
      loop
      playsInline
      controls={controls}
      preload={visible || controls ? 'metadata' : 'none'}
      aria-label={label || 'Short screen recording of the project'}
      disablePictureInPicture
    />
  );
}
