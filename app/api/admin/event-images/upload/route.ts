// Bulk upload endpoint for event images.
// Accepts multiple files via FormData, uploads each to Vercel Blob,
// and creates event_photos rows.
//
// Optional FormData fields:
//   files[]    — one or more image files (required)
//   eventDate  — ISO date string (defaults to today)
//   title      — base title; each photo gets "_1", "_2", etc. appended
//               if not provided, the filename (without extension) is used

import { NextResponse, type NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { createEventPhoto } from '@/lib/event-photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: NextRequest) => {
  await requireAdmin();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'Vercel Blob is not configured.' },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const files = form.getAll('files');
  const eventDate = (form.get('eventDate') as string) || new Date().toISOString().slice(0, 10);
  const baseTitle = (form.get('title') as string) || '';

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
      const blobPath = `event-images/${eventDate}/${Date.now()}-${i}-${cleanName}.${ext}`;
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
        thumbnailUrl: null, // Vercel Blob doesn't auto-generate thumbnails
        description: null,
      });

      results.push({ url: blob.url, title, ok: true });
    } catch (err) {
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
