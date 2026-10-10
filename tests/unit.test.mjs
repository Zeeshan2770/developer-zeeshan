// Fast unit tests: input sanitization, slugs, timezone/slot generation, share-preview injection.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, isEmail, isPhone, isUrlish, slugify, socialLinks } from '../src/lib/validate.js';
import { generateSlots, zonedToUtc, dateKeyInTz } from '../src/lib/booking.js';
import { injectMeta, esc } from '../netlify/edge-functions/og.js';

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
