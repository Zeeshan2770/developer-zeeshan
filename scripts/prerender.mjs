// Runs after `vite build`. Never fails the build: on any problem it keeps the plain SPA shell and prints a warning.
import fs from 'node:fs';
import path from 'node:path';
import { buildPages, renderHtml } from './prerender-lib.mjs';

const dist = path.resolve(process.env.PRERENDER_DIST || 'dist');
const site = (process.env.VITE_SITE_URL || process.env.URL || '').replace(/\/$/, '');
const sbUrl = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

async function rest(p) {
  if (!sbUrl || !key) return null;
  const r = await fetch(`${sbUrl}/rest/v1/${p}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`);
  return r.json();
}

try {
  const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  let settings = null; let data = {};
  try {
    const [st, projects, services, journey, insights] = await Promise.all([
      rest('site_settings?select=value&key=eq.site'),
      rest('projects?select=*,project_features(title,description,sort_order)&published=eq.true&order=sort_order.asc'),
      rest('services?select=*&published=eq.true&order=sort_order.asc'),
      rest('journey_entries?select=*&published=eq.true&order=sort_order.asc'),
      rest(`insights?select=*&published=eq.true&published_at=lte.${encodeURIComponent(new Date().toISOString())}&order=published_at.desc`),
    ]);
    settings = st?.[0]?.value || null;
    data = { projects: projects || [], services: services || [], journey: journey || [], insights: insights || [] };
  } catch (e) {
    console.warn(`[prerender] database not reachable (${e.message}); using built-in defaults for page content.`);
  }
  if (!site) console.warn('[prerender] VITE_SITE_URL / URL not set: canonical and og:url will be relative.');
  const { settings: s, pages } = buildPages(settings, data);
  let n = 0;
  for (const pg of pages) {
    const out = pg.path === '/' ? path.join(dist, 'index.html') : path.join(dist, pg.path, 'index.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, renderHtml(template, pg, s, site));
    n += 1;
  }
  if (site) fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${site}/sitemap.xml\n`);
  console.log(`[prerender] wrote ${n} static pages${site ? '' : ' (no site URL)'}`);
} catch (e) {
  console.warn(`[prerender] skipped: ${e.message}`);
}
