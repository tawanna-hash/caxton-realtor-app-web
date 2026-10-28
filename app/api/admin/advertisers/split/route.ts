// Splits one partner record into a new per-market record (undo of a wrong merge).
// GET ?id=25 — inspect what is attached. POST { id, newPublication, rules } — create and move.
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureSchema();
  const sql = getSql();
  const id = Number(req.nextUrl.searchParams.get('id'));
  const out: Record<string, unknown> = {};
  const step = async (k: string, f: () => Promise<unknown>) => { try { out[k] = await f(); } catch (e) { out[k] = `ERR ${e instanceof Error ? e.message : String(e)}`; } };
  await step('pubCols', async () => ((await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'magazines'`) as unknown as Array<{ column_name: string }>).map((c) => c.column_name));
  await step('hot', async () => await sql`SELECT h.advertiser_name, h.magazine_id, count(*)::int AS n FROM magazine_hotspots h WHERE h.advertiser_id = ${id} GROUP BY 1,2 ORDER BY 2`);
  await step('mc', async () => await sql`SELECT segment, count(*)::int AS n FROM mailing_contacts WHERE advertiser_id = ${id} GROUP BY 1`);
  await step('pml', async () => await sql`SELECT id, created_at FROM portal_magic_links WHERE advertiser_id = ${id}`);
  await step('ph', async () => await sql`SELECT * FROM event_photos WHERE advertiser_id = ${id}`);
  return NextResponse.json(out);
}

type Rules = { magazineIds?: number[]; segments?: string[]; invoiceTotalCents?: number; scheduleIds?: string[]; hotspotNameLike?: string };

export async function POST(req: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: number; newPublication?: string; keepPublication?: string; rules?: Rules; dryRun?: boolean; slug?: string };
  const id = Number(b.id);
  if (!Number.isInteger(id) || !b.newPublication || !b.slug) return NextResponse.json({ error: 'id, newPublication, slug required' }, { status: 400 });
  await ensureSchema();
  const sql = getSql();
  const r = b.rules ?? {};
  const cols = ((await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'advertisers' AND column_name NOT IN ('id','slug','share_token','submission_token','portal_email','portal_activated_at','portal_onboarded_at','created_at','updated_at','publication','current_agreement_id','stripe_customer_id','stripe_payment_method_id','payment_method_label','payment_method_saved_at','payment_method_expiration','card_last4','hotspot_count','clicks_30d') AND is_generated = 'NEVER'`) as unknown as Array<{ column_name: string }>).map((c) => `"${c.column_name}"`);
  const plan = {
    hotspots: r.magazineIds?.length ? ((await sql`SELECT count(*)::int AS n FROM magazine_hotspots WHERE advertiser_id = ${id} AND magazine_id = ANY(${r.magazineIds})`)[0] as { n: number }).n : 0,
    mailing: r.segments?.length ? ((await sql`SELECT count(*)::int AS n FROM mailing_contacts WHERE advertiser_id = ${id} AND segment = ANY(${r.segments})`)[0] as { n: number }).n : 0,
    invoices: r.invoiceTotalCents ? ((await sql`SELECT count(*)::int AS n FROM invoices WHERE advertiser_id = ${id} AND total_cents = ${r.invoiceTotalCents}`)[0] as { n: number }).n : 0,
    schedules: r.scheduleIds?.length ?? 0,
  };
  if (b.dryRun) return NextResponse.json({ dryRun: true, plan });
  const token = () => randomBytes(16).toString('hex');
  const ins = (await sql.query(
    `INSERT INTO advertisers (${cols.join(',')}, slug, share_token, submission_token, publication)
     SELECT ${cols.join(',')}, $2, $3, $4, $5 FROM advertisers WHERE id = $1 RETURNING id`,
    [id, b.slug, token(), token(), b.newPublication],
  )) as unknown as Array<{ id: number }>;
  const nid = ins[0].id;
  if (b.keepPublication) await sql`UPDATE advertisers SET publication = ${b.keepPublication}, updated_at = NOW() WHERE id = ${id}`;
  if (r.magazineIds?.length) await sql`UPDATE magazine_hotspots SET advertiser_id = ${nid} WHERE advertiser_id = ${id} AND magazine_id = ANY(${r.magazineIds})`;
  if (r.segments?.length) await sql`UPDATE mailing_contacts SET advertiser_id = ${nid} WHERE advertiser_id = ${id} AND segment = ANY(${r.segments})`;
  if (r.invoiceTotalCents) await sql`UPDATE invoices SET advertiser_id = ${nid} WHERE advertiser_id = ${id} AND total_cents = ${r.invoiceTotalCents}`;
  if (r.scheduleIds?.length) await sql`UPDATE recurring_invoice_schedules SET advertiser_id = ${nid} WHERE advertiser_id = ${id} AND id = ANY(${r.scheduleIds})`;
  return NextResponse.json({ ok: true, newId: nid, plan });
}
