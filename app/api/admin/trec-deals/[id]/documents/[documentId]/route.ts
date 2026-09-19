import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { deleteTrecDealDocument, updateTrecDealDocument } from '@/lib/server/trec-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string; documentId: string }> };

const documentSchema = z.object({
  status: z.enum(['requested', 'received', 'verified', 'not_applicable']).optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

async function ids(ctx: RouteCtx) {
  const value = await ctx.params;
  return UUID_RE.test(value.id) && UUID_RE.test(value.documentId) ? value : null;
}

export const PATCH = withAdminTracking(async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const value = await ids(ctx);
  if (!value) return NextResponse.json({ error: 'Invalid document id.' }, { status: 400 });
  const parsed = documentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid document update.' }, { status: 400 });
  try {
    const document = await updateTrecDealDocument(value.id, value.documentId, { ...parsed.data, actor: admin.email });
    return document ? NextResponse.json({ document }) : NextResponse.json({ error: 'Document request not found.' }, { status: 404 });
  } catch (error) {
    console.error('[trec-document PATCH]', error);
    return NextResponse.json({ error: 'Could not update this document request.' }, { status: 500 });
  }
});

export const DELETE = withAdminTracking(async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const value = await ids(ctx);
  if (!value) return NextResponse.json({ error: 'Invalid document id.' }, { status: 400 });
  try {
    const deleted = await deleteTrecDealDocument(value.id, value.documentId, admin.email);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Document request not found.' }, { status: 404 });
  } catch (error) {
    console.error('[trec-document DELETE]', error);
    return NextResponse.json({ error: 'Could not delete this document request.' }, { status: 500 });
  }
});
