/**
 * POST /api/admin/media-kit-pdf
 * Emails the Digital Ad Slots PDF (generated in the browser) as an attachment.
 * Auth: requireAdmin().
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { to?: unknown; note?: unknown; pubLabel?: unknown; filename?: unknown; pdfBase64?: unknown }
    | null;
  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  const pdf = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : '';
  const pubLabel = typeof body?.pubLabel === 'string' ? body.pubLabel.slice(0, 80) : 'Realty News Now';
  const filename = typeof body?.filename === 'string' && /^[\w.-]+\.pdf$/.test(body.filename) ? body.filename : 'digital-ad-slots.pdf';
  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : '';
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  if (!pdf || pdf.length > 8_000_000) return NextResponse.json({ error: 'Missing or oversized PDF' }, { status: 400 });

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const result = await sendEmail({
    to,
    subject: `${pubLabel} — Digital Ad Slots & Rates`,
    html: `<p>Hello,</p>${note ? `<p>${esc(note).replace(/\n/g, '<br>')}</p>` : ''}<p>Attached are the current digital ad slots and rates for ${esc(pubLabel)}, including video options.</p><p>Book online at <a href="https://realtynewsnow.app/advertise">realtynewsnow.app/advertise</a>.</p>`,
    attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
  });
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Send failed' }, { status: 502 });
  return NextResponse.json({ ok: true, messageId: result.messageId });
}
