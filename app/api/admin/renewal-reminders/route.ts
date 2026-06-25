// app/api/admin/renewal-reminders/route.ts
//
// GET  — list renewal reminders (optional ?status=Pending|Completed|Dismissed)
// POST — create manually

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getRenewalReminders, createRenewalReminder } from '@/lib/renewal-reminders';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { parseQuery } from '@/lib/server/schemas/_common';
import {
  renewalReminderCreateSchema,
  renewalReminderListQuerySchema,
} from '@/lib/server/schemas/renewal-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const admin = await getCurrentAdmin();
  if (!admin) throw new ApiError(401, 'Unauthorized');

  await ensureSchema();
  const { status } = parseQuery(req, renewalReminderListQuerySchema);
  const reminders = await getRenewalReminders(status);
  return NextResponse.json({ reminders });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const admin = await getCurrentAdmin();
  if (!admin) throw new ApiError(401, 'Unauthorized');

  const body = renewalReminderCreateSchema.parse(await req.json());

  await ensureSchema();
  const reminder = await createRenewalReminder({
    agreement_id: body.agreement_id,
    company_name: body.company_name ?? null,
    rep_name: body.rep_name ?? null,
    email: body.email ?? null,
    ad_size: body.ad_size ?? null,
    frequency: body.frequency ?? null,
    ad_rate_cents: body.ad_rate_cents ?? null,
    exp_date: body.exp_date ?? null,
    remind_date: body.remind_date ?? null,
    note: body.note ?? null,
    triggered_by: admin.email ?? 'manual',
  });
  if (!reminder) throw new ApiError(500, 'create failed');
  return NextResponse.json({ reminder }, { status: 201 });
});
