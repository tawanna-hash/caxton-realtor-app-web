import { NextRequest, NextResponse } from 'next/server';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { sendEmail } from '@/lib/email';
import { getAgentAccountDetails } from '@/lib/server/agent-account-details';
import { stampBrokerageFooter } from '@/lib/server/brokerage-footer-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const user = await requireUser();
  await rateLimit('signWizard', user.realtorId);
  const body = await req.json().catch(() => null) as {
    formNumber?: string; title?: string; pdfUrl?: string; property?: string; dealName?: string;
    values?: Record<string, string>;
    broker?: { name?: string; email?: string; note?: string };
    footer?: { brokerage?: string; address?: string; agentId?: string; agentName?: string };
  } | null;
  const brokerEmail = body?.broker?.email?.trim() ?? '';
  if (!body || !EMAIL.test(brokerEmail)) {
    return NextResponse.json({ error: 'Enter the broker\'s email address.' }, { status: 400 });
  }
  if (!body.pdfUrl) return NextResponse.json({ error: 'Form not found.' }, { status: 400 });

  const pdfUrl = new URL(body.pdfUrl, req.nextUrl.origin);
  const allowedHost = pdfUrl.origin === req.nextUrl.origin || pdfUrl.hostname.endsWith('.public.blob.vercel-storage.com');
  if (!allowedHost) return NextResponse.json({ error: 'Form source not allowed.' }, { status: 400 });
  const source = await fetch(pdfUrl);
  if (!source.ok) return NextResponse.json({ error: 'Could not load the form.' }, { status: 502 });
  const bytes = new Uint8Array(await source.arrayBuffer());

  let output: Uint8Array = bytes;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    for (const [name, raw] of Object.entries(body.values ?? {})) {
      const value = String(raw ?? '');
      if (!value) continue;
      try {
        const field = form.getField(name);
        if (field instanceof PDFTextField) field.setText(value);
        else if (field instanceof PDFCheckBox) { if (!/^(false|off|no|0)$/i.test(value)) field.check(); }
        else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) field.select(value);
      } catch { /* skip fields that cannot be filled */ }
    }
    const saved = await getAgentAccountDetails(user.realtorId).catch(() => null);
    await stampBrokerageFooter(doc, saved ?? { brokerage: body.footer?.brokerage ?? '', address: body.footer?.address ?? '', agentId: body.footer?.agentId ?? '', agentName: body.footer?.agentName ?? '' });
    output = await doc.save();
  } catch { /* send the blank form if it cannot be filled */ }

  const formNumber = body.formNumber || 'Form';
  const property = body.property || body.dealName || 'Deal';
  const agentName = body.footer?.agentName || user.email || 'Your agent';
  const brokerName = body.broker?.name?.trim() || 'Broker';
  const note = body.broker?.note?.trim();
  const footerRows = [
    ['Brokerage', body.footer?.brokerage], ['Brokerage Address', body.footer?.address],
    ['Agent ID', body.footer?.agentId], ['Agent Name', body.footer?.agentName],
  ].filter(([, v]) => v);
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#292a2d;max-width:560px">
    <p>Hello ${esc(brokerName)},</p>
    <p>${esc(agentName)} submitted <strong>${esc(formNumber)}${body.title ? ` · ${esc(body.title)}` : ''}</strong> for your review. Property: ${esc(property)}.</p>
    ${note ? `<p style="border-left:3px solid #005a8f;padding-left:12px">${esc(note)}</p>` : ''}
    ${footerRows.length ? `<table style="font-size:13px;color:#51555b">${footerRows.map(([k, v]) => `<tr><td style="padding-right:12px"><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
    <p>The filled form is attached. Reply to this email to send your approval or changes to ${esc(agentName)}.</p>
  </div>`;

  const result = await sendEmail({
    to: brokerEmail,
    replyTo: user.email || undefined,
    subject: `Broker review: ${formNumber} - ${property}`,
    html,
    attachments: [{
      filename: `${formNumber.replace(/[^\w.-]+/g, '-')}-${property.replace(/[^\w.-]+/g, '-').slice(0, 40)}.pdf`,
      content: Buffer.from(output).toString('base64'),
      contentType: 'application/pdf',
    }],
  });
  if (!result.ok) return NextResponse.json({ error: 'The review email could not be sent. Try again.' }, { status: 502 });
  return NextResponse.json({ ok: true });
});
