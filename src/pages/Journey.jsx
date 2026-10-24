import { useEffect, useRef } from 'react';
import SEO from '../components/SEO';
import { prefersReducedMotion } from '../lib/fx';
import { useAsync } from '../lib/useAsync';
import { getJourney } from '../lib/api';
import { Empty, Loading, Reveal, SectionHead } from '../components/ui';

export default function Journey() {
  const { data, loading } = useAsync(getJourney, []);
  const list = data || [];
  const tlRef = useRef(null);

  // The timeline line "draws" itself as you scroll past the entries.
  useEffect(() => {
    const el = tlRef.current;
    if (!el) return undefined;
    if (prefersReducedMotion()) { el.style.setProperty('--p', '1'); return undefined; }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const p = (window.innerHeight * 0.6 - r.top) / Math.max(r.height, 1);
      el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(3));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [list.length]);
  return (
    <>
      <SEO title="Journey" description="An honest look at how I got here and where I am heading." />
      <section className="page-hero">
        <div className="wrap">
          <SectionHead h1 eyebrow="Journey" title="Still building. Always evolving.">
            Not a corporate résumé — an honest timeline of how I learn and what I have built.
          </SectionHead>
        </div>
      </section>
      <section className="section tight">
        <div className="wrap narrow">
          {loading ? <Loading /> : list.length === 0 ? <Empty title="Timeline coming soon" /> : (
            <ol className="timeline" ref={tlRef}>
              {list.map((e) => (
                <Reveal as="li" key={e.id} className={e.featured ? 'featured' : ''}>
                  <span className="t-dot" />
                  <div className="t-meta">
                    {e.category && <span className="eyebrow">{e.category}</span>}
                    {e.period && <span className="mono muted">{e.period}</span>}
                  </div>
                  <h3>{e.title}</h3>
                  {e.description && <p className="muted">{e.description}</p>}
                </Reveal>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}
