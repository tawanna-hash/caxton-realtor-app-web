import { NextRequest, NextResponse } from 'next/server';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { listTrecFormVersions } from '@/lib/server/trec-form-versions';
import { getAgentAccountDetails } from '@/lib/server/agent-account-details';
import { stampBrokerageFooter } from '@/lib/server/brokerage-footer-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Fills an official TREC form with the values a signed-in subscriber typed and returns the PDF. Nothing is stored. */
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const user = await requireUser();
  await rateLimit('signWizard', user.realtorId);
  const body = (await req.json().catch(() => null)) as { family?: string; values?: Record<string, string> } | null;
  if (!body?.family) return NextResponse.json({ error: 'Choose a form.' }, { status: 400 });
  const version = (await listTrecFormVersions()).find((v) => v.formFamily === body.family && v.isActive);
  if (!version) return NextResponse.json({ error: 'Form not found.' }, { status: 404 });

  const pdfUrl = new URL(version.pdfUrl, req.nextUrl.origin);
  const allowedHost = pdfUrl.origin === req.nextUrl.origin || pdfUrl.hostname.endsWith('.public.blob.vercel-storage.com');
  if (!allowedHost) return NextResponse.json({ error: 'Form source not allowed.' }, { status: 400 });
  const source = await fetch(pdfUrl);
  if (!source.ok) return NextResponse.json({ error: 'Could not load the form.' }, { status: 502 });

  const doc = await PDFDocument.load(new Uint8Array(await source.arrayBuffer()), { ignoreEncryption: true });
  const form = doc.getForm();
  for (const field of version.fields) {
    const value = String(body.values?.[field.id] ?? '').slice(0, 2000);
    if (!value) continue;
    try {
      const pdfField = form.getField(field.pdfFieldName);
      if (pdfField instanceof PDFTextField) pdfField.setText(value);
      else if (pdfField instanceof PDFCheckBox) { if (!/^(false|off|no|0)$/i.test(value)) pdfField.check(); }
      else if (pdfField instanceof PDFRadioGroup || pdfField instanceof PDFDropdown || pdfField instanceof PDFOptionList) pdfField.select(value);
    } catch { /* skip fields that cannot be filled */ }
  }
  await stampBrokerageFooter(doc, await getAgentAccountDetails(user.realtorId).catch(() => null));
  const bytes = await doc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="TREC-${version.formNumber.replace(/[^\w.-]+/g, '-')}-filled.pdf"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex',
    },
  });
});
