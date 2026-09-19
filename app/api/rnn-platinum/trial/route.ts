import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { getPlatinumAccess, startPlatinumTrial } from '@/lib/server/platinum-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await requireUser();
  const current = await getPlatinumAccess(user.realtorId);
  if (current.active) return NextResponse.json({ access: current, started: false });

  const result = await startPlatinumTrial(user.realtorId);
  if (!result.started) {
    return NextResponse.json(
      { error: 'Your complimentary trial has already been used.', access: result.access },
      { status: 409 },
    );
  }
  return NextResponse.json(result, { status: 201 });
}
