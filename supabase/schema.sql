-- ============================================================================
-- Zeeshan HQ — Supabase schema (Phase 1)
-- Run in: Supabase Dashboard > SQL Editor. Safe to re-run (idempotent where possible).
-- Principles: public can only READ published content and SUBMIT via RPC;
-- everything else requires an authenticated user whose profile.role = 'super_admin'.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- helpers ---------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.slugify(txt text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(txt,'')), '[^a-z0-9]+', '-', 'g'))
$$;

-- ---------- profiles & roles ------------------------------------------------
-- Roles are a text column so Content Manager / Assistant / Project Manager can be added later.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'none'
    check (role in ('none','super_admin','content_manager','assistant','project_manager')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- New signups get role 'none' (no access). Promote yourself manually (see README).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
$$;

-- Users may read their own profile but can never change their own role.
alter table public.profiles enable row level security;
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- ---------- site settings (key/value jsonb) ---------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_settings_updated on public.site_settings;
create trigger trg_settings_updated before update on public.site_settings
  for each row execute function public.set_updated_at();
alter table public.site_settings enable row level security;
drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings for select using (true);
drop policy if exists "settings admin write" on public.site_settings;
create policy "settings admin write" on public.site_settings for all using (public.is_admin()) with check (public.is_admin());
-- NOTE: site_settings is public. Never store secrets in it.

-- ---------- projects --------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  short_description text not null default '',
  category text not null default 'Other',
  status text not null default 'In Progress'
    check (status in ('Live','In Progress','Prototype','Archived','Concept')),
  year int check (year between 2000 and 2100),
  thumbnail_url text,
  live_url text,
  github_url text,
  -- Technology grouped by role, e.g. {"frontend":["React"],"backend":[],"database":["Postgres"],"auth":[],"hosting":[],"other":[]}
  technologies jsonb not null default '{}'::jsonb,
  role text,
  problem text,
  idea text,
  solution text,
  challenges text,
  process text,
  learned text,
  result text,           -- only genuine, verifiable results
  media jsonb not null default '[]'::jsonb,   -- [{"type":"image|video|diagram","url":"","caption":""}]
  featured boolean not null default false,
  published boolean not null default false,
  sort_order int not null default 100,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_pub on public.projects (published, featured desc, sort_order);
drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated before update on public.projects
  for each row execute function public.set_updated_at();

create table if not exists public.project_features (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  sort_order int not null default 100
);
create index if not exists idx_project_features_project on public.project_features (project_id, sort_order);

alter table public.projects enable row level security;
alter table public.project_features enable row level security;
drop policy if exists "projects public read" on public.projects;
create policy "projects public read" on public.projects for select using (published or public.is_admin());
drop policy if exists "projects admin write" on public.projects;
create policy "projects admin write" on public.projects for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "features public read" on public.project_features;
create policy "features public read" on public.project_features for select
  using (exists (select 1 from public.projects p where p.id = project_id and (p.published or public.is_admin())));
drop policy if exists "features admin write" on public.project_features;
create policy "features admin write" on public.project_features for all using (public.is_admin()) with check (public.is_admin());

-- Anonymous view counter (increments only; no personal data).
create or replace function public.increment_project_view(p_slug text) returns void
language sql security definer set search_path = public as $$
  update public.projects set view_count = view_count + 1 where slug = p_slug and published;
$$;
grant execute on function public.increment_project_view(text) to anon, authenticated;

-- ---------- services --------------------------------------------------------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null default '',
  what_it_is text,
  who_for text,
  includes jsonb not null default '[]'::jsonb,    -- ["item", ...]
  workflow jsonb not null default '[]'::jsonb,    -- ["step", ...]
  icon text default 'code',
  cta_label text default 'Start a Project',
  cta_url text default '/start-project',
  published boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_services_updated on public.services;
create trigger trg_services_updated before update on public.services
  for each row execute function public.set_updated_at();
alter table public.services enable row level security;
drop policy if exists "services public read" on public.services;
create policy "services public read" on public.services for select using (published or public.is_admin());
drop policy if exists "services admin write" on public.services;
create policy "services admin write" on public.services for all using (public.is_admin()) with check (public.is_admin());

-- ---------- journey ---------------------------------------------------------
create table if not exists public.journey_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  period text,                 -- free text so dates are shown ONLY when known (e.g. "2024")
  category text default 'Milestone',
  featured boolean not null default false,
  published boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_journey_updated on public.journey_entries;
create trigger trg_journey_updated before update on public.journey_entries
  for each row execute function public.set_updated_at();
alter table public.journey_entries enable row level security;
drop policy if exists "journey public read" on public.journey_entries;
create policy "journey public read" on public.journey_entries for select using (published or public.is_admin());
drop policy if exists "journey admin write" on public.journey_entries;
create policy "journey admin write" on public.journey_entries for all using (public.is_admin()) with check (public.is_admin());

-- ---------- insights (blog) -------------------------------------------------
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  excerpt text,
  cover_url text,
  content text not null default '',   -- Markdown-lite (paragraphs, ## headings, - lists)
  category text,
  tags text[] not null default '{}',
  author text not null default 'Muhammad Zeeshan Haider',
  published_at timestamptz,
  reading_minutes int,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_insights_pub on public.insights (published, published_at desc);
drop trigger if exists trg_insights_updated on public.insights;
create trigger trg_insights_updated before update on public.insights
  for each row execute function public.set_updated_at();
alter table public.insights enable row level security;
drop policy if exists "insights public read" on public.insights;
create policy "insights public read" on public.insights for select
  using ((published and (published_at is null or published_at <= now())) or public.is_admin());
drop policy if exists "insights admin write" on public.insights;
create policy "insights admin write" on public.insights for all using (public.is_admin()) with check (public.is_admin());

-- ---------- testimonials ----------------------------------------------------
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  organization text,
  message text not null,
  photo_url text,
  rating int check (rating between 1 and 5),
  project_id uuid references public.projects(id) on delete set null,
  featured boolean not null default false,
  published boolean not null default false,   -- must be explicitly approved
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.testimonials enable row level security;
drop policy if exists "testimonials public read" on public.testimonials;
create policy "testimonials public read" on public.testimonials for select using (published or public.is_admin());
drop policy if exists "testimonials admin write" on public.testimonials;
create policy "testimonials admin write" on public.testimonials for all using (public.is_admin()) with check (public.is_admin());

-- ---------- inquiries, leads, messages -------------------------------------
create sequence if not exists public.inquiry_seq start 1001;

create table if not exists public.project_inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_code text not null unique,
  full_name text not null,
  email text not null,
  phone text,
  organization text,
  project_type text,
  description text not null,
  problem text,
  features text,
  budget text,
  timeline text,
  existing_website text,
  additional_info text,
  contact_method text,
  consent boolean not null default false check (consent),
  status text not null default 'New'
    check (status in ('New','Contacted','Discussion','Proposal','Active Project','Completed','Archived','Rejected')),
  priority text not null default 'Normal' check (priority in ('Low','Normal','High')),
  tags text[] not null default '{}',
  follow_up_date date,
  notes jsonb not null default '[]'::jsonb,            -- [{"at":"iso","text":""}]
  contact_history jsonb not null default '[]'::jsonb,  -- [{"at":"iso","channel":"","summary":""}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inquiries_status on public.project_inquiries (status, created_at desc);
create index if not exists idx_inquiries_email on public.project_inquiries (lower(email), created_at desc);
drop trigger if exists trg_inquiries_updated on public.project_inquiries;
create trigger trg_inquiries_updated before update on public.project_inquiries
  for each row execute function public.set_updated_at();
alter table public.project_inquiries enable row level security;
drop policy if exists "inquiries admin all" on public.project_inquiries;
create policy "inquiries admin all" on public.project_inquiries for all using (public.is_admin()) with check (public.is_admin());
-- No anon policies: submissions go through submit_project_inquiry() below.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  status text not null default 'Unread' check (status in ('Unread','Read','Replied','Archived')),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_status on public.messages (status, created_at desc);
alter table public.messages enable row level security;
drop policy if exists "messages admin all" on public.messages;
create policy "messages admin all" on public.messages for all using (public.is_admin()) with check (public.is_admin());

-- Admin notification feed (email delivery can be bolted on later via a Database Webhook / Edge Function).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,          -- new_inquiry | new_message | new_appointment | ...
  title text not null,
  ref_table text,
  ref_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_unread on public.notifications (read, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications admin all" on public.notifications;
create policy "notifications admin all" on public.notifications for all using (public.is_admin()) with check (public.is_admin());

-- ---------- spam protection: RPC entry points -------------------------------
-- Validation + sanitization + rate limit (max 3 inquiries / 10 messages per email per hour) live in the database,
-- so they cannot be bypassed by calling the REST API directly.
create or replace function public.clean_text(t text, max_len int) returns text
language sql immutable as $$
  select nullif(left(trim(regexp_replace(coalesce(t,''), '[\x01-\x08\x0B\x0C\x0E-\x1F]', '', 'g')), max_len), '')
$$;

create or replace function public.submit_project_inquiry(payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(public.clean_text(payload->>'email', 254));
  v_name text := public.clean_text(payload->>'full_name', 120);
  v_desc text := public.clean_text(payload->>'description', 4000);
  v_code text;
  v_id uuid;
begin
  if coalesce(payload->>'website_hp','') <> '' then
    return 'INQ-0000';  -- honeypot tripped: pretend success, store nothing
  end if;
  if v_name is null or v_desc is null or v_email is null
     or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if (select count(*) from public.project_inquiries
      where lower(email) = v_email and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  v_code := 'INQ-' || nextval('public.inquiry_seq');
  insert into public.project_inquiries (
    inquiry_code, full_name, email, phone, organization, project_type, description, problem, features,
    budget, timeline, existing_website, additional_info, contact_method, consent
  ) values (
    v_code, v_name, v_email,
    public.clean_text(payload->>'phone', 40),
    public.clean_text(payload->>'organization', 160),
    public.clean_text(payload->>'project_type', 80),
    v_desc,
    public.clean_text(payload->>'problem', 3000),
    public.clean_text(payload->>'features', 3000),
    public.clean_text(payload->>'budget', 80),
    public.clean_text(payload->>'timeline', 80),
    public.clean_text(payload->>'existing_website', 300),
    public.clean_text(payload->>'additional_info', 3000),
    public.clean_text(payload->>'contact_method', 40),
    true
  ) returning id into v_id;

  insert into public.notifications (kind, title, ref_table, ref_id)
  values ('new_inquiry', 'New project inquiry ' || v_code || ' from ' || v_name, 'project_inquiries', v_id);
  return v_code;
end $$;
grant execute on function public.submit_project_inquiry(jsonb) to anon, authenticated;

create or replace function public.submit_contact_message(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(public.clean_text(payload->>'email', 254));
  v_name text := public.clean_text(payload->>'name', 120);
  v_msg text := public.clean_text(payload->>'message', 4000);
  v_id uuid;
begin
  if coalesce(payload->>'website_hp','') <> '' then return; end if;
  if v_name is null or v_msg is null or v_email is null
     or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if (select count(*) from public.messages
      where lower(email) = v_email and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.messages (name, email, subject, message)
  values (v_name, v_email, public.clean_text(payload->>'subject', 200), v_msg) returning id into v_id;
  insert into public.notifications (kind, title, ref_table, ref_id)
  values ('new_message', 'New message from ' || v_name, 'messages', v_id);
end $$;
grant execute on function public.submit_contact_message(jsonb) to anon, authenticated;

-- ---------- appointments (tables ready; UI is Phase 2) ----------------------
create table if not exists public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  reason text
);
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  appointment_type text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  name text not null,
  email text not null,
  phone text,
  message text,
  status text not null default 'Pending'
    check (status in ('Pending','Confirmed','Rescheduled','Completed','Cancelled','No-show')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
-- Double-booking guard: no two active appointments may overlap.
create extension if not exists btree_gist;
do $$ begin
  alter table public.appointments add constraint appointments_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
    where (status in ('Pending','Confirmed','Rescheduled'));
exception when duplicate_object or duplicate_table then null; end $$;
alter table public.blocked_dates enable row level security;
alter table public.appointments enable row level security;
drop policy if exists "blocked public read" on public.blocked_dates;
create policy "blocked public read" on public.blocked_dates for select using (true);
drop policy if exists "blocked admin write" on public.blocked_dates;
create policy "blocked admin write" on public.blocked_dates for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "appointments admin all" on public.appointments;
create policy "appointments admin all" on public.appointments for all using (public.is_admin()) with check (public.is_admin());

-- ---------- analytics (privacy-light: no IPs, no user ids) ------------------
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event text not null check (event in ('page_view','project_view','inquiry_submitted','contact_submitted','appointment_requested')),
  path text,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists idx_events_event_time on public.analytics_events (event, created_at desc);
alter table public.analytics_events enable row level security;
drop policy if exists "events anon insert" on public.analytics_events;
create policy "events anon insert" on public.analytics_events for insert
  with check (length(coalesce(path,'')) <= 200 and length(coalesce(ref,'')) <= 200);
drop policy if exists "events admin read" on public.analytics_events;
create policy "events admin read" on public.analytics_events for select using (public.is_admin());

-- ---------- media + admin activity -----------------------------------------
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'media',
  path text not null unique,
  kind text not null default 'other' check (kind in ('project','profile','article','testimonial','logo','other')),
  mime_type text not null,
  size_bytes int not null,
  alt_text text,
  created_at timestamptz not null default now()
);
alter table public.media enable row level security;
drop policy if exists "media public read" on public.media;
create policy "media public read" on public.media for select using (true);
drop policy if exists "media admin write" on public.media;
create policy "media admin write" on public.media for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.admin_activity (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  ref_table text,
  ref_id text,
  created_at timestamptz not null default now()
);
alter table public.admin_activity enable row level security;
drop policy if exists "activity admin all" on public.admin_activity;
create policy "activity admin all" on public.admin_activity for all using (public.is_admin()) with check (public.is_admin());

-- ---------- storage: public-read bucket, admin-only write, MIME + size limits
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media bucket public read" on storage.objects;
create policy "media bucket public read" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "media bucket admin write" on storage.objects;
create policy "media bucket admin write" on storage.objects for all
  using (bucket_id = 'media' and public.is_admin()) with check (bucket_id = 'media' and public.is_admin());

-- ============================================================================
-- SEED DATA — placeholders only. Nothing here claims clients, numbers or awards.
-- Edit everything later from Admin (Phase 2) or the Supabase table editor.
-- ============================================================================
insert into public.site_settings (key, value) values
('site', jsonb_build_object(
  'name','Muhammad Zeeshan Haider',
  'title','Programmer • Developer • Builder',
  'tagline','Build. Solve. Evolve.',
  'heroStatement','I build digital systems that turn ideas into working solutions.',
  'heroSupport','Websites, full-stack applications, educational platforms, management systems and custom digital solutions.',
  'availability', jsonb_build_object('open', true, 'label','Available for selected projects'),
  'email','', 'phone','', 'whatsapp','',
  'social', jsonb_build_object('github','','linkedin',''),
  'timezone','Asia/Karachi',
  'seo', jsonb_build_object('defaultDescription','I build digital systems that turn ideas into working solutions.','ogImage',''),
  'footer','Build. Solve. Evolve.',
  'copyright','Muhammad Zeeshan Haider'
))
on conflict (key) do nothing;

insert into public.services (slug, title, summary, what_it_is, who_for, includes, workflow, icon, sort_order) values
('website-development','Website Development','Professional digital experiences for individuals, organizations and institutions.',
 'Designed and built websites that present you clearly and work on every screen.',
 'Individuals, small organizations and institutions that need a credible online presence.',
 '["Responsive design","Content structure","Contact and inquiry forms","SEO basics","Deployment"]',
 '["Discovery","Structure and design","Build","Review","Launch"]','globe',10),
('full-stack-applications','Full-Stack Applications','Interactive platforms with authentication, databases and dashboards.',
 'Web applications with user accounts, a real database and role-based access.',
 'Teams and founders who need more than a static site.',
 '["Authentication and roles","Database design","Dashboards","Secure APIs","Deployment"]',
 '["Discovery","Data model","Build in iterations","Testing","Launch and handover"]','layers',20),
('educational-platforms','Educational Platforms','Learning portals, study systems and academic tools.',
 'Platforms that organize learning material, practice and progress.',
 'Schools, colleges, teachers and student communities.',
 '["Structured content","Practice and quizzes","Progress tracking","Admin tools"]',
 '["Understand the learners","Structure the content","Build","Pilot","Improve"]','book',30),
('management-systems','Management Systems','Digital systems designed to replace scattered, manual workflows.',
 'Systems that move attendance, requests, records or approvals out of paper and chat threads.',
 'Institutions and organizations running on manual processes.',
 '["Workflow mapping","Role-based access","Records and reports","Notifications"]',
 '["Map the current workflow","Design the system","Build","Train and pilot","Refine"]','workflow',40),
('custom-digital-solutions','Custom Digital Solutions','Technology designed around specific problems.',
 'A purpose-built tool when off-the-shelf software does not fit.',
 'Anyone with a specific problem and no ready-made answer.',
 '["Problem definition","Prototype","Build","Support"]',
 '["Define the problem","Prototype","Build","Test with real users","Launch"]','puzzle',50),
('digital-product-development','Digital Product Development','Complete products from concept to working system.',
 'End-to-end ownership from idea through design, build and launch.',
 'Founders and teams turning an idea into a real product.',
 '["Concept and scope","Design","Full-stack build","Launch"]',
 '["Idea","Scope","Design","Build","Launch","Evolve"]','rocket',60)
on conflict (slug) do nothing;

-- Project names come from the brief. Only facts you have stated are written; everything else is a placeholder to edit.
insert into public.projects (slug, name, short_description, category, status, featured, published, sort_order) values
('aspire-group-of-colleges','Aspire Group of Colleges','Case study details to be added.','Web Development','In Progress',true,true,10),
('aspire-cr-connect','Aspire CR Connect','Classroom coordination system for attendance, class representatives and concerns.','Management Systems','In Progress',true,true,20),
('pip-study-hub','PIP Study Hub','A study-community web app.','Education','In Progress',true,true,30),
('cs-compass','CS Compass','Case study details to be added.','Education','In Progress',true,true,40),
('superchads-online-course','SuperChads Online Course','Case study details to be added.','Education','In Progress',false,true,50),
('mental-health-support-platform','Mental Health Support Platform','Case study details to be added.','Digital Products','Concept',false,true,60)
on conflict (slug) do nothing;

insert into public.journey_entries (title, description, category, sort_order)
select * from (values
('Early interest in technology','Where the curiosity about how software works began.','Origin',10),
('Learning computer science','Building the fundamentals.','Learning',20),
('First projects','Learning by building small things.','Building',30),
('Educational projects','Tools and portals for learning.','Projects',40),
('Institutional systems','Systems for real institutions with real workflows.','Projects',50),
('Full-stack development','Authentication, databases and secure, role-based systems.','Skills',60),
('Current focus','What I am building and learning right now.','Now',70),
('Future direction','Where this is heading.','Next',80)
) as v(title, description, category, sort_order)
where not exists (select 1 from public.journey_entries);

-- ============================================================================
-- AFTER your first sign-in (Supabase > Authentication > Users > add yourself), run:
--   update public.profiles set role = 'super_admin' where id = '<your-user-uuid>';
-- ============================================================================
