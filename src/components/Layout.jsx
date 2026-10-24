import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSettings } from '../lib/SettingsContext';
import { track } from '../lib/api';
import { safeUrl, socialLinks } from '../lib/validate';
import { initPointerFx, prefersReducedMotion } from '../lib/fx';
import CinematicIntro from './CinematicIntro';
import { INTRO_KEY, shouldShowIntro } from '../lib/intro';
import CommandPalette from './CommandPalette';
import SocialButtons from './Social';
import ThemeToggle from './ThemeToggle';

const NAV = [
  ['/', 'Home'],
  ['/projects', 'Projects'],
  ['/services', 'Services'],
  ['/about', 'About'],
  ['/experience', 'Journey'],
  ['/blog', 'Blogs'],
  ['/contact', 'Contact'],
];

// The entrance runs once per browser session, and only when the visit starts on the home page.
const wantsIntro = () => {
  try {
    return shouldShowIntro({ pathname: window.location.pathname, seen: Boolean(sessionStorage.getItem(INTRO_KEY)), reducedMotion: prefersReducedMotion() });
  } catch { return false; }
};

export function Logo() {
  const { logo } = useSettings();
  const src = safeUrl(logo);
  if (src) return <img className="logo" src={src} alt="" width="28" height="28" style={{ borderRadius: 7, objectFit: 'cover' }} />;
  return (
    <span className="logo" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="28" height="28">
        <rect width="32" height="32" rx="7" fill="var(--surface-2)" />
        <path d="M9 9h14l-14 14h14" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Layout() {
  const s = useSettings();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [cmd, setCmd] = useState(false);
  const [intro, setIntro] = useState(() => (wantsIntro() ? 'on' : false));   // 'on' -> overlay up, 'revealing' -> fading out, false -> gone
  const barRef = useRef(null);

  // index.html hides the page for first-time home visits until this app (and its intro overlay) is on screen.
  useEffect(() => { document.documentElement.classList.remove('intro-pending'); }, []);
  const revealIntro = useCallback(() => setIntro((v) => (v ? 'revealing' : v)), []);   // homepage animations start under the fade
  const finishIntro = useCallback(() => {
    try { sessionStorage.setItem(INTRO_KEY, '1'); } catch { /* storage unavailable: fine */ }
    setIntro(false);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    setOpen(false);
    track('page_view', pathname);
  }, [pathname]);

  // Scroll progress bar, nav styling once you scroll, and a back-to-top button.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
        setScrolled(y > 24);
        setShowTop(y > 800);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);

  // Cursor spotlight, 3D tilt and magnetic buttons.
  useEffect(() => initPointerFx(), []);

  // Ctrl/Cmd + K opens the search palette.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const socials = socialLinks(s.social);
  // Floating chat button: only appears when a WhatsApp number is set in Admin -> Settings.
  // Accepts 923001234567, +92 300 1234567 or the local form 0300 1234567 (a leading 0 becomes Pakistan's +92).
  let waDigits = String(s.whatsapp || '').replace(/\D/g, '');
  if (waDigits.length === 11 && waDigits.startsWith('0')) waDigits = `92${waDigits.slice(1)}`;
  const waText = String(s.waMessage || '').trim().slice(0, 300);
  const wa = s.waFloat !== false && waDigits.length >= 8
    ? `https://wa.me/${waDigits}${waText ? `?text=${encodeURIComponent(waText)}` : ''}`
    : null;

  return (
    <div className={`app${intro === 'on' ? ' intro-on' : ''}`}>
      {intro && <CinematicIntro name={s.name} settingsReady={Boolean(s._ready)} onReveal={revealIntro} onDone={finishIntro} />}
      <div className="scroll-progress" aria-hidden="true"><i ref={barRef} /></div>
      <a href="#main" className="skip">Skip to content</a>
      <header className={`nav${scrolled || open ? ' scrolled' : ''}`}>
        <div className="wrap nav-row">
          <Link to="/" className="brand" aria-label={`${s.name} — home`}>
            <Logo />
            <span className="brand-name">Zeeshan Haider</span>
          </Link>
          <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
            ))}
            <button type="button" className="nav-search" onClick={() => { setOpen(false); setCmd(true); }} aria-label="Search the site (Ctrl K)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <kbd>Ctrl K</kbd>
            </button>
            <Link to="/start-project" className="btn btn-primary btn-sm nav-cta" data-magnetic>Start a Project</Link>
          </nav>
          <div className="nav-tools">
            <ThemeToggle />
            <button className="burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <span /><span />
            </button>
          </div>
        </div>
      </header>

      <main id="main"><div key={pathname} className="page-enter"><Outlet /></div></main>

      <footer className="footer">
        <div className="wrap footer-grid">
          <div>
            <Link to="/" className="brand"><Logo /><span className="brand-name">{s.name}</span></Link>
            <p className="muted footer-tag">{s.footer}</p>
            <SocialButtons links={socials} className="footer-social" />
          </div>
          <div>
            <h4>Explore</h4>
            <ul>{NAV.map(([to, l]) => <li key={to}><Link to={to}>{l}</Link></li>)}</ul>
          </div>
          <div>
            <h4>Work with me</h4>
            <ul>
              <li><Link to="/start-project">Start a Project</Link></li>
              <li><Link to="/book">Book a Meeting</Link></li>
              <li><Link to="/pay">Make a Payment</Link></li>
              <li><Link to="/testimonials">Testimonials</Link></li>
              {s.email && <li><a href={`mailto:${s.email}`}>{s.email}</a></li>}
            </ul>
          </div>
        </div>
        <div className="footer-mark" aria-hidden="true">BUILD. SOLVE. <b>EVOLVE.</b></div>
        <div className="wrap footer-base muted">
          <span>© {new Date().getFullYear()} {s.copyright}</span>
          <span className="mono">Designed and developed by {s.name}</span>
        </div>
      </footer>

      <button
        type="button"
        className={`to-top${showTop ? ' show' : ''}${wa ? ' shift' : ''}`}
        aria-label="Back to top"
        tabIndex={showTop ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })}
      >
        ↑
      </button>
      {wa && (
        <a className="wa-fab" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp (opens in a new tab)">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </a>
      )}
      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
    </div>
  );
}
