import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import { calculateTrecDeadlines } from '@/lib/trec-deadlines';

/**
 * Shared Closing Time calendar builder used by both the one-time .ics
 * download (browser) and the private subscription feed (server).
 *
 * UIDs are stable per deal + item so re-importing or refreshing a feed
 * updates existing events instead of creating duplicates. SEQUENCE and
 * LAST-MODIFIED follow the deal's updatedAt so calendars can tell when an
 * event changed.
 */

export type ClosingTimeCalendarEvent = {
  uid: string;
  date: string;
  summary: string;
  description: string;
  updatedAt: string;
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeIcs(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r?\n/g, '\\n');
}

function uidPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function icsTimestamp(value: string): string {
  const time = Date.parse(value);
  const date = Number.isFinite(time) ? new Date(time) : new Date();
  return date.toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sequenceFor(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.max(0, Math.floor(time / 1000) - 1_700_000_000) : 0;
}

/** Fold content lines to 75 octets per RFC 5545. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  if (current) parts.push(current);
  return parts.join('\r\n ');
}

export function calendarEventsForDeal(deal: AgentDeal): ClosingTimeCalendarEvent[] {
  const transaction = deal.propertyAddress || deal.title;
  const description = `Closing Time deadline for ${transaction}. Verify against the signed contract and your broker's process.`;
  const dealKey = uidPart(deal.id);
  const updatedAt = deal.updatedAt;
  const deadlines = calculateTrecDeadlines({
    effectiveDate: deal.effectiveDate,
    optionPeriodDays: deal.optionPeriodDays,
    additionalEarnestMoneyDays: deal.additionalEarnestMoneyDays,
    financingDeadlineDays: deal.financingDeadlineDays,
    appraisalDeadlineDays: deal.appraisalDeadlineDays,
    titleCommitmentDays: deal.titleCommitmentDays,
    surveyDays: deal.surveyDays,
    titleObjectionDays: deal.titleObjectionDays,
  });
  const events: ClosingTimeCalendarEvent[] = [
    ...deadlines.map((deadline) => ({
      uid: `ct-${dealKey}-deadline-${uidPart(deadline.id)}@realtynewsnow.app`,
      date: deadline.date,
      summary: `${deadline.label}: ${transaction}`,
      description,
      updatedAt,
    })),
    ...(deal.closingDate ? [{
      uid: `ct-${dealKey}-closing-date@realtynewsnow.app`,
      date: deal.closingDate,
      summary: `Closing date: ${transaction}`,
      description,
      updatedAt,
    }] : []),
    ...deal.reminders
      .filter((reminder) => !reminder.complete && isIsoDate(reminder.reminderDate))
      .map((reminder) => ({
        uid: `ct-${dealKey}-reminder-${uidPart(reminder.id)}@realtynewsnow.app`,
        date: reminder.reminderDate,
        summary: `Reminder: ${reminder.label} — ${transaction}`,
        description,
        updatedAt,
      })),
    ...deal.tasks
      .filter((task) => !task.complete && isIsoDate(task.dueDate))
      .map((task) => ({
        uid: `ct-${dealKey}-task-${uidPart(task.id)}@realtynewsnow.app`,
        date: task.dueDate,
        summary: `Task: ${task.title} — ${transaction}`,
        description,
        updatedAt,
      })),
  ];
  return events.filter((event) => isIsoDate(event.date));
}

export function calendarEventsForActiveDeals(deals: AgentDeal[]): ClosingTimeCalendarEvent[] {
  return deals.filter((deal) => deal.status !== 'completed').flatMap(calendarEventsForDeal);
}

export function buildClosingTimeIcs(
  events: ClosingTimeCalendarEvent[],
  options: { calendarName?: string; feed?: boolean } = {},
): string {
  const now = icsTimestamp(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Realty News Now//Closing Time//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(options.calendarName ?? 'Closing Time Deadlines')}`,
    ...(options.feed ? ['REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'] : []),
    ...events.flatMap((event) => [
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${now}`,
      `LAST-MODIFIED:${icsTimestamp(event.updatedAt)}`,
      `SEQUENCE:${sequenceFor(event.updatedAt)}`,
      `DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`,
      `DTEND;VALUE=DATE:${addDays(event.date, 1).replaceAll('-', '')}`,
      `SUMMARY:${escapeIcs(event.summary)}`,
      `DESCRIPTION:${escapeIcs(event.description)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
