/**
 * /api/auth/webauthn/credentials/[id]  DELETE
 *
 * Revokes one of the current user's credentials. We scope the DELETE to the
 * session realtor_id so an attacker who can enumerate /credentials can't
 * delete someone else's passkey.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { requireUser } from '@/lib/server/auth/user';
import { deleteCredential } from '@/lib/server/webauthn-store';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f-]{36}$/;

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const session = await requireUser();
  const { id } = await ctx.params;

  if (!id || !UUID_RE.test(id)) {
    throw new ApiError(400, 'Invalid credential id');
  }

  const rowCount = await deleteCredential(session.realtorId, id);
  if (rowCount === 0) {
    throw new ApiError(404, 'Credential not found');
  }

  logger.info({ realtorId: session.realtorId, credentialId: id }, 'WebAuthn credential revoked');
  return NextResponse.json({ success: true });
});
