// SEO checklist for Admin > Settings > SEO. Pure: takes the saved settings and a summary of published content,
// returns a list of checks plus a 0-100 score. Nothing here talks to the network, so it is easy to test.
import { SEO_PAGES } from './seo.js';
import { collectTags, MIN_TAG_POSTS } from './tags.js';

const len = (v) => String(v || '').trim().length;
const words = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean).length;

/**
 * @param {object} site     saved site settings
 * @param {{articles?: object[], projects?: object[]}} content  published rows (only the fields below are read)
 * @param {{siteUrl?: string}} env
 */
export function auditSeo(site = {}, content = {}, env = {}) {
  const seo = site.seo || {};
  const articles = content.articles || [];
  const projects = content.projects || [];
  const checks = [];
  const add = (level, area, label, hint) => checks.push({ level, area, label, hint });
  const verdict = (ok, warnIf = false) => (ok ? 'ok' : warnIf ? 'warn' : 'bad');

  // ---- site ----
  add(verdict(Boolean(env.siteUrl)), 'Site', 'Site address (VITE_SITE_URL) is set', 'Set VITE_SITE_URL in Netlify so canonical links, the sitemap and robots.txt use your real domain.');
  add(verdict(!seo.noindexSite), 'Site', 'Site is visible to search engines', 'Turn off “Hide the whole site from search engines” before launch.');
  const home = seo.pages?.['/'] || {};
  const homeTitle = home.title || `${site.name || ''} — ${site.title || ''}`;
  add(verdict(len(homeTitle) >= 30 && len(homeTitle) <= 60, len(homeTitle) > 0), 'Site', `Home page title is 30–60 characters (now ${len(homeTitle)})`, 'Long titles get cut off in Google. Put the main keyword first.');
  const homeDesc = home.description || seo.defaultDescription;
  add(verdict(len(homeDesc) >= 70 && len(homeDesc) <= 155, len(homeDesc) > 0), 'Site', `Home description is 70–155 characters (now ${len(homeDesc)})`, 'Describe what you build and for whom, in one clear sentence.');
  add(verdict(Boolean(seo.ogImage)), 'Sharing', 'Default social sharing image is set', 'Used for WhatsApp, LinkedIn and X previews. 1200×630 works best.');
  add(verdict(len(seo.ogImageAlt) >= 10, Boolean(seo.ogImage)), 'Sharing', 'Social sharing image has alt text', 'Describe the image in one sentence (SEO → Social sharing image description).');
  add(verdict(words(seo.keywords) >= 8, words(seo.keywords) > 0), 'Site', `Keywords list has 8+ terms (now ${words(seo.keywords)})`, 'Include your name, your city/country, and the services people would search for.');
  add(verdict(Boolean(seo.googleVerification), false), 'Tools', 'Google Search Console is verified', 'Paste the verification code, then submit /sitemap.xml in Search Console.');
  add(verdict(Boolean(seo.bingVerification), true), 'Tools', 'Bing Webmaster Tools is verified', 'Optional, but Bing also powers DuckDuckGo and several AI search tools.');
  add(verdict(words(seo.knowsAbout) >= 4, words(seo.knowsAbout) > 0), 'Identity', 'Topics you are known for are listed (knowsAbout)', 'Used in your Person structured data so search engines connect you to these topics.');
  const social = site.social || {};
  const socials = [social.github, social.linkedin, ...((social.extra || []).map((e) => e && e.url))].filter(Boolean).length;
  add(verdict(socials >= 2, socials === 1), 'Identity', `Social profiles are linked (${socials})`, 'GitHub and LinkedIn links become “sameAs” links that help Google confirm who you are.');

  // ---- images ----
  add(verdict(Boolean(site.profileImage), true), 'Images', 'Profile photo is uploaded', 'The hero portrait. Upload through Admin so it is resized to a fast size automatically.');
  add(verdict(len(site.profileImageAlt) >= 10, !site.profileImage), 'Images', 'Profile photo has alt text', 'Example: “Muhammad Zeeshan Haider, web developer, smiling in a dark jacket”.');
  const noThumbAlt = projects.filter((p) => p.thumbnail_url && !len(p.thumbnail_alt));
  if (projects.length) add(verdict(noThumbAlt.length === 0, true), 'Images', noThumbAlt.length ? `${noThumbAlt.length} project thumbnail(s) have no custom alt text` : 'Every project thumbnail has alt text', noThumbAlt.slice(0, 4).map((p) => p.name).join(', ') || 'A fallback description is used automatically, but a specific one ranks better in Google Images.');
  const withCover = articles.filter((a) => a.cover_url);
  const noCoverAlt = withCover.filter((a) => !len(a.cover_alt));
  if (withCover.length) add(verdict(noCoverAlt.length === 0, true), 'Images', noCoverAlt.length ? `${noCoverAlt.length} article cover(s) have no custom alt text` : 'Every article cover has alt text', noCoverAlt.slice(0, 4).map((a) => a.title).join(', ') || '');
  const noCover = articles.filter((a) => !a.cover_url);
  if (articles.length) add(verdict(noCover.length === 0, true), 'Images', noCover.length ? `${noCover.length} article(s) have no cover image` : 'Every article has a cover image', 'Articles with a cover look better when shared and appear in Google Images.');

  // ---- content ----
  add(verdict(articles.length >= 6, articles.length >= 2), 'Content', `Published articles: ${articles.length} (aim for 6+)`, 'Regular, useful articles are the biggest long-term ranking lever for a portfolio site.');
  const noDesc = articles.filter((a) => len(a.seo_description || a.excerpt) < 70);
  if (articles.length) add(verdict(noDesc.length === 0, true), 'Content', noDesc.length ? `${noDesc.length} article(s) have a short or missing description` : 'Every article has a 70+ character description', noDesc.slice(0, 4).map((a) => a.title).join(', '));
  const noTags = articles.filter((a) => !(a.tags || []).length);
  if (articles.length) add(verdict(noTags.length === 0, true), 'Content', noTags.length ? `${noTags.length} article(s) have no tags` : 'Every article has tags', noTags.slice(0, 4).map((a) => a.title).join(', '));
  const tagsOk = collectTags(articles).filter((t) => t.count >= MIN_TAG_POSTS).length;
  add(verdict(tagsOk >= 3, tagsOk > 0), 'Content', `Tag pages that can rank: ${tagsOk} (a tag needs ${MIN_TAG_POSTS}+ articles)`, 'Reuse the same few tags across related articles so each tag page has real content.');
  const noProjDesc = projects.filter((p) => len(p.seo_description || p.short_description) < 70);
  if (projects.length) add(verdict(noProjDesc.length === 0, true), 'Content', noProjDesc.length ? `${noProjDesc.length} project(s) have a short or missing description` : 'Every project has a 70+ character description', noProjDesc.slice(0, 4).map((p) => p.name).join(', '));

  // ---- page by page ----
  const pageIssues = SEO_PAGES.filter(([path]) => { const d = seo.pages?.[path]?.description; return d && (len(d) < 70 || len(d) > 160); }).map(([, l]) => l);
  add(verdict(pageIssues.length === 0, true), 'Pages', pageIssues.length ? `Custom descriptions outside 70–160 characters: ${pageIssues.join(', ')}` : 'Custom page descriptions are a good length', '');

  const weight = { ok: 1, warn: 0.5, bad: 0 };
  const score = Math.round((checks.reduce((n, c) => n + weight[c.level], 0) / checks.length) * 100);
  return { score, checks };
}
