// GET: balance transactions (charges, refunds, fees, adjustments) that make up one Stripe payout.
import { NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  const { id } = await ctx.params;
  if (!/^po_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const stripe = getStripe();
    const payout = await stripe.payouts.retrieve(id);
    const rows: Array<{ id: string; created: string; type: string; description: string | null; gross_cents: number; fee_cents: number; net_cents: number; source: string | null }> = [];
    let after: string | undefined;
    do {
      const page = await stripe.balanceTransactions.list({ payout: id, limit: 100, ...(after ? { starting_after: after } : {}) });
      for (const t of page.data) rows.push({ id: t.id, created: new Date(t.created * 1000).toISOString(), type: t.type, description: t.description, gross_cents: t.amount, fee_cents: t.fee, net_cents: t.net, source: typeof t.source === 'string' ? t.source : t.source?.id ?? null });
      after = page.has_more ? page.data.at(-1)?.id : undefined;
    } while (after && rows.length < 500);
    return NextResponse.json({
      payout: { id: payout.id, amount_cents: payout.amount, status: payout.status, method: payout.method, type: payout.type, created: new Date(payout.created * 1000).toISOString(), arrival: new Date(payout.arrival_date * 1000).toISOString().slice(0, 10), statement_descriptor: payout.statement_descriptor, failure_message: payout.failure_message },
      transactions: rows,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load payout.', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
