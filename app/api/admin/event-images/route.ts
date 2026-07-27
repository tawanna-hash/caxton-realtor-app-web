// Admin API for event photos.
// GET  — list all photos
// POST — add a photo
// DELETE — delete a photo by id

import { NextResponse, type NextRequest } from 'next/server';
import {
  listEventPhotos,
  createEventPhoto,
  deleteEventPhoto,
  deleteEventPhotos,
  deleteEventPhotosByMonth,
  updateEventPhoto,
} from '@/lib/event-photos';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const photos = await listEventPhotos({ limit: 1000 });
  return NextResponse.json({ photos });
});

export const POST = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();

  // PUT-style update if `id` is provided in the body
  if (body.id) {
    const { id, title, eventDate, description, publication } = body;
    const updates: { title?: string; eventDate?: string; description?: string | null; publication?: string } = {};
    if (title !== undefined) updates.title = title;
    if (eventDate !== undefined) {
      // Normalize to YYYY-MM-01
      if (/^\d{4}-\d{2}$/.test(eventDate)) updates.eventDate = eventDate + '-01';
      else if (/^\d{4}-\d{2}-\d{2}/.test(eventDate)) updates.eventDate = eventDate.slice(0, 10);
      else updates.eventDate = eventDate;
    }
    if (description !== undefined) updates.description = description;
    if (publication !== undefined) updates.publication = publication;
    const photo = await updateEventPhoto(id, updates);
    return NextResponse.json({ photo });
  }

  const { title, eventDate, imageUrl, thumbnailUrl, description, publication } = body;

  if (!title || !eventDate || !imageUrl) {
    return NextResponse.json(
      { error: 'title, eventDate, and imageUrl are required' },
      { status: 400 },
    );
  }

  const photo = await createEventPhoto({
    title,
    eventDate,
    imageUrl,
    thumbnailUrl: thumbnailUrl || null,
    description: description || null,
    publication,
  });

  return NextResponse.json({ photo }, { status: 201 });
});

export const DELETE = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();
  const url = new URL(req.url);

  // Bulk delete: DELETE /api/admin/event-images?ids=1,2,3
  const idsParam = url.searchParams.get('ids');
  if (idsParam) {
    const ids = idsParam.split(',').map(Number).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'No valid ids' }, { status: 400 });
    }
    const deleted = await deleteEventPhotos(ids);
    return NextResponse.json({ deleted, total: ids.length });
  }

  // Folder delete: DELETE /api/admin/event-images?month=2026-07
  const monthParam = url.searchParams.get('month');
  if (monthParam) {
    const deleted = await deleteEventPhotosByMonth(monthParam);
    return NextResponse.json({ deleted, month: monthParam });
  }

  // Single delete: DELETE /api/admin/event-images?id=123
  const id = parseInt(url.searchParams.get('id') ?? '', 10);
  if (!id) {
    return NextResponse.json({ error: 'id, ids, or month query param required' }, { status: 400 });
  }
  const ok = await deleteEventPhoto(id);
  return NextResponse.json({ ok, id });
});
