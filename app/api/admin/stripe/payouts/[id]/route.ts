import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { matchPartners } from '@/lib/server/stripe-partner-match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type PayoutLine = {
  id: string; type: string; created: string; description: string | null; gross_cents: number; fee_cents: number; net_cents: number;
  charge_id: string | null; partner_id: number | null; partner_name: string | null; agreement_id: string | null; receipt_url: string | null; method: string | null;
};

// GET: every balance transaction inside one payout (charges, refunds, fees, adjustments), matched to partners.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  const { id } = await ctx.params;
  if (!/^po_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const stripe = getStripe();
  try {
    const lines: Stripe.BalanceTransaction[] = [];
    let after: string | undefined;
    for (let i = 0; i < 20; i++) {
      const l = await stripe.balanceTransactions.list({ payout: id, limit: 100, starting_after: after, expand: ['data.source'] });
      lines.push(...l.data);
      if (!l.has_more) break;
      after = l.data[l.data.length - 1].id;
    }
    const charges: Stripe.Charge[] = [];
    for (const b of lines) {
      const s = b.source as unknown;
      if (s && typeof s === 'object') {
        const o = s as { object?: string; charge?: unknown };
        if (o.object === 'charge') charges.push(s as Stripe.Charge);
      }
    }
    const match = await matchPartners(charges);
    const out: PayoutLine[] = lines.filter((b) => b.type !== 'payout').map((b) => {
      const s = b.source as unknown;
      const c = s && typeof s === 'object' && (s as { object?: string }).object === 'charge' ? (s as Stripe.Charge) : null;
      const p = c ? match(c) : null;
      const d = c?.payment_method_details;
      const method = d?.card ? `${d.card.brand} ••${d.card.last4}` : d?.us_bank_account ? `ACH ••${d.us_bank_account.last4}` : null;
      return {
        id: b.id, type: b.type, created: new Date(b.created * 1000).toISOString(), description: b.description ?? c?.description ?? null,
        gross_cents: b.amount, fee_cents: b.fee, net_cents: b.net, charge_id: c?.id ?? null, partner_id: p?.id ?? null, partner_name: p?.name ?? null,
        agreement_id: p?.agreement_id ?? null, receipt_url: c?.receipt_url ?? null, method,
      };
    });
    return NextResponse.json({ lines: out });
  } catch (err) {
    console.error('[admin/stripe/payouts/id]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load payout detail.' }, { status: 502 });
  }
}
