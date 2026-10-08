import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { listSavedContacts } from '@/lib/server/closing-time-automations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  return NextResponse.json({ contacts: await listSavedContacts(user.realtorId) }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
});
