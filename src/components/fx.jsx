import { Fragment, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../lib/fx';

// Splits text into words that animate in one after another (see .w in the stylesheet).
export function Words({ text, start = 0, step = 80 }) {
  return text.split(' ').map((w, i) => (
    <Fragment key={`${w}-${i}`}>
      <span className="w" style={{ '--d': `${(start + i) * step}ms` }}>{w}</span>{' '}
    </Fragment>
  ));
}

// Cycles through short phrases, e.g. "I build [college websites]".
export function Rotator({ words, interval = 2600 }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion() || words.length < 2) return undefined;
    const id = setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);
  return (
    <span className="rotator">
      <span className="sr-only">{words.join(', ')}</span>
      <span key={i} className="rot-word" aria-hidden="true">{words[i]}</span>
    </span>
  );
}

// A light "constellation" that reacts to the pointer. Pauses when off-screen or when the tab is hidden.
export function NetworkCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || prefersReducedMotion()) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let w = 0; let h = 0; let pts = []; let raf = 0; let visible = true; let timer = 0;
    const mouse = { x: -9999, y: -9999 };

    const setup = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(64, (w * h) / 24000));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
      }));
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      ctx.clearRect(0, 0, w, h);
      for (let a = 0; a < pts.length; a += 1) {
        const p = pts[a];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        // gentle pull toward the pointer
        const dx = mouse.x - p.x; const dy = mouse.y - p.y; const dm = Math.hypot(dx, dy);
        if (dm < 170 && dm > 1) { p.x += (dx / dm) * 0.35; p.y += (dy / dm) * 0.35; }
        ctx.fillStyle = 'rgba(147, 197, 253, 0.75)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fill();
        for (let b = a + 1; b < pts.length; b += 1) {
          const q = pts[b]; const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 125) {
            ctx.strokeStyle = `rgba(96, 165, 250, ${(1 - d / 125) * 0.32})`;
            ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
        if (dm < 170) {
          ctx.strokeStyle = `rgba(147, 197, 253, ${(1 - dm / 170) * 0.5})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
    };

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    const onResize = () => { clearTimeout(timer); timer = setTimeout(setup, 200); };

    setup();
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
    io.observe(canvas);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(timer); io.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return <canvas ref={ref} className="hero-net" aria-hidden="true" />;
}

// Short opening screen, shown once per browser session. Click or press any key to skip.
export function Intro({ name, onDone }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), 1500);
    const t2 = setTimeout(onDone, 2150);
    const skip = () => setOut(true);
    window.addEventListener('keydown', skip, { once: true });
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('keydown', skip); };
  }, [onDone]);
  return (
    <div className={`intro${out ? ' out' : ''}`} onClick={() => setOut(true)} aria-hidden="true">
      <div className="intro-inner">
        <span className="intro-mark">ZH</span>
        <span className="intro-name">
          {name.split('').map((ch, i) => <span key={i} style={{ '--i': i }}>{ch === ' ' ? '\u00a0' : ch}</span>)}
        </span>
        <span className="intro-line" />
      </div>
    </div>
  );
}
