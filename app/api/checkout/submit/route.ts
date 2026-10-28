// Online payments have been removed, so this endpoint no longer accepts orders.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ error: 'Online payments are not available right now.' }, { status: 503 });
}
