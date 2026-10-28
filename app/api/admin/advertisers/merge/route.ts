// POST { keepId, mergeIds[], dryRun? } — merge duplicate partner records into one.
// GET — list suspected duplicate groups (same normalized name or same email).
// Every table with an advertiser_id column is re-pointed to the kept record; empty fields on the kept
// record are filled from the merged ones; the merged records are then removed.
import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

type Adv = Record<string, unknown> & { id: string; company: string | null; name: string | null; contact_email: string | null; billing_email: string | null; created_at: string };

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureSchema();
  const rows = (await getSql()`SELECT id, company, name, contact_email, billing_email, publication, current_agreement_id, created_at FROM advertisers ORDER BY created_at`) as unknown as Adv[];
  const parent = new Map<string, string>();
  const find = (x: string): string => { let p = parent.get(x) ?? x; while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p; return p; };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const seen = new Map<string, string>();
  for (const r of rows) {
    const keys = [`n:${norm(r.company || r.name)}`, ...[r.contact_email, r.billing_email].filter(Boolean).map((e) => `e:${String(e).toLowerCase()}`)].filter((k) => k !== 'n:');
    for (const k of keys) { const o = seen.get(k); if (o) union(r.id, o); else seen.set(k, r.id); }
  }
  const groups = new Map<string, Adv[]>();
  for (const r of rows) { const g = find(r.id); groups.set(g, [...(groups.get(g) ?? []), r]); }
  return NextResponse.json({ groups: [...groups.values()].filter((g) => g.length > 1) });
}

export async function POST(req: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { keepId?: string; mergeIds?: string[]; dryRun?: boolean };
  const keepId = b.keepId ?? '';
  const mergeIds = (b.mergeIds ?? []).filter((x) => x !== keepId);
  if (!UUID.test(keepId) || !mergeIds.length || !mergeIds.every((x) => UUID.test(x))) return NextResponse.json({ error: 'keepId and mergeIds required' }, { status: 400 });
  await ensureSchema();
  const sql = getSql();
  const tables = (await sql`SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'advertiser_id' AND table_name <> 'advertisers'`) as unknown as Array<{ table_name: string }>;
  const report: Array<Record<string, unknown>> = [];
  let failed = false;
  for (const mid of mergeIds) {
    for (const { table_name: t } of tables) {
      try {
        const cnt = (await sql.query(`SELECT count(*)::int AS n FROM "${t}" WHERE advertiser_id = $1`, [mid])) as unknown as Array<{ n: number }>;
        const n = cnt[0]?.n ?? 0;
        if (!n) continue;
        if (!b.dryRun) await sql.query(`UPDATE "${t}" SET advertiser_id = $1 WHERE advertiser_id = $2`, [keepId, mid]);
        report.push({ table: t, from: mid, rows: n });
      } catch (e) {
        failed = true;
        report.push({ table: t, from: mid, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  if (b.dryRun) return NextResponse.json({ dryRun: true, report });
  if (failed) return NextResponse.json({ ok: false, report, note: 'Some tables could not be re-pointed; no records were deleted.' }, { status: 409 });
  const keep = ((await sql`SELECT * FROM advertisers WHERE id = ${keepId}`) as unknown as Adv[])[0];
  if (!keep) return NextResponse.json({ error: 'keep record not found' }, { status: 404 });
  for (const mid of mergeIds) {
    const m = ((await sql`SELECT * FROM advertisers WHERE id = ${mid}`) as unknown as Adv[])[0];
    if (!m) continue;
    for (const col of ['contact_email', 'billing_email', 'phone', 'office_phone', 'website', 'address', 'address_2', 'city', 'state', 'zip', 'first_name', 'last_name', 'title', 'license_number', 'billing_contact_name', 'billing_contact_phone', 'stripe_customer_id', 'stripe_payment_method_id', 'payment_method_label', 'payment_mode', 'current_agreement_id']) {
      if ((keep[col] == null || keep[col] === '') && m[col] != null && m[col] !== '') {
        await sql.query(`UPDATE advertisers SET "${col}" = $1 WHERE id = $2`, [m[col], keepId]);
        keep[col] = m[col];
      }
    }
    await sql`DELETE FROM advertisers WHERE id = ${mid}`;
  }
  return NextResponse.json({ ok: true, report });
}
