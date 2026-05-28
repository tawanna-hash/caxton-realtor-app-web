// app/api/admin/inventory/upload-token/route.ts
//
// Issues a Vercel Blob upload token for admin file replacement.
// The client uses `@vercel/blob/client` upload() which makes two
// network calls: (1) POSTs here to get a signed token, (2) PUTs the
// file bytes directly to Vercel Blob's edge endpoint. The file never
// passes through this function — keeps us under the 4.5MB serverless
// body limit and avoids the egress cost.
//
// Pathname conventions:
//   inventory-thumbs/{id}/{filename} — images (jpg, png, webp), up to 10MB
//   inventory-flyers/{id}/{filename} — PDF, up to 25MB
// Other pathnames are rejected to prevent admins from writing outside
// the inventory namespace (e.g. overwriting ad media or other features).
//
// After upload completes the client receives a public blob URL. The
// admin UI then PATCHes the row's thumbnail_url or flyer_pdf_url field
// via /api/admin/inventory/[id]. We do not write to the DB from this
// route — the client is the source of truth for which row the upload
// is associated with.
//
// Old blobs (the URLs that the row was pointing to before replacement)
// are not garbage-collected here. They become orphans. Cleanup is
// tracked in FOLLOW_UPS — same bucket as the existing orphan flyer
// PDFs from rejected submissions.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_THUMBNAIL_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_FLYER_TYPES = ['application/pdf'];
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_FLYER_BYTES = 25 * 1024 * 1024; // 25MB

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Auth check — fail-closed before we even parse the body.
  const ok = await isAdmin();
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Validate pathname prefix to keep admins inside the inventory
        // namespace. Reject anything not under inventory-thumbs/ or
        // inventory-flyers/.
        if (pathname.startsWith('inventory-thumbs/')) {
          return {
            allowedContentTypes: ALLOWED_THUMBNAIL_TYPES,
            maximumSizeInBytes: MAX_THUMBNAIL_BYTES,
            addRandomSuffix: true,
          };
        }
        if (pathname.startsWith('inventory-flyers/')) {
          return {
            allowedContentTypes: ALLOWED_FLYER_TYPES,
            maximumSizeInBytes: MAX_FLYER_BYTES,
            addRandomSuffix: true,
          };
        }
        throw new Error(`Invalid upload path prefix: ${pathname}`);
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // The upload is finished. We do NOT update the DB here — the
        // client receives the blob URL from the upload() call and
        // makes a separate PATCH request. This keeps the contract
        // between upload + DB-write explicit on the client side.
        console.log(
          `[admin/inventory/upload-token] blob ready: ${blob.url} (pathname=${blob.pathname}, payload=${tokenPayload ?? 'none'})`,
        );
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admin/inventory/upload-token] error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
