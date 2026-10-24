-- Phase 7: per-record SEO (search & sharing) overrides on projects and blog posts. Safe to re-run.
alter table public.projects add column if not exists seo_title text;
alter table public.projects add column if not exists seo_description text;
alter table public.projects add column if not exists og_image text;
alter table public.projects add column if not exists noindex boolean not null default false;
alter table public.insights add column if not exists seo_title text;
alter table public.insights add column if not exists seo_description text;
alter table public.insights add column if not exists og_image text;
alter table public.insights add column if not exists noindex boolean not null default false;
