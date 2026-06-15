// lib/server/email/html.ts
//
// Shared HTML primitives for outbound transactional email. Replaces the
// 8 different copies of escapeHtml() that had drifted across the repo
// (one even omitted apostrophe escaping). All email-sending code paths
// should use these helpers so a single change to brand colors, typography,
// or layout propagates everywhere.
//
// Design choices:
//
//  - Pure functions, no side effects, no Resend/provider coupling
//  - String concatenation (not JSX) because some routes still build email
//    HTML in node-only contexts where React isn't loaded
//  - Brand styles are inline because most email clients strip <style> tags
//
// If you need a NEW kind of email layout (e.g. dark mode, two-column),
// add it here as another exported function — do not re-inline styles in
// a route file.

/**
 * Escape a string for safe embedding inside HTML text nodes or attribute
 * values. Covers the 5 chars that have semantic meaning in HTML:
 *
 *     & < > " '
 *
 * Apostrophes use the numeric entity `&#39;` (not `&apos;`) because
 * `&apos;` is HTML5-only and some legacy mail clients still render it
 * as literal text.
 */
export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Brand tokens. Keep in lockstep with the public site / admin chrome.
// Bumping a value here updates every transactional email at once.
export const BRAND = {
  primary: '#1a2a44',
  primaryDark: '#0f1d36',
  text: '#1a2a44',
  bodyText: '#333',
  muted: '#666',
  faint: '#999',
  border: '#eee',
  cardBg: '#f6f8fa',
  cardBorder: '#e1e6ee',
  warningBg: '#fff7ed',
  warningBorder: '#fed7aa',
  warningText: '#9a3412',
  fontStack: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  signatureLine: '— The RealtyLine Austin & Newsline San Antonio team',
} as const;

/**
 * Wrap an email body in the standard branded shell: max-width 600,
 * brand font stack, brand text color, room for a heading and a footer.
 *
 * `heading` is rendered verbatim (caller is responsible for escaping
 * any dynamic substring). `children` is the email body HTML.
 *
 * If `signature` is true (default), append the standard team signature
 * footer with a top border.
 */
export function wrapEmail(opts: {
  heading?: string;
  bodyHtml: string;
  signature?: boolean;
  footerHtml?: string;
}): string {
  const { heading, bodyHtml, signature = true, footerHtml } = opts;
  const footer =
    footerHtml ??
    (signature
      ? `
        <p style="font-size:13px;color:${BRAND.faint};margin:24px 0 0 0;border-top:1px solid ${BRAND.border};padding-top:16px;">
          Questions? Just reply to this email.<br/>
          ${BRAND.signatureLine}
        </p>`
      : '');

  return `
    <div style="font-family:${BRAND.fontStack};max-width:600px;padding:24px;color:${BRAND.text};">
      ${heading ? `<h2 style="margin:0 0 16px 0;color:${BRAND.text};">${heading}</h2>` : ''}
      ${bodyHtml}
      ${footer}
    </div>
  `;
}

/**
 * Render the standard brand call-to-action button. `href` is NOT escaped
 * (it's a URL the caller controls); `label` IS escaped.
 */
export function primaryButton(opts: { href: string; label: string }): string {
  return `<a href="${opts.href}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">${escapeHtml(opts.label)}</a>`;
}

/**
 * Render a soft-grey info card with a tier label, title, and free-form
 * body HTML. Used for slot rate-cards and similar highlights inside
 * email bodies.
 *
 * Caller is responsible for escaping anything dynamic in `bodyHtml`.
 */
export function infoCard(opts: {
  tier?: string;
  title: string;
  bodyHtml: string;
}): string {
  return `
    <div style="background:${BRAND.cardBg};border:1px solid ${BRAND.cardBorder};border-radius:8px;padding:16px;margin:0 0 24px 0;">
      ${opts.tier ? `<p style="margin:0 0 8px 0;font-size:13px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(opts.tier)}</p>` : ''}
      <p style="margin:0 0 8px 0;font-size:17px;font-weight:600;color:${BRAND.text};">${escapeHtml(opts.title)}</p>
      ${opts.bodyHtml}
    </div>
  `;
}

/**
 * Render an amber "heads-up" notice block. Use for soft warnings that
 * shouldn't read as errors (e.g. sold-out + alternatives suggested).
 */
export function noticeBlock(message: string): string {
  return `<div style="background:${BRAND.warningBg};border:1px solid ${BRAND.warningBorder};border-radius:6px;padding:10px 14px;margin:0 0 16px 0;font-size:13px;color:${BRAND.warningText};">${escapeHtml(message)}</div>`;
}
