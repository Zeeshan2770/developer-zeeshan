// Motion helpers. Everything here is progressive enhancement:
// no effect runs for visitors who prefer reduced motion, and pointer effects only run on devices with a real mouse.

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const hasFinePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// One delegated listener drives three effects (cheap, and works for elements that mount later):
//   [data-spot], .card, .principle  -> cursor spotlight  (--spx / --spy)
//   [data-tilt]                     -> 3D tilt + glare   (--rx / --ry / --gx / --gy)
//   [data-magnetic]                 -> element leans toward the cursor (--tx / --ty)
export function initPointerFx() {
  if (prefersReducedMotion() || !hasFinePointer()) return () => {};

  let raf = 0;
  let evt = null;

  const apply = () => {
    raf = 0;
    const e = evt;
    if (!e || !(e.target instanceof Element)) return;
    const t = e.target;

    const spot = t.closest('[data-spot], .card, .principle');
    if (spot) {
      const r = spot.getBoundingClientRect();
      spot.style.setProperty('--spx', `${e.clientX - r.left}px`);
      spot.style.setProperty('--spy', `${e.clientY - r.top}px`);
    }

    const tilt = t.closest('[data-tilt]');
    if (tilt) {
      const r = tilt.getBoundingClientRect();
      const x = clamp((e.clientX - r.left) / r.width, 0, 1);
      const y = clamp((e.clientY - r.top) / r.height, 0, 1);
      tilt.style.setProperty('--rx', `${((0.5 - y) * 6).toFixed(2)}deg`);
      tilt.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
      tilt.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
      tilt.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    }

    const mag = t.closest('[data-magnetic]');
    if (mag) {
      const r = mag.getBoundingClientRect();
      mag.style.setProperty('--tx', `${((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1)}px`);
      mag.style.setProperty('--ty', `${((e.clientY - (r.top + r.height / 2)) * 0.3).toFixed(1)}px`);
    }
  };

  const onMove = (e) => {
    evt = e;
    if (!raf) raf = requestAnimationFrame(apply);
  };

  // Reset an element when the pointer leaves it.
  const onOut = (e) => {
    const from = e.target instanceof Element ? e.target : null;
    if (!from) return;
    for (const sel of ['[data-tilt]', '[data-magnetic]']) {
      const el = from.closest(sel);
      if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) {
        ['--rx', '--ry', '--tx', '--ty'].forEach((p) => el.style.removeProperty(p));
      }
    }
  };

  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerout', onOut, { passive: true });
  return () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerout', onOut);
    cancelAnimationFrame(raf);
  };
}
