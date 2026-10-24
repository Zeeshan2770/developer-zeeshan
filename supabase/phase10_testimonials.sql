-- ============================================================================
-- Zeeshan HQ — Phase 10 SQL. Run AFTER phase3.sql (and the rest). Safe to re-run.
-- Adds community-service details to testimonials:
--   public : relationship, organization_type, location, program, period, impact, website_url, verified
--   private: submitted_name, contact_email, verification_note, consent_at, source   (admin only)
-- Privacy: visitors can only read the PUBLIC columns of published rows. Private columns are protected
-- with column-level privileges, so even a hand-written API request cannot read them.
-- NOTE: any column you add to testimonials later is private until you also grant it to anon below.
-- ============================================================================

alter table public.testimonials
  add column if not exists relationship text,          -- how they know the work (whitelisted below)
  add column if not exists organization_type text,     -- NGO, school, clinic... (whitelisted below)
  add column if not exists location text,              -- city / area, country
  add column if not exists program text,               -- the service or programme involved
  add column if not exists period text,                -- when, e.g. "2025" or "Jan–Jun 2025"
  add column if not exists impact text,                -- one-line outcome: what changed for them
  add column if not exists website_url text,           -- organisation website (shown as a link)
  add column if not exists verified boolean not null default false,  -- set by you after checking
  add column if not exists submitted_name text,        -- PRIVATE real name as typed (public name may be shortened)
  add column if not exists contact_email text,         -- PRIVATE, only so you can verify the testimonial
  add column if not exists verification_note text,     -- PRIVATE notes (how/when you verified)
  add column if not exists consent_at timestamptz,     -- PRIVATE when consent was given
  add column if not exists source text not null default 'admin';     -- PRIVATE 'website' or 'admin'

-- ---------- column-level privacy --------------------------------------------
revoke select on public.testimonials from anon;
grant select (id, name, role, organization, message, photo_url, rating, project_id, featured, published,
              sort_order, created_at, relationship, organization_type, location, program, period,
              impact, website_url, verified)
  on public.testimonials to anon;

-- ---------- submission ------------------------------------------------------
create or replace function public.submit_testimonial(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := public.clean_text(payload->>'name', 120);
  v_msg text := public.clean_text(payload->>'message', 1500);
  v_rating int;
  v_pref text := coalesce(nullif(payload->>'display_as', ''), 'full');
  v_shown text;
  v_rel text := public.clean_text(payload->>'relationship', 60);
  v_type text := public.clean_text(payload->>'organization_type', 60);
  v_email text := lower(public.clean_text(payload->>'contact_email', 254));
  v_url text := public.clean_text(payload->>'website_url', 300);
begin
  if coalesce(payload->>'website_hp','') <> '' then return; end if;
  if v_name is null or v_msg is null or char_length(v_msg) < 20 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  begin
    v_rating := nullif(payload->>'rating','')::int;
  exception when others then v_rating := null; end;
  if v_rating is not null and (v_rating < 1 or v_rating > 5) then v_rating := null; end if;

  -- Only known values are stored for the pick-lists.
  if v_rel is not null and v_rel not in (
    'Beneficiary / service user','Volunteer','Partner organisation','Client','Donor / supporter',
    'Staff / team member','Parent / guardian','Community member','Other') then v_rel := null; end if;
  if v_type is not null and v_type not in (
    'NGO / non-profit','Community organisation','School / educational institution','Government / public body',
    'Healthcare / clinic','Faith-based organisation','Youth / student group','Small business',
    'Individual (no organisation)','Other') then v_type := null; end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
  if v_url is not null and v_url !~* '^https?://[^\s]+$' then v_url := null; end if;

  -- Apply the name preference here so the public row never holds more than the person agreed to show.
  if v_pref = 'anonymous' then
    v_shown := 'Anonymous';
  elsif v_pref = 'first' then
    v_shown := split_part(v_name, ' ', 1)
      || case when position(' ' in v_name) > 0
              then ' ' || upper(left(regexp_replace(v_name, '^.*\s', ''), 1)) || '.' else '' end;
  else
    v_shown := v_name;
  end if;

  -- Rate limit without needing identity: at most 5 unapproved submissions per hour across the whole site.
  if (select count(*) from public.testimonials
      where published = false and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.testimonials
    (name, role, organization, message, rating, published, featured,
     relationship, organization_type, location, program, period, impact, website_url,
     submitted_name, contact_email, consent_at, source)
  values
    (v_shown, public.clean_text(payload->>'role', 120), public.clean_text(payload->>'organization', 160),
     v_msg, v_rating, false, false,
     v_rel, v_type, public.clean_text(payload->>'location', 120), public.clean_text(payload->>'program', 160),
     public.clean_text(payload->>'period', 60), public.clean_text(payload->>'impact', 300), v_url,
     v_name, v_email, now(), 'website');
  -- trg_testimonial_new writes the admin notification.
end $$;
grant execute on function public.submit_testimonial(jsonb) to anon, authenticated;

-- Admin notification shows the real submitted name even when the public name is shortened/anonymous.
create or replace function public.notify_testimonial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (kind, title, ref_table, ref_id)
  values ('new_testimonial', 'Testimonial added: ' || coalesce(nullif(new.submitted_name, ''), new.name), 'testimonials', new.id);
  return new;
end $$;
