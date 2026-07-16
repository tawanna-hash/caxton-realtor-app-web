// lib/marketing-email.ts
//
// Email rendering + send pipeline for marketing campaign outreach.
// Token substitution, CAN-SPAM footer, open/click tracking wrappers,
// and per-recipient send orchestration.

import crypto from 'node:crypto';
import { sendEmail, type EmailAttachment } from './email';
import type { MarketingCampaignOutreachRecipient } from './marketing-campaigns';

// ── Attachment inline-link descriptor ──────────────────────────────
// A file uploaded to Vercel Blob that we surface as a clickable link in
// the email body (separate from the real Resend attachment, which is an
// EmailAttachment). `url` is the public Blob URL; `filename` the label.
export interface AttachmentLink {
  filename: string;
  url: string;
}

// ── Public site base for tracking + unsubscribe links ──────────────
// Falls back to the realtynewsnow.app domain (Cloudflare blocks the .com).
export function getPublicBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_BASE_URL ||
    'https://realtynewsnow.app'
  ).replace(/\/$/, '');
}

// ── Token substitution ─────────────────────────────────────────────
// Supports {{first_name}}, {{last_name}}, {{full_name}}, {{company}},
// {{email}}, {{unsubscribe_url}}, {{rep_name}}.
export interface TokenContext {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  company?: string | null;
  email?: string | null;
  unsubscribe_url?: string | null;
  rep_name?: string | null;
  [key: string]: string | null | undefined;
}

export function substituteTokens(input: string, ctx: TokenContext): string {
  // Replace {{token}} and {{ token }} with the value, falling back to a
  // friendly default ("there" for first_name) when the field is empty.
  return input.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    const k = key.toLowerCase();
    const v = ctx[k];
    if (v != null && String(v).trim() !== '') return String(v);
    // Sensible fallbacks per token.
    if (k === 'first_name') return 'there';
    if (k === 'full_name')  return 'there';
    if (k === 'company')    return '';
    return '';
  });
}

// ── Body normalization (markdown-ish + HTML → email-ready HTML) ────
// Two paths:
//   1) Plain text (no tags): convert blank-line-separated paragraphs +
//      single line breaks into styled <p>/<br>.
//   2) Rich-text-editor HTML: rewrite block elements with inline styles
//      so they render correctly in every major email client (Gmail strips
//      <style> tags). We also defang dangerous tags/attributes.
export function bodyToHtml(body: string): string {
  if (/<[a-z][^>]*>/i.test(body)) return inlineStyleHtml(sanitizeHtml(body));
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped.split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px 0; line-height:1.55; color:#1f2937;">${p.replace(/\n/g, '<br>')}</p>`,
  );
  return paragraphs.join('\n');
}

// ── HTML sanitizer (server-side) ───────────────────────────────────
// Removes scripts, iframes, on* handlers, and javascript: URLs. We keep
// it permissive on tags (paragraphs / headings / lists / links etc.)
// because the source is our own contentEditable editor, not user-generated
// open input. This is defense in depth, not the primary trust boundary.
export function sanitizeHtml(html: string): string {
  return html
    // Drop full <script>, <style>, <iframe>, <object>, <embed> blocks.
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
    // Strip inline event handlers (onclick=, onerror=, etc.).
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Block javascript: / data: URLs in href/src.
    .replace(/(href|src)\s*=\s*("|')\s*(javascript:|data:(?!image\/))[^"']*\2/gi, '$1=$2#$2');
}

// ── Inline-style rewriter ──────────────────────────────────────────
// Email clients (especially Gmail) strip <style> tags. We post-process
// rich-text HTML to attach inline styles to common block elements.
export function inlineStyleHtml(html: string): string {
  const REPLACEMENTS: Array<[RegExp, string]> = [
    // Paragraphs.
    [/<p(\s[^>]*)?>/gi, '<p$1 style="margin:0 0 14px 0;line-height:1.55;color:#1f2937;">'],
    // Headings.
    [/<h2(\s[^>]*)?>/gi, '<h2$1 style="font-family:Georgia,serif;font-size:22px;font-weight:600;line-height:1.3;margin:18px 0 10px;color:#111827;">'],
    [/<h3(\s[^>]*)?>/gi, '<h3$1 style="font-family:Georgia,serif;font-size:18px;font-weight:600;line-height:1.3;margin:16px 0 8px;color:#111827;">'],
    [/<h1(\s[^>]*)?>/gi, '<h1$1 style="font-family:Georgia,serif;font-size:26px;font-weight:600;line-height:1.25;margin:18px 0 10px;color:#111827;">'],
    // Lists.
    [/<ul(\s[^>]*)?>/gi, '<ul$1 style="margin:8px 0 14px 20px;padding:0;list-style:disc;color:#1f2937;">'],
    [/<ol(\s[^>]*)?>/gi, '<ol$1 style="margin:8px 0 14px 20px;padding:0;list-style:decimal;color:#1f2937;">'],
    [/<li(\s[^>]*)?>/gi, '<li$1 style="margin:4px 0;line-height:1.5;">'],
    // Links.
    [/<a(\s[^>]*?)>/gi, '<a$1 style="color:#301D5D;text-decoration:underline;">'],
    // Blockquote.
    [/<blockquote(\s[^>]*)?>/gi, '<blockquote$1 style="margin:8px 0 14px;padding:8px 14px;border-left:3px solid #301D5D;background:#fafafa;color:#4b5563;font-style:italic;">'],
    // Horizontal rule.
    [/<hr(\s[^>]*)?\/?\s*>/gi, '<hr style="border:0;border-top:1px solid #e5e7eb;margin:18px 0;" />'],
    // Emphasis.
    [/<strong(\s[^>]*)?>/gi, '<strong$1 style="font-weight:600;">'],
    [/<b(\s[^>]*)?>/gi, '<b$1 style="font-weight:600;">'],
    [/<em(\s[^>]*)?>/gi, '<em$1 style="font-style:italic;">'],
    [/<i(\s[^>]*)?>/gi, '<i$1 style="font-style:italic;">'],
  ];
  let out = html;
  for (const [re, sub] of REPLACEMENTS) out = out.replace(re, sub);
  return out;
}

// ── Wrap the body in a branded outer HTML email ────────────────────
export interface RenderOptions {
  subject: string;
  previewText?: string | null;
  bodyHtml: string;
  unsubscribeUrl: string;
  trackingPixelUrl?: string | null;
  brand?: 'realtyline' | 'newsline' | 'caxton';
  attachments?: AttachmentLink[];
}

// ── Attachments section (inline Blob links) ────────────────────────
// Renders a small "Attachments" heading + bulleted list of links near the
// bottom of the email. Inline styles per template convention. Returns ''
// when there are no attachments so the block collapses cleanly.
export function renderAttachmentsSection(links: AttachmentLink[] | undefined): string {
  if (!links || links.length === 0) return '';
  const items = links
    .map(
      (l) =>
        `<li style="margin:4px 0;line-height:1.5;"><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" style="color:#301D5D;text-decoration:underline;word-break:break-all;">${escapeHtml(l.filename)}</a></li>`,
    )
    .join('\n');
  return `<div style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid #e5e7eb;">
  <div style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">Attachments</div>
  <ul style="margin:0 0 0 20px;padding:0;list-style:disc;color:#1f2937;">
${items}
  </ul>
</div>`;
}

export function renderEmail(opts: RenderOptions): string {
  const brand = opts.brand ?? 'realtyline';
  const accent = brand === 'newsline' ? '#0e7490' : '#301D5D';
  const wordmark = brand === 'newsline' ? 'Newsline' : brand === 'caxton' ? 'Caxton' : 'RealtyLine';
  const tagline = brand === 'newsline'
    ? 'San Antonio real estate news'
    : brand === 'caxton'
      ? 'Caxton Publications'
      : 'Advertise Where REALTORS® Flip The Pages';

  const pixel = opts.trackingPixelUrl
    ? `<img src="${opts.trackingPixelUrl}" alt="" width="1" height="1" style="display:block;border:0;outline:none;text-decoration:none;" />`
    : '';

  const preheader = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#fff;">${escapeHtml(opts.previewText)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td style="background:${accent};padding:20px 28px;color:#fff;">
        <div style="font-family:Georgia,serif;font-size:20px;font-weight:600;letter-spacing:0.5px;">${wordmark}</div>
        <div style="font-size:12px;opacity:0.85;margin-top:2px;">${tagline}</div>
      </td></tr>
      <tr><td style="padding:28px;">
        ${opts.bodyHtml}
        ${renderAttachmentsSection(opts.attachments)}
      </td></tr>
      <tr><td style="padding:16px 28px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.6;">
        <div>You're receiving this email because you're connected with ${wordmark}.</div>
        <div style="margin-top:6px;">
          <a href="${opts.unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
          &nbsp;·&nbsp; Caxton Publications, Austin, TX, USA
        </div>
        ${pixel}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Rewrite anchor tags to go through the click-tracking endpoint ──
export function rewriteLinks(html: string, recipientId: string): string {
  const base = getPublicBase();
  return html.replace(/<a\s+([^>]*?)href=("|')([^"']+)(\2)([^>]*)>/gi, (full, pre: string, q: string, href: string, _q2: string, post: string) => {
    // Skip mailto/tel/anchor links and our own unsubscribe links.
    if (/^(mailto:|tel:|#)/i.test(href)) return full;
    if (href.includes('/api/track/click/')) return full;
    if (href.includes('/unsubscribe/')) return full;
    const tracked = `${base}/api/track/click/${recipientId}?u=${encodeURIComponent(href)}`;
    return `<a ${pre}href=${q}${tracked}${q}${post}>`;
  });
}

// ── Token generation ───────────────────────────────────────────────
export function makeUnsubToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

// ── Build the per-recipient HTML for a single send ─────────────────
export interface BuildEmailInput {
  subject: string;
  body: string;             // raw body w/ tokens
  previewText?: string | null;
  recipient: Pick<MarketingCampaignOutreachRecipient, 'id' | 'email' | 'first_name' | 'last_name' | 'company' | 'unsub_token'>;
  repName?: string | null;
  brand?: 'realtyline' | 'newsline' | 'caxton';
  attachmentLinks?: AttachmentLink[];
}

export interface BuiltEmail {
  subject: string;
  html: string;
}

export function buildEmail(input: BuildEmailInput): BuiltEmail {
  const base = getPublicBase();
  const unsubscribeUrl = input.recipient.unsub_token
    ? `${base}/unsubscribe/${input.recipient.unsub_token}`
    : `${base}/unsubscribe`;
  const ctx: TokenContext = {
    first_name: input.recipient.first_name,
    last_name:  input.recipient.last_name,
    full_name:  [input.recipient.first_name, input.recipient.last_name].filter(Boolean).join(' ') || null,
    company:    input.recipient.company,
    email:      input.recipient.email,
    rep_name:   input.repName ?? 'The RealtyLine Team',
    unsubscribe_url: unsubscribeUrl,
  };
  const subject = substituteTokens(input.subject, ctx);
  const bodyWithTokens = substituteTokens(input.body, ctx);
  const bodyHtmlRaw = bodyToHtml(bodyWithTokens);
  const bodyHtml = rewriteLinks(bodyHtmlRaw, input.recipient.id);
  const trackingPixelUrl = `${base}/api/track/open/${input.recipient.id}`;
  const html = renderEmail({
    subject,
    previewText: input.previewText ?? null,
    bodyHtml,
    unsubscribeUrl,
    trackingPixelUrl,
    brand: input.brand,
    attachments: input.attachmentLinks,
  });
  return { subject, html };
}

// ── Convenience: send a single recipient and return result ─────────
export async function sendOneRecipient(input: BuildEmailInput & {
  from?: string;
  replyTo?: string | string[];
  attachments?: EmailAttachment[];
}) {
  const built = buildEmail(input);
  return sendEmail({
    to: input.recipient.email,
    from: input.from,
    replyTo: input.replyTo,
    subject: built.subject,
    html: built.html,
    attachments: input.attachments,
  });
}
