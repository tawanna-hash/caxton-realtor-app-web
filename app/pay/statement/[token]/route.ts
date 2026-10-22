// Public, token-signed statement pay link. GET shows a confirm page (so email
// scanners that prefetch links don't spend or invalidate checkout sessions);
// POST creates a fresh Stripe Checkout Session and redirects to it.
import { NextRequest, NextResponse } from 'next/server';
import { verifyStatementPayToken } from '@/lib/server/statement-pay-token';
import { createInvoiceCheckoutSession } from '@/lib/server/invoice-payment-link';
import { getOrCreatePartnerStatementOverdueLink, loadPartnerStatement } from '@/lib/server/partner-statement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function page(title: string, body: string, status = 200, button?: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#F5F4F9;font-family:Arial,sans-serif;color:#262626"><div style="max-width:460px;margin:12vh auto;background:#fff;border:1px solid #E6E5EC;padding:28px;text-align:center">
<div style="font-size:12px;letter-spacing:.08em;color:#6b6b6b">CAXTON PUBLICATIONS, INC.</div><h1 style="font-size:20px;color:#301D5D;margin:10px 0 12px">${title}</h1><p style="font-size:14px;line-height:1.5">${body}</p>
${button ? `<form method="post"><button style="margin-top:12px;background:#301D5D;color:#fff;border:0;padding:12px 20px;border-radius:4px;font-weight:700;font-size:14px;cursor:pointer">${button}</button></form>` : ''}</div></body></html>`;
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyStatementPayToken(token);
  if (!v.ok) return page('Link not valid', v.reason === 'expired' ? 'This payment link has expired. Please contact us for a new statement.' : 'This payment link is not valid. Please contact us for a new statement.', 400);
  return page('Continue to secure payment', 'You will be taken to our secure payment page to pay the amount shown on your statement.', 200, 'Continue to payment');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyStatementPayToken(token);
  if (!v.ok) return page('Link not valid', 'This payment link is not valid or has expired. Please contact us for a new statement.', 400);
  try {
    if (v.subject.kind === 'invoice') {
      const r = await createInvoiceCheckoutSession({ invoiceId: v.subject.invoiceId, createdBy: 'statement-link', sendEmail: false });
      if (r.checkoutUrl) return NextResponse.redirect(r.checkoutUrl, 303);
      return page('Nothing to pay', 'This invoice has no balance due. Thank you.', 200);
    }
    const statement = await loadPartnerStatement(v.subject.advertiserId, { scope: v.subject.scope });
    if (!statement) return page('Nothing to pay', 'There is no outstanding balance on this statement. Thank you.', 200);
    const withLink = await getOrCreatePartnerStatementOverdueLink(statement);
    if (withLink.overduePaymentLinkUrl) return NextResponse.redirect(withLink.overduePaymentLinkUrl, 303);
    return page('Nothing to pay', 'There is no outstanding balance on this statement. Thank you.', 200);
  } catch (e) {
    console.error('statement pay link failed', e);
    const origin = req.nextUrl.origin;
    return page('We could not open payment', `Please try again in a moment, or contact us. (${origin.replace(/^https?:\/\//, '')})`, 502);
  }
}
