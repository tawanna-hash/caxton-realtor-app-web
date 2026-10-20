// app/api/admin/agreements-v2/payouts/route.ts
//
// GET ?range=30-days|90-days|12-months|all : Stripe payouts for the Payouts tab
// in Agreements (Beta). Read-only; mirrors the Get Paid Stripe payouts page.

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  const r = new URL(req.url).searchParams.get('range') ?? '90-days';
  const days = r === '30-days' ? 30 : r === '90-days' ? 90 : r === '12-months' ? 365 : null;
  const gte = days == null ? undefined : Math.floor((Date.now() - days * 86_400_000) / 1000);
  try {
    const stripe = getStripe();
    const payouts: Awaited<ReturnType<typeof stripe.payouts.list>>['data'] = [];
    let after: string | undefined;
    do {
      const page = await stripe.payouts.list({ limit: 100, ...(gte ? { created: { gte } } : {}), ...(after ? { starting_after: after } : {}) });
      payouts.push(...page.data);
      after = page.has_more ? page.data.at(-1)?.id : undefined;
    } while (after && payouts.length < 400);

    const rows: Array<{ id: string; batch_date: string; amount_cents: number; fees_cents: number; transactions: number; status: string }> = [];
    for (let i = 0; i < payouts.length; i += 8) {
      const chunk = payouts.slice(i, i + 8);
      rows.push(...(await Promise.all(chunk.map(async (p) => {
        let tx = 0, fees = 0, cursor: string | undefined;
        do {
          const page = await stripe.balanceTransactions.list({ payout: p.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
          tx += page.data.length;
          fees += page.data.reduce((n, t) => n + t.fee, 0);
          cursor = page.has_more ? page.data.at(-1)?.id : undefined;
        } while (cursor);
        return { id: p.id, batch_date: new Date(p.arrival_date * 1000).toISOString().slice(0, 10), amount_cents: p.amount, fees_cents: fees, transactions: tx, status: p.status };
      }))));
    }
    return NextResponse.json({ payouts: rows });
  } catch (err) {
    return NextResponse.json({ error: 'Could not load Stripe payouts.', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
