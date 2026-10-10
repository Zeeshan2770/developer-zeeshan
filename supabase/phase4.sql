-- Phase 4: custom case-study sections on projects. Run after phase3.sql. Safe to re-run.
alter table public.projects add column if not exists sections jsonb not null default '[]'::jsonb;  -- [{"title":"","body":""}]
do $$ begin
  alter table public.projects add constraint projects_sections_is_array check (jsonb_typeof(sections) = 'array');
exception when duplicate_object then null; end $$;
