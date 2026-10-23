// /api/ad-sign/[token]/ach-setup — public, authorised by the signing token.
// A client who picks ACH connects their bank account BEFORE signing:
//   { action: 'start', returnPath }  -> { url }  Stripe Checkout (setup mode, bank only)
//   { action: 'confirm', sessionId } -> { status, label, last4 }  saved on the agreement + client
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/sign-token';
import { loadSetupTarget, createSetupCheckoutSession, saveFromCheckoutSession } from '@/lib/server/payment-setup';
import { isStripeConfigured } from '@/lib/stripe';
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
