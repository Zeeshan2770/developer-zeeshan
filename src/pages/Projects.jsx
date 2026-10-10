import { useMemo, useState } from 'react';
import SEO from '../components/SEO';
import { useAsync } from '../lib/useAsync';
import { getProjects } from '../lib/api';
import { Empty, ErrorState, flatTech, Loading, ProjectCard, SectionHead } from '../components/ui';

const SORTS = {
  featured: 'Featured first',
  newest: 'Newest',
  name: 'Name A–Z',
};

export default function Projects() {
  const { data, loading, error } = useAsync(getProjects, []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [tech, setTech] = useState('All');
  const [status, setStatus] = useState('All');
  const [sort, setSort] = useState('featured');

  const all = data || [];
  const cats = useMemo(() => ['All', ...new Set(all.map((p) => p.category).filter(Boolean))], [all]);
  const techs = useMemo(() => ['All', ...new Set(all.flatMap((p) => flatTech(p.technologies)))], [all]);
  const statuses = useMemo(() => ['All', ...new Set(all.map((p) => p.status).filter(Boolean))], [all]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = all.filter((p) =>
      (cat === 'All' || p.category === cat) &&
      (status === 'All' || p.status === status) &&
      (tech === 'All' || flatTech(p.technologies).includes(tech)) &&
      (!needle || `${p.name} ${p.short_description} ${flatTech(p.technologies).join(' ')}`.toLowerCase().includes(needle)));
    if (sort === 'newest') out = [...out].sort((a, b) => (b.year || 0) - (a.year || 0));
    if (sort === 'name') out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [all, q, cat, tech, status, sort]);

  const reset = () => { setQ(''); setCat('All'); setTech('All'); setStatus('All'); setSort('featured'); };
  const dirty = q || cat !== 'All' || tech !== 'All' || status !== 'All';

  return (
    <>
      <SEO title="Projects" description="Case studies of the websites, platforms and management systems I have built." />
      <section className="page-hero">
        <div className="wrap">
          <SectionHead eyebrow="Projects" title="Projects & case studies">
            Real builds, each with the problem, the solution and what I learned.
          </SectionHead>
        </div>
      </section>

      <section className="section tight">
        <div className="wrap">
          <div className="filters" role="search">
            <input type="search" placeholder="Search projects or technology…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
            {cats.length > 2 && (
              <div className="chips" role="group" aria-label="Category">
                {cats.map((c) => (
                  <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
                ))}
              </div>
            )}
            <div className="select-row">
              {techs.length > 2 && (
                <label>Technology
                  <select value={tech} onChange={(e) => setTech(e.target.value)}>{techs.map((t) => <option key={t}>{t}</option>)}</select>
                </label>
              )}
              {statuses.length > 2 && (
                <label>Status
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((t) => <option key={t}>{t}</option>)}</select>
                </label>
              )}
              <label>Sort
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
          </div>

          {loading ? <Loading /> : error ? <ErrorState error={error} /> : list.length === 0 ? (
            <Empty title={dirty ? 'No projects match' : 'No projects yet'}
              action={dirty ? <button className="btn btn-ghost btn-sm" onClick={reset}>Clear filters</button> : null}>
              {dirty ? 'Try a different search or filter.' : 'Published projects will appear here.'}
            </Empty>
          ) : (
            <div className="grid grid-2">{list.map((p, i) => <ProjectCard key={p.id} p={p} index={i} />)}</div>
          )}
        </div>
      </section>
    </>
  );
}
