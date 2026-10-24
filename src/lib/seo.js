// One place that decides every page's meta tags, shared by the React app (SEO.jsx) and the build-time prerender.
// Priority for each field: per-record override (project / article) > per-page override (Admin > Settings > SEO) > the page's own text > site defaults.
export const DEFAULT_TITLE_TEMPLATE = '%s — %name';

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

/** @returns {{title, description, image, robots, keywords, twitterSite, verification:{google,bing}, customMeta:[{name,content}], locale}} */
export function resolveSeo({ settings = {}, path = '/', title = '', description = '', image = '', imageAlt = '', keywords = '', noindex = false, record = null, prebuiltTitle = '' }) {
  const seo = settings.seo || {};
  const page = (seo.pages && seo.pages[path]) || {};
  const rec = record || {};
  const name = settings.name || '';
  const template = trim(seo.titleTemplate) || DEFAULT_TITLE_TEMPLATE;
  const fromTemplate = (t) => template.replace('%s', t).replace('%name', name);

  const customTitle = trim(rec.title) || trim(page.title);
  const fullTitle = customTitle || trim(prebuiltTitle) || (title ? fromTemplate(title) : `${name} — ${settings.title || ''}`.trim());
  const desc = trim(rec.description) || trim(page.description) || trim(description) || trim(seo.defaultDescription);
  const img = trim(rec.image) || trim(page.image) || trim(image) || trim(seo.ogImage);
  const hidden = Boolean(seo.noindexSite || rec.noindex || page.noindex || noindex);
  return {
    title: fullTitle,
    description: desc,
    image: img,
    imageAlt: trim(imageAlt) || trim(seo.ogImageAlt) || (name ? `${name} — ${settings.title || 'portfolio'}` : ''),
    author: name,
    robots: hidden ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
    noindex: hidden,
    keywords: trim(keywords) || trim(seo.keywords),
    twitterSite: trim(seo.twitterHandle).replace(/^@?/, '@').replace(/^@$/, ''),
    verification: { google: trim(seo.googleVerification), bing: trim(seo.bingVerification) },
    customMeta: (Array.isArray(seo.customMeta) ? seo.customMeta : []).filter((m) => m && /^[\w:.-]{1,60}$/.test(m.name || '') && trim(m.content)),
    locale: trim(seo.locale) || 'en_US',
  };
}

/** Pages an admin can override from Settings > SEO. */
export const SEO_PAGES = [
  ['/', 'Home'], ['/about', 'About'], ['/projects', 'Projects'], ['/services', 'Services'], ['/experience', 'Journey'],
  ['/blog', 'Blog'], ['/testimonials', 'Testimonials'], ['/contact', 'Contact'], ['/book', 'Book a session'], ['/start-project', 'Start a project'],
];
