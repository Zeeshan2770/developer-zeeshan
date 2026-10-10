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

export const getProjects = () =>
  run(
    supabase?.from('projects').select(PROJECT_CARD_FIELDS).eq('published', true)
      .order('featured', { ascending: false }).order('sort_order', { ascending: true }),
  );

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

export const getInsights = () =>
  run(
    supabase?.from('insights')
      .select('id,slug,title,excerpt,cover_url,category,tags,published_at,reading_minutes,featured')
      .eq('published', true).order('published_at', { ascending: false }),
  );

export const getInsightBySlug = async (slug, preview = false) => {
  if (!isConfigured) return { data: null, error: null };
  let q = supabase.from('insights').select('*').eq('slug', slug);
  if (!preview) q = q.eq('published', true);
  return q.maybeSingle();
};

export const getTestimonials = () =>
  run(
    supabase?.from('testimonials')
      .select('id,name,role,organization,message,photo_url,rating,featured,projects(name,slug)')
      .eq('published', true).order('featured', { ascending: false }).order('sort_order'),
  );

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
export const submitInquiry = async (payload) => {
  if (!isConfigured) return { error: new Error('not_configured') };
  const { data, error } = await supabase.rpc('submit_project_inquiry', { payload });
  if (!error) track('inquiry_submitted', '/start-project');
  return { data, error };
};

export const submitMessage = async (payload) => {
  if (!isConfigured) return { error: new Error('not_configured') };
  const { error } = await supabase.rpc('submit_contact_message', { payload });
  if (!error) track('contact_submitted', '/contact');
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
