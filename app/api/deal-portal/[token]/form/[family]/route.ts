import { NextResponse } from 'next/server';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import { getPortalDeal } from '@/lib/server/closing-time-assist';
import { portalForms } from '@/lib/server/portal-forms';
import { getAgentAccountDetails } from '@/lib/server/agent-account-details';
import { stampBrokerageFooter } from '@/lib/server/brokerage-footer-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** View-only filled form for a client. Authorized only by the portal token; the PDF is flattened so nothing can be edited. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; family: string }> }) {
  const { token, family } = await ctx.params;
  const found = await getPortalDeal(token);
  if (!found) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const version = portalForms(found.deal).find((v) => v.formFamily === family);
  if (!version) return NextResponse.json({ error: 'Form not found.' }, { status: 404 });

  const source = await fetch(new URL(version.pdfUrl, new URL(req.url).origin));
  if (!source.ok) return NextResponse.json({ error: 'Could not load the form.' }, { status: 502 });
  const doc = await PDFDocument.load(new Uint8Array(await source.arrayBuffer()), { ignoreEncryption: true });
  const form = doc.getForm();
  for (const field of version.fields) {
    const value = String(found.deal.formFields?.[field.id] ?? '');
    if (!value) continue;
    try {
      const pdfField = form.getField(field.pdfFieldName);
      if (pdfField instanceof PDFTextField) pdfField.setText(value);
      else if (pdfField instanceof PDFCheckBox) { if (!/^(false|off|no|0)$/i.test(value)) pdfField.check(); }
      else if (pdfField instanceof PDFRadioGroup || pdfField instanceof PDFDropdown || pdfField instanceof PDFOptionList) pdfField.select(value);
    } catch { /* skip fields that cannot be filled */ }
  }
  try { form.flatten(); } catch { /* serve unflattened if flattening fails */ }
  await stampBrokerageFooter(doc, await getAgentAccountDetails(found.realtorId).catch(() => null));
  const bytes = await doc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${version.formNumber.replace(/[^\w.-]+/g, '-')}.pdf"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex',
    },
  });
}
