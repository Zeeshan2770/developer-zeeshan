// RSS feed for the blog at /rss.xml (published posts only, read with the public anon key; RLS applies).
// Env: VITE_SITE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (same as the sitemap function)
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function handler() {
  const site = (process.env.VITE_SITE_URL || process.env.URL || '').replace(/\/$/, '');
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  let posts = [];
  if (url && key) {
    try {
      const r = await fetch(
        `${url}/rest/v1/insights?select=slug,title,excerpt,published_at,author&published=eq.true&order=published_at.desc&limit=30`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      posts = r.ok ? await r.json() : [];
    } catch { posts = []; }
  }
  const name = process.env.SITE_NAME || 'Muhammad Zeeshan Haider';
  const items = posts.map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(`${site}/blog/${p.slug}`)}</link>
      <guid isPermaLink="true">${esc(`${site}/blog/${p.slug}`)}</guid>
      ${p.published_at ? `<pubDate>${new Date(p.published_at).toUTCString()}</pubDate>` : ''}
      <description>${esc(p.excerpt || '')}</description>
    </item>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(name)} — Blogs</title>
    <link>${esc(`${site}/blog`)}</link>
    <description>Practical lessons, development notes and ideas from building digital projects.</description>
${items}
  </channel>
</rss>`;
  return { statusCode: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }, body };
}
