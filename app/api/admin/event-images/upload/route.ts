// Bulk upload endpoint for event images.
// Accepts multiple files via FormData, uploads each to Vercel Blob,
// and creates event_photos rows.
//
// Optional FormData fields:
//   files[]    — one or more image files (required)
//   eventDate  — YYYY-MM (month input) or ISO date string (defaults to current month)
//   title      — base title; each photo gets "_1", "_2", etc. appended
//               if not provided, the filename (without extension) is used
//   advertiserId — associates the photos with an advertiser so they surface on
//                  that advertiser's public detail page

import { NextResponse, type NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { createEventPhoto, normalizeAdvertiserId } from '@/lib/event-photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'Vercel Blob is not configured.' },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const files = form.getAll('files');
  const rawDate = (form.get('eventDate') as string) || (new Date().toISOString().slice(0, 7) + '-01');
  // Normalize to YYYY-MM-01 for Postgres DATE column
  // Supports: YYYY-MM (month picker), YYYY-MM-DD, or full ISO date
  let eventDate: string;
  if (/^\d{4}-\d{2}$/.test(rawDate)) {
    eventDate = rawDate + '-01';
  } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
    eventDate = rawDate.slice(0, 10);
  } else {
    // Fallback: try to parse month names like "July 2026" → 2026-07-01
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      eventDate = parsed.toISOString().slice(0, 10);
    } else {
      eventDate = new Date().toISOString().slice(0, 10);
    }
  }
  const baseTitle = (form.get('title') as string) || '';
  const publication = (form.get('publication') as string) || 'realtyline';
  const advertiserId = normalizeAdvertiserId(form.get('advertiserId'));

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const validFiles = files.filter((f): f is File => f instanceof File);
  if (validFiles.length === 0) {
    return NextResponse.json({ error: 'No valid files' }, { status: 400 });
  }

  const results: { url: string; title: string; ok: boolean; error?: string }[] = [];

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    const ext = file.name.split('.').pop() || 'jpg';
    const cleanName = file.name.replace(/\.[^.]+$/, '');

    try {
      // Upload to Vercel Blob
      const blobPath = `event-images/${eventDate.slice(0,7)}/${Date.now()}-${i}-${cleanName}.${ext}`;
      const blob = await put(blobPath, file, { access: 'public' });

      // Derive title
      const title = baseTitle
        ? (validFiles.length > 1 ? `${baseTitle} ${i + 1}` : baseTitle)
        : cleanName;

      // Create DB record
      await createEventPhoto({
        title,
        eventDate,
        imageUrl: blob.url,
        thumbnailUrl: null,
        description: null,
        publication,
        advertiserId,
      });

      results.push({ url: blob.url, title, ok: true });
    } catch (err) {
      console.error(`[event-images] Upload failed for ${file.name}:`, err);
      results.push({
        url: '',
        title: cleanName,
        ok: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    uploaded: succeeded,
    failed,
    results,
  });
});
