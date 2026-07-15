// app/api/admin/tearsheets/upload/route.ts
//
// POST multipart/form-data {
//   file: File,
//   channel?: AdChannel,
//   advertiser_id?: string (number),
//   io_id?: string,
//   campaign_id?: string,
//   publication?: string,
//   issue_date?: string,
//   issue_label?: string,
// }
//
// Uploads the file to Vercel Blob, then creates a `tearsheets` row with
// file_url + file_type populated (status flips to 'ready' in the store
// when file_url is present).

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema } from '@/lib/db';
import { isAdChannel, type AdChannel } from '@/lib/ad-channels';
import { createTearsheet } from '@/lib/server/tearsheets-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readString(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function readNumber(fd: FormData, key: string): number | null {
  const v = fd.get(key);
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await ensureSchema();

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

  const fileType = (file.type || '').toLowerCase();
  const okType =
    fileType === 'application/pdf' ||
    fileType === 'image/png' ||
    fileType === 'image/jpeg' ||
    fileType === 'image/jpg';
  if (!okType) {
    return NextResponse.json(
      { error: 'unsupported file type', detail: fileType || 'unknown' },
      { status: 400 },
    );
  }

  const channelRaw = readString(formData, 'channel');
  const channel: AdChannel =
    channelRaw && isAdChannel(channelRaw) ? channelRaw : 'digital';

  const advertiser_id = readNumber(formData, 'advertiser_id');
  const io_id = readString(formData, 'io_id');
  const campaign_id = readString(formData, 'campaign_id');
  const publication = readString(formData, 'publication');
  const issue_date = readString(formData, 'issue_date');
  const issue_label = readString(formData, 'issue_label');

  try {
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const blob = await put(
      `tearsheets/${Date.now()}-${safeName}`,
      file,
      { access: 'public', contentType: file.type || undefined },
    );

    const ts = await createTearsheet({
      channel,
      io_id,
      campaign_id,
      advertiser_id,
      publication,
      issue_date,
      issue_label,
      file_url: blob.url,
      file_type: file.type || null,
      created_by: admin.email ?? null,
    });

    return NextResponse.json({ tearsheet: ts }, { status: 201 });
  } catch (err) {
    console.error('[admin/tearsheets/upload POST]', errMessage(err));
    return NextResponse.json(
      { error: 'upload failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
