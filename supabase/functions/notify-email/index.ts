// OPTIONAL email notifications. Not required for the site to work — the admin dashboard already shows notifications.
//
// Setup:
//   1. supabase functions deploy notify-email --no-verify-jwt
//   2. supabase secrets set RESEND_API_KEY=... NOTIFY_TO=you@example.com NOTIFY_FROM="HQ <hq@yourdomain.com>" WEBHOOK_SECRET=<random>
//   3. Dashboard > Database > Webhooks > create a webhook on table `notifications` (INSERT) pointing at this function,
//      with HTTP header  x-webhook-secret: <the same random value>.
//
// The provider is isolated in sendEmail(): swap Resend for SMTP, Postmark, etc. without touching anything else.

async function sendEmail(subject: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('NOTIFY_TO');
  const from = Deno.env.get('NOTIFY_FROM');
  if (!key || !to || !from) throw new Error('Email provider not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Email provider error ${res.status}`);
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('Forbidden', { status: 403 });
  }
  const { record } = await req.json();
  if (!record?.title) return new Response('No record', { status: 400 });
  try {
    await sendEmail(`[HQ] ${record.title}`, `${record.title}\n\nType: ${record.kind}\nOpen your admin dashboard to review.`);
    return new Response('ok');
  } catch (e) {
    return new Response(String((e as Error).message), { status: 500 });
  }
});
