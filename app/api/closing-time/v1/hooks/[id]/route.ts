import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteWebhookById, realtorIdForApiKey } from '@/lib/server/closing-time-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'private, no-store, max-age=0' };

// REST hook unsubscribe.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const realtorId = await realtorIdForApiKey(req.headers.get('authorization'));
  if (!realtorId) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401, headers: H });
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: H });
  const removed = await deleteWebhookById(realtorId, id);
  return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404, headers: H });
}
