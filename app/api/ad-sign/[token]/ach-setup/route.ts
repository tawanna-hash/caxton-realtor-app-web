// POST { action: 'later', email } — public, authorised by the signing token.
// The client sends their accounts-payable contact a copy of the agreement and a
// pay-only link. The client still signs the agreement themselves.
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/sign-token';
import { getSql, ensureSchema } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { signPaymentSetupToken, paymentSetupUrl } from '@/lib/payment-setup-token';
import { rateLimited, clientIp } from '@/lib/server/simple-rate-limit';
import { createApRequest, recentApRequest } from '@/lib/server/ap-requests';
import { apEmail } from '@/lib/server/ap-email';
import { recordNewPartnerEvent } from '@/lib/new-partner-v2/service';
import type { Agreement } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 });
  if (rateLimited(`ap-send:${clientIp(req)}`, 10, 10 * 60 * 1000)) return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`SELECT * FROM agreements WHERE id = ${parsed.agreementId}`) as unknown as Agreement[];
    const ag = rows[0];
    if (!ag) return NextResponse.json({ error: 'agreement not found' }, { status: 404 });
    if (ag.signed_at) return NextResponse.json({ error: 'agreement already signed' }, { status: 409 });
    if (await recentApRequest(ag.id, 10)) return NextResponse.json({ error: 'A link was just sent. Please wait a few minutes before sending another.' }, { status: 429 });
    const url = paymentSetupUrl(signPaymentSetupToken({ kind: 'agreement', id: ag.id }).token).replace('/pay/setup', '/pay/ap');
    const mail = apEmail(ag, url);
    const sent = await sendEmail({ from: mail.from, to: email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: mail.replyTo });
    if (!sent.ok) return NextResponse.json({ error: 'Could not send the email. Please check the address and try again.' }, { status: 502 });
    await createApRequest(ag.id, email);
    await recordNewPartnerEvent(sql, ag.id, 'ap_link_sent', `Accounts payable link sent to ${email}.`);
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    console.error('[ad-sign ach-setup]', e);
    return NextResponse.json({ error: 'Could not send the request. Please try again.' }, { status: 500 });
  }
}
