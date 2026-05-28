/**
 * /api/ready  GET — readiness check.
 *
 * Pings both the Neon pool (primary) and the DO pool (transient, until
 * data migration) so any DB outage shows up here. Returns 503 if either
 * is unreachable.
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db/neon';
import { doQuery } from '@/lib/server/db/do';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const status: {
    neon: 'connected' | 'disconnected';
    do: 'connected' | 'disconnected' | 'not_configured';
    error?: string;
  } = { neon: 'disconnected', do: 'disconnected' };

  try {
    await query('SELECT 1');
    status.neon = 'connected';
  } catch (err) {
    status.error = err instanceof Error ? err.message : 'Neon unreachable';
    return NextResponse.json({ status: 'not_ready', ...status }, { status: 503 });
  }

  if (process.env.DO_DATABASE_URL) {
    try {
      await doQuery('SELECT 1');
      status.do = 'connected';
    } catch (err) {
      status.error = err instanceof Error ? err.message : 'DO unreachable';
      return NextResponse.json({ status: 'not_ready', ...status }, { status: 503 });
    }
  } else {
    status.do = 'not_configured';
  }

  return NextResponse.json({ status: 'ready', ...status });
}
