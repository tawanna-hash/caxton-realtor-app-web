import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { getUpload } from '@/lib/server/closing-time-assist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const file = await getUpload(user.realtorId, id);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
