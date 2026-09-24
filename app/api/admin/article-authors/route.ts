import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { createArticleAuthor, listArticleAuthors, updateArticleAuthorPhoto } from '@/lib/server/article-authors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  return NextResponse.json({ authors: await listArticleAuthors() });
});

export const POST = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const avatar = typeof body.avatar === 'string' && body.avatar.trim() ? body.avatar.trim() : null;
  if (!name || name.length > 180) {
    return NextResponse.json({ error: 'Enter an author name (up to 180 characters)' }, { status: 400 });
  }
  if (avatar && (!/^https?:\/\//i.test(avatar) || avatar.length > 2000)) {
    return NextResponse.json({ error: 'Author photo must be a valid HTTP URL' }, { status: 400 });
  }
  const existing = await listArticleAuthors();
  if (existing.some((author) => author.name.trim().toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: 'This author already exists. Select them from the list.' }, { status: 409 });
  }
  const author = await createArticleAuthor(name, avatar);
  if (!author) {
    return NextResponse.json({ error: 'This author already exists. Select them from the list.' }, { status: 409 });
  }
  return NextResponse.json({ author }, { status: 201 });
});

export const PATCH = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const avatar = typeof body.avatar === 'string' && body.avatar.trim() ? body.avatar.trim() : null;
  if (!name || name.length > 180 || !avatar || !/^https?:\/\//i.test(avatar) || avatar.length > 2000) {
    return NextResponse.json({ error: 'Select an author and provide a valid photo URL' }, { status: 400 });
  }
  const existing = await listArticleAuthors();
  if (!existing.some((author) => author.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: 'Select an existing author' }, { status: 404 });
  }
  return NextResponse.json({ author: await updateArticleAuthorPhoto(name, avatar) });
});
