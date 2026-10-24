// Fast unit tests: input sanitization, slugs, timezone/slot generation, share-preview injection.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, isEmail, isPhone, isUrlish, slugify, socialLinks } from '../src/lib/validate.js';
import { generateSlots, zonedToUtc, dateKeyInTz } from '../src/lib/booking.js';
import { resolveSeo } from '../src/lib/seo.js';
import { injectMeta, esc } from '../netlify/edge-functions/og.js';
import { readFileSync } from 'node:fs';
import { ORG_TYPES, RELATIONSHIPS, shortName } from '../src/lib/testimonials.js';

test('clean() strips HTML tags and control characters and enforces length', () => {
  assert.equal(clean('<script>alert(1)</script>Hello'), 'alert(1)Hello');
  assert.equal(clean('a\u0007b'), 'ab');
  assert.equal(clean('x'.repeat(50), 10).length, 10);
  assert.equal(clean(null), '');
});

test('email / phone / url validators', () => {
  assert.ok(isEmail('a@b.co'));
  assert.ok(!isEmail('a@b'));
  assert.ok(!isEmail('a b@c.com'));
  assert.ok(isPhone('+92 300 1234567'));
  assert.ok(!isPhone('abc'));
  assert.ok(isPhone(''));
  assert.ok(isUrlish('example.com/page'));
  assert.ok(!isUrlish('not a url'));
});

test('slugify produces safe slugs', () => {
  assert.equal(slugify('Aspire CR Connect!'), 'aspire-cr-connect');
  assert.equal(slugify('  --Hello__World--  '), 'hello-world');
  assert.equal(slugify('../../etc/passwd'), 'etc-passwd');
  assert.equal(slugify(''), '');
});

test('zonedToUtc converts wall-clock time correctly, including DST', () => {
  assert.equal(new Date(zonedToUtc(2026, 10, 12, 10, 0, 'Asia/Karachi')).toISOString(), '2026-10-12T05:00:00.000Z');
  assert.equal(new Date(zonedToUtc(2026, 7, 1, 9, 0, 'America/New_York')).toISOString(), '2026-07-01T13:00:00.000Z');
  assert.equal(new Date(zonedToUtc(2026, 1, 12, 9, 0, 'America/New_York')).toISOString(), '2026-01-12T14:00:00.000Z');
  assert.equal(new Date(zonedToUtc(2026, 6, 1, 9, 0, 'Europe/London')).toISOString(), '2026-06-01T08:00:00.000Z');
});

const base = { enabled: true, timezone: 'Asia/Karachi', days: [1, 2, 3, 4, 5], start: '10:00', end: '12:00', durationMin: 30, bufferMin: 15, maxPerDay: 2, minNoticeHours: 12, horizonDays: 14 };
const NOW = Date.UTC(2026, 9, 9, 6, 0); // Fri 9 Oct 2026, 11:00 in Karachi

test('slots respect days, hours, buffer, notice window and horizon', () => {
  const slots = generateSlots(base, [], [], NOW);
  assert.ok(slots.length > 0);
  for (const s of slots) {
    const local = new Date(s.start + 5 * 3600e3); // Karachi wall clock
    assert.ok(base.days.includes(local.getUTCDay()), 'weekend slot');
    const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
    assert.ok(mins >= 600 && mins + 30 <= 720, 'outside hours');
    assert.equal((mins - 600) % 45, 0, 'off the duration+buffer grid');
    assert.ok(s.start >= NOW + 12 * 3600e3, 'inside notice window');
    assert.ok(s.start <= NOW + 14 * 86400e3, 'beyond horizon');
  }
  // Friday 9 Oct at 10:00 PKT has already passed, so the first slot is the next working day (Mon 12 Oct)
  assert.equal(dateKeyInTz(slots[0].start, 'Asia/Karachi'), '2026-10-12');
});

test('booked, blocked and full days are removed', () => {
  const all = generateSlots(base, [], [], NOW);
  const first = all[0];
  assert.ok(!generateSlots(base, [{ start: first.start, end: first.end }], [], NOW).some((s) => s.start === first.start));
  assert.ok(!generateSlots(base, [], ['2026-10-12'], NOW).some((s) => dateKeyInTz(s.start, 'Asia/Karachi') === '2026-10-12'));
  const two = all.filter((s) => dateKeyInTz(s.start, 'Asia/Karachi') === '2026-10-12').slice(0, 2).map((s) => ({ start: s.start, end: s.end }));
  assert.ok(!generateSlots(base, two, [], NOW).some((s) => dateKeyInTz(s.start, 'Asia/Karachi') === '2026-10-12'));
  assert.deepEqual(generateSlots({ ...base, enabled: false }, [], [], NOW), []);
});

test('share-preview injection escapes content and replaces title/description', () => {
  const html = '<html><head><title>Old</title><meta name="description" content="old" /></head><body></body></html>';
  const out = injectMeta(html, { title: 'A "bold" <b>title</b>', description: 'x & y', url: 'https://e.com/p/1', image: 'https://e.com/i.png' });
  assert.ok(out.includes('<title>A &quot;bold&quot; &lt;b&gt;title&lt;/b&gt;</title>'));
  assert.ok(!out.includes('content="old"'));
  assert.ok(out.includes('og:image'));
  assert.ok(out.includes('x &amp; y'));
  assert.equal(esc('<>"&'), '&lt;&gt;&quot;&amp;');
});

test('socialLinks keeps only safe http(s) profiles and caps labels', () => {
  const out = socialLinks({ github: 'https://github.com/x', linkedin: '', extra: [
    { label: 'YouTube', url: 'https://youtube.com/@x' }, { label: 'Bad', url: 'javascript:alert(1)' }, { label: '', url: 'https://a.com' }, { label: 'X' } ] });
  assert.deepEqual(out.map((o) => o.label), ['GitHub', 'YouTube']);
  assert.deepEqual(socialLinks(undefined), []);
});

test('resolveSeo: record override > page override > props > site defaults; noindex wins', () => {
  const settings = { site_name: 'Zeeshan', seo: { titleTemplate: '%s | %name', defaultDescription: 'Site desc', keywords: 'a, b', pages: { '/about': { title: 'About override' } } } };
  const base = resolveSeo({ settings, path: '/about', title: 'About' });
  assert.ok(base.title.startsWith('About override'));
  assert.equal(base.description, 'Site desc');
  const rec = resolveSeo({ settings, path: '/projects/x', title: 'X', record: { title: 'Custom', description: 'Rec desc', noindex: true } });
  assert.ok(rec.title.startsWith('Custom'));
  assert.equal(rec.description, 'Rec desc');
  assert.match(rec.robots, /noindex/);
  assert.match(resolveSeo({ settings: { seo: { noindexSite: true } }, path: '/', title: 'Home' }).robots, /noindex/);
});

// ---------- email notifications ----------
import { handleNotify, ownerEmail, autoReplyEmail, detailRows } from '../netlify/lib/notify-core.js';

const ROW = { kind: 'inquiry', code: 'INQ-1001', name: 'Sara <b>Khan</b>', email: 'sara@example.com', phone: '', description: 'Need a site\nfor our college', budget: 'PKR 100k', contact_method: 'WhatsApp' };
const ENV = { RESEND_API_KEY: 're_test', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon', VITE_SITE_URL: 'https://z.dev', NOTIFY_FROM: 'Z <hi@z.dev>' };
function fakeFetch({ row = ROW, settings = { email: 'owner@z.dev', name: 'Zeeshan Haider', timezone: 'Asia/Karachi' }, claimOk = true, resendOk = true } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const ok = (b) => ({ ok: true, status: 200, json: async () => b });
    if (String(url).includes('/site_settings')) return ok([{ value: settings }]);
    if (String(url).includes('/rpc/claim_notification')) return claimOk ? ok(row) : { ok: false, status: 404, json: async () => ({}) };
    if (String(url).includes('api.resend.com')) return resendOk ? ok({ id: 'e1' }) : { ok: false, status: 422, json: async () => ({}) };
    throw new Error('unexpected ' + url);
  };
  return { f, calls, mails: () => calls.filter((c) => c.url.includes('resend')).map((c) => JSON.parse(c.init.body)) };
}

test('notify: rejects bad kinds and refs without touching anything', async () => {
  const t = fakeFetch();
  for (const bad of [null, {}, { kind: 'x', ref: 'a' }, { kind: 'inquiry' }, { kind: 'inquiry', ref: 'a'.repeat(300) }]) {
    assert.equal((await handleNotify(bad, ENV, t.f)).status, 400);
  }
  assert.equal(t.calls.length, 0);
});

test('notify: without RESEND_API_KEY nothing is claimed (so setting it up later loses nothing)', async () => {
  const t = fakeFetch();
  const r = await handleNotify({ kind: 'inquiry', ref: 'INQ-1001' }, { ...ENV, RESEND_API_KEY: '' }, t.f);
  assert.equal(r.body.skipped, 'email_not_configured');
  assert.equal(t.calls.length, 0);
});

test('notify: owner alert + visitor confirmation are sent, escaped, with the right reply-to', async () => {
  const t = fakeFetch();
  const r = await handleNotify({ kind: 'inquiry', ref: 'INQ-1001' }, ENV, t.f);
  assert.equal(r.body.sent, 2);
  const [owner, visitor] = t.mails();
  assert.deepEqual(owner.to, ['owner@z.dev']);
  assert.equal(owner.reply_to, 'sara@example.com');
  assert.equal(owner.from, 'Z <hi@z.dev>');
  assert.ok(!owner.html.includes('<b>Khan'), 'visitor text must be escaped in HTML');
  assert.match(owner.html, /Sara &lt;b&gt;Khan&lt;\/b&gt;/);
  assert.ok(!/[\r\n]/.test(owner.subject), 'subject is a single line');
  assert.deepEqual(visitor.to, ['sara@example.com']);
  assert.equal(visitor.reply_to, 'owner@z.dev');
  assert.match(visitor.text, /INQ-1001/);
  assert.match(visitor.text, /by WhatsApp/);
  assert.ok(!/guarantee|within \d+ hours|price/i.test(visitor.text), 'no invented promises');
});

test('notify: switches in Admin are respected, and NOTIFY_TO_EMAIL wins', async () => {
  let t = fakeFetch({ settings: { email: 'owner@z.dev', notify: { autoReply: false } } });
  assert.equal((await handleNotify({ kind: 'inquiry', ref: 'INQ-1001' }, ENV, t.f)).body.sent, 1);
  assert.deepEqual(t.mails()[0].to, ['owner@z.dev']);
  t = fakeFetch({ settings: { email: 'owner@z.dev', notify: { ownerAlerts: false } } });
  assert.equal((await handleNotify({ kind: 'inquiry', ref: 'INQ-1001' }, ENV, t.f)).body.sent, 1);
  t = fakeFetch({ settings: { email: 'owner@z.dev', notify: { ownerAlerts: false, autoReply: false } } });
  assert.equal((await handleNotify({ kind: 'inquiry', ref: 'INQ-1001' }, ENV, t.f)).body.skipped, 'disabled');
  assert.equal(t.calls.filter((c) => c.url.includes('claim')).length, 0, 'nothing claimed when everything is off');
  t = fakeFetch();
  await handleNotify({ kind: 'inquiry', ref: 'INQ-1001' }, { ...ENV, NOTIFY_TO_EMAIL: 'me@else.dev' }, t.f);
  assert.deepEqual(t.mails()[0].to, ['me@else.dev']);
});

test('notify: nothing pending, failed claim and failed sending are all quiet and safe', async () => {
  assert.equal((await handleNotify({ kind: 'message', ref: 'a@b.co' }, ENV, fakeFetch({ row: null }).f)).body.skipped, 'nothing_pending');
  assert.equal((await handleNotify({ kind: 'message', ref: 'a@b.co' }, ENV, fakeFetch({ claimOk: false }).f)).body.skipped, 'claim_failed');
  const r = await handleNotify({ kind: 'inquiry', ref: 'INQ-1001' }, ENV, fakeFetch({ resendOk: false }).f);
  assert.equal(r.status, 200); assert.equal(r.body.sent, 0);
});

test('notify: booking time is shown in the site timezone and marked as not confirmed', () => {
  const row = { kind: 'appointment', code: 'BK-AB12CD', name: 'Ali Raza', email: 'a@b.co', purpose: 'Intro call', starts_at: '2026-11-02T10:00:00Z', ends_at: '2026-11-02T10:30:00Z' };
  const rows = Object.fromEntries(detailRows(row, 'Asia/Karachi'));
  assert.match(rows.When, /15:00/);
  assert.match(rows.When, /Asia\/Karachi/);
  const m = autoReplyEmail({ row, settings: { name: 'Zeeshan', timezone: 'Asia/Karachi', notify: { autoReplyNote: 'Bring any questions.' } }, to: row.email, from: 'x@y.z', replyTo: 'o@z.dev' });
  assert.match(m.text, /not confirmed/);
  assert.match(m.text, /Bring any questions\./);
  assert.ok(ownerEmail({ row, settings: {}, site: '', to: 'o@z.dev', from: 'x@y.z' }).subject.includes('BK-AB12CD'));
});

test('testimonial pick-lists match the database whitelist; shortName mirrors the SQL', () => {
  const sql = readFileSync(new URL('../supabase/phase10_testimonials.sql', import.meta.url), 'utf8');
  for (const v of [...RELATIONSHIPS, ...ORG_TYPES]) assert.ok(sql.includes(`'${v}'`), `missing in phase10 SQL: ${v}`);
  assert.equal(shortName('Hina Malik'), 'Hina M.');
  assert.equal(shortName('Hina'), 'Hina');
  assert.equal(shortName('Ali bin Raza'), 'Ali R.');
});

// ---------- cinematic intro: decisions and honest progress ----------
import { shouldShowIntro, wantsVideo, nameLines, introProgress, INTRO_MAX_MS } from '../src/lib/intro.js';

test('intro runs once per session, only when the visit starts on the home page, never with reduced motion', () => {
  assert.equal(shouldShowIntro({ pathname: '/' }), true);
  assert.equal(shouldShowIntro({ pathname: '/', seen: true }), false);
  assert.equal(shouldShowIntro({ pathname: '/blog/some-post' }), false);
  assert.equal(shouldShowIntro({ pathname: '/', reducedMotion: true }), false);
  assert.ok(INTRO_MAX_MS <= 10000, 'the intro has a hard ceiling');
});

test('data saver and 2G connections never download the video', () => {
  assert.equal(wantsVideo({}), true);
  assert.equal(wantsVideo({ effectiveType: '4g' }), true);
  assert.equal(wantsVideo({ saveData: true }), false);
  assert.equal(wantsVideo({ effectiveType: '2g' }), false);
  assert.equal(wantsVideo({ effectiveType: 'slow-2g' }), false);
});

test('the name splits into the two display lines from the saved name', () => {
  assert.deepEqual(nameLines('Muhammad Zeeshan Haider'), ['MUHAMMAD', 'ZEESHAN HAIDER']);
  assert.deepEqual(nameLines('Zeeshan'), ['ZEESHAN', '']);
});

test('loading progress is real: indeterminate until the video length is known, then weighted by actual signals', () => {
  const base = { page: false, settings: false, fonts: false, videoWanted: true, videoFailed: false, duration: NaN, buffered: 0 };
  assert.equal(introProgress(base).determinate, false);                       // nothing known yet: no fake percentage
  assert.equal(introProgress({ ...base, page: true, settings: true, fonts: true }).determinate, false);
  const half = introProgress({ ...base, duration: 6, buffered: 3 });
  assert.equal(half.determinate, true);
  assert.ok(Math.abs(half.value - 0.3) < 1e-9);                               // video is 60%: half buffered = 30%
  const done = introProgress({ ...base, page: true, settings: true, fonts: true, duration: 6, buffered: 6 });
  assert.ok(Math.abs(done.value - 1) < 1e-9);
  assert.ok(introProgress({ ...base, duration: 6, buffered: 99 }).value <= 1);
  // no video (failed, or not wanted): progress depends only on page readiness and can still complete
  const still = introProgress({ ...base, videoFailed: true, page: true, settings: true, fonts: true });
  assert.deepEqual(still, { determinate: true, value: 1 });
  assert.equal(introProgress({ ...base, videoWanted: false }).value, 0.6);
});
