// Structured data (schema.org JSON-LD) shared by the React app (SEO.jsx) and the build-time prerender.
// Everything comes from real site data; nothing is invented (no ratings, prices or reviews).
import { socialLinks } from './validate.js';

const abs = (site, u) => (!u ? undefined : /^https?:\/\//i.test(u) ? u : `${site}${u.startsWith('/') ? '' : '/'}${u}`);
const listOf = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 25);
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));

const LABELS = {
  '/about': 'About', '/projects': 'Projects', '/services': 'Services', '/experience': 'Journey', '/blog': 'Blogs',
  '/testimonials': 'Testimonials', '/contact': 'Contact', '/book': 'Book a session', '/start-project': 'Start a project',
};

/**
 * @param {object} o
 * @param {object} o.settings  site settings
 * @param {string} o.site      absolute site origin, no trailing slash
 * @param {string} o.path      current path
 * @param {'page'|'article'|'project'|'tag'} [o.kind]
 * @param {object} [o.data]    for article: {title, description, image, datePublished, dateModified, author}; for project: {name, description, image, year, url}
 * @returns {object} one JSON-LD document with an @graph
 */
export function buildJsonLd({ settings = {}, site = '', path = '/', kind = 'page', data = {} }) {
  const name = settings.name || '';
  const home = `${site}/`;
  const url = `${site}${path === '/' ? '/' : path}`;
  const sameAs = socialLinks(settings.social || {}).map((l) => l.url);
  const personId = `${home}#person`;
  const siteId = `${home}#website`;
  const graph = [];

  graph.push(compact({
    '@type': 'Person', '@id': personId, name, jobTitle: settings.title, url: home,
    description: settings.heroStatement, sameAs,
    image: settings.profileImage ? compact({ '@type': 'ImageObject', url: abs(site, settings.profileImage), caption: settings.profileImageAlt || `Portrait of ${name}` }) : undefined,
    knowsAbout: listOf(settings.seo?.knowsAbout),
  }));
  graph.push(compact({ '@type': 'WebSite', '@id': siteId, url: home, name: name || undefined, description: settings.seo?.defaultDescription, inLanguage: (settings.seo?.locale || 'en_US').replace('_', '-'), publisher: { '@id': personId } }));

  // Breadcrumbs: Home > section > page
  const crumbs = [['Home', home]];
  if (path !== '/') {
    const seg = '/' + path.split('/').filter(Boolean)[0];
    if (seg !== path && LABELS[seg]) crumbs.push([LABELS[seg], `${site}${seg}`]);
    const leaf = kind === 'article' ? data.title : kind === 'project' ? data.name : kind === 'tag' ? data.name : LABELS[path];
    crumbs.push([leaf || LABELS[path] || path.slice(1), url]);
  }
  if (crumbs.length > 1) {
    graph.push({ '@type': 'BreadcrumbList', itemListElement: crumbs.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: u })) });
  }

  if (kind === 'article') {
    graph.push(compact({
      '@type': 'BlogPosting', '@id': `${url}#article`, mainEntityOfPage: { '@type': 'WebPage', '@id': url }, url,
      headline: String(data.title || '').slice(0, 110), description: data.description,
      image: data.image ? compact({ '@type': 'ImageObject', url: abs(site, data.image), caption: data.imageAlt }) : undefined,
      keywords: listOf(data.tags).join(', ') || undefined, articleSection: data.section || undefined, wordCount: data.words || undefined,
      datePublished: data.datePublished, dateModified: data.dateModified || data.datePublished,
      author: { '@type': 'Person', name: data.author || name, url: home }, publisher: { '@id': personId }, inLanguage: 'en',
    }));
  } else if (kind === 'project') {
    graph.push(compact({
      '@type': 'CreativeWork', '@id': `${url}#project`, mainEntityOfPage: { '@type': 'WebPage', '@id': url }, url,
      name: data.name, description: data.description, image: abs(site, data.image), keywords: listOf(data.keywords).join(', ') || undefined, dateCreated: data.year ? String(data.year) : undefined,
      author: { '@id': personId }, creator: { '@id': personId },
    }));
  } else if (kind === 'tag') {
    graph.push({ '@type': 'CollectionPage', '@id': `${url}#page`, url, name: data.name, isPartOf: { '@id': siteId } });
  } else if (path === '/projects' || path === '/blog') {
    graph.push({ '@type': 'CollectionPage', '@id': `${url}#page`, url, name: LABELS[path], isPartOf: { '@id': siteId } });
  } else if (path === '/about') {
    graph.push({ '@type': 'ProfilePage', '@id': `${url}#page`, url, name: `About ${name}`.trim(), mainEntity: { '@id': personId } });
  } else if (path === '/contact') {
    graph.push({ '@type': 'ContactPage', '@id': `${url}#page`, url, name: `Contact ${name}`.trim(), isPartOf: { '@id': siteId } });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/** Safe to place inside <script type="application/ld+json">. */
export const ldToString = (ld) => JSON.stringify(ld).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
