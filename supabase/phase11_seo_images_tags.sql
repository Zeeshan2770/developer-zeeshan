-- Phase 11: image alt text, article tags and six new articles. Safe to re-run.
-- Run in Supabase > SQL Editor. Run it BEFORE deploying the new front end (the admin forms save the new columns).
-- Then redeploy on Netlify so the static pages, the sitemap and the new tag pages are rebuilt.

-- 1) New columns -------------------------------------------------------------
alter table public.insights add column if not exists cover_alt text;
alter table public.projects add column if not exists thumbnail_alt text;
create index if not exists idx_insights_tags on public.insights using gin (tags);

-- 2) Site-wide settings: profile photo alt text, share-image alt text, topics (structured data), extra keywords.
--    Only fills values that are still empty, so anything you already typed in Admin is kept.
update public.site_settings
set value = value
  || jsonb_build_object('profileImageAlt', coalesce(nullif(value->>'profileImageAlt', ''), 'Portrait of ' || coalesce(nullif(value->>'name', ''), 'Muhammad Zeeshan Haider') || ', web and full-stack developer'))
  || jsonb_build_object('seo', coalesce(value->'seo', '{}'::jsonb) || jsonb_build_object(
       'ogImageAlt', coalesce(nullif(value->'seo'->>'ogImageAlt', ''), coalesce(nullif(value->>'name', ''), 'Muhammad Zeeshan Haider') || ' — web and full-stack developer, educational platforms and management systems'),
       'knowsAbout', coalesce(nullif(value->'seo'->>'knowsAbout', ''), 'Web development, Full-stack development, React, Supabase, Educational technology, Management systems, Web performance, Search engine optimization'),
       'keywords', case when coalesce(value->'seo'->>'keywords', '') like '%React SEO%' then value->'seo'->>'keywords'
                        else concat_ws(', ', nullif(value->'seo'->>'keywords', ''), 'React SEO, prerendering, Supabase tutorial, Row Level Security, Netlify deployment, web image optimization, alt text, ed-tech, study platform development') end))
where key = 'site';

-- 3) Alt text for the project screenshots in /public/projects (matched by file name, only where still empty)
update public.projects set thumbnail_alt = 'Homepage of the Aspire Group of Colleges website with the About section and the four institutional values' where thumbnail_alt is null and thumbnail_url like '%aspire-home%';
update public.projects set thumbnail_alt = 'Programs Offered page of the Aspire Group of Colleges website listing intermediate and matric programs' where thumbnail_alt is null and thumbnail_url like '%aspire-programs%';
update public.projects set thumbnail_alt = 'Online admission application form with program and guardian information fields' where thumbnail_alt is null and thumbnail_url like '%aspire-form%';
update public.projects set thumbnail_alt = 'Super admin dashboard showing student, class and attendance statistics for a college' where thumbnail_alt is null and thumbnail_url like '%aspire-dash%';
update public.projects set thumbnail_alt = 'CS Compass home screen: learn Class 12 Computer Science by running code, with a Python lab preview' where thumbnail_alt is null and thumbnail_url like '%cs-home%';
update public.projects set thumbnail_alt = 'CS Compass practice and exams page with a full syllabus mock exam and test settings' where thumbnail_alt is null and thumbnail_url like '%cs-exam%';
update public.projects set thumbnail_alt = 'CS Compass interactive labs page with Python, SQL, debugger, logic and subnet calculator labs' where thumbnail_alt is null and thumbnail_url like '%cs-labs%';
update public.projects set thumbnail_alt = 'CS Compass revision center showing a question due for review with multiple-choice answers' where thumbnail_alt is null and thumbnail_url like '%cs-rev%';
update public.projects set thumbnail_alt = 'Partners in Progress home page: Study smarter, stay consistent, grow together, with study community cards' where thumbnail_alt is null and thumbnail_url like '%pip-home%';
update public.projects set thumbnail_alt = 'Partners in Progress how-it-works page with three steps: join the community, set your goals, stay consistent' where thumbnail_alt is null and thumbnail_url like '%pip-how%';
update public.projects set thumbnail_alt = 'Online course platform home page promoting a self-paced grooming and presentation course' where thumbnail_alt is null and thumbnail_url like '%sc-home%';
update public.projects set thumbnail_alt = 'Course platform admin overview with enrollment requests, students, courses and modules' where thumbnail_alt is null and thumbnail_url like '%sc-admin%';

-- 4) New articles (published). Review and edit them in Admin > Blogs; add a cover image + alt text to each.

insert into public.insights (slug, title, excerpt, content, category, tags, author, published, published_at, reading_minutes, featured, seo_title, seo_description)
values ('seo-for-react-apps-prerendering', $t$SEO for React Apps: Why Prerendering Matters and How It Works$t$, $t$A React app starts as an empty page. Here is what search engines and link previews actually see, and how prerendering fixes it.$t$, $c$## The problem: an empty page

A typical React app ships one HTML file with an empty `<div id="root"></div>` and a JavaScript bundle. A visitor's browser runs the script and the page appears. But not everything that visits your site runs JavaScript.

Google can render JavaScript, but it does so in a second step that can take days, and it is not guaranteed to be perfect. Many other visitors never render it at all: link previews on WhatsApp, LinkedIn and Slack, some SEO audit tools, simple crawlers and many AI and archive bots. For all of them, an unprepared single-page app is a blank page with a generic title.

## What crawlers need to see

For every public page, the first HTML response should already contain:

- A unique `<title>` of roughly 50–60 characters
- A meta description of roughly 120–155 characters
- A canonical link pointing at the one true URL of the page
- Exactly one `<h1>` and a sensible heading structure below it
- Real text content and real internal links (`<a href="/projects">`)
- Open Graph and Twitter tags so shared links get a title, description and image
- Structured data (JSON-LD) that says what the page is

## Three ways to get there

- **Server-side rendering (SSR):** the server builds the HTML for every request. Powerful, but you need a server and more moving parts.
- **Static site generation or prerendering:** the HTML is produced once, at build time, and served as plain files. Fast, cheap and easy to host.
- **Edge injection:** a small function adds the right meta tags to the HTML before it is sent. Useful for pages whose content changes often, such as link previews for a new article.

For a portfolio or small business site whose content changes a few times a week, prerendering is usually the best trade-off.

## How build-time prerendering works

1. Run the normal build. You get the app's `index.html` shell and the JavaScript bundle.
2. A script then reads your content (projects, articles, services) from the database.
3. For every route, it writes a copy of the shell into its own folder, for example `/blog/my-article/index.html`, with the correct title, meta tags, headings, text and links already inside.
4. When a visitor opens the page, the browser shows the prerendered content immediately, and React takes over and replaces it as normal.

The key rule is that the prerendered content must match what React will show, otherwise you are showing crawlers something different from visitors. Generate both from the same data.

## Do not forget the supporting files

- **sitemap.xml** lists every public URL with its last-modified date. Submit it in Google Search Console.
- **robots.txt** should point to the sitemap with a full `https://` address and block only private areas such as `/admin`.
- **A 404 page that is marked noindex**, so broken URLs never enter the index.
- **Redirects** for any URL you rename, using a permanent 301, so ranking is passed on.

## How to check your work

Open a page, choose "View source" (not the inspector, which shows the page after JavaScript ran) and look for your title, description and headings. Then test the live URL with Google's Rich Results Test and the URL Inspection tool in Search Console. If the important text is in the source, crawlers can see it.

## The takeaway

A fast, good-looking React app is not automatically a findable one. Spend an afternoon making sure every page ships real HTML with the right tags, add a sitemap, and you remove the biggest obstacle between your work and the people searching for it. For more on keeping those pages quick, see [web image optimization and alt text](/blog/web-image-optimization-alt-text-checklist).
$c$, $t$Web Development$t$, array['SEO','React','Performance','Netlify','Web Development'], 'Muhammad Zeeshan Haider', true, now() - interval '40 days', 3, false, $t$SEO for React Apps: Prerendering Explained$t$, $t$Why a React single-page app can look empty to crawlers and link previews, and how build-time prerendering, meta tags and a sitemap fix it.$t$)
on conflict (slug) do nothing;

insert into public.insights (slug, title, excerpt, content, category, tags, author, published, published_at, reading_minutes, featured, seo_title, seo_description)
values ('supabase-row-level-security-beginners', $t$Supabase Row Level Security Explained for Beginners$t$, $t$Your Supabase key is public by design. Row Level Security is what actually protects your data. Here is how it works, step by step.$t$, $c$## Why your Supabase key is public

When you build a front end with Supabase, you put a project URL and an **anon key** in your JavaScript. Anyone can open the browser's developer tools and copy them. That is not a leak; it is how the system is designed.

What stops a stranger from reading or deleting every row in your database is **Row Level Security (RLS)**. The anon key only says "this request comes from your app". RLS decides what that request is allowed to do.

## What RLS is

RLS is a PostgreSQL feature. You switch it on per table, and from then on every query is checked against **policies** you write. If no policy allows an action, the action is denied. That "deny by default" behaviour is what makes it safe.

```sql
alter table public.notes enable row level security;
```

After that single line, the table returns no rows to the public API until you add policies.

## Your first policies

A policy has a name, a command (select, insert, update, delete or all), a role, and a condition.

```sql
-- Anyone can read published articles
create policy "public read published"
  on public.articles for select
  using (published = true);

-- A signed-in user can read only their own notes
create policy "own notes"
  on public.notes for select
  using (auth.uid() = user_id);
```

- `using` is the condition for rows that already exist (reading, updating, deleting).
- `with check` is the condition for rows being written (inserting, updating).
- `auth.uid()` returns the id of the signed-in user, so you can compare it to an owner column.

## A pattern for a personal site with an admin area

- Public content tables: allow `select` only where `published = true`.
- Admin writes: allow insert, update and delete only when a helper function such as `is_admin()` returns true for the current user.
- Visitor forms (contact, bookings): do not allow direct inserts. Expose a database function that validates and sanitizes the input, and let visitors call only that.
- Private tables (messages, inquiries): no public policy at all.

## Common mistakes

- **Forgetting to enable RLS.** A table without RLS is open to anyone with the anon key.
- **Using the service role key in the browser.** That key bypasses RLS completely. It belongs only on a server, never in front-end code or a public repository.
- **Trusting the front end.** Hiding an admin button in React protects nothing. The policy is the lock; the button is only decoration.
- **Policies that are too wide**, such as `using (true)` on a table that holds private data.
- **Not testing as a stranger.** Open a private window, use only the anon key and try to read and write each table.

## How to test

Run a quick checklist for every table: can an anonymous visitor read it, insert into it, update it, delete it? The answer should match what you intended, and "no" is the right answer for most tables. The Supabase dashboard also has an advisor that flags tables with RLS turned off.

## The takeaway

Think of the anon key as a visitor badge and RLS as the locks on each door. Enable RLS everywhere, write the narrowest policy that works, keep the service role key off the client, and test as an anonymous user before you launch. If you are deploying the whole stack, read [shipping a full-stack app with only Netlify and Supabase](/blog/netlify-supabase-full-stack-no-server) next.
$c$, $t$Databases & Security$t$, array['Supabase','Security','Web Development'], 'Muhammad Zeeshan Haider', true, now() - interval '33 days', 3, false, $t$Supabase Row Level Security (RLS) for Beginners$t$, $t$A beginner-friendly guide to Supabase Row Level Security: why the anon key is public, how policies work, and the mistakes to avoid.$t$)
on conflict (slug) do nothing;

insert into public.insights (slug, title, excerpt, content, category, tags, author, published, published_at, reading_minutes, featured, seo_title, seo_description)
values ('web-image-optimization-alt-text-checklist', $t$Web Image Optimization and Alt Text: A Practical Checklist$t$, $t$Slow hero photos and missing alt text hurt both visitors and search rankings. This checklist fixes both in an afternoon.$t$, $c$## Why images decide your page speed

On most websites, images are the heaviest files on the page. A single unoptimized portrait can be several megabytes, which is slow on a mobile connection and drags down the loading metrics Google measures, especially Largest Contentful Paint (LCP). The same images are also a chance to be found in Google Images, if you describe them properly.

## Part 1: make images fast

### Choose the right format and size

- Use **WebP** (or AVIF) for photos and screenshots. At similar quality the files are typically much smaller than JPEG or PNG.
- Export at the size you display, not the size your camera produced. A hero portrait shown at 500 pixels wide rarely needs more than about 1000 pixels (for sharp high-density screens).
- Keep photos around 80% quality. The difference is hard to see; the file size difference is large.
- Use SVG for logos and simple icons.

### Tell the browser the dimensions

Always set `width` and `height` attributes on `<img>`. The browser can then reserve the space before the image arrives, which stops the page from jumping around (Cumulative Layout Shift).

### Load the important image first, and the rest later

- The main image at the top of the page (the LCP image) should **not** be lazy loaded. Give it `fetchpriority="high"` and consider a `<link rel="preload" as="image">` in the page head so the download starts before any script runs.
- Everything below the fold should use `loading="lazy"` so it only downloads when the visitor scrolls near it.
- Add `decoding="async"` so decoding does not block the page.

### Make the file easy to reach

- Serve images from a CDN or a host with long cache headers. A file whose name never changes can be cached for a long time.
- Open the connection early with `<link rel="preconnect">` if the images come from another domain, such as a storage service.
- Avoid animations that depend on heavy effects on large images, such as blur filters; they can delay the first paint on phones.

## Part 2: write good alt text

Alt text is the description of an image for people who cannot see it (screen reader users, slow connections) and for search engines.

### What good alt text looks like

- **Describe what the image shows and why it is there.** "Admin dashboard of a college management system showing attendance totals" beats "screenshot".
- **Keep it short**, usually under 125 characters.
- **Do not start with "image of" or "picture of".** Screen readers already announce that it is an image.
- **Use keywords only when they are natural.** Stuffing keywords is penalized and unpleasant for screen reader users.
- **Use an empty `alt=""` for purely decorative images**, such as background flourishes, so screen readers skip them.
- **Images that are links** should describe where the link goes.

### Examples

- Bad: `alt="img1.png"` or `alt="portrait portrait developer web developer"`
- Better: `alt="Portrait of a web developer smiling in a dark jacket"`

## A 10-minute audit

1. Open the page and look at the largest image. Is it under about 200 KB?
2. In the browser's Network tab, filter by images and sort by size.
3. Check every `<img>` in "View source" for `alt`, `width` and `height`.
4. Run Lighthouse and read the "Largest Contentful Paint element" report.
5. Make sure the share image (Open Graph) is about 1200 by 630 pixels and has a description.

## The takeaway

Optimize the few images that matter most, describe every meaningful image in plain words, and your site becomes faster, more accessible and easier to find. If you want to see how pages are made visible to crawlers in the first place, read [SEO for React apps](/blog/seo-for-react-apps-prerendering).
$c$, $t$Performance & SEO$t$, array['Performance','SEO','Accessibility','Web Development'], 'Muhammad Zeeshan Haider', true, now() - interval '26 days', 3, false, $t$Image Optimization and Alt Text Checklist$t$, $t$A practical checklist for fast-loading images and good alt text: formats, sizes, lazy loading, preloading the hero image and writing useful descriptions.$t$)
on conflict (slug) do nothing;

insert into public.insights (slug, title, excerpt, content, category, tags, author, published, published_at, reading_minutes, featured, seo_title, seo_description)
values ('plan-college-management-system', $t$How to Plan a College or School Management System Before Writing Code$t$, $t$Most failed school software fails before the first line of code. Here is a simple way to plan roles, data and workflows first.$t$, $c$## Start with people, not features

A school or college is a set of people with different jobs: administrators, principals, teachers, class representatives, students and parents. Software succeeds when each of them can finish their daily tasks faster than before. So the first question is not "what features do we add?" but "who does what today, and what is painful about it?"

## Step 1: list the roles and their daily tasks

Write one short paragraph per role.

- **Administrator:** manages accounts, classes, sections and reports.
- **Principal:** needs a clear overview, such as attendance totals, open concerns and announcements.
- **Teacher:** marks attendance, shares notices, sees students' concerns.
- **Class representative:** collects and passes on information for a class.
- **Student:** views attendance, announcements and submits concerns or forms.

If a role has no daily task you can name, it probably does not need an account in version one.

## Step 2: map the workflows

Draw each workflow as a few boxes and arrows: who starts it, what information moves, who approves, who is notified. Typical workflows are admissions, daily attendance, student concerns, announcements and report generation. Look for steps that are currently done on paper or in chat groups and are easy to lose.

## Step 3: define the data

For every workflow, list the things being stored: students, classes, sections, attendance records, concerns, announcements. Note which are linked, for example one class has many students and one student has many attendance records. This becomes your database design. Spending an hour here prevents weeks of rework later.

## Step 4: decide who can see and change what

Create a simple table with roles as columns and actions as rows. Mark each cell: can read, can create, can edit, can delete, or no access. Decide early that private information (such as personal contact details and concerns) is hidden from everyone who does not need it. These rules should be enforced in the database itself, not only hidden in the user interface. See [Supabase Row Level Security for beginners](/blog/supabase-row-level-security-beginners) for how.

## Step 5: choose a small first release

Pick one workflow that hurts the most and does not depend on the others. Attendance is often a good first choice: it happens every day, produces useful numbers and quickly shows whether people will use the system. Release it to one class, collect feedback for two weeks, and then expand.

## Step 6: plan for real-world conditions

- Many users will be on phones with limited data, so keep pages light.
- Staff turnover is common, so accounts and permissions should be easy to hand over.
- Data should be exportable, for example as PDF or spreadsheet reports.
- Someone must own the system after launch: training, support and backups.

## A one-page checklist

- Roles and daily tasks written down
- Workflows drawn
- Data entities and relationships listed
- Permission table completed
- First release limited to one workflow
- Owner and support plan named

## The takeaway

Good management software is mostly good planning. When the roles, workflows, data and permissions are clear, building the screens is the easy part. If you are planning one for your own institution, you can [start a project conversation](/start-project) with the details above.
$c$, $t$Education Technology$t$, array['Project Planning','Education Technology','Web Development'], 'Muhammad Zeeshan Haider', true, now() - interval '19 days', 3, false, $t$Plan a College or School Management System$t$, $t$A step-by-step planning guide for a college or school management system: roles, workflows, data, permissions and a sensible first release.$t$)
on conflict (slug) do nothing;

insert into public.insights (slug, title, excerpt, content, category, tags, author, published, published_at, reading_minutes, featured, seo_title, seo_description)
values ('netlify-supabase-full-stack-no-server', $t$Shipping a Full-Stack App with Only Netlify and Supabase$t$, $t$You can run a real full-stack app without managing a server: React on Netlify, Postgres and auth on Supabase. Here is the setup and its limits.$t$, $c$## The idea

A "serverless" setup lets you ship a complete app without renting or maintaining a server. Two services cover most small projects:

- **Netlify** builds and hosts your front end on a global CDN, runs small functions and handles redirects and headers.
- **Supabase** gives you a PostgreSQL database, authentication, file storage and an automatic API.

Your React app talks directly to Supabase from the browser, and Netlify serves the files.

## The architecture in one picture

1. The visitor loads static files from Netlify.
2. The browser calls Supabase to read public content or to sign in.
3. Row Level Security rules inside the database decide what each visitor may see or change.
4. For tasks that need a secret, such as sending an email, a Netlify function runs on the server side.

## Setting it up

1. Create a Supabase project and run your SQL (tables, policies, functions) in the SQL editor.
2. Create your own admin user in Authentication, then give that user an admin role in your profiles table. Turn off public sign-ups if only you should log in.
3. Put the project URL and the **anon key** into environment variables such as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Connect your repository to Netlify with the build command `npm run build` and publish directory `dist`.
5. Add the same environment variables in Netlify's site settings and deploy.
6. Add a rewrite rule so every path serves `index.html`, which makes client-side routing work on refresh.

## Security basics you must not skip

- Turn on Row Level Security for every table and test as an anonymous visitor.
- Only the anon key goes in front-end code. The **service role key** bypasses all security and must never be in the browser or the repository.
- Validate input in database functions, not only in the form.
- Add a honeypot field and rate limits to public forms to cut spam.
- Set security headers (for example `X-Content-Type-Options` and `X-Frame-Options`) in `netlify.toml`.
- Enable two-factor authentication on both your Netlify and Supabase accounts.

## Handling things that need a secret

Anything that needs a private key, such as sending email through a provider, must run on the server. A Netlify function is ideal: keep the key in an environment variable, check the request, do the work and return a result. The browser never sees the key.

## Honest limits

- Free plans have usage limits and a project can pause if it is inactive for a long time, so check the current terms before launching something important.
- Heavy background jobs, long-running tasks and complex server logic are better handled by a dedicated server or additional services.
- Because content is read at build time for prerendered pages, you may need to trigger a new deploy after publishing a lot of content. See [SEO for React apps](/blog/seo-for-react-apps-prerendering) for why that setup is worth it.

## The takeaway

For portfolios, small institutional systems and community tools, Netlify plus Supabase is a fast, low-cost and maintainable way to ship a real full-stack product. Keep the keys safe, let the database enforce permissions, and you can focus on the product instead of the server.
$c$, $t$Web Development$t$, array['Netlify','Supabase','React','Security','Web Development'], 'Muhammad Zeeshan Haider', true, now() - interval '12 days', 3, false, $t$Full-Stack App with Netlify and Supabase$t$, $t$How to build and deploy a full-stack React app with Netlify and Supabase: architecture, environment variables, security basics and honest limits.$t$)
on conflict (slug) do nothing;

insert into public.insights (slug, title, excerpt, content, category, tags, author, published, published_at, reading_minutes, featured, seo_title, seo_description)
values ('design-study-tools-students-use', $t$Designing Study Tools That Students Actually Use$t$, $t$Students abandon study apps that ask too much. Five design principles for tools that fit into real study routines.$t$, $c$## Why most study tools get abandoned

A study tool competes with a phone full of distractions. If it needs an account, a long setup or a lot of reading before it is useful, many students will close it and not return. The best educational tools remove friction and make the next useful action obvious.

## Principle 1: start fast

Aim for a student to be doing something useful within seconds of opening the page. Show a clear "continue where you stopped" button instead of an empty dashboard. Keep sign-in simple, and let people explore before asking for details.

## Principle 2: prefer practice over reading

People remember what they retrieve, not what they re-read. Build in active practice:

- Short quizzes and timed practice tests
- Flashcards and "mark as difficult" lists
- A revision queue that brings back hard questions on a schedule
- Interactive labs where students run code or work through a problem themselves

Always show the correct answer with a brief explanation after each attempt, so a mistake becomes a lesson.

## Principle 3: show progress honestly

Visible progress is motivating: chapters completed, questions answered, a streak of study days. Keep it honest and quiet. Avoid fake urgency and guilt-based notifications. A small progress bar and a "next step" suggestion do more than loud badges.

## Principle 4: design for the devices students really have

Many students study on a phone with limited data and an older browser. That means:

- Light pages and optimized images, as covered in [web image optimization](/blog/web-image-optimization-alt-text-checklist)
- Large tap targets and readable text sizes
- A dark and a light theme, since many people study at night
- Offline-friendly behaviour where possible, such as remembering your place

## Principle 5: make it accessible to everyone

Accessibility is good design for all learners.

- Use real headings, labels and buttons so screen readers can navigate.
- Provide sufficient colour contrast and never rely on colour alone to show right or wrong.
- Make every action possible with a keyboard, with a visible focus outline.
- Add alt text to meaningful images and captions to videos.
- Respect "reduce motion" settings for animated effects.

## Test with real students

Watch two or three students use the tool for ten minutes without helping them. Note where they hesitate, what they ignore and what they enjoy. One short session usually reveals more than weeks of guessing. Then fix the biggest friction first and test again.

## A quick checklist

- Can a new visitor start a useful activity in under 30 seconds?
- Is there active practice, not only reading?
- Is progress visible and honest?
- Does it work well on a small phone screen?
- Can it be used with a keyboard and a screen reader?

## The takeaway

The best study tool is the one students open every day. Keep the first step easy, let them practise, show progress and respect their devices and abilities. If you are planning an educational platform, [planning the system before writing code](/blog/plan-college-management-system) is a good place to begin.
$c$, $t$Education Technology$t$, array['Education Technology','Accessibility','Project Planning'], 'Muhammad Zeeshan Haider', true, now() - interval '5 days', 3, false, $t$Designing Study Tools Students Actually Use$t$, $t$Five practical design principles for educational web apps: quick starts, active practice, visible progress, accessibility and low-friction access.$t$)
on conflict (slug) do nothing;
