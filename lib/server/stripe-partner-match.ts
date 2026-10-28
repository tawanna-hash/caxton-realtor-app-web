// Matches Stripe charges to partners: by customer id (advertiser or agreement), else charge metadata.
import type Stripe from 'stripe';
import { getSql, ensureSchema } from '@/lib/db';

export type PartnerRef = { id: number; name: string };

export async function matchPartners(charges: Stripe.Charge[]): Promise<(c: Stripe.Charge) => (PartnerRef & { agreement_id: string | null }) | null> {
  await ensureSchema();
  const sql = getSql();
  const cust = (c: Stripe.Charge) => (typeof c.customer === 'string' ? c.customer : c.customer?.id ?? null);
  const custIds = [...new Set(charges.map(cust).filter(Boolean))] as string[];
  const agIds = [...new Set(charges.map((c) => c.metadata?.agreement_id).filter(Boolean))] as string[];
  const advIds = [...new Set(charges.map((c) => Number(c.metadata?.advertiser_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const byCust = new Map<string, PartnerRef>();
  const byAg = new Map<string, PartnerRef>();
  const byAdv = new Map<number, PartnerRef>();
  if (custIds.length) {
    const r = (await sql`SELECT id, name, stripe_customer_id AS c FROM advertisers WHERE stripe_customer_id = ANY(${custIds})`) as unknown as Array<{ id: number; name: string; c: string }>;
    r.forEach((x) => byCust.set(x.c, { id: x.id, name: x.name }));
    const r2 = (await sql`SELECT a.id, a.name, g.stripe_customer_id AS c FROM agreements g JOIN advertisers a ON a.id = g.advertiser_id WHERE g.stripe_customer_id = ANY(${custIds})`) as unknown as Array<{ id: number; name: string; c: string }>;
    r2.forEach((x) => { if (!byCust.has(x.c)) byCust.set(x.c, { id: x.id, name: x.name }); });
  }
  if (agIds.length) {
    const r = (await sql`SELECT g.id::text AS gid, a.id, a.name FROM agreements g JOIN advertisers a ON a.id = g.advertiser_id WHERE g.id::text = ANY(${agIds})`) as unknown as Array<{ gid: string; id: number; name: string }>;
    r.forEach((x) => byAg.set(x.gid, { id: x.id, name: x.name }));
  }
  if (advIds.length) {
    const r = (await sql`SELECT id, name FROM advertisers WHERE id = ANY(${advIds})`) as unknown as PartnerRef[];
    r.forEach((x) => byAdv.set(x.id, x));
  }
  return (c) => {
    const ag = c.metadata?.agreement_id ?? null;
    const p = (cust(c) && byCust.get(cust(c) as string)) || (ag && byAg.get(ag)) || byAdv.get(Number(c.metadata?.advertiser_id)) || null;
    return p ? { ...p, agreement_id: ag } : null;
  };
}
