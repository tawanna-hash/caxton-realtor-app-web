// app/api/portal/invoices/[id]/checkout/route.ts
//
// POST — advertiser (portal session) or staff (admin session) creates a
// Stripe Checkout Session for an invoice. Used by:
//   - the embedded/hosted pay page at /portal/invoices/[id]
//   - the admin "Get payment link" action (ui_mode='hosted')
//
// Body: { ui_mode?: 'hosted' | 'embedded' }
// Returns: { url } for hosted, { client_secret } for embedded.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe, isStripeConfigured, withSurcharge } from '@/lib/stripe';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.myrealtyline.com';

interface InvoiceRow {
  id: string;
  advertiser_id: number | null;
  number: string;
  status: string;
  total_cents: number;
  bill_to_name: string | null;
  bill_to_email: string | null;
  stripe_customer_id: string | null;
  memo: string | null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 });
  }

  // Auth: either a portal session scoped to this invoice's advertiser, or an admin.
  const [portalUser, admin] = await Promise.all([getCurrentPortalUser(), getCurrentAdmin()]);
  if (!portalUser && !admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const uiMode = body.ui_mode === 'embedded' ? 'embedded' : 'hosted';

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, advertiser_id, number, status, total_cents,
             bill_to_name, bill_to_email, stripe_customer_id, memo
      FROM invoices WHERE id = ${id}
    `) as unknown as InvoiceRow[];
    if (rows.length === 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    const inv = rows[0];

    if (portalUser && inv.advertiser_id !== portalUser.advertiser_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (inv.status === 'paid') {
      return NextResponse.json({ error: 'This invoice is already paid.' }, { status: 400 });
    }
    if (inv.status === 'void') {
      return NextResponse.json({ error: 'This invoice has been voided.' }, { status: 400 });
    }
    if (!inv.total_cents || inv.total_cents <= 0) {
      return NextResponse.json({ error: 'Invoice has no amount due.' }, { status: 400 });
    }

    const stripe = getStripe();
    const chargeCents = withSurcharge(inv.total_cents);
    const successUrl = `${APP_BASE_URL}/portal/invoices/${inv.id}?paid=1`;
    const cancelUrl = `${APP_BASE_URL}/portal/invoices/${inv.id}?canceled=1`;

    const sessionParams: Record<string, unknown> = {
      mode: 'payment' as const,
      customer: inv.stripe_customer_id ?? undefined,
      customer_email: inv.stripe_customer_id ? undefined : (inv.bill_to_email ?? undefined),
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: chargeCents,
            product_data: {
              name: `Invoice ${inv.number}`,
              description: inv.memo ?? 'RealtyLine advertising invoice (includes 3% card processing fee)',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        source: 'invoice_payment',
        invoice_id: inv.id,
        invoice_number: inv.number,
      },
      payment_intent_data: {
        metadata: {
          source: 'invoice_payment',
          invoice_id: inv.id,
          invoice_number: inv.number,
        },
      },
    };

    if (uiMode === 'embedded') {
      sessionParams.ui_mode = 'embedded';
      sessionParams.return_url = `${APP_BASE_URL}/portal/invoices/${inv.id}?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    } else {
      sessionParams.success_url = successUrl;
      sessionParams.cancel_url = cancelUrl;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await stripe.checkout.sessions.create(sessionParams as any);

    await sql`
      UPDATE invoices
      SET stripe_checkout_session_id = ${session.id}
      WHERE id = ${inv.id}
    `;

    if (uiMode === 'embedded') {
      return NextResponse.json({ client_secret: session.client_secret });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('invoice checkout failed', err);
    return NextResponse.json(
      { error: 'checkout failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
}
