const VERIFIED_DOMAINS = new Set([
  'myrealtyline.com',
  'newslinesa.com',
  'realtynewsnow.app',
]);

export const EMAIL_SENDERS = {
  'tawanna@myrealtyline.com': 'Tawanna Verock <tawanna@myrealtyline.com>',
  'tawanna@newslinesa.com': 'Tawanna Verock <tawanna@newslinesa.com>',
  'hello@myrealtyline.com': 'Caxton Publications Inc. <hello@myrealtyline.com>',
  'hello@newslinesa.com': 'Caxton Publications Inc. <hello@newslinesa.com>',
} as const;

export type EmailSenderAddress = keyof typeof EMAIL_SENDERS;

export const DEFAULT_EMAIL_SENDER: EmailSenderAddress = 'hello@newslinesa.com';

export function resolveEmailSenderAddress(
  requested: string | undefined,
): EmailSenderAddress | null {
  const value = requested?.trim().toLowerCase();
  if (!value) return null;
  if (value in EMAIL_SENDERS) return value as EmailSenderAddress;
  return null;
}

function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function extractDomain(value: string): string | undefined {
  return extractAddress(value).split('@').at(-1);
}

/**
 * Keep each sending domain isolated in the Resend account that owns it.
 * RESEND_API_KEY remains the backwards-compatible Newslinesa key.
 */
export function getResendApiKeyForFrom(
  requested: string | undefined,
): string | undefined {
  switch (requested ? extractDomain(requested) : undefined) {
    case 'myrealtyline.com':
      return process.env.RESEND_API_KEY_MYREALTYLINE;
    case 'realtynewsnow.app':
      return process.env.RESEND_API_KEY_REALTYNEWSNOW;
    case 'newslinesa.com':
      return process.env.RESEND_API_KEY_NEWSLINESA ?? process.env.RESEND_API_KEY;
    default:
      return process.env.RESEND_API_KEY_NEWSLINESA ?? process.env.RESEND_API_KEY;
  }
}

/**
 * Resend only accepts From addresses on domains verified by the active team.
 * Keep display names, but never allow a stale environment variable or route
 * override to submit an unverified domain.
 */
export function verifiedEmailFrom(
  requested: string | undefined,
  fallbackName = 'Caxton Publications Inc.',
): string {
  const value = requested?.trim();
  const requestedDomain = value ? extractDomain(value) : undefined;
  if (value && requestedDomain && VERIFIED_DOMAINS.has(requestedDomain)) {
    return value;
  }
  if (value) {
    const mapped = resolveEmailSenderAddress(extractAddress(value));
    if (mapped) {
      const displayName = value.includes('<') ? value.slice(0, value.indexOf('<')).trim() : fallbackName;
      return `${displayName || fallbackName} <${mapped}>`;
    }
  }
  return `${fallbackName} <${DEFAULT_EMAIL_SENDER}>`;
}
