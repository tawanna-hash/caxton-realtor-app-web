// app/api/admin/agreements/[id]/send-amended/route.ts
//
// POST — Send the advertiser an FYI email with the latest agreement PDF
// attached. Used when an admin edits an existing (often uploaded paper)
// agreement and wants the advertiser to have the updated record.
//
// This is NOT a signing request. No signing link is included, the
// agreement status is not changed, and no token is generated.
//
// Body (all optional):
//   { to?: string, changeSummary?: string }
//
// Audit log entry appended on success.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { generateAgreementPdfBuffer } from '@/lib/agreement-pdf';
import { sendEmail } from '@/lib/email';
import { amendedAgreementEmail } from '@/lib/email-templates';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function slugifyForFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'agreement';
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: { to?: string; changeSummary?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body is fine
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = (await sql`SELECT * FROM agreements WHERE id = ${id}`) as unknown as Agreement[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const ag = rows[0];

    const recipient =
      (typeof body.to === 'string' && body.to.trim()) ||
      ag.advertiser_email ||
      ag.billing_email;
    if (!recipient) {
      return NextResponse.json(
        { error: 'no email address on agreement (set advertiser_email or pass `to`)' },
        { status: 400 },
      );
    }

    // Generate the latest PDF straight from the (just-saved) DB row.
    let pdfBase64: string;
    try {
      const pdfBytes = await generateAgreementPdfBuffer(ag);
      pdfBase64 = Buffer.from(pdfBytes).toString('base64');
    } catch (err) {
      return NextResponse.json(
        { error: 'pdf generation failed', detail: errMessage(err) },
        { status: 500 },
      );
    }

    const filename = `agreement-${slugifyForFilename(ag.company_name ?? 'amended')}.pdf`;

    const html = amendedAgreementEmail({
      companyName: ag.company_name ?? undefined,
      repName: ag.rep_name ?? undefined,
      changeSummary: body.changeSummary,
      senderName: admin.email,
    });

    const result = await sendEmail({
      to: recipient,
      subject: `Updated advertising agreement — ${ag.company_name ?? 'Agreement'}`,
      html,
      replyTo: admin.email,
      attachments: [
        {
          filename,
          content: pdfBase64,
          contentType: 'application/pdf',
        },
      ],
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'email send failed', detail: result.error },
        { status: 502 },
      );
    }

    // Append audit entry. Note we do NOT modify status or sent_to_email —
    // this is an FYI, not a signing-request workflow.
    const existingRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${id}`) as unknown as Array<{
      audit_log: AgreementAuditEntry[] | null;
    }>;
    const newLog = appendAudit(existingRows[0]?.audit_log, {
      event: 'amended_pdf_sent',
      timestamp: new Date().toISOString(),
      user_email: admin.email,
      details: `Amended agreement PDF emailed to ${recipient}. Resend messageId: ${
        result.messageId ?? 'n/a'
      }${body.changeSummary ? `. Summary: ${body.changeSummary.slice(0, 200)}` : ''}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb, updated_at = NOW() WHERE id = ${id}`;

    return NextResponse.json({ ok: true, sentTo: recipient, messageId: result.messageId });
  } catch (err) {
    console.error('[admin/agreements/:id/send-amended]', errMessage(err));
    return NextResponse.json(
      { error: 'send-amended failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
