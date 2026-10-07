import { bookingIcs } from '@/lib/server/closing-time-schedulers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ics = await bookingIcs(token);
  if (!ics) return new Response('Not found', { status: 404 });
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="booking.ics"', 'Cache-Control': 'private, no-store, max-age=0' } });
}
