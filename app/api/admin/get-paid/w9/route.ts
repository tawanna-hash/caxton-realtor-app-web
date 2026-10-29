import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { generateW9Pdf } from '@/lib/server/w9-pdf';
import { validateW9, W9_REVISION, type W9Data } from '@/lib/w9';
import { sendEmail } from '@/lib/email';
import { escapeHtml, wrapEmail } from '@/lib/server/email/html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['download', 'email']),
  recipient: z.email().max(320).optional(),
  message: z.string().max(2000).optional(),
  data: z.object({
    name: z.string().max(200), businessName: z.string().max(200),
    classification: z.enum(['individual', 'c_corp', 's_corp', 'partnership', 'trust_estate', 'llc', 'other', '']),
    llcTaxClass: z.enum(['C', 'S', 'P', '']), otherText: z.string().max(100),
    foreignOwners: z.boolean(), exemptPayeeCode: z.string().max(10), fatcaCode: z.string().max(10),
    address: z.string().max(200), cityStateZip: z.string().max(200), requester: z.string().max(300),
    accountNumbers: z.string().max(200), tinType: z.enum(['ssn', 'ein']), tin: z.string().max(20),
    certified: z.boolean(), signedDate: z.string().max(10),
  }),
  signature: z.object({
    dataUrl: z.string().max(3_000_000), x: z.number(), y: z.number(), w: z.number(),
  }),
});

// Never log request bodies: they contain a taxpayer identification number.
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'The form data was not valid.' }, { status: 400 });
  const { action, recipient, message, data, signature } = parsed.data;
  const problems = validateW9(data as W9Data, signature);
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  if (action === 'email' && !recipient) return NextResponse.json({ error: 'Enter a recipient email.' }, { status: 400 });

  let pdf: Buffer;
  try {
    pdf = await generateW9Pdf(data as W9Data, signature);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the PDF.' }, { status: 400 });
  }
  const safe = data.name.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'form';
  const filename = `W-9-2026-${safe}.pdf`;

  if (action === 'download') {
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
    });
  }

  const note = message?.trim() ? `<p>${escapeHtml(message.trim()).replace(/\n/g, '<br>')}</p>` : '';
  const result = await sendEmail({
    to: recipient!,
    subject: `Form W-9 for ${data.name.trim()}`,
    html: wrapEmail({
      heading: 'Form W-9',
      signature: false,
      bodyHtml: `${note}<p>Attached is the completed, signed IRS Form W-9 (${escapeHtml(W9_REVISION)}) for ${escapeHtml(data.name.trim())}.</p><p>It contains a taxpayer identification number. Please store it securely.</p>`,
    }),
    attachments: [{ filename, content: pdf.toString('base64'), contentType: 'application/pdf' }],
  });
  if (!result.ok) return NextResponse.json({ error: 'The email could not be sent. Please try again.' }, { status: 502 });
  return NextResponse.json({ ok: true, recipient, messageId: result.messageId ?? null });
}
