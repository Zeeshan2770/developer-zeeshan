import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { auditSeo } from '../lib/seoAudit';

// Reads published content (newer columns first, older columns if phase 11 has not been run) for the checklist.
async function loadContent() {
  const get = async (table, cols, fallback) => {
    let r = await supabase.from(table).select(cols).eq('published', true);
    if (r.error) r = await supabase.from(table).select(fallback).eq('published', true);
    return r.data || [];
  };
  const [articles, projects] = await Promise.all([
    get('insights', 'title,excerpt,cover_url,cover_alt,tags,seo_description', 'title,excerpt,cover_url,tags'),
    get('projects', 'name,short_description,thumbnail_url,thumbnail_alt,seo_description', 'name,short_description,thumbnail_url'),
  ]);
  return { articles, projects };
}

const ICON = { ok: '✓', warn: '!', bad: '✕' };

export default function SeoHealth({ site }) {
  const [content, setContent] = useState(null);
  useEffect(() => { let alive = true; loadContent().then((c) => alive && setContent(c)).catch(() => alive && setContent({})); return () => { alive = false; }; }, []);
  const { score, checks } = useMemo(() => auditSeo(site, content || {}, { siteUrl: import.meta.env.VITE_SITE_URL }), [site, content]);
  const todo = checks.filter((c) => c.level !== 'ok');
  const tone = score >= 85 ? 'ok' : score >= 60 ? 'warn' : 'bad';
  return (
    <fieldset className="seo-health"><legend>SEO health check</legend>
      <div className="seo-score" role="status">
        <span className={`seo-score-n ${tone}`}>{score}</span>
        <span className="muted small">out of 100 · {todo.length ? `${todo.length} thing${todo.length === 1 ? '' : 's'} to improve` : 'everything looks good'}{content ? '' : ' · loading content…'}</span>
      </div>
      <ul className="seo-checks">
        {[...todo, ...checks.filter((c) => c.level === 'ok')].map((c, i) => (
          <li key={i} className={c.level}>
            <span className="seo-ic" aria-hidden="true">{ICON[c.level]}</span>
            <span><b>{c.label}</b>{c.level !== 'ok' && c.hint ? <small className="muted"> — {c.hint}</small> : null}</span>
            <span className="badge">{c.area}</span>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
