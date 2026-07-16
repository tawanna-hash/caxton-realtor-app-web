/**
 * Vercel Blob → Resend attachment helpers.
 *
 * `buildBlobUrlAttachments` validates each Blob URL, HEAD-checks it, and
 * returns { filename, path } so Resend fetches the file server-side — no
 * base64 inflation, no crossing the Vercel 4.5 MB route body limit. It FAILS
 * LOUD (throws AttachmentError) rather than silently dropping files.
 *
 * Guards:
 *   - Only accepts https URLs on *.public.blob.vercel-storage.com (our
 *     tenant). The `.public.` host segment is Vercel's marker for public
 *     blobs, so a URL that passes this check is publicly readable and safe
 *     to hand to Resend as a `path`.
 *   - Rejects anything larger than MAX_BYTES to stay under Resend's ~40 MB
 *     per-email cap.
 */

import { logger } from './logger';

export interface RemoteAttachment {
  url: string;
  filename: string;
  content_type?: string;
}

export interface BlobUrlAttachment {
  filename: string;
  path: string; // public URL handed to Resend verbatim
  contentType?: string;
}

const MAX_BYTES = 40 * 1024 * 1024; // Resend total-email ceiling
const ALLOWED_HOST_SUFFIX = '.public.blob.vercel-storage.com';

/**
 * Thrown when an attachment can't be validated/reached. Carries a
 * caller-safe `detail` string for surfacing in API responses.
 */
export class AttachmentError extends Error {
  constructor(public detail: string) {
    super(detail);
    this.name = 'AttachmentError';
  }
}

/**
 * Build Resend `path`-style attachments from Blob URLs. Pre-flights each URL
 * with a HEAD request (verifying 200 + a sane content-length) and throws
 * AttachmentError on the first problem so the send aborts loudly.
 */
export async function buildBlobUrlAttachments(
  items: RemoteAttachment[] | undefined,
): Promise<BlobUrlAttachment[]> {
  if (!items || items.length === 0) return [];

  const out: BlobUrlAttachment[] = [];
  let totalBytes = 0;

  for (const item of items) {
    let u: URL;
    try {
      u = new URL(item.url);
    } catch {
      logger.error({ filename: item.filename, url: item.url }, 'attachment: invalid URL');
      throw new AttachmentError(`${item.filename}: invalid attachment URL`);
    }
    if (u.protocol !== 'https:' || !u.host.endsWith(ALLOWED_HOST_SUFFIX)) {
      logger.error({ filename: item.filename, url: item.url, host: u.host }, 'attachment: host not allowed');
      throw new AttachmentError(`${item.filename}: attachment host not allowed`);
    }

    let head: Response;
    try {
      head = await fetch(item.url, { method: 'HEAD' });
    } catch (err) {
      logger.error({ filename: item.filename, url: item.url, err }, 'attachment: HEAD request failed');
      throw new AttachmentError(`${item.filename}: could not reach attachment (${err instanceof Error ? err.message : 'network error'})`);
    }
    if (!head.ok) {
      logger.error({ filename: item.filename, url: item.url, status: head.status }, 'attachment: HEAD non-200');
      throw new AttachmentError(`${item.filename}: attachment not reachable (HTTP ${head.status})`);
    }

    const len = Number(head.headers.get('content-length') ?? '0');
    if (!Number.isFinite(len) || len <= 0) {
      logger.error({ filename: item.filename, url: item.url, contentLength: head.headers.get('content-length') }, 'attachment: missing/zero content-length');
      throw new AttachmentError(`${item.filename}: attachment has no content-length (empty or inaccessible)`);
    }
    totalBytes += len;
    if (totalBytes > MAX_BYTES) {
      logger.error({ filename: item.filename, url: item.url, size: len, totalBytes }, 'attachment: exceeds 40MB cap');
      throw new AttachmentError(`${item.filename}: attachments exceed the 40MB total cap`);
    }

    logger.info({ filename: item.filename, url: item.url, size: len }, 'attachment: passthrough OK');
    out.push({
      filename: item.filename,
      path: item.url,
      contentType: item.content_type || head.headers.get('content-type') || undefined,
    });
  }

  return out;
}
