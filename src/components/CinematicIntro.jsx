import { useCallback, useEffect, useRef, useState } from 'react';
import { FADE_MS, INTRO_MAX_MS, STATIC_HOLD_MS, VIDEO_STALL_MS, introProgress, nameLines, wantsVideo } from '../lib/intro';

// Cinematic entrance: a near-black screen with a short film of the owner, the name, and an honest loading indicator.
// It is a visual extra, never a gate: Skip is always available, it ends by itself (INTRO_MAX_MS at the latest), and if
// the video is missing, blocked or slow the still portrait is used instead. Nothing here is fetched until it mounts,
// and skipping removes the video element so any download stops.
//
// Assets (public/media): zeeshan-entrance(.mp4|.webm) + zeeshan-entrance-mobile(.mp4|.webm), zeeshan-poster(.webp),
// zeeshan-poster-mobile(.webp) and zeeshan-portrait.webp (the still shown when the video cannot play).
const MEDIA = '/media/';
const PORTRAIT_QUERY = '(orientation: portrait), (max-width: 760px)';

const isPortraitLayout = () => { try { return window.matchMedia(PORTRAIT_QUERY).matches; } catch { return false; } };
const connection = () => { try { return navigator.connection || {}; } catch { return {}; } };

export default function CinematicIntro({ name, settingsReady, onReveal, onDone }) {
  const [portrait] = useState(isPortraitLayout);
  const [videoWanted] = useState(() => wantsVideo(connection()));
  const [phase, setPhase] = useState('loading');     // loading | playing | static
  const [shown, setShown] = useState(false);          // name + tagline revealed
  const [leaving, setLeaving] = useState(false);
  const [ended, setEnded] = useState(false);
  const [doc, setDoc] = useState(() => document.readyState === 'complete');
  const [fonts, setFonts] = useState(() => !document.fonts);
  const [media, setMedia] = useState({ duration: NaN, buffered: 0, failed: !videoWanted });
  const videoRef = useRef(null);
  const skipRef = useRef(null);
  const barRef = useRef(null);
  const pctRef = useRef(null);
  const target = useRef({ determinate: false, value: 0 });
  const leavingRef = useRef(false);
  const timers = useRef([]);
  const later = useCallback((fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); return id; }, []);

  // Stops playback and the download (used when the intro ends or falls back to the still portrait).
  const stopVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.querySelectorAll('source').forEach((s) => s.removeAttribute('src'));
    v.removeAttribute('src');
    v.load();
  }, []);

  const leave = useCallback((fast = false) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    onReveal?.();                                        // the homepage's own entrance animations start now, under the fade
    later(() => { stopVideo(); onDone?.(); }, fast ? 350 : FADE_MS + 50);
  }, [later, onDone, onReveal, stopVideo]);

  // Lock page scroll while the intro is up; focus the Skip control so keyboard users can leave at once; Esc skips.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    root.classList.remove('intro-pending');              // (child effects run before Layout's: the page must be visible before focusing)
    skipRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') leave(true); };
    window.addEventListener('keydown', onKey);
    return () => { root.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [leave]);

  // Page and font readiness (real signals, each capped so a slow font host cannot stall the intro).
  useEffect(() => {
    const onLoad = () => setDoc(true);
    if (document.readyState !== 'complete') window.addEventListener('load', onLoad, { once: true });
    if (document.fonts?.ready) document.fonts.ready.then(() => setFonts(true), () => setFonts(true));
    later(() => { setDoc(true); setFonts(true); }, 2500);
    return () => window.removeEventListener('load', onLoad);
  }, [later]);

  // Hard ceilings.
  useEffect(() => {
    later(() => leave(), INTRO_MAX_MS);
    later(() => setShown(true), 1600);                   // the name never waits longer than this for the video
  }, [later, leave]);

  // No video wanted (data saver / very slow link) or it fails: still portrait for a short, fixed time.
  const fallToStill = useCallback(() => {
    stopVideo();
    setMedia((m) => ({ ...m, failed: true }));
    setPhase('static');
    setShown(true);
  }, [stopVideo]);
  useEffect(() => { if (!videoWanted) fallToStill(); }, [videoWanted, fallToStill]);
  useEffect(() => {
    if (phase === 'static') later(() => leave(), STATIC_HOLD_MS);
  }, [phase, later, leave]);

  // Video element events.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const readBuffered = () => {
      const d = v.duration;
      let end = 0;
      try { for (let i = 0; i < v.buffered.length; i += 1) end = Math.max(end, v.buffered.end(i)); } catch { /* ignore */ }
      setMedia((m) => ({ ...m, duration: Number.isFinite(d) ? d : m.duration, buffered: end }));
    };
    const onPlaying = () => { setPhase((p) => (p === 'static' ? p : 'playing')); setShown(true); };
    const onFail = () => fallToStill();
    const onEnd = () => setEnded(true);
    v.addEventListener('loadedmetadata', readBuffered);
    v.addEventListener('progress', readBuffered);
    v.addEventListener('canplaythrough', readBuffered);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('ended', onEnd);
    v.addEventListener('error', onFail);
    const sources = Array.from(v.querySelectorAll('source'));
    const lastSource = sources[sources.length - 1];
    lastSource?.addEventListener('error', onFail);       // every source failed (missing file, unsupported codec)
    const p = v.play();                                   // autoplay can be refused: then show the still portrait
    if (p && p.catch) p.catch(() => onFail());
    const stall = later(() => { if (v.paused || v.readyState < 3) onFail(); }, VIDEO_STALL_MS);
    return () => {
      clearTimeout(stall);
      v.removeEventListener('loadedmetadata', readBuffered);
      v.removeEventListener('progress', readBuffered);
      v.removeEventListener('canplaythrough', readBuffered);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('ended', onEnd);
      v.removeEventListener('error', onFail);
      lastSource?.removeEventListener('error', onFail);
    };
  }, [later, fallToStill]);

  // Real progress -> bar + percentage (written to the DOM directly so the intro does not re-render every frame).
  const progress = introProgress({ page: doc, settings: settingsReady, fonts, videoWanted, videoFailed: media.failed, duration: media.duration, buffered: media.buffered });
  target.current = progress;
  const ready = progress.determinate && progress.value >= 1;
  useEffect(() => {
    let raf = 0; let cur = 0;
    const tick = () => {
      const t = target.current;
      if (t.determinate) {
        cur = Math.max(cur, cur + (t.value - cur) * 0.18);           // eases forward, never backwards
        if (t.value - cur < 0.002) cur = t.value;
        if (barRef.current) barRef.current.style.transform = `scaleX(${cur})`;
        if (pctRef.current) pctRef.current.textContent = `${Math.round(cur * 100)}%`;
      }
      if (!(t.determinate && cur >= 1)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progress.determinate]);                                         // restart the loop when the bar becomes determinate

  // Leave when the film has finished and the site is ready (or, with no video, after the still hold above).
  useEffect(() => { if (ended && ready) leave(); }, [ended, ready, leave]);
  useEffect(() => { if (ended && !ready) later(() => leave(), 1500); }, [ended, ready, later, leave]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const [first, rest] = nameLines(name);
  const suffix = portrait ? '-mobile' : '';
  const stillClass = phase === 'static' ? ' is-still' : '';

  return (
    <div className={`cine${leaving ? ' out' : ''}${shown ? ' shown' : ''}${stillClass}${portrait ? ' is-portrait' : ''}`} role="region" aria-label="Introduction" aria-hidden={leaving ? 'true' : undefined}>
      <div className="cine-stage" aria-hidden="true">
        {phase === 'static' ? (
          <img className="cine-still" src={`${MEDIA}zeeshan-portrait.webp`} alt="" width="900" height="1126" decoding="async" />
        ) : videoWanted ? (
          <video ref={videoRef} className="cine-video" muted playsInline autoPlay preload="metadata" disablePictureInPicture
            poster={`${MEDIA}zeeshan-poster${suffix}.webp`} width={portrait ? 480 : 1280} height={portrait ? 600 : 720}>
            <source src={`${MEDIA}zeeshan-entrance${suffix}.mp4`} type="video/mp4" />
            <source src={`${MEDIA}zeeshan-entrance${suffix}.webm`} type="video/webm" />
          </video>
        ) : null}
        <div className="cine-shade" />
      </div>

      <button ref={skipRef} type="button" className="cine-skip" onClick={() => leave(true)} aria-label="Skip introduction">Skip intro <span aria-hidden="true">→</span></button>

      <div className="cine-copy">
        <p className="cine-name">
          <span className="sr-only">{name}</span>
          <span className="cine-l1" aria-hidden="true">{first}</span>
          {rest && <span className="cine-l2" aria-hidden="true">{rest}</span>}
        </p>
        <p className="cine-tag">Building. Leading. Creating.</p>
      </div>

      <div className="cine-load" role="progressbar" aria-label="Preparing the website" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress.determinate ? Math.round(progress.value * 100) : undefined}>
        <div className="cine-load-row">
          <span className="cine-load-label">{ready ? 'Ready' : 'Preparing your experience'}</span>
          <span ref={pctRef} className="cine-pct" style={{ visibility: progress.determinate ? 'visible' : 'hidden' }}>0%</span>
        </div>
        <div className={`cine-bar${progress.determinate ? '' : ' indet'}`}><i ref={barRef} /></div>
      </div>
    </div>
  );
}
