/**
 * /api/health  GET — liveness check.
 *
 * Returns 200 as long as the Node runtime is up. Does NOT touch the database
 * (that's /api/ready). Vercel's own platform-level probes handle process-
 * liveness; this endpoint exists so we can curl from anywhere.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
