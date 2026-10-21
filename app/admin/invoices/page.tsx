// Invoices now live in Billing > Invoices. This route only forwards old links
// (bookmarks, emails) and keeps /admin/invoices/[id]/preview working beside it.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InvoicesRedirect({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const out = new URLSearchParams({ tab: 'invoices' });
  const invoice = one(sp.edit) ?? one(sp.focus) ?? one(sp.id) ?? one(sp.invoice);
  if (invoice) out.set('invoice', invoice);
  if (one(sp.create) === '1') {
    out.set('create', '1');
    const adv = one(sp.advertiser_id) ?? one(sp.clientId);
    if (adv) out.set('clientId', adv);
    for (const k of ['agreement_id', 'amount_cents'] as const) { const v = one(sp[k]); if (v) out.set(k, v); }
  }
  redirect(`/admin/billing-hub?${out.toString()}`);
}
