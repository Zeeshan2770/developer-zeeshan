// Build-time prerender: turns the empty SPA shell into real, crawlable HTML for every public page.
// Crawlers that don't run JavaScript (Seobility, many SEO tools, link bots) then see a proper <title>, one <h1>,
// headings, text and internal links. Visitors still get the normal React app, which replaces this markup on load.
import { DEFAULT_SETTINGS } from '../src/lib/defaults.js';
import { resolveSeo } from '../src/lib/seo.js';
import { buildJsonLd, ldToString } from '../src/lib/jsonld.js';
import { tagSlug } from '../src/lib/tags.js';
import { altText } from '../src/lib/img.js';
import { collectTags, indexableTags, MIN_TAG_POSTS } from '../src/lib/tags.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…`; };
const paras = (t) => String(t || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;

export const NAV = [['/', 'Home'], ['/projects', 'Projects'], ['/services', 'Services'], ['/about', 'About'], ['/experience', 'Journey'], ['/blog', 'Blogs'], ['/contact', 'Contact']];

function shell(s, body) {
  const nav = `<nav aria-label="Primary">${NAV.map(([h, t]) => link(h, t)).join(' ')} ${link('/start-project', 'Start a Project')} ${link('/book', 'Book a Session')}</nav>`;
  const foot = `<footer><p>${esc(s.footer)}</p><nav aria-label="Footer">${NAV.map(([h, t]) => link(h, t)).join(' ')} ${link('/testimonials', 'Testimonials')}</nav><p>© ${new Date().getFullYear()} ${esc(s.copyright)}</p></footer>`;
  return `<header class="prerender"><div class="wrap">${nav}</div></header><main id="main" class="prerender"><div class="wrap">${body}</div></main><div class="prerender wrap">${foot}</div>`;
}

const absUrl = (site, u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : `${site}${u.startsWith('/') ? '' : '/'}${u}`);
const img = (src, alt, w, h, extra = '') => (src ? `<img src="${esc(src)}" alt="${esc(alt)}" width="${w}" height="${h}" ${extra}decoding="async" />` : '');
const tagLinks = (tags) => (tags || []).map((t) => ({ t, s: tagSlug(t) })).filter((x) => x.s).map((x) => link(`/blog/tag/${x.s}`, `#${x.t}`)).join(' ');

// Inline **bold**, *italic*, `code` and [text](url) -> escaped HTML. Only http(s) and site-relative links are kept.
export function inline(text) {
  return String(text ?? '').split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g).map((part) => {
    if (!part) return '';
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return `<strong>${esc(part.slice(2, -2))}</strong>`;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return `<code>${esc(part.slice(1, -1))}</code>`;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return `<em>${esc(part.slice(1, -1))}</em>`;
    const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) return /^(https?:\/\/|\/(?!\/))/i.test(m[2]) ? `<a href="${esc(m[2])}">${esc(m[1])}</a>` : esc(m[1]);
    return esc(part);
  }).join('');
}

/** The blog's markdown-lite -> HTML, mirroring the React renderer (headings, lists, quotes, code, images, paragraphs). */
export function articleHtml(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const out = []; let i = 0;
  const start = (l) => /^(#{2,3}\s|>\s?|[-*]\s|\d+\.\s|```|!\[)/.test(l.trim());
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) { i += 1; continue; }
    if (t.startsWith('```')) { const buf = []; i += 1; while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i += 1; } i += 1; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
    const im = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (im) { out.push(`<figure>${img(im[2], im[1] || 'Illustration for this article', 1200, 630, 'loading="lazy" ')}${im[1] ? `<figcaption>${esc(im[1])}</figcaption>` : ''}</figure>`); i += 1; continue; }
    const h = t.match(/^(#{2,3})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i += 1; continue; }
    if (/^>\s?/.test(t)) { const b = []; while (i < lines.length && /^>\s?/.test(lines[i].trim())) { b.push(lines[i].trim().replace(/^>\s?/, '')); i += 1; } out.push(`<blockquote>${inline(b.join(' '))}</blockquote>`); continue; }
    if (/^[-*]\s+/.test(t)) { const b = []; while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { b.push(lines[i].trim().replace(/^[-*]\s+/, '')); i += 1; } out.push(`<ul>${b.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`); continue; }
    if (/^\d+\.\s+/.test(t)) { const b = []; while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { b.push(lines[i].trim().replace(/^\d+\.\s+/, '')); i += 1; } out.push(`<ol>${b.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`); continue; }
    const b = []; while (i < lines.length && lines[i].trim() && !start(lines[i])) { b.push(lines[i].trim()); i += 1; }
    out.push(`<p>${inline(b.join(' '))}</p>`);
  }
  return out.join('');
}

const card = (p) => `<li>${p.thumbnail_url ? `${img(p.thumbnail_url, altText(p.thumbnail_alt, `Screenshot of ${p.name}, ${p.category || 'web project'}`), 1200, 540, 'loading="lazy" ')} ` : ''}${link(`/projects/${p.slug}`, p.name)}${p.short_description ? ` — ${esc(p.short_description)}` : ''}</li>`;

/** pages(settings, data) -> [{ path, title, description, type?, image?, body }] */
export function buildPages(settingsIn, data = {}) {
  const s = { ...DEFAULT_SETTINGS, ...(settingsIn || {}) };
  const { projects = [], services = [], journey = [], insights = [], story } = { story: s.story, ...data };
  const name = s.name;
  const pages = [];
  const add = (path, title, description, body, extra = {}) => {
    const d = String(description || '').trim();
    pages.push({ path, title: clip(title, 60), description: clip(d.length < 60 ? `${d} ${name}: digital systems, educational platforms and web applications.` : d, 158), body, ...extra });
  };

  const featured = projects.filter((p) => p.featured).slice(0, 4);
  add('/', `${name} — ${s.title}`, `${s.heroStatement} ${s.heroSupport}`, `
    <h1>${esc(name)}</h1><p>${esc(s.title)}</p>
    ${s.profileImage ? img(s.profileImage, altText(s.profileImageAlt, `Portrait of ${name}, ${s.title}`), 800, 1000, 'fetchpriority="high" ') : ''}
    <h2>${esc(s.heroStatement)}</h2><p>${esc(s.heroSupport)}</p>
    <p>${link('/projects', 'Explore My Work')} · ${link('/start-project', 'Start a Project')} · ${link('/book', 'Book a Session')}</p>
    ${projects.length ? `<h2>Selected work</h2><ul>${(featured.length ? featured : projects.slice(0, 4)).map(card).join('')}</ul><p>${link('/projects', 'All projects')}</p>` : ''}
    ${services.length ? `<h2>What I build</h2><ul>${services.map((v) => `<li><strong>${esc(v.title)}</strong> — ${esc(v.summary)}</li>`).join('')}</ul><p>${link('/services', 'See all services')}</p>` : ''}
    <h2>About ${esc(name)}</h2>${(story || []).slice(0, 1).map((c) => paras(c.body)).join('')}<p>${link('/about', 'More about me')} · ${link('/experience', 'See the journey')}</p>`,
  { type: 'website', image: s.seo?.ogImage || s.profileImage });

  add('/about', `About — ${name}`, `The story behind ${name}: from curiosity to building digital systems. ${s.heroStatement}`, `
    <h1>From curiosity to digital systems.</h1><p>${esc(s.heroStatement)}</p>
    ${(story || []).map((c) => `<h2>${esc(c.title)}</h2>${paras(c.body)}`).join('')}
    <p>${link('/experience', 'See the journey')} · ${link('/projects', 'See the work')} · ${link('/start-project', 'Start a Project')}</p>`);

  add('/projects', `Projects and case studies — ${name}`, `Selected projects and case studies by ${name}: education platforms, management systems and full-stack web applications.`, `
    <h1>Selected work</h1><p>Each project is a case study: the problem, the thinking, the system and what I learned.</p>
    <ul>${projects.map(card).join('')}</ul><p>${link('/start-project', 'Have a project in mind? Start a Project')}</p>`);

  add('/services', `Services — ${name}`, `Website development, full-stack applications, educational platforms and management systems by ${name}.`, `
    <h1>How I can help</h1><p>Clear services, no fake pricing: what each one is, who it is for and how it works.</p>
    ${services.map((v) => `<h2>${esc(v.title)}</h2>${v.what_it_is ? `<p>${esc(v.what_it_is)}</p>` : ''}${v.who_for ? `<p><strong>Who it is for:</strong> ${esc(v.who_for)}</p>` : ''}${(v.includes || []).length ? `<ul>${v.includes.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}`).join('')}
    <p>${link('/start-project', 'Start a Project')} · ${link('/book', 'Book a Session')}</p>`);

  add('/experience', `Journey — ${name}`, `An honest look at how ${name} got here: milestones from early curiosity to full-stack systems, and where it is heading.`, `
    <h1>Always building. Always evolving.</h1><p>An honest look at how I got here and where I am heading.</p>
    <ol>${journey.map((j) => `<li><h2>${esc(j.title)}</h2>${j.period ? `<p>${esc(j.period)}</p>` : ''}<p>${esc(j.description)}</p></li>`).join('')}</ol>
    <p>${link('/projects', 'See the work')} · ${link('/about', 'About me')}</p>`);

  add('/blog', `Blogs — ${name}`, `Blog posts on building software, educational technology and what I learn along the way.`, `
    <h1>Things I’m learning along the way.</h1><p>Notes on software, education technology and lessons from real projects.</p>
    ${indexableTags(insights).length ? `<nav aria-label="Browse articles by tag"><h2>Browse by tag</h2>${indexableTags(insights).map((t) => link(`/blog/tag/${t.slug}`, `#${t.name} (${t.count})`)).join(' ')}</nav>` : ''}
    <ul>${insights.map((a) => `<li>${a.cover_url ? `${img(a.cover_url, altText(a.cover_alt, `Cover image for the article: ${a.title}`), 1200, 630, 'loading="lazy" ')} ` : ''}${link(`/blog/${a.slug}`, a.title)}${a.excerpt ? ` — ${esc(a.excerpt)}` : ''}</li>`).join('')}</ul>
    <h2>What I write about</h2><p>How real projects get built: the decisions, the mistakes and the lessons, from educational platforms to college management systems. ${link('/projects', 'See the projects behind the writing')}.</p>`);

  add('/testimonials', `Testimonials — ${name}`, `What people say about working with ${name}. Only approved testimonials are shown.`, `
    <h1>In their words</h1><p>Only approved testimonials from real people appear here. ${link('/contact', 'Get in touch')} or ${link('/start-project', 'start a project')}.</p>
    <h2>Worked with me?</h2><p>If we have worked together, you can share your experience on this page. Every testimonial is reviewed before it is published, and nothing is shown without your consent. ${link('/projects', 'See the projects')} · ${link('/services', 'See the services')}.</p>`);
  add('/contact', `Contact — ${name}`, `Get in touch with ${name} about a project, a question or a quick session.`, `
    <h1>Let's talk</h1><p>A message, a project, or a quick session. ${link('/book', 'Book a Session')} · ${link('/start-project', 'Start a Project')}</p>
    <h2>Ways to reach me</h2><p>Send a message with the contact form, or use the email and social profiles listed on this page. For a new project, the project form asks the right questions so I can reply with something useful. ${link('/services', 'See what I build')} · ${link('/about', 'About me')}</p>`);
  add('/book', `Book a session — ${name}`, `Book a session with ${name}: choose a purpose, a date and a time that suits you.`, `
    <h1>Book a session</h1><p>Pick a purpose, a day and a time. Times are shown in your own timezone. ${link('/contact', 'Prefer to write? Contact me')}.</p>
    <h2>How booking works</h2><p>Choose the reason for the session, select an available slot and send your details. Requests are confirmed manually, and double bookings are prevented automatically. ${link('/start-project', 'Planning a project? Start with the project form')} · ${link('/services', 'Services')}</p>`);
  add('/start-project', `Start a project — ${name}`, `Tell ${name} about your project: the problem, the features you need, budget and timeline.`, `
    <h1>Start a project</h1><p>Tell me about the problem you want to solve. I read every inquiry personally. ${link('/services', 'See services')} · ${link('/projects', 'See the work')}</p>
    <h2>What to include</h2><p>Describe the project, the problem it should solve, the features you need, and your rough budget and timeline. You receive an inquiry reference after sending, and I reply by your preferred contact method. ${link('/book', 'Prefer to talk first? Book a Session')}</p>`);

  for (const p of projects) {
    const feats = (p.project_features || []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const blocks = [['The problem', p.problem], ['The idea', p.idea], ['The solution', p.solution], ['Challenges', p.challenges], ['Development process', p.process], ['What I learned', p.learned], ['Result', p.result]];
    add(`/projects/${p.slug}`, `${p.name} — ${name}`, p.short_description || `${p.name}, a project by ${name}.`, `
      <h1>${esc(p.name)}</h1><p>${esc(p.short_description)}</p>
      ${p.thumbnail_url ? img(p.thumbnail_url, altText(p.thumbnail_alt, `Screenshot of ${p.name}, ${p.category || 'web project'}`), 1200, 540, 'fetchpriority="high" ') : ''}
      <p>${[p.status, p.year, p.category].filter(Boolean).map(esc).join(' · ')}</p>
      ${p.role ? `<p><strong>My role:</strong> ${esc(p.role)}</p>` : ''}
      ${blocks.filter(([, t]) => t).map(([h, t]) => `<h2>${h}</h2>${paras(t)}`).join('')}
      ${feats.length ? `<h2>Key features</h2><ul>${feats.map((f) => `<li><strong>${esc(f.title)}</strong>${f.description ? ` — ${esc(f.description)}` : ''}</li>`).join('')}</ul>` : ''}
      <p>${link('/projects', 'All projects')} · ${link('/start-project', 'Start a Project')}</p>`,
    { type: 'article', kind: 'project', ld: { name: p.name, description: p.seo_description || p.short_description, image: p.thumbnail_url, year: p.year, keywords: Object.values(p.technologies || {}).flat().filter(Boolean).join(', ') }, image: p.og_image || p.thumbnail_url, record: { title: p.seo_title, description: p.seo_description, image: p.og_image, noindex: p.noindex } });
  }
  for (const a of insights) {
    add(`/blog/${a.slug}`, `${a.title} — ${name}`, a.excerpt || a.title, `
      <h1>${esc(a.title)}</h1>${a.excerpt ? `<p>${esc(a.excerpt)}</p>` : ''}
      ${a.cover_url ? img(a.cover_url, altText(a.cover_alt, `Cover image for the article: ${a.title}`), 1200, 630, 'fetchpriority="high" ') : ''}
      ${articleHtml(a.content)}
      ${(a.tags || []).length ? `<p>Tags: ${tagLinks(a.tags)}</p>` : ''}
      <p>${link('/blog', 'All blogs')} · ${link('/contact', 'Contact')}</p>`,
    { type: 'article', kind: 'article', article: { published: a.published_at, modified: a.updated_at, section: a.category, author: a.author, tags: a.tags }, keywords: (a.tags || []).join(', '), imageAlt: altText(a.cover_alt, `Cover image for the article: ${a.title}`),
      ld: { title: a.title, description: a.seo_description || a.excerpt, image: a.cover_url, datePublished: a.published_at, dateModified: a.updated_at, author: a.author, tags: a.tags, section: a.category, words: String(a.content || '').split(/\s+/).filter(Boolean).length, imageAlt: altText(a.cover_alt, `Cover image for the article: ${a.title}`) }, image: a.og_image || a.cover_url, record: { title: a.seo_title, description: a.seo_description, image: a.og_image, noindex: a.noindex } });
  }
  // Tag archives: one crawlable page per tag that groups at least MIN_TAG_POSTS articles (thin pages are skipped).
  for (const t of indexableTags(insights)) {
    add(`/blog/tag/${t.slug}`, `${t.name} articles — ${name}`, `${t.count} articles tagged ${t.name}: practical notes on building web projects, educational technology and lessons learned.`, `
      <h1>Articles tagged “${esc(t.name)}”</h1><p>${t.count} articles on this topic.</p>
      <ul>${t.posts.map((a) => `<li>${link(`/blog/${a.slug}`, a.title)}${a.excerpt ? ` — ${esc(a.excerpt)}` : ''}</li>`).join('')}</ul>
      <p>${link('/blog', 'All blogs')} · ${link('/projects', 'See the projects')}</p>`,
    { kind: 'tag', keywords: t.name, ld: { name: `${t.name} articles` } });
  }
  return { settings: s, pages };
}

const abs = (site, u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : `${site}${u.startsWith('/') ? '' : '/'}${u}`);

/** Insert head tags and the static body into the built index.html. */
export function renderHtml(template, page, s, site) {
  const url = `${site}${page.path === '/' ? '/' : page.path}`;
  const m = resolveSeo({ settings: s, path: page.path, description: page.description, image: page.image, imageAlt: page.imageAlt, keywords: page.keywords, record: page.record, prebuiltTitle: page.title });
  const art = page.article || null;
  const image = abs(site, m.image);
  const head = [
    `<meta name="description" content="${esc(m.description)}" />`,
    `<meta name="robots" content="${esc(m.robots)}" />`,
    m.keywords ? `<meta name="keywords" content="${esc(m.keywords)}" />` : '',
    m.verification.google ? `<meta name="google-site-verification" content="${esc(m.verification.google)}" />` : '',
    m.verification.bing ? `<meta name="msvalidate.01" content="${esc(m.verification.bing)}" />` : '',
    ...m.customMeta.map((c) => `<meta name="${esc(c.name)}" content="${esc(c.content)}" />`),
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:type" content="${page.type || 'website'}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:site_name" content="${esc(s.name)}" />`,
    `<meta property="og:locale" content="${esc(m.locale)}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : '',
    image ? `<meta property="og:image:alt" content="${esc(m.imageAlt)}" />` : '',
    m.author ? `<meta name="author" content="${esc(m.author)}" />` : '',
    ...(art ? [art.published && `<meta property="article:published_time" content="${esc(art.published)}" />`, art.modified && `<meta property="article:modified_time" content="${esc(art.modified)}" />`, art.section && `<meta property="article:section" content="${esc(art.section)}" />`, ...(art.tags || []).map((t) => `<meta property="article:tag" content="${esc(t)}" />`)] : []),
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    image ? `<meta name="twitter:image" content="${esc(image)}" />` : '',
    image ? `<meta name="twitter:image:alt" content="${esc(m.imageAlt)}" />` : '',
    m.twitterSite ? `<meta name="twitter:site" content="${esc(m.twitterSite)}" />` : '',
    `<script type="application/ld+json" id="ld-json">${ldToString(buildJsonLd({ settings: s, site, path: page.path, kind: page.kind || 'page', data: page.ld || {} }))}</script>`,
  ].filter(Boolean);
  // Home page: start downloading the hero portrait immediately (before any JavaScript runs) and open the connection to
  // the storage host early. This is the single biggest fix for a slow-appearing portrait.
  const hero = page.path === '/' ? absUrl(site, s.profileImage) : '';
  if (hero) {
    let origin = '';
    try { origin = new URL(hero).origin; } catch { /* relative URL */ }
    if (origin && origin !== site) head.unshift(`<link rel="preconnect" href="${esc(origin)}" crossorigin />`);
    head.push(`<link rel="preload" as="image" href="${esc(hero)}" fetchpriority="high" />`);
  }
  const headHtml = head.join('\n    ');
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(m.title)}</title>`)
    .replace(/<meta name="description"[^>]*>\s*/i, '')
    .replace('</head>', `    ${headHtml}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${shell(s, page.body)}</div>`);
}
