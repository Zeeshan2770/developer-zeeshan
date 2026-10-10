-- ============================================================================
-- Zeeshan HQ — Phase 3 SQL. Run AFTER schema.sql and phase2.sql. Safe to re-run.
-- Adds: moderated public testimonial submission.
-- Submissions are stored UNPUBLISHED; nothing appears publicly until you approve it in Admin.
-- ============================================================================

create or replace function public.submit_testimonial(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := public.clean_text(payload->>'name', 120);
  v_msg text := public.clean_text(payload->>'message', 1500);
  v_rating int;
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

  -- Rate limit without storing an email: at most 5 unapproved submissions per hour across the whole site,
  -- which stops flooding the moderation queue while keeping the form email-free.
  if (select count(*) from public.testimonials
      where published = false and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  insert into public.testimonials (name, role, organization, message, rating, published, featured)
  values (v_name, public.clean_text(payload->>'role', 120), public.clean_text(payload->>'organization', 160),
          v_msg, v_rating, false, false);
  -- trg_testimonial_new (phase2.sql) writes the admin notification.
end $$;
grant execute on function public.submit_testimonial(jsonb) to anon, authenticated;
