import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import importData from '@/data/imports/realtyline-event-images-20260905.json';
import { getSql } from '@/lib/db';
import { createEventPhoto } from '@/lib/event-photos';
import { requireAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ImportPhoto = {
  filename: string;
  sourceUrl: string;
  monthLabel: string;
  monthKey: string;
  categorySource: 'gallery' | 'filename';
};

type ExistingPhoto = {
  title: string;
  image_url: string;
};

const photos = importData as ImportPhoto[];

function normalizedFilename(value: string): string {
  try {
    const pathname = new URL(value).pathname;
    return decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1)).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function stem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function isExisting(candidate: ImportPhoto, existing: ExistingPhoto[]): boolean {
  const filename = candidate.filename.toLowerCase();
  const candidateStem = stem(filename);

  return existing.some((photo) => {
    const existingTitle = photo.title.trim().toLowerCase();
    const existingFilename = normalizedFilename(photo.image_url);
    return (
      existingTitle === candidateStem ||
      existingFilename === filename ||
      existingFilename.endsWith(`-${filename}`)
    );
  });
}

async function listExisting(): Promise<ExistingPhoto[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT title, image_url
      FROM event_photos
     WHERE publication = 'realtyline'
  `;
  return rows as ExistingPhoto[];
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await listExisting();
  const preserved = photos.filter((photo) => isExisting(photo, existing)).length;

  return NextResponse.json({
    total: photos.length,
    preserved,
    remaining: photos.length - preserved,
  });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Vercel Blob is not configured.' }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    index?: number;
    batchSize?: number;
  };
  const index = Math.max(0, Math.floor(Number(body.index) || 0));
  const batchSize = Math.min(8, Math.max(1, Math.floor(Number(body.batchSize) || 5)));
  const batch = photos.slice(index, index + batchSize);

  if (batch.length === 0) {
    return NextResponse.json({
      complete: true,
      index,
      nextIndex: photos.length,
      total: photos.length,
      results: [],
    });
  }

  const existing = await listExisting();
  const results: Array<{
    filename: string;
    monthLabel: string;
    status: 'imported' | 'preserved' | 'failed';
    error?: string;
  }> = [];

  for (const photo of batch) {
    if (isExisting(photo, existing)) {
      results.push({
        filename: photo.filename,
        monthLabel: photo.monthLabel,
        status: 'preserved',
      });
      continue;
    }

    try {
      const response = await fetch(photo.sourceUrl, {
        cache: 'no-store',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; RealtyNewsNowEventImageImporter/1.0; +https://realtynewsnow.app)',
        },
        signal: AbortSignal.timeout(120_000),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !response.body) {
        throw new Error(`source returned ${response.status}`);
      }
      if (contentType && !contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`source returned ${contentType}`);
      }

      const blob = await put(
        `event-images/realtyline-archive/${photo.monthKey}/${photo.filename}`,
        response.body,
        {
          access: 'public',
          addRandomSuffix: true,
          contentType: contentType || 'image/jpeg',
        },
      );

      await createEventPhoto({
        title: stem(photo.filename),
        eventDate: `${photo.monthKey}-01`,
        imageUrl: blob.url,
        thumbnailUrl: null,
        description: null,
        publication: 'realtyline',
        uploadedBy: 'RealtyLine protected archive import',
      });

      existing.push({ title: stem(photo.filename), image_url: blob.url });
      results.push({
        filename: photo.filename,
        monthLabel: photo.monthLabel,
        status: 'imported',
      });
    } catch (error) {
      results.push({
        filename: photo.filename,
        monthLabel: photo.monthLabel,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const nextIndex = index + batch.length;
  return NextResponse.json({
    ok: true,
    index,
    nextIndex,
    total: photos.length,
    complete: nextIndex >= photos.length,
    results,
  });
}
