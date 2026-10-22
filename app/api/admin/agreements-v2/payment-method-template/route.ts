// POST { market, fields, to? } -> send a TEST of the Payment Method Setup email.
// Sends from the market's sender; defaults the recipient to tawanna@myrealtyline.com.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { sendEmail } from '@/lib/email';
import { renderPaymentMethodHtml, type PaymentMethodFields } from '@/lib/agreements-v2/payment-method-template';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TEST_TO = 'tawanna@myrealtyline.com';
const KEYS: Array<keyof PaymentMethodFields> = ['client_first_name', 'agreement_name_or_number', 'payment_terms', 'billing_schedule', 'payment_setup_url'];

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const raw = (body.fields ?? {}) as Record<string, unknown>;
  const fields: PaymentMethodFields = {};
  for (const k of KEYS) if (typeof raw[k] === 'string') fields[k] = (raw[k] as string).slice(0, 500);
  const to = typeof body.to === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to.trim()) ? body.to.trim() : DEFAULT_TEST_TO;
  const out = renderPaymentMethodHtml(typeof body.market === 'string' ? body.market : null, fields);
  const res = await sendEmail({ from: out.from, to, subject: `[Test] ${out.subject}`, html: out.html, replyTo: out.brand.billing_contact_email });
  if (!res.ok) return NextResponse.json({ error: 'send failed', detail: 'error' in res ? res.error : 'error' }, { status: 502 });
  return NextResponse.json({ ok: true, to, from: out.from });
}
