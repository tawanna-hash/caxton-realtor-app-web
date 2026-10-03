import { getSignPdf } from '@/lib/server/closing-time-esign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const file = await getSignPdf((await ctx.params).token);
  if (!file) return new Response('Not found', { status: 404 });
  const download = new URL(req.url).searchParams.get('download') === '1';
  return new Response(new Uint8Array(file.bytes), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${file.name.replace(/[^\w.\- ]+/g, '_')}"` } });
}
