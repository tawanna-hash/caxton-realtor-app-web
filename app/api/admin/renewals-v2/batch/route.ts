// app/api/admin/renewals-v2/batch/route.ts
//
// Renewals (Beta). POST { ids: string[], send?: boolean, rate_lock?: boolean }
//   Without send:true this is a dry run that reports who would receive an
//   email and who would be skipped (no address). Nothing is created or sent.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureRenewalDraft, listCandidates, sendRenewalEmail } from '@/lib/renewals-v2/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'ids required' }, { status: 400 });
  if (ids.length > 50) return NextResponse.json({ error: 'max 50 per batch' }, { status: 400 });
  const send = body.send === true;

  try {
    await ensureSchema();
    const sql = getSql();
    const candidates = await listCandidates(sql, 365);
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const results: Array<{ id: string; company: string | null; status: string; to?: string | null; error?: string }> = [];
    for (const id of ids) {
      const c = byId.get(id);
      if (!c) { results.push({ id, company: null, status: 'skipped', error: 'not eligible' }); continue; }
      if (!c.email) { results.push({ id, company: c.company_name, status: 'skipped', error: 'no email address' }); continue; }
      if (!send) { results.push({ id, company: c.company_name, status: 'would_send', to: c.email }); continue; }
      try {
        const { renewalId } = await ensureRenewalDraft(sql, id, admin.email ?? null);
        const r = await sendRenewalEmail(sql, renewalId, {
          adminEmail: admin.email ?? null,
          rateLock: body.rate_lock !== false,
        });
        results.push(r.ok
          ? { id, company: c.company_name, status: 'sent', to: r.to }
          : { id, company: c.company_name, status: 'failed', error: r.error });
      } catch (e) {
        results.push({ id, company: c.company_name, status: 'failed', error: e instanceof Error ? e.message : 'error' });
      }
    }
    return NextResponse.json({ ok: true, dry_run: !send, results });
  } catch (err) {
    return NextResponse.json(
      { error: 'batch failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
});
