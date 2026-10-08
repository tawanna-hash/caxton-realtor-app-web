// Deal lifecycle rules for Closing Time: every deal closes automatically
// two weeks after its closing date, or 180 days after it was opened when no
// closing date is entered. An agent can extend a deal a limited number of times.

export const AUTO_CLOSE_DAYS_AFTER_CLOSING = 14;
export const AUTO_CLOSE_DAYS_NO_CLOSING_DATE = 180;
export const AUTO_CLOSE_WARNING_DAYS = 14;
export const EXTENSION_DAYS = 14;
export const FREE_EXTENSIONS = 1;
export const EXTENSION_PRICE_CENTS = 500;
export const FREE_DEAL_LIMIT = 2;
export const DEAL_PRICE_CENTS = 1200;

type LifecycleDeal = {
  closingDate: string;
  createdAt: string;
  autoCloseExtensionDays?: number;
  isTemplate?: boolean;
  status: string;
  auditLocked?: boolean;
};

const DAY = 86_400_000;
const parse = (date: string) => Date.parse(`${date.slice(0, 10)}T12:00:00Z`);
export const addDays = (date: string, days: number): string => new Date(parse(date) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number => Math.round((parse(to) - parse(from)) / DAY);

export function formatCloseDate(date: string): string {
  return new Date(parse(date)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export type AutoCloseState = {
  date: string;
  daysLeft: number;
  warn: boolean;
  due: boolean;
  hasClosingDate: boolean;
  extensions: number;
  nextExtensionFree: boolean;
};

export function autoCloseState(deal: LifecycleDeal, today: string): AutoCloseState | null {
  if (deal.isTemplate || deal.status === 'completed' || deal.auditLocked) return null;
  const extensionDays = deal.autoCloseExtensionDays ?? 0;
  const hasClosingDate = /^\d{4}-\d{2}-\d{2}$/.test(deal.closingDate ?? '');
  const base = hasClosingDate
    ? addDays(deal.closingDate, AUTO_CLOSE_DAYS_AFTER_CLOSING)
    : addDays(deal.createdAt, AUTO_CLOSE_DAYS_NO_CLOSING_DATE);
  const date = addDays(base, extensionDays);
  const daysLeft = daysBetween(today, date);
  const extensions = Math.round(extensionDays / EXTENSION_DAYS);
  return { date, daysLeft, warn: daysLeft <= AUTO_CLOSE_WARNING_DAYS, due: daysLeft < 0, hasClosingDate, extensions, nextExtensionFree: extensions < FREE_EXTENSIONS };
}
