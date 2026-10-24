import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPages, renderHtml } from '../scripts/prerender-lib.mjs';
import { injectMeta } from '../netlify/edge-functions/og.js';

const TEMPLATE = '<!doctype html><html lang="en"><head><title>x</title><meta name="description" content="x" /></head><body><div id="root"></div></body></html>';
const data = {
  projects: [{ slug: 'cs-compass', name: 'CS <Compass>', short_description: 'A "portal"', status: 'Live', year: 2026, category: 'Education', featured: true,
    problem: 'P1\n\nP2', solution: 'S', project_features: [{ title: 'Labs', description: 'd', sort_order: 2 }, { title: 'Exams', description: '', sort_order: 1 }], thumbnail_url: '/assets/a.webp' }],
  services: [{ title: 'Web', summary: 'Sites', what_it_is: 'w', who_for: 'f', includes: ['a', 'b'] }],
  journey: [{ title: 'Start', description: 'began', period: '' }],
  insights: [{ slug: 'post', title: 'A post', excerpt: 'ex', content: '## Head\n\nText\n\n- a\n- b' }],
};
const { settings, pages } = buildPages({ name: 'Zeeshan Haider', email: 'a@b.c' }, data);

test('every public route is prerendered, including each project and article', () => {
  const paths = pages.map((p) => p.path);
  for (const r of ['/', '/about', '/projects', '/services', '/experience', '/blog', '/testimonials', '/contact', '/book', '/start-project', '/projects/cs-compass', '/blog/post']) assert.ok(paths.includes(r), `missing ${r}`);
});

test('each page has exactly one h1, a short title, a description, headings and internal links (what crawlers check)', () => {
  for (const p of pages) {
    const html = renderHtml(TEMPLATE, p, settings, 'https://example.com');
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${p.path}: h1 count`);
    assert.ok(p.title.length <= 60, `${p.path}: title too long (${p.title.length})`);
    assert.ok(p.description.length >= 40 && p.description.length <= 160, `${p.path}: description length ${p.description.length}`);
    assert.ok((html.match(/<a href="\//g) || []).length >= 8, `${p.path}: too few internal links`);
    assert.match(html, /<html lang="en">/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://example.com${p.path === '/' ? '/' : p.path}" />`));
    assert.equal((html.match(/<title>/g) || []).length, 1);
    assert.equal((html.match(/name="description"/g) || []).length, 1);
    assert.ok(html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length > 35, `${p.path}: too little text`);
  }
});

test('home page is the name + positioning and has substantive headings', () => {
  const home = renderHtml(TEMPLATE, pages.find((p) => p.path === '/'), settings, 'https://example.com');
  assert.match(home, /<h1>Zeeshan Haider<\/h1>/);
  assert.match(home, /<h2>Selected work<\/h2>/);
  assert.match(home, /application\/ld\+json/);
});

test('content is escaped (no HTML injection from database text) and project sections are rendered in order', () => {
  const html = renderHtml(TEMPLATE, pages.find((p) => p.path === '/projects/cs-compass'), settings, 'https://example.com');
  assert.ok(!html.includes('<Compass>'));
  assert.match(html, /CS &lt;Compass&gt;/);
  assert.ok(html.indexOf('Exams') < html.indexOf('Labs'), 'features sorted by sort_order');
  assert.match(html, /<h2>The problem<\/h2><p>P1<\/p><p>P2<\/p>/);
  assert.match(html, /og:image" content="https:\/\/example\.com\/assets\/a\.webp"/);
  const art = renderHtml(TEMPLATE, pages.find((p) => p.path === '/blog/post'), settings, 'https://example.com');
  assert.match(art, /<h2>Head<\/h2><p>Text<\/p><ul><li>a<\/li><li>b<\/li><\/ul>/);
});

test('edge-function share-preview injection does not duplicate tags already prerendered', () => {
  const pre = renderHtml(TEMPLATE, pages.find((p) => p.path === '/projects/cs-compass'), settings, 'https://example.com');
  const out = injectMeta(pre, { title: 'T', description: 'D', url: 'https://example.com/projects/cs-compass', image: 'https://example.com/i.png' });
  assert.equal((out.match(/rel="canonical"/g) || []).length, 1);
  assert.equal((out.match(/property="og:title"/g) || []).length, 1);
  assert.equal((out.match(/name="description"/g) || []).length, 1);
  assert.equal((out.match(/twitter:card/g) || []).length, 1);
});

test('prerender honours SEO overrides, verification tags, noindex and sameAs', () => {
  const settings = { seo: { defaultDescription: 'Default description that is long enough to be a sensible meta description for tests.', keywords: 'dev, web', googleVerification: 'gv1', twitterHandle: '@me', pages: { '/about': { title: 'Custom About Title', noindex: true } } }, social: { github: 'https://github.com/x' } };
  const { settings: s, pages } = buildPages(settings, { projects: [{ id: 1, slug: 'p1', name: 'P1', short_description: 'A project description long enough to pass the minimum length rule for descriptions.', published: true, seo_title: 'Rec Title', og_image: '/o.webp', noindex: true, project_features: [] }] });
  const template = '<html><head><title>x</title><meta name="description" content="d" /></head><body><div id="root"></div></body></html>';
  const about = renderHtml(template, pages.find((p) => p.path === '/about'), s, 'https://e.com');
  assert.match(about, /<title>Custom About Title<\/title>/);
  assert.match(about, /name="robots" content="noindex, nofollow"/);
  assert.match(about, /google-site-verification" content="gv1"/);
  assert.match(about, /name="keywords" content="dev, web"/);
  assert.match(about, /twitter:site" content="@me"/);
  const proj = renderHtml(template, pages.find((p) => p.path === '/projects/p1'), s, 'https://e.com');
  assert.match(proj, /<title>Rec Title<\/title>/);
  assert.match(proj, /og:image" content="https:\/\/e.com\/o.webp"/);
  assert.match(proj, /noindex/);
  const home = renderHtml(template, pages.find((p) => p.path === '/'), s, 'https://e.com');
  assert.match(home, /"sameAs":\["https:\/\/github.com\/x"\]/);
  assert.match(home, /index, follow/);
});

// ---------- structured data (JSON-LD) ----------
import { buildJsonLd, ldToString } from '../src/lib/jsonld.js';
const ldOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<'));
const types = (ld) => ld['@graph'].map((n) => n['@type']);

test('every prerendered page carries one valid JSON-LD graph with Person, WebSite', () => {
  for (const p of pages) {
    const html = renderHtml(TEMPLATE, p, settings, 'https://example.com');
    assert.equal((html.match(/application\/ld\+json/g) || []).length, 1, `${p.path}: one ld+json`);
    const t = types(ldOf(html));
    assert.ok(t.includes('Person') && t.includes('WebSite'), `${p.path}: ${t}`);
    assert.equal(t.includes('BreadcrumbList'), p.path !== '/', `${p.path}: breadcrumbs`);
  }
});

test('articles become BlogPosting and projects CreativeWork, with a Home > section > page trail', () => {
  const art = ldOf(renderHtml(TEMPLATE, pages.find((p) => p.path === '/blog/post'), settings, 'https://example.com'));
  assert.ok(types(art).includes('BlogPosting'));
  const crumbs = art['@graph'].find((n) => n['@type'] === 'BreadcrumbList').itemListElement.map((c) => c.name);
  assert.deepEqual(crumbs, ['Home', 'Blogs', 'A post']);
  const proj = ldOf(renderHtml(TEMPLATE, pages.find((p) => p.path === '/projects/cs-compass'), settings, 'https://example.com'));
  assert.ok(types(proj).includes('CreativeWork'));
  assert.equal(proj['@graph'].find((n) => n['@type'] === 'CreativeWork').image, 'https://example.com/assets/a.webp');
});

test('JSON-LD never invents data and cannot break out of the script tag', () => {
  const ld = buildJsonLd({ settings: { name: '</script><b>x', social: { github: 'https://github.com/x', extra: [] } }, site: 'https://example.com', path: '/', kind: 'page' });
  const s = ldToString(ld);
  assert.ok(!s.includes('</script>'));
  assert.ok(!/aggregateRating|review|offers|price/i.test(s));
  assert.deepEqual(ld['@graph'].find((n) => n['@type'] === 'Person').sameAs, ['https://github.com/x']);
});

// ---------- phase 11: alt text, tags, image preload ----------
import { collectTags, indexableTags, tagSlug } from '../src/lib/tags.js';
import { auditSeo } from '../src/lib/seoAudit.js';
import { articleHtml, inline } from '../scripts/prerender-lib.mjs';

const P11 = buildPages(
  { name: 'Zeeshan', title: 'Developer', profileImage: 'https://abc.supabase.co/storage/v1/object/public/media/profile/me.webp', profileImageAlt: 'Zeeshan in a dark jacket' },
  {
    projects: [{ slug: 'p', name: 'P', category: 'Education', short_description: 'A project description that is long enough to pass.', thumbnail_url: '/projects/p.webp', thumbnail_alt: 'The P dashboard', project_features: [], technologies: { frontend: ['React'], backend: ['Supabase'] } }],
    insights: [
      { slug: 'a', title: 'A', excerpt: 'First article excerpt that is long enough.', cover_url: '/c.webp', tags: ['React', 'SEO'], category: 'Dev', published_at: '2026-10-01T00:00:00Z', content: 'Intro with **bold** and [link](/projects).\n\n1. one\n2. two\n\n![A diagram of the flow](/d.webp)' },
      { slug: 'b', title: 'B', excerpt: 'Second article excerpt that is long enough.', tags: ['react'], content: 'Body' },
      { slug: 'c', title: 'C', excerpt: 'Third article excerpt that is long enough.', tags: ['Solo'], content: 'Body' },
    ],
  },
);
const pg = (p) => P11.pages.find((x) => x.path === p);
const html11 = (p, site = 'https://example.com') => renderHtml(TEMPLATE, pg(p), P11.settings, site);

test('images in prerendered HTML always carry alt text and dimensions', () => {
  for (const p of P11.pages) {
    const html = html11(p.path);
    const imgs = html.match(/<img [^>]*>/g) || [];
    for (const tag of imgs) {
      assert.match(tag, /alt="[^"]+"/, `${p.path}: ${tag}`);
      assert.match(tag, /width="\d+" height="\d+"/, `${p.path}: ${tag}`);
    }
  }
  assert.match(html11('/'), /alt="Zeeshan in a dark jacket"/);
  assert.match(html11('/projects/p'), /alt="The P dashboard"/);
  assert.match(html11('/blog/a'), /alt="Cover image for the article: A"/);
  assert.match(html11('/blog/a'), /alt="A diagram of the flow"/);
});

test('home page preloads the hero portrait and opens the storage connection early', () => {
  const home = html11('/');
  assert.match(home, /<link rel="preload" as="image" href="https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/media\/profile\/me\.webp" fetchpriority="high" \/>/);
  assert.match(home, /<link rel="preconnect" href="https:\/\/abc\.supabase\.co" crossorigin \/>/);
  assert.ok(!/rel="preload" as="image"/.test(html11('/about')), 'only the home page preloads the portrait');
});

test('tags: slugs, case-insensitive grouping and the 2-article rule for tag pages', () => {
  assert.equal(tagSlug('Web Development!'), 'web-development');
  const tags = collectTags([{ tags: ['React', 'SEO'] }, { tags: ['react'] }, { tags: ['Solo', 'Solo'] }]);
  assert.deepEqual(tags.map((t) => [t.slug, t.count]), [['react', 2], ['seo', 1], ['solo', 1]]);
  assert.deepEqual(indexableTags([{ tags: ['React'] }, { tags: ['react'] }, { tags: ['x'] }]).map((t) => t.slug), ['react']);
  assert.ok(pg('/blog/tag/react'), 'a tag with 2 articles gets a prerendered page');
  assert.ok(!pg('/blog/tag/solo') && !pg('/blog/tag/seo'), 'one-article tags do not');
  const tagHtml = html11('/blog/tag/react');
  assert.match(tagHtml, /<h1>Articles tagged “React”<\/h1>/);
  assert.match(tagHtml, /href="\/blog\/a"/); assert.match(tagHtml, /href="\/blog\/b"/);
  assert.match(html11('/blog'), /href="\/blog\/tag\/react"/);
  assert.match(html11('/blog/a'), /href="\/blog\/tag\/seo"/);
});

test('articles get article:* meta, per-tag keywords and richer BlogPosting data', () => {
  const html = html11('/blog/a');
  assert.match(html, /property="article:published_time" content="2026-10-01T00:00:00Z"/);
  assert.match(html, /property="article:tag" content="React"/);
  assert.match(html, /property="article:tag" content="SEO"/);
  assert.match(html, /name="keywords" content="React, SEO"/);
  assert.match(html, /name="author" content="Zeeshan"/);
  assert.match(html, /property="og:image:alt" content="Cover image for the article: A"/);
  const post = ldOf(html)['@graph'].find((n) => n['@type'] === 'BlogPosting');
  assert.equal(post.keywords, 'React, SEO');
  assert.equal(post.articleSection, 'Dev');
  assert.equal(post.image['@type'], 'ImageObject');
  assert.ok(post.wordCount > 3);
  const tagLd = ldOf(html11('/blog/tag/react'))['@graph'];
  assert.deepEqual(tagLd.find((n) => n['@type'] === 'BreadcrumbList').itemListElement.map((c) => c.name), ['Home', 'Blogs', 'React articles']);
});

test('article markdown is rendered as HTML for crawlers (not raw ** and []() characters)', () => {
  const h = articleHtml('Intro with **bold** and [link](/projects) and [bad](javascript:alert(1)).\n\n1. one\n2. two\n\n> quoted\n\n```\n<b>code</b>\n```');
  assert.match(h, /<strong>bold<\/strong>/);
  assert.match(h, /<a href="\/projects">link<\/a>/);
  assert.ok(!h.includes('javascript:'));
  assert.match(h, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(h, /<blockquote>quoted<\/blockquote>/);
  assert.match(h, /<pre><code>&lt;b&gt;code&lt;\/b&gt;<\/code><\/pre>/);
  assert.equal(inline('<script>'), '&lt;script&gt;');
});

test('SEO health check: a bare site scores low, a complete one scores high, and gaps are named', () => {
  const bare = auditSeo({ name: 'Z', title: 'Dev', seo: {} }, {}, {});
  const full = auditSeo({
    name: 'Muhammad Zeeshan Haider', title: 'Web Developer', profileImage: '/p.webp', profileImageAlt: 'Portrait of a web developer in a dark jacket',
    social: { github: 'https://github.com/x', linkedin: 'https://linkedin.com/in/x' },
    seo: { defaultDescription: 'Muhammad Zeeshan Haider builds websites, full-stack apps and educational platforms that solve real problems for people.', ogImage: '/og.png', ogImageAlt: 'Muhammad Zeeshan Haider, web developer', googleVerification: 'g', bingVerification: 'b', knowsAbout: 'React, Supabase, SEO, Education', keywords: 'a, b, c, d, e, f, g, h, i', pages: { '/': { title: 'Muhammad Zeeshan Haider | Web Developer' } } },
  }, {
    articles: ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => ({ title: x, excerpt: 'x'.repeat(90), cover_url: '/c.webp', cover_alt: 'A described cover image', tags: ['React', 'SEO'] })),
    projects: [{ name: 'P', short_description: 'x'.repeat(90), thumbnail_url: '/t.webp', thumbnail_alt: 'A described thumbnail' }],
  }, { siteUrl: 'https://z.dev' });
  assert.ok(bare.score < 45, `bare ${bare.score}`);
  assert.ok(full.score >= 95, `full ${full.score}: ${full.checks.filter((c) => c.level !== 'ok').map((c) => c.label)}`);
  assert.ok(bare.checks.some((c) => c.level === 'bad' && /alt text/.test(c.label)));
  const missingAlt = auditSeo({ seo: {} }, { articles: [{ title: 'No alt', cover_url: '/c.webp', tags: [] }] }, {});
  assert.ok(missingAlt.checks.some((c) => /cover\(s\) have no custom alt/.test(c.label)));
});
