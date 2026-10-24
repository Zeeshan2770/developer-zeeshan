import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { NetworkCanvas, Rotator, Words } from '../components/fx';
import { useSettings } from '../lib/SettingsContext';
import { useAsync } from '../lib/useAsync';
import { getPaymentMethods, getProjects, getServices, getTestimonials } from '../lib/api';
import { prefersReducedMotion } from '../lib/fx';
import { Empty, Icon, Loading, ProjectCard, Reveal, SectionHead, Skeleton } from '../components/ui';
import { safeUrl, socialLinks } from '../lib/validate';
import SocialButtons from '../components/Social';
import { altText, resized, srcSet } from '../lib/img';

const PRINCIPLES = [
  ['Understand before building', 'I start by identifying what a project needs to accomplish, who will use it, and what would make the experience genuinely useful.'],
  ['Design for real people', 'A feature is only valuable when people can understand it and use it. I aim for interfaces that feel clear, purposeful, and intuitive.'],
  ['Build beyond appearances', 'A website should not only look good. Where the project requires it, its forms, authentication, data handling, permissions, and workflows should work reliably too.'],
  ['Keep improving', 'I treat each project as a chance to learn, test assumptions, find weaknesses, and improve the way I build.'],
];

// Things actually built so far, used by the rotating line in the hero.
const BUILDING = ['college websites', 'study platforms', 'admin dashboards', 'interactive web apps'];
const PAY_STEPS = [
  ['Agree the scope', 'We talk through what you need, the timeline and the price before any payment is made.'],
  ['Send the payment', 'Pay the deposit or milestone using the method that suits you best.'],
  ['Confirm in 1 minute', 'Fill in a short form with your transaction ID so I can match and verify it.'],
];
const TICKER = ['WEBSITES', 'EDUCATIONAL PLATFORMS', 'ADMIN SYSTEMS', 'STUDY TOOLS', 'WORKFLOWS', 'IDEAS INTO PRODUCTS'];

// The portrait stage: your photo sits large in the centre of the hero, blended into the dark background,
// with depth layers (glow, orbit rings, floating chips) that react to the mouse and to scrolling.
// The photo comes from Admin -> Settings -> Profile image (change it any time, no code),
// or from /portrait.webp in /public. If neither exists a "ZH" monogram is shown so the layout never breaks.
function HeroStage() {
  const s = useSettings();
  // Do not guess a file name before the settings are known: the old '/portrait.webp' guess cost a wasted request
  // (and showed the monogram) while the real photo URL was still being fetched.
  const src = safeUrl(s.profileImage) || (s._ready ? '/portrait.webp' : null);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className="stage">
      <div className="stage-glow" aria-hidden="true" />
      <div className="orbit o1" aria-hidden="true"><i /><i /></div>
      <div className="orbit o2" aria-hidden="true"><i /></div>
      <div className="photo-wrap">
        <div className="photo-tilt">
          <div className="photo">
            {src && !failed ? (
              <img src={resized(src, 960)} srcSet={srcSet(src)} sizes="(max-width: 760px) 100vw, 40vw" width="800" height="1000"
                alt={altText(s.profileImageAlt, `Portrait of ${s.name}, ${s.title}`)} fetchPriority="high" loading="eager" decoding="async" onError={() => setFailed(true)} />
            ) : (
              <div className="photo-mono" aria-hidden="true"><b>ZH</b></div>
            )}
            <span className="photo-shine" aria-hidden="true" />
          </div>
        </div>
      </div>
      <span className="depth-chip d1" aria-hidden="true"><i />{s.tagline}</span>
      <span className="depth-chip d2" aria-hidden="true">Educational platforms · College systems</span>
    </div>
  );
}

export default function Home() {
  const s = useSettings();
  const projects = useAsync(getProjects, []);
  const services = useAsync(getServices, []);
  const reviews = useAsync(getTestimonials, []);
  const payMethods = useAsync(getPaymentMethods, []);
  const heroRef = useRef(null);

  // Spotlight + parallax that follow the pointer and the scroll (skipped for reduced motion).
  useEffect(() => {
    const el = heroRef.current;
    if (!el || prefersReducedMotion()) return undefined;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
      el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    };
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => el.style.setProperty('--sy', String(Math.min(window.scrollY, 700))));
    };
    el.addEventListener('pointermove', move);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const featured = (projects.data || []).slice(0, 3);
  const rest = (projects.data || []).slice(3);
  const quotes = (reviews.data || []).slice(0, 3); // featured first, then by sort order; only approved ones ever come back

  return (
    <>
      <SEO />

      <section className="hero hero-cine hero-v3" ref={heroRef}>
        <NetworkCanvas />
        <HeroStage />
        <div className="hero-spot" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-left">
            {s.availability?.open && (
              <p className="avail hero-in" style={{ '--d': '0ms' }}><i aria-hidden="true" />{s.availability.label || 'Available for selected projects'}</p>
            )}
            <p className="mono kicker hero-in" style={{ '--d': '60ms' }}>Developer · Digital Solutions Builder</p>
            <h1 aria-label="Turning ideas into digital experiences that work.">
              <span aria-hidden="true">
                <Words text="Turning ideas into" />
                <em><Words text="digital experiences" start={3} /></em>
                {' '}
                <Words text="that work." start={5} />
              </span>
            </h1>
            <p className="hero-rotator hero-in" style={{ '--d': '700ms' }}>
              <span className="muted">Right now I build</span> <Rotator words={BUILDING} />
            </p>
            <p className="muted hero-lead hero-in" style={{ '--d': '850ms' }}>
              I’m {s.name} — a developer building websites, educational platforms, and practical digital systems.
              I care about more than how a product looks. I want to understand the problem, build the right solution, and
              make the final experience useful for the people who depend on it.
            </p>
            <div className="btn-row hero-in" style={{ '--d': '1000ms' }}>
              <Link to="/projects" className="btn btn-primary" data-magnetic><span>Explore My Projects</span></Link>
              <Link to="/start-project" className="btn btn-ghost" data-magnetic><span>Let’s Build Something</span></Link>
            </div>
            <div className="hero-in hero-social-row" style={{ '--d': '1150ms' }}>
              <SocialButtons links={socialLinks(s.social)} />
            </div>
            <p className="hero-support hero-in" style={{ '--d': '1250ms' }}>Learning continuously. Building practically. Improving with every project.</p>
          </div>
        </div>
      </section>

      <div className="band" aria-hidden="true">
        <div className="band-track">
          {Array.from({ length: 8 }).map((_, i) => <span key={i}>BUILD. SOLVE. <b>EVOLVE.</b></span>)}
        </div>
      </div>

      <section className="section">
        <div className="wrap about-teaser">
          <Reveal variant="left">
            <span className="eyebrow">A little about me</span>
            <h2>I’m not waiting for the perfect moment to start building.</h2>
            <p className="pull">Curiosity gets an idea started. Consistent work gives it a life.</p>
          </Reveal>
          <Reveal variant="right" delay={120}>
            <p className="muted lead">
              I have a growing interest in programming, software engineering, and the ways technology can solve
              everyday problems. My projects are part of my learning journey, and this website is a record of what I’m
              building now, what I have learned so far, and where I want to go next.
            </p>
            <Link to="/about" className="link-arrow">Read my story <span aria-hidden="true">→</span></Link>
          </Reveal>
        </div>
      </section>

      <section className="section alt">
        <div className="wrap">
          <Reveal>
            <SectionHead eyebrow="My approach" title="Good digital work starts with understanding the problem." />
          </Reveal>
          <div className="principles">
            {PRINCIPLES.map(([t, d], i) => (
              <Reveal key={t} className="principle" variant="zoom" delay={i * 90}>
                <span className="mono step-n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{t}</h3>
                <p className="muted">{d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <Reveal>
            <SectionHead eyebrow="Featured projects" title="Projects built around real problems.">
              Every project starts with a different need. Some help students learn, some simplify institutional workflows,
              and others explore how digital products can be designed and delivered. Here is a closer look at what I’ve been building.
            </SectionHead>
          </Reveal>
          {projects.loading ? (
            <div className="featured-list">
              <Skeleton className="sk-card" /><Skeleton className="sk-card" />
            </div>
          ) : featured.length === 0 ? (
            <Empty title="Projects are on their way">Published projects will appear here automatically.</Empty>
          ) : (
            <>
              <div className="featured-list stack-cards">
                {featured.map((p, i) => (
                  <div key={p.id} className="stack-item" style={{ '--i': i }}>
                    <ProjectCard p={p} index={i} large flip={i % 2 === 1} />
                  </div>
                ))}
              </div>
              {rest.length > 0 && (
                <div className="grid grid-3 more-projects">
                  {rest.map((p, i) => <Reveal key={p.id} delay={i * 100}><ProjectCard p={p} index={i + 3} /></Reveal>)}
                </div>
              )}
            </>
          )}
          <div className="center"><Link to="/projects" className="btn btn-ghost" data-magnetic><span>All projects</span></Link></div>
        </div>
      </section>

      <div className="band band-rev" aria-hidden="true">
        <div className="band-track">
          {Array.from({ length: 4 }).map((_, k) => TICKER.map((t) => <span key={`${k}-${t}`}>{t} <b>·</b></span>))}
        </div>
      </div>

      <section className="section alt">
        <div className="wrap">
          <Reveal>
            <SectionHead eyebrow="What I can help build" title="From an early idea to a working digital product.">
              If you have an idea, a workflow that needs improvement, or a business that could benefit from a stronger
              online presence, I’m interested in understanding the problem and exploring a practical solution.
            </SectionHead>
          </Reveal>
          {services.loading ? <Loading /> : (
            <div className="grid grid-3">
              {(services.data || []).map((sv, i) => (
                <Reveal key={sv.id} className="card service-mini" delay={(i % 3) * 110}>
                  <span className="ico"><Icon name={sv.icon} /></span>
                  <h3>{sv.title}</h3>
                  <p className="muted">{sv.summary}</p>
                  <Link to="/services" className="link-arrow">Learn more <span aria-hidden="true">→</span></Link>
                </Reveal>
              ))}
            </div>
          )}
          <p className="muted fine">Availability, timelines, prices and final scope are discussed individually.</p>
        </div>
      </section>

      <section className="section alt pay-home" id="payments">
        <div className="wrap">
          <Reveal>
            <SectionHead eyebrow="Payments" title="Simple, clear payments for every project.">
              Once we have agreed on the work, paying is straightforward. Send the amount using a local method, then confirm it with a short form.
            </SectionHead>
          </Reveal>
          <div className="pay-home-steps">
            {PAY_STEPS.map(([t, d], i) => (
              <Reveal key={t} className="pay-home-step" variant="zoom" delay={i * 90}>
                <span className="mono step-n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{t}</h3>
                <p className="muted">{d}</p>
              </Reveal>
            ))}
          </div>
          <div className="pay-home-foot">
            {(payMethods.data || []).length > 0 ? (
              <ul className="pay-home-chips" aria-label="Accepted payment methods">
                {payMethods.data.map((m) => <li key={m.id}>{m.name}</li>)}
              </ul>
            ) : (
              <p className="muted fine">Easypaisa, JazzCash, bank transfer and Raast are supported. Account details are shared once we agree on a project.</p>
            )}
            <div className="btn-row">
              <Link to="/pay" className="btn btn-primary" data-magnetic><span>Make a Payment</span></Link>
              <Link to="/contact" className="btn btn-ghost" data-magnetic><span>Ask about pricing</span></Link>
            </div>
          </div>
          <p className="muted fine">Payments are verified manually. Nothing is charged automatically, and prices are agreed with you in advance.</p>
        </div>
      </section>

      {quotes.length > 0 ? (
        <section className="section testi-home">
          <div className="wrap">
            <Reveal>
              <SectionHead eyebrow="Testimonials" title="What people say about working with me." />
            </Reveal>
            <div className={`testi-grid n${quotes.length}`}>
              {quotes.map((t, i) => {
                const photo = safeUrl(t.photo_url);
                const who = [t.role, t.organization].filter(Boolean).join(' · ');
                return (
                  <Reveal key={t.id} as="figure" className="testi-card" variant="zoom" delay={i * 110}>
                    <span className="testi-mark" aria-hidden="true">“</span>
                    {t.rating && <div className="stars" aria-label={`${t.rating} out of 5`}>{'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}</div>}
                    <blockquote>{t.message}</blockquote>
                    <figcaption>
                      {photo ? <img src={photo} alt={`Photo of ${t.name}`} width="44" height="44" loading="lazy" decoding="async" /> : <span className="testi-av" aria-hidden="true">{(t.name || '?').trim().charAt(0).toUpperCase()}</span>}
                      <span><strong>{t.name}</strong>{who && <span className="muted">{who}</span>}</span>
                    </figcaption>
                  </Reveal>
                );
              })}
            </div>
            <div className="center testi-links">
              <Link to="/testimonials" className="link-arrow">Read all testimonials <span aria-hidden="true">→</span></Link>
              <Link to="/testimonials#share" className="link-arrow">Worked with me? Share your experience <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="section">
          <div className="wrap feedback">
            <Reveal variant="zoom">
              <span className="eyebrow">Built through practice, feedback, and collaboration</span>
              <p className="feedback-quote">I believe good work improves through feedback. I want each project to be an opportunity to listen, test, refine, and make better decisions.</p>
            </Reveal>
          </div>
        </section>
      )}

      <section className="cta-band cta-aurora">
        <div className="wrap center">
          <Reveal>
            <h2>Have an idea worth building?</h2>
            <p className="muted lead">You do not need every detail figured out before reaching out. Tell me what you have in mind and what you hope the final product will do.</p>
            <div className="btn-row center-row">
              <Link to="/start-project" className="btn btn-primary" data-magnetic><span>Tell Me What You’re Trying to Build</span></Link>
              <Link to="/book" className="btn btn-ghost" data-magnetic><span>Book a Meeting</span></Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
