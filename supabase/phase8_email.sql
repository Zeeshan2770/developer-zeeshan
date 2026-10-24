-- Phase 8: email notifications (owner alert + visitor auto-reply).
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- How it works (no service-role key needed anywhere):
--   1. A visitor submits a form -> the existing RPC stores it (unchanged).
--   2. The browser then calls the Netlify function /.netlify/functions/notify with the inquiry code
--      (or the visitor's email for contact messages, booking code for appointments).
--   3. The function calls claim_notification() below. It returns the stored details ONCE (only for a
--      submission made in the last 15 minutes that has not been announced yet) and marks it as announced.
--      So nobody can use it to read old data or to trigger repeat emails.
--   4. The function sends the emails through Resend using keys kept in Netlify environment variables.

alter table public.project_inquiries add column if not exists notified_at timestamptz;
alter table public.messages          add column if not exists notified_at timestamptz;
alter table public.appointments      add column if not exists notified_at timestamptz;

create or replace function public.claim_notification(p_kind text, p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ref text := left(coalesce(p_ref, ''), 254);
  v_id uuid;
  v_out jsonb;
begin
  if p_kind = 'inquiry' then
    update public.project_inquiries i set notified_at = now()
     where i.inquiry_code = v_ref and i.notified_at is null and i.created_at > now() - interval '15 minutes'
    returning jsonb_build_object('kind', 'inquiry', 'code', i.inquiry_code, 'name', i.full_name, 'email', i.email,
      'phone', i.phone, 'organization', i.organization, 'project_type', i.project_type, 'description', i.description,
      'problem', i.problem, 'features', i.features, 'budget', i.budget, 'timeline', i.timeline,
      'existing_website', i.existing_website, 'additional_info', i.additional_info, 'contact_method', i.contact_method)
    into v_out;
  elsif p_kind = 'message' then
    -- messages have no public code, so the visitor's own email identifies the newest unannounced one
    select m.id into v_id from public.messages m
     where lower(m.email) = lower(v_ref) and m.notified_at is null and m.created_at > now() - interval '15 minutes'
     order by m.created_at asc limit 1 for update skip locked;
    if v_id is not null then
      update public.messages m set notified_at = now() where m.id = v_id
      returning jsonb_build_object('kind', 'message', 'name', m.name, 'email', m.email, 'subject', m.subject, 'message', m.message)
      into v_out;
    end if;
  elsif p_kind = 'appointment' then
    select a.id into v_id from public.appointments a
     where 'BK-' || upper(left(a.id::text, 6)) = upper(v_ref) and a.notified_at is null and a.created_at > now() - interval '15 minutes'
     limit 1 for update skip locked;
    if v_id is not null then
      update public.appointments a set notified_at = now() where a.id = v_id
      returning jsonb_build_object('kind', 'appointment', 'code', 'BK-' || upper(left(a.id::text, 6)), 'name', a.name, 'email', a.email,
        'phone', a.phone, 'purpose', a.purpose, 'appointment_type', a.appointment_type, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'message', a.message)
      into v_out;
    end if;
  end if;
  return v_out;   -- null when nothing is waiting
end $$;

revoke all on function public.claim_notification(text, text) from public;
grant execute on function public.claim_notification(text, text) to anon, authenticated;
