import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { useAsync } from '../lib/useAsync';
import { getInsights } from '../lib/api';
import { Empty, Loading, Reveal, SectionHead } from '../components/ui';
import { safeUrl } from '../lib/validate';
import { altText } from '../lib/img';
import { collectTags } from '../lib/tags';

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

// Gives every post without a cover image its own blue-toned placeholder (stable per slug).
const hueOf = (s = '') => 205 + (Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0) % 40);

export function Cover({ post, className = '' }) {
  const src = safeUrl(post.cover_url);
  if (src) return <div className={`blog-cover ${className}`}><img src={src} alt={altText(post.cover_alt, `Cover image for the article: ${post.title}`)} width="1200" height="630" loading="lazy" decoding="async" /></div>;
  return (
    <div className={`blog-cover ph ${className}`} style={{ '--h': hueOf(post.slug) }} aria-hidden="true">
      <span>{post.category || 'Blog'}</span>
    </div>
  );
}

export function PostMeta({ post }) {
  return (
    <div className="meta-row">
      {post.category && <span className="eyebrow">{post.category}</span>}
      {post.published_at && <span className="muted mono">{fmtDate(post.published_at)}</span>}
      {post.reading_minutes && <span className="muted mono">{post.reading_minutes} min read</span>}
    </div>
  );
}

export function PostCard({ post }) {
  return (
    <Link to={`/blog/${post.slug}`} className="card blog-card">
      <Cover post={post} />
      <div className="blog-card-body">
        <PostMeta post={post} />
        <h3>{post.title}</h3>
        {post.excerpt && <p className="muted">{post.excerpt}</p>}
        {post.tags?.length > 0 && <div className="tags">{post.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}</div>}
        <span className="more">Read the post <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

export default function Blog() {
  const { data, loading } = useAsync(getInsights, []);
  const posts = data || [];
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');

  const tagList = useMemo(() => collectTags(posts).slice(0, 14), [posts]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(posts.map((p) => p.category).filter(Boolean)))], [posts]);
  const filtering = q.trim() !== '' || cat !== 'All';
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return posts.filter((p) =>
      (cat === 'All' || p.category === cat)
      && (!needle || `${p.title} ${p.excerpt || ''} ${(p.tags || []).join(' ')}`.toLowerCase().includes(needle)));
  }, [posts, q, cat]);

  const lead = !filtering ? (matches.find((p) => p.featured) || matches[0]) : null;
  const rest = lead ? matches.filter((p) => p.id !== lead.id) : matches;

  return (
    <>
      <SEO title="Blogs" description="Blog posts on building software, educational technology and what I learn along the way." />
      <section className="page-hero">
        <div className="wrap">
          <SectionHead h1 eyebrow="Blogs" title="Things I’m learning along the way.">
            Building projects raises questions that tutorials alone do not always answer. This is where I share practical lessons,
            development notes, design decisions, and ideas worth exploring.
          </SectionHead>
        </div>
      </section>

      <section className="section tight">
        <div className="wrap">
          {loading ? <Loading /> : posts.length === 0 ? (
            <Empty title="The first blog posts are on the way">No posts are published yet. Check back soon.</Empty>
          ) : (
            <>
              <div className="blog-tools">
                <label className="blog-search">
                  <span className="sr-only">Search blog posts</span>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts…" />
                </label>
                {categories.length > 2 && (
                  <div className="chip-row" role="group" aria-label="Filter by category">
                    {categories.map((c) => (
                      <button key={c} type="button" className={`chip${cat === c ? ' on' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
                    ))}
                  </div>
                )}
              </div>

              {tagList.length > 0 && !filtering && (
                <nav className="chip-row tag-cloud" aria-label="Browse articles by tag">
                  {tagList.map((t) => <Link key={t.slug} to={`/blog/tag/${t.slug}`} className="chip">#{t.name} <small>{t.count}</small></Link>)}
                </nav>
              )}

              {lead && (
                <Reveal>
                  <Link to={`/blog/${lead.slug}`} className="card blog-lead">
                    <Cover post={lead} />
                    <div className="blog-lead-body">
                      <span className="eyebrow">Latest post</span>
                      <PostMeta post={lead} />
                      <h2>{lead.title}</h2>
                      {lead.excerpt && <p className="muted lead">{lead.excerpt}</p>}
                      <span className="more">Read the post <span aria-hidden="true">→</span></span>
                    </div>
                  </Link>
                </Reveal>
              )}

              {matches.length === 0 ? (
                <Empty title="No posts match">Try a different search or category.</Empty>
              ) : (
                <div className="blog-grid">
                  {rest.map((p, i) => <Reveal key={p.id} delay={(i % 3) * 90}><PostCard post={p} /></Reveal>)}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
