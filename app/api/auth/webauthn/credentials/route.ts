/**
 * /api/auth/webauthn/credentials  GET
 *
 * Lists the current realtor's registered passkeys for the settings UI.
 * Intentionally omits public_key and credential_id payloads — the UI only
 * needs id, device label, type, and timestamps.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { requireUser } from '@/lib/server/auth/user';
import { listCredentials } from '@/lib/server/webauthn-store';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async () => {
  const session = await requireUser();
  const rows = await listCredentials(session.realtorId);

  return NextResponse.json({
    credentials: rows.map((r) => ({
      id: r.id,
      deviceName: r.device_name,
      authenticatorType: r.authenticator_type,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    })),
  });
});
