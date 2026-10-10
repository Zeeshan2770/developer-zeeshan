// Share previews for client-rendered pages. Link-preview bots (WhatsApp, LinkedIn, X, Slack…) don't run JavaScript,
// so for /projects/:slug and /blog/:slug this edge function injects real <title>/description/Open Graph tags
// into the served HTML. Visitors still get the normal React app. Failures fall through to the untouched page.

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function injectMeta(html, m) {
  const title = esc(m.title);
  const tags = [
    `<meta name="description" content="${esc(m.description)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:type" content="${esc(m.type || 'article')}" />`,
    `<meta property="og:url" content="${esc(m.url)}" />`,
    `<link rel="canonical" href="${esc(m.url)}" />`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}" />` : '',
    `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}" />`,
  ].filter(Boolean).join('\n    ');
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .replace(/<meta name="description"[^>]*>\s*/i, '')
    .replace('</head>', `    ${tags}\n  </head>`);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async (request, context) => {
  const url = new URL(request.url);
  const [, section, slug] = url.pathname.split('/');
  if (!['projects', 'blog'].includes(section) || !slug || !SLUG.test(slug)) return context.next();

  const sbUrl = Netlify.env.get('VITE_SUPABASE_URL');
  const key = Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  if (!sbUrl || !key) return context.next();

  try {
    const table = section === 'projects' ? 'projects' : 'insights' /* blog posts live in the insights table */;
    const cols = section === 'projects' ? 'name,short_description,thumbnail_url' : 'title,excerpt,cover_url';
    const [res, page] = await Promise.all([
      fetch(`${sbUrl}/rest/v1/${table}?select=${cols}&slug=eq.${slug}&published=eq.true&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }),
      context.next(),
    ]);
    const row = res.ok ? (await res.json())[0] : null;
    if (!row) return page;
    const name = Netlify.env.get('SITE_NAME') || 'Muhammad Zeeshan Haider';
    const html = await page.text();
    const out = injectMeta(html, {
      title: `${row.name || row.title} — ${name}`,
      description: row.short_description || row.excerpt || '',
      image: row.thumbnail_url || row.cover_url || '',
      url: url.href,
    });
    const headers = new Headers(page.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.delete('content-length');
    return new Response(out, { status: page.status, headers });
  } catch {
    return context.next();
  }
};

export const config = { path: ['/projects/*', '/blog/*'] };
