import { pollIcs } from '@/lib/server/closing-time-polls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Calendar file for a poll's confirmed time. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ics = await pollIcs(token);
  if (!ics) return new Response('Not found', { status: 404 });
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="appointment.ics"', 'Cache-Control': 'private, no-store, max-age=0' } });
}
