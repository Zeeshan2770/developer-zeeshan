// Database verification: runs supabase/schema.sql + phase2.sql in a real Postgres (PGlite, WASM)
// with minimal Supabase stubs (auth schema, storage tables, anon/authenticated roles) and exercises
// row-level security, the public RPCs, booking rules and triggers.
//   npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { generateSlots } from '../src/lib/booking.js';

const sql = (f) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), 'utf8');
const ADMIN = '00000000-0000-0000-0000-0000000000a1';
const USER = '00000000-0000-0000-0000-0000000000b2';

let db;

// Run `fn` as a Supabase-style role. Superuser bypasses RLS, so every access check uses this.
async function as(role, sub, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub || ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const anon = (fn) => as('anon', '', fn);
const authed = (sub, fn) => as('authenticated', sub, fn);
const rejects = async (p, re) => assert.rejects(p, (e) => (re ? re.test(String(e.message)) : true));

before(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  // pgcrypto is only used for gen_random_uuid(), which is built in; skip the extension in the test engine.
  await db.exec(sql('schema.sql').replace('create extension if not exists pgcrypto;', ''));
  await db.exec(sql('phase2.sql'));
  await db.exec(sql('phase3.sql'));
  await db.exec(sql('phase4.sql'));
  await db.exec(sql('phase7_seo.sql'));
  await db.exec(sql('phase8_email.sql'));
  // Supabase grants these by default on the public schema.
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant usage, select on all sequences in schema public to anon, authenticated;
    grant execute on all functions in schema public to anon, authenticated;
    grant select on all tables in schema storage to anon, authenticated;
    insert into auth.users (id, raw_user_meta_data) values ('${ADMIN}', '{"full_name":"Admin"}'), ('${USER}', '{"full_name":"Regular"}');
    update public.profiles set role = 'super_admin' where id = '${ADMIN}';
  `);
  // Phase 10 revokes anon's blanket SELECT on testimonials, so it must run after the blanket grant above
  // (on real Supabase the default grant exists before any SQL you run, so order is not an issue there).
  await db.exec(sql('phase10_testimonials.sql'));
});

// ---------- public read access ----------
test('visitors can read published content and settings', async () => {
  const r = await anon(async () => ({
    services: (await db.query('select count(*)::int n from public.services')).rows[0].n,
    projects: (await db.query('select count(*)::int n from public.projects')).rows[0].n,
    settings: (await db.query("select count(*)::int n from public.site_settings where key in ('site','booking')")).rows[0].n,
  }));
  assert.equal(r.services, 6);
  assert.equal(r.projects, 6);
  assert.equal(r.settings, 2);
});

test('unpublished rows are hidden from visitors but visible to admin', async () => {
  await db.exec("insert into public.projects (slug, name, published) values ('secret-draft', 'Secret', false)");
  const a = await anon(() => db.query("select 1 from public.projects where slug = 'secret-draft'"));
  assert.equal(a.rows.length, 0);
  const ad = await authed(ADMIN, () => db.query("select 1 from public.projects where slug = 'secret-draft'"));
  assert.equal(ad.rows.length, 1);
});

test('visitors cannot read private tables or write directly', async () => {
  for (const t of ['project_inquiries', 'messages', 'appointments', 'notifications', 'admin_activity', 'analytics_events']) {
    const r = await anon(() => db.query(`select 1 from public.${t}`));
    assert.equal(r.rows.length, 0, `${t} leaked rows`);
  }
  await rejects(anon(() => db.query("insert into public.messages (name,email,message) values ('x','x@y.zz','hi')")));
  await rejects(anon(() => db.query("insert into public.project_inquiries (inquiry_code,full_name,email,description,consent) values ('X','x','x@y.zz','d',true)")));
  await rejects(anon(() => db.query("update public.projects set name = 'hacked'")).then(async () => {
    const n = (await db.query("select count(*)::int n from public.projects where name = 'hacked'")).rows[0].n;
    assert.equal(n, 0);
    throw new Error('ok');
  }), /ok|permission|policy/);
});

// ---------- project inquiry RPC ----------
const inquiry = (o = {}) => ({ full_name: 'Sara Khan', email: 'sara@example.com', description: 'We need a classroom system.', consent: true, ...o });

test('valid inquiry is stored with a code, status New, and notifies admin', async () => {
  const code = (await anon(() => db.query('select public.submit_project_inquiry($1) c', [inquiry()]))).rows[0].c;
  assert.match(code, /^INQ-\d+$/);
  const row = (await db.query('select status, consent from public.project_inquiries where inquiry_code = $1', [code])).rows[0];
  assert.equal(row.status, 'New');
  assert.equal(row.consent, true);
  const n = (await db.query("select count(*)::int n from public.notifications where kind = 'new_inquiry'")).rows[0].n;
  assert.equal(n, 1);
});

test('inquiry rejects bad email, missing consent and missing fields', async () => {
  await rejects(anon(() => db.query('select public.submit_project_inquiry($1)', [inquiry({ email: 'nope' })])), /invalid_input/);
  await rejects(anon(() => db.query('select public.submit_project_inquiry($1)', [inquiry({ consent: false })])), /consent_required/);
  await rejects(anon(() => db.query('select public.submit_project_inquiry($1)', [inquiry({ description: '   ' })])), /invalid_input/);
});

test('inquiry honeypot stores nothing; rate limit stops the 4th per hour', async () => {
  const before = (await db.query('select count(*)::int n from public.project_inquiries')).rows[0].n;
  const fake = (await anon(() => db.query('select public.submit_project_inquiry($1) c', [inquiry({ email: 'bot@example.com', website_hp: 'http://spam' })]))).rows[0].c;
  assert.equal(fake, 'INQ-0000');
  assert.equal((await db.query('select count(*)::int n from public.project_inquiries')).rows[0].n, before);

  for (let i = 0; i < 3; i += 1) await anon(() => db.query('select public.submit_project_inquiry($1)', [inquiry({ email: 'rate@example.com' })]));
  await rejects(anon(() => db.query('select public.submit_project_inquiry($1)', [inquiry({ email: 'rate@example.com' })])), /rate_limited/);
});

test('inquiry strips control characters and truncates long input', async () => {
  const c = (await anon(() => db.query('select public.submit_project_inquiry($1) c', [inquiry({ email: 'long@example.com', full_name: `Ali\u0007${'x'.repeat(500)}` })]))).rows[0].c;
  const name = (await db.query('select full_name from public.project_inquiries where inquiry_code = $1', [c])).rows[0].full_name;
  assert.equal(name.length, 120);
  assert.ok(!name.includes('\u0007'));
});

// ---------- contact RPC ----------
test('contact message: stored as Unread, validated, rate limited', async () => {
  await anon(() => db.query('select public.submit_contact_message($1)', [{ name: 'Omar', email: 'omar@example.com', subject: 'Hi', message: 'Hello there' }]));
  const m = (await db.query("select status from public.messages where email = 'omar@example.com'")).rows[0];
  assert.equal(m.status, 'Unread');
  await rejects(anon(() => db.query('select public.submit_contact_message($1)', [{ name: 'Omar', email: 'bad', message: 'x' }])), /invalid_input/);
  // The limit is 10 messages per email per hour: the 10th succeeds, the 11th is refused.
  for (let i = 0; i < 10; i += 1) await anon(() => db.query('select public.submit_contact_message($1)', [{ name: 'S', email: 'spam@example.com', message: 'm' }]));
  await rejects(anon(() => db.query('select public.submit_contact_message($1)', [{ name: 'S', email: 'spam@example.com', message: 'm' }])), /rate_limited/);
});

// ---------- booking ----------
const cfg = async () => (await db.query("select value from public.site_settings where key = 'booking'")).rows[0].value;
const book = (startsMs, o = {}) => anon(() => db.query('select public.request_appointment($1) c', [{
  purpose: 'Discuss a project', appointment_type: 'Video call', name: 'Bilal', email: o.email || 'bilal@example.com',
  starts_at: new Date(startsMs).toISOString(), ...o.extra,
}]));

test('a generated slot books successfully; the same slot cannot be booked twice', async () => {
  const slots = generateSlots(await cfg(), [], [], Date.now());
  assert.ok(slots.length > 0, 'client generated no slots');
  const code = (await book(slots[0].start)).rows[0].c;
  assert.match(code, /^BK-[A-F0-9]{6}$/);
  await rejects(book(slots[0].start, { email: 'other@example.com' }), /slot_taken/);
  // overlapping start (15 min later) also collides
  await rejects(book(slots[0].start + 15 * 60e3, { email: 'other2@example.com' }), /slot_unavailable|slot_taken/);
});

test('server rejects misaligned, weekend, past and too-far-ahead times', async () => {
  const slots = generateSlots(await cfg(), [], [], Date.now());
  const s = slots[3];
  await rejects(book(s.start + 10 * 60e3, { email: 'a1@example.com' }), /slot_unavailable/);          // not on the slot grid
  await rejects(book(Date.now() - 86400e3, { email: 'a2@example.com' }), /slot_unavailable/);          // past
  await rejects(book(Date.now() + 200 * 86400e3, { email: 'a3@example.com' }), /slot_unavailable/);    // beyond horizon
  // next Saturday 10:00 Karachi (05:00 UTC)
  const d = new Date(); d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
  const sat = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 5, 0);
  await rejects(book(sat, { email: 'a4@example.com' }), /slot_unavailable/);
});

test('blocked dates and daily maximum are enforced', async () => {
  const slots = generateSlots(await cfg(), [], [], Date.now());
  const target = slots.find((s) => new Date(s.start).getUTCDate() !== new Date(slots[0].start).getUTCDate());
  const day = new Date(target.start + 5 * 3600e3).toISOString().slice(0, 10); // Karachi calendar date
  await db.query('insert into public.blocked_dates (day, reason) values ($1, $2)', [day, 'holiday']);
  await rejects(book(target.start, { email: 'b1@example.com' }), /slot_unavailable/);
  await db.query('delete from public.blocked_dates');

  await db.exec("update public.site_settings set value = jsonb_set(value, '{maxPerDay}', '1') where key = 'booking'");
  const c2 = await cfg();
  const free = generateSlots(c2, [], [], Date.now()).filter((s) => new Date(s.start + 5 * 3600e3).toISOString().slice(0, 10) === day);
  await book(free[0].start, { email: 'b2@example.com' });
  await rejects(book(free[1].start, { email: 'b3@example.com' }), /day_full/);
  await db.exec("update public.site_settings set value = jsonb_set(value, '{maxPerDay}', '4') where key = 'booking'");
});

test('disabled booking refuses requests; visitors only see anonymous booked slots', async () => {
  const booked = await anon(() => db.query('select * from public.get_booked_slots(now(), now() + interval \'60 days\')'));
  assert.ok(booked.rows.length >= 1);
  assert.deepEqual(Object.keys(booked.rows[0]).sort(), ['ends_at', 'starts_at']);
  await db.exec("update public.site_settings set value = jsonb_set(value, '{enabled}', 'false') where key = 'booking'");
  const slots = generateSlots({ ...(await cfg()), enabled: true }, [], [], Date.now());
  await rejects(book(slots[5].start, { email: 'c1@example.com' }), /booking_disabled/);
  await db.exec("update public.site_settings set value = jsonb_set(value, '{enabled}', 'true') where key = 'booking'");
});

// ---------- authorization ----------
test('a signed-in non-admin sees nothing private and cannot self-promote', async () => {
  const inq = await authed(USER, () => db.query('select 1 from public.project_inquiries'));
  assert.equal(inq.rows.length, 0);
  const upd = await authed(USER, () => db.query(`update public.profiles set role = 'super_admin' where id = '${USER}' returning id`));
  assert.equal(upd.rows.length, 0);
  assert.equal((await db.query(`select role from public.profiles where id = '${USER}'`)).rows[0].role, 'none');
  await rejects(authed(USER, () => db.query('select public.admin_analytics(7)')), /forbidden/);
});

test('admin can read and manage private data', async () => {
  const inq = await authed(ADMIN, () => db.query('select id from public.project_inquiries limit 1'));
  assert.equal(inq.rows.length, 1);
  const upd = await authed(ADMIN, () => db.query("update public.project_inquiries set priority = 'High' where id = $1 returning priority", [inq.rows[0].id]));
  assert.equal(upd.rows[0].priority, 'High');
  const an = await authed(ADMIN, () => db.query('select public.admin_analytics(30) a'));
  assert.ok('totals' in an.rows[0].a);
});

test('new auth users default to no access', async () => {
  await db.exec("insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c3')");
  const r = (await db.query("select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c3'")).rows[0];
  assert.equal(r.role, 'none');
});

// ---------- triggers, analytics, storage ----------
test('status changes create notifications', async () => {
  const appt = (await db.query("select id from public.appointments limit 1")).rows[0];
  await authed(ADMIN, () => db.query("update public.appointments set status = 'Confirmed' where id = $1", [appt.id]));
  assert.equal((await db.query("select count(*)::int n from public.notifications where kind = 'appointment_confirmed'")).rows[0].n, 1);
  const lead = (await db.query('select id from public.project_inquiries limit 1')).rows[0];
  await authed(ADMIN, () => db.query("update public.project_inquiries set status = 'Contacted' where id = $1", [lead.id]));
  assert.ok((await db.query("select count(*)::int n from public.notifications where kind = 'lead_changed'")).rows[0].n >= 1);
});

test('analytics: visitors may insert capped events but never read them', async () => {
  await anon(() => db.query("insert into public.analytics_events (event, path) values ('page_view', '/')"));
  await rejects(anon(() => db.query("insert into public.analytics_events (event, path) values ('hack', '/')")));
  await rejects(anon(() => db.query('insert into public.analytics_events (event, path) values ($1, $2)', ['page_view', 'x'.repeat(300)])));
  assert.equal((await anon(() => db.query('select 1 from public.analytics_events'))).rows.length, 0);
});

test('project view counter increments only for published projects', async () => {
  await anon(() => db.query("select public.increment_project_view('aspire-cr-connect')"));
  await anon(() => db.query("select public.increment_project_view('secret-draft')"));
  assert.equal((await db.query("select view_count from public.projects where slug = 'aspire-cr-connect'")).rows[0].view_count, 1);
  assert.equal((await db.query("select view_count from public.projects where slug = 'secret-draft'")).rows[0].view_count, 0);
});

test('media bucket is configured with MIME and size limits', async () => {
  const b = (await db.query("select file_size_limit, allowed_mime_types from storage.buckets where id = 'media'")).rows[0];
  assert.equal(Number(b.file_size_limit), 5242880);
  assert.ok(b.allowed_mime_types.includes('image/webp'));
  assert.ok(!b.allowed_mime_types.includes('text/html'));
});

// ---------- moderated testimonials ----------
const testi = (o = {}) => ({ name: 'Hina Malik', role: 'Teacher', organization: 'City College', rating: 5, message: 'Working together was smooth and the system saved us hours every week.', consent: true, ...o });

test('visitor testimonial is stored UNPUBLISHED, hidden from the public, and notifies admin', async () => {
  await anon(() => db.query('select public.submit_testimonial($1)', [testi()]));
  const row = (await db.query("select published, featured, rating from public.testimonials where name = 'Hina Malik'")).rows[0];
  assert.equal(row.published, false);
  assert.equal(row.featured, false);
  assert.equal(row.rating, 5);
  assert.equal((await anon(() => db.query('select 1 from public.testimonials'))).rows.length, 0, 'unapproved testimonial leaked');
  assert.equal((await authed(ADMIN, () => db.query('select 1 from public.testimonials'))).rows.length, 1);
  assert.ok((await db.query("select count(*)::int n from public.notifications where kind = 'new_testimonial'")).rows[0].n >= 1);
  // approving it makes it public
  await authed(ADMIN, () => db.query("update public.testimonials set published = true where name = 'Hina Malik'"));
  assert.equal((await anon(() => db.query('select 1 from public.testimonials'))).rows.length, 1);
  await authed(ADMIN, () => db.query("delete from public.testimonials"));
});

test('community-service testimonial fields are stored, whitelisted and name preference is applied', async () => {
  await anon(() => db.query('select public.submit_testimonial($1)', [testi({
    relationship: 'Volunteer', organization_type: 'NGO / non-profit', location: 'Lahore, Pakistan', program: 'Food drive',
    period: '2025', impact: 'Reached 300 families', website_url: 'https://example.org', contact_email: 'Hina@Example.org', display_as: 'first',
  })]));
  const r = (await db.query("select * from public.testimonials order by created_at desc limit 1")).rows[0];
  assert.equal(r.name, 'Hina M.');
  assert.equal(r.submitted_name, 'Hina Malik');
  assert.equal(r.relationship, 'Volunteer');
  assert.equal(r.organization_type, 'NGO / non-profit');
  assert.equal(r.contact_email, 'hina@example.org');
  assert.equal(r.source, 'website');
  assert.equal(r.verified, false);
  assert.ok(r.consent_at);
  await db.exec('delete from public.testimonials');

  await anon(() => db.query('select public.submit_testimonial($1)', [testi({
    relationship: 'Hacker', organization_type: '<b>x</b>', website_url: 'javascript:alert(1)', contact_email: 'nope', display_as: 'anonymous',
  })]));
  const bad = (await db.query('select * from public.testimonials')).rows[0];
  assert.equal(bad.name, 'Anonymous');
  assert.equal(bad.submitted_name, 'Hina Malik');
  assert.equal(bad.relationship, null);
  assert.equal(bad.organization_type, null);
  assert.equal(bad.website_url, null);
  assert.equal(bad.contact_email, null);
  await db.exec('delete from public.testimonials');
});

test('private testimonial columns (real name, email, notes) are unreadable by the public but readable by admin', async () => {
  await anon(() => db.query('select public.submit_testimonial($1)', [testi({ contact_email: 'a@b.co' })]));
  await db.exec("update public.testimonials set published = true");
  const pub = await anon(() => db.query('select name, relationship, impact, verified from public.testimonials'));
  assert.equal(pub.rows.length, 1);
  for (const col of ['contact_email', 'submitted_name', 'verification_note', 'consent_at', 'source']) {
    await rejects(anon(() => db.query(`select ${col} from public.testimonials`)), /permission denied/);
  }
  await rejects(anon(() => db.query('select * from public.testimonials')), /permission denied/);
  const adm = await authed(ADMIN, () => db.query('select contact_email, submitted_name from public.testimonials'));
  assert.equal(adm.rows[0].contact_email, 'a@b.co');
  await db.exec('delete from public.testimonials');
});

test('testimonial submission validates, ignores bad ratings, honeypot, and is rate limited', async () => {
  await rejects(anon(() => db.query('select public.submit_testimonial($1)', [testi({ message: 'too short' })])), /invalid_input/);
  await rejects(anon(() => db.query('select public.submit_testimonial($1)', [testi({ name: ' ' })])), /invalid_input/);
  await rejects(anon(() => db.query('select public.submit_testimonial($1)', [testi({ consent: false })])), /consent_required/);
  await rejects(anon(() => db.query("insert into public.testimonials (name, message, published) values ('x','y',true)")));
  await anon(() => db.query('select public.submit_testimonial($1)', [testi({ website_hp: 'spam' })]));
  assert.equal((await db.query('select count(*)::int n from public.testimonials')).rows[0].n, 0, 'honeypot stored a row');
  await anon(() => db.query('select public.submit_testimonial($1)', [testi({ rating: 99 })]));
  assert.equal((await db.query('select rating from public.testimonials')).rows[0].rating, null, 'out-of-range rating kept');
  for (let i = 0; i < 4; i += 1) await anon(() => db.query('select public.submit_testimonial($1)', [testi()]));
  await rejects(anon(() => db.query('select public.submit_testimonial($1)', [testi()])), /rate_limited/);
  await db.exec('delete from public.testimonials');
});

test('project custom sections: stored as a JSON array, admin-only write, public read when published', async () => {
  await authed(ADMIN, () => db.query("insert into public.projects (slug, name, published, sections) values ('sec-demo','Sec',true,$1)", [JSON.stringify([{ title: 'Impact', body: 'Real text' }])]));
  const pub = (await anon(() => db.query("select sections from public.projects where slug = 'sec-demo'"))).rows[0];
  assert.equal(pub.sections[0].title, 'Impact');
  await rejects(db.query("update public.projects set sections = '{\"a\":1}'::jsonb where slug = 'sec-demo'"), /projects_sections_is_array|check/);
  await rejects(anon(() => db.query("update public.projects set sections = '[]' where slug = 'sec-demo'")).then((r) => { if (r.rowCount === 0) throw new Error('denied'); }), /denied|permission|row-level/);
  await db.exec("delete from public.projects where slug = 'sec-demo'");
});

test('schema, phase2 and phase3 SQL are re-runnable (idempotent)', async () => {
  await db.exec(sql('schema.sql').replace('create extension if not exists pgcrypto;', ''));
  await db.exec(sql('phase2.sql'));
  await db.exec(sql('phase3.sql'));
  await db.exec(sql('phase4.sql'));
  assert.equal((await db.query('select count(*)::int n from public.services')).rows[0].n, 6);
  assert.equal((await db.query('select count(*)::int n from public.journey_entries')).rows[0].n, 8);
});

// ---------- SEO columns (phase7) ----------
test('phase7: projects and insights carry per-record SEO fields; migration is re-runnable', async () => {
  await db.exec(sql('phase7_seo.sql'));
  for (const t of ['projects', 'insights']) {
    const cols = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [t])).rows.map((r) => r.column_name);
    for (const c of ['seo_title', 'seo_description', 'og_image', 'noindex']) assert.ok(cols.includes(c), `${t}.${c} missing`);
  }
  assert.equal((await db.query("select noindex from public.projects where slug = 'aspire-cr-connect'")).rows[0].noindex, false);
});

// ---------- email notification claims (phase8) ----------
test('phase8: claim_notification hands out a fresh submission exactly once, never old or unknown ones', async () => {
  await anon(() => db.query('select public.submit_project_inquiry($1)', [{ full_name: 'Claim Test', email: 'claim@example.com', description: 'A fresh inquiry', consent: true }]));
  const code = (await db.query("select inquiry_code from public.project_inquiries where email = 'claim@example.com'")).rows[0].inquiry_code;
  const first = (await anon(() => db.query("select public.claim_notification('inquiry', $1) r", [code]))).rows[0].r;
  assert.equal(first.name, 'Claim Test');
  assert.equal(first.email, 'claim@example.com');
  assert.equal((await anon(() => db.query("select public.claim_notification('inquiry', $1) r", [code]))).rows[0].r, null, 'second claim must be empty');
  assert.equal((await anon(() => db.query("select public.claim_notification('inquiry', 'INQ-99999') r"))).rows[0].r, null);
  // an old submission can never be claimed
  await db.query("update public.project_inquiries set notified_at = null, created_at = now() - interval '2 hours' where inquiry_code = $1", [code]);
  assert.equal((await anon(() => db.query("select public.claim_notification('inquiry', $1) r", [code]))).rows[0].r, null);
  // unknown kinds do nothing
  assert.equal((await anon(() => db.query("select public.claim_notification('payments', 'x') r"))).rows[0].r, null);
});

test('phase8: contact messages are claimed by the visitor email once, oldest first', async () => {
  await anon(() => db.query('select public.submit_contact_message($1)', [{ name: 'Msg Test', email: 'msg@example.com', message: 'Hello there' }]));
  const a = (await anon(() => db.query("select public.claim_notification('message', 'MSG@example.com') r"))).rows[0].r;
  assert.equal(a.message, 'Hello there');
  assert.equal((await anon(() => db.query("select public.claim_notification('message', 'msg@example.com') r"))).rows[0].r, null);
});

test('phase8: visitors still cannot read the tables directly', async () => {
  assert.equal((await anon(() => db.query('select 1 from public.project_inquiries'))).rows.length, 0);
  assert.equal((await anon(() => db.query('select 1 from public.messages'))).rows.length, 0);
});

// ---------- phase 11: alt-text columns, tag index and the six seeded articles ----------
test('phase11: adds alt columns, backfills settings/project alt text and seeds valid published articles; re-runnable', async () => {
  await db.exec(`
    insert into public.site_settings (key, value) values ('site', '{"name":"Z Haider","seo":{"keywords":"web dev"}}'::jsonb) on conflict (key) do update set value = excluded.value;
    insert into public.projects (slug, name, thumbnail_url, published) values ('x-proj', 'X', '/projects/cs-home.webp', true) on conflict (slug) do nothing;
  `);
  await db.exec(sql('phase11_seo_images_tags.sql'));
  await db.exec(sql('phase11_seo_images_tags.sql')); // second run must not fail or duplicate
  const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and column_name in ('cover_alt','thumbnail_alt')`)).rows.map((r) => r.column_name).sort();
  assert.deepEqual(cols, ['cover_alt', 'thumbnail_alt']);
  const st = (await db.query(`select value from public.site_settings where key='site'`)).rows[0].value;
  assert.match(st.profileImageAlt, /Portrait of Z Haider/);
  assert.ok(st.seo.ogImageAlt && st.seo.knowsAbout);
  assert.match(st.seo.keywords, /^web dev, .*React SEO/);
  assert.equal((st.seo.keywords.match(/React SEO/g) || []).length, 1, 'keywords are appended once');
  const proj = (await db.query(`select thumbnail_alt from public.projects where slug='x-proj'`)).rows[0];
  assert.match(proj.thumbnail_alt, /CS Compass home screen/);
  const rows = (await db.query(`select slug, title, excerpt, tags, published, reading_minutes, seo_title, seo_description, content from public.insights where slug in (
    'seo-for-react-apps-prerendering','supabase-row-level-security-beginners','web-image-optimization-alt-text-checklist','plan-college-management-system','netlify-supabase-full-stack-no-server','design-study-tools-students-use')`)).rows;
  assert.equal(rows.length, 6);
  for (const r of rows) {
    assert.ok(r.published && r.reading_minutes >= 2);
    assert.ok(r.seo_title.length <= 60, `${r.slug} seo_title ${r.seo_title.length}`);
    assert.ok(r.seo_description.length >= 120 && r.seo_description.length <= 155, `${r.slug} seo_description ${r.seo_description.length}`);
    assert.ok(r.tags.length >= 3 && r.content.split(/\s+/).length > 450);
  }
  // every tag used is shared by at least two articles, so every tag page can be indexed
  const count = {};
  rows.forEach((r) => r.tags.forEach((t) => { count[t] = (count[t] || 0) + 1; }));
  assert.ok(Object.values(count).every((n) => n >= 2), JSON.stringify(count));
  // visitors can read them, and cannot change them
  const seen = await anon(() => db.query(`select slug from public.insights where published`));
  assert.ok(seen.rows.length >= 6);
  await anon(() => rejects(db.query(`update public.insights set title = 'x' where slug = 'plan-college-management-system'`).then((r) => { if (r.affectedRows === 0) throw new Error('denied'); })));
});
