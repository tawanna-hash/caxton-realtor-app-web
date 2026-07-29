// Admin API for a single advertiser feature article.
// PUT    — update fields
// DELETE — remove the article

import { NextResponse, type NextRequest } from 'next/server';
import {
  updateFeatureArticle,
  deleteFeatureArticle,
  type FeatureArticle,
} from '@/lib/feature-articles';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

async function parseId(ctx: RouteCtx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const PUT = withAdminTracking(async (req: NextRequest, ctx: RouteCtx) => {
  await requireAdmin();
  const id = await parseId(ctx);
  if (id === null) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const body = await req.json();
  const updates: Parameters<typeof updateFeatureArticle>[1] = {};
  if (body.advertiserId !== undefined) {
    const n = Number(body.advertiserId);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: 'invalid advertiserId' }, { status: 400 });
    }
    updates.advertiserId = n;
  }
  if (body.title !== undefined) updates.title = body.title;
  if (body.excerpt !== undefined) updates.excerpt = body.excerpt || null;
  if (body.content !== undefined) updates.content = body.content || null;
  if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl || null;
  if (body.articleUrl !== undefined) updates.articleUrl = body.articleUrl || null;
  if (body.author !== undefined) updates.author = body.author || null;
  if (body.publishedAt !== undefined) updates.publishedAt = body.publishedAt;
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder) || 0;
  if (body.status !== undefined) updates.status = body.status === 'draft' ? 'draft' : 'published';

  const article: FeatureArticle | null = await updateFeatureArticle(id, updates);
  if (!article) {
    return NextResponse.json({ error: 'not found or no fields to update' }, { status: 404 });
  }
  return NextResponse.json({ article });
});

export const DELETE = withAdminTracking(async (_req: NextRequest, ctx: RouteCtx) => {
  await requireAdmin();
  const id = await parseId(ctx);
  if (id === null) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const ok = await deleteFeatureArticle(id);
  return NextResponse.json({ ok, id });
});
