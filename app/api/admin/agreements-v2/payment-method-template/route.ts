// Payment Method Setup template (Templates (Beta)).
//   GET  -> clients the template can be sent to (with market)
//   POST { action: 'link', advertiser_id } -> signed client setup link + prefill
//   POST { market, fields, to? } -> send a TEST from the market's sender
//        (recipient defaults to tawanna@myrealtyline.com)
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getSql } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { renderPaymentMethodHtml, type PaymentMethodFields } from '@/lib/agreements-v2/payment-method-template';
import { signPaymentSetupToken, paymentSetupUrl } from '@/lib/payment-setup-token';
import { ensurePaymentSetupSchema, loadSetupTarget, type SetupTarget } from '@/lib/server/payment-setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TEST_TO = 'tawanna@myrealtyline.com';
const KEYS: Array<keyof PaymentMethodFields> = ['client_first_name', 'agreement_name_or_number', 'payment_terms', 'billing_schedule', 'payment_setup_url'];

const money = (c: number | null | undefined) => (c == null ? '' : (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));

function prefill(t: SetupTarget) {
  const ag = t.agreement;
  const monthly = ag?.total_monthly_rate_cents ?? null;
  return {
    market: t.brand.market,
    fields: {
      client_first_name: t.firstName ?? '',
      agreement_name_or_number: ag ? ([t.company, ag.ad_size].filter(Boolean).join(' — ') || `Agreement ${ag.id.slice(0, 8)}`) : '',
      payment_terms: ag ? (monthly != null ? `${money(monthly)} per month` : money(ag.amount_cents)) : '',
      billing_schedule: monthly != null ? 'Monthly' : '',
    } as PaymentMethodFields,
    to: t.email,
    has_agreement: !!ag,
  };
}

type ClientRow = { id: number; name: string | null; company: string | null; publication: string | null; status: string | null; has_method: boolean; has_agreement: boolean };

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensurePaymentSetupSchema();
  const rows = (await getSql()`
    SELECT a.id, a.name, a.company, a.publication, a.status,
           (a.stripe_payment_method_id IS NOT NULL OR EXISTS (SELECT 1 FROM agreements g WHERE g.advertiser_id = a.id AND g.stripe_payment_method_id IS NOT NULL)) AS has_method,
           (a.current_agreement_id IS NOT NULL) AS has_agreement
      FROM advertisers a
     WHERE COALESCE(a.status, '') NOT IN ('archived', 'inactive')
     ORDER BY LOWER(COALESCE(NULLIF(a.company, ''), a.name)) ASC
     LIMIT 1000`) as unknown as ClientRow[];
  return NextResponse.json({
    clients: rows.map((c) => {
      const pub = (c.publication ?? '').split(',')[0]?.trim();
      return {
        id: c.id,
        label: c.company?.trim() || c.name?.trim() || `Client ${c.id}`,
        market: pub === 'san_antonio' ? 'san_antonio' : 'austin',
        has_method: c.has_method,
        has_agreement: c.has_agreement,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  if (body.action === 'link') {
    const id = Number(body.advertiser_id);
    const t = Number.isInteger(id) && id > 0 ? await loadSetupTarget({ kind: 'client', id }) : null;
    if (!t) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    const { token, expiresAt } = signPaymentSetupToken({ kind: 'client', id });
    const p = prefill(t);
    return NextResponse.json({ url: paymentSetupUrl(token), expires_at: expiresAt.toISOString(), ...p, fields: { ...p.fields, payment_setup_url: paymentSetupUrl(token) } });
  }

  const raw = (body.fields ?? {}) as Record<string, unknown>;
  const fields: PaymentMethodFields = {};
  for (const k of KEYS) if (typeof raw[k] === 'string') fields[k] = (raw[k] as string).slice(0, 800);
  const to = typeof body.to === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to.trim()) ? body.to.trim() : DEFAULT_TEST_TO;
  const out = renderPaymentMethodHtml(typeof body.market === 'string' ? body.market : null, fields);
  const res = await sendEmail({ from: out.from, to, subject: `[Test] ${out.subject}`, html: out.html, replyTo: out.brand.billing_contact_email });
  if (!res.ok) {
    console.error('[payment-method-template] test send failed', { from: out.from, error: 'error' in res ? res.error : 'unknown' });
    return NextResponse.json({ error: 'send failed', detail: 'error' in res ? res.error : 'error' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to, from: out.from });
}
