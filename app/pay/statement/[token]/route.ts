// Public, token-signed statement pay link. GET shows a confirm page (so email
// scanners that prefetch links don't spend or invalidate checkout sessions);
// POST creates a fresh Stripe Checkout Session and redirects to it.
import { NextRequest, NextResponse } from 'next/server';
import { verifyStatementPayToken } from '@/lib/server/statement-pay-token';
import { INVOICE_PAYMENT_METHODS, isInvoicePaymentMethod } from '@/lib/payment-processing-fees';
import { createInvoiceCheckoutSession } from '@/lib/server/invoice-payment-link';
import { getOrCreatePartnerStatementOverdueLink, loadPartnerStatement } from '@/lib/server/partner-statement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function page(title: string, body: string, status = 200, button?: string, choose = false) {
  const chooser = choose ? `<div style="text-align:left;margin-top:14px">${INVOICE_PAYMENT_METHODS.map((o, i) => `<label style="display:block;border:1px solid #E6E5EC;border-radius:4px;padding:10px 12px;margin-bottom:8px;cursor:pointer"><input type="radio" name="method" value="${o.value}"${i === 0 ? ' checked' : ''} form="pay"> <strong>${o.label}</strong><br><span style="font-size:12px;color:#6b6b6b;margin-left:20px">Processing fee: ${o.feeLabel}</span></label>`).join('')}</div>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#F5F4F9;font-family:Arial,sans-serif;color:#262626"><div style="max-width:460px;margin:12vh auto;background:#fff;border:1px solid #E6E5EC;padding:28px;text-align:center">
<div style="font-size:12px;letter-spacing:.08em;color:#6b6b6b">CAXTON PUBLICATIONS, INC.</div><h1 style="font-size:20px;color:#301D5D;margin:10px 0 12px">${title}</h1><p style="font-size:14px;line-height:1.5">${body}</p>
${chooser}${button ? `<form id="pay" method="post"><button style="margin-top:12px;background:#301D5D;color:#fff;border:0;padding:12px 20px;border-radius:4px;font-weight:700;font-size:14px;cursor:pointer">${button}</button></form>` : ''}</div></body></html>`;
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyStatementPayToken(token);
  if (!v.ok) return page('Link not valid', v.reason === 'expired' ? 'This payment link has expired. Please contact us for a new statement.' : 'This payment link is not valid. Please contact us for a new statement.', 400);
  return page('Choose how to pay', 'Select a payment method. The processing fee is added at checkout and shown before you pay.', 200, 'Continue to payment', true);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyStatementPayToken(token);
  if (!v.ok) return page('Link not valid', 'This payment link is not valid or has expired. Please contact us for a new statement.', 400);
  try {
    if (v.subject.kind === 'invoice') {
      const form = await req.formData().catch(() => null);
      const m = form?.get('method');
      const paymentMethod = isInvoicePaymentMethod(m) ? m : 'card';
      const r = await createInvoiceCheckoutSession({ invoiceId: v.subject.invoiceId, createdBy: 'statement-link', sendEmail: false, paymentMethod });
      if (r.checkoutUrl) return NextResponse.redirect(r.checkoutUrl, 303);
      return page('Nothing to pay', 'This invoice has no balance due. Thank you.', 200);
    }
    const form = await req.formData().catch(() => null);
    const m = form?.get('method');
    const paymentMethod = isInvoicePaymentMethod(m) ? m : 'card';
    const statement = await loadPartnerStatement(v.subject.advertiserId, { scope: v.subject.scope });
    if (!statement) return page('Nothing to pay', 'There is no outstanding balance on this statement. Thank you.', 200);
    const withLink = await getOrCreatePartnerStatementOverdueLink(statement, { paymentMethod });
    if (withLink.overduePaymentLinkUrl) return NextResponse.redirect(withLink.overduePaymentLinkUrl, 303);
    return page('Nothing to pay', 'There is no outstanding balance on this statement. Thank you.', 200);
  } catch (e) {
    console.error('statement pay link failed', e);
    const origin = req.nextUrl.origin;
    return page('We could not open payment', `Please try again in a moment, or contact us. (${origin.replace(/^https?:\/\//, '')})`, 502);
  }
}
