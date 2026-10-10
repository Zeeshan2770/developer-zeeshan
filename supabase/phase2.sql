-- ============================================================================
-- Zeeshan HQ — Phase 2 SQL. Run AFTER schema.sql. Safe to re-run.
-- Adds: booking config + slot RPCs (timezone-safe, double-booking safe),
-- notification triggers, admin analytics RPC.
-- ============================================================================

-- ---------- booking configuration (public-readable, admin-editable) ---------
insert into public.site_settings (key, value) values
('booking', jsonb_build_object(
  'enabled', true,
  'timezone', 'Asia/Karachi',
  'days', jsonb_build_array(1,2,3,4,5),      -- 0 = Sunday ... 6 = Saturday
  'start', '10:00',
  'end', '17:00',
  'durationMin', 30,
  'bufferMin', 15,
  'maxPerDay', 4,
  'minNoticeHours', 12,
  'horizonDays', 30,
  'purposes', jsonb_build_array('Discuss a project','Technical consultation','Collaboration','General question'),
  'types', jsonb_build_array('Video call','Phone call')
))
on conflict (key) do nothing;

-- ---------- public: which slots are already taken (no personal data) --------
create or replace function public.get_booked_slots(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.starts_at, a.ends_at from public.appointments a
  where a.status in ('Pending','Confirmed','Rescheduled')
    and a.starts_at >= p_from and a.starts_at < p_to
$$;
grant execute on function public.get_booked_slots(timestamptz, timestamptz) to anon, authenticated;

-- ---------- public: request an appointment ----------------------------------
-- Every rule is enforced here, in the database, so it cannot be bypassed from the browser:
-- working days/hours and slot alignment (all evaluated in the configured timezone),
-- notice window, horizon, blocked dates, max bookings per day, rate limit, and overlap (via the exclusion constraint).
create or replace function public.request_appointment(payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb;
  tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_dur int; v_buf int;
  v_local timestamp;
  t0 time; t1 time;
  v_email text := lower(public.clean_text(payload->>'email', 254));
  v_name text := public.clean_text(payload->>'name', 120);
  v_id uuid;
begin
  if coalesce(payload->>'website_hp','') <> '' then return 'BK-0000'; end if;
  select value into cfg from public.site_settings where key = 'booking';
  if cfg is null or coalesce((cfg->>'enabled')::boolean, false) is not true then
    raise exception 'booking_disabled' using errcode = '22023';
  end if;
  if v_name is null or v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or public.clean_text(payload->>'purpose', 120) is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  tz := coalesce(cfg->>'timezone', 'UTC');
  v_dur := coalesce((cfg->>'durationMin')::int, 30);
  v_buf := coalesce((cfg->>'bufferMin')::int, 0);
  t0 := (cfg->>'start')::time;
  t1 := (cfg->>'end')::time;
  begin
    v_start := (payload->>'starts_at')::timestamptz;
  exception when others then
    raise exception 'invalid_input' using errcode = '22023';
  end;
  v_end := v_start + make_interval(mins => v_dur);
  v_local := v_start at time zone tz;

  if not (cfg->'days' @> to_jsonb(extract(dow from v_local)::int)) then
    raise exception 'slot_unavailable' using errcode = '22023';
  end if;
  if v_local::time < t0 or (v_local::time + make_interval(mins => v_dur)) > t1
     or mod((extract(epoch from (v_local::time - t0)) / 60)::int, v_dur + v_buf) <> 0 then
    raise exception 'slot_unavailable' using errcode = '22023';
  end if;
  if v_start < now() + make_interval(hours => coalesce((cfg->>'minNoticeHours')::int, 0))
     or v_start > now() + make_interval(days => coalesce((cfg->>'horizonDays')::int, 30)) then
    raise exception 'slot_unavailable' using errcode = '22023';
  end if;
  if exists (select 1 from public.blocked_dates where day = v_local::date) then
    raise exception 'slot_unavailable' using errcode = '22023';
  end if;
  if (select count(*) from public.appointments
      where status in ('Pending','Confirmed','Rescheduled')
        and (starts_at at time zone tz)::date = v_local::date) >= coalesce((cfg->>'maxPerDay')::int, 1000) then
    raise exception 'day_full' using errcode = '22023';
  end if;
  if (select count(*) from public.appointments
      where lower(email) = v_email and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  begin
    insert into public.appointments (purpose, appointment_type, starts_at, ends_at, name, email, phone, message)
    values (public.clean_text(payload->>'purpose', 120), public.clean_text(payload->>'appointment_type', 60),
            v_start, v_end, v_name, v_email, public.clean_text(payload->>'phone', 40),
            public.clean_text(payload->>'message', 2000))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_taken' using errcode = '23P01';
  end;

  insert into public.notifications (kind, title, ref_table, ref_id)
  values ('new_appointment', 'New appointment request from ' || v_name, 'appointments', v_id);
  return 'BK-' || upper(left(v_id::text, 6));
end $$;
grant execute on function public.request_appointment(jsonb) to anon, authenticated;

-- ---------- notification triggers (architecture for email delivery) ---------
-- These only write rows into `notifications`. An optional Edge Function (supabase/functions/notify-email)
-- can send email whenever a row is inserted; the email provider stays configurable.
create or replace function public.notify_appointment_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('Confirmed','Cancelled') then
    insert into public.notifications (kind, title, ref_table, ref_id)
    values (case when new.status = 'Confirmed' then 'appointment_confirmed' else 'appointment_cancelled' end,
            'Appointment ' || lower(new.status) || ': ' || new.name, 'appointments', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_appt_status on public.appointments;
create trigger trg_appt_status after update on public.appointments
  for each row execute function public.notify_appointment_status();

create or replace function public.notify_lead_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (kind, title, ref_table, ref_id)
    values ('lead_changed', new.inquiry_code || ' moved to ' || new.status, 'project_inquiries', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_lead_status on public.project_inquiries;
create trigger trg_lead_status after update on public.project_inquiries
  for each row execute function public.notify_lead_status();

create or replace function public.notify_testimonial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (kind, title, ref_table, ref_id)
  values ('new_testimonial', 'Testimonial added: ' || new.name, 'testimonials', new.id);
  return new;
end $$;
drop trigger if exists trg_testimonial_new on public.testimonials;
create trigger trg_testimonial_new after insert on public.testimonials
  for each row execute function public.notify_testimonial();

-- ---------- admin analytics -------------------------------------------------
create or replace function public.admin_analytics(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'totals', coalesce((select jsonb_object_agg(event, n) from (
        select event, count(*) n from public.analytics_events where created_at >= since group by event) t), '{}'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'views', n) order by d) from (
        select created_at::date d, count(*) n from public.analytics_events
        where event = 'page_view' and created_at >= since group by 1) t), '[]'::jsonb),
    'topPages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'views', n)) from (
        select path, count(*) n from public.analytics_events
        where event = 'page_view' and created_at >= since group by path order by n desc limit 8) t), '[]'::jsonb)
  );
end $$;
grant execute on function public.admin_analytics(int) to authenticated;
