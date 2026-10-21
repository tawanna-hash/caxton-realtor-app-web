// Document counts shown as chips on the Beta nav items.
import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = getSql();
  const one = async (q: Promise<unknown>): Promise<number> => {
    try { const r = (await q) as Array<{ n: number | string }>; return Number(r[0]?.n ?? 0); } catch { return 0; }
  };
  const [agreements, templates, clients, contacts, invoices, services, bundles, keys, team] = await Promise.all([
    one(sql`SELECT count(*)::int AS n FROM agreements WHERE status IN ('active','signed')`),
    one(sql`SELECT count(*)::int AS n FROM agreements_v2_builder_drafts WHERE kind = 'template'`),
    one(sql`SELECT count(*)::int AS n FROM advertisers WHERE COALESCE(status,'active') NOT IN ('prospect','archived','inactive')`),
    one(sql`SELECT (count(*) FILTER (WHERE COALESCE(contact_email,'') <> '') + count(*) FILTER (WHERE COALESCE(billing_email,'') <> '' AND billing_email IS DISTINCT FROM contact_email) + COALESCE(sum(CASE WHEN jsonb_typeof(additional_contacts) = 'array' THEN jsonb_array_length(additional_contacts) ELSE 0 END),0))::int AS n FROM advertisers WHERE COALESCE(status,'active') NOT IN ('prospect','archived','inactive')`),
    one(sql`SELECT count(*)::int AS n FROM invoices`),
    one(sql`SELECT count(*)::int AS n FROM products_services WHERE item_type <> 'bundle' AND is_active`),
    one(sql`SELECT count(*)::int AS n FROM products_services WHERE item_type = 'bundle' AND is_active`),
    one(sql`SELECT count(*)::int AS n FROM admin_api_keys WHERE revoked_at IS NULL`),
    one(sql`SELECT count(*)::int AS n FROM admins`),
  ]);
  return NextResponse.json({
    '/admin/agreements/renewals-v2': agreements,
    '/admin/agreements/templates-beta': templates,
    '/admin/agreements/clients': clients,
    '/admin/agreements/clients/contacts': contacts,
    '/admin/billing-hub': invoices,
    '/admin/services-beta': services,
    '/admin/services-beta/bundles': bundles,
    '/admin/integrations-beta/api-keys': keys,
    '/admin/settings-beta/team': team,
  });
}
