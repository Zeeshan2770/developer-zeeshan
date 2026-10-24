import { Link, useParams } from 'react-router-dom';
import SEO from '../components/SEO';
import { useAsync } from '../lib/useAsync';
import { getInsights } from '../lib/api';
import { Empty, Loading, Reveal, SectionHead } from '../components/ui';
import { collectTags, MIN_TAG_POSTS } from '../lib/tags';
import { PostCard } from './Blog';
import NotFound from './NotFound';

// /blog/tag/:tag — every article with one tag. Only indexed by search engines when it groups enough posts.
export default function BlogTag() {
  const { tag } = useParams();
  const { data, loading } = useAsync(getInsights, []);
  if (loading) return <Loading label="Loading articles" />;
  const all = collectTags(data || []);
  const entry = all.find((t) => t.slug === tag);
  if (!entry) return <NotFound />;
  const others = all.filter((t) => t.slug !== tag).slice(0, 10);
  return (
    <>
      <SEO
        title={`${entry.name} articles`}
        description={`${entry.count} article${entry.count === 1 ? '' : 's'} tagged ${entry.name}: practical notes on building web projects, educational technology and lessons learned.`}
        keywords={entry.name}
        noindex={entry.count < MIN_TAG_POSTS}
        schema={{ kind: 'tag', data: { name: `${entry.name} articles` } }}
      />
      <section className="page-hero">
        <div className="wrap">
          <Link to="/blog" className="back">← All blogs</Link>
          <SectionHead h1 eyebrow="Tag" title={`Articles tagged “${entry.name}”`}>
            {entry.count} article{entry.count === 1 ? '' : 's'} on this topic.
          </SectionHead>
        </div>
      </section>
      <section className="section tight">
        <div className="wrap">
          {entry.posts.length === 0 ? <Empty title="Nothing here yet">No articles use this tag.</Empty> : (
            <div className="blog-grid">{entry.posts.map((p, i) => <Reveal key={p.id} delay={(i % 3) * 90}><PostCard post={p} /></Reveal>)}</div>
          )}
          {others.length > 0 && (
            <nav className="chip-row tag-cloud" aria-label="More tags">
              {others.map((t) => <Link key={t.slug} to={`/blog/tag/${t.slug}`} className="chip">#{t.name} <small>{t.count}</small></Link>)}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}
