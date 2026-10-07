import { getImage } from '@/lib/server/closing-time-schedulers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await ctx.params;
  const img = await getImage(id, kind === 'avatar' ? 'avatar' : 'banner');
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(img.bytes), { headers: { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=300' } });
}
