import { NextResponse } from 'next/server';
import { z } from 'zod';
import { WEBHOOK_EVENTS, createWebhook, realtorIdForApiKey } from '@/lib/server/closing-time-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'private, no-store, max-age=0' };

const schema = z.object({ target_url: z.string().trim().max(500), event: z.enum(WEBHOOK_EVENTS) });

// REST hook subscribe. Body: { "target_url": "https://...", "event": "deal.created" }
// Messages sent to a subscription are the deal object itself, the same shape the deals list returns.
export async function POST(req: Request): Promise<Response> {
  const realtorId = await realtorIdForApiKey(req.headers.get('authorization'));
  if (!realtorId) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401, headers: H });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Send target_url and a valid event' }, { status: 400, headers: H });
  try {
    const { summary } = await createWebhook(realtorId, parsed.data.target_url, [parsed.data.event], true);
    return NextResponse.json({ id: summary.id, event: parsed.data.event }, { status: 201, headers: H });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not subscribe' }, { status: 400, headers: H });
  }
}
