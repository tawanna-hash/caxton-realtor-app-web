// app/api/admin/push/apns-status/route.ts
//
// Admin diagnostic: surface whether the APNS_* env vars are set and the
// ApnsClient constructed cleanly. Lets the admin UI render a clear
// "Native iOS push not configured" banner with actionable details
// instead of just showing failed sends in the push-test results.
//
// GET /api/admin/push/apns-status
// Returns: { configured, reason, hasKeyId, hasTeamId, hasBundleId, hasKey,
//            nativeTokenCount }

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';
import { getApnsConfigStatus } from '@/lib/server/native-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureSchema();

  const status = getApnsConfigStatus();

  // Useful context for the admin: how many active iOS tokens are sitting
  // in the table waiting to receive pushes (zero is also a signal — no
  // device has opted in yet, so configuring APNs is premature).
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
      FROM native_push_tokens
     WHERE revoked_at IS NULL
       AND platform = 'ios'
  `) as unknown as Array<{ count: number }>;
  const nativeTokenCount = rows[0]?.count ?? 0;

  return NextResponse.json({
    ...status,
    nativeTokenCount,
  });
});
