// app/api/activity/alert/route.ts
//
// Public, low-volume endpoint. The client tracker fires this only for
// HIGH-SIGNAL events that warrant an email to Tawanna:
//   - form submissions (newsletter signup, giveaway entry, advertiser signed)
//   - client errors (uncaught exceptions, failed fetches)
//
// Rate-limited per-IP to prevent abuse / inbox flooding.
//
// We deliberately do NOT email on page views or generic clicks -- the
// /admin/activity dashboard surfaces those visually.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { withErrorHandling, ApiError } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Empty string disables alerts entirely. Falsy check below already handles
// undefined/null. We default to tawanna@myrealtyline.com — newslinesa.com
// is the publication domain but mail goes through myrealtyline.com.
const ALERT_RECIPIENT = process.env.ACTIVITY_ALERT_TO ?? 'tawanna@myrealtyline.com';

const AlertSchema = z.object({
  kind: z.enum(['form_submit', 'client_error']),
  title: z.string().max(200),
  detail: z.string().max(2000).optional(),
  path: z.string().max(500).optional(),
  url: z.string().max(800).optional(),
  publication: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// In-memory rate limit: max 20 alerts per minute per IP. Cheap protection
// against a stuck client looping or someone POSTing junk. Scoped per-Lambda;
// good enough for our launch-week traffic.
const buckets = new Map<string, { count: number; resetAt: number }>();
const LIMIT_PER_MIN = 20;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (b.count >= LIMIT_PER_MIN) return false;
  b.count += 1;
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export const POST = withErrorHandling(async (req: Request) => {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (!rateLimit(ip)) {
    // Soft-fail: return 202 so the client doesn't retry forever. The
    // /admin/activity dashboard still has the underlying PostHog event.
    return NextResponse.json({ ok: false, throttled: true }, { status: 202 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON');
  }
  const parsed = AlertSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid alert payload');
  }
  const a = parsed.data;

  const kindLabel = a.kind === 'form_submit' ? 'Form submitted' : 'Client error';
  const subject = `[Realty News Now] ${kindLabel}: ${a.title}`.slice(0, 180);
  const metaHtml = a.metadata
    ? `<pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-size:12px;overflow:auto">${escapeHtml(JSON.stringify(a.metadata, null, 2))}</pre>`
    : '';

  const html = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#666;margin-bottom:8px">${escapeHtml(kindLabel)}</div>
      <h1 style="font-family:Georgia,serif;font-size:22px;color:#111;margin:0 0 16px">${escapeHtml(a.title)}</h1>
      ${a.detail ? `<p style="color:#333;line-height:1.5;margin:0 0 16px">${escapeHtml(a.detail)}</p>` : ''}
      <table style="font-size:13px;color:#444;border-collapse:collapse;width:100%">
        ${a.path ? `<tr><td style="padding:4px 12px 4px 0;color:#777;width:90px">Path</td><td style="padding:4px 0"><code>${escapeHtml(a.path)}</code></td></tr>` : ''}
        ${a.url ? `<tr><td style="padding:4px 12px 4px 0;color:#777">URL</td><td style="padding:4px 0"><a href="${escapeHtml(a.url)}" style="color:#9a3412">${escapeHtml(a.url)}</a></td></tr>` : ''}
        ${a.publication ? `<tr><td style="padding:4px 12px 4px 0;color:#777">Publication</td><td style="padding:4px 0">${escapeHtml(a.publication)}</td></tr>` : ''}
        ${a.email ? `<tr><td style="padding:4px 12px 4px 0;color:#777">User email</td><td style="padding:4px 0">${escapeHtml(a.email)}</td></tr>` : ''}
        <tr><td style="padding:4px 12px 4px 0;color:#777">When</td><td style="padding:4px 0">${escapeHtml(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'medium' }))} CT</td></tr>
      </table>
      ${metaHtml}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#888;font-size:12px;margin:0">
        Live dashboard: <a href="https://realtynewsnow.app/admin/activity" style="color:#9a3412">realtynewsnow.app/admin/activity</a><br>
        To stop these alerts, set <code>ACTIVITY_ALERT_TO=</code> empty in Vercel env.
      </p>
    </div>
  `;

  if (!ALERT_RECIPIENT) {
    // Disabled by config; succeed silently so the dashboard still gets the event via PostHog.
    return NextResponse.json({ ok: true, sent: false });
  }

  const result = await sendEmail({ to: ALERT_RECIPIENT, subject, html });
  return NextResponse.json({ ok: result.ok, messageId: result.messageId, error: result.error });
});
