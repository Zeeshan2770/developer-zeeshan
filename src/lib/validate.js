// Client-side validation & sanitization. The database RPCs re-validate everything;
// this layer exists for fast feedback, never as the only line of defence.

export const clean = (v, max = 500) =>
  String(v ?? '')
    // strip control chars, keep newlines/tabs
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/<[^>]*>/g, '') // drop any HTML tags
    .trim()
    .slice(0, max);

export const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim());

export const isPhone = (v) => !v || /^[+()\d\s-]{6,25}$/.test(String(v).trim());

export const isUrlish = (v) => !v || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(String(v).trim());

export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Only allow http(s) links from database content to be rendered as hrefs.
export const safeUrl = (u) => {
  if (!u) return null;
  try {
    const parsed = new URL(u, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

// Extra social profiles from settings: [{label,url}] -> only entries with a safe http(s) URL.
export const socialLinks = (social) => {
  const out = [];
  if (safeUrl(social?.github)) out.push({ label: 'GitHub', url: safeUrl(social.github) });
  if (safeUrl(social?.linkedin)) out.push({ label: 'LinkedIn', url: safeUrl(social.linkedin) });
  (Array.isArray(social?.extra) ? social.extra : []).forEach((e) => {
    const url = safeUrl(e?.url); const label = String(e?.label || '').trim().slice(0, 40);
    if (url && label) out.push({ label, url });
  });
  return out;
};
