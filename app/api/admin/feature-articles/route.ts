// Admin API for advertiser feature articles.
// GET  — list articles, optionally filtered by ?advertiserId=
// POST — create an article

import { NextResponse, type NextRequest } from 'next/server';
import { listFeatureArticles, createFeatureArticle } from '@/lib/feature-articles';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();
  const raw = new URL(req.url).searchParams.get('advertiserId');
  const parsed = raw ? Number(raw) : NaN;
  const advertiserId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const articles = await listFeatureArticles({ advertiserId, limit: 1000 });
  return NextResponse.json({ articles });
});

export const POST = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const {
    advertiserId, title, excerpt, content, imageUrl, articleUrl,
    author, publishedAt, sortOrder, status,
  } = body;

  const advertiserIdNum = Number(advertiserId);
  if (!Number.isInteger(advertiserIdNum) || advertiserIdNum < 1) {
    return NextResponse.json({ error: 'advertiserId is required' }, { status: 400 });
  }
  if (!title || !publishedAt) {
    return NextResponse.json(
      { error: 'title and publishedAt are required' },
      { status: 400 },
    );
  }

  const article = await createFeatureArticle({
    advertiserId: advertiserIdNum,
    title,
    excerpt: excerpt || null,
    content: content || null,
    imageUrl: imageUrl || null,
    articleUrl: articleUrl || null,
    author: author || null,
    publishedAt,
    sortOrder: Number(sortOrder) || 0,
    status: status === 'draft' ? 'draft' : 'published',
  });

  return NextResponse.json({ article }, { status: 201 });
});
