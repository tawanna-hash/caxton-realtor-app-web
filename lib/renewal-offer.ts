import type { Agreement } from '@/lib/agreements';

export const RENEWAL_OFFER_HOURS = 72;
export const RENEWAL_OFFER_EXPIRED_MESSAGE =
  'This 72-hour renewal-rate offer has expired. Signing is disabled. Please contact RealtyLine for an updated renewal agreement and rate.';

export function renewalOfferDeadline(from = new Date()): Date {
  return new Date(from.getTime() + RENEWAL_OFFER_HOURS * 60 * 60 * 1000);
}

export function isRenewalOfferExpired(
  agreement: Pick<Agreement, 'is_renewal' | 'renewal_offer_expires_at'>,
  now = new Date(),
): boolean {
  if (!agreement.is_renewal || !agreement.renewal_offer_expires_at) return false;
  const deadline = new Date(agreement.renewal_offer_expires_at);
  return !Number.isNaN(deadline.getTime()) && now >= deadline;
}

export function formatRenewalOfferDeadline(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
    timeZoneName: 'short',
  }).format(date);
}
