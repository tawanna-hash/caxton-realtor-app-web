// Payment Method Setup template (Templates (Beta)).
//   GET  -> agreements the template can be sent for (with market + prefill)
//   POST { action: 'link', agreement_id } -> signed client setup link + prefill
//   POST { market, fields, to? } -> send a TEST from the market's sender
//        (recipient defaults to tawanna@myrealtyline.com)
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getSql, ensureSchema } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { renderPaymentMethodHtml, type PaymentMethodFields } from '@/lib/agreements-v2/payment-method-template';
import { signPaymentSetupToken, paymentSetupUrl } from '@/lib/payment-setup-token';
import { loadSetupAgreement, marketForAgreement, type SetupAgreement } from '@/lib/server/payment-setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TEST_TO = 'tawanna@myrealtyline.com';
const KEYS: Array<keyof PaymentMethodFields> = ['client_first_name', 'agreement_name_or_number', 'payment_terms', 'billing_schedule', 'payment_setup_url'];

const money = (c: number | null | undefined) => (c == null ? '' : (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));

function prefill(ag: SetupAgreement) {
  const brand = marketForAgreement(ag);
  const monthly = ag.total_monthly_rate_cents ?? null;
  return {
    market: brand.market,
    fields: {
      client_first_name: (ag.rep_name ?? '').trim().split(/\s+/)[0] || '',
      agreement_name_or_number: [ag.company_name, ag.ad_size].filter(Boolean).join(' — ') || `Agreement ${ag.id.slice(0, 8)}`,
      payment_terms: monthly != null ? `${money(monthly)} per month` : money(ag.amount_cents),
      billing_schedule: monthly != null ? 'Monthly' : '',
    } as PaymentMethodFields,
    to: ag.billing_email ?? ag.advertiser_email ?? null,
  };
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureSchema();
  const rows = (await getSql()`
    SELECT a.*, adv.publication AS advertiser_publication
      FROM agreements a LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
     WHERE a.status <> 'cancelled'
     ORDER BY a.updated_at DESC NULLS LAST LIMIT 300`) as unknown as SetupAgreement[];
  return NextResponse.json({
    agreements: rows.map((ag) => ({
      id: ag.id,
      label: [ag.company_name ?? ag.rep_name ?? 'Unnamed', ag.ad_size, ag.status].filter(Boolean).join(' · '),
      has_method: !!ag.stripe_payment_method_id,
      ...prefill(ag),
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  if (body.action === 'link') {
    const id = typeof body.agreement_id === 'string' ? body.agreement_id : '';
    const ag = id ? await loadSetupAgreement(id) : null;
    if (!ag) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    const { token, expiresAt } = signPaymentSetupToken(ag.id);
    const p = prefill(ag);
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
