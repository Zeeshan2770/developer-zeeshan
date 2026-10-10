// Dynamic sitemap: static routes + published projects + published insights, read with the public anon key (RLS applies).
// Env (Netlify > Site settings > Environment variables): VITE_SITE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const STATIC = ['', '/about', '/projects', '/services', '/experience', '/blog', '/testimonials', '/contact', '/book', '/start-project'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function rest(path) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

export async function handler() {
  const site = (process.env.VITE_SITE_URL || process.env.URL || '').replace(/\/$/, '');
  const [projects, insights] = await Promise.all([
    rest('projects?select=slug,updated_at&published=eq.true'),
    rest('insights?select=slug,updated_at&published=eq.true'),
  ]);
  const urls = [
    ...STATIC.map((p) => ({ loc: `${site}${p}` })),
    ...projects.map((p) => ({ loc: `${site}/projects/${p.slug}`, lastmod: p.updated_at })),
    ...insights.map((p) => ({ loc: `${site}/blog/${p.slug}`, lastmod: p.updated_at })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}</url>`)
    .join('\n')}\n</urlset>`;
  return { statusCode: 200, headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' }, body };
}
