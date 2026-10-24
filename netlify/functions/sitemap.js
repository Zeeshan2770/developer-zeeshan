// Dynamic sitemap: static routes + published projects + published articles + tag archives (with image entries),
// read with the public anon key (RLS applies).
// Env (Netlify > Site settings > Environment variables): VITE_SITE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
import { indexableTags } from '../../src/lib/tags.js';

const STATIC = ['', '/about', '/projects', '/services', '/experience', '/blog', '/testimonials', '/contact', '/book', '/start-project'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function rest(path) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function handler() {
  const site = (process.env.VITE_SITE_URL || process.env.URL || '').replace(/\/$/, '');
  const abs = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : `${site}${u.startsWith('/') ? '' : '/'}${u}`);
  // noindex filters need the SEO migration; if it has not been run yet the first query fails and we fall back to the plain one.
  const both = async (t, cols) => { const a = await rest(`${t}?select=${cols}&published=eq.true&noindex=eq.false`); return a ?? ((await rest(`${t}?select=${cols}&published=eq.true`)) || []); };
  const [projects, insights, settingsRows] = await Promise.all([
    both('projects', 'slug,updated_at,thumbnail_url,name'),
    both('insights', 'slug,updated_at,cover_url,title,tags,published_at'),
    rest('site_settings?select=value&key=eq.site'),
  ]);
  // Pages hidden from search in Admin > Settings > SEO are left out of the sitemap too.
  const seo = settingsRows?.[0]?.value?.seo || {};
  const profile = settingsRows?.[0]?.value?.profileImage;
  const newest = (rows) => rows.map((r) => r.updated_at).filter(Boolean).sort().pop();
  const lastmodFor = { '/projects': newest(projects), '/blog': newest(insights) };
  const pages = STATIC.filter((p) => !seo.pages?.[p === '' ? '/' : p]?.noindex);
  const urls = seo.noindexSite ? [] : [
    ...pages.map((p) => ({ loc: `${site}${p || '/'}`, lastmod: lastmodFor[p], images: p === '' && profile ? [{ loc: abs(profile), title: settingsRows?.[0]?.value?.name }] : [] })),
    ...projects.map((p) => ({ loc: `${site}/projects/${p.slug}`, lastmod: p.updated_at, images: p.thumbnail_url ? [{ loc: abs(p.thumbnail_url), title: p.name }] : [] })),
    ...insights.map((p) => ({ loc: `${site}/blog/${p.slug}`, lastmod: p.updated_at, images: p.cover_url ? [{ loc: abs(p.cover_url), title: p.title }] : [] })),
    ...indexableTags(insights).map((t) => ({ loc: `${site}/blog/tag/${t.slug}`, lastmod: t.posts.map((x) => x.updated_at).filter(Boolean).sort().pop(), images: [] })),
  ];
  const entry = (u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${String(u.lastmod).slice(0, 10)}</lastmod>` : ''}${(u.images || []).map((i) => `<image:image><image:loc>${esc(i.loc)}</image:loc>${i.title ? `<image:title>${esc(i.title)}</image:title>` : ''}</image:image>`).join('')}</url>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.map(entry).join('\n')}\n</urlset>`;
  return { statusCode: 200, headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' }, body };
}
