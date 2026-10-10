# Zeeshan HQ — Personal Digital Headquarters

React + Vite + React Router on the front, Supabase (Postgres, Auth, Storage) behind it, deployed on Netlify.

## What is included

**Public site** — Home, About, Projects explorer, Case studies, Services, Journey, Blogs, Testimonials, Make a Payment, Contact, Start a Project, and **Book a Session** (timezone-safe slots).

**Admin command center at `/admin`** (Supabase Auth + `super_admin` role check, enforced again by RLS):
- Dashboard: counts, traffic chart, popular projects, top pages, conversions, recent activity
- CMS: Projects (with features, tech groups, media, case-study sections), Services, Journey, Blogs, Testimonials, Make a Payment — create / edit / delete / publish / feature / reorder / upload images
- Leads CRM (drag between stages, priority, tags, follow-up date, notes, contact history) and a raw Project Inquiries inbox
- Appointments: confirm, reschedule, status changes, blocked dates
- Messages: read / replied / archived
- Media manager: MIME + 5 MB validation, safe filenames, folders per type, auto-resize to WebP
- Settings: brand, hero, availability, contact, social, About story, booking rules, timezone, SEO, footer

**Security** — RLS on every table; visitors can only read published content and submit through server-side functions that validate, sanitize and rate-limit; honeypot on all public forms; no service-role key anywhere in the frontend.

## Setup

1. Create a Supabase project.
2. SQL Editor → run `supabase/schema.sql`, then `supabase/phase2.sql`, then `supabase/phase3.sql`, then `supabase/phase4.sql`.
3. Authentication → Users → add yourself (email + password), then run:
   `update public.profiles set role = 'super_admin' where id = '<your-user-uuid>';`
4. Copy `.env.example` to `.env.local` and fill in the URL and **anon** key. Never use the service-role key in the frontend.
5. `npm install && npm run dev`, then sign in at `/admin` and fill in **Settings** first.
6. Deploy: connect the repo to Netlify (build `npm run build`, publish `dist`) and set the same env vars. `netlify.toml` provides SPA routing, security headers and the dynamic `/sitemap.xml`.
7. Edit `public/robots.txt` so the `Sitemap:` line uses your full domain.

## Before you go live (security checklist)

1. **Turn off public sign-ups:** Supabase → Authentication → Providers/Settings → disable "Allow new users to sign up". You create your own admin user manually, so nobody else needs to register. (Even if someone did, new users get role `none` and see nothing private — this is tested.)
2. Confirm only the **anon** key is in Netlify env vars (`VITE_SUPABASE_ANON_KEY`), never the service-role key.
3. In Supabase → Authentication → URL configuration, set your real site URL.
4. Turn on 2FA for your Supabase and Netlify accounts, and use a long unique admin password.
5. Fill Settings (email, WhatsApp, social links) and replace placeholder text before sharing the link.

## Testing

```bash
npm test        # unit: validation, slugs, timezone/slot maths, share-preview escaping
npm run test:db # runs schema.sql + phase2.sql in a real Postgres (PGlite) and checks RLS, RPCs, booking rules, triggers
npm run test:all
```

The database suite proves, among other things: visitors can't read inquiries/messages/appointments, can't write tables directly, and can't promote themselves; invalid, spammy or over-limit submissions are rejected server-side; double-booking, off-grid, weekend, past, blocked-date and over-capacity bookings are refused; and both SQL files can be re-run safely.

### Browser tests (optional)

Real Chromium drives the built site against an in-memory fake of the Supabase API, so no project or network is needed.
Requires Python 3 with `pip install playwright && playwright install chromium`.

```bash
VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=test VITE_SITE_URL=http://localhost:4173 \
  npx vite build --outDir /tmp/zhq-dist --emptyOutDir
npx vite preview --outDir /tmp/zhq-dist --port 4173 &
npm run test:e2e          # screenshots go to /tmp/zhq-shots (pass a path as the first argument to change)
```

They cover every public route, search/filters, case studies, SEO tags, the inquiry / contact / booking flows, mobile layout (no sideways scroll, menu), the admin gate (signed-out and non-admin are refused), dashboard, project CMS, leads CRM, messages, settings and sign-out.

## Share previews

`netlify/edge-functions/og.js` injects real title/description/image tags into project and article pages so links shared on WhatsApp, LinkedIn, X and Slack show proper previews (those bots don't run JavaScript). It needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify env; optionally `SITE_NAME`.

## Booking

Working days/hours, duration, buffer, max per day, notice window, horizon, purposes and the host timezone live in Settings → Booking. Hours are interpreted in the host timezone and converted to each visitor's own timezone. Every rule is re-checked inside the database (`request_appointment`), and an exclusion constraint makes double-booking impossible even under simultaneous requests.

## Notifications

Every new inquiry, message, appointment, confirmation, cancellation, testimonial and lead stage change writes a row to `notifications` (shown on the dashboard). Email is optional: see `supabase/functions/notify-email/index.ts` for a webhook-driven function with a swappable provider.

## Content you must review

Seed text is placeholder wording and invents no clients, numbers or achievements. Replace the About story, journey entries and project case studies with your own words (all editable in Admin).

## Known limits

- Rescheduling in Admin uses your device's timezone for the date picker.
- Article content uses a small Markdown-lite format (`## heading`, `- list`, blank line = paragraph) rendered safely as text.
- Analytics are intentionally minimal (event + path only; no IPs or cookies).
- Single role (`super_admin`) today; the `profiles.role` column already allows adding more later.


## Moderated testimonials and draft previews (phase 3)

- Run `supabase/phase3.sql` after `phase2.sql`. It adds `submit_testimonial`, which lets visitors send a testimonial from the Testimonials page. Submissions are always stored **unpublished**, need explicit consent, are sanitised, honeypot-protected and rate limited (5/hour), and notify you in the admin feed. Nothing shows publicly until you publish it in Admin → Testimonials.
- In Admin → Projects / Blogs, each row has a **Preview** link (`?preview=1`) for unpublished items. Drafts are returned only to signed-in admins by RLS, the page shows a draft banner, is `noindex`, and does not count views.

## Custom case-study sections and extra social profiles (phase 4)

- Run `supabase/phase4.sql` (adds `projects.sections`). In Admin → Projects → *Case study* you can add, reorder and remove your own sections (title + text); they appear after "Result" on the project page. Sections missing a title or text are dropped on save.
- Admin → Settings → Site & brand → *Other profiles*: one `Label | URL` per line (X, YouTube, Instagram…). Only http(s) links are shown, in the footer and on Contact.
