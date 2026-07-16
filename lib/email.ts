// lib/email.ts
//
// Lightweight Resend SDK wrapper for direct API calls.
// Uses process.env.RESEND_API_KEY.

/**
 * Resend supports per-message attachments two ways:
 *   - `path`: a publicly-reachable URL. Resend fetches the file server-side.
 *     Preferred for large files (e.g. the media kit PDF) because it avoids
 *     base64 inflation (~33%) and never crosses the Vercel 4.5 MB route body
 *     limit.
 *   - `content`: base64-encoded file bytes. Legacy path, kept for outreach
 *     rows that stored inline base64 before the URL-passthrough switch.
 * Exactly one of `path` / `content` must be set. `filename` becomes the
 * visible name in the recipient's client. `contentType` is recommended but
 * optional — Resend will sniff if omitted.
 * See https://resend.com/docs/api-reference/emails/send-email
 */
export interface EmailAttachment {
  filename: string;
  content?: string; // base64 (legacy)
  path?: string;    // public URL — Resend fetches it (preferred)
  contentType?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  replyTo?: string | string[];
  cc?: string | string[];
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

import { captureServerEvent } from '@/lib/server/posthog';

// myrealtyline.com is verified in Resend. realtynewsnow.app is not (yet).
// hello@ is the role mailbox that forwards to a monitored inbox; noreply@
// was a dead address that silently dropped sends. Override with EMAIL_FROM.
const FROM_DEFAULT = process.env.EMAIL_FROM ?? 'RealtyLine <hello@myrealtyline.com>';

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const payload: Record<string, unknown> = {
    from: opts.from ?? FROM_DEFAULT,
    to: recipients,
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.replyTo) payload.reply_to = opts.replyTo;
  if (opts.cc) payload.cc = Array.isArray(opts.cc) ? opts.cc : [opts.cc];
  if (opts.attachments && opts.attachments.length > 0) {
    // Resend accepts either { filename, path } (URL it fetches server-side)
    // or { filename, content } (base64). Prefer path when present so large
    // files skip base64 inflation and the Vercel route body limit.
    payload.attachments = opts.attachments.map((a) => ({
      filename: a.filename,
      ...(a.path ? { path: a.path } : { content: a.content }),
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await res.text();
    if (!res.ok) {
      const error = `Resend ${res.status}: ${body}`;
      captureServerEvent('dispatch_failed', 'server', {
        subject: opts.subject,
        recipient_count: recipients.length,
        status: res.status,
        error,
      });
      return { ok: false, error };
    }

    let data: { id?: string } = {};
    try { data = JSON.parse(body) as { id?: string }; } catch { /* ignore */ }

    captureServerEvent('email_sent', 'server', {
      subject: opts.subject,
      recipient_count: recipients.length,
      message_id: data.id ?? null,
      has_attachments: !!(opts.attachments && opts.attachments.length > 0),
    });
    return { ok: true, messageId: data.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'fetch error';
    captureServerEvent('dispatch_failed', 'server', {
      subject: opts.subject,
      recipient_count: recipients.length,
      error,
    });
    return { ok: false, error };
  }
}
