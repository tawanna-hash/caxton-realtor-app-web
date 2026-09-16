const VERIFIED_DOMAIN = 'newslinesa.com';

export const EMAIL_SENDERS = {
  'tawanna@newslinesa.com': 'Tawanna Verock <tawanna@newslinesa.com>',
  'hello@newslinesa.com': 'Caxton Publications Inc. <hello@newslinesa.com>',
} as const;

export type EmailSenderAddress = keyof typeof EMAIL_SENDERS;

export const DEFAULT_EMAIL_SENDER: EmailSenderAddress = 'hello@newslinesa.com';

function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
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
  if (value && extractAddress(value).endsWith(`@${VERIFIED_DOMAIN}`)) {
    return value;
  }
  return `${fallbackName} <${DEFAULT_EMAIL_SENDER}>`;
}

