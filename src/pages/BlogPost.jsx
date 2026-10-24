import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import SEO from '../components/SEO';
import { useAsync } from '../lib/useAsync';
import { getInsightBySlug, getInsights } from '../lib/api';
import { Loading } from '../components/ui';
import { safeUrl, slugify } from '../lib/validate';
import { altText } from '../lib/img';
import { tagSlug } from '../lib/tags';
import { PostCard, PostMeta, fmtDate } from './Blog';
import NotFound from './NotFound';

// ---------- safe rich-text renderer ----------
// Supported: ## / ### headings, paragraphs, - lists, 1. lists, > quotes, ``` code blocks,
// and inline **bold**, *italic*, `code`, [text](https://link).
// Everything is rendered as React nodes (never as raw HTML), so content can never execute scripts.
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function Inline({ text }) {
  return String(text).split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i} className="plain-em">{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      if (/^\/(?!\/)/.test(link[2])) return <Link key={i} to={link[2]}>{link[1]}</Link>;
      const href = safeUrl(link[2]);
      return href ? <a key={i} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a> : <Fragment key={i}>{link[1]}</Fragment>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const isBlockStart = (l) => /^(#{2,3}\s|>\s?|[-*]\s|\d+\.\s|```|!\[)/.test(l.trim());

export function parseBlocks(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i += 1; continue; }
    if (t.startsWith('```')) {
      const buf = []; i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ t: 'code', text: buf.join('\n') });
      continue;
    }
    const im = t.match(IMG_LINE);
    if (im) { blocks.push({ t: 'img', alt: im[1], src: im[2] }); i += 1; continue; }
    const h = t.match(/^(#{2,3})\s+(.*)$/);
    if (h) { blocks.push({ t: h[1].length === 2 ? 'h2' : 'h3', text: h[2] }); i += 1; continue; }
    if (/^>\s?/.test(t)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i += 1; }
      blocks.push({ t: 'quote', text: buf.join(' ') });
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, '')); i += 1; }
      blocks.push({ t: 'ul', items });
      continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, '')); i += 1; }
      blocks.push({ t: 'ol', items });
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { buf.push(lines[i].trim()); i += 1; }
    blocks.push({ t: 'p', text: buf.join(' ') });
  }
  // unique, stable ids for headings (used by the table of contents)
  const seen = {};
  blocks.forEach((b) => {
    if (b.t === 'h2' || b.t === 'h3') {
      const base = slugify(b.text) || 'section';
      seen[base] = (seen[base] || 0) + 1;
      b.id = seen[base] > 1 ? `${base}-${seen[base]}` : base;
    }
  });
  return blocks;
}

function Body({ blocks }) {
  return blocks.map((b, i) => {
    switch (b.t) {
      case 'h2': return <h2 key={i} id={b.id}>{b.text}</h2>;
      case 'h3': return <h3 key={i} id={b.id}>{b.text}</h3>;
      case 'img': { const src = safeUrl(b.src); return src ? <figure key={i} className="post-figure"><img src={src} alt={b.alt || 'Illustration for this article'} loading="lazy" decoding="async" />{b.alt && <figcaption className="muted">{b.alt}</figcaption>}</figure> : null; }
      case 'quote': return <blockquote key={i}><Inline text={b.text} /></blockquote>;
      case 'code': return <pre key={i} className="code-block"><code>{b.text}</code></pre>;
      case 'ul': return <ul key={i}>{b.items.map((x, j) => <li key={j}><Inline text={x} /></li>)}</ul>;
      case 'ol': return <ol key={i}>{b.items.map((x, j) => <li key={j}><Inline text={x} /></li>)}</ol>;
      default: return <p key={i}><Inline text={b.text} /></p>;
    }
  });
}

function Share({ title }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
  const enc = encodeURIComponent;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ }
  };
  return (
    <div className="share">
      <span className="mono share-label">Share</span>
      <button type="button" className="share-btn" onClick={copy}>{copied ? 'Link copied ✓' : 'Copy link'}</button>
      <a className="share-btn" href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
      <a className="share-btn" href={`https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}`} target="_blank" rel="noopener noreferrer">X</a>
      <a className="share-btn" href={`https://wa.me/?text=${enc(`${title} ${url}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
    </div>
  );
}

function Toc({ blocks }) {
  const heads = blocks.filter((b) => b.t === 'h2');
  const [active, setActive] = useState('');
  useEffect(() => {
    if (heads.length < 2 || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: '-90px 0px -65% 0px' });
    heads.forEach((h) => { const el = document.getElementById(h.id); if (el) io.observe(el); });
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heads.length]);
  if (heads.length < 2) return null;
  return (
    <nav className="toc" aria-label="On this page">
      <span className="mono share-label">On this page</span>
      <ul>
        {heads.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className={active === h.id ? 'on' : ''}
              onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function BlogPost() {
  const { slug } = useParams();
  const preview = useSearchParams()[0].get('preview') === '1';
  const { data: a, loading } = useAsync(() => getInsightBySlug(slug, preview), [slug, preview]);
  const all = useAsync(getInsights, []);
  const blocks = useMemo(() => parseBlocks(a?.content), [a?.content]);

  if (loading) return <Loading label="Loading post" />;
  if (!a) return <NotFound />;
  const cover = safeUrl(a.cover_url);
  const related = (all.data || [])
    .filter((p) => p.slug !== a.slug && (p.category === a.category || (p.tags || []).some((t) => (a.tags || []).includes(t))))
    .slice(0, 3);
  const initials = String(a.author || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <>
      {!a.published && <div className="preview-bar" role="status">Draft preview — only you can see this. It is not published.</div>}
      <SEO
        noindex={!a.published || preview}
        title={a.title}
        description={a.excerpt}
        image={cover || undefined}
        imageAlt={cover ? altText(a.cover_alt, `Cover image for the article: ${a.title}`) : undefined}
        keywords={(a.tags || []).join(', ')}
        article={{ published: a.published_at, modified: a.updated_at, section: a.category, author: a.author, tags: a.tags }}
        type="article"
        record={{ title: a.seo_title, description: a.seo_description, image: a.og_image, noindex: a.noindex }}
        schema={{ kind: 'article', data: { title: a.title, description: a.seo_description || a.excerpt, image: cover || undefined, datePublished: a.published_at, dateModified: a.updated_at, author: a.author, tags: a.tags, section: a.category, words: String(a.content || '').split(/\s+/).filter(Boolean).length, imageAlt: altText(a.cover_alt, `Cover image for the article: ${a.title}`) } }}
      />
      <article className="section post">
        <div className="wrap">
          <Link to="/blog" className="back">← All blogs</Link>
          <header className="post-head">
            <PostMeta post={a} />
            <h1 className="article-title">{a.title}</h1>
            {a.excerpt && <p className="muted lead">{a.excerpt}</p>}
            <div className="byline">
              <span className="avatar" aria-hidden="true">{initials}</span>
              <span><strong>{a.author}</strong><span className="muted"> · {fmtDate(a.published_at)}</span></span>
            </div>
          </header>
          {cover && <img className="cs-cover post-cover" src={cover} alt={altText(a.cover_alt, `Cover image for the article: ${a.title}`)} width="1200" height="630" fetchPriority="high" decoding="async" />}

          <div className="post-layout">
            <div className="post-main">
              <div className="prose"><Body blocks={blocks} /></div>
              {a.tags?.length > 0 && <nav className="tags post-tags" aria-label="Article tags">{a.tags.map((t) => <Link key={t} to={`/blog/tag/${tagSlug(t)}`} className="tag">#{t}</Link>)}</nav>}
              <Share title={a.title} />
              <div className="card post-cta">
                <h3>Have an idea worth building?</h3>
                <p className="muted">Tell me what you are trying to build and we can work out a practical next step.</p>
                <Link to="/start-project" className="btn btn-primary btn-sm">Start a Project</Link>
              </div>
            </div>
            <aside className="post-aside"><Toc blocks={blocks} /></aside>
          </div>
        </div>
      </article>

      {related.length > 0 && (
        <section className="section alt tight">
          <div className="wrap">
            <h2 className="related-title">Keep reading</h2>
            <div className="blog-grid">{related.map((p) => <PostCard key={p.id} post={p} />)}</div>
          </div>
        </section>
      )}
    </>
  );
}
