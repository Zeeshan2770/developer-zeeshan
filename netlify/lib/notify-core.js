// Email notifications for new inquiries, contact messages and booking requests.
// Pure functions + one orchestrator (handleNotify) so everything is unit-testable without the network.
//
// Netlify environment variables (never put these in the frontend):
//   RESEND_API_KEY   - API key from resend.com                      (required to send anything)
//   NOTIFY_FROM      - e.g. "Zeeshan Haider <hello@yourdomain.com>"   (a domain verified in Resend)
//   NOTIFY_TO_EMAIL  - where owner alerts go (defaults to the email in Admin > Settings)
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SITE_URL         (already set for the site)

const KINDS = ['inquiry', 'message', 'appointment'];
const SANDBOX_FROM = 'Website <onboarding@resend.dev>';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const oneLine = (s, n = 200) => String(s ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || ''));

const LABEL = { inquiry: 'project inquiry', message: 'message', appointment: 'booking request' };

function whenText(row, tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: tz || 'UTC' }).format(new Date(row.starts_at)) + (tz ? ` (${tz})` : ' (UTC)');
  } catch { return String(row.starts_at || ''); }
}

/** Rows shown in the owner's alert: [label, value] pairs, empty values dropped. */
export function detailRows(row, tz) {
  const r = [['Name', row.name], ['Email', row.email], ['Phone / WhatsApp', row.phone]];
  if (row.kind === 'inquiry') {
    r.push(['Reference', row.code], ['Organization', row.organization], ['Project type', row.project_type], ['Budget', row.budget], ['Timeline', row.timeline],
      ['Existing website', row.existing_website], ['Preferred contact', row.contact_method], ['Project description', row.description],
      ['Problem to solve', row.problem], ['Features needed', row.features], ['Additional info', row.additional_info]);
  } else if (row.kind === 'message') {
    r.push(['Subject', row.subject], ['Message', row.message]);
  } else if (row.kind === 'appointment') {
    r.push(['Reference', row.code], ['Purpose', row.purpose], ['Type', row.appointment_type], ['When', whenText(row, tz)], ['Message', row.message]);
  }
  return r.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
}

export function ownerEmail({ row, settings, site, to, from }) {
  const tz = settings.timezone;
  const rows = detailRows(row, tz);
  const subject = oneLine(`New ${LABEL[row.kind]}${row.code ? ` ${row.code}` : ''} — ${row.name}`, 150);
  const admin = site ? `${site}/admin` : '';
  const text = `${subject}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nReply to this email to answer ${row.name} directly.${admin ? `\nOpen in admin: ${admin}` : ''}\n`;
  const html = `<div style="font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#0d1526;max-width:620px">
<h2 style="margin:0 0 12px;font-size:18px">${esc(subject)}</h2>
<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5b6577;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
<p style="color:#5b6577;margin-top:16px">Reply to this email to answer ${esc(row.name)} directly.${admin ? ` <a href="${esc(admin)}">Open admin</a>` : ''}</p></div>`;
  return { from, to: [to], reply_to: row.email, subject, text, html };
}

export function replyBody({ row, settings }) {
  const owner = settings.name || 'Zeeshan';
  const first = oneLine(row.name, 60).split(' ')[0] || 'there';
  const note = String(settings.notify?.autoReplyNote || '').trim();
  let main;
  if (row.kind === 'inquiry') main = `Thanks for telling me about your project. I have received your inquiry (reference ${row.code}). I read every inquiry myself, and I will reply${row.contact_method ? ` by ${oneLine(row.contact_method, 40)}` : ''} as soon as I can.`;
  else if (row.kind === 'appointment') main = `I have received your booking request (reference ${row.code}) for ${whenText(row, settings.timezone)}. It is not confirmed yet. I will confirm it, or suggest another time, by reply.`;
  else main = 'Thanks for your message. I have received it and will get back to you as soon as I can.';
  const parts = [`Hi ${first},`, main];
  if (note) parts.push(note);
  parts.push('You do not need to do anything else. If you did not send this request, you can ignore this email.', `— ${owner}`);
  return parts;
}

export function autoReplyEmail({ row, settings, to, from, replyTo }) {
  const parts = replyBody({ row, settings });
  const subject = oneLine(row.kind === 'appointment' ? 'I received your booking request' : row.kind === 'inquiry' ? 'I received your project inquiry' : 'I received your message', 120);
  return {
    from, to: [to], ...(isEmail(replyTo) ? { reply_to: replyTo } : {}), subject,
    text: parts.join('\n\n') + '\n',
    html: `<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#0d1526;max-width:560px">${parts.map((p) => `<p style="margin:0 0 14px;white-space:pre-wrap">${esc(p)}</p>`).join('')}</div>`,
  };
}

async function sendResend(fetchFn, key, mail) {
  const r = await fetchFn('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(mail), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`resend ${r.status}`);
  return true;
}

/**
 * @param {{kind?:string, ref?:string}} input  parsed request body
 * @param {object} env                         process.env
 * @param {typeof fetch} fetchFn
 * @returns {Promise<{status:number, body:object}>}
 */
export async function handleNotify(input, env, fetchFn = fetch) {
  const kind = input && input.kind;
  const ref = input && typeof input.ref === 'string' ? input.ref.trim() : '';
  if (!KINDS.includes(kind) || !ref || ref.length > 254) return { status: 400, body: { ok: false, error: 'bad_request' } };
  const key = env.RESEND_API_KEY;
  if (!key) return { status: 200, body: { ok: true, skipped: 'email_not_configured' } };   // nothing is claimed, so setting it up later loses nothing
  const url = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return { status: 200, body: { ok: true, skipped: 'database_not_configured' } };
  const sb = { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' };
  const site = (env.VITE_SITE_URL || env.URL || '').replace(/\/$/, '');

  let settings = {};
  try {
    const r = await fetchFn(`${url}/rest/v1/site_settings?select=value&key=eq.site`, { headers: sb, signal: AbortSignal.timeout(8000) });
    if (r.ok) settings = (await r.json())?.[0]?.value || {};
  } catch { /* defaults below */ }
  const cfg = { ownerAlerts: true, autoReply: true, ...(settings.notify || {}) };
  if (!cfg.ownerAlerts && !cfg.autoReply) return { status: 200, body: { ok: true, skipped: 'disabled' } };

  let row = null;
  try {
    const r = await fetchFn(`${url}/rest/v1/rpc/claim_notification`, { method: 'POST', headers: sb, body: JSON.stringify({ p_kind: kind, p_ref: ref }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { status: 200, body: { ok: true, skipped: 'claim_failed' } };   // e.g. phase8_email.sql not run yet
    row = await r.json();
  } catch { return { status: 200, body: { ok: true, skipped: 'claim_failed' } }; }
  if (!row || !row.kind) return { status: 200, body: { ok: true, skipped: 'nothing_pending' } };

  const from = env.NOTIFY_FROM || SANDBOX_FROM;
  const owner = oneLine(env.NOTIFY_TO_EMAIL || settings.email, 254);
  const mails = [];
  if (cfg.ownerAlerts && isEmail(owner)) mails.push(ownerEmail({ row, settings, site, to: owner, from }));
  if (cfg.autoReply && isEmail(row.email)) mails.push(autoReplyEmail({ row, settings: { ...settings, notify: cfg }, to: row.email, from, replyTo: owner }));
  let sent = 0;
  for (const m of mails) {
    try { await sendResend(fetchFn, key, m); sent += 1; } catch (e) { console.error(`[notify] ${m.subject}: ${e.message}`); }
  }
  return { status: 200, body: { ok: true, sent } };
}
