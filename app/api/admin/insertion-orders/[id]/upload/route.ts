// app/api/admin/insertion-orders/[id]/upload/route.ts
//
// POST multipart/form-data { file: File }
//
// Uploads an advertiser/agency-provided IO PDF to Vercel Blob and stores
// the resulting public URL on the insertion_orders.pdf_url column.
// The /pdf endpoint prefers this URL over the generated renderer.
//
// Auth: admin required.

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema } from '@/lib/db';
import {
  getInsertionOrder,
  setInsertionOrderPdfUrl,
} from '@/lib/server/insertion-orders-store';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await ensureSchema();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const io = await getInsertionOrder(id);
  if (!io) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }

  // Basic type gate — accept PDF or common image types.
  const type = (file.type || '').toLowerCase();
  const okType =
    type === 'application/pdf' ||
    type === 'image/png' ||
    type === 'image/jpeg' ||
    type === 'image/jpg';
  if (!okType) {
    return NextResponse.json(
      { error: 'unsupported file type', detail: type || 'unknown' },
      { status: 400 },
    );
  }

  try {
    // Predictable path scheme so old uploads are visible in the Blob UI.
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const blob = await put(
      `insertion-orders/${io.io_number}/${Date.now()}-${safeName}`,
      file,
      { access: 'public', contentType: file.type || undefined },
    );

    const updated = await setInsertionOrderPdfUrl(id, blob.url);
    if (!updated) {
      return NextResponse.json({ error: 'update failed' }, { status: 500 });
    }

    return NextResponse.json({ io: updated, pdf_url: blob.url }, { status: 200 });
  } catch (err) {
    console.error('[admin/insertion-orders/upload POST]', errMessage(err));
    return NextResponse.json(
      { error: 'upload failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});

/**
 * DELETE — clear the uploaded PDF and fall back to the generated renderer.
 * Body: none. Optional if you want a "remove" affordance in the drawer.
 */
export const DELETE = withAdminTracking(async function DELETE(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await ensureSchema();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const updated = await setInsertionOrderPdfUrl(id, null);
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ io: updated });
});
