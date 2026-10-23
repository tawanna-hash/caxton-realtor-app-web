// /api/ad-sign/[token]/ach-setup — public, authorised by the signing token.
// A client who picks ACH connects their bank account before signing, or sends
// the setup link to accounts payable to do it:
//   { action: 'later', email }       -> emails the secure setup link to that address
//   { action: 'start', returnPath }  -> { url }  Stripe Checkout (setup mode, bank only)
//   { action: 'confirm', sessionId } -> { status, label, last4 }  saved on the agreement + client
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/sign-token';
import { loadSetupTarget, createSetupCheckoutSession, saveFromCheckoutSession } from '@/lib/server/payment-setup';
import { isStripeConfigured } from '@/lib/stripe';
import { signPaymentSetupToken, paymentSetupUrl } from '@/lib/payment-setup-token';
import { renderPaymentMethodHtml, renderPaymentMethodText, type PaymentMethodFields } from '@/lib/agreements-v2/payment-method-template';
import { sendEmail } from '@/lib/email';
import { logClientSetup } from '@/lib/server/payment-setup';
import { recordSetupRequest } from '@/lib/server/payment-setup-reminders';
import { rateLimited, clientIp } from '@/lib/server/simple-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 });
  if (rateLimited(`ach-setup:${clientIp(req)}`, 20, 10 * 60 * 1000)) return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Payments are not available right now.' }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const t = await loadSetupTarget({ kind: 'agreement', id: parsed.agreementId });
  if (!t) return NextResponse.json({ error: 'agreement not found' }, { status: 404 });
  if (t.agreement?.signed_at) return NextResponse.json({ error: 'agreement already signed' }, { status: 409 });

  try {
    if (body.action === 'confirm') {
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return NextResponse.json({ error: 'invalid session' }, { status: 400 });
      const saved = await saveFromCheckoutSession(t, sessionId);
      if ('error' in saved) return NextResponse.json({ error: saved.error }, { status: 400 });
      return NextResponse.json({ status: saved.status, label: saved.label, last4: saved.last4 });
    }

    if (body.action === 'later') {
      // Accounts payable connects the bank account: email them the secure setup link.
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
      const { token: setupTok, expiresAt } = signPaymentSetupToken({ kind: 'agreement', id: parsed.agreementId });
      const url = paymentSetupUrl(setupTok);
      const ag = t.agreement;
      const monthly = ag?.total_monthly_rate_cents ?? null;
      const fields: PaymentMethodFields = {
        client_first_name: 'there',
        agreement_name_or_number: ag ? ([t.company, ag.ad_size].filter(Boolean).join(' \u2014 ') || `Agreement ${ag.id.slice(0, 8)}`) : 'your advertising agreement',
        payment_terms: monthly != null ? `${(monthly / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} per month` : 'the amounts in the advertising agreement',
        billing_schedule: monthly != null ? 'Monthly' : 'the billing schedule in the advertising agreement',
        payment_setup_url: url,
      };
      const out = renderPaymentMethodHtml(t.brand.market, fields);
      const sent = await sendEmail({ from: out.from, to: email, subject: out.subject, html: out.html, text: renderPaymentMethodText(t.brand.market, fields), replyTo: out.brand.billing_contact_email });
      if (!sent.ok) return NextResponse.json({ error: 'Could not send the email. Please check the address and try again.' }, { status: 502 });
      await recordSetupRequest(parsed.agreementId, email, t.brand.market);
      if (t.advertiser) {
        await logClientSetup({
          advertiserId: t.advertiser.id, event: 'request_sent', actor: 'client (sign wizard)', market: out.brand.market,
          fromEmail: out.from, to: [email], cc: [], subject: out.subject, html: out.html, setupUrl: url,
          linkExpiresAt: expiresAt, agreementId: ag?.id ?? null, details: 'Client chose ACH and asked to set it up later (accounts payable)',
        });
      }
      return NextResponse.json({ ok: true, email });
    }

    // start
    const rp = typeof body.returnPath === 'string' ? body.returnPath : '';
    if (!rp.startsWith('/') || rp.startsWith('//') || !rp.includes(token)) return NextResponse.json({ error: 'invalid return path' }, { status: 400 });
    const base = req.nextUrl.origin;
    const url = await createSetupCheckoutSession(t, {
      methods: ['us_bank_account'],
      successUrl: `${base}${rp}?ach_session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}${rp}?ach_canceled=1`,
    });
    if (!url) return NextResponse.json({ error: 'Could not start bank setup.' }, { status: 502 });
    return NextResponse.json({ url });
  } catch (e) {
    console.error('[ad-sign ach-setup]', e);
    return NextResponse.json({ error: 'Could not connect the bank account. Please try again.' }, { status: 500 });
  }
}
