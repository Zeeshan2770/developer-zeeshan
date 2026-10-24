import { slugify } from '../lib/validate';
import { ORG_TYPES, RELATIONSHIPS } from '../lib/testimonials';

// Declarative CMS configuration. The generic <Resource> component renders list + editor from these.
// field types: text, textarea, number, select, checkbox, url, slug, image, tags (text[]), lines (jsonb string[]),
//              techgroups (jsonb object of string[]), mediaitems (jsonb [{type,url,caption}]), datetime, projectref
const TECH_KEYS = ['frontend', 'backend', 'database', 'auth', 'hosting', 'other'];

export const RESOURCES = {
  projects: {
    table: 'projects', title: 'Projects', singular: 'project', nameField: 'name',
    select: '*', order: [['sort_order', true], ['created_at', false]],
    columns: [['name', 'Name'], ['category', 'Category'], ['status', 'Status'], ['year', 'Year']],
    publishField: 'published', featureField: 'featured', reorderField: 'sort_order', imageKind: 'project', previewPath: '/projects/',
    children: { table: 'project_features', fk: 'project_id', label: 'Key features', fields: ['title', 'description'] },
    defaults: { status: 'In Progress', category: 'Web Development', published: false, featured: false, noindex: false, sort_order: 100, technologies: {}, media: [], sections: [] },
    groups: [
      ['Basics', [
        { k: 'name', label: 'Name', type: 'text', required: true },
        { k: 'slug', label: 'Slug', type: 'slug', from: 'name', required: true },
        { k: 'short_description', label: 'Short description', type: 'textarea', rows: 2 },
        { k: 'category', label: 'Category', type: 'select', options: ['Education', 'Web Development', 'Management Systems', 'Full-Stack', 'Digital Products', 'Other'] },
        { k: 'status', label: 'Status', type: 'select', options: ['Live', 'In Progress', 'Prototype', 'Concept', 'Archived'] },
        { k: 'year', label: 'Year', type: 'number' },
        { k: 'thumbnail_url', label: 'Thumbnail', type: 'image' },
        { k: 'thumbnail_alt', label: 'Thumbnail alt text (describe what the screenshot shows, ~8–15 words; helps accessibility and Google Images)', type: 'text' },
        { k: 'live_url', label: 'Live URL', type: 'url' },
        { k: 'github_url', label: 'GitHub URL', type: 'url' },
      ]],
      ['Case study', [
        { k: 'role', label: 'My role (what I actually contributed)', type: 'textarea', rows: 2 },
        { k: 'problem', label: 'The problem', type: 'textarea', rows: 4 },
        { k: 'idea', label: 'The idea', type: 'textarea', rows: 4 },
        { k: 'solution', label: 'The solution', type: 'textarea', rows: 4 },
        { k: 'challenges', label: 'Challenges', type: 'textarea', rows: 4 },
        { k: 'process', label: 'Development process', type: 'textarea', rows: 4 },
        { k: 'learned', label: 'What I learned', type: 'textarea', rows: 4 },
        { k: 'result', label: 'Result (genuine results only)', type: 'textarea', rows: 3 },
        { k: 'sections', label: 'Extra sections (shown after Result, in this order)', type: 'sections' },
      ]],
      ['Technology & media', [
        { k: 'technologies', label: 'Technologies (comma separated per group)', type: 'techgroups', keys: TECH_KEYS },
        { k: 'media', label: 'Media — one per line: url | caption | image or video  (clips: upload in Media, press “Copy project line”, paste here. The first video also plays on the project card.)', type: 'mediaitems' },
      ]],
      ['SEO (search & sharing)', [
        { k: 'seo_title', label: 'SEO title (leave empty to use the automatic one; ~50–60 characters)', type: 'text' },
        { k: 'seo_description', label: 'Meta description (leave empty to use the short text; ~120–155 characters)', type: 'textarea', rows: 2 },
        { k: 'og_image', label: 'Social sharing image (leave empty to use the cover)', type: 'image' },
        { k: 'noindex', label: 'Hide from search engines (noindex)', type: 'checkbox' },
      ]],
      ['Display', [
        { k: 'sort_order', label: 'Sort order (lower = first)', type: 'number' },
        { k: 'featured', label: 'Featured on homepage', type: 'checkbox' },
        { k: 'published', label: 'Published', type: 'checkbox' },
      ]],
    ],
  },

  services: {
    table: 'services', title: 'Services', singular: 'service', nameField: 'title',
    select: '*', order: [['sort_order', true]],
    columns: [['title', 'Title'], ['icon', 'Icon'], ['cta_label', 'CTA']],
    publishField: 'published', reorderField: 'sort_order',
    defaults: { published: true, sort_order: 100, icon: 'code', cta_label: 'Start a Project', cta_url: '/start-project', includes: [], workflow: [] },
    groups: [
      ['Service', [
        { k: 'title', label: 'Title', type: 'text', required: true },
        { k: 'slug', label: 'Slug', type: 'slug', from: 'title', required: true },
        { k: 'summary', label: 'Summary', type: 'textarea', rows: 2 },
        { k: 'what_it_is', label: 'What it is', type: 'textarea', rows: 3 },
        { k: 'who_for', label: 'Who it is for', type: 'textarea', rows: 3 },
        { k: 'includes', label: 'What is included (one per line)', type: 'lines' },
        { k: 'workflow', label: 'Typical workflow (one step per line)', type: 'lines' },
        { k: 'icon', label: 'Icon', type: 'select', options: ['globe', 'layers', 'book', 'workflow', 'puzzle', 'rocket', 'code'] },
        { k: 'cta_label', label: 'CTA label', type: 'text' },
        { k: 'cta_url', label: 'CTA link', type: 'text' },
        { k: 'sort_order', label: 'Sort order', type: 'number' },
        { k: 'published', label: 'Published', type: 'checkbox' },
      ]],
    ],
  },

  journey: {
    table: 'journey_entries', title: 'Journey', singular: 'milestone', nameField: 'title',
    select: '*', order: [['sort_order', true]],
    columns: [['title', 'Milestone'], ['period', 'When'], ['category', 'Category']],
    publishField: 'published', featureField: 'featured', reorderField: 'sort_order',
    defaults: { published: true, featured: false, sort_order: 100, category: 'Milestone' },
    groups: [
      ['Milestone', [
        { k: 'title', label: 'Title', type: 'text', required: true },
        { k: 'description', label: 'Description', type: 'textarea', rows: 3 },
        { k: 'period', label: 'Date / year (leave empty if unknown)', type: 'text' },
        { k: 'category', label: 'Category', type: 'text' },
        { k: 'sort_order', label: 'Sort order', type: 'number' },
        { k: 'featured', label: 'Featured', type: 'checkbox' },
        { k: 'published', label: 'Published', type: 'checkbox' },
      ]],
    ],
  },

  insights: {
    table: 'insights', title: 'Blogs', singular: 'blog post', nameField: 'title',
    select: '*', order: [['created_at', false]],
    columns: [['title', 'Title'], ['category', 'Category'], ['published_at', 'Published', 'date']],
    publishField: 'published', featureField: 'featured', imageKind: 'article', onPublish: 'published_at', previewPath: '/blog/',
    defaults: { published: false, featured: false, noindex: false, author: 'Muhammad Zeeshan Haider', tags: [], content: '' },
    groups: [
      ['Article', [
        { k: 'title', label: 'Title', type: 'text', required: true },
        { k: 'slug', label: 'Slug', type: 'slug', from: 'title', required: true },
        { k: 'excerpt', label: 'Excerpt', type: 'textarea', rows: 2 },
        { k: 'cover_url', label: 'Cover image', type: 'image' },
        { k: 'cover_alt', label: 'Cover image alt text (describe the picture, ~8–15 words; helps accessibility and Google Images)', type: 'text' },
        { k: 'content', label: 'Content (## heading, - list, **bold**, *italic*, `code`, [link](https://…), ![describe the image](https://image-url) on its own line, > quote, blank line = new paragraph)', type: 'textarea', rows: 16 },
        { k: 'category', label: 'Category', type: 'text' },
        { k: 'tags', label: 'Tags (comma separated, 3–6 per article; reuse the same tags so tag pages fill up. A tag page is indexed once 2 articles share it)', type: 'tags' },
        { k: 'author', label: 'Author', type: 'text' },
        { k: 'published_at', label: 'Publication date', type: 'datetime' },
        { k: 'reading_minutes', label: 'Reading time (minutes, auto if empty)', type: 'number' },
        { k: 'featured', label: 'Featured', type: 'checkbox' },
        { k: 'published', label: 'Published', type: 'checkbox' },
      ]],
      ['SEO (search & sharing)', [
        { k: 'seo_title', label: 'SEO title (leave empty to use the automatic one; ~50–60 characters)', type: 'text' },
        { k: 'seo_description', label: 'Meta description (leave empty to use the short text; ~120–155 characters)', type: 'textarea', rows: 2 },
        { k: 'og_image', label: 'Social sharing image (leave empty to use the cover)', type: 'image' },
        { k: 'noindex', label: 'Hide from search engines (noindex)', type: 'checkbox' },
      ]],
    ],
  },

  'payment-methods': {
    table: 'payment_methods', title: 'Payment Methods', singular: 'payment method', nameField: 'name',
    select: '*', order: [['sort_order', true]],
    columns: [['name', 'Method'], ['account_title', 'Account title'], ['account_number', 'Account / number']],
    publishField: 'enabled', publishLabel: 'Enabled', reorderField: 'sort_order',
    defaults: { enabled: false, sort_order: 100 },
    groups: [
      ['Payment method', [
        { k: 'name', label: 'Name (e.g. Easypaisa)', type: 'text', required: true },
        { k: 'slug', label: 'Slug', type: 'slug', from: 'name', required: true },
        { k: 'account_title', label: 'Account title (name on the account)', type: 'text' },
        { k: 'account_number', label: 'Account number / mobile number / IBAN / Raast ID', type: 'text' },
        { k: 'bank_name', label: 'Bank name (bank transfer only)', type: 'text' },
        { k: 'instructions', label: 'Instructions shown to the payer', type: 'textarea', rows: 3 },
        { k: 'sort_order', label: 'Sort order (lower = first)', type: 'number' },
        { k: 'enabled', label: 'Enabled (visible on the Pay page)', type: 'checkbox' },
      ]],
    ],
  },

  testimonials: {
    table: 'testimonials', title: 'Testimonials', singular: 'testimonial', nameField: 'name',
    select: '*', order: [['sort_order', true], ['created_at', false]],
    columns: [['name', 'Name'], ['organization', 'Organization'], ['relationship', 'Relationship'], ['rating', 'Rating']],
    publishField: 'published', featureField: 'featured', reorderField: 'sort_order', imageKind: 'testimonial',
    defaults: { published: false, featured: false, verified: false, sort_order: 100, relationship: '', organization_type: '' },
    groups: [
      ['Testimonial', [
        { k: 'name', label: 'Name', type: 'text', required: true },
        { k: 'role', label: 'Role', type: 'text' },
        { k: 'organization', label: 'Organization', type: 'text' },
        { k: 'message', label: 'Message', type: 'textarea', rows: 5, required: true },
        { k: 'photo_url', label: 'Photo', type: 'image' },
        { k: 'rating', label: 'Rating (1–5)', type: 'number', min: 1, max: 5 },
        { k: 'project_id', label: 'Related project', type: 'projectref' },
      ]],
      ['Community service details (shown publicly)', [
        { k: 'relationship', label: 'Relationship to the work', type: 'select', options: ['', ...RELATIONSHIPS] },
        { k: 'organization_type', label: 'Organisation type', type: 'select', options: ['', ...ORG_TYPES] },
        { k: 'location', label: 'Location (city / area, country)', type: 'text' },
        { k: 'program', label: 'Service or programme involved', type: 'text' },
        { k: 'period', label: 'When (e.g. 2025 or Jan–Jun 2025)', type: 'text' },
        { k: 'impact', label: 'Impact — one line on what changed (max 300 characters)', type: 'textarea', rows: 2 },
        { k: 'website_url', label: 'Organisation website', type: 'url' },
        { k: 'verified', label: 'Verified (shows a “Verified” badge — tick only after you have checked with them)', type: 'checkbox' },
      ]],
      ['Private notes (never shown on the site)', [
        { k: 'submitted_name', label: 'Real name as submitted (the public name above may be shortened or “Anonymous”)', type: 'text' },
        { k: 'contact_email', label: 'Contact email (for verification only)', type: 'text' },
        { k: 'verification_note', label: 'Verification notes (how / when you confirmed it)', type: 'textarea', rows: 2 },
      ]],
      ['Display', [
        { k: 'sort_order', label: 'Sort order', type: 'number' },
        { k: 'featured', label: 'Featured', type: 'checkbox' },
        { k: 'published', label: 'Approved & published', type: 'checkbox' },
      ]],
    ],
  },
};

// ---- value <-> form conversions ----
export const toForm = (cfg, row) => {
  const f = { ...row };
  cfg.groups.flatMap(([, fs]) => fs).forEach((fd) => {
    const v = row[fd.k];
    if (fd.type === 'tags') f[fd.k] = (v || []).join(', ');
    else if (fd.type === 'lines') f[fd.k] = (v || []).join('\n');
    else if (fd.type === 'techgroups') f[fd.k] = Object.fromEntries(fd.keys.map((k) => [k, ((v || {})[k] || []).join(', ')]));
    else if (fd.type === 'mediaitems') f[fd.k] = (v || []).map((m) => `${m.url} | ${m.caption || ''} | ${m.type || 'image'}`).join('\n');
    else if (fd.type === 'sections') f[fd.k] = Array.isArray(v) ? v.map((x) => ({ title: x.title || '', body: x.body || '' })) : [];
    else if (fd.type === 'datetime') f[fd.k] = v ? new Date(v).toISOString().slice(0, 16) : '';
    else if (v == null) f[fd.k] = fd.type === 'checkbox' ? false : '';
  });
  return f;
};

const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

export const fromForm = (cfg, form) => {
  const out = {};
  cfg.groups.flatMap(([, fs]) => fs).forEach((fd) => {
    const v = form[fd.k];
    switch (fd.type) {
      case 'tags': out[fd.k] = csv(v); break;
      case 'lines': out[fd.k] = lines(v); break;
      case 'techgroups': out[fd.k] = Object.fromEntries(fd.keys.map((k) => [k, csv(v?.[k])]).filter(([, a]) => a.length)); break;
      case 'mediaitems':
        out[fd.k] = lines(v).map((l) => {
          const [url, caption = '', type = 'image'] = l.split('|').map((x) => x.trim());
          return { url, caption, type: type === 'video' ? 'video' : 'image' };
        }).filter((m) => m.url);
        break;
      case 'sections':
        out[fd.k] = (Array.isArray(v) ? v : []).map((x) => ({ title: String(x.title || '').trim().slice(0, 120), body: String(x.body || '').trim().slice(0, 5000) }))
          .filter((x) => x.title && x.body).slice(0, 20);
        break;
      case 'number': out[fd.k] = v === '' || v == null ? null : Number(v); break;
      case 'datetime': out[fd.k] = v ? new Date(v).toISOString() : null; break;
      case 'checkbox': out[fd.k] = Boolean(v); break;
      case 'slug': out[fd.k] = slugify(v); break;
      case 'projectref': out[fd.k] = v || null; break;
      case 'url': case 'image': out[fd.k] = typeof v === 'string' && v.trim() ? v.trim() : null; break;
      // Plain text keeps '' (several columns are NOT NULL); nullable columns accept '' too.
      default: out[fd.k] = typeof v === 'string' ? v.trim() : v ?? '';
    }
  });
  return out;
};
