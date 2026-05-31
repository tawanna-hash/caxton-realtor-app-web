// app/api/admin/renewal-reminders/route.ts
//
// GET  — list renewal reminders (optional ?status=Pending|Completed|Dismissed)
// POST — create manually

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getRenewalReminders, createRenewalReminder } from '@/lib/renewal-reminders';
import type { RenewalReminderStatus } from '@/lib/types/renewal-reminder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<RenewalReminderStatus>(['Pending', 'Completed', 'Dismissed']);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status');
    const statusFilter =
      rawStatus && VALID_STATUSES.has(rawStatus as RenewalReminderStatus)
        ? (rawStatus as RenewalReminderStatus)
        : undefined;

    const reminders = await getRenewalReminders(statusFilter);
    return NextResponse.json({ reminders });
  } catch (err) {
    console.error('[admin/renewal-reminders GET]', errMessage(err));
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const agreementId = typeof body.agreement_id === 'string' ? body.agreement_id : null;
  if (!agreementId) {
    return NextResponse.json({ error: 'agreement_id required' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const reminder = await createRenewalReminder({
      agreement_id:  agreementId,
      company_name:  (body.company_name  as string | undefined) ?? null,
      rep_name:      (body.rep_name      as string | undefined) ?? null,
      email:         (body.email         as string | undefined) ?? null,
      ad_size:       (body.ad_size       as string | undefined) ?? null,
      frequency:     (body.frequency     as string | undefined) ?? null,
      ad_rate_cents: typeof body.ad_rate_cents === 'number' ? body.ad_rate_cents : null,
      exp_date:      (body.exp_date      as string | undefined) ?? null,
      remind_date:   (body.remind_date   as string | undefined) ?? null,
      note:          (body.note          as string | undefined) ?? null,
      triggered_by:  admin.email ?? 'manual',
    });
    if (!reminder) throw new Error('insert returned null');
    return NextResponse.json({ reminder }, { status: 201 });
  } catch (err) {
    console.error('[admin/renewal-reminders POST]', errMessage(err));
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
}
