import { supabase, isConfigured } from './supabase';

// Every read returns { data, error }. When Supabase is not configured, reads return empty data
// so the site still renders (useful during first setup).
const empty = (data = []) => Promise.resolve({ data, error: null });
const run = async (q, fallback = []) => {
  if (!isConfigured) return empty(fallback);
  const { data, error } = await q;
  return { data: data ?? fallback, error };
};

export const getSettings = async () => {
  if (!isConfigured) return { data: null };
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'site').maybeSingle();
  return { data: data?.value ?? null };
};

const PROJECT_CARD_FIELDS =
  'id,slug,name,short_description,category,status,year,thumbnail_url,technologies,featured,sort_order,live_url,media';

// thumbnail_alt exists after phase11_seo_images_tags.sql; until then the older columns are used.
export const getProjects = async () => {
  if (!isConfigured) return empty([]);
  const q = (cols) => supabase.from('projects').select(cols).eq('published', true)
    .order('featured', { ascending: false }).order('sort_order', { ascending: true });
  const first = await q(`${PROJECT_CARD_FIELDS},thumbnail_alt`);
  if (!first.error) return { data: first.data ?? [], error: null };
  return run(q(PROJECT_CARD_FIELDS));
};

// `preview` omits the published filter. It is safe to expose: row-level security only returns drafts to a signed-in admin,
// so for everyone else a preview request simply finds nothing.
export const getProjectBySlug = async (slug, preview = false) => {
  if (!isConfigured) return { data: null, error: null };
  let q = supabase.from('projects').select('*, project_features(id,title,description,sort_order)').eq('slug', slug);
  if (!preview) q = q.eq('published', true);
  const { data, error } = await q.maybeSingle();
  if (data?.project_features) data.project_features.sort((a, b) => a.sort_order - b.sort_order);
  return { data, error };
};

export const bumpProjectView = (slug) => {
  if (isConfigured) supabase.rpc('increment_project_view', { p_slug: slug }).then(() => {}, () => {});
};

export const getServices = () =>
  run(supabase?.from('services').select('*').eq('published', true).order('sort_order'));

export const getJourney = () =>
  run(supabase?.from('journey_entries').select('*').eq('published', true).order('sort_order'));

// cover_alt exists after phase11_seo_images_tags.sql; until then the list falls back to the older columns.
const INSIGHT_LIST = 'id,slug,title,excerpt,cover_url,category,tags,published_at,reading_minutes,featured';
export const getInsights = async () => {
  if (!isConfigured) return empty([]);
  const q = (cols) => supabase.from('insights').select(cols).eq('published', true).order('published_at', { ascending: false });
  const first = await q(`${INSIGHT_LIST},cover_alt`);
  if (!first.error) return { data: first.data ?? [], error: null };
  return run(q(INSIGHT_LIST));
};

export const getInsightBySlug = async (slug, preview = false) => {
  if (!isConfigured) return { data: null, error: null };
  let q = supabase.from('insights').select('*').eq('slug', slug);
  if (!preview) q = q.eq('published', true);
  return q.maybeSingle();
};

// Testimonials must never disappear from the site. The first query asks for the community-service columns
// (phase 10). If the database does not have them yet (phase10_testimonials.sql not run) or the request fails
// for any reason, fall back to the original columns so approved testimonials still show.
const TESTI_BASE = 'id,name,role,organization,message,photo_url,rating,featured,projects(name,slug)';
const TESTI_FULL = 'id,name,role,organization,message,photo_url,rating,featured,relationship,organization_type,location,program,period,impact,website_url,verified,projects(name,slug)';
const testiQuery = (cols) =>
  supabase.from('testimonials').select(cols).eq('published', true).order('featured', { ascending: false }).order('sort_order');

export const getTestimonials = async () => {
  if (!isConfigured) return empty();
  let res = await testiQuery(TESTI_FULL);
  if (res.error) res = await testiQuery(TESTI_BASE);
  if (res.error) res = await supabase.from('testimonials').select('id,name,role,organization,message,photo_url,rating,featured')
    .eq('published', true).order('featured', { ascending: false }).order('sort_order');
  return { data: res.data ?? [], error: res.error };
};

export const getCounts = async () => {
  if (!isConfigured) return null;
  const [all, live, cats] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('published', true),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('published', true).eq('status', 'Live'),
    supabase.from('projects').select('category').eq('published', true),
  ]);
  return {
    projects: all.count ?? 0,
    live: live.count ?? 0,
    categories: new Set((cats.data || []).map((c) => c.category)).size,
  };
};

// ---- writes (go through SECURITY DEFINER RPCs; no direct table access for visitors) ----
// Tell the server a submission was stored so it can send the owner alert + visitor auto-reply (Netlify function; silent if email is not set up).
export const notifyEmail = (kind, ref) => {
  try {
    if (!ref || ref === 'INQ-0000' || ref === 'BK-0000' || typeof fetch !== 'function') return;
    fetch('/.netlify/functions/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ref }), keepalive: true }).catch(() => {});
  } catch { /* never block the visitor */ }
};

export const submitInquiry = async (payload) => {
  if (!isConfigured) return { error: new Error('not_configured') };
  const { data, error } = await supabase.rpc('submit_project_inquiry', { payload });
  if (!error) { track('inquiry_submitted', '/start-project'); notifyEmail('inquiry', data); }
  return { data, error };
};

export const submitMessage = async (payload) => {
  if (!isConfigured) return { error: new Error('not_configured') };
  const { error } = await supabase.rpc('submit_contact_message', { payload });
  if (!error) { track('contact_submitted', '/contact'); notifyEmail('message', payload?.email); }
  return { error };
};

export const submitTestimonial = async (payload) => {
  if (!isConfigured) return { error: new Error('not_configured') };
  const { error } = await supabase.rpc('submit_testimonial', { payload });
  return { error };
};

// ---- manual payments ----
// Only enabled methods are visible to visitors (row-level security). Account details are shown on purpose:
// the payer needs them to send the money.
export const getPaymentMethods = () =>
  run(supabase?.from('payment_methods').select('id,slug,name,account_title,account_number,bank_name,instructions').eq('enabled', true).order('sort_order'));

export const submitPayment = async (payload) => {
  if (!isConfigured) return { error: new Error('not_configured') };
  const { data, error } = await supabase.rpc('submit_payment', { payload });
  return { data, error };
};

// Privacy-light analytics: event name + path only. No IP, no user id, no cookies.
export const track = (event, path, ref) => {
  if (!isConfigured) return;
  supabase.from('analytics_events')
    .insert({ event, path: String(path || '').slice(0, 200), ref: ref ? String(ref).slice(0, 200) : null })
    .then(() => {}, () => {});
};
