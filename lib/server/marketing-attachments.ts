// lib/server/marketing-attachments.ts
//
// Shared attachment resolver for the marketing/CRM email pipeline.
//
// Given the attachment metadata persisted on an outreach row (each a
// Vercel Blob URL + filename), this produces BOTH:
//   1) inline body links  (AttachmentLink[])   — always rendered when the
//      Blob is reachable, so advertisers get a clickable download link.
//   2) real Resend attachments (EmailAttachment[]) using `path` URL
//      passthrough (NO base64) — Resend fetches the file server-side.
//
// It fails LOUD: every skip/failure is logged with full context
// (filename, url, size, error) and surfaced via `failures` so callers can
// decide whether to 502 or record the error on the outreach row.

import { logger } from '@/lib/server/logger';
import type { AttachmentLink } from '@/lib/marketing-email';
import type { EmailAttachment } from '@/lib/email';

// Resend's hard per-email ceiling. Files above this are LINKED inline but
// NOT attached as a real file.
export const RESEND_MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;

export interface StoredAttachment {
  filename: string;
  url: string;
  content_type?: string;
  size?: number;
}

export interface AttachmentFailure {
  filename: string;
  url: string;
  size: number | null;
  error: string;
}

export interface ResolvedAttachments {
  // How many attachments the composer specified (before resolution).
  attempted: number;
  // Inline links to render in the body — one per reachable Blob.
  links: AttachmentLink[];
  // Real Resend attachments via URL passthrough (reachable AND <= 40 MB).
  resendAttachments: EmailAttachment[];
  // Attachments that could not be reached at all (HEAD failed / invalid URL).
  failures: AttachmentFailure[];
}

function toRef(a: unknown): StoredAttachment | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const filename = typeof o.filename === 'string' ? o.filename : null;
  const url = typeof o.url === 'string' ? o.url : null;
  if (!filename || !url) return null;
  return {
    filename,
    url,
    content_type: typeof o.content_type === 'string' ? o.content_type : undefined,
    size: typeof o.size === 'number' ? o.size : undefined,
  };
}

// Pre-flight a single Blob URL with a HEAD request. Returns the byte size
// (from Content-Length, or the persisted size as a fallback) when reachable,
// or an error string when not.
async function headCheck(a: StoredAttachment): Promise<{ ok: true; size: number | null } | { ok: false; error: string }> {
  let u: URL;
  try {
    u = new URL(a.url);
  } catch {
    return { ok: false, error: 'invalid URL' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, error: 'non-https URL' };
  }
  try {
    const res = await fetch(a.url, { method: 'HEAD' });
    if (!res.ok) {
      return { ok: false, error: `HEAD ${res.status}` };
    }
    const cl = res.headers.get('content-length');
    const size = cl != null && cl !== '' ? Number(cl) : (a.size ?? null);
    return { ok: true, size: Number.isFinite(size as number) ? (size as number) : null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'HEAD request failed' };
  }
}

// Resolve persisted attachment metadata into inline links + Resend
// passthrough attachments. `refs` is the raw jsonb value from the outreach
// row (or the composer payload) — anything non-conforming is dropped as a
// failure so nothing fails silently.
export async function resolveAttachmentsForSend(refs: unknown): Promise<ResolvedAttachments> {
  const list = Array.isArray(refs) ? refs.map(toRef).filter((r): r is StoredAttachment => r !== null) : [];
  const result: ResolvedAttachments = {
    attempted: Array.isArray(refs) ? refs.length : 0,
    links: [],
    resendAttachments: [],
    failures: [],
  };

  for (const a of list) {
    const head = await headCheck(a);
    if (!head.ok) {
      logger.warn(
        { filename: a.filename, url: a.url, size: a.size ?? null, error: head.error },
        '[marketing-attachments] attachment unreachable — skipping link + attachment',
      );
      result.failures.push({ filename: a.filename, url: a.url, size: a.size ?? null, error: head.error });
      continue;
    }

    // Reachable → always render an inline link.
    result.links.push({ filename: a.filename, url: a.url });

    // Over Resend's ceiling → keep the link, skip the real attachment.
    if (head.size != null && head.size > RESEND_MAX_ATTACHMENT_BYTES) {
      logger.warn(
        { filename: a.filename, url: a.url, size: head.size, cap: RESEND_MAX_ATTACHMENT_BYTES },
        '[marketing-attachments] file exceeds 40MB Resend cap — linking inline only',
      );
      continue;
    }

    result.resendAttachments.push({ filename: a.filename, path: a.url, contentType: a.content_type });
  }

  return result;
}

// True when the composer specified attachments but NONE resolved to either
// an inline link or a real Resend attachment. Callers use this to fail loud
// (HTTP 502) instead of sending a broken email silently.
export function allAttachmentsFailed(resolved: ResolvedAttachments): boolean {
  return resolved.attempted > 0 && resolved.links.length === 0 && resolved.resendAttachments.length === 0;
}

// Human-readable summary of the failures, for 502 detail / row error text.
export function summarizeAttachmentFailures(resolved: ResolvedAttachments): string {
  if (resolved.failures.length === 0) return 'no attachments could be delivered';
  return resolved.failures.map((f) => `${f.filename}: ${f.error}`).join('; ');
}
