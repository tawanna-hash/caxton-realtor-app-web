/**
 * /api/ready  GET — readiness check.
 *
 * Pings the Neon pool. Returns 503 if unreachable.
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await query('SELECT 1');
    return NextResponse.json({ status: 'ready', neon: 'connected' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Neon unreachable';
    return NextResponse.json(
      { status: 'not_ready', neon: 'disconnected', error: message },
      { status: 503 },
    );
  }
}
