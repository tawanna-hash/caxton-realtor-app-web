// GET /api/cron/email-sender-health — Bearer CRON_SECRET.
// Reports whether each market sender has a Resend key (booleans only, never
// the key). With ?send=austin|san_antonio it sends a [Test] Payment Method
// Setup email through the same in-app path to tawanna@myrealtyline.com.
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { renderPaymentMethodHtml } from '@/lib/agreements-v2/payment-method-template';
import { getSql } from '@/lib/db';
import { signPaymentSetupToken, paymentSetupUrl } from '@/lib/payment-setup-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const keys = {
    myrealtyline: !!process.env.RESEND_API_KEY_MYREALTYLINE?.trim(),
    newslinesa: !!(process.env.RESEND_API_KEY_NEWSLINESA ?? process.env.RESEND_API_KEY)?.trim(),
  };
  if (req.nextUrl.searchParams.get('setup_probe') === '1') {
    // Temporary verification: signed setup link for a test agreement.
    const rows = (await getSql()`SELECT id, company_name, stripe_customer_id FROM agreements WHERE company_name ILIKE '%test%' AND status <> 'cancelled' ORDER BY (stripe_customer_id IS NOT NULL) DESC, updated_at DESC NULLS LAST LIMIT 1`) as unknown as Array<{ id: string; company_name: string; stripe_customer_id: string | null }>;
    if (!rows[0]) return NextResponse.json({ keys, probe: null });
    return NextResponse.json({ keys, probe: { company: rows[0].company_name, has_customer: !!rows[0].stripe_customer_id, url: paymentSetupUrl(signPaymentSetupToken(rows[0].id, 1).token) } });
  }
  const market = req.nextUrl.searchParams.get('send');
  if (market !== 'austin' && market !== 'san_antonio') return NextResponse.json({ keys });
  const out = renderPaymentMethodHtml(market, { client_first_name: 'Tawanna', agreement_name_or_number: 'AGR-TEST', payment_terms: '$1,880 per month', billing_schedule: 'Monthly on the 1st' });
  const res = await sendEmail({ from: out.from, to: 'tawanna@myrealtyline.com', subject: `[Test] ${out.subject}`, html: out.html, replyTo: out.brand.billing_contact_email });
  return NextResponse.json({ keys, from: out.from, result: res });
}
