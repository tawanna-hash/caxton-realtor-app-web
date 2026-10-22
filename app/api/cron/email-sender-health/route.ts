// GET /api/cron/email-sender-health — Bearer CRON_SECRET.
// Reports whether each market sender has a Resend key (booleans only, never
// the key). With ?send=austin|san_antonio it sends a [Test] Payment Method
// Setup email through the same in-app path to tawanna@myrealtyline.com.
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { renderPaymentMethodHtml } from '@/lib/agreements-v2/payment-method-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const keys = {
    myrealtyline: !!process.env.RESEND_API_KEY_MYREALTYLINE?.trim(),
    newslinesa: !!(process.env.RESEND_API_KEY_NEWSLINESA ?? process.env.RESEND_API_KEY)?.trim(),
  };
  const market = req.nextUrl.searchParams.get('send');
  if (market !== 'austin' && market !== 'san_antonio') return NextResponse.json({ keys });
  const out = renderPaymentMethodHtml(market, { client_first_name: 'Tawanna', agreement_name_or_number: 'AGR-TEST', payment_terms: '$1,880 per month', billing_schedule: 'Monthly on the 1st' });
  const res = await sendEmail({ from: out.from, to: 'tawanna@myrealtyline.com', subject: `[Test] ${out.subject}`, html: out.html, replyTo: out.brand.billing_contact_email });
  return NextResponse.json({ keys, from: out.from, result: res });
}
