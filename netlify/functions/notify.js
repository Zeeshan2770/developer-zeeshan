// POST /.netlify/functions/notify  { kind: 'inquiry'|'message'|'appointment', ref: '<code or email>' }
// Called by the site right after a form is stored. See netlify/lib/notify-core.js for the rules and env vars.
import { handleNotify } from '../lib/notify-core.js';

const json = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { ok: false });
  if (String(event.body || '').length > 2000) return json(413, { ok: false });
  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false }); }
  try {
    const { status, body } = await handleNotify(input, process.env);
    return json(status, body);
  } catch (e) {
    console.error('[notify]', e.message);
    return json(200, { ok: true, skipped: 'error' });   // never surface problems to the visitor
  }
}
