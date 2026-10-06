import { NextResponse } from 'next/server';
import { getPortalView } from '@/lib/server/closing-time-assist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The same client-safe data the portal page shows, used for the agent's preview panel. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const view = await getPortalView(token);
  if (!view) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(view, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
