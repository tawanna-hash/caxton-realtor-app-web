import { NextResponse } from 'next/server';
import { isClosingTimeGated } from '@/lib/server/closing-time-gate';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ vercelEnv: process.env.VERCEL_ENV ?? null, gated: await isClosingTimeGated() });
}
