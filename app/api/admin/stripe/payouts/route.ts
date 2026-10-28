import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { matchPartners } from '@/lib/server/stripe-partner-match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sum = (a: Stripe.Balance['available']) => a.filter((x) => x.currency === 'usd').reduce((n, x) => n + x.amount, 0);

export type PayoutRow = {
  id: string; status: string; amount_cents: number; arrival_date: string; created: string; method: string; type: string;
  bank: string | null; description: string | null; failure: string | null; automatic: boolean; statement_descriptor: string | null;
};
export type ProcessingRow = {
  id: string; created: string; amount_cents: number; method: string; status: string; description: string | null;
  partner_id: number | null; partner_name: string | null; expected_available: string | null;
};

// GET ?starting_after=<po_id>&limit=<=100&status=&from=&to=
// Balance, payouts, and payments still processing (ACH not yet settled). Live from Stripe. Admin only.
export async function GET(req: NextRequest) {
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  const u = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(u.get('limit')) || 50));
  const after = u.get('starting_after') || undefined;
  const status = u.get('status') || undefined;
  const from = u.get('from') ? Math.floor(new Date(`${u.get('from')}T00:00:00`).getTime() / 1000) : undefined;
  const to = u.get('to') ? Math.floor(new Date(`${u.get('to')}T23:59:59`).getTime() / 1000) : undefined;
  const stripe = getStripe();
  try {
    const first = !after;
    const [payouts, balance, processing] = await Promise.all([
      stripe.payouts.list({ limit, starting_after: after, ...(status ? { status } : {}), ...(from || to ? { created: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}), expand: ['data.destination'] }),
      first ? stripe.balance.retrieve() : Promise.resolve(null),
      first ? stripe.paymentIntents.search({ query: "status:'processing'", limit: 100, expand: ['data.latest_charge', 'data.payment_method'] }) : Promise.resolve(null),
    ]);
    const rows: PayoutRow[] = payouts.data.map((p) => {
      const d = p.destination && typeof p.destination !== 'string' ? (p.destination as Stripe.BankAccount | Stripe.Card) : null;
      const bank = d ? ('bank_name' in d ? `${d.bank_name ?? 'Bank'} ••${d.last4}` : `${(d as Stripe.Card).brand} ••${d.last4}`) : null;
      return {
        id: p.id, status: p.status, amount_cents: p.amount, arrival_date: new Date(p.arrival_date * 1000).toISOString(), created: new Date(p.created * 1000).toISOString(),
        method: p.method, type: p.type, bank, description: p.description, failure: p.failure_message, automatic: p.automatic, statement_descriptor: p.statement_descriptor,
      };
    });
    let proc: ProcessingRow[] = []; let summary = null;
    if (balance) {
      summary = { available_cents: sum(balance.available), pending_cents: sum(balance.pending), in_transit_cents: payouts.data.filter((p) => p.status === 'in_transit' || p.status === 'pending').reduce((n, p) => n + p.amount, 0), instant_available_cents: sum(balance.instant_available ?? []) };
    }
    if (processing) {
      const charges = processing.data.map((pi) => (pi.latest_charge && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null)).filter(Boolean) as Stripe.Charge[];
      const match = await matchPartners(charges);
      proc = processing.data.map((pi) => {
        const c = pi.latest_charge && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null;
        const pm = pi.payment_method && typeof pi.payment_method !== 'string' ? pi.payment_method : null;
        const p = c ? match(c) : null;
        const method = pm?.us_bank_account ? `ACH ${pm.us_bank_account.bank_name ?? 'bank'} ••${pm.us_bank_account.last4}` : pm?.card ? `${pm.card.brand} ••${pm.card.last4}` : pm?.type ?? 'Unknown';
        return { id: pi.id, created: new Date(pi.created * 1000).toISOString(), amount_cents: pi.amount, method, status: pi.status, description: pi.description, partner_id: p?.id ?? null, partner_name: p?.name ?? null, expected_available: null };
      });
    }
    return NextResponse.json({ payouts: rows, has_more: payouts.has_more, next: rows.length ? rows[rows.length - 1].id : null, balance: summary, processing: proc });
  } catch (err) {
    console.error('[admin/stripe/payouts]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load Stripe payouts.' }, { status: 502 });
  }
}
