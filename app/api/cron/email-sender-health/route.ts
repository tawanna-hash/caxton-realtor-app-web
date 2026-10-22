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
  // TEMP: rebuild one pre-history request from its known details.
  const rb = req.nextUrl.searchParams.get('rebuild');
  if (rb) {
    const crypto = await import('node:crypto');
    const { getSql } = await import('@/lib/db');
    const { verifyPaymentSetupToken, paymentSetupUrl } = await import('@/lib/payment-setup-token');
    const { ensurePaymentSetupSchema, loadSetupTarget } = await import('@/lib/server/payment-setup');
    await ensurePaymentSetupSchema();
    const sql = getSql();
    const adv = (await sql`SELECT id, company, name, contact_email, billing_email, publication FROM advertisers WHERE LOWER(contact_email) = LOWER(${rb}) OR LOWER(billing_email) = LOWER(${rb}) OR LOWER(company) LIKE '%champions%school%'`) as unknown as Array<{ id: number }>;
    const linkAt = Number(req.nextUrl.searchParams.get('link_ms'));
    const sentAt = Number(req.nextUrl.searchParams.get('sent_ms'));
    if (adv.length !== 1) return NextResponse.json({ adv });
    const id = adv[0].id;
    const exp = Math.floor(linkAt / 1000) + 30 * 86400;
    const body = `c${id}.${exp}`;
    const token = `${body}.${crypto.createHmac('sha256', process.env.SIGN_SECRET!).update(`pm_setup:${body}`).digest('base64url')}`;
    const ok = verifyPaymentSetupToken(token);
    const t = await loadSetupTarget({ kind: 'client', id });
    if (!t) return NextResponse.json({ error: 'no target' });
    const url = paymentSetupUrl(token);
    const out = renderPaymentMethodHtml(t.brand.market, { client_first_name: 'Courtney', payment_terms: '$755 per month', billing_schedule: 'Monthly on the 18th', payment_setup_url: url });
    const row = { id, company: t.company, market: t.brand.market, from: out.from, subject: out.subject, ok, exp: new Date(exp * 1000).toISOString(), agreement: t.agreement?.id ?? null, inserted: false };
    if (req.nextUrl.searchParams.get('commit') === '1') {
      const ins = await sql`
        INSERT INTO client_payment_setup_log (advertiser_id, event, created_at, market, from_email, to_emails, cc_emails, subject, html, setup_url, link_expires_at, agreement_id, details, stripe_ref)
        VALUES (${id}, 'request_sent', ${new Date(sentAt).toISOString()}, ${t.brand.market}, ${out.from}, ${[rb]}, ${[]}, ${out.subject}, ${out.html}, ${url}, ${new Date(exp * 1000).toISOString()}, ${t.agreement?.id ?? null},
                'Sent before history was added; email copy rebuilt from the template with the same details', ${'backfill:courtney-2026-10-21'})
        ON CONFLICT DO NOTHING RETURNING id`;
      row.inserted = ins.length > 0;
    }
    return NextResponse.json(row);
  }
  // TEMP: backfill a Payment Method Setup request sent before history existed.
  const bf = req.nextUrl.searchParams.get('backfill');
  if (bf) {
    const { getSql } = await import('@/lib/db');
    const { verifyPaymentSetupToken } = await import('@/lib/payment-setup-token');
    const { ensurePaymentSetupSchema, loadSetupTarget } = await import('@/lib/server/payment-setup');
    const key = process.env.RESEND_API_KEY_NEWSLINESA ?? process.env.RESEND_API_KEY;
    const keyA = process.env.RESEND_API_KEY_MYREALTYLINE;
    const found: Array<Record<string, unknown>> = [];
    for (const k of [key, keyA]) {
      if (!k) continue;
      const list = await fetch('https://api.resend.com/emails?limit=100', { headers: { authorization: `Bearer ${k}` } }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
      const data = (list?.data ?? []) as Array<{ id: string; to: string[]; subject: string; created_at: string }>;
      for (const e of data) {
        if (!(e.to ?? []).some((t) => t.toLowerCase() === bf.toLowerCase())) continue;
        if (!/payment method/i.test(e.subject ?? '') || /^\[Test\]/.test(e.subject ?? '')) continue;
        const full = await fetch(`https://api.resend.com/emails/${e.id}`, { headers: { authorization: `Bearer ${k}` } }).then((r) => r.json());
        const tokenStr = /realtynewsnow\.app\/pay\/setup\/([A-Za-z0-9_.-]+)/.exec(full.html ?? '')?.[1];
        const tok = tokenStr ? verifyPaymentSetupToken(tokenStr) : null;
        const t = tok && tok.ok ? await loadSetupTarget(tok.subject) : null;
        const row = { id: e.id, to: full.to, cc: full.cc, from: full.from, subject: full.subject, created_at: full.created_at, last_event: full.last_event, advertiser_id: t?.advertiser?.id ?? null, company: t?.company ?? null, tok: tok ? (tok.ok ? 'ok' : tok.reason) : 'none', inserted: false };
        if (req.nextUrl.searchParams.get('commit') === '1' && t?.advertiser && tokenStr) {
          await ensurePaymentSetupSchema();
          const ins = await getSql()`
            INSERT INTO client_payment_setup_log (advertiser_id, event, created_at, actor, market, from_email, to_emails, cc_emails, subject, html, setup_url, link_expires_at, agreement_id, details, stripe_ref)
            VALUES (${t.advertiser.id}, 'request_sent', ${full.created_at}, 'tawanna@myrealtyline.com', ${t.brand.market}, ${full.from}, ${full.to ?? []}, ${full.cc ?? []}, ${full.subject}, ${full.html}, ${`https://realtynewsnow.app/pay/setup/${tokenStr}`}, ${new Date(Number(tokenStr.split('.')[1]) * 1000).toISOString()}, ${t.agreement?.id ?? null}, 'Added from the Resend send record', ${`resend:${e.id}`})
            ON CONFLICT DO NOTHING RETURNING id`;
          row.inserted = ins.length > 0;
        }
        found.push(row);
      }
      if (!data.length) found.push({ listError: list?.error ?? list?.message ?? 'no data' });
    }
    return NextResponse.json({ found });
  }
  const market = req.nextUrl.searchParams.get('send');
  if (market !== 'austin' && market !== 'san_antonio') return NextResponse.json({ keys });
  const out = renderPaymentMethodHtml(market, { client_first_name: 'Tawanna', agreement_name_or_number: 'AGR-TEST', payment_terms: '$1,880 per month', billing_schedule: 'Monthly on the 1st' });
  const res = await sendEmail({ from: out.from, to: 'tawanna@myrealtyline.com', subject: `[Test] ${out.subject}`, html: out.html, replyTo: out.brand.billing_contact_email });
  return NextResponse.json({ keys, from: out.from, result: res });
}
