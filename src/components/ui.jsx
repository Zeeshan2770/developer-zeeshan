import { useEffect, useRef, useState } from 'react';
import ProjectVideo, { firstVideo } from './ProjectVideo';
import { Link } from 'react-router-dom';
import { SERVICE_ICONS } from '../lib/defaults';
import { altText } from '../lib/img';

export function Reveal({ children, className = '', as: Tag = 'div', variant = 'up', delay = 0, ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={`reveal v-${variant} ${seen ? 'in' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

// `h1` marks the page's main heading: use it once per page (the hero of inner pages). Everything else stays h2.
export function SectionHead({ eyebrow, title, children, h1 = false }) {
  const H = h1 ? 'h1' : 'h2';
  return (
    <div className="section-head">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <H>{title}</H>
      {children && <p className="muted lead">{children}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading' }) {
  return <div className="state" role="status"><span className="spinner" />{label}…</div>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="state empty">
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error }) {
  return (
    <div className="state empty" role="alert">
      <strong>Something went wrong</strong>
      <p className="muted">{error?.message || 'Could not load this content. Please try again.'}</p>
    </div>
  );
}

export function Icon({ name = 'code', size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={SERVICE_ICONS[name] || SERVICE_ICONS.code} />
    </svg>
  );
}

export function Pill({ children, tone }) {
  return <span className={`pill ${tone || ''}`}>{children}</span>;
}

export function StatusPill({ status }) {
  const tone = status === 'Live' ? 'live' : status === 'Concept' ? 'muted' : '';
  return <Pill tone={tone}>{status}</Pill>;
}

export const flatTech = (t) => (t && typeof t === 'object' ? Object.values(t).flat().filter(Boolean) : []);

export function ProjectCard({ p, index, large = false, flip = false }) {
  const tech = flatTech(p.technologies).slice(0, 4);
  const clip = firstVideo(p);
  return (
    <Link to={`/projects/${p.slug}`} data-tilt className={`card project-card${large ? ' large' : ''}${flip ? ' flip' : ''}`}>
      <div className="thumb">
        {p.thumbnail_url
          ? <img src={p.thumbnail_url} alt={altText(p.thumbnail_alt, `Screenshot of ${p.name}, ${p.category || 'web project'} by the developer`)} width="1200" height="540" loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />
          : <span className="thumb-ph mono">{String(index + 1).padStart(2, '0')}</span>}
        {clip && <ProjectVideo src={clip.url} fade label={`${p.name} — short screen recording`} className="thumb-video" />}
      </div>
      <div className="card-body">
        <div className="meta-row">
          <span className="eyebrow">{p.category}</span>
          <StatusPill status={p.status} />
          {p.year && <span className="muted mono">{p.year}</span>}
        </div>
        <h3>{p.name}</h3>
        <p className="muted">{p.short_description}</p>
        {tech.length > 0 && <div className="tags">{tech.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
        <span className="link-arrow">View case study <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}
