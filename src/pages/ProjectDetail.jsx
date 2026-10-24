import { useEffect } from 'react';
import ProjectVideo, { isVideoUrl } from '../components/ProjectVideo';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import SEO from '../components/SEO';
import { useAsync } from '../lib/useAsync';
import { bumpProjectView, getProjectBySlug, getProjects, track } from '../lib/api';
import { Empty, Loading, Reveal, StatusPill } from '../components/ui';
import { safeUrl } from '../lib/validate';
import NotFound from './NotFound';
import { altText } from '../lib/img';

const TECH_LABELS = [
  ['frontend', 'Frontend'], ['backend', 'Backend'], ['database', 'Database'],
  ['auth', 'Authentication'], ['hosting', 'Hosting'], ['other', 'Other tools'],
];

function Block({ eyebrow, title, text, tone }) {
  if (!text) return null;
  return (
    <Reveal as="section" className={`cs-block ${tone || ''}`}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
    </Reveal>
  );
}

export default function ProjectDetail() {
  const { slug } = useParams();
  const preview = useSearchParams()[0].get('preview') === '1';
  const { data: p, loading } = useAsync(() => getProjectBySlug(slug, preview), [slug, preview]);
  const all = useAsync(getProjects, []);

  useEffect(() => {
    // Previews (drafts) must not count as visits.
    if (p && p.published && !preview) { bumpProjectView(slug); track('project_view', `/projects/${slug}`, slug); }
  }, [p, slug, preview]);

  if (loading) return <Loading label="Loading case study" />;
  if (!p) return <NotFound />;

  const list = all.data || [];
  const idx = list.findIndex((x) => x.slug === slug);
  const next = list.length > 1 ? list[(idx + 1) % list.length] : null;
  const live = safeUrl(p.live_url);
  const gh = safeUrl(p.github_url);
  const media = Array.isArray(p.media) ? p.media : [];
  const techGroups = TECH_LABELS.filter(([k]) => p.technologies?.[k]?.length);
  const cover = safeUrl(p.thumbnail_url);

  return (
    <>
      {!p.published && <div className="preview-bar" role="status">Draft preview — only you can see this. It is not published.</div>}
      <SEO
        noindex={!p.published || preview}
        title={p.name}
        description={p.short_description}
        image={cover || undefined}
        type="article"
        record={{ title: p.seo_title, description: p.seo_description, image: p.og_image, noindex: p.noindex }}
        schema={{ kind: 'project', data: { name: p.name, description: p.seo_description || p.short_description, image: cover || undefined, year: p.year } }}
      />

      <section className="cs-hero">
        <div className="wrap">
          <Link to="/projects" className="back">← All projects</Link>
          <span className="eyebrow">{p.category}</span>
          <h1>{p.name}</h1>
          <p className="muted lead">{p.short_description}</p>
          <div className="btn-row">
            {live && <a className="btn btn-primary" href={live} target="_blank" rel="noopener noreferrer">View live project ↗</a>}
            {gh && <a className="btn btn-ghost" href={gh} target="_blank" rel="noopener noreferrer">GitHub ↗</a>}
          </div>
        </div>
      </section>

      <section className="wrap facts" aria-label="Quick facts">
        <div><span className="muted">Status</span><StatusPill status={p.status} /></div>
        {p.year && <div><span className="muted">Year</span><strong>{p.year}</strong></div>}
        <div><span className="muted">Category</span><strong>{p.category}</strong></div>
        {p.role && <div><span className="muted">My role</span><strong>{p.role}</strong></div>}
      </section>

      {cover && <div className="wrap"><img className="cs-cover" src={cover} alt={altText(p.thumbnail_alt, `Screenshot of ${p.name}, ${p.category || 'web project'}`)} width="1200" height="540" fetchPriority="high" decoding="async" /></div>}

      <div className="wrap cs">
        <Block eyebrow="01" title="The problem" text={p.problem} />
        <Block eyebrow="02" title="The idea" text={p.idea} tone="accent" />
        <Block eyebrow="03" title="The solution" text={p.solution} />

        {p.project_features?.length > 0 && (
          <Reveal as="section" className="cs-block wide">
            <span className="eyebrow">04</span><h2>Key features</h2>
            <div className="grid grid-3">
              {p.project_features.map((f) => (
                <div key={f.id} className="card feature"><h3>{f.title}</h3>{f.description && <p className="muted">{f.description}</p>}</div>
              ))}
            </div>
          </Reveal>
        )}

        {techGroups.length > 0 && (
          <Reveal as="section" className="cs-block wide">
            <span className="eyebrow">05</span><h2>Technology</h2>
            <dl className="tech">
              {techGroups.map(([k, label]) => (
                <div key={k}><dt>{label}</dt><dd>{p.technologies[k].map((t) => <span key={t} className="tag">{t}</span>)}</dd></div>
              ))}
            </dl>
          </Reveal>
        )}

        <Block eyebrow="06" title="Challenges" text={p.challenges} />
        <Block eyebrow="07" title="Development process" text={p.process} tone="accent" />
        <Block eyebrow="08" title="What I learned" text={p.learned} />
        <Block eyebrow="09" title="Result" text={p.result} />
        {(Array.isArray(p.sections) ? p.sections : []).filter((s) => s?.title && s?.body).map((s, i) => (
          <Block key={i} eyebrow={String(10 + i).padStart(2, '0')} title={s.title} text={s.body} tone={i % 2 ? 'accent' : ''} />
        ))}

        {media.length > 0 && (
          <Reveal as="section" className="cs-block wide">
            <span className="eyebrow">{String(10 + (Array.isArray(p.sections) ? p.sections.filter((s) => s?.title && s?.body).length : 0)).padStart(2, '0')}</span><h2>Media</h2>
            <div className="grid grid-2">
              {media.map((m, i) => {
                const src = safeUrl(m.url);
                if (!src) return null;
                return (
                  <figure key={i} className="shot">
                    {m.type === 'video' || isVideoUrl(m.url)
                      ? <ProjectVideo src={src} controls label={m.caption || `${p.name} — short screen recording`} />
                      : <img src={src} alt={altText(m.caption, `${p.name} screenshot ${i + 1}`)} width="1200" height="540" loading="lazy" decoding="async" />}
                    {m.caption && <figcaption className="muted">{m.caption}</figcaption>}
                  </figure>
                );
              })}
            </div>
          </Reveal>
        )}

        {!p.problem && !p.solution && !p.idea && (
          <Empty title="Full case study coming soon">The detailed write-up for this project is being prepared.</Empty>
        )}
      </div>

      {next && next.slug !== slug && (
        <section className="next-project">
          <div className="wrap">
            <span className="muted mono">Next project</span>
            <Link to={`/projects/${next.slug}`}><h2>{next.name} <span aria-hidden="true">→</span></h2></Link>
          </div>
        </section>
      )}
    </>
  );
}
